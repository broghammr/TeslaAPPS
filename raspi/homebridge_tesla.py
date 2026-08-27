#!/usr/bin/env python3
"""
Tesla Model 3 Highland – HomeKit Bridge + Web-API

Geräte (AGENTS.md):
  - Sternenhimmel  → GPIO 17  On/Off-Schalter
  - Rücksitzbank   → GPIO 12  WS2812 Farblampe (PWM0)
  - Beifahrer      → GPIO 13  WS2812 Farblampe (PWM1)

HomeKit: Bridge „Tesla Bridge“ mit Switch + zwei Color-Lightbulbs.

Web-API:
  POST /gpio/set   pin=XX&state=0|1
                   optional: r,g,b (0–255) und/oder h,s,brightness
  POST /scene/start  Welcome-Szene (30 s) wie Taster
  GET  /status     JSON mit aktuellem Zustand
  GET  /temp       CPU-Temperatur in °C
  GET  /health     OK

Szenen:
  Welcome 30s (Tesla Sommerupdate 2026) beim Daemon-Start und Taster GPIO 27.
  Startanimation läuft ohne Netz; HomeKit erst nach LAN-IP.
  HAP lauscht auf 0.0.0.0; mDNS folgt später LAN-IP-Wechseln.
"""

from __future__ import annotations

import atexit
import colorsys
import json
import logging
import os
import signal
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from gpiozero import Button, Device, OutputDevice
from gpiozero.pins.lgpio import LGPIOFactory
from pyhap.accessory import Accessory, Bridge
from pyhap.accessory_driver import AccessoryDriver
from pyhap.const import CATEGORY_LIGHTBULB, CATEGORY_SWITCH
from zeroconf import InterfaceChoice

from light_scenes import TESLA_ICE, ScenePlayer

try:
    import _rpi_ws281x as ws
    from rpi_ws281x import Color
except ImportError:  # pragma: no cover - Dev-Rechner ohne Library
    ws = None
    Color = None

Device.pin_factory = LGPIOFactory()

logging.basicConfig(level=logging.INFO, format="[%(module)s] %(message)s")
log = logging.getLogger("tesla-bridge")

SCRIPT_DIR = Path(__file__).resolve().parent
STATE_FILE = SCRIPT_DIR / "homekit.state"

# Pins laut AGENTS.md
PINS = {
    "sternenhimmel": 17,
    "ruecksitzbank": 12,
    "beifahrer": 13,
    "taster": 27,
}

# LED-Anzahl pro Streifen (oder Env WS2812_COUNT_*)
LED_COUNT = {
    "ruecksitzbank": int(os.environ.get("WS2812_COUNT_RUECKSITZBANK", "76")),
    "beifahrer": int(os.environ.get("WS2812_COUNT_BEIFAHRER", "24")),
}

PWM = {
    "ruecksitzbank": {"pin": PINS["ruecksitzbank"], "channel": 0},
    "beifahrer": {"pin": PINS["beifahrer"], "channel": 1},
}

HAP_PORT = 51826
WEB_PORT = 8080
PAIRING_PIN = b"031-45-154"
THERMAL_PATH = Path("/sys/class/thermal/thermal_zone0/temp")
LAN_WATCH_INTERVAL_S = 2.0

# pin → Accessory (für Web-API ↔ HomeKit)
REGISTRY: dict[int, Accessory] = {}
SCENE_PLAYER: ScenePlayer | None = None
STRIPS = None
STOP = threading.Event()
DRIVER: AccessoryDriver | None = None


