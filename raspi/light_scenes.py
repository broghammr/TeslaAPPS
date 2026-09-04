#!/usr/bin/env python3
"""
Dynamische Lichtszenen für die Tesla-Beleuchtung.

Welcome (Sommerupdate 2026, 30 s):
  Display weckt auf → TESLA-Schriftzug leuchtet → Farbe fließt
  in die Ambient-Streifen → Kabine atmet → hält, dann Restore.

Ausführung: Daemon-Start und Taster GPIO 27.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from typing import Callable

log = logging.getLogger("tesla-bridge")

WELCOME_DURATION_S = 30.0
WELCOME_FPS = 30
# Fallback, wenn keine eigene Ambient-Farbe gesetzt ist (#0070f3).
TESLA_ICE = (0, 112, 243)
WHITE = (255, 255, 255)

# Phasen analog zur Welcome-Animation 2026.26
_WAKE_END = 2.5
_WORDMARK_END = 7.5
_SPILL_END = 15.0
_FILL_END = 22.0
_BREATHE_END = 27.0
_HOLD_END = 29.0


def _clamp01(value: float) -> float:
    if value <= 0.0:
        return 0.0
    if value >= 1.0:
        return 1.0
    return value


def _smooth(value: float) -> float:
    t = _clamp01(value)
    return t * t * (3.0 - 2.0 * t)


def _mix(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = _clamp01(t)
    return (
        int(round(c1[0] + (c2[0] - c1[0]) * t)),
        int(round(c1[1] + (c2[1] - c1[1]) * t)),
        int(round(c1[2] + (c2[2] - c1[2]) * t)),
    )


def _scale(color: tuple[int, int, int], k: float) -> tuple[int, int, int]:
    k = _clamp01(k)
    return (
        int(round(color[0] * k)),
        int(round(color[1] * k)),
        int(round(color[2] * k)),
    )


def _led_pos(index: int, count: int) -> float:
    if count <= 1:
        return 0.0
    return index / (count - 1)


def _strip_pixels(
    t: float,
    count: int,
    theme: tuple[int, int, int],
    restore: tuple[int, int, int],
) -> list[tuple[int, int, int]]:
    pixels: list[tuple[int, int, int]] = []
    for i in range(count):
        pos = _led_pos(i, count)
        dist = abs(pos - 0.5) * 2.0

        if t <= 0.06:
            pix = (0, 0, 0)
        elif t < _WAKE_END:
            phase = _smooth(t / _WAKE_END)
            width = 0.10 + 0.32 * phase
            core = max(0.0, 1.0 - dist / max(width, 0.01))
            pix = _scale(WHITE, core * (0.03 + 0.20 * phase))
        elif t < _WORDMARK_END:
            phase = _smooth((t - _WAKE_END) / (_WORDMARK_END - _WAKE_END))
            width = 0.22 + 0.30 * phase
            core = max(0.0, 1.0 - dist / width) ** 1.35
            shimmer = 0.90 + 0.10 * math.sin(t * 6.8 + i * 0.28)
            tint = _mix(WHITE, theme, 0.22 + 0.50 * phase)
            pix = _scale(tint, core * (0.28 + 0.62 * phase) * shimmer)
        elif t < _SPILL_END:
            phase = _smooth((t - _WORDMARK_END) / (_SPILL_END - _WORDMARK_END))
            # Farbe startet „vorn“ (Display/Armatur) und fließt nach hinten.
            edge = phase * 1.06
            fill = _smooth(_clamp01((edge - pos) / 0.16))
            leftover = max(0.0, 1.0 - dist / 0.52) * (1.0 - phase)
            tint = _mix(WHITE, theme, 0.65 + 0.35 * phase)
            base = _scale(tint, max(fill, leftover * 0.38))
            blade = math.exp(-((pos - phase) ** 2) / 0.007)
            pix = _mix(base, WHITE, min(0.50, blade * 0.50))
        elif t < _FILL_END:
            phase = _smooth((t - _SPILL_END) / (_FILL_END - _SPILL_END))
            pix = _scale(theme, 0.72 + 0.28 * phase)
        elif t < _BREATHE_END:
            local = (t - _FILL_END) / (_BREATHE_END - _FILL_END)
            breath = 0.5 + 0.5 * math.sin(local * math.pi * 2.0 - math.pi / 2.0)
            pix = _scale(theme, 0.76 + 0.24 * breath)
        elif t < _HOLD_END:
            pix = _scale(theme, 0.90)
        else:
            fade = _smooth((t - _HOLD_END) / max(WELCOME_DURATION_S - _HOLD_END, 0.01))
            pix = _mix(_scale(theme, 0.90), restore, fade)
        pixels.append(pix)
    return pixels


def welcome_frame(
    t: float,
    rear_count: int,
    pass_count: int,
    theme: tuple[int, int, int],
    restore_rear: tuple[int, int, int],
    restore_pass: tuple[int, int, int],
    fan_count: int = 0,
    restore_fan: tuple[int, int, int] = (0, 0, 0),
) -> tuple[
    list[tuple[int, int, int]],
    list[tuple[int, int, int]],
    list[tuple[int, int, int]],
]:
    """Ein Frame der 30-s-Welcome-Szene (LED-Streifen inkl. Lüfter-LEDs, kein Sternenhimmel)."""
    t = max(0.0, min(float(t), WELCOME_DURATION_S))
    rear = _strip_pixels(t, rear_count, theme, restore_rear)
    passenger = _strip_pixels(t, pass_count, theme, restore_pass)
    fan = _strip_pixels(t, fan_count, theme, restore_fan)
    return rear, passenger, fan


class ScenePlayer:
    """Spielt eine Szene in einem Daemon-Thread, neustartbar, ohne Restore bei Abbruch."""

    def __init__(
        self,
        *,
        rear_count: int,
        pass_count: int,
        fan_count: int = 0,
        write_pixels: Callable[
            [
                list[tuple[int, int, int]],
                list[tuple[int, int, int]],
                list[tuple[int, int, int]],
            ],
            None,
        ],
        snapshot: Callable[[], dict],
    ) -> None:
        self.rear_count = rear_count
        self.pass_count = pass_count
        self.fan_count = fan_count
        self._write_pixels = write_pixels
        self._snapshot = snapshot
        self._lock = threading.Lock()
        self._generation = 0
        self._running = False
        self._thread: threading.Thread | None = None
        self._name: str | None = None
        self._started_at: float | None = None
        self._reason: str | None = None

    @property
    def is_running(self) -> bool:
        return self._running

    def as_status(self) -> dict:
        elapsed = None
        if self._running and self._started_at is not None:
            elapsed = round(time.monotonic() - self._started_at, 1)
        return {
            "name": self._name,
            "running": self._running,
            "duration": WELCOME_DURATION_S,
            "elapsed": elapsed,
            "reason": self._reason,
        }

    def request_start(self, reason: str = "manual") -> None:
        with self._lock:
            self._generation += 1
            gen = self._generation
            self._running = True
            self._name = "welcome"
            self._reason = reason
            self._started_at = time.monotonic()
            thread = threading.Thread(
                target=self._run_welcome,
                args=(gen, reason),
                daemon=True,
                name="light-scene",
            )
            self._thread = thread
            thread.start()

    def stop(self) -> None:
        with self._lock:
            self._generation += 1
            self._running = False
            self._name = None
            self._reason = None
            self._started_at = None
            thread = self._thread
        if (
            thread is not None
            and thread.is_alive()
            and thread is not threading.current_thread()
        ):
            thread.join(timeout=1.0)

    def _superseded(self, gen: int) -> bool:
        return gen != self._generation

    def _run_welcome(self, gen: int, reason: str) -> None:
        log.info("Startanimation Welcome 30s (%s)", reason)
        snap = self._snapshot()
        theme = snap.get("theme") or TESLA_ICE
        frame_dt = 1.0 / WELCOME_FPS
        t0 = time.monotonic()
        try:
            while True:
                if self._superseded(gen):
                    return
                t = time.monotonic() - t0
                if t >= WELCOME_DURATION_S:
                    break
                live = self._snapshot()
                rear, passenger, fan = welcome_frame(
                    t,
                    self.rear_count,
                    self.pass_count,
                    theme,
                    live.get("rear") or (0, 0, 0),
                    live.get("pass") or (0, 0, 0),
                    self.fan_count,
                    live.get("fan") or (0, 0, 0),
                )
                self._write_pixels(rear, passenger, fan)
                sleep_for = frame_dt - ((time.monotonic() - t0) % frame_dt)
                if sleep_for > 0:
                    time.sleep(sleep_for)

            if self._superseded(gen):
                return
            live = self._snapshot()
            self._restore(live)
        except Exception:
            log.exception("Startanimation abgebrochen")
        finally:
            if not self._superseded(gen):
                self._running = False
                self._name = None
                self._started_at = None
                log.info("Startanimation Ende (%s)", reason)

    def _restore(self, snap: dict) -> None:
        rear = [snap.get("rear") or (0, 0, 0)] * self.rear_count
        passenger = [snap.get("pass") or (0, 0, 0)] * self.pass_count
        fan = [snap.get("fan") or (0, 0, 0)] * self.fan_count
        try:
            self._write_pixels(rear, passenger, fan)
        except Exception:
            log.exception("Restore Streifen")
