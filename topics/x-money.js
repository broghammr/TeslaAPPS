/**
 * Tesla Apps – Thema "X Money"
 * Smarthome-Test: Lampe "Collage" am Raspberry Pi ein-/ausschalten.
 *
 * Lokal (nur ohne Mixed Content, z.B. Seite auch per HTTP):
 *   POST http://localhost:8080/gpio/set
 *   pin=17&state=1|0
 *
 * Ohne CORS → mode "no-cors" (fire-and-forget), UI-Zustand lokal.
 */

/** Basis-URL des Tunnels (ohne trailing slash), leer = lokaler Server */
const NGROK_TUNNEL_BASE =
  "https://placate-impale-nautical.ngrok-free.dev";

const LAMP = {
  name: "Collage",
  pin: 17,
  /** HTTPS-Tunnel (Pages) oder lokales HTTP im Heimnetz */
  apiUrl: NGROK_TUNNEL_BASE
    ? `${NGROK_TUNNEL_BASE}/gpio/set`
    : "http://localhost:8080/gpio/set",
  icon: "../assets/money.svg",
};

/** true = an, false = aus (lokaler Zustand, da kein Status-Endpoint spezifiziert) */
let lampOn = false;
let busy = false;
/** Letzte Kachel-Referenz für UI-Updates */
let lampTile = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusLabel() {
  if (busy) return "Bitte warten…";
  return lampOn ? "An – tippen zum Ausschalten" : "Aus – tippen zum Einschalten";
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

function updateTileUi(tile) {
  if (!tile) return;
  tile.classList.toggle("tile--lamp-on", lampOn);
  tile.classList.toggle("tile--busy", busy);
  tile.setAttribute("aria-pressed", lampOn ? "true" : "false");
  tile.setAttribute(
    "aria-label",
    `Lampe ${LAMP.name}: ${lampOn ? "an" : "aus"}. Tippen zum Umschalten.`
  );

  const status = tile.querySelector(".tile__status");
  if (status) status.textContent = statusLabel();

  const subtitle = tile.querySelector(".tile__subtitle");
  if (subtitle) {
    subtitle.textContent = lampOn
      ? "Lampe ist eingeschaltet"
      : "Lampe ist ausgeschaltet";
  }
}

/**
 * Schaltet den GPIO am ESP32.
 * mode "no-cors": Request wird gesendet, Response ist opaque (status 0).
 * Ohne no-cors schlägt fetch oft an CORS fehl, obwohl der ESP bereits
 * geschaltet hat → UI blieb auf "Aus", nächster Klick sendete wieder state=1.
 */
async function setLampState(on) {
  const body = new URLSearchParams({
    pin: String(LAMP.pin),
    state: on ? "1" : "0",
  });

  // form-urlencoded ohne custom headers = "simple request", kein Preflight
  await fetch(LAMP.apiUrl, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: body.toString(),
  });
}

async function toggleLamp(tile) {
  if (busy) return;
  lampTile = tile;

  const next = !lampOn;
  busy = true;
  updateTileUi(tile);

  try {
    await setLampState(next);
    // Bei no-cors ist die Antwort immer opaque – Absenden = Erfolg
    lampOn = next;
    announce(
      lampOn
        ? `Lampe ${LAMP.name} ist an.`
        : `Lampe ${LAMP.name} ist aus.`
    );
  } catch (err) {
    // Nur echte Netzwerkfehler (Host unerreichbar etc.)
    console.error("GPIO set failed:", err);
    announce(
      `Lampe ${LAMP.name}: Fehler. ESP32 erreichbar? (Heimnetz / Mixed Content)`
    );
  } finally {
    busy = false;
    updateTileUi(tile);
  }
}

function createLampTile() {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "tile tile--lamp";
  el.setAttribute("role", "listitem");
  el.dataset.topicId = "lamp-bilder";
  el.setAttribute("aria-pressed", "false");

  el.innerHTML = `
    <span class="tile__icon" aria-hidden="true">
      <img
        class="tile__pictogram"
        src="${escapeHtml(LAMP.icon)}"
        alt=""
        width="36"
        height="36"
        decoding="async"
      />
    </span>
    <span class="tile__body">
      <span class="tile__title">${escapeHtml(LAMP.name)}</span>
      <span class="tile__subtitle">Lampe ist ausgeschaltet</span>
    </span>
    <span class="tile__status">Aus – tippen zum Einschalten</span>
  `;

  el.addEventListener("click", () => {
    toggleLamp(el);
  });

  lampTile = el;
  updateTileUi(el);
  return el;
}

function renderPage() {
  const grid = document.getElementById("tile-grid");
  if (!grid) return;
  grid.appendChild(createLampTile());
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
