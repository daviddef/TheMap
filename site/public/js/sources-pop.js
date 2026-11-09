/* THE SOURCES BUTTON, top right of every page: a round icon beside Read and the light/dark toggle that opens a search box over
 * the whole directory of archives, libraries, indexes and portals. David: «a source button to the top right that pops up the smart
 * search box».
 *
 * The directory (providers.json, the file the /providers/ page already uses) is fetched the first time the box opens, never on
 * page load, so 46,000 pages do not each pay for it. Matching is sources-search.js. Enter, or "See all", carries the words to the
 * full page (/providers/?q=…), where the country and cost filters are. In the burger drawer it is a text row instead of an icon. */
(function () {
  "use strict";
  var root = document.documentElement;
  var base = (root.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M14.6 14.6 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var TIP = "Sources: search every archive, library and portal";
  var box = null, input, list, more, opener = null, index = null, loading = false, S = null;

  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  function ensureLib(done) {
    if (window.SourcesSearch) { S = window.SourcesSearch; return done(); }
    var s = document.createElement("script"); s.src = base + "js/sources-search.js";
    s.onload = function () { S = window.SourcesSearch; done(); };
    s.onerror = function () { say("The search could not load. Try the full list.", true); };
    document.head.appendChild(s);
  }
  function load() {
    if (index || loading) return;
    loading = true; say("Loading the sources…");
    ensureLib(function () {
      fetch(base + "providers.json").then(function (r) { return r.json(); }).then(function (j) {
        index = S.build(j.providers); loading = false; render();
      }).catch(function () { loading = false; say("The directory could not load just now. The full list works without it.", true); });
    });
  }
  function say(t, bad) { if (list) list.innerHTML = '<li class="sp-msg' + (bad ? " bad" : "") + '">' + esc(t) + "</li>"; }

  function render() {
    if (!box) return;
    var q = input.value.trim();
    more.href = base + "providers/" + (q ? "?q=" + encodeURIComponent(q) : "");
    if (!index) { return; }
    if (!q) {
      list.innerHTML = '<li class="sp-msg">Type a name, a country or a kind of record: <i>Antenati</i>, <i>croatia church</i>, <i>usa census</i>, <i>newspapers australia</i>.</li>';
      return;
    }
    var all = S.search(index, q), top = all.slice(0, 8);
    if (!top.length) { say("Nothing matches that. Try fewer words, or open the full list."); return; }
    list.innerHTML = top.map(function (p, i) {
      var where = (p.countries || []).indexOf("*") >= 0 && p.countries.length === 1 ? "worldwide" : (p.countries || []).map(function (c) { return c === "*" ? "worldwide" : S.countryName(c); }).slice(0, 3).join(", ");
      return '<li class="sp-it"><a role="option" class="sp-main" href="' + base + "archive/" + esc(p.id) + '/" data-i="' + i + '"><span class="sp-n">' + esc(p.name) + '</span><span class="sp-m"><span class="chip acc-' + esc(p.access) + '">' + esc(p.access === "unsurveyed" ? "not yet checked" : p.access) + "</span> " + esc(where) + "</span></a>" +
        (p.url ? '<a class="sp-site" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="Open ' + esc(p.name) + ' itself (its own website)">Site ↗</a>' : "") + "</li>";
    }).join("") + '<li class="sp-msg">' + (all.length > top.length ? all.length + " match. " : "") + "<a href=\"" + more.href + '">See them all on the sources page →</a></li>';
  }

  function build() {
    box = document.createElement("div");
    box.className = "sp-ov"; box.hidden = true;
    box.innerHTML = '<div class="sp-card" role="dialog" aria-modal="true" aria-label="Search the sources">' +
      '<form class="sp-f" role="search"><input type="search" class="sp-in" placeholder="Search the sources: a name, a country, a kind of record" autocomplete="off" enterkeyhint="search" aria-label="Search the sources">' +
      '<button type="button" class="sp-x" aria-label="Close">×</button></form>' +
      '<ul class="sp-list" role="listbox"></ul>' +
      '<p class="sp-foot"><a class="sp-all" href="' + base + 'providers/">Open the whole list, with country and cost filters →</a></p></div>';
    document.body.appendChild(box);
    input = box.querySelector(".sp-in"); list = box.querySelector(".sp-list"); more = box.querySelector(".sp-all");
    box.addEventListener("mousedown", function (e) { if (e.target === box) close(); });
    box.querySelector(".sp-x").addEventListener("click", close);
    box.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = input.value.trim(), first = list.querySelector("a[data-i]");
      if (q && first && S && index && S.search(index, q).length === 1) { location.href = first.href; return; }
      location.href = more.href;
    });
    input.addEventListener("input", render);
    box.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        var as = [].slice.call(box.querySelectorAll("a[data-i]")); if (!as.length) return;
        var at = as.indexOf(document.activeElement), n = e.key === "ArrowDown" ? at + 1 : at - 1;
        e.preventDefault();
        if (n < 0) input.focus(); else as[Math.min(n, as.length - 1)].focus();
      }
    });
  }
  function open(from) {
    if (!box) build();
    opener = from || document.activeElement;
    box.hidden = false; document.documentElement.classList.add("sp-open");
    input.focus(); render(); load();
  }
  function close() {
    if (!box) return;
    box.hidden = true; document.documentElement.classList.remove("sp-open");
    if (opener && opener.focus) try { opener.focus(); } catch (e) { /* element gone */ }
  }

  function mount() {
    var nav = document.querySelector("header.site nav.topnav"), wrap = document.querySelector("header.site .drawer .wrap");
    if (!nav && !wrap) return false;
    if (nav && !nav.querySelector(".ra-sources")) {
      var b = document.createElement("button"); b.type = "button"; b.className = "ra-sources"; b.innerHTML = ICON;
      b.title = TIP; b.setAttribute("aria-label", TIP); b.setAttribute("aria-haspopup", "dialog");
      b.addEventListener("click", function () { open(b); });
      /* before the Record Reader icon when it is already there, so the order is: save, sources, read, light/dark */
      var reader = nav.querySelector(".ra-reader");
      if (reader) nav.insertBefore(b, reader); else nav.appendChild(b);
    }
    if (wrap && !wrap.querySelector(".ra-sources-row")) {
      var g = document.createElement("div"); g.className = "dgrp";
      var r = document.createElement("button"); r.type = "button"; r.className = "ra-sources-row"; r.innerHTML = ICON + "<span>Search the sources</span>";
      r.addEventListener("click", function () {
        var burger = document.querySelector("header.site .burger"); if (burger && burger.getAttribute("aria-expanded") === "true") burger.click();
        open(r);
      });
      g.appendChild(r); wrap.appendChild(g);
    }
    return true;
  }
  var tries = 0; (function look() { if (!mount() && ++tries < 20) setTimeout(look, 150); })();
  /* the Record Reader icon is added by theme.js a moment later: keep the order whichever arrives first */
  var late = 0; (function order() {
    var nav = document.querySelector("header.site nav.topnav"), b = nav && nav.querySelector(".ra-sources"), rd = nav && nav.querySelector(".ra-reader");
    if (b && rd && b.compareDocumentPosition(rd) & Node.DOCUMENT_POSITION_PRECEDING) nav.insertBefore(b, rd);
    else if (++late < 20) setTimeout(order, 200);
  })();
})();
