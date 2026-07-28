/**
 * Tesla Apps – Main Hub
 * Topics as large tiles; designed for in-car browser readability.
 */

const TOPICS = [
  {
    id: "hello-world",
    title: "Hello World",
    description: "Erste App – Willkommen & Schnelltest",
    icon: "HW",
    href: "topics/hello-world.html",
    ready: false,
  },
  {
    id: "fc-bayern",
    title: "FC Bayern München",
    description: "News, Ergebnisse und Fakten zum FCB",
    icon: "FCB",
    href: "topics/fc-bayern.html",
    ready: false,
  },
  {
    id: "tesla",
    title: "Tesla",
    description: "Fahrzeug, Updates und nützliche Infos",
    icon: "T",
    href: "topics/tesla.html",
    ready: false,
  },
  {
    id: "spacex",
    title: "SpaceX",
    description: "Starts, Missionen und Spaceflight",
    icon: "X",
    href: "topics/spacex.html",
    ready: false,
  },
  {
    id: "x-money",
    title: "X Money",
    description: "Zahlungen und Finanzen rund um X",
    icon: "$",
    href: "topics/x-money.html",
    ready: false,
  },
];

function createTile(topic) {
  const el = document.createElement(topic.ready ? "a" : "button");
  el.className = "tile" + (topic.ready ? "" : " tile--soon");
  el.setAttribute("role", "listitem");
  el.dataset.topicId = topic.id;

  if (topic.ready) {
    el.href = topic.href;
  } else {
    el.type = "button";
    el.setAttribute("aria-disabled", "true");
    el.title = `${topic.title} – bald verfügbar`;
  }

  el.innerHTML = `
    <span class="tile__icon" aria-hidden="true">${escapeHtml(topic.icon)}</span>
    <span class="tile__body">
      <span class="tile__title">${escapeHtml(topic.title)}</span>
      <span class="tile__desc">${escapeHtml(topic.description)}</span>
      ${
        topic.ready
          ? `<span class="tile__cta">Öffnen <span class="tile__cta-arrow" aria-hidden="true">→</span></span>`
          : `<span class="tile__badge">Bald verfügbar</span>`
      }
    </span>
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
    live.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;";
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
