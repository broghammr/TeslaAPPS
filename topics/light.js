/**
 * Tesla Apps – Thema "Light"
 * Steuerung der Beleuchtung im Auto (Raspberry Pi / Web-API).
 *
 * Geräte (AGENTS.md Projekt 02):
 *   Sternenhimmel  GPIO 17  – On/Off-Lampe
 *   Rücksitzbank   GPIO 21  – WLED Farblampe (An/Aus über gpio/set)
 *   Beifahrer      GPIO 22  – WLED Farblampe (An/Aus über gpio/set)
 *   Farbe          – Farbkreis + Helligkeit (UI; Senden folgt mit erweiterter API)
 *
 * API (An/Aus):
 *   POST {base}/gpio/set  pin=XX&state=0|1
 *   public: ngrok-Tunnel (HTTPS von GitHub Pages)
 *   lokal:  http://localhost:8080
 *
 * Farbe (vorbereitet, noch nicht gesendet):
 *   getColorPayload() → { r, g, b, brightness, h, s }
 *
 * mode "no-cors": Request wird gesendet, Response ist opaque.
 */

/** Basis-URL des Tunnels (ohne trailing slash), leer = lokaler Server */
const NGROK_TUNNEL_BASE =
  "https://placate-impale-nautical.ngrok-free.dev";

const API_URL = NGROK_TUNNEL_BASE
  ? `${NGROK_TUNNEL_BASE}/gpio/set`
  : "http://localhost:8080/gpio/set";

const ICON = "../assets/light.svg";

/** Geräte laut AGENTS.md – je eine Kachel */
const DEVICES = [
  {
    id: "sternenhimmel",
    name: "Sternenhimmel",
    pin: 17,
    kind: "On/Off-Lampe",
  },
  {
    id: "ruecksitzbank",
    name: "Rücksitzbank",
    pin: 21,
    kind: "WLED Farblampe",
  },
  {
    id: "beifahrer",
    name: "Beifahrer",
    pin: 22,
    kind: "WLED Farblampe",
  },
];

/** pin → { on, busy, tile } */
const stateByPin = new Map();

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function announce(message) {
  let live = document.getElementById("hub-live");
  if (!live) {
    live = document.createElement("div");
    live.id = "hub-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.className = "visually-hidden";
    document.body.appendChild(live);
  }
  live.textContent = "";
  requestAnimationFrame(() => {
    live.textContent = message;
  });
}

function statusLabel(entry) {
  if (entry.busy) return "Bitte warten…";
  return entry.on
    ? "An – tippen zum Ausschalten"
    : "Aus – tippen zum Einschalten";
}

function subtitleLabel(device, entry) {
  if (entry.busy) return "Befehl wird gesendet…";
  return entry.on ? `${device.kind} · eingeschaltet` : `${device.kind} · ausgeschaltet`;
}

function updateTileUi(device, entry) {
  const tile = entry.tile;
  if (!tile) return;

  tile.classList.toggle("tile--lamp-on", entry.on);
  tile.classList.toggle("tile--busy", entry.busy);
  tile.setAttribute("aria-pressed", entry.on ? "true" : "false");
  tile.setAttribute(
    "aria-label",
    `${device.name}: ${entry.on ? "an" : "aus"}. Tippen zum Umschalten.`
  );

  const status = tile.querySelector(".tile__status");
  if (status) status.textContent = statusLabel(entry);

  const subtitle = tile.querySelector(".tile__subtitle");
  if (subtitle) subtitle.textContent = subtitleLabel(device, entry);
}

/**
 * GPIO schalten. mode "no-cors": fire-and-forget bei fehlendem CORS.
 */
async function setDeviceState(pin, on) {
  const body = new URLSearchParams({
    pin: String(pin),
    state: on ? "1" : "0",
  });

  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: body.toString(),
  });
}

async function toggleDevice(device) {
  const entry = stateByPin.get(device.pin);
  if (!entry || entry.busy) return;

  const next = !entry.on;
  entry.busy = true;
  updateTileUi(device, entry);

  try {
    await setDeviceState(device.pin, next);
    entry.on = next;
    announce(
      entry.on ? `${device.name} ist an.` : `${device.name} ist aus.`
    );
  } catch (err) {
    console.error("GPIO set failed:", err);
    announce(
      `${device.name}: Fehler. Raspberry Pi erreichbar? (Tunnel / Heimnetz)`
    );
  } finally {
    entry.busy = false;
    updateTileUi(device, entry);
  }
}

