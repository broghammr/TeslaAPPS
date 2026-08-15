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
  GET  /status     JSON mit aktuellem Zustand
  GET  /health     OK
"""

from __future__ import annotations

import atexit
import colorsys
import json
import logging
import os
import signal
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from gpiozero import Device, OutputDevice
from gpiozero.pins.lgpio import LGPIOFactory
from pyhap.accessory import Accessory, Bridge
from pyhap.accessory_driver import AccessoryDriver
from pyhap.const import CATEGORY_LIGHTBULB, CATEGORY_SWITCH

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
}

# LED-Anzahl pro Streifen (oder Env WS2812_COUNT_*)
LED_COUNT = {
    "ruecksitzbank": int(os.environ.get("WS2812_COUNT_RUECKSITZBANK", "76")),
    "beifahrer": int(os.environ.get("WS2812_COUNT_BEIFAHRER", "16")),
}

PWM = {
    "ruecksitzbank": {"pin": PINS["ruecksitzbank"], "channel": 0},
    "beifahrer": {"pin": PINS["beifahrer"], "channel": 1},
}

HAP_PORT = 51826
WEB_PORT = 8080
PAIRING_PIN = b"031-45-154"

# pin → Accessory (für Web-API ↔ HomeKit)
REGISTRY: dict[int, Accessory] = {}


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
        if self._closed or self._leds is None:
            return
        color = Color(int(r), int(g), int(b))
        chan = self._channels[channel]
        n = self.counts[channel]
        with self._lock:
            for i in range(n):
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

    def close(self) -> None:
        return


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
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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
            self._send(200, {str(pin): acc.as_status() for pin, acc in REGISTRY.items()})
            return
        self.send_error(404)

    def do_POST(self):
        path = urlparse(self.path).path
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
    log.info("Web-API auf Port %s  →  POST /gpio/set  GET /status", port)
    return server


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
    strips = init_strips()
    start_web_server(WEB_PORT)

    driver = AccessoryDriver(
        port=HAP_PORT,
        persist_file=str(STATE_FILE),
        pincode=PAIRING_PIN,
    )
    bridge = get_bridge(driver, strips)
    driver.add_accessory(accessory=bridge)

    log.info("HomeKit Pairing-Code: %s", PAIRING_PIN.decode())
    signal.signal(signal.SIGTERM, driver.signal_handler)
    try:
        driver.start()
    finally:
        strips.close()


if __name__ == "__main__":
    main()
