#!/usr/bin/env python3
"""Tests für die Tesla-Welcome-Szene (ohne GPIO)."""

import time
import unittest

from light_scenes import (
    TESLA_ICE,
    WELCOME_DURATION_S,
    ScenePlayer,
    welcome_frame,
)


class WelcomeSceneTests(unittest.TestCase):
    def _frame(self, t):
        return welcome_frame(
            t,
            76,
            16,
            TESLA_ICE,
            (0, 0, 0),
            (0, 0, 0),
            12,
            (0, 0, 0),
        )

    def test_duration_is_30s(self):
        self.assertEqual(WELCOME_DURATION_S, 30.0)

    def test_pixel_counts(self):
        rear, passenger, fan = self._frame(10.0)
        self.assertEqual(len(rear), 76)
        self.assertEqual(len(passenger), 16)
        self.assertEqual(len(fan), 12)

    def test_start_is_dark(self):
        rear, passenger, fan = self._frame(0.0)
        self.assertTrue(all(px == (0, 0, 0) for px in rear))
        self.assertTrue(all(px == (0, 0, 0) for px in passenger))
        self.assertTrue(all(px == (0, 0, 0) for px in fan))

    def test_wordmark_is_centered(self):
        rear, _passenger, _fan = self._frame(5.0)
        mid = rear[38]
        edge = rear[0]
        self.assertGreater(sum(mid), sum(edge))
        self.assertGreater(sum(mid), 20)

    def test_spill_travels_forward(self):
        early, _, _ = self._frame(8.2)
        late, _, _ = self._frame(14.0)
        self.assertGreater(sum(early[0]), sum(early[-1]))
        self.assertGreater(sum(late[-1]), 40)

    def test_fan_follows_theme_in_fill(self):
        _rear, _passenger, fan = self._frame(18.0)
        self.assertTrue(any(sum(px) > 40 for px in fan))

    def test_rgb_in_range(self):
        for t in (0, 1, 4, 9, 16, 24, 28, 29.5, 30):
            rear, passenger, fan = self._frame(t)
            for px in rear + passenger + fan:
                self.assertEqual(len(px), 3)
                for ch in px:
                    self.assertGreaterEqual(ch, 0)
                    self.assertLessEqual(ch, 255)

    def test_restore_fades_to_target(self):
        target = (10, 20, 30)
        rear, _passenger, fan = welcome_frame(
            30.0, 8, 4, TESLA_ICE, target, target, 6, target
        )
        self.assertTrue(all(px == target for px in rear))
        self.assertTrue(all(px == target for px in fan))


class ScenePlayerTests(unittest.TestCase):
    def test_start_writes_frames_then_stop(self):
        frames: list = []

        def write(rear, passenger, fan):
            frames.append((rear, passenger, fan))

        def snapshot():
            return {
                "rear": (0, 0, 0),
                "pass": (0, 0, 0),
                "fan": (0, 0, 0),
                "theme": TESLA_ICE,
            }

        player = ScenePlayer(
            rear_count=8,
            pass_count=4,
            fan_count=12,
            write_pixels=write,
            snapshot=snapshot,
        )
        player.request_start("test")
        deadline = time.monotonic() + 1.0
        while not frames and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(player.is_running)
        self.assertGreater(len(frames), 0)
        self.assertEqual(len(frames[0][0]), 8)
        self.assertEqual(len(frames[0][1]), 4)
        self.assertEqual(len(frames[0][2]), 12)
        player.stop()
        self.assertFalse(player.is_running)


if __name__ == "__main__":
    unittest.main()
