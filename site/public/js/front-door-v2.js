/* FRONT DOOR V2: the behaviour laid over the home map on /v2/.

   The map, the search box, the story reader, the filters, the year scrubber, the visiting list and every other tool are the home page's own
   code, untouched. This file only adds what is new:
     - the "Why are you here?" card: seven doors, each of which uses something the Atlas already does (it never reimplements one);
     - a search box that shows, by typing itself out, the kinds of thing it takes;
     - the map keeps its subject clear of the card, by padding every fit-to-bounds by the card's width;
     - an immersive mode for the full-screen button (the stage fills the window, Esc comes back);
     - the counts, counted up once.
   Classic script, no libraries; a browser that cannot run it still has the whole home-page toolset in the new layout. */
(function () {
  "use strict";
  var stage = document.getElementById("fd2-stage");
  if (!stage) return;
  var BASE = stage.getAttribute("data-base") || "/";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wideMq = window.matchMedia ? window.matchMedia("(min-width: 900px)") : { matches: true, addEventListener: function () {} };
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function url(p) { return BASE.replace(/\/$/, "") + p; }
  function fire(node, type, init) { node.dispatchEvent(new (type === "input" ? Event : KeyboardEvent)(type, init || { bubbles: true, cancelable: true })); }

  var q = document.getElementById("ra-q"), panel = $(".at-panel"), empty = document.getElementById("ra-empty"), body = document.getElementById("ra-body");
  if (!panel || !empty) return;

  /* ---------- the doors ---------- */
  var ICON = {
    person: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="9" r="4"/><path d="M5 22c1-5 4-7 8-7s7 2 8 7"/></svg>',
    names: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 9 6l5 14M6 15h6M16 20l3-8 3 8M17 18h4"/></svg>',
    towns: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.5"/><circle cx="19" cy="7" r="2.5"/><circle cx="18" cy="20" r="2"/><path d="M8 16.5 17 8.5M8.3 18.4l7.7 1.5"/></svg>',
    tree: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="5" r="2.5"/><circle cx="6" cy="20" r="2.5"/><circle cx="20" cy="20" r="2.5"/><path d="M13 7.5V13M13 13 6 17.5M13 13l7 4.5"/></svg>',
    time: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="13" r="9"/><path d="M13 7v6l4 3"/></svg>',
    read: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h10l5 5v13H6z"/><path d="M9 13h9M9 17h9M9 9h4"/></svg>',
    resume: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h12v18l-6-4-6 4z"/><path d="M11 10l3 2-3 2z" fill="currentColor"/></svg>',
    share: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14v7h16v-7M13 4v12M8 9l5-5 5 5"/></svg>'
  };
  /* kind: which hue the door wears (the same four the Atlas uses: teal, brass, brick, green) */
  var DOORS = [
    { id: "person", kind: "a", title: "Find a person", sub: "a few bits of a story", act: "guide" },
    { id: "names", kind: "b", title: "Every way to spell it", sub: "names and places", act: "go", href: "/your-name/" },
    { id: "towns", kind: "c", title: "Find the towns", sub: "from a surname", act: "guide" },
    { id: "tree", kind: "d", title: "Fill my tree's gaps", sub: "a tree file", act: "go", href: "/tree-canvas/" },
    { id: "time", kind: "b", title: "What was happening", sub: "flags, rulers, wars", act: "guide" },
    { id: "read", kind: "c", title: "Read a record", sub: "a page I can't make out", act: "go", href: "/read/" },
    { id: "share", kind: "a", title: "Share a story", sub: "a one-page sheet", act: "guide", wide: true }
  ];

  /* what each guided door shows: a sentence, examples that run on a click, and the tools it already has */
  var GUIDES = {
    person: {
      h: "Find a person", say: "Write what you know, even a few words. The map fills in as you type: the places, the route, and who held the ground.",
      eg: ["my father Ivan was born in Croatia", "my grandmother came from Senj to Trieste in 1905", "my dad Ivan Blažević moved from Croatia to Johannesburg, then Brisbane. born 1931"],
      acts: [["Open the story panel", "story"], ["Add a photo or document", "photo"]]
    },
    towns: {
      h: "Find the towns", say: "Type a surname. The map rings the places it turns up, in every spelling the Atlas has met.",
      eg: ["Blažević", "Lerena", "Defranceschi", "Žubrinić", "Peeters"],
      acts: [["Every way to spell it", "names"]]
    },
    time: {
      h: "What was happening", say: "Set a year and the map keeps only the places whose records can answer for it, and every panel says whose archive those years belonged to. Press play and watch the ground change hands.",
      eg: [], acts: [["Set the year and play", "play"], ["Open History", "history"]]
    },
    share: {
      h: "Share a story", say: "Tell the story in the box above. Then open the full story page: it makes the family account, a research plan, and a page you can keep and share.",
      eg: ["my father Ivan was born in Croatia"], acts: [["Open the full story page", "handoff"], ["Tell us who you're looking for", "looking"]]
    }
  };

  function fillBox(text, go) {
    if (!q) return;
    q.value = text; q.focus();
    fire(q, "input");
    if (go) setTimeout(function () { fire(q, "keydown", { key: "Enter", bubbles: true, cancelable: true }); }, 60);
  }

  function runAct(a) {
    if (a === "story") { if (window.raStoryBox) window.raStoryBox.open(); else q && q.focus(); }
    else if (a === "photo") { var add = $(".ra-q-add"); if (add) add.click(); else q && q.focus(); }
    else if (a === "names") location.href = url("/your-name/");
    else if (a === "history") location.href = url("/history/");
    else if (a === "looking") location.href = url("/looking-for/");
    else if (a === "play") location.href = historyUrl();
    else if (a === "handoff") {
      if (q && q.value.trim() && window.raStoryBox) window.raStoryBox.handoff();
      else { toast("Write a few words about who you are looking for in the box first."); q && q.focus(); }
    }
  }

  /* PLAY IS THE HISTORY MAP'S. The records map used to open the History playback over itself, which on this page meant a second panel on top of the
     card. The playback has its own page, so the play button and the "What was happening" door go there, carrying the year if the reader had set one. */
  function historyUrl() {
    var on = document.getElementById("ra-yon"), y = document.getElementById("ra-year"), n = y ? parseInt(y.value, 10) : NaN;
    return url("/history/") + (on && on.checked && n >= 600 && n <= 2026 ? "?y=" + n : "");
  }
  var pb = document.getElementById("ra-play");
  if (pb) { pb.title = "Watch history play on the history map"; pb.setAttribute("aria-label", "Watch history play on the history map"); }
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("#ra-play") : null;
    if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    location.href = historyUrl();
  }, true);
  /* the year control: switch it on, set a year, and press play */
  function timeOn(play) {
    var on = document.getElementById("ra-yon"), y = document.getElementById("ra-year"), y2 = document.getElementById("ra-year2");
    if (on && !on.checked) on.click();
    if (play) setTimeout(function () { var p = document.getElementById("ra-play"); if (p && p.getAttribute("aria-pressed") !== "true") p.click(); }, 120);
    else if (y && y2 && y.value === "1780") { /* leave the control's own default */ }
  }

  var toastT = 0;
  function toast(t) {
    var e = $(".fd2-toast", stage); if (!e) { e = el("div", "fd2-toast"); e.setAttribute("role", "status"); stage.appendChild(e); }
    e.textContent = t; e.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove("on"); }, 3800);
  }

  /* ---------- build the card ---------- */
  var card = el("div", "fd2-card");
  var head = el("div", "fd2-hd",
    '<p class="fd2-eyebrow">Record Atlas</p><h2 class="fd2-h">Why are you here?</h2>' +
    '<p class="fd2-sub">Pick the closest, or just type in the box above.</p>');
  var tiles = el("div", "fd2-tiles");
  DOORS.forEach(function (d, i) {
    var b = el(d.act === "go" ? "a" : "button", "fd2-tile k-" + d.kind + (d.wide ? " wide" : ""),
      '<span class="fd2-ic">' + ICON[d.id] + '</span><span class="fd2-tt"><b>' + d.title + '</b><span>' + d.sub + '</span></span><span class="fd2-go" aria-hidden="true">→</span>');
    b.style.setProperty("--i", i);
    if (d.act === "go") b.href = url(d.href); else b.type = "button";
    b.setAttribute("data-door", d.id);
    if (d.act === "guide") b.addEventListener("click", function () { showGuide(d.id); });
    tiles.appendChild(b);
  });
  var guide = el("div", "fd2-guide"); guide.hidden = true;
  var stats = el("div", "fd2-stats",
    '<div><b data-n="places">0</b><span>places</span></div><div><b data-n="volumes">0</b><span>volumes</span></div>' +
    '<div><b data-n="countries">0</b><span>countries</span></div><div><b data-n="archives">0</b><span>archives</span></div>');
  var more = el("p", "fd2-more",
    '<a href="' + url("/my-research/") + '">My research</a><a href="' + url("/whats-new/") + '">What\'s new</a><a href="' + url("/providers/") + '">Where to write</a><a href="' + url("/help/") + '">Help</a>');
  var mine = el("p", "fd2-mine"); mine.hidden = true;
  card.append(head, tiles, guide, stats, more, mine);
  empty.textContent = ""; empty.appendChild(card);

  function showGuide(id) {
    var g = GUIDES[id]; if (!g) return;
    guide.hidden = false; guide.textContent = "";
    var back = el("button", "fd2-back", "← All the ways in"); back.type = "button";
    back.addEventListener("click", function () { guide.hidden = true; tiles.hidden = false; head.hidden = false; });
    guide.appendChild(back);
    guide.appendChild(el("h3", "fd2-gh", g.h));
    guide.appendChild(el("p", "fd2-gp", g.say));
    if (g.eg.length) {
      var row = el("div", "fd2-chips");
      g.eg.forEach(function (t) {
        var c = el("button", "fd2-chip"); c.type = "button"; c.textContent = t;
        c.addEventListener("click", function () { fillBox(t, id === "towns"); });
        row.appendChild(c);
      });
      guide.appendChild(row);
    }
    var ar = el("div", "fd2-acts");
    g.acts.forEach(function (a, i) {
      var b = el("button", i ? "fd2-ghost" : "fd2-primary"); b.type = "button"; b.textContent = a[0];
      b.addEventListener("click", function () { runAct(a[1]); });
      ar.appendChild(b);
    });
    guide.appendChild(ar);
    tiles.hidden = true; head.hidden = true;
    if (id === "person" || id === "towns" || id === "share") q && q.focus({ preventScroll: true });
  }

  /* ---------- fold the card ---------- */
  var fold = el("button", "fd2-fold"); fold.type = "button";
  fold.setAttribute("aria-label", "Fold the card away"); fold.setAttribute("aria-expanded", "true");
  fold.innerHTML = '<span class="fd2-fold-t">Show the card</span><span class="fd2-fold-x" aria-hidden="true">–</span>';
  fold.addEventListener("click", function () {
    var f = panel.classList.toggle("fd2-folded");
    fold.setAttribute("aria-expanded", String(!f)); fold.setAttribute("aria-label", f ? "Show the card" : "Fold the card away");
    fold.querySelector(".fd2-fold-x").textContent = f ? "+" : "–";
  });
  panel.insertBefore(fold, panel.firstChild);

  function unfold() {
    panel.classList.remove("fd2-folded"); fold.setAttribute("aria-expanded", "true"); fold.setAttribute("aria-label", "Fold the card away"); fold.querySelector(".fd2-fold-x").textContent = "–";
  }

  /* ---------- counts, counted up once ---------- */
  /* millions are written short (1.43M): "1,431,206" is nine characters and does not fit a quarter of the card */
  function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : Math.round(n).toLocaleString("en"); }
  function countUp() {
    var vals = { places: +stage.getAttribute("data-places"), volumes: +stage.getAttribute("data-volumes"), countries: +stage.getAttribute("data-countries"), archives: +stage.getAttribute("data-archives") };
    [].forEach.call(stats.querySelectorAll("[data-n]"), function (b) {
      var to = vals[b.getAttribute("data-n")] || 0;
      if (reduce || !to) { b.textContent = fmt(to); return; }
      var t0 = performance.now(), dur = 1100;
      (function f(now) { var t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3); b.textContent = fmt(to * e); if (t < 1) requestAnimationFrame(f); })(t0);
    });
  }
  requestAnimationFrame(function () { setTimeout(countUp, 350); });

  /* ---------- a search box that shows what it takes ---------- */
  var phrases = ["my father Ivan was born in Croatia", "Blažević", "Senj, or Segna, or Zengg", "my grandmother came from Trieste in 1905", "Gallignana", "a photo of a baptism record"];
  var short = ["my father was born in Croatia", "Blažević", "Senj, or Segna", "Gallignana", "a baptism photo"];
  var narrowMq = window.matchMedia ? window.matchMedia("(max-width: 560px)") : { matches: false };
  var idle = narrowMq.matches ? "A place, surname or story" : "Find a place or a surname, or tell a story";
  if (q) {
    var pi = 0, ci = 0, dir = 1, timer = 0, running = false;
    var canType = function () { return !q.value && document.activeElement !== q && !document.hidden; };
    var step = function () {
      if (!running) return;
      if (!canType()) { q.setAttribute("placeholder", idle); timer = setTimeout(step, 600); return; }
      var list = narrowMq.matches ? short : phrases; if (pi >= list.length) pi = 0;
      var s = list[pi];
      if (reduce) { q.setAttribute("placeholder", s); pi = (pi + 1) % list.length; timer = setTimeout(step, 3600); return; }
      ci += dir; q.setAttribute("placeholder", s.slice(0, ci) + (ci < s.length || dir < 0 ? "▏" : ""));
      var wait = 48 + Math.random() * 34;
      if (dir > 0 && ci >= s.length) { dir = -1; wait = 2100; q.setAttribute("placeholder", s); }
      else if (dir < 0 && ci <= 0) { dir = 1; pi = (pi + 1) % list.length; wait = 420; }
      else if (dir < 0) wait = 16;
      timer = setTimeout(step, wait);
    };
    var begin = function () { if (running) return; running = true; step(); };
    var stop = function () { running = false; clearTimeout(timer); q.setAttribute("placeholder", idle); };
    q.addEventListener("focus", stop);
    q.addEventListener("blur", function () { if (!q.value) setTimeout(begin, 400); });
    setTimeout(begin, 1200);
  }

  /* ---------- keep the subject clear of the card ---------- */
  function cardInset() {
    if (!wideMq.matches || panel.classList.contains("fd2-folded")) return 0;
    var m = $("#ra-map"); if (!m) return 0;
    var pr = panel.getBoundingClientRect(), mr = m.getBoundingClientRect();
    return Math.max(0, Math.round(pr.right - mr.left + 14));
  }
  function patchLeaflet() {
    var L = window.L; if (!L || !L.Map || L.Map.prototype.__fd2) return !!(L && L.Map && L.Map.prototype.__fd2);
    var orig = L.Map.prototype._getBoundsCenterZoom;
    if (typeof orig !== "function") return true;
    L.Map.prototype._getBoundsCenterZoom = function (b, o) {
      if (this._container && this._container.id === "ra-map" && wideMq.matches) {
        o = L.extend({}, o || {});
        if (!o.paddingTopLeft && !o.paddingBottomRight) {
          var p = o.padding || [0, 0]; if (p.x != null) p = [p.x, p.y];
          o.paddingTopLeft = L.point(p[0] + cardInset(), p[1] + 76);
          o.paddingBottomRight = L.point(p[0] + 64, p[1] + 70);
          delete o.padding;
        }
      }
      return orig.call(this, b, o);
    };
    L.Map.prototype.__fd2 = 1; return true;
  }
  if (!patchLeaflet()) { var tries = 0, w = setInterval(function () { if (patchLeaflet() || ++tries > 80) clearInterval(w); }, 50); }

  /* ---------- immersive: the stage fills the window ---------- */
  var full = document.getElementById("ra-full");
  function immersive(on) {
    document.body.classList.toggle("fd2-immersive", on);
    if (full) full.setAttribute("aria-pressed", String(on));
    var m = window.raHomeMap; setTimeout(function () { if (m && m.invalidateSize) m.invalidateSize(); window.dispatchEvent(new Event("resize")); }, 60);
  }
  if (full) {
    full.addEventListener("click", function (e) { e.stopImmediatePropagation(); e.preventDefault(); immersive(!document.body.classList.contains("fd2-immersive")); }, true);
    full.setAttribute("aria-label", "Fill the window with the map"); full.setAttribute("title", "Fill the window with the map (Esc to come back)");
  }
  document.addEventListener("keydown", function (e) { if (e.key !== "Escape" || !document.body.classList.contains("fd2-immersive")) return;
    var sug = document.getElementById("ra-sug"), dr = document.getElementById("ra-doors");
    if ((sug && !sug.hidden) || (dr && !dr.hidden)) return;   /* the first Esc closes a dropdown; the next leaves immersive */
    immersive(false); });

  /* the map needs to know when its box changes size */
  if (window.ResizeObserver) { var ro = new ResizeObserver(function () { var m = window.raHomeMap; if (m && m.invalidateSize) m.invalidateSize({ pan: false }); }); ro.observe(stage); }

  /* a result arrives: the card scrolls back to its top, and says so for the stylesheet and for a screen reader */
  if (body && window.MutationObserver) {
    new MutationObserver(function () {
      var has = !body.hidden; stage.classList.toggle("fd2-has-result", has);
      if (has) { panel.scrollTop = 0; unfold(); }
      else if (!q || !q.value) unfold();   /* back at the start: the card comes back with it, so there is always a way in */
    }).observe(body, { attributes: true, attributeFilter: ["hidden"] });
  }
  /* a story on the map has the map's attention: the card steps aside for it and comes back when the story is cleared */
  var find = q && q.parentNode, autoFolded = false;
  if (find && window.MutationObserver) {
    new MutationObserver(function () {
      var on = find.classList.contains("ra-story-on");
      if (on && !panel.classList.contains("fd2-folded")) { fold.click(); autoFolded = true; }
      else if (!on && autoFolded) { autoFolded = false; if (panel.classList.contains("fd2-folded")) fold.click(); }
    }).observe(find, { attributes: true, attributeFilter: ["class"] });
  }
  /* the guide's own view goes away when the box has a search in it */
  if (q) q.addEventListener("input", function () {
    if (q.value && !guide.hidden) { guide.hidden = true; tiles.hidden = false; head.hidden = false; }
    /* the box was emptied: the way back to the start is the card itself, not a pill to find */
    if (!q.value && !(find && find.classList.contains("ra-story-on"))) setTimeout(function () { if (!q.value && body && body.hidden) unfold(); }, 400);
  });

  /* ---------- the "+" in the box: a photo, a document, or an example ---------- */
  var EXAMPLE = "My great-grandfather Ivan came from Gallignana to Hamilton around 1905";
  var plus = find && find.querySelector(".ra-q-add"), fileIn = find && find.querySelector('input[type="file"]');
  if (plus) {
    var menu = el("div", "fd2-plus"); menu.hidden = true; menu.setAttribute("role", "menu");
    function item(label, sub, fn) {
      var b = el("button", "fd2-plus-i", "<b></b><span></span>"); b.type = "button"; b.setAttribute("role", "menuitem");
      b.firstChild.textContent = label; b.lastChild.textContent = sub;
      b.addEventListener("click", function () { menu.hidden = true; fn(); });
      menu.appendChild(b);
    }
    item("Add a photo or document", "a baptism, a letter, a passport", function () { if (fileIn) fileIn.click(); });
    item("Try an example", "watch the map draw a story", function () { fillBox(EXAMPLE, false); });
    item("More room to write", "open the story panel", function () { if (window.raStoryBox) window.raStoryBox.open(); });
    find.appendChild(menu);
    plus.addEventListener("click", function (e) { e.stopImmediatePropagation(); e.preventDefault(); menu.hidden = !menu.hidden; if (!menu.hidden) { var f = menu.querySelector("button"); if (f) f.focus(); } }, true);
    plus.setAttribute("aria-haspopup", "menu"); plus.setAttribute("aria-label", "Add a photo or document, or try an example"); plus.title = "Add a photo or document, or try an example";
    document.addEventListener("click", function (e) { if (!menu.hidden && !menu.contains(e.target) && e.target !== plus) menu.hidden = true; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { menu.hidden = true; plus.focus(); } });
  }

  /* ---------- keep researching: where the work was left, from this browser's own marks ---------- */
  var resume = el("a", "fd2-tile k-a wide fd2-resume", '<span class="fd2-ic">' + ICON.resume + '</span><span class="fd2-tt"><b></b><span></span></span><span class="fd2-go" aria-hidden="true">→</span>');
  resume.hidden = true; resume.style.setProperty("--i", -1); tiles.insertBefore(resume, tiles.firstChild);
  function ago(iso) {
    var t = Date.parse(iso); if (!t) return "";
    var d = Math.floor((Date.now() - t) / 864e5);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? d + " days ago" : d < 60 ? Math.round(d / 7) + " weeks ago" : Math.round(d / 30) + " months ago";
  }
  function paintMine() {
    var P = window.raProgress; if (!P || !P.lines) return false;
    var lines = P.lines(), act = null; lines.forEach(function (l) { if (l.active) act = l; });
    var n = P.count(), slug = P.active && P.active(), marks = P.all ? P.all() : {}, last = null, week = 0, cut = Date.now() - 7 * 864e5;
    Object.keys(marks).forEach(function (k) {
      var b = marks[k] && marks[k].by && marks[k].by[slug]; if (!b || !b.since) return;
      if (Date.parse(b.since) >= cut) week++;
      if (!last || b.since > last.since) last = { since: b.since, t: marks[k].t, where: marks[k].where, href: marks[k].href };
    });
    if (!n && !(act && act.marks)) {
      mine.hidden = false; mine.innerHTML = 'Nothing marked yet. <a href="' + url("/my-research/") + '">See how My research works</a>'; resume.hidden = true; return true;
    }
    mine.hidden = false;
    mine.innerHTML = "<b>" + n.toLocaleString("en") + "</b> volume" + (n === 1 ? "" : "s") + " marked" + (week ? " · <b>" + week + "</b> in the last week" : "") +
      ' · <a href="' + url("/my-research/") + '">see and export them</a>';
    var name = act && act.name ? act.name : "";
    resume.querySelector("b").textContent = name ? "Keep researching the " + name + " family" : "Keep researching my family";
    resume.querySelector(".fd2-tt span").textContent = last ? "last: " + (last.t || "a volume") + (last.where ? ", " + String(last.where).replace(/-/g, " ") : "") + " · " + ago(last.since) : n + " volume" + (n === 1 ? "" : "s") + " marked";
    resume.href = last && last.href ? last.href : url("/my-research/");
    resume.hidden = false; return true;
  }
  (function () { var tries = 0, w = setInterval(function () { if (paintMine() || ++tries > 40) clearInterval(w); }, 150); })();
  document.addEventListener("ra-progress-changed", function () { paintMine(); });
})();
