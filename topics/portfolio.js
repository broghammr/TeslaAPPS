const BINANCE_KLINES_URLS = [
  "https://data-api.binance.vision/api/v3/klines",
  "https://api1.binance.com/api/v3/klines",
  "https://api2.binance.com/api/v3/klines",
  "https://api3.binance.com/api/v3/klines",
];
const HOLDINGS = [
  { symbol: "BTC", amount: 0.457239 },
  { symbol: "ETH", amount: 2.58729 },
  { symbol: "DOGE", amount: 27835.3 },
];
const CHART = {
  width: 900,
  height: 360,
  left: 20,
  right: 20,
  top: 18,
  bottom: 20,
};
const SVG_NS = "http://www.w3.org/2000/svg";

async function loadPortfolio() {
  const errorMessage = document.getElementById("portfolio-error");
  try {
    const history = await loadPortfolioHistory(HOLDINGS);
    renderPortfolio(history);
  } catch (error) {
    console.error("Kryptoportfolio konnte nicht geladen werden:", error);
    errorMessage.textContent = error instanceof Error
      ? error.message
      : "Portfolio konnte nicht geladen werden.";
    errorMessage.hidden = false;
  }
}

async function loadPortfolioHistory(holdings) {
  const now = new Date();
  const endTime = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1;
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  const startTime = startDate.getTime();
  const expectedMonths = 12;

  const assetHistories = await Promise.all(
    holdings.map(async ({ symbol, amount }) => {
      const params = new URLSearchParams({
        symbol: `${symbol}USDT`,
        interval: "1M",
        startTime: String(startTime),
        endTime: String(endTime),
        limit: String(expectedMonths),
      });
      const candles = await fetchMonthlyCandles(params, symbol);
      if (!Array.isArray(candles) || candles.length !== expectedMonths) {
        throw new Error(
          `Für ${symbol}USDT fehlen Monatskurse im vollständigen 12-Monats-Zeitraum.`
        );
      }
      for (let index = 0; index < expectedMonths; index += 1) {
        const expectedTime = Date.UTC(
          startDate.getUTCFullYear(),
          startDate.getUTCMonth() + index,
          1
        );
        if (Number(candles[index][0]) !== expectedTime) {
          throw new Error(
            `Für ${symbol}USDT fehlen Monatskurse im vollständigen 12-Monats-Zeitraum.`
          );
        }
      }

      return candles.map((candle) => ({
        time: Number(candle[0]),
        value: Number(candle[4]) * amount,
      }));
    })
  );

  return assetHistories[0].map((point, index) => ({
    time: point.time,
    value: assetHistories.reduce((total, history) => total + history[index].value, 0),
  }));
}

async function fetchMonthlyCandles(params, symbol) {
  let lastError;

  for (const url of BINANCE_KLINES_URLS) {
    let response;
    try {
      response = await fetch(`${url}?${params}`);
    } catch (error) {
      lastError = error;
      continue;
    }
    if (response.ok) return response.json();
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`Für ${symbol}USDT ist kein Binance-Kurs verfügbar (HTTP ${response.status}).`);
    }
    lastError = new Error(`HTTP ${response.status}`);
  }

  throw new Error(
    `Kursdaten für ${symbol}USDT konnten nicht geladen werden. Bitte Internetverbindung prüfen.`,
    { cause: lastError }
  );
}

function renderPortfolio(history) {
  const first = history[0].value;
  const last = history[history.length - 1].value;
  const change = first === 0 ? Number.NaN : ((last - first) / Math.abs(first)) * 100;

  document.getElementById("portfolio-change").textContent =
    Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} %` : "Nicht verfügbar";
  drawChart(history);
}

function drawChart(history) {
  const svg = document.getElementById("portfolio-chart");
  svg.replaceChildren();

  const values = history.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || Math.max(Math.abs(maxValue) * 0.1, 1);
  const min = minValue - spread * 0.12;
  const max = maxValue + spread * 0.12;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (index) => CHART.left + (plotWidth * index) / (history.length - 1);
  const y = (value) => CHART.top + ((max - value) / (max - min)) * plotHeight;

  for (let tick = 0; tick <= 4; tick += 1) {
    const tickY = CHART.top + (plotHeight * tick) / 4;
    svg.appendChild(svgElement("line", {
      x1: CHART.left,
      x2: CHART.width - CHART.right,
      y1: tickY,
      y2: tickY,
      class: "portfolio-chart__grid",
    }));
  }

  const line = history
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.value)}`)
    .join(" ");
  svg.appendChild(svgElement("path", { d: line, class: "portfolio-chart__line" }));

  history.forEach((point, index) => {
    const circle = svgElement("circle", {
      cx: x(index),
      cy: y(point.value),
      r: 5,
      class: "portfolio-chart__point",
    });
    const title = svgElement("title");
    title.textContent = `${formatMonth(point.time)}: ${formatCurrency(point.value)}`;
    circle.appendChild(title);
    svg.appendChild(circle);
  });
}

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMonth(timestamp) {
  return new Intl.DateTimeFormat("de-DE", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

document.addEventListener("DOMContentLoaded", loadPortfolio);

const themeMeta = document.getElementById("theme-color-meta");
if (window.matchMedia) {
  const darkMode = window.matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = (isDark) => {
    document.body.classList.toggle("night-mode", isDark);
    themeMeta.setAttribute("content", isDark ? "#111111" : "#f5f5f5");
  };

  applyTheme(darkMode.matches);
  if (typeof darkMode.addEventListener === "function") {
    darkMode.addEventListener("change", (event) => applyTheme(event.matches));
  } else if (typeof darkMode.addListener === "function") {
    darkMode.addListener((event) => applyTheme(event.matches));
  }
}
