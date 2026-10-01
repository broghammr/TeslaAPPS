(function () {
  "use strict";

  const viewer = document.querySelector(".test-gallery-viewer");
  const fullscreenFrame = document.querySelector(".test-gallery-fullscreen");
  if (!viewer || !fullscreenFrame) return;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  const darkMode = window.matchMedia?.("(prefers-color-scheme: dark)");
  const applyTheme = (isDark) => {
    document.body.classList.toggle("night-mode", isDark);
    if (themeColor) themeColor.setAttribute("content", isDark ? "#111111" : "#f5f5f5");
  };
  if (darkMode) {
    applyTheme(darkMode.matches);
    if (darkMode.addEventListener) darkMode.addEventListener("change", (event) => applyTheme(event.matches));
    else darkMode.addListener((event) => applyTheme(event.matches));
  }

  const perlinContainer = document.getElementById("test-perlin-chart");
  if (perlinContainer && window.TeslaPerlin) {
    perlinContainer.appendChild(
      window.TeslaPerlin.createChart({
        animate: true,
        height: 260,
        showAxis: false,
      })
    );
  }

  function closeViewer() {
    if (viewer.open) viewer.close();
  }

  document.querySelectorAll(".test-gallery-tile").forEach((tile) => {
    const page = tile.dataset.page;
    const title = tile.dataset.title;
    if (!page || !title) return;

    tile.addEventListener("click", () => {
      fullscreenFrame.title = title;
      fullscreenFrame.src = page;
      viewer.showModal();
    });
  });

  viewer.addEventListener("click", () => {
    closeViewer();
  });
  viewer.addEventListener("close", () => {
    fullscreenFrame.src = "about:blank";
  });
})();
