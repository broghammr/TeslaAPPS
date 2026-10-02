/**
 * Tesla Apps – Main Hub
 * Kacheln: Piktogramm, Überschrift, Unterüberschrift, Statuszeile.
 * Optimiert für Lesbarkeit im Tesla-Browser.
 */

/** SVG-Icons aus assets/ */
const ICONS = {
  helloWorld: "assets/code.svg",
  light: "assets/light.svg",
  monitor: "assets/monitor.svg",
};

const NGROK_TUNNEL_BASE = "https://placate-impale-nautical.ngrok-free.dev";
const API_TEMP = `${NGROK_TUNNEL_BASE}/temp`;
const API_HEADERS = { "ngrok-skip-browser-warning": "1" };

const TOPICS = [
  {
    id: "hello-world",
    title: "Hello World",
    subtitle: "Unsere Roadtrips...",
    icon: ICONS.helloWorld,
    href: "topics/hello-world.html",
    ready: true,
    status: "Öffnen",
  },
  {
    id: "light",
    title: "Light",
    subtitle: "Beleuchtung im Auto steuern",
    icon: ICONS.light,
    href: "topics/light.html",
    highlightImage: "assets/optimus_seat.png",
    ready: true,
    status: "Öffnen",
  },
  {
    id: "monitor",
    title: "Monitor",
    subtitle: "Temperatur des Raspberry Pi",
    icon: ICONS.monitor,
    kind: "monitor",
    ready: true,
    status: "Wird geladen…",
  },
  {
    id: "chibi",
    kind: "chibi",
    image: "assets/chibi.jpg",
    imageAlt: "broghammr's Labor öffnen",
    href: "topics/labor.html",
    ready: true,
  },
];

function createTile(topic) {
  const isImageTile = Boolean(topic.image);
  const isMonitor = topic.kind === "monitor";
  const isLight = topic.id === "light";
  const isPerlin = topic.kind === "perlin";
  const isMetaballs = topic.kind === "metaballs";
  const isChibi = topic.kind === "chibi";
  const isLink = Boolean(topic.ready && topic.href && !isMonitor);
  const el = document.createElement(
    isLink ? "a" : isPerlin || isMetaballs ? "div" : "button"
  );
  el.className =
    "tile" +
    (!topic.ready && !isImageTile ? " tile--soon" : "") +
    (isImageTile ? " tile--image" : "") +
    (isLight ? " tile--smoke-background" : "") +
    (isMonitor ? " tile--monitor" : "") +
    (isPerlin ? " tile--perlin" : "") +
    (isMetaballs ? " tile--metaballs-preview" : "") +
    (isChibi ? " tile--chibi" : "") +
    (topic.highlightImage ? " tile--has-highlight" : "");
  el.setAttribute("role", "listitem");
  el.dataset.topicId = topic.id;

  if (isLink) {
    el.href = topic.href;
  } else if (!isPerlin && !isMetaballs) {
    el.type = "button";
    if (isChibi) {
      el.title = topic.imageAlt || "Chibi";
      el.setAttribute("aria-label", topic.imageAlt || "Chibi: Startanimation starten");
    } else if (isImageTile) {
      el.title = topic.imageAlt || "Bild";
      el.setAttribute("aria-label", topic.imageAlt || "Bild");
    } else if (isMonitor) {
      el.setAttribute("aria-label", `${topic.title}: Temperatur wird geladen`);
    } else {
      el.setAttribute("aria-disabled", "true");
      const statusText =
        topic.status || (topic.ready ? "Bereit" : "Bald verfügbar");
      el.title = `${topic.title} – ${statusText}`;
    }
  }

  if (isImageTile) {
    el.innerHTML = `
      <img
        class="tile__image"
        src="${escapeHtml(topic.image)}"
        alt="${escapeHtml(topic.imageAlt || "")}"
        loading="lazy"
        decoding="async"
      />
    `;
  } else {
    const statusText =
      topic.status || (topic.ready ? "Bereit" : "Bald verfügbar");
    const iconSrc = escapeHtml(topic.icon);
    el.innerHTML = `
      ${
        isPerlin || isMetaballs
          ? ""
          : `<span class="tile__icon" aria-hidden="true">
        <img
          class="tile__pictogram"
          src="${iconSrc}"
          alt=""
          width="36"
          height="36"
          decoding="async"
        />
      </span>
      <span class="tile__body">
        <span class="tile__title">${escapeHtml(topic.title)}</span>
        <span class="tile__subtitle">${escapeHtml(topic.subtitle)}</span>
      </span>
      <span class="tile__status">${escapeHtml(statusText)}</span>`
      }
    `;
    if (isLight) {
      const smokeCanvas = document.createElement("canvas");
      smokeCanvas.className = "smoke-canvas smoke-canvas--light-tile";
      smokeCanvas.setAttribute("aria-hidden", "true");
      el.prepend(smokeCanvas);
    }
    if (isPerlin) {
      const preview = document.createElement("figure");
      preview.className = "tile__preview";
      preview.setAttribute("aria-hidden", "true");
      preview.appendChild(
        window.TeslaPerlin.createChart({ animate: true, height: 420 })
      );
      el.appendChild(preview);
    }
    if (isMonitor) {
      const preview = document.createElement("figure");
      preview.className = "tile__preview tile__preview--monitor";
      preview.setAttribute("aria-hidden", "true");
      preview.appendChild(
        window.TeslaPerlin.createChart({
          animate: true,
          height: 420,
          showAxis: false,
        })
      );
      el.appendChild(preview);
    }
    if (isMetaballs) {
      const canvas = document.createElement("canvas");
      canvas.className = "metaballs-canvas";
      canvas.setAttribute("aria-label", "Animierte blaue Metaballs");
      el.appendChild(canvas);
    }
    if (topic.highlightImage) {
      el.insertAdjacentHTML(
        "beforeend",
        `<img
          class="tile__highlight"
          src="${escapeHtml(topic.highlightImage)}"
          alt=""
          loading="lazy"
          decoding="async"
        />`
      );
    }
  }

  if (isMonitor) {
    el.addEventListener("click", () => {
      refreshMonitorTile(el, { announceResult: true });
    });
    refreshMonitorTile(el);
  } else if (!topic.ready && !isImageTile) {
    el.addEventListener("click", () => {
      announce(`${topic.title} ist noch nicht freigeschaltet.`);
    });
  }

  return el;
}

