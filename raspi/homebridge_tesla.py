#!/usr/bin/env python3
"""
Tesla Model 3 Highland – HomeKit Bridge + Web-API

Geräte (AGENTS.md):
  - Sternenhimmel  → GPIO 22  (On/Off-Lampe)
  - Rücksitzbank   → GPIO 18  (WLED, An/Aus über GPIO)
  - Beifahrer      → GPIO 21  (WLED, An/Aus über GPIO)

Web-API:  POST /gpio/set   pin=XX&state=0|1
"""

import logging
import signal
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

from gpiozero import Device, OutputDevice
from gpiozero.pins.lgpio import LGPIOFactory
from pyhap.accessory import Accessory, Bridge
from pyhap.accessory_driver import AccessoryDriver
from pyhap.const import CATEGORY_SWITCH

# Pin-Factory erzwingen (lgpio)
Device.pin_factory = LGPIOFactory()

logging.basicConfig(level=logging.INFO, format="[%(module)s] %(message)s")

# Bekannte Pins (AGENTS.md Projekt 02)
PINS = {
    "sternenhimmel": 22,
    "ruecksitzbank": 18,
    "beifahrer": 21,
}

# Gemeinsamer Geräte-Cache + Mapping für Synchronisation
gpio_devices = {}  # pin → OutputDevice
pin_to_switch = {}  # pin → GpioSwitch-Instanz


def get_device(pin: int) -> OutputDevice:
    """Holt oder erzeugt ein OutputDevice für den Pin."""
    if pin not in gpio_devices:
        gpio_devices[pin] = OutputDevice(pin, active_high=True, initial_value=False)
        logging.info(f"GPIO {pin} initialisiert")
    return gpio_devices[pin]


class GpioSwitch(Accessory):
    category = CATEGORY_SWITCH

    def __init__(self, driver, display_name, pin, *args, **kwargs):
        super().__init__(driver, display_name, *args, **kwargs)
        self.name = display_name
        self.pin = pin
        self.device = get_device(pin)
        pin_to_switch[pin] = self

        serv = self.add_preload_service("Switch")
        self.char_on = serv.configure_char(
            "On",
            value=False,
            setter_callback=self.set_on,
        )

    def set_on(self, value: bool):
        if value:
            self.device.on()
            logging.info(f"{self.name} → ON  (GPIO {self.pin})")
        else:
            self.device.off()
            logging.info(f"{self.name} → OFF (GPIO {self.pin})")
        self.char_on.set_value(value)


class GpioRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        logging.debug("%s - %s" % (self.address_string(), format % args))

    def do_POST(self):
        if self.path != "/gpio/set":
            self.send_error(404, "Not Found")
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            params = parse_qs(body)

            pin = int(params.get("pin", [None])[0])
            state = int(params.get("state", [None])[0])

            if pin is None or state not in (0, 1):
                raise ValueError("pin und state (0 oder 1) erforderlich")

            device = get_device(pin)
            if state == 1:
                device.on()
            else:
                device.off()

            # HomeKit-Charakteristik synchron halten, falls der Pin bekannt ist
            if pin in pin_to_switch:
                switch = pin_to_switch[pin]
                switch.char_on.set_value(bool(state))

            logging.info(f"Web-API: GPIO {pin} → {'ON' if state else 'OFF'}")

            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK\n")

        except Exception as e:
            logging.warning(f"Web-API Fehler: {e}")
            self.send_response(400)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"Error: {e}\n".encode())

    def do_GET(self):
        if self.path in ("/", "/health"):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Tesla GPIO Bridge OK\n")
        else:
            self.send_error(404)


def start_web_server(port=8080):
    server = HTTPServer(("0.0.0.0", port), GpioRequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logging.info(f"Web-API läuft auf Port {port}  →  POST /gpio/set")


def get_bridge(driver):
    bridge = Bridge(driver, "Tesla Bridge")

    bridge.add_accessory(
        GpioSwitch(driver, "Sternenhimmel", PINS["sternenhimmel"])
    )
    bridge.add_accessory(
        GpioSwitch(driver, "Rücksitzbank", PINS["ruecksitzbank"])
    )
    bridge.add_accessory(
        GpioSwitch(driver, "Beifahrer", PINS["beifahrer"])
    )
    return bridge


def main():
    start_web_server(port=8080)

    driver = AccessoryDriver(
        port=51826,
        persist_file="/home/pi/scripts/homebridge_tesla.state",
    )

    bridge = get_bridge(driver)
    driver.add_accessory(accessory=bridge)

    signal.signal(signal.SIGTERM, driver.signal_handler)
    driver.start()


if __name__ == "__main__":
    main()
