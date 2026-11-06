/* SHOW ME WHERE: a link such as /?spot=ra-rc-tog&tip=Switch%20this%20on takes the reader to that control, rings it and puts a speech
   bubble beside it. What's new links use it ("clicking a new item, could it take me to the exact object? and flag it with a speech bubble").

   Loaded on every page as a classic deferred script and does nothing unless the address has ?spot=. The element is found by id or by
   data-spot; the bubble text is set with textContent (never as HTML), so a link cannot inject markup; ids are held to a plain
   pattern. The map and menus build late, so it looks for up to eight seconds. A closed menu that holds the element is opened. */
(function () {
  "use strict";
  var q = new URLSearchParams(location.search), id = q.get("spot"), tip = (q.get("tip") || "").slice(0, 160);
  if (!id || !/^[A-Za-z0-9_-]{1,60}$/.test(id)) return;
  var tries = 0, ring, bub, target;

  function find() { return document.getElementById(id) || document.querySelector('[data-spot="' + id + '"]'); }
  function cleanUrl() {
    try { var u = new URL(location.href); u.searchParams.delete("spot"); u.searchParams.delete("tip"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch (e) { /* leave the address */ }
  }
  function gone() {
    if (ring) ring.remove(); if (bub) bub.remove(); ring = bub = null;
    window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") gone(); }
  function place() {
    if (!target || !ring) return;
    var r = target.getBoundingClientRect(), sx = window.scrollX, sy = window.scrollY, pad = 4;
    ring.style.cssText = "left:" + (r.left + sx - pad) + "px;top:" + (r.top + sy - pad) + "px;width:" + (r.width + pad * 2) + "px;height:" + (r.height + pad * 2) + "px";
    if (!bub) return;
    var bw = bub.offsetWidth, bh = bub.offsetHeight, vw = document.documentElement.clientWidth, below = r.bottom + 14 + bh < window.innerHeight || r.top < bh + 20;
    var left = Math.max(10, Math.min(vw - bw - 10, r.left + r.width / 2 - bw / 2));
    bub.style.left = (left + sx) + "px";
    bub.style.top = (below ? r.bottom + 14 + sy : r.top - bh - 14 + sy) + "px";
    bub.classList.toggle("up", !below);
    bub.style.setProperty("--ax", Math.max(16, Math.min(bw - 16, r.left + r.width / 2 - left)) + "px");
  }
  function show() {
    cleanUrl();
    /* open any closed menu or disclosure that holds it */
    for (var d = target.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
    target.scrollIntoView({ block: "center", inline: "nearest" });
    ring = document.createElement("div"); ring.className = "ra-spot-ring"; document.body.appendChild(ring);
    if (tip) {
      bub = document.createElement("div"); bub.className = "ra-spot"; bub.setAttribute("role", "status");
      var t = document.createElement("span"); t.textContent = tip;
      var x = document.createElement("button"); x.type = "button"; x.setAttribute("aria-label", "Dismiss"); x.textContent = "×"; x.addEventListener("click", gone);
      bub.appendChild(t); bub.appendChild(x); document.body.appendChild(bub);
    }
    place(); setTimeout(place, 250); setTimeout(place, 900);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey);
  }
  (function look() {
    target = find();
    if (target && target.getBoundingClientRect().width) return show();
    if (++tries < 40) setTimeout(look, 200);
  })();
})();