function formatCelsius(value) {
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} °C`;
}

async function fetchCpuTemp() {
  const res = await fetch(API_TEMP, {
    method: "GET",
    mode: "cors",
    headers: API_HEADERS,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data.celsius !== "number") throw new Error("invalid temp");
  return data.celsius;
}

async function refreshMonitorTile(tile, { announceResult = false } = {}) {
  const status = tile.querySelector(".tile__status");
  if (status) status.textContent = "Wird geladen…";

  try {
    const celsius = await fetchCpuTemp();
    const label = formatCelsius(celsius);
    if (status) status.textContent = label;
    tile.setAttribute("aria-label", `Monitor: ${label}`);
    tile.classList.remove("tile--soon");
    if (announceResult) announce(`Raspberry Pi: ${label}`);
  } catch (err) {
    console.warn("Temperatur nicht geladen:", err);
    if (status) status.textContent = "Nicht erreichbar";
    tile.setAttribute(
      "aria-label",
      "Monitor: Temperatur nicht erreichbar. Tippen zum erneuten Laden."
    );
    if (announceResult) announce("Temperatur nicht erreichbar.");
  }
}

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

function setupDarkMode() {
  const themeMeta = document.getElementById("theme-color-meta");
  if (!window.matchMedia) return;

  const query = window.matchMedia("(prefers-color-scheme: dark)");

  const apply = (isDark) => {
    document.body.classList.toggle("night-mode", isDark);
    if (themeMeta) {
      themeMeta.setAttribute("content", isDark ? "#111111" : "#f5f5f5");
    }
  };

  apply(query.matches);

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", (event) => apply(event.matches));
  } else if (typeof query.addListener === "function") {
    query.addListener((event) => apply(event.matches));
  }
}

function renderHub() {
  const grid = document.getElementById("tile-grid");
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  for (const topic of TOPICS) {
    fragment.appendChild(createTile(topic));
  }
  grid.appendChild(fragment);
}

/**
 * Tesla-Nachtmodus: Browser meldet prefers-color-scheme: dark.
 * Dann erscheint oben rechts der Mond-Indikator.
 */
document.addEventListener("DOMContentLoaded", () => {
  setupDarkMode();
  renderHub();
});
