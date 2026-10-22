/**
 * Tesla Apps – Thema "Speed"
 * Aktuelle Geschwindigkeit über die Geolocation-API anzeigen.
 * Geschwindigkeit kommt in m/s, wird in km/h umgerechnet.
 */

const SPEED_EL = document.getElementById("speed-value");
const THEME_META = document.getElementById("theme-color-meta");

/** m/s → km/h, eine Nachkommastelle */
function formatSpeedKmh(mps) {
  if (mps === null || mps === undefined || Number.isNaN(mps)) return "– km/h";
  const kmh = mps * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

function updateSpeed(position) {
  if (!SPEED_EL) return;
  const speed = position.coords.speed;
  SPEED_EL.textContent = formatSpeedKmh(speed);
}

function handleError(error) {
  if (!SPEED_EL) return;
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
  SPEED_EL.textContent = message;
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

  navigator.geolocation.watchPosition(updateSpeed, handleError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000,
  });
});
