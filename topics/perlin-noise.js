const chart = document.getElementById("perlin-chart");
chart.appendChild(window.TeslaPerlin.createChart({ animate: true }));

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
