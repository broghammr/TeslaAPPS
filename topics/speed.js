/**
 * Tesla Apps – Thema "Speed"
 * Große Geschwindigkeitsanzeige + Kompass mit Fahrtrichtung.
 * Geschwindigkeit kommt in m/s, wird in km/h umgerechnet.
 * Kurs (heading) in Grad, 0 = Nord.
 */

const SPEED_NUMBER = document.getElementById("speed-number");
const HEADING_LABEL = document.getElementById("heading-label");
const COMPASS_ARROW = document.querySelector(".speed-compass__arrow");
const THEME_META = document.getElementById("theme-color-meta");

const HEADINGS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];

/** m/s → km/h, ganze Zahl */
function formatSpeedKmh(mps) {
  if (mps === null || mps === undefined || Number.isNaN(mps)) return "–";
  return String(Math.round(mps * 3.6));
}

/** Grad → Himmelsrichtung (8er-Teilung) */
function formatHeading(degrees) {
  if (degrees === null || degrees === undefined || Number.isNaN(degrees)) return "–";
  const index = Math.round(((degrees % 360) / 45)) % 8;
  return HEADINGS[index];
}

function updatePosition(position) {
  if (SPEED_NUMBER) {
    SPEED_NUMBER.textContent = formatSpeedKmh(position.coords.speed);
  }
  if (HEADING_LABEL) {
    HEADING_LABEL.textContent = formatHeading(position.coords.heading);
  }
  if (COMPASS_ARROW && position.coords.heading != null && !Number.isNaN(position.coords.heading)) {
    COMPASS_ARROW.style.transform = `rotate(${position.coords.heading}deg)`;
  }
}

function handleError(error) {
  let message = "GPS nicht verfügbar";
  switch (error.code) {
    case error.PERMISSION_DENIED:
      message = "Standortzugriff verweigert";
      break;
    case error.POSITION_UNAVAILABLE:
      message = "Position nicht ermittelbar";
      break;
    case error.TIMEOUT:
      message = "Zeitüberschreitung";
      break;
  }
  if (SPEED_NUMBER) SPEED_NUMBER.textContent = message;
  if (HEADING_LABEL) HEADING_LABEL.textContent = "–";
}

function setupDarkMode() {
  if (!window.matchMedia) return;

  const query = window.matchMedia("(prefers-color-scheme: dark)");

  const apply = (isDark) => {
    document.body.classList.toggle("night-mode", isDark);
    if (THEME_META) {
      THEME_META.setAttribute("content", isDark ? "#1a1a1a" : "#f5f5f5");
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
  setupDarkMode();

  if (!navigator.geolocation) {
    handleError({ code: 2 });
    return;
  }

  navigator.geolocation.watchPosition(updatePosition, handleError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000,
  });
});
