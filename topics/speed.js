/**
 * Tesla Apps – Thema "Speed"
 * Kacheln: Geschwindigkeit, Kompass mit Höhe und Wetter am GPS-Standort.
 * Geschwindigkeit kommt in m/s, wird in km/h umgerechnet.
 * Kurs (heading) in Grad, 0 = Nord.
 * Höhe über Normalnull in Metern.
 */

const SPEED_NUMBER = document.getElementById("speed-number");
const HEADING_LABEL = document.getElementById("heading-label");
const ALTITUDE_LABEL = document.getElementById("altitude-label");
const COMPASS_ARROW = document.querySelector(".speed-compass__arrow");
const THEME_META = document.getElementById("theme-color-meta");
const WEATHER_TEMPERATURE = document.getElementById("weather-temperature");
const WEATHER_CONDITION = document.getElementById("weather-condition");
const WEATHER_LOCATION = document.getElementById("weather-location");
const WEATHER_REFRESH_INTERVAL = 10 * 60 * 1000;
let lastWeatherRequest;

const HEADINGS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
const WEATHER_CODES = {
  0: "Klar",
  1: "Überwiegend klar",
  2: "Teilweise bewölkt",
  3: "Bedeckt",
  45: "Neblig",
  48: "Nebel mit Reif",
  51: "Leichter Nieselregen",
  53: "Nieselregen",
  55: "Starker Nieselregen",
  56: "Leichter gefrierender Nieselregen",
  57: "Starker gefrierender Nieselregen",
  61: "Leichter Regen",
  63: "Regen",
  65: "Starker Regen",
  66: "Leichter gefrierender Regen",
  67: "Starker gefrierender Regen",
  71: "Leichter Schneefall",
  73: "Schneefall",
  75: "Starker Schneefall",
  77: "Schneegriesel",
  80: "Leichte Regenschauer",
  81: "Regenschauer",
  82: "Starke Regenschauer",
  85: "Leichte Schneeschauer",
  86: "Starke Schneeschauer",
  95: "Gewitter",
  96: "Gewitter mit leichtem Hagel",
  99: "Gewitter mit starkem Hagel",
};

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

/** Meter → ganze Zahl mit m */
function formatAltitude(meters) {
  if (meters === null || meters === undefined || Number.isNaN(meters)) return "–";
  return `${Math.round(meters)} m`;
}

function updatePosition(position) {
  if (SPEED_NUMBER) {
    SPEED_NUMBER.textContent = formatSpeedKmh(position.coords.speed);
  }
  if (HEADING_LABEL) {
    HEADING_LABEL.textContent = formatHeading(position.coords.heading);
  }
  if (ALTITUDE_LABEL) {
    ALTITUDE_LABEL.textContent = formatAltitude(position.coords.altitude);
  }
  if (COMPASS_ARROW && position.coords.heading != null && !Number.isNaN(position.coords.heading)) {
    COMPASS_ARROW.style.transform = `rotate(${position.coords.heading}deg)`;
  }
  loadWeather(position.coords.latitude, position.coords.longitude);
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
  if (ALTITUDE_LABEL) ALTITUDE_LABEL.textContent = "–";
  if (WEATHER_CONDITION) WEATHER_CONDITION.textContent = message;
}

async function loadWeather(latitude, longitude) {
  const now = Date.now();
  if (
    lastWeatherRequest &&
    Math.abs(lastWeatherRequest.latitude - latitude) < 0.02 &&
    Math.abs(lastWeatherRequest.longitude - longitude) < 0.02 &&
    now - lastWeatherRequest.time < WEATHER_REFRESH_INTERVAL
  ) {
    return;
  }
  const request = { latitude, longitude, time: now };
  lastWeatherRequest = request;
  if (WEATHER_CONDITION) WEATHER_CONDITION.textContent = "Wetter wird geladen…";
  if (WEATHER_LOCATION) {
    WEATHER_LOCATION.textContent = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code",
    timezone: "auto",
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (lastWeatherRequest !== request) return;
    const temperature = data.current?.temperature_2m;
    const weatherCode = data.current?.weather_code;
    if (!Number.isFinite(temperature) || !Number.isFinite(weatherCode)) {
      throw new Error("Ungültige Wetterdaten");
    }

    if (WEATHER_TEMPERATURE) {
      WEATHER_TEMPERATURE.textContent = `${Math.round(temperature)} °C`;
    }
    if (WEATHER_CONDITION) {
      WEATHER_CONDITION.textContent = WEATHER_CODES[weatherCode] || "Wetterdaten verfügbar";
    }
  } catch (error) {
    if (lastWeatherRequest !== request) return;
    console.warn("Wetterdaten konnten nicht geladen werden:", error);
    if (WEATHER_CONDITION) WEATHER_CONDITION.textContent = "Wetter nicht verfügbar";
  }
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
    maximumAge: 60000,
  });
});
