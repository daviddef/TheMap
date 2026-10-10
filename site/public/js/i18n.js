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

    function walk(root) {
      if (!root) return;
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var n, hits = [];
      while ((n = w.nextNode())) {
        var k = n.nodeValue.trim();
        if (k && tab[k]) hits.push([n, n.nodeValue.replace(k, tab[k])]);
      }
      hits.forEach(function (h) { h[0].nodeValue = h[1]; });
    }
    /* ONLY INSIDE CONTAINERS THAT OPTED IN. A blanket walk would translate
       the word «places» wherever it appears in a sentence and leave the
       rest of that sentence in English, which reads worse than not
       translating at all. */
    function apply() {
      document.documentElement.lang = pick;
      ["header.site nav", "#drawer", ".ra-bar", "#ra-empty",
       ".ra-cats-wrap summary", "[data-i18n]"].forEach(function (sel) {
        document.querySelectorAll(sel).forEach(walk);
      });
      /* Attributes are not text nodes, so the walker cannot reach them,
         and a translated box with an English label is worse for a screen
         reader than one that is honestly all English. */
      var box = document.getElementById("ra-q");
      if (box) {
        if (tab[box.placeholder]) box.placeholder = tab[box.placeholder];
        var al = box.getAttribute("aria-label");
        if (al && tab[al]) box.setAttribute("aria-label", tab[al]);
      }
      var sw = document.querySelector("[data-ra-lang]");
      if (sw) {
        sw.querySelectorAll("a[data-lang]").forEach(function (a) {
          a.classList.toggle("on", a.getAttribute("data-lang") === pick);
        });
        var note = sw.querySelector("[data-lang-note]");
        if (note) note.textContent =
          "\u2014 the controls are translated; the longer explanations are " +
          "still in English, on purpose.";
      }
    }
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", apply);
    else apply();
  })();
