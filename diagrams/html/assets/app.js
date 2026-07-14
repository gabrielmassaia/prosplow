(function () {
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }
  function applyStoredTheme() {
    // Dark é o padrão fixo destas páginas — só muda se o usuário clicar no toggle.
    var stored = localStorage.getItem("diagrams-theme");
    var theme = stored || "dark";
    document.documentElement.setAttribute("data-theme", theme);
  }
  applyStoredTheme();

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("theme-toggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = currentTheme() === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("diagrams-theme", next);
      });
    }
  });
})();
