(function () {
  "use strict";

  function initializeCanvas(canvas) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const reducedMotionQuery = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };
    const balls = [
      { x: 0.28, y: 0.42, radius: 0.11, speed: 0.74, phase: 0.2 },
      { x: 0.62, y: 0.34, radius: 0.13, speed: 0.61, phase: 1.8 },
      { x: 0.48, y: 0.7, radius: 0.1, speed: 0.86, phase: 3.4 },
      { x: 0.78, y: 0.67, radius: 0.08, speed: 0.54, phase: 5.1 },
      { x: 0.18, y: 0.72, radius: 0.065, speed: 0.92, phase: 4.2 },
    ];
    const accent = { red: 0, green: 112, blue: 243 };
    let width = 0;
    let height = 0;
    let pixels;
    let frameId = 0;
    let lastFrame = 0;
    let animationStart = 0;

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      const resolutionScale = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        520 / Math.max(bounds.width, bounds.height)
      );
      width = Math.max(1, Math.floor(bounds.width * resolutionScale));
      height = Math.max(1, Math.floor(bounds.height * resolutionScale));
      canvas.width = width;
      canvas.height = height;
      pixels = context.createImageData(width, height);
      draw(0);
    }

    function smoothstep(edge0, edge1, value) {
      const normalized = Math.max(
        0,
        Math.min(1, (value - edge0) / (edge1 - edge0))
      );
      return normalized * normalized * (3 - 2 * normalized);
    }

    function draw(time) {
      if (!pixels || !width || !height) return;

      const seconds = time / 1000;
      const image = pixels.data;
      const activeBalls = balls.map((ball) => {
        const movement = reducedMotionQuery.matches
          ? 0
          : seconds * ball.speed + ball.phase;
        return {
          x: ball.x + Math.sin(movement) * 0.13,
          y: ball.y + Math.cos(movement * 0.83) * 0.12,
          radius: ball.radius,
        };
      });

      let pixelIndex = 0;
      for (let y = 0; y < height; y += 1) {
        const normalizedY = y / height;
        for (let x = 0; x < width; x += 1) {
          const normalizedX = x / width;
          let field = 0;
          for (const ball of activeBalls) {
            const distanceX = normalizedX - ball.x;
            const distanceY = (normalizedY - ball.y) * (height / width);
            const distanceSquared =
              distanceX * distanceX + distanceY * distanceY;
            field +=
              (ball.radius * ball.radius) / Math.max(distanceSquared, 0.0001);
          }

          const edge = smoothstep(0.82, 1.12, field);
          const glow = Math.min(1, field * 0.055);
          const intensity = Math.max(edge, glow * 0.65);
          image[pixelIndex] = Math.round(255 - (255 - accent.red) * intensity);
          image[pixelIndex + 1] = Math.round(
            255 - (255 - accent.green) * intensity
          );
          image[pixelIndex + 2] = Math.round(
            255 - (255 - accent.blue) * intensity
          );
          image[pixelIndex + 3] = 255;
          pixelIndex += 4;
        }
      }
      context.putImageData(pixels, 0, 0);
    }

    function animate(timestamp) {
      frameId = 0;
      if (document.hidden || reducedMotionQuery.matches) return;
      if (!animationStart) animationStart = timestamp;
      if (timestamp - lastFrame >= 33) {
        draw(timestamp - animationStart);
        lastFrame = timestamp;
      }
      frameId = window.requestAnimationFrame(animate);
    }

    function updateAnimation() {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      animationStart = 0;
      lastFrame = 0;
      draw(0);
      if (!document.hidden && !reducedMotionQuery.matches) {
        frameId = window.requestAnimationFrame(animate);
      }
    }

    resize();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }
    document.addEventListener("visibilitychange", updateAnimation);
    if (typeof reducedMotionQuery.addEventListener === "function") {
      reducedMotionQuery.addEventListener("change", updateAnimation);
    } else if (typeof reducedMotionQuery.addListener === "function") {
      reducedMotionQuery.addListener(updateAnimation);
    }
    updateAnimation();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document
      .querySelectorAll(".metaballs-canvas")
      .forEach(initializeCanvas);
  });
})();
