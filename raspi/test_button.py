#!/usr/bin/env python3
"""Kurzer Test: Taster an GPIO 27 gegen GND (Header Pin 13 / 14)."""

from gpiozero import Button, Device
from gpiozero.pins.lgpio import LGPIOFactory
from signal import pause

Device.pin_factory = LGPIOFactory()

PIN = 27
taster = Button(PIN, pull_up=True, bounce_time=0.05)

print(f"Taster GPIO {PIN} — Ctrl+C zum Beenden")
print("unbetätigt = HIGH, gedrückt = GND/LOW")
print(f"aktuell: {'gedrückt' if taster.is_pressed else 'offen'}")


def gedrueckt():
    print("gedrückt")


def losgelassen():
    print("losgelassen")


taster.when_pressed = gedrueckt
taster.when_released = losgelassen

try:
    pause()
except KeyboardInterrupt:
    print("\nEnde")