function createDeviceTile(device) {
  const entry = { on: false, busy: false, tile: null };
  stateByPin.set(device.pin, entry);

  const el = document.createElement("button");
  el.type = "button";
  el.className = "tile tile--lamp";
  el.setAttribute("role", "listitem");
  el.dataset.deviceId = device.id;
  el.dataset.pin = String(device.pin);
  el.setAttribute("aria-pressed", "false");

  el.innerHTML = `
    <span class="tile__icon" aria-hidden="true">
      <img
        class="tile__pictogram"
        src="${escapeHtml(ICON)}"
        alt=""
        width="36"
        height="36"
        decoding="async"
      />
    </span>
    <span class="tile__body">
      <span class="tile__title">${escapeHtml(device.name)}</span>
      <span class="tile__subtitle">${escapeHtml(device.kind)} · ausgeschaltet</span>
    </span>
    <span class="tile__status">Aus – tippen zum Einschalten</span>
  `;

  el.addEventListener("click", () => {
    toggleDevice(device);
  });

  entry.tile = el;
  updateTileUi(device, entry);
  return el;
}

/* —— Farbe + Helligkeit (vierte Kachel, API später) —— */

/** Aktuelle Auswahl: HSV + abgeleitete RGB (0–255), Helligkeit 0–100 % */
const colorState = {
  h: 210, // Blau-ish Start (passt zur Akzentfarbe)
  s: 0.85,
  v: 0.85,
  r: 0,
  g: 0,
  b: 0,
};

const WHEEL_SIZE = 220; // px, gut tippbar im Tesla-Browser

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return [
    Math.round((rp + m) * 255),
    Math.round((gp + m) * 255),
    Math.round((bp + m) * 255),
  ];
}

function syncRgbFromHsv() {
  const [r, g, b] = hsvToRgb(colorState.h, colorState.s, colorState.v);
  colorState.r = r;
  colorState.g = g;
  colorState.b = b;
}

/** Payload für spätere Web-API (WLED / Farbe) */
function getColorPayload() {
  return {
    r: colorState.r,
    g: colorState.g,
    b: colorState.b,
    brightness: Math.round(colorState.v * 100),
    h: Math.round(colorState.h),
    s: Math.round(colorState.s * 100),
  };
}

function colorStatusText() {
  const p = getColorPayload();
  return `RGB ${p.r}, ${p.g}, ${p.b} · ${p.brightness} %`;
}

function drawColorWheel(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;

      if (dist > radius) {
        data[i + 3] = 0;
        continue;
      }

      // Winkel → Hue, Abstand → Sättigung; V fest 1 (Helligkeit über Regler)
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      const sat = Math.min(1, dist / radius);
      const [r, g, b] = hsvToRgb(angle, sat, 1);

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  // Auswahlmarker
  const markerR = radius * colorState.s;
  const rad = (colorState.h * Math.PI) / 180;
  const mx = cx + markerR * Math.cos(rad);
  const my = cy + markerR * Math.sin(rad);

  ctx.beginPath();
  ctx.arc(mx, my, 10, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mx, my, 10, 0, Math.PI * 2);
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function pickColorFromEvent(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = event.clientX ?? (event.touches && event.touches[0]?.clientX);
  const clientY = event.clientY ?? (event.touches && event.touches[0]?.clientY);
  if (clientX == null || clientY == null) return false;

  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const radius = canvas.width / 2 - 2;
  let dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) dist = 0;
  // Außerhalb des Kreises: auf Rand clampen (leichter zu tippen)
  const sat = Math.min(1, dist / radius);
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  colorState.h = angle;
  colorState.s = sat;
  syncRgbFromHsv();
  return true;
}

