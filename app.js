/**
 * Tesla Apps – Main Hub
 * Kacheln: Icon, Überschrift, Unterüberschrift, Statuszeile.
 * Optimiert für Lesbarkeit im Tesla-Browser.
 */

const TOPICS = [
  {
    id: "hello-world",
    title: "Hello World",
    subtitle: "Erste App – Willkommen & Schnelltest",
    icon: "HW",
    href: "topics/hello-world.html",
    ready: false,
    status: "Bald verfügbar",
  },
  {
    id: "fc-bayern",
    title: "FC Bayern München",
    subtitle: "News, Ergebnisse und Fakten zum FCB",
    icon: "FCB",
    href: "topics/fc-bayern.html",
    ready: false,
    status: "Bald verfügbar",
  },
  {
    id: "tesla",
    title: "Tesla",
    subtitle: "Fahrzeug, Updates und nützliche Infos",
    icon: "T",
    href: "topics/tesla.html",
    ready: false,
    status: "Bald verfügbar",
  },
  {
    id: "spacex",
    title: "SpaceX",
    subtitle: "Starts, Missionen und Spaceflight",
    icon: "X",
    href: "topics/spacex.html",
    ready: false,
    status: "Bald verfügbar",
  },
  {
    id: "x-money",
    title: "X Money",
    subtitle: "Zahlungen und Finanzen rund um X",
    icon: "$",
    href: "topics/x-money.html",
    ready: false,
    status: "Bald verfügbar",
  },
];

function createTile(topic) {
  const el = document.createElement(topic.ready ? "a" : "button");
  el.className = "tile" + (topic.ready ? "" : " tile--soon");
  el.setAttribute("role", "listitem");
  el.dataset.topicId = topic.id;

  const statusText = topic.status || (topic.ready ? "Bereit" : "Bald verfügbar");

  if (topic.ready) {
    el.href = topic.href;
  } else {
    el.type = "button";
    el.setAttribute("aria-disabled", "true");
    el.title = `${topic.title} – ${statusText}`;
  }

  el.innerHTML = `
    <span class="tile__icon" aria-hidden="true">${escapeHtml(topic.icon)}</span>
    <span class="tile__body">
      <span class="tile__title">${escapeHtml(topic.title)}</span>
      <span class="tile__subtitle">${escapeHtml(topic.subtitle)}</span>
    </span>
    <span class="tile__status">${escapeHtml(statusText)}</span>
  `;

  if (!topic.ready) {
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
