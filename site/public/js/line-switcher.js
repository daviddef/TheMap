/* EXTRACTED FROM LineSwitcher.astro, FOR THE REASON IN site/public/js/progress-kit.js.
   It ran as an `is:inline` script and Astro copies those into every page that
   uses it — 2,725 bytes multiplied by 79,471 pages. What stays inline is
   `uid`, the id of the element this instance drew: it differs per instance
   and is ten bytes.

   TWO INSTANCES SHARE THIS FILE, AND THAT IS WHY `uid` IS CAPTURED HERE AND
   NOT AT THE TOP. /my-research/ renders the switcher twice — once compact in
   Base.astro's header as #ra-lines-c, once in full as #ra-lines — so the
   page carries this <script src> twice and the browser runs it twice. Each
   run is preceded by its own inline tag setting window.__raLineUid, and
   classic scripts run in document order, so reading the global AT EXECUTION
   TIME gives each run the right element. Reading it into a top-level `var`
   instead looked identical and was not: the second run reassigned the same
   global binding, both deferred start() functions then read it on
   DOMContentLoaded, and the header switcher silently wired itself to the
   body's bar while the body's bar collected two of every listener — one
   «+ another family» click prompting twice and adding two lines.

   Classic <script src>, not a module, so the execution order is exactly the
   order the inline version had. */
(function () {
    /* THE HEADER IS PARSED BEFORE THE STORE EXISTS. ProgressKit is an inline
       script inside the page body; this component also renders inside
       Base.astro's <header>, which the browser reaches first. Reading
       window.raProgress at parse time therefore found nothing and the control
       gave up permanently — visible as a header switcher that never appeared.
       So it waits for the document instead of for luck. */
    var uid = window.__raLineUid;

    function start() {
    var P = window.raProgress;
    var bar = document.getElementById(uid);
    if (!P || !bar) return;
    var sel = bar.querySelector("select");
    var say = bar.querySelector(".ra-lines-n");

    function draw() {
      var lines = P.lines();
      sel.innerHTML = lines.map(function (l) {
        var label = l.name + (l.where ? " of " + l.where : "");
        return '<option value="' + l.slug + '"' +
               (l.active ? " selected" : "") + ">" +
               label.replace(/[&<>]/g, "") + "</option>";
      }).join("");
      var me = lines.filter(function (l) { return l.active; })[0];
      if (say) say.textContent = me
        ? me.marks + (me.marks === 1 ? " mark" : " marks")
        : "";
      bar.hidden = bar.getAttribute("data-quiet") === "1" && lines.length < 2;
    }

    sel.addEventListener("change", function () {
      P.setActive(sel.value);
      draw();
      /* EVERYTHING ON THE PAGE IS NOW ABOUT A DIFFERENT FAMILY. Rather than
         each surface subscribing to a store it does not own, the one event
         it already listens for is fired — the same one a mark fires. */
      document.dispatchEvent(new CustomEvent("ra-progress-changed"));
    });

    bar.querySelector(".ra-line-new").addEventListener("click", function () {
      var name = window.prompt("Which family? (a surname)");
      if (!name || !name.trim()) return;
      var where = window.prompt("Where, if it helps tell them apart? (optional)") || "";
      P.addLine(name, where);
      draw();
      document.dispatchEvent(new CustomEvent("ra-progress-changed"));
    });

    var ren = bar.querySelector(".ra-line-ren");
    if (ren) ren.addEventListener("click", function () {
      var cur = P.lines().filter(function (l) { return l.active; })[0];
      if (!cur) return;
      var name = window.prompt("Name for this line", cur.name);
      if (name === null) return;
      var where = window.prompt("Where (optional)", cur.where);
      P.renameLine(cur.slug, name, where === null ? cur.where : where);
      draw();
    });

    document.addEventListener("ra-progress-changed", draw);
    draw();
    }
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", start);
    else start();
  })();
