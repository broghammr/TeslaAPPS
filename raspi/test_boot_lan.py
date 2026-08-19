#!/usr/bin/env python3
"""Tests für LAN-Warte-Logik ohne GPIO."""

import unittest
from unittest.mock import patch

import homebridge_tesla as hb


class FakeSock:
    def __init__(self, ip=None, error=None):
        self.ip = ip
        self.error = error

    def settimeout(self, _value):
        return None

    def connect(self, _addr):
        if self.error:
            raise self.error

    def getsockname(self):
        return (self.ip, 0)

    def close(self):
        return None


class LocalIpv4Tests(unittest.TestCase):
    def test_returns_lan_ip(self):
        with patch("homebridge_tesla.socket.socket", return_value=FakeSock("172.20.10.3")):
            self.assertEqual(hb.local_ipv4(), "172.20.10.3")

    def test_rejects_loopback(self):
        with patch("homebridge_tesla.socket.socket", return_value=FakeSock("127.0.0.1")):
            self.assertIsNone(hb.local_ipv4())

    def test_unreachable_is_none(self):
        with patch(
            "homebridge_tesla.socket.socket",
            return_value=FakeSock(error=OSError(101, "Network is unreachable")),
        ):
            self.assertIsNone(hb.local_ipv4())

    def test_wait_returns_immediately_when_lan_exists(self):
        with patch("homebridge_tesla.local_ipv4", return_value="172.20.10.3"):
            self.assertEqual(hb.wait_for_lan(), "172.20.10.3")

    def test_wait_exits_when_stop_is_set(self):
        hb.STOP.set()
        self.addCleanup(hb.STOP.clear)
        with patch("homebridge_tesla.local_ipv4", return_value=None):
            with self.assertRaises(SystemExit):
                hb.wait_for_lan()


if __name__ == "__main__":
    unittest.main()
