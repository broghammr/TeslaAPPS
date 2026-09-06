#!/usr/bin/env python3
"""Tests für die Tesla-Welcome-Szene (ohne GPIO)."""

import time
import unittest

from light_scenes import (
    TESLA_ICE,
    WELCOME_DURATION_S,
    ScenePlayer,
    heartbeat_frame,
    normalize_scene_name,
    rainbow_frame,
    rider_frame,
    stars_frame,
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


class LoopSceneTests(unittest.TestCase):
    def test_normalize_aliases(self):
        self.assertEqual(normalize_scene_name(None), "welcome")
        self.assertEqual(normalize_scene_name("Regenbogen"), "rainbow")
        self.assertEqual(normalize_scene_name("knight-rider"), "rider")
        self.assertIsNone(normalize_scene_name("disco"))

    def test_rainbow_varies_along_strip(self):
        rear, passenger, fan = rainbow_frame(0.0, 24, 8, 8)
        self.assertEqual(len(rear), 24)
        self.assertEqual(len(passenger), 8)
        self.assertEqual(len(fan), 8)
        reds = [px[0] for px in rear]
        self.assertGreater(max(reds) - min(reds), 40)

    def test_stars_are_green(self):
        rear, _passenger, _fan = stars_frame(1.7, 40, 12, 12)
        lit = [px for px in rear if sum(px) > 40]
        self.assertTrue(lit)
        for r, g, b in lit:
            self.assertGreaterEqual(g, r)
            self.assertGreaterEqual(g, b)

    def test_heartbeat_pulses_red(self):
        peak, _, _ = heartbeat_frame(0.10, 8, 4, 4)
        rest, _, _ = heartbeat_frame(0.8, 8, 4, 4)
        self.assertTrue(all(px[0] > px[1] and px[0] > px[2] for px in peak))
        self.assertGreater(peak[0][0], rest[0][0])
        self.assertEqual(peak[0], peak[-1])

    def test_rider_sweeps(self):
        early, _, _ = rider_frame(0.05, 20, 8, 8)
        late, _, _ = rider_frame(0.75, 20, 8, 8)
        early_i = max(range(20), key=lambda i: sum(early[i]))
        late_i = max(range(20), key=lambda i: sum(late[i]))
        self.assertLess(early_i, late_i)
        self.assertGreater(early[early_i][0], early[early_i][1])

    def test_loop_frames_rgb_in_range(self):
        for fn in (rainbow_frame, stars_frame, heartbeat_frame, rider_frame):
            for t in (0.0, 0.2, 1.0, 3.7):
                rear, passenger, fan = fn(t, 10, 6, 4)
                for px in rear + passenger + fan:
                    self.assertEqual(len(px), 3)
                    for ch in px:
                        self.assertGreaterEqual(ch, 0)
                        self.assertLessEqual(ch, 255)


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

    def test_rainbow_loops_until_stop(self):
        frames: list = []

        def write(rear, passenger, fan):
            frames.append((rear, passenger, fan))

        player = ScenePlayer(
            rear_count=6,
            pass_count=4,
            fan_count=4,
            write_pixels=write,
            snapshot=lambda: {
                "rear": (0, 0, 0),
                "pass": (0, 0, 0),
                "fan": (0, 0, 0),
                "theme": TESLA_ICE,
            },
        )
        started = player.request_start("test", name="rainbow")
        self.assertEqual(started, "rainbow")
        deadline = time.monotonic() + 1.0
        while len(frames) < 3 and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(player.is_running)
        self.assertEqual(player.as_status()["name"], "rainbow")
        self.assertTrue(player.as_status()["loop"])
        player.stop()
        self.assertFalse(player.is_running)
        self.assertIsNone(player.as_status()["name"])


if __name__ == "__main__":
    unittest.main()
