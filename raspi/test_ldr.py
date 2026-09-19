#!/usr/bin/env python3
"""Kurzer Test: LDR GL5528 an GPIO 26 (Header-Stift 37).

Verdrahtung:
  3,3 V (Stift 1/17) — 10 kΩ — GPIO 26 (Stift 37) — GL5528 — GND (Stift 39)

Dunkel → HIGH, hell → LOW. Interner Pull aus (externer 10 kΩ).
"""

import time

from gpiozero import Device, DigitalInputDevice
from gpiozero.pins.lgpio import LGPIOFactory

Device.pin_factory = LGPIOFactory()

PIN = 26
ldr = DigitalInputDevice(PIN, pull_up=None, active_state=True)

print(f"LDR GPIO {PIN} — Wert jede Sekunde, Ctrl+C zum Beenden")
print("dunkel = HIGH, hell = LOW")

try:
    while True:
        value = ldr.value
        high = bool(value)
        print(
            f"value={value!r}  {'HIGH' if high else 'LOW'}  "
            f"({'dunkel' if high else 'hell'})"
        )
        time.sleep(1)
except KeyboardInterrupt:
    print("\nEnde")
