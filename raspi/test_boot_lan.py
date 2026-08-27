#!/usr/bin/env python3
"""Tests für LAN-Warte-Logik ohne GPIO."""

import unittest
from unittest.mock import Mock, patch

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
            with patch("homebridge_tesla._ipv4_via_interfaces", return_value=None):
                self.assertIsNone(hb.local_ipv4())

    def test_unreachable_is_none(self):
        with patch(
            "homebridge_tesla.socket.socket",
            return_value=FakeSock(error=OSError(101, "Network is unreachable")),
        ):
            with patch("homebridge_tesla._ipv4_via_interfaces", return_value=None):
                self.assertIsNone(hb.local_ipv4())

    def test_falls_back_to_interface_ip_without_default_route(self):
        with patch(
            "homebridge_tesla.socket.socket",
            return_value=FakeSock(error=OSError(101, "Network is unreachable")),
        ):
            with patch("homebridge_tesla._ipv4_via_interfaces", return_value="192.168.4.2"):
                self.assertEqual(hb.local_ipv4(), "192.168.4.2")

    def test_wait_returns_immediately_when_lan_exists(self):
        with patch("homebridge_tesla.local_ipv4", return_value="172.20.10.3"):
            self.assertEqual(hb.wait_for_lan(), "172.20.10.3")

    def test_wait_exits_when_stop_is_set(self):
        hb.STOP.set()
        self.addCleanup(hb.STOP.clear)
        with patch("homebridge_tesla.local_ipv4", return_value=None):
            with self.assertRaises(SystemExit):
                hb.wait_for_lan()


class HomeKitLanWatchTests(unittest.TestCase):
    def test_driver_listens_on_all_addresses(self):
        kwargs = hb.homekit_driver_kwargs("172.20.10.3")
        self.assertEqual(kwargs["listen_address"], "0.0.0.0")
        self.assertEqual(kwargs["advertised_address"], "172.20.10.3")
        self.assertEqual(kwargs["port"], hb.HAP_PORT)
        self.assertEqual(kwargs["interface_choice"], hb.InterfaceChoice.All)

    def test_watch_ignores_stable_ip(self):
        current, lost, refresh = hb.next_lan_watch_state("172.20.10.3", False, "172.20.10.3")
        self.assertEqual(current, "172.20.10.3")
        self.assertFalse(lost)
        self.assertFalse(refresh)

    def test_watch_refreshes_on_ip_change(self):
        current, lost, refresh = hb.next_lan_watch_state("172.20.10.3", False, "172.20.10.8")
        self.assertEqual(current, "172.20.10.8")
        self.assertFalse(lost)
        self.assertTrue(refresh)

    def test_watch_marks_loss_without_refresh(self):
        current, lost, refresh = hb.next_lan_watch_state("172.20.10.3", False, None)
        self.assertEqual(current, "172.20.10.3")
        self.assertTrue(lost)
        self.assertFalse(refresh)

    def test_watch_refreshes_after_same_ip_returns(self):
        current, lost, refresh = hb.next_lan_watch_state("172.20.10.3", True, "172.20.10.3")
        self.assertEqual(current, "172.20.10.3")
        self.assertFalse(lost)
        self.assertTrue(refresh)

    def test_apply_advertised_address_updates_mdns(self):
        driver = Mock()
        driver.state.addresses = ["172.20.10.3"]
        driver.mdns_service_info = object()
        hb.apply_advertised_address(driver, "172.20.10.8")
        self.assertEqual(driver.state.addresses, ["172.20.10.8"])
        driver.update_advertisement.assert_called_once()

    def test_apply_advertised_address_skips_mdns_before_start(self):
        driver = Mock()
        driver.state.addresses = ["172.20.10.3"]
        driver.mdns_service_info = None
        hb.apply_advertised_address(driver, "172.20.10.8")
        self.assertEqual(driver.state.addresses, ["172.20.10.8"])
        driver.update_advertisement.assert_not_called()


if __name__ == "__main__":
    unittest.main()
