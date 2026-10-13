(function () {
  var r = document.documentElement, skin = "pink", mode = "auto";
  try { skin = localStorage.getItem("ft.skin") || skin; mode = localStorage.getItem("ft.mode") || mode; } catch (e) {}
  if (["pink", "vscode", "dbz", "cream", "earth"].indexOf(skin) < 0) skin = "pink";
  var dark = mode === "dark" || (mode !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  r.setAttribute("data-skin", skin);
  r.setAttribute("data-mode", dark ? "dark" : "light");
})();