function createColorTile() {
  syncRgbFromHsv();

  const el = document.createElement("div");
  el.className = "tile tile--color";
  el.setAttribute("role", "listitem");
  el.dataset.deviceId = "color-picker";

  el.innerHTML = `
    <span class="tile__body tile__body--color">
      <span class="tile__title">Farbe</span>
      <span class="tile__subtitle">Farbkreis + Helligkeit · noch nicht gesendet</span>
    </span>
    <div class="color-picker">
      <div class="color-picker__row">
        <canvas
          class="color-picker__wheel"
          width="${WHEEL_SIZE}"
          height="${WHEEL_SIZE}"
          role="img"
          aria-label="Farbkreis: Tippen zum Auswählen von Farbe und Sättigung"
        ></canvas>
        <div class="color-picker__side">
          <div
            class="color-picker__swatch"
            aria-hidden="true"
            title="Aktuelle Farbe"
          ></div>
          <label class="color-picker__brightness">
            <span class="color-picker__brightness-label">
              Helligkeit
              <span class="color-picker__brightness-value">85 %</span>
            </span>
            <input
              class="color-picker__slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value="85"
              aria-label="Helligkeit"
            />
          </label>
        </div>
      </div>
    </div>
    <span class="tile__status">${escapeHtml(colorStatusText())}</span>
  `;

  const canvas = el.querySelector(".color-picker__wheel");
  const swatch = el.querySelector(".color-picker__swatch");
  const slider = el.querySelector(".color-picker__slider");
  const brightValue = el.querySelector(".color-picker__brightness-value");
  const status = el.querySelector(".tile__status");

  function refreshUi() {
    drawColorWheel(canvas);
    const css = `rgb(${colorState.r}, ${colorState.g}, ${colorState.b})`;
    swatch.style.backgroundColor = css;
    const pct = Math.round(colorState.v * 100);
    brightValue.textContent = `${pct} %`;
    status.textContent = colorStatusText();
    // Für spätere API-Anbindung sichtbar im DOM
    el.dataset.colorR = String(colorState.r);
    el.dataset.colorG = String(colorState.g);
    el.dataset.colorB = String(colorState.b);
    el.dataset.brightness = String(pct);
  }

  let dragging = false;

  function onPointerSelect(event) {
    if (pickColorFromEvent(canvas, event)) {
      refreshUi();
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    canvas.setPointerCapture?.(event.pointerId);
    onPointerSelect(event);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    onPointerSelect(event);
    event.preventDefault();
  });

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch (_) {
      /* ignore */
    }
    const p = getColorPayload();
    announce(
      `Farbe gewählt: RGB ${p.r}, ${p.g}, ${p.b}, Helligkeit ${p.brightness} Prozent.`
    );
    // TODO: sendColor(getColorPayload()) wenn Web-API erweitert ist
  };

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  slider.addEventListener("input", () => {
    colorState.v = Number(slider.value) / 100;
    syncRgbFromHsv();
    refreshUi();
  });

  slider.addEventListener("change", () => {
    const p = getColorPayload();
    announce(`Helligkeit ${p.brightness} Prozent.`);
    // TODO: sendColor(getColorPayload()) wenn Web-API erweitert ist
  });

  refreshUi();
  return el;
}

function renderPage() {
  const grid = document.getElementById("tile-grid");
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  for (const device of DEVICES) {
    fragment.appendChild(createDeviceTile(device));
  }
  fragment.appendChild(createColorTile());
  grid.appendChild(fragment);
}

function setupNightModeIndicator() {
  const indicator = document.getElementById("night-indicator");
  const themeMeta = document.getElementById("theme-color-meta");
  if (!indicator || !window.matchMedia) return;

  const query = window.matchMedia("(prefers-color-scheme: dark)");

  const apply = (isDark) => {
    indicator.hidden = !isDark;
    indicator.classList.toggle("is-visible", isDark);
    indicator.setAttribute(
      "aria-label",
      isDark ? "Nachtmodus aktiv" : "Nachtmodus inaktiv"
    );
    if (themeMeta) {
      themeMeta.setAttribute("content", isDark ? "#1a1a1a" : "#f5f5f5");
    }
  };

  apply(query.matches);

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", (e) => apply(e.matches));
  } else if (typeof query.addListener === "function") {
    query.addListener((e) => apply(e.matches));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupNightModeIndicator();
  renderPage();
});
