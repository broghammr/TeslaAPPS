(function () {
  "use strict";

  function makeSieve(limit) {
    const prime = new Uint8Array(limit + 1);
    prime.fill(1, 2);
    for (let number = 2; number * number <= limit; number += 1) {
      if (!prime[number]) continue;
      for (let multiple = number * number; multiple <= limit; multiple += number) {
        prime[multiple] = 0;
      }
    }
    return prime;
  }

  const startNumber = 0;
  const highlightedPrimeStart = 310;
  const limit = 399;
  const primes = makeSieve(limit);
  const positions = Array(limit + 1);
  const directions = [[1, 0], [0, -1], [-1, 0], [0, 1]];

  function buildSpiral() {
    let x = 0;
    let y = 0;
    let number = 0;
    let runLength = 1;
    let direction = 0;
    positions[number] = [x, y];

    while (number < limit) {
      for (let repeat = 0; repeat < 2 && number < limit; repeat += 1) {
        const [dx, dy] = directions[direction % 4];
        for (let step = 0; step < runLength && number < limit; step += 1) {
          x += dx;
          y += dy;
          number += 1;
          positions[number] = [x, y];
        }
        direction += 1;
      }
      runLength += 1;
    }
  }

  function draw(canvas) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);

    const spacing = Math.min(bounds.width, bounds.height) * 0.9 / 21;
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    const dark = document.body.classList.contains("night-mode");
    const lineColor = dark ? "#555555" : "#b8b8b8";
    const primeColor = dark ? "#777777" : "#0070f3";
    const pointRadius = Math.max(2, spacing * 0.22);

    context.beginPath();
    for (let number = startNumber; number <= limit; number += 1) {
      const [x, y] = positions[number];
      const px = centerX + x * spacing;
      const py = centerY + y * spacing;
      if (number === startNumber) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.strokeStyle = lineColor;
    context.lineWidth = Math.max(1, Math.min(2, spacing * 0.055));
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();

    context.fillStyle = primeColor;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let number = 2; number <= limit; number += 1) {
      if (!primes[number]) continue;
      const [x, y] = positions[number];
      const highlighted = number >= highlightedPrimeStart;
      context.beginPath();
      context.arc(
        centerX + x * spacing,
        centerY + y * spacing,
        highlighted ? spacing * 0.68 : pointRadius,
        0,
        Math.PI * 2
      );
      context.fill();
      if (highlighted) {
        context.fillStyle = "#ffffff";
        context.font = `600 ${Math.max(9, spacing * 0.62)}px system-ui, sans-serif`;
        context.fillText(String(number), centerX + x * spacing, centerY + y * spacing);
        context.fillStyle = primeColor;
      }
    }
  }

  buildSpiral();

  function drawAll() {
    document.querySelectorAll(".ulam-canvas").forEach(draw);
  }

  function initializeAll() {
    document.querySelectorAll(".ulam-canvas").forEach((canvas) => {
      if (typeof ResizeObserver === "function") {
        new ResizeObserver(() => draw(canvas)).observe(canvas);
      }
      draw(canvas);
    });
    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", drawAll);
    }
  }

  const darkMode = window.matchMedia?.("(prefers-color-scheme: dark)");
  function applyTheme(isDark) {
    document.body.classList.toggle("night-mode", isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#111111" : "#ffffff");
    drawAll();
  }
  if (darkMode) {
    applyTheme(darkMode.matches);
    if (darkMode.addEventListener) darkMode.addEventListener("change", (event) => applyTheme(event.matches));
    else darkMode.addListener((event) => applyTheme(event.matches));
  }

  window.TeslaUlam = Object.freeze({ drawAll, initializeAll });
  document.addEventListener("DOMContentLoaded", initializeAll);
})();
