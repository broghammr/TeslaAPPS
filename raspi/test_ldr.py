#!/usr/bin/env python3
"""Kurzer Test: LDR GL5528 an GPIO 26, Kontroll-LED an GPIO 16.

Nicht parallel zum Daemon (tesla-bridge) starten — gleiche Pins.


Verdrahtung:
  3,3 V (Stift 1/17) — Poti — GPIO 26 (Stift 37) — GL5528 — GND (Stift 39)
  GPIO 16 (Stift 36) — 220–330 Ω — LED-Anode (lang) — Kathode (kurz) — GND (Stift 39)

Dunkel → HIGH, LED an. Hell → LOW, LED aus. Interner Pull aus.
"""

from __future__ import annotations

import re
import subprocess
import time

from gpiozero import LED, Device, DigitalInputDevice
from gpiozero.pins.lgpio import LGPIOFactory

Device.pin_factory = LGPIOFactory()

PIN_LDR = 26
PIN_LED = 16


def pinctrl_high(pin: int) -> bool:
    out = subprocess.check_output(["pinctrl", "get", str(pin)], text=True)
    match = re.search(r"\|\s*(hi|lo)\b", out)
    if not match:
        raise RuntimeError(f"pinctrl-Ausgabe unerwartet: {out.strip()}")
    return match.group(1) == "hi"


def busy_hint() -> str:
    lines = []
    try:
        listed = subprocess.check_output(["pgrep", "-af", "test_ldr"], text=True)
        hits = [line for line in listed.splitlines() if "test_ldr" in line]
        if hits:
            lines.append("laufende LDR-Tests:\n  " + "\n  ".join(hits))
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    try:
        lsof = subprocess.check_output(
            ["lsof", "/dev/gpiochip0"], text=True, stderr=subprocess.DEVNULL
        )
        lines.append("gpiochip0:\n  " + "\n  ".join(lsof.strip().splitlines()))
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    return "\n".join(lines)


def open_ldr():
    ldr = DigitalInputDevice(PIN_LDR, pull_up=None, active_state=True)

    def read() -> bool:
        return bool(ldr.value)

    return read, ldr


def open_led():
    return LED(PIN_LED)


def main() -> None:
    ldr = None
    led = None
    try:
        read, ldr = open_ldr()
        source = "gpiozero"
    except Exception as exc:
        if "busy" not in str(exc).lower():
            raise
        hint = busy_hint()
        print(f"GPIO {PIN_LDR} ist belegt ({exc}). Lese den Pegel über pinctrl.")
        if hint:
            print(hint)
        print("Tipp: altes test_ldr.py beenden, z.B.  pkill -f test_ldr.py")
        read = lambda: pinctrl_high(PIN_LDR)
        source = "pinctrl"

    try:
        led = open_led()
    except Exception as exc:
        print(f"Kontroll-LED GPIO {PIN_LED} nicht verfügbar ({exc}).")
        led = None

    print(
        f"LDR GPIO {PIN_LDR} ({source}), LED GPIO {PIN_LED} "
        f"— LED an = dunkel, Ctrl+C zum Beenden"
    )
    prev = None
    last_print = 0.0
    try:
        while True:
            high = read()
            if led is not None:
                if high:
                    led.on()
                else:
                    led.off()
            now = time.monotonic()
            if high != prev or now - last_print >= 1.0:
                print(
                    f"value={int(high)}  {'HIGH' if high else 'LOW'}  "
                    f"({'dunkel' if high else 'hell'})  "
                    f"LED={'an' if high else 'aus'}"
                )
                prev = high
                last_print = now
            time.sleep(0.05)
    except KeyboardInterrupt:
        print("\nEnde")
    finally:
        if led is not None:
            led.off()
            led.close()
        if ldr is not None:
            ldr.close()


if __name__ == "__main__":
    main()
