/**
 * Tesla Apps – Thema "Light"
 *
 *   Sternenhimmel  GPIO 17  – On/Off-Schalter
 *   Rücksitzbank   GPIO 12  – WS2812 Farblampe (PWM0), eigene Farbkachel
 *   Beifahrer      GPIO 13  – WS2812 Farblampe (PWM1), eigene Farbkachel
 *
 * API:
 *   POST {base}/gpio/set  pin=&state=0|1  [h,s,brightness,r,g,b]
 *   GET  {base}/status
 */

const NGROK_TUNNEL_BASE = "https://placate-impale-nautical.ngrok-free.dev";

const API_BASE = NGROK_TUNNEL_BASE || "http://localhost:8080";
const API_SET = `${API_BASE}/gpio/set`;
const API_STATUS = `${API_BASE}/status`;
const API_HEADERS = { "ngrok-skip-browser-warning": "1" };

const ICON = "../assets/light.svg";
const WHEEL_SIZE = 200;
const COLOR_DEBOUNCE_MS = 120;

const DEVICES = [
  {
    id: "sternenhimmel",
    name: "Sternenhimmel",
    pin: 17,
    kind: "switch",
    subtitle: "On/Off-Schalter",
  },
  {
    id: "ruecksitzbank",
    name: "Rücksitzbank",
    pin: 12,
    kind: "color",
    subtitle: "Farbauswahl",
  },
  {
    id: "beifahrer",
    name: "Beifahrer",
    pin: 13,
    kind: "color",
    subtitle: "Farbauswahl",
  },
];

/** pin → Gerätestatus inkl. DOM */
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

function syncRgb(color) {
  const [r, g, b] = hsvToRgb(color.h, color.s, color.v);
  color.r = r;
  color.g = g;
  color.b = b;
}

function colorPayload(color) {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    brightness: Math.round(color.v * 100),
    h: Math.round(color.h),
    s: Math.round(color.s * 100),
  };
}

function createColorState() {
  const color = { h: 210, s: 0.85, v: 0.85, r: 0, g: 0, b: 0 };
  syncRgb(color);
  return color;
}

