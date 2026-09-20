#!/usr/bin/env python3
"""Tests für den virtuellen Musik-Sync-Schalter (kein GPIO)."""

import sys
import types
import unittest
from unittest.mock import MagicMock, Mock, patch


def _stub_pi_modules() -> None:
    """gpiozero fehlt auf dem Dev-Rechner."""
    if "gpiozero" in sys.modules:
        return

    def stub(name, **attrs):
        mod = types.ModuleType(name)
        for key, value in attrs.items():
            setattr(mod, key, value)
        sys.modules[name] = mod
        return mod

    stub(
        "gpiozero",
        Button=MagicMock,
        Device=MagicMock(),
        OutputDevice=MagicMock,
        LED=MagicMock,
        DigitalInputDevice=MagicMock,
    )
    stub("gpiozero.pins")
    stub("gpiozero.pins.lgpio", LGPIOFactory=MagicMock)


_stub_pi_modules()
import homebridge_tesla as hb  # noqa: E402


class FakeSwitch:
    def __init__(self, *, virtual: bool = False):
        self.virtual = virtual
        self.on = False
        self.calls = []

    def apply_from_api(self, *, on, **_kwargs):
        self.on = bool(on)
        self.calls.append(self.on)


class FakeColorLamp:
    """Duck-type ColorLamp, ohne GPIO."""

    def __init__(self):
        self.calls = []

    def apply_from_api(self, **kwargs):
        self.calls.append(kwargs)


class ApplyFromWebApiTests(unittest.TestCase):
    def test_virtual_switch_does_not_stop_scene(self):
        acc = FakeSwitch(virtual=True)
        player = Mock()
        player.is_running = True
        with patch.object(hb, "SCENE_PLAYER", player):
            hb.apply_from_web_api(acc, on=True)
        player.stop.assert_not_called()
        self.assertEqual(acc.calls, [True])
        self.assertTrue(acc.on)

    def test_real_switch_stops_running_scene(self):
        acc = FakeSwitch(virtual=False)
        player = Mock()
        player.is_running = True
        with patch.object(hb, "SCENE_PLAYER", player):
            hb.apply_from_web_api(acc, on=False)
        player.stop.assert_called_once_with(restore=False)
        self.assertEqual(acc.calls, [False])

    def test_switch_requires_state(self):
        acc = FakeSwitch(virtual=True)
        with self.assertRaises(ValueError):
            hb.apply_from_web_api(acc, on=None)

    def test_color_lamp_is_applied(self):
        acc = FakeColorLamp()
        with patch.object(hb, "ColorLamp", FakeColorLamp):
            hb.apply_from_web_api(acc, on=True, hue=120, sat=80, bri=50, rgb=None)
        self.assertEqual(
            acc.calls,
            [{"on": True, "hue": 120, "sat": 80, "bri": 50, "rgb": None}],
        )

    def test_music_sync_pin_is_virtual(self):
        self.assertEqual(hb.PINS["music_sync"], 100)
        self.assertNotIn(100, (17, 12, 13, 22, 21, 27))

    def test_ldr_pins_are_not_api_devices(self):
        self.assertEqual(hb.PINS["ldr"], 26)
        self.assertEqual(hb.PINS["ldr_led"], 16)
        self.assertNotIn(26, (17, 12, 13, 22, 21, 27, 100))
        self.assertNotIn(16, (17, 12, 13, 22, 21, 27, 100))


class DeviceClassTests(unittest.TestCase):
    def setUp(self):
        hb.REGISTRY.clear()
        self.addCleanup(hb.REGISTRY.clear)

    def test_virtual_switch_apply_and_status(self):
        sw = hb.GpioSwitch("Musik-Sync", 100, virtual=True)
        self.assertFalse(sw._on)
        sw.apply_from_api(on=True)
        self.assertTrue(sw._on)
        status = sw.as_status()
        self.assertEqual(status["kind"], "switch")
        self.assertTrue(status["virtual"])
        self.assertTrue(status["on"])
        self.assertIs(hb.REGISTRY[100], sw)

    def test_color_lamp_rgb_status(self):
        lamp = hb.ColorLamp("Beifahrer", hb.NullStrips(), 0, 13)
        lamp.apply_from_api(on=True, rgb=(255, 0, 0))
        status = lamp.as_status()
        self.assertTrue(status["on"])
        self.assertEqual(status["kind"], "color")
        self.assertEqual(status["r"], 255)
        self.assertEqual(status["g"], 0)
        self.assertEqual(status["b"], 0)
        self.assertIs(hb.REGISTRY[13], lamp)


if __name__ == "__main__":
    unittest.main()
