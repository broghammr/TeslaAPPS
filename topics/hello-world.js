/**
 * Tesla Apps – Thema "Hello World"
 * Roadtrips als Bild-Kacheln mit halbtransparenter Fußzeile.
 * Dateiname: hw_YYYYMM_Veranstaltung_Ort.jpg
 * Fußzeile: "Mai 2026 - FSD, Amsterdam"
 */

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** Roadtrip-Bilder unter assets/ (Präfix hw_) */
const ROADTRIP_FILES = [
  "hw_202606_Tesla+Takeover_Salzburg.jpg",
  "hw_202605_FSD_Amsterdam.jpg",
  "hw_202603_Toto+Cup_Regensburg.jpg",
  "hw_202603_Herr+Schröder_Saarbrücken.jpg",
  "hw_202512_Optimus_Berlin.jpg",
  "hw_202507_Chris+de+Burgh_Ingolstadt.jpg",
  "hw_202504_Nationales+Automuseum_Ewersbach.jpg",
  "hw_202503_HCOB_Hamburg.jpg",
  "hw_202408_Ravensburg_Tettnang.jpg",
  "hw_202407_Peter+Maffay_Berlin.jpg",
  "hw_202405_Tesla+Takeover_Salzburg.jpg",
  "hw_202404_b'mine_Düsseldorf.jpg",
  "hw_202403_JP+Performance_Dortmund.jpg",
  "hw_202401_Wintertour_Leipzig.jpg",
];

const CHIBI_IMAGE = "../assets/chibi.jpg";

/**
 * Parst hw_YYYYMM_Event_Ort.ext → { dateKey, caption, image, imageAlt }
 */
function parseRoadtripFilename(filename) {
  const match = String(filename).match(
    /^hw_(\d{4})(\d{2})_(.+)\.(jpe?g|png|webp)$/i
  );
  if (!match) return null;

  const year = match[1];
  const monthNum = Number(match[2]);
  if (monthNum < 1 || monthNum > 12) return null;

  const rest = match[3];
  const lastUnderscore = rest.lastIndexOf("_");
  if (lastUnderscore <= 0 || lastUnderscore === rest.length - 1) return null;

  const eventRaw = rest.slice(0, lastUnderscore);
  const placeRaw = rest.slice(lastUnderscore + 1);
  const event = decodeFilenamePart(eventRaw);
  const place = decodeFilenamePart(placeRaw);
  const monthName = MONTHS_DE[monthNum - 1];
  const caption = `${monthName} ${year} - ${event}, ${place}`;

  return {
    id: `roadtrip-${year}${match[2]}-${eventRaw}-${placeRaw}`,
    dateKey: `${year}${match[2]}`,
    caption,
    image: `../assets/${filename}`,
    imageAlt: caption,
  };
}

/** + und URL-Encoding im Dateinamen → lesbarer Text */
function decodeFilenamePart(part) {
  return String(part)
    .replace(/\+/g, " ")
    .replace(/%20/gi, " ")
    .trim();
}

function buildRoadtrips() {
  return ROADTRIP_FILES.map(parseRoadtripFilename)
    .filter(Boolean)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createPhotoTile(item) {
  const el = document.createElement("div");
  el.className = "tile tile--photo";
  el.setAttribute("role", "listitem");
  el.dataset.topicId = item.id;

  el.innerHTML = `
    <img
      class="tile__image"
      src="${escapeHtml(item.image)}"
      alt="${escapeHtml(item.imageAlt || item.caption || "")}"
      loading="lazy"
      decoding="async"
    />
    <p class="tile__photo-footer">${escapeHtml(item.caption)}</p>
  `;

  return el;
}

function createImageOnlyTile(src, alt, id) {
  const el = document.createElement("div");
  el.className = "tile tile--image";
  el.setAttribute("role", "listitem");
  el.dataset.topicId = id;
  el.setAttribute("aria-label", alt);

  el.innerHTML = `
    <img
      class="tile__image"
      src="${escapeHtml(src)}"
      alt="${escapeHtml(alt)}"
      loading="lazy"
      decoding="async"
    />
  `;

  return el;
}

function renderRoadtrips() {
  const grid = document.getElementById("tile-grid");
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  for (const trip of buildRoadtrips()) {
    fragment.appendChild(createPhotoTile(trip));
  }
  // Letzte Kachel: Chibi vollflächig
  fragment.appendChild(
    createImageOnlyTile(CHIBI_IMAGE, "Chibi", "chibi")
  );
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
  renderRoadtrips();
});
