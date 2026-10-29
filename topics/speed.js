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
const WEATHER_BACKDROP = document.getElementById("weather-backdrop");
const WEATHER_TILE_BACKDROP = document.getElementById("weather-tile-backdrop");
const SPEED_MAP_MARKER = document.getElementById("speed-map-marker");
const SPEED_MAP_MARKER_HALO = document.getElementById("speed-map-marker-halo");
const WEATHER_REFRESH_INTERVAL = 10 * 60 * 1000;
let lastWeatherRequest;

const HEADINGS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
const GERMANY_MAP = { west: 5.8, east: 15.1, north: 55.1, south: 47.2, width: 591.504, height: 800.504 };
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
const WEATHER_ART = {
  clear: '<circle class="weather-sun" cx="200" cy="130" r="42"/><path d="M200 28v24M200 208v24M98 130h24M278 130h24M128 58l17 17M255 185l17 17M272 58l-17 17M145 185l-17 17"/>',
  partlyCloudy: '<circle class="weather-sun" cx="248" cy="83" r="35"/><path d="M248 24v15M248 127v15M189 83h15M292 83h15M207 42l11 11M278 113l11 11M289 42l-11 11"/><path d="M90 196h205a39 39 0 0 0 0-78 58 58 0 0 0-110-12 47 47 0 0 0-95 15 38 38 0 0 0 0 75z"/>',
  cloudy: '<path d="M70 206h245a45 45 0 0 0 0-90 65 65 0 0 0-122-14 52 52 0 0 0-104 16 44 44 0 0 0-19 88z"/>',
  rain: '<path d="M70 174h245a45 45 0 0 0 0-90 65 65 0 0 0-122-14 52 52 0 0 0-104 16 44 44 0 0 0-19 88z"/><path d="m120 211-13 34m72-34-13 34m72-34-13 34m72-34-13 34"/>',
  snow: '<path d="M70 162h245a45 45 0 0 0 0-90 65 65 0 0 0-122-14 52 52 0 0 0-104 16 44 44 0 0 0-19 88z"/><path d="M120 211v34m-15-17h30m-26-11 22 22m0-22-22 22m78-28v34m-15-17h30m-26-11 22 22m0-22-22 22m78-28v34m-15-17h30m-26-11 22 22m0-22-22 22"/>',
  storm: '<path d="M70 164h245a45 45 0 0 0 0-90 65 65 0 0 0-122-14 52 52 0 0 0-104 16 44 44 0 0 0-19 88z"/><path d="m205 173-34 54h34l-12 48 53-68h-37l18-34"/>',
  fog: '<path d="M80 140h240a43 43 0 0 0 0-86 62 62 0 0 0-117-13 50 50 0 0 0-99 15 42 42 0 0 0-24 84zM76 190h248M105 232h190"/>',
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
  updateMapPosition(position.coords.latitude, position.coords.longitude);
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

function updateMapPosition(latitude, longitude) {
  if (!SPEED_MAP_MARKER || !SPEED_MAP_MARKER_HALO) return;
  const x =
    ((longitude - GERMANY_MAP.west) / (GERMANY_MAP.east - GERMANY_MAP.west)) * GERMANY_MAP.width;
  const y =
    ((GERMANY_MAP.north - latitude) / (GERMANY_MAP.north - GERMANY_MAP.south)) * GERMANY_MAP.height;
  const visible =
    longitude >= GERMANY_MAP.west &&
    longitude <= GERMANY_MAP.east &&
    latitude >= GERMANY_MAP.south &&
    latitude <= GERMANY_MAP.north;

  SPEED_MAP_MARKER.setAttribute("cx", String(x));
  SPEED_MAP_MARKER.setAttribute("cy", String(y));
  SPEED_MAP_MARKER_HALO.setAttribute("cx", String(x));
  SPEED_MAP_MARKER_HALO.setAttribute("cy", String(y));
  const visibility = visible ? "visible" : "hidden";
  SPEED_MAP_MARKER.setAttribute("visibility", visibility);
  SPEED_MAP_MARKER_HALO.setAttribute("visibility", visibility);
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
  if (SPEED_MAP_MARKER) SPEED_MAP_MARKER.setAttribute("visibility", "hidden");
  if (SPEED_MAP_MARKER_HALO) SPEED_MAP_MARKER_HALO.setAttribute("visibility", "hidden");
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
      WEATHER_TEMPERATURE.textContent = `${Math.round(temperature)}°C`;
    }
    if (WEATHER_CONDITION) {
      WEATHER_CONDITION.textContent = WEATHER_CODES[weatherCode] || "Wetterdaten verfügbar";
    }
    updateWeatherBackdrop(weatherCode);
  } catch (error) {
    if (lastWeatherRequest !== request) return;
    console.warn("Wetterdaten konnten nicht geladen werden:", error);
    if (WEATHER_CONDITION) WEATHER_CONDITION.textContent = "Wetter nicht verfügbar";
  }
}

function updateWeatherBackdrop(weatherCode) {
  let weatherType = "cloudy";
  if (weatherCode === 0) weatherType = "clear";
  else if (weatherCode === 1 || weatherCode === 2) weatherType = "partlyCloudy";
  else if (weatherCode === 45 || weatherCode === 48) weatherType = "fog";
  else if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) {
    weatherType = "rain";
  } else if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
    weatherType = "snow";
  } else if (weatherCode >= 95 && weatherCode <= 99) {
    weatherType = "storm";
  }
  const artwork = WEATHER_ART[weatherType];
  if (WEATHER_BACKDROP) WEATHER_BACKDROP.innerHTML = artwork;
  if (WEATHER_TILE_BACKDROP) WEATHER_TILE_BACKDROP.innerHTML = artwork;
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
