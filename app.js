/**
 * Tesla Apps – Main Hub
 * Kacheln: Piktogramm, Überschrift, Unterüberschrift, Statuszeile.
 * Optimiert für Lesbarkeit im Tesla-Browser.
 */

/** SVG-Icons aus assets/ */
const ICONS = {
  helloWorld: "assets/code.svg",
  football: "assets/fcb.svg",
  car: "assets/tesla.svg",
  rocket: "assets/rocket.svg",
  money: "assets/money.svg",
};

const TOPICS = [
  {
    id: "hello-world",
    title: "Hello World",
    subtitle: "Erste App – Willkommen & Schnelltest",
    icon: ICONS.helloWorld,
    href: "topics/hello-world.html",
    ready: false,
    status: "Bald verfügbar",
  },
  {
    id: "fc-bayern",
    title: "FC Bayern München",
    subtitle: "News, Ergebnisse und Fakten zum FCB",
    icon: ICONS.football,
    href: "topics/fc-bayern.html",
    ready: false,
    status: "Bald verfügbar",
  },
  {
    id: "tesla",
    title: "Tesla",
    subtitle: "Fahrzeug, Updates und nützliche Infos",
    icon: ICONS.car,
    href: "topics/tesla.html",
    ready: false,
    status: "Bald verfügbar",
  },
  {
    id: "spacex",
    title: "SpaceX",
    subtitle: "Starts, Missionen und Spaceflight",
    icon: ICONS.rocket,
    href: "topics/spacex.html",
    ready: false,
    status: "Bald verfügbar",
  },
  {
    id: "x-money",
    title: "X Money",
    subtitle: "Zahlungen und Finanzen rund um X",
    icon: ICONS.money,
    href: "topics/x-money.html",
    ready: false,
    status: "Bald verfügbar",
  },
  {
    id: "chibi",
    /** Bild-Kachel: nur Vollformat-Bild, ohne Icon/Titel/Status */
    image: "assets/chibi.jpg",
    imageAlt: "Chibi",
    ready: false,
  },
];

function createTile(topic) {
  const isImageTile = Boolean(topic.image);
  const el = document.createElement(topic.ready ? "a" : "button");
  el.className =
    "tile" +
    (!topic.ready && !isImageTile ? " tile--soon" : "") +
    (isImageTile ? " tile--image" : "");
  el.setAttribute("role", "listitem");
  el.dataset.topicId = topic.id;

  if (topic.ready) {
    el.href = topic.href;
  } else {
    el.type = "button";
    if (isImageTile) {
      el.title = topic.imageAlt || "Bild";
      el.setAttribute("aria-label", topic.imageAlt || "Bild");
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
      <span class="tile__icon" aria-hidden="true">
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
      <span class="tile__status">${escapeHtml(statusText)}</span>
    `;
  }

  if (!topic.ready && !isImageTile) {
    el.addEventListener("click", () => {
      announce(`${topic.title} ist noch nicht freigeschaltet.`);
    });
  }

  return el;
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

function renderHub() {
  const grid = document.getElementById("tile-grid");
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  for (const topic of TOPICS) {
    fragment.appendChild(createTile(topic));
  }
  grid.appendChild(fragment);
}

document.addEventListener("DOMContentLoaded", renderHub);
