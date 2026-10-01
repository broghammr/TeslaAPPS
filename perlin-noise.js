(function (global) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function gradientAt(index, seed) {
    let value = Math.imul(index ^ seed, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = (value ^ (value >>> 16)) >>> 0;
    return (value / 0xffffffff) * 2 - 1;
  }

  function noise1D(position, seed = 42) {
    const left = Math.floor(position);
    const fraction = position - left;
    const fade =
      fraction * fraction * fraction *
      (fraction * (fraction * 6 - 15) + 10);
    const leftValue = gradientAt(left, seed) * fraction;
    const rightValue = gradientAt(left + 1, seed) * (fraction - 1);
    return leftValue + (rightValue - leftValue) * fade;
  }

  function createChart({
    width = 900,
    height = 320,
    seed = 42,
    scale = 6,
    samples = 240,
    animate = false,
    speed = 0.45,
    showAxis = true,
  } = {}) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Liniengrafik einer 1D-Perlin-Noise-Funktion");
    svg.classList.add("perlin-chart");

    let axis = null;
    if (showAxis) {
      axis = document.createElementNS(SVG_NS, "line");
      axis.setAttribute("class", "perlin-chart__axis");
      axis.setAttribute("x1", "0");
      axis.setAttribute("x2", String(width));
      axis.setAttribute("y1", String(height / 2));
      axis.setAttribute("y2", String(height / 2));
      svg.appendChild(axis);
    }

    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("class", "perlin-chart__line");
    svg.appendChild(line);

    const point = document.createElementNS(SVG_NS, "circle");
    point.setAttribute("class", "perlin-chart__point");
    point.setAttribute("r", "8");
    svg.appendChild(point);

    let chartWidth = width;
    let chartHeight = height;
    let currentOffset = 0;

    function draw(offset = 0) {
      currentOffset = offset;
      const points = [];
      for (let index = 0; index < samples; index += 1) {
        const progress = index / (samples - 1);
        const x = progress * chartWidth;
        const value = noise1D(progress * scale + offset, seed);
        const y = chartHeight * (0.5 - value * 0.8);
        points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      line.setAttribute("points", points.join(" "));
      const centerValue = noise1D((scale / 2) + offset, seed);
      point.setAttribute("cx", String(chartWidth / 2));
      point.setAttribute("cy", String(chartHeight * (0.5 - centerValue * 0.8)));
    }

    function resizeChart() {
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      chartWidth = bounds.width;
      chartHeight = bounds.height;
      svg.setAttribute("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
      if (axis) {
        axis.setAttribute("x2", String(chartWidth));
        axis.setAttribute("y1", String(chartHeight / 2));
        axis.setAttribute("y2", String(chartHeight / 2));
      }
      draw(currentOffset);
    }

    draw();
    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(resizeChart);
      resizeObserver.observe(svg);
    } else {
      window.addEventListener("resize", resizeChart);
    }

    if (animate) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let animationFrame = 0;
      let startTime = 0;
      let lastDrawTime = 0;

      function stop() {
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
      }

      function frame(timestamp) {
        animationFrame = 0;
        if (document.hidden || reducedMotion.matches) return;
        if (timestamp - lastDrawTime >= 33) {
          if (!startTime) startTime = timestamp;
          draw(((timestamp - startTime) / 1000) * speed);
          lastDrawTime = timestamp;
        }
        animationFrame = window.requestAnimationFrame(frame);
      }

      function updateAnimation() {
        stop();
        startTime = 0;
        lastDrawTime = 0;
        if (!document.hidden && !reducedMotion.matches) {
          animationFrame = window.requestAnimationFrame(frame);
        }
      }

      document.addEventListener("visibilitychange", updateAnimation);
      if (typeof reducedMotion.addEventListener === "function") {
        reducedMotion.addEventListener("change", updateAnimation);
      } else if (typeof reducedMotion.addListener === "function") {
        reducedMotion.addListener(updateAnimation);
      }
      updateAnimation();
    }

    return svg;
  }

  global.TeslaPerlin = Object.freeze({ noise1D, createChart });
})(window);
