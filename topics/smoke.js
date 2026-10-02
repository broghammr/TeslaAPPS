(function () {
  "use strict";

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)") || {
    matches: false,
  };

  function initializeCanvas(canvas) {
    const context = canvas.getContext("2d");
    if (!context) return;

    const particles = [];
    const lifetime = 7.5;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let frameId = 0;
    let lastFrame = 0;
    let emission = 0;
    let elapsed = 0;

    function createParticle(age = 0) {
      particles.push({
        age,
        life: lifetime * (0.82 + Math.random() * 0.36),
        offset: (Math.random() - 0.5) * 0.1,
        drift: (Math.random() - 0.5) * 0.16,
        phase: Math.random() * Math.PI * 2,
        size: 0.035 + Math.random() * 0.04,
        rotation: (Math.random() - 0.5) * 0.8,
      });
    }

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      width = bounds.width;
      height = bounds.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw();
    }

    function drawParticle(particle) {
      const progress = particle.age / particle.life;
      const rise = Math.min(1, progress * 1.12);
      const scale = Math.min(width, height);
      const x = width * (0.5 + particle.offset + particle.drift * progress +
        Math.sin(elapsed * 0.48 + particle.phase + progress * 3) * 0.045);
      const y = height * (1.02 - rise * 0.9);
      const radius = scale * (particle.size + progress * 0.19);
      const fadeIn = Math.min(1, progress * 5);
      const fadeOut = Math.min(1, (1 - progress) * 3.2);
      const alpha = fadeIn * fadeOut * (0.07 + particle.size * 0.75);
      const color = "0, 112, 243";

      context.save();
      context.translate(x, y);
      context.rotate(particle.rotation + Math.sin(elapsed * 0.25 + particle.phase) * 0.18);
      context.scale(1.45, 0.82);
      const cloud = context.createRadialGradient(0, 0, radius * 0.04, 0, 0, radius);
      cloud.addColorStop(0, `rgba(${color}, ${alpha * 0.85})`);
      cloud.addColorStop(0.38, `rgba(${color}, ${alpha * 0.7})`);
      cloud.addColorStop(0.72, `rgba(${color}, ${alpha * 0.28})`);
      cloud.addColorStop(1, `rgba(${color}, 0)`);

      context.fillStyle = cloud;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    function draw() {
      if (!width || !height) return;
      context.clearRect(0, 0, width, height);
      particles.forEach(drawParticle);
    }

    function animate(timestamp) {
      frameId = 0;
      if (document.hidden || reducedMotion.matches) return;
      if (lastFrame && timestamp - lastFrame < 33) {
        frameId = window.requestAnimationFrame(animate);
        return;
      }
      const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.05) : 0;
      lastFrame = timestamp;
      elapsed += delta;
      emission += delta * 17;
      while (emission >= 1) {
        createParticle();
        emission -= 1;
      }
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        particles[index].age += delta;
        if (particles[index].age >= particles[index].life) particles.splice(index, 1);
      }
      draw();
      frameId = window.requestAnimationFrame(animate);
    }

    function updateAnimation() {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = 0;
      if (reducedMotion.matches) {
        while (particles.length < 90) createParticle(Math.random() * lifetime);
        draw();
      } else if (!document.hidden) {
        frameId = window.requestAnimationFrame(animate);
      }
    }

    for (let index = 0; index < 90; index += 1) {
      createParticle(Math.random() * lifetime);
    }
    resize();
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(resize).observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }
    document.addEventListener("visibilitychange", updateAnimation);
    canvas.redrawSmoke = draw;
    if (typeof reducedMotion.addEventListener === "function") {
      reducedMotion.addEventListener("change", updateAnimation);
    } else if (typeof reducedMotion.addListener === "function") {
      reducedMotion.addListener(updateAnimation);
    }
    updateAnimation();
  }

  function initializeAll() {
    document.querySelectorAll(".smoke-canvas").forEach(initializeCanvas);
  }

  const darkMode = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (darkMode) {
    const applyTheme = (isDark) => {
      document.body.classList.toggle("night-mode", isDark);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", isDark ? "#111111" : "#ffffff");
      document.querySelectorAll(".smoke-canvas").forEach((canvas) => {
        canvas.redrawSmoke?.();
      });
    };
    applyTheme(darkMode.matches);
    if (darkMode.addEventListener) {
      darkMode.addEventListener("change", (event) => applyTheme(event.matches));
    } else {
      darkMode.addListener((event) => applyTheme(event.matches));
    }
  }

  document.addEventListener("DOMContentLoaded", initializeAll);
})();