async function postGpio(fields) {
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value != null) body.set(key, String(value));
  });

  const init = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      ...API_HEADERS,
    },
    body: body.toString(),
  };

  try {
    const res = await fetch(API_SET, { ...init, mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (err instanceof TypeError) {
      await fetch(API_SET, { ...init, mode: "no-cors" });
      return;
    }
    throw err;
  }
}

async function fetchStatus() {
  const res = await fetch(API_STATUS, {
    method: "GET",
    mode: "cors",
    headers: API_HEADERS,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function applyStatus(data) {
  if (!data || typeof data !== "object") return;

  for (const device of DEVICES) {
    const remote = data[String(device.pin)];
    const entry = stateByPin.get(device.pin);
    if (!remote || !entry) continue;

    entry.on = Boolean(remote.on);
    if (device.kind === "color" && entry.color) {
      if (typeof remote.h === "number") entry.color.h = remote.h;
      if (typeof remote.s === "number") entry.color.s = remote.s / 100;
      if (typeof remote.brightness === "number") {
        entry.color.v = remote.brightness / 100;
      }
      syncRgb(entry.color);
      if (entry.refreshColor) entry.refreshColor();
    }
    updateTileUi(device, entry);
  }
}

function switchStatusLabel(entry) {
  if (entry.busy) return "Bitte warten…";
  return entry.on
    ? "An – tippen zum Ausschalten"
    : "Aus – tippen zum Einschalten";
}

function colorStatusLabel(entry) {
  const p = colorPayload(entry.color);
  if (entry.busy) return "Befehl wird gesendet…";
  return `RGB ${p.r}, ${p.g}, ${p.b} · ${p.brightness} %`;
}

function colorSubtitleLabel(entry) {
  return entry.on ? "eingeschaltet" : "ausgeschaltet";
}

function updateTileUi(device, entry) {
  const tile = entry.tile;
  if (!tile) return;

  tile.classList.toggle("tile--lamp-on", entry.on);
  tile.classList.toggle("tile--busy", entry.busy);

  const power = tile.querySelector("[data-role=power]");
  if (power) {
    power.setAttribute("aria-pressed", entry.on ? "true" : "false");
    power.setAttribute(
      "aria-label",
      `${device.name}: ${entry.on ? "an" : "aus"}. Tippen zum Umschalten.`
    );
  }

  const subtitle = tile.querySelector(".tile__subtitle");
  if (subtitle) {
    if (device.kind === "color") {
      subtitle.textContent = colorSubtitleLabel(entry);
    } else {
      subtitle.textContent = entry.busy
        ? "Befehl wird gesendet…"
        : entry.on
          ? `${device.subtitle} · eingeschaltet`
          : `${device.subtitle} · ausgeschaltet`;
    }
  }

  const status = tile.querySelector(".tile__status");
  if (status) {
    status.textContent =
      device.kind === "color"
        ? colorStatusLabel(entry)
        : switchStatusLabel(entry);
  }
}

async function toggleDevice(device) {
  const entry = stateByPin.get(device.pin);
  if (!entry || entry.busy) return;

  const next = !entry.on;
  entry.busy = true;
  updateTileUi(device, entry);

  try {
    if (device.kind === "color") {
      const p = colorPayload(entry.color);
      await postGpio({
        pin: device.pin,
        state: next ? "1" : "0",
        h: p.h,
        s: p.s,
        brightness: p.brightness,
        r: p.r,
        g: p.g,
        b: p.b,
      });
    } else {
      await postGpio({ pin: device.pin, state: next ? "1" : "0" });
    }
    entry.on = next;
    announce(next ? `${device.name} ist an.` : `${device.name} ist aus.`);
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

async function sendColor(device, { turnOn = true } = {}) {
  const entry = stateByPin.get(device.pin);
  if (!entry) return;

  entry.wantOn = turnOn ? true : entry.on;
  if (entry.sendingColor) {
    entry.colorQueued = true;
    return;
  }

  entry.sendingColor = true;
  try {
    do {
      entry.colorQueued = false;
      const p = colorPayload(entry.color);
      const nextOn = entry.wantOn !== false;
      await postGpio({
        pin: device.pin,
        state: nextOn ? "1" : "0",
        h: p.h,
        s: p.s,
        brightness: p.brightness,
        r: p.r,
        g: p.g,
        b: p.b,
      });
      entry.on = nextOn;
      announce(
        `${device.name}: RGB ${p.r}, ${p.g}, ${p.b}, ${p.brightness} Prozent.`
      );
    } while (entry.colorQueued);
  } catch (err) {
    console.error("Color set failed:", err);
    announce(`${device.name}: Farbe nicht gesendet.`);
  } finally {
    entry.sendingColor = false;
    updateTileUi(device, entry);
    if (entry.refreshColor) entry.refreshColor();
  }
}

function deviceIconHtml() {
  return `
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
  `;
}

function createSwitchTile(device) {
  const entry = { on: false, busy: false, tile: null };
  stateByPin.set(device.pin, entry);

  const el = document.createElement("button");
  el.type = "button";
  el.className = "tile tile--lamp";
  el.setAttribute("role", "listitem");
  el.dataset.deviceId = device.id;
  el.dataset.pin = String(device.pin);
  el.dataset.kind = "switch";
  el.dataset.role = "power";
  el.setAttribute("aria-pressed", "false");

  el.innerHTML = `
    ${deviceIconHtml()}
    <span class="tile__body">
      <span class="tile__title">${escapeHtml(device.name)}</span>
      <span class="tile__subtitle">${escapeHtml(device.subtitle)} · ausgeschaltet</span>
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

function drawColorWheel(canvas, color) {
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

  const markerR = radius * color.s;
  const rad = (color.h * Math.PI) / 180;
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

function pickColorFromEvent(canvas, event, color) {
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

  const sat = Math.min(1, dist / radius);
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  color.h = angle;
  color.s = sat;
  syncRgb(color);
  return true;
}

function createColorTile(device) {
  const color = createColorState();
  const entry = {
    on: false,
    busy: false,
    tile: null,
    color,
    refreshColor: null,
  };
  stateByPin.set(device.pin, entry);

  const el = document.createElement("div");
  el.className = "tile tile--color tile--lamp";
  el.setAttribute("role", "listitem");
  el.dataset.deviceId = device.id;
  el.dataset.pin = String(device.pin);
  el.dataset.kind = "color";

  el.innerHTML = `
    <button
      type="button"
      class="tile__power"
      data-role="power"
      aria-pressed="false"
    >
      ${deviceIconHtml()}
      <span class="tile__body tile__body--color">
        <span class="tile__title">${escapeHtml(device.name)}</span>
        <span class="tile__subtitle">ausgeschaltet</span>
      </span>
    </button>
    <div class="color-picker">
      <canvas
        class="color-picker__wheel"
        width="${WHEEL_SIZE}"
        height="${WHEEL_SIZE}"
        role="img"
        aria-label="${escapeHtml(device.name)}: Farbkreis"
      ></canvas>
      <label class="color-picker__brightness">
        <span class="color-picker__brightness-label">Helligkeit</span>
        <input
          class="color-picker__slider"
          type="range"
          min="0"
          max="100"
          step="1"
          value="85"
          aria-label="${escapeHtml(device.name)} Helligkeit"
        />
      </label>
    </div>
    <span class="tile__status">${escapeHtml(colorStatusLabel(entry))}</span>
  `;

  const canvas = el.querySelector(".color-picker__wheel");
  const slider = el.querySelector(".color-picker__slider");
  const power = el.querySelector("[data-role=power]");

  function refreshColor() {
    drawColorWheel(canvas, color);
    const pct = Math.round(color.v * 100);
    if (Number(slider.value) !== pct) slider.value = String(pct);
    el.dataset.colorR = String(color.r);
    el.dataset.colorG = String(color.g);
    el.dataset.colorB = String(color.b);
    el.dataset.brightness = String(pct);
    el.dataset.on = entry.on ? "1" : "0";
    const status = el.querySelector(".tile__status");
    if (status) status.textContent = colorStatusLabel(entry);
  }

  entry.tile = el;
  entry.refreshColor = refreshColor;

  let dragging = false;
  let debounceTimer = 0;

  function queueColorSend() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      sendColor(device, { turnOn: true });
    }, COLOR_DEBOUNCE_MS);
  }

  power.addEventListener("click", (event) => {
    event.preventDefault();
    toggleDevice(device);
  });

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    canvas.setPointerCapture?.(event.pointerId);
    if (pickColorFromEvent(canvas, event, color)) {
      refreshColor();
      queueColorSend();
    }
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    if (pickColorFromEvent(canvas, event, color)) {
      refreshColor();
      queueColorSend();
    }
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
    window.clearTimeout(debounceTimer);
    sendColor(device, { turnOn: true });
  };

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  slider.addEventListener("input", () => {
    color.v = Number(slider.value) / 100;
    syncRgb(color);
    refreshColor();
    queueColorSend();
  });

  slider.addEventListener("change", () => {
    window.clearTimeout(debounceTimer);
    sendColor(device, { turnOn: color.v > 0 });
  });

  refreshColor();
  updateTileUi(device, entry);
  return el;
}

function renderPage() {
  const grid = document.getElementById("tile-grid");
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  for (const device of DEVICES) {
    fragment.appendChild(
      device.kind === "color"
        ? createColorTile(device)
        : createSwitchTile(device)
    );
  }
  grid.appendChild(fragment);
}

async function syncFromBridge() {
  try {
    const data = await fetchStatus();
    applyStatus(data);
  } catch (err) {
    console.warn("Status nicht geladen:", err);
  }
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
  syncFromBridge();
});
