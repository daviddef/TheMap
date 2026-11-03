/* The site menu's button and dropdowns, as a file: the Roots & Routes page forbids inline scripts, so it cannot use the inline copy that Base.astro carries.
   Same behaviour as that copy: the burger opens the drawer, one dropdown open at a time, Escape and an outside click close them. */
(function () {
  var bar = document.querySelector(".topnav"), burger = document.querySelector(".burger"), drawer = document.getElementById("drawer");
  if (burger && drawer) burger.addEventListener("click", function () {
    var open = drawer.hasAttribute("hidden");
    if (open) drawer.removeAttribute("hidden"); else drawer.setAttribute("hidden", "");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });
  if (!bar) return;
  var menus = [].slice.call(bar.querySelectorAll("details.menu"));
  menus.forEach(function (d) { d.addEventListener("toggle", function () { if (d.open) menus.forEach(function (o) { if (o !== d) o.open = false; }); }); });
  document.addEventListener("click", function (e) { if (!(e.target.closest && e.target.closest(".topnav"))) menus.forEach(function (d) { d.open = false; }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") menus.forEach(function (d) { d.open = false; }); });
})();
