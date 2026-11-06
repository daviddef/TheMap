/* EXTRACTED FROM Base.astro, FOR THE REASON IN site/public/js/progress-kit.js.
   It ran as an `is:inline` script and Astro copies those into every page
   that uses it — 3,115 bytes multiplied by 79,471 pages. The data it works
   on stays inline, because it is the translation table itself and a reader whose language is not English should not watch the page change under them a second after it arrives — the note above the tag in Base.astro says so and it is still true.

   Classic <script src>, not a module, so the execution order is exactly the
   order the inline version had. */
(function () {
    /* The table rides in on its own inline tag immediately above this one, for
       the reason the note in Base.astro gives: it IS the translation, and a
       reader whose language is not English should not watch the page change
       under them a second after it arrives. Read inside the function so this
       file leaves nothing behind in the global scope. */
    var RA_I18N = window.RA_I18N || {};
    /* WHICH LANGUAGE. An explicit ?lang= wins and is remembered, because
       it is the reader saying so; then a previous choice; then the
       browser's own preference, which is what gets this to work for
       somebody who never finds the switcher. */
    var pick = null;
    try {
      var q = new URLSearchParams(location.search).get("lang");
      if (q && (q === "en" || RA_I18N[q])) { pick = q; localStorage.setItem("ra-lang", q); }
      if (!pick) pick = localStorage.getItem("ra-lang");
    } catch (e) {}
    if (!pick) {
      var nav = (navigator.languages || [navigator.language || ""]);
      for (var i = 0; i < nav.length && !pick; i++) {
        var two = String(nav[i]).slice(0, 2).toLowerCase();
        if (RA_I18N[two]) pick = two;
      }
    }
    var tab = (pick && RA_I18N[pick]) || null;
    /* The one function the rest of the page uses. Unknown key returns the
       English it was given, because the keys ARE the English — so a
       half-finished language is «not yet translated», never a blank. */
    window.RA_LANG = tab ? pick : "en";
    window.RA_T = function (s) { return (tab && tab[s]) || s; };
    if (!tab) return;

    /* TEMPLATE KEYS. A key holding {} stands for text that varies (a number, a name, a date): «Last synced: {}.» matches «Last synced: 3 days
       ago.» and the captured piece is carried into the translation, itself translated if it is a known string. Built once. */
    var pats = [];
    Object.keys(tab).forEach(function (k) {
      if (k.indexOf("{}") < 0) return;
      var parts = k.split("{}").map(function (x) { return x.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&"); });
      /* A key that opens with {} is a count («{} volumes»), so its first capture must open with a digit; otherwise «Hundreds of volumes» would match. */
      var re = parts[0] + (k.indexOf("{}") === 0 && k.split("{}").length === 2 ? "(\\d.*?)" : "(.+?)");
      for (var j = 1; j < parts.length - 1; j++) re += parts[j] + "(.+?)";
      re += parts[parts.length - 1];
      pats.push([new RegExp("^" + re + "$"), tab[k]]);
    });
    function say(k) {
      if (tab[k]) return tab[k];
      for (var i = 0; i < pats.length; i++) {
        var m = pats[i][0].exec(k);
        if (m) { var n = 0; return pats[i][1].replace(/\{\}/g, function () { var v = m[++n]; return say(v) || v; }); }
      }
      return null;
    }
    /* RA_T now knows the template keys too, so script that builds a sentence can call it with the finished English. */
    window.RA_T = function (x) { return say(x) || x; };
    /* A SENTENCE WITH A WORD IN BOLD IS SEVERAL TEXT NODES, and none of them is the sentence. An element marked data-th is translated as one
       unit: its inner HTML, whitespace collapsed, is the key (template keys work here too), and the translation is HTML. Only put it on
       text with inline formatting; an element with ids or listeners inside would lose them. */
    function units(root) {
      var list = root.querySelectorAll ? [].slice.call(root.querySelectorAll("[data-th]")) : [];
      if (root.nodeType === 1 && root.hasAttribute("data-th")) list.unshift(root);
      list.forEach(function (el) {
        /* Astro stamps its scoped-style class on every tag in the HTML; it is not part of the sentence, so it is stripped from the key and put back on the translation. */
        var raw = el.innerHTML, cls = (raw.match(/astro-[a-z0-9]+/) || [""])[0];
        var key = raw.replace(/ class="astro-[a-z0-9]+"/g, "").replace(/ astro-[a-z0-9]+/g, "").trim().replace(/\s+/g, " "), r = say(key);
        if (r && r !== key) {
          el.innerHTML = r;
          if (cls) [].forEach.call(el.querySelectorAll("*"), function (x) { x.classList.add(cls); });
        }
      });
    }
    function walk(root) {
      if (!root) return;
      units(root);
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var n, hits = [];
      while ((n = w.nextNode())) {
        var k = n.nodeValue.trim(), r;
        /* A non-breaking space in the source (to keep «Hollow = unwalked» from wrapping badly) is a plain space as far as the key goes. */
        if (k && (r = say(k.replace(/\u00a0/g, " "))) && r !== k) hits.push([n, n.nodeValue.replace(k, r)]);
      }
      hits.forEach(function (h) { h[0].nodeValue = h[1]; });
      /* Attributes are not text nodes. A label a screen reader speaks, a tooltip and a placeholder are translated the same way. */
      var els = root.querySelectorAll ? root.querySelectorAll("[placeholder],[aria-label],[title]") : [];
      var all = root.nodeType === 1 ? [root].concat([].slice.call(els)) : [].slice.call(els);
      all.forEach(function (el) {
        ["placeholder", "aria-label", "title"].forEach(function (at) {
          var v = el.getAttribute && el.getAttribute(at), r2 = v && say(v);
          if (r2 && r2 !== v) el.setAttribute(at, r2);
        });
      });
    }
    /* ONLY INSIDE CONTAINERS THAT OPTED IN. A blanket walk would translate
       the word «places» wherever it appears in a sentence and leave the
       rest of that sentence in English, which reads worse than not
       translating at all. */
    var BOXES = ["header.site", "#drawer", ".ra-bar", "#ra-empty", "#ra-body", ".ra-lede", ".ra-inv", ".bk", ".site-foot", ".pagehead", ".ra-area-hint", ".ra-area-bar", ".ra-areactl", "#ra-flagres", ".ra-base", ".ra-ylab-w", "h1.ra-sr", "#ra-mywork",
                 ".ra-cats-wrap summary", "[data-i18n]"];
    var busy = false;
    function apply() {
      document.documentElement.lang = pick;
      busy = true;
      BOXES.forEach(function (sel) { document.querySelectorAll(sel).forEach(walk); });
      busy = false;
      /* The map, the area pane and the backup page build text with script after load. A watcher translates what they add, in the same boxes. */
      if (window.MutationObserver && !apply.watching) {
        apply.watching = true;
        var todo = null;
        new MutationObserver(function () {
          if (busy || todo) return;
          todo = setTimeout(function () { todo = null; apply(); }, 60);
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
      }
      var sw = document.querySelector("[data-ra-lang]");
      if (sw) {
        sw.querySelectorAll("a[data-lang]").forEach(function (a) {
          a.classList.toggle("on", a.getAttribute("data-lang") === pick);
        });
        var note = sw.querySelector("[data-lang-note]");
        if (note) { var NOTE = "\u2014 the controls are translated; the longer explanations are still in English, on purpose."; var nt = say(NOTE) || NOTE; if (note.textContent !== nt) note.textContent = nt; }
      }
    }
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", apply);
    else apply();
  })();