def _ipv4_via_route() -> str | None:
    """Nicht-lokale IPv4 über die Default-Route (kein Internet-Ping)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.settimeout(0.2)
        sock.connect(("1.1.1.1", 80))
        ip = sock.getsockname()[0]
        if ip and not ip.startswith("127."):
            return ip
        return None
    except OSError:
        return None
    finally:
        sock.close()


def _ipv4_via_interfaces() -> str | None:
    """Erste nicht-lokale IPv4 einer echten Schnittstelle (LAN ohne Default-Route)."""
    try:
        import ifaddr
    except ImportError:
        return None
    skip_prefix = ("lo", "docker", "br-", "veth", "tun", "wg")
    for adapter in ifaddr.get_adapters():
        name = (adapter.nice_name or adapter.name or "").lower()
        if name.startswith(skip_prefix):
            continue
        for ipinfo in adapter.ips:
            ip = ipinfo.ip
            if not isinstance(ip, str):
                continue
            if ip.startswith(("127.", "169.254.")):
                continue
            return ip
    return None


def local_ipv4() -> str | None:
    """Aktuelle LAN-IPv4: Default-Route, sonst erste Schnittstellen-Adresse."""
    return _ipv4_via_route() or _ipv4_via_interfaces()


def wait_for_lan() -> str:
    """Blockiert bis eine LAN-IP da ist. GPIO und Animation laufen parallel."""
    ip = local_ipv4()
    if ip:
        return ip
    log.info("HomeKit wartet auf LAN-IP (kein Timeout, Startanimation läuft unabhängig)")
    while not STOP.is_set():
        ip = local_ipv4()
        if ip:
            log.info("LAN-IP %s da, HomeKit startet", ip)
            return ip
        time.sleep(0.5)
    raise SystemExit(0)


def homekit_driver_kwargs(address: str) -> dict:
    """HAP lauscht auf allen IPs, mDNS wirbt mit der aktuellen LAN-Adresse."""
    return {
        "port": HAP_PORT,
        "persist_file": str(STATE_FILE),
        "pincode": PAIRING_PIN,
        "listen_address": "0.0.0.0",
        "advertised_address": address,
        "interface_choice": InterfaceChoice.All,
    }


def next_lan_watch_state(
    current: str, lost: bool, new_ip: str | None
) -> tuple[str, bool, bool]:
    """Nächster LAN-Wächter-Zustand: (current_ip, lost, should_refresh_mdns)."""
    if new_ip is None:
        return current, True, False
    if lost or new_ip != current:
        return new_ip, False, True
    return current, False, False


def apply_advertised_address(driver: AccessoryDriver, ip: str) -> None:
    """Aktualisiert die HomeKit-mDNS-Anzeige auf eine neue LAN-IP."""
    driver.state.addresses = [ip]
    if getattr(driver, "mdns_service_info", None) is None:
        log.info("HomeKit-mDNS noch nicht aktiv, werbe später mit %s", ip)
        return
    try:
        driver.update_advertisement()
    except Exception:
        log.exception("HomeKit-mDNS Update auf %s fehlgeschlagen", ip)


def watch_lan_ip(driver: AccessoryDriver, initial: str) -> None:
    """Erkennt IP-Verlust und Netzwechsel und erneuert die HomeKit-Anzeige."""
    current = initial
    lost = False
    log.info("LAN-Wächter aktiv, HomeKit wirbt mit %s", current)
    while not STOP.wait(LAN_WATCH_INTERVAL_S):
        new_ip = local_ipv4()
        next_current, next_lost, refresh = next_lan_watch_state(current, lost, new_ip)
        if next_lost and not lost:
            log.warning("LAN-IP %s weg, HomeKit wartet auf neues Netz", current)
        elif refresh:
            if lost and new_ip == current:
                log.info("LAN-IP %s wieder da, HomeKit-mDNS wird erneuert", new_ip)
            else:
                log.info(
                    "LAN-IP-Wechsel %s → %s, HomeKit-mDNS wird aktualisiert",
                    current,
                    new_ip,
                )
            apply_advertised_address(driver, next_current)
        current, lost = next_current, next_lost


def request_stop(signum=None, frame=None) -> None:
    STOP.set()
    driver = DRIVER
    if driver is not None:
        driver.signal_handler(signum or signal.SIGTERM, frame)


def read_cpu_temp_c() -> float:
    """Liest die SoC-Temperatur in Grad Celsius."""
    raw = THERMAL_PATH.read_text().strip()
    return int(raw) / 1000.0


def hsv_to_rgb(h: float, s: float, v: float) -> tuple[int, int, int]:
    """HomeKit HSV (h 0–360, s/v 0–100) → RGB 0–255."""
    r, g, b = colorsys.hsv_to_rgb(h / 360.0, s / 100.0, v / 100.0)
    return int(round(r * 255)), int(round(g * 255)), int(round(b * 255))


def rgb_to_hsv(r: int, g: int, b: int) -> tuple[float, float, float]:
    """RGB 0–255 → HomeKit HSV."""
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    return h * 360.0, s * 100.0, v * 100.0


class DualPwmStrips:
    """Ein ws2811-Controller für PWM0 (GPIO 12) und PWM1 (GPIO 13)."""

    def __init__(
        self,
        count0: int,
        count1: int,
        pin0: int = 12,
        pin1: int = 13,
        freq_hz: int = 800_000,
        dma: int = 10,
        brightness: int = 255,
    ) -> None:
        if ws is None:
            raise RuntimeError("rpi_ws281x ist nicht installiert")

        self._leds = ws.new_ws2811_t()
        self._lock = threading.Lock()
        self._closed = False
        self.counts = {0: count0, 1: count1}
        gamma = list(range(256))

        for channum, count, pin in ((0, count0, pin0), (1, count1, pin1)):
            chan = ws.ws2811_channel_get(self._leds, channum)
            ws.ws2811_channel_t_count_set(chan, count)
            ws.ws2811_channel_t_gpionum_set(chan, pin)
            ws.ws2811_channel_t_invert_set(chan, 0)
            ws.ws2811_channel_t_brightness_set(chan, brightness)
            ws.ws2811_channel_t_strip_type_set(chan, ws.WS2811_STRIP_GRB)
            ws.ws2811_channel_t_gamma_set(chan, gamma)

        ws.ws2811_t_freq_set(self._leds, freq_hz)
        ws.ws2811_t_dmanum_set(self._leds, dma)

        self._channels = {
            0: ws.ws2811_channel_get(self._leds, 0),
            1: ws.ws2811_channel_get(self._leds, 1),
        }

        resp = ws.ws2811_init(self._leds)
        if resp != 0:
            err = ws.ws2811_get_return_t_str(resp)
            ws.delete_ws2811_t(self._leds)
            self._leds = None
            raise RuntimeError(f"ws2811_init fehlgeschlagen: {resp} ({err})")

        atexit.register(self.close)
        log.info(
            "WS2812 bereit: GPIO %s (PWM0, %s LEDs), GPIO %s (PWM1, %s LEDs)",
            pin0,
            count0,
            pin1,
            count1,
        )

    def fill(self, channel: int, r: int, g: int, b: int) -> None:
        n = self.counts[channel]
        self.write_pixels({channel: [(int(r), int(g), int(b))] * n})

    def write_pixels(self, frames: dict[int, list[tuple[int, int, int]]]) -> None:
        if self._closed or self._leds is None or Color is None:
            return
        with self._lock:
            for channum, pixels in frames.items():
                chan = self._channels[channum]
                n = self.counts[channum]
                for i in range(n):
                    if i < len(pixels):
                        r, g, b = pixels[i]
                        color = Color(int(r) & 255, int(g) & 255, int(b) & 255)
                    else:
                        color = Color(0, 0, 0)
                    ws.ws2811_led_set(chan, i, color)
            resp = ws.ws2811_render(self._leds)
            if resp != 0:
                raise RuntimeError(
                    f"ws2811_render: {resp} ({ws.ws2811_get_return_t_str(resp)})"
                )

    def close(self) -> None:
        if self._closed or self._leds is None:
            return
        try:
            for ch in (0, 1):
                try:
                    self.fill(ch, 0, 0, 0)
                except Exception:
                    pass
            ws.ws2811_fini(self._leds)
            ws.delete_ws2811_t(self._leds)
        except Exception:
            log.exception("WS2812 cleanup")
        finally:
            self._closed = True
            self._leds = None


class NullStrips:
    """Fallback, wenn PWM nicht initialisiert werden kann."""

    def fill(self, channel: int, r: int, g: int, b: int) -> None:
        log.warning("WS2812 nicht bereit (ch%s → %s,%s,%s)", channel, r, g, b)

    def write_pixels(self, frames: dict[int, list[tuple[int, int, int]]]) -> None:
        return

    def close(self) -> None:
        return


def scene_owns_hardware() -> bool:
    return SCENE_PLAYER is not None and SCENE_PLAYER.is_running


def theme_from_lamps() -> tuple[int, int, int]:
    for pin in (PINS["ruecksitzbank"], PINS["beifahrer"]):
        acc = REGISTRY.get(pin)
        if not isinstance(acc, ColorLamp):
            continue
        if acc._sat >= 8:
            return hsv_to_rgb(acc._hue, max(acc._sat, 35), 100)
    return TESLA_ICE


def snapshot_scene_state() -> dict:
    rear = REGISTRY.get(PINS["ruecksitzbank"])
    passenger = REGISTRY.get(PINS["beifahrer"])
    return {
        "rear": rear._rgb() if isinstance(rear, ColorLamp) else (0, 0, 0),
        "pass": passenger._rgb() if isinstance(passenger, ColorLamp) else (0, 0, 0),
        "theme": theme_from_lamps(),
    }


def write_scene_pixels(
    rear: list[tuple[int, int, int]],
    passenger: list[tuple[int, int, int]],
) -> None:
    strips = STRIPS
    if strips is None:
        return
    strips.write_pixels(
        {
            PWM["ruecksitzbank"]["channel"]: rear,
            PWM["beifahrer"]["channel"]: passenger,
        }
    )


def init_strips():
    try:
        return DualPwmStrips(
            count0=LED_COUNT["ruecksitzbank"],
            count1=LED_COUNT["beifahrer"],
            pin0=PWM["ruecksitzbank"]["pin"],
            pin1=PWM["beifahrer"]["pin"],
        )
    except Exception as exc:
        log.error(
            "WS2812-Init fehlgeschlagen (%s). "
            "PWM braucht root und dtparam=audio=off (danach reboot). "
            "HomeKit läuft weiter, Streifen bleiben dunkel.",
            exc,
        )
        return NullStrips()


class GpioSwitch(Accessory):
    """On/Off-Schalter (Sternenhimmel)."""

    category = CATEGORY_SWITCH

    def __init__(self, driver, display_name, pin, *args, **kwargs):
        super().__init__(driver, display_name, *args, **kwargs)
        self.pin = pin
        self.device = OutputDevice(pin, active_high=False, initial_value=False)
        self._on = False

        self.set_info_service(
            manufacturer="TeslaAPPS",
            model="Jacky Switch",
            serial_number=f"gpio-{pin}",
            firmware_revision="1.1",
        )

        serv = self.add_preload_service("Switch")
        self.char_on = serv.configure_char(
            "On",
            value=False,
            setter_callback=self._set_on,
        )
        REGISTRY[pin] = self
        log.info("%s an GPIO %s", display_name, pin)

    def _apply(self) -> None:
        if self._on:
            self.device.on()
        else:
            self.device.off()
        log.info("%s → %s  (GPIO %s)", self.display_name, "ON" if self._on else "OFF", self.pin)

    def _set_on(self, value) -> None:
        self._on = bool(value)
        self._apply()

    def apply_from_api(self, *, on: bool, **_kwargs) -> None:
        self._on = bool(on)
        self.char_on.set_value(self._on)
        self._apply()

    def as_status(self) -> dict:
        return {"name": self.display_name, "pin": self.pin, "kind": "switch", "on": self._on}

    def stop(self) -> None:
        self._on = False
        try:
            self.device.off()
        except Exception:
            pass


class ColorLamp(Accessory):
    """WS2812-Farblampe (Hue / Saturation / Brightness)."""

    category = CATEGORY_LIGHTBULB

    def __init__(self, driver, display_name, strips, channel, pin, *args, **kwargs):
        super().__init__(driver, display_name, *args, **kwargs)
        self.strips = strips
        self.channel = channel
        self.pin = pin
        self._on = False
        self._hue = 0.0
        self._sat = 0.0
        self._bri = 100

        self.set_info_service(
            manufacturer="TeslaAPPS",
            model="Jacky WS2812",
            serial_number=f"ws2812-gpio-{pin}",
            firmware_revision="1.1",
        )

        serv = self.add_preload_service(
            "Lightbulb",
            chars=["Hue", "Saturation", "Brightness"],
        )
        self.char_on = serv.configure_char("On", value=False)
        self.char_hue = serv.configure_char("Hue", value=self._hue)
        self.char_sat = serv.configure_char("Saturation", value=self._sat)
        self.char_bri = serv.configure_char("Brightness", value=self._bri)
        serv.setter_callback = self._set_chars
        REGISTRY[pin] = self
        log.info("%s an GPIO %s (PWM-Kanal %s)", display_name, pin, channel)

    def _rgb(self) -> tuple[int, int, int]:
        if not self._on or self._bri <= 0:
            return (0, 0, 0)
        return hsv_to_rgb(self._hue, self._sat, self._bri)

    def _apply(self) -> None:
        if scene_owns_hardware():
            return
        r, g, b = self._rgb()
        self.strips.fill(self.channel, r, g, b)
        log.info(
            "%s → %s  HSV(%.0f,%.0f,%.0f) RGB(%s,%s,%s) GPIO %s",
            self.display_name,
            "ON" if self._on else "OFF",
            self._hue,
            self._sat,
            self._bri,
            r,
            g,
            b,
            self.pin,
        )

    def _set_chars(self, values: dict) -> None:
        if "On" in values:
            self._on = bool(values["On"])
        if "Hue" in values:
            self._hue = float(values["Hue"])
        if "Saturation" in values:
            self._sat = float(values["Saturation"])
        if "Brightness" in values:
            self._bri = int(values["Brightness"])
        self._apply()

    def apply_from_api(
        self,
        *,
        on: bool | None = None,
        hue: float | None = None,
        sat: float | None = None,
        bri: int | None = None,
        rgb: tuple[int, int, int] | None = None,
    ) -> None:
        if hue is not None:
            self._hue = float(hue)
            self.char_hue.set_value(self._hue)
        if sat is not None:
            self._sat = float(sat)
            self.char_sat.set_value(self._sat)
        if rgb is not None and hue is None and sat is None:
            h, s, v = rgb_to_hsv(*rgb)
            self._hue, self._sat = h, s
            self.char_hue.set_value(self._hue)
            self.char_sat.set_value(self._sat)
            if bri is None:
                bri = int(round(v))
        if bri is not None:
            self._bri = max(0, min(100, int(bri)))
            self.char_bri.set_value(self._bri)
        if on is not None:
            self._on = bool(on)
            self.char_on.set_value(self._on)
        self._apply()

    def as_status(self) -> dict:
        r, g, b = hsv_to_rgb(self._hue, self._sat, self._bri)
        return {
            "name": self.display_name,
            "pin": self.pin,
            "kind": "color",
            "on": self._on,
            "h": self._hue,
            "s": self._sat,
            "brightness": self._bri,
            "r": r,
            "g": g,
            "b": b,
        }

    def stop(self) -> None:
        self._on = False
        try:
            self.strips.fill(self.channel, 0, 0, 0)
        except Exception:
            pass


def _first(params: dict, key: str):
    raw = params.get(key, [None])[0]
    if raw is None or raw == "":
        return None
    return raw


def _first_int(params: dict, key: str):
    raw = _first(params, key)
    return None if raw is None else int(raw)


def _first_float(params: dict, key: str):
    raw = _first(params, key)
    return None if raw is None else float(raw)


class GpioRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        log.debug("%s - %s", self.address_string(), fmt % args)

    def _send(self, code: int, body, content_type: str = "text/plain; charset=utf-8"):
        if isinstance(body, (dict, list)):
            payload = json.dumps(body).encode()
            content_type = "application/json; charset=utf-8"
        elif isinstance(body, str):
            payload = body.encode()
        else:
            payload = body
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, ngrok-skip-browser-warning",
        )
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/health"):
            self._send(200, "Tesla GPIO Bridge OK\n")
            return
        if path == "/status":
            payload = {str(pin): acc.as_status() for pin, acc in REGISTRY.items()}
            payload["scene"] = (
                SCENE_PLAYER.as_status()
                if SCENE_PLAYER is not None
                else {"name": None, "running": False, "duration": 30.0}
            )
            driver = DRIVER
            payload["homekit"] = {
                "advertised_address": list(driver.state.addresses) if driver else [],
                "port": HAP_PORT,
                "waiting_for_lan": driver is None,
            }
            self._send(200, payload)
            return
        if path == "/temp":
            try:
                celsius = read_cpu_temp_c()
                self._send(200, {"celsius": round(celsius, 1), "unit": "C"})
            except Exception as exc:
                log.warning("Temperatur nicht lesbar: %s", exc)
                self._send(503, {"error": "temperature unavailable"})
            return
        self.send_error(404)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/scene/start":
            if SCENE_PLAYER is None:
                self._send(503, "Error: Szene nicht bereit\n")
                return
            SCENE_PLAYER.request_start("api")
            self._send(200, {"ok": True, "scene": "welcome", "duration": 30.0})
            return
        if path != "/gpio/set":
            self.send_error(404, "Not Found")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            ctype = self.headers.get("Content-Type", "")
            if "application/json" in ctype:
                raw = json.loads(body or "{}")
                params = {k: [str(v)] for k, v in raw.items()}
            else:
                params = parse_qs(body)

            pin = _first_int(params, "pin")
            if pin is None:
                raise ValueError("pin erforderlich")

            acc = REGISTRY.get(pin)
            if acc is None:
                raise ValueError(f"unbekannter pin {pin}")

            state = _first_int(params, "state")
            on = None if state is None else state == 1
            if state is not None and state not in (0, 1):
                raise ValueError("state muss 0 oder 1 sein")

            r = _first_int(params, "r")
            g = _first_int(params, "g")
            b = _first_int(params, "b")
            rgb = (r, g, b) if None not in (r, g, b) else None
            hue = _first_float(params, "h")
            sat = _first_float(params, "s")
            bri = _first_int(params, "brightness")

            if on is None and rgb is None and hue is None and sat is None and bri is None:
                raise ValueError("state oder Farbe (r,g,b / h,s / brightness) erforderlich")

            if isinstance(acc, ColorLamp):
                acc.apply_from_api(on=on, hue=hue, sat=sat, bri=bri, rgb=rgb)
            else:
                if on is None:
                    raise ValueError("state für den Schalter erforderlich")
                acc.apply_from_api(on=on)

            log.info("Web-API: pin %s", pin)
            self._send(200, "OK\n")
        except Exception as exc:
            log.warning("Web-API Fehler: %s", exc)
            self._send(400, f"Error: {exc}\n")


def start_web_server(port: int = WEB_PORT) -> HTTPServer:
    server = HTTPServer(("0.0.0.0", port), GpioRequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True, name="web-api")
    thread.start()
    log.info(
        "Web-API auf Port %s  →  POST /gpio/set  POST /scene/start  GET /status",
        port,
    )
    return server


def attach_scene_button(player: ScenePlayer) -> Button:
    button = Button(PINS["taster"], pull_up=True, bounce_time=0.15)
    button.when_pressed = lambda: player.request_start("taster")
    log.info("Taster GPIO %s → Startanimation (kein HomeKit-Gerät)", PINS["taster"])
    return button


def build_scene_player() -> ScenePlayer:
    return ScenePlayer(
        rear_count=LED_COUNT["ruecksitzbank"],
        pass_count=LED_COUNT["beifahrer"],
        write_pixels=write_scene_pixels,
        snapshot=snapshot_scene_state,
    )


def get_bridge(driver, strips) -> Bridge:
    bridge = Bridge(driver, "Tesla Bridge")
    bridge.set_info_service(
        manufacturer="TeslaAPPS",
        model="Jacky",
        serial_number="tesla-bridge-1",
        firmware_revision="1.1",
    )
    bridge.add_accessory(
        GpioSwitch(driver, "Sternenhimmel", PINS["sternenhimmel"])
    )
    bridge.add_accessory(
        ColorLamp(
            driver,
            "Rücksitzbank",
            strips,
            PWM["ruecksitzbank"]["channel"],
            PWM["ruecksitzbank"]["pin"],
        )
    )
    bridge.add_accessory(
        ColorLamp(
            driver,
            "Beifahrer",
            strips,
            PWM["beifahrer"]["channel"],
            PWM["beifahrer"]["pin"],
        )
    )
    return bridge


def main() -> None:
    global SCENE_PLAYER, STRIPS, DRIVER

    STRIPS = init_strips()
    start_web_server(WEB_PORT)

    SCENE_PLAYER = build_scene_player()
    button = None
    try:
        button = attach_scene_button(SCENE_PLAYER)
    except Exception as exc:
        log.error("Taster GPIO %s nicht verfügbar: %s", PINS["taster"], exc)
    SCENE_PLAYER.request_start("daemon")

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    try:
        address = wait_for_lan()
        driver = AccessoryDriver(**homekit_driver_kwargs(address))
        DRIVER = driver
        bridge = get_bridge(driver, STRIPS)
        driver.add_accessory(accessory=bridge)
        log.info("HomeKit Pairing-Code: %s", PAIRING_PIN.decode())
        log.info("HomeKit lauscht auf 0.0.0.0:%s, mDNS wirbt %s", HAP_PORT, address)
        if STOP.is_set():
            return
        threading.Thread(
            target=watch_lan_ip,
            args=(driver, address),
            daemon=True,
            name="lan-watch",
        ).start()
        driver.start()
    finally:
        SCENE_PLAYER.stop()
        if button is not None:
            try:
                button.close()
            except Exception:
                pass
        STRIPS.close()


if __name__ == "__main__":
    main()
