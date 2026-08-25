/**
 * Tesla Apps – Thema "Light"
 *
 *   Beifahrer      GPIO 13  – WS2812 Farblampe (PWM1), eigene Farbkachel
 *   Rücksitzbank   GPIO 12  – WS2812 Farblampe (PWM0), eigene Farbkachel
 *   Sternenhimmel  GPIO 17  – On/Off-Schalter
 *
 * API:
 *   POST {base}/gpio/set  pin=&state=0|1  [h,s,brightness,r,g,b]
 *   POST {base}/scene/start  Welcome-Szene (Chibi-Kachel)
 *   GET  {base}/status
 */

const NGROK_TUNNEL_BASE = "https://placate-impale-nautical.ngrok-free.dev";

const API_BASE = NGROK_TUNNEL_BASE || "http://localhost:8080";
const API_SET = `${API_BASE}/gpio/set`;
const API_STATUS = `${API_BASE}/status`;
const API_SCENE_START = `${API_BASE}/scene/start`;
const API_HEADERS = { "ngrok-skip-browser-warning": "1" };
const CHIBI_IMAGE = "../assets/chibi.jpg";

const ICON = "../assets/light.svg";
const WHEEL_SIZE = 200;
const COLOR_DEBOUNCE_MS = 120;

const DEVICES = [
  {
    id: "beifahrer",
    name: "Beifahrer",
    pin: 13,
    kind: "color",
    subtitle: "Farbauswahl",
  },
  {
    id: "ruecksitzbank",
    name: "Rücksitzbank",
    pin: 12,
    kind: "color",
    subtitle: "Farbauswahl",
  },
  {
    id: "sternenhimmel",
    name: "Sternenhimmel",
    pin: 17,
    kind: "switch",
    subtitle: "On/Off-Schalter",
  },
];
