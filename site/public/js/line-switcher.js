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

    /* THE FAMILY PICKER. A plain <select> is a long scroll once there are ten families and cannot be searched. This is a button that
       opens a small panel: a search box that finds a family by name or place (accents and capitals do not matter), each family with where
       and how many marks it holds, the current one ticked, arrow keys and Enter, and, when what you typed matches nothing, a row that
       adds it as a new family without a pop-up question box. The <select> stays in the page, hidden, as the one place the value lives. */
    function fold(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
    function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    var cb = mk("div", "ra-cb"), btn = mk("button", "ra-cb-btn"), btnLab = mk("span", "ra-cb-lab"), pop = mk("div", "ra-cb-pop"),
        q = mk("input", "ra-cb-q"), list = mk("ul", "ra-cb-list"), add = mk("div", "ra-cb-add"), uidc = uid + "-cb";
    btn.type = "button"; btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", "Which family this progress belongs to");
    btn.append(btnLab, mk("span", "ra-cb-chev", "\u25BE"));
    q.type = "search"; q.placeholder = "Find a family or a place"; q.setAttribute("aria-label", "Find a family"); q.autocomplete = "off"; q.spellcheck = false;
    list.id = uidc + "-list"; list.setAttribute("role", "listbox"); q.setAttribute("aria-controls", list.id);
    pop.hidden = true; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Choose a family");
    var addBtn = mk("button", "ra-cb-addbtn", "+ Add a family"), form = mk("form", "ra-cb-form"), fName = mk("input"), fWhere = mk("input"), fGo = mk("button", "ra-cb-go", "Add");
    addBtn.type = "button"; form.hidden = true; fGo.type = "submit";
    fName.placeholder = "Surname, e.g. Kosina"; fName.setAttribute("aria-label", "Surname of the family"); fWhere.placeholder = "Where (optional), to tell two apart"; fWhere.setAttribute("aria-label", "Where, optional");
    form.append(fName, fWhere, fGo); add.append(addBtn, form);
    pop.append(q, list, add); cb.append(btn, pop); sel.hidden = true; sel.parentNode.insertBefore(cb, sel);
    var shownLines = [], at = -1;

    function labelOf(l) { return (l.name === "My research so far" ? "Research Names" : l.name) + (l.where ? " of " + l.where : ""); }
    function paintList() {
      var f = fold(q.value), lines = P.lines();
      shownLines = lines.filter(function (l) { return !f || fold(l.name + " " + l.where).indexOf(f) > -1; });
      list.textContent = ""; at = -1;
      shownLines.forEach(function (l, i) {
        var li = mk("li", "ra-cb-opt" + (l.active ? " is-on" : "")), main = mk("span", "ra-cb-main");
        li.id = uidc + "-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", l.active ? "true" : "false");
        main.append(mk("b", null, l.name === "My research so far" ? "Research Names" : l.name)); if (l.where) main.append(mk("span", null, " of " + l.where));
        li.append(mk("span", "ra-cb-tick", l.active ? "\u2713" : ""), main, mk("span", "ra-cb-n", l.marks + (l.marks === 1 ? " mark" : " marks")));
        li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(l); });
        list.append(li);
      });
      if (!shownLines.length) {
        var none = mk("li", "ra-cb-none"); none.append(q.value.trim() ? "No family matches \u201C" + q.value.trim() + "\u201D. " : "No families yet. ");
        if (q.value.trim()) { var a = mk("button", "ra-cb-new", "Add \u201C" + q.value.trim() + "\u201D as a new family"); a.type = "button"; a.addEventListener("mousedown", function (e) { e.preventDefault(); openAdd(q.value.trim()); }); none.append(a); }
        list.append(none);
      }
      var act = shownLines.map(function (l) { return l.active; }).indexOf(true); if (act > -1 && !f) mark(act);
    }
    function mark(i) {
      at = i; [].forEach.call(list.children, function (li, j) { li.classList.toggle("is-at", j === i); });
      if (list.children[i]) { q.setAttribute("aria-activedescendant", list.children[i].id); list.children[i].scrollIntoView({ block: "nearest" }); } else q.removeAttribute("aria-activedescendant");
    }
    function choose(l) { P.setActive(l.slug); closePop(false); draw(); document.dispatchEvent(new CustomEvent("ra-progress-changed")); }
    function openPop(addMode) {
      cb.classList.add("is-open"); pop.hidden = false; btn.setAttribute("aria-expanded", "true"); q.value = ""; form.hidden = true; addBtn.hidden = false; paintList();
      if (addMode) openAdd(""); else q.focus();
    }
    function closePop(refocus) { cb.classList.remove("is-open"); pop.hidden = true; btn.setAttribute("aria-expanded", "false"); if (refocus) btn.focus(); }
    function openAdd(name) { form.hidden = false; addBtn.hidden = true; fName.value = name || ""; fWhere.value = ""; fName.focus(); }
    btn.addEventListener("click", function () { if (pop.hidden) openPop(false); else closePop(true); });
    q.addEventListener("input", paintList);
    q.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { mark(Math.min(shownLines.length - 1, at + 1)); e.preventDefault(); }
      else if (e.key === "ArrowUp") { mark(Math.max(0, at - 1)); e.preventDefault(); }
      else if (e.key === "Enter") { e.preventDefault(); if (at > -1 && shownLines[at]) choose(shownLines[at]); else if (shownLines.length === 1) choose(shownLines[0]); else if (!shownLines.length && q.value.trim()) openAdd(q.value.trim()); }
    });
    pop.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); closePop(true); } });
    document.addEventListener("mousedown", function (e) { if (!pop.hidden && !cb.contains(e.target)) closePop(false); });
    addBtn.addEventListener("click", function () { openAdd(q.value.trim()); });
    form.addEventListener("submit", function (e) {
      e.preventDefault(); var name = fName.value.trim(); if (!name) { fName.focus(); return; }
      P.addLine(name, fWhere.value.trim()); closePop(false); draw(); document.dispatchEvent(new CustomEvent("ra-progress-changed"));
    });

    function draw() {
      var lines = P.lines();
      sel.innerHTML = lines.map(function (l) {
        var label = (l.name === "My research so far" ? "Research Names" : l.name) + (l.where ? " of " + l.where : "");
        return '<option value="' + l.slug + '"' +
               (l.active ? " selected" : "") + ">" +
               label.replace(/[&<>]/g, "") + "</option>";
      }).join("");
      var me = lines.filter(function (l) { return l.active; })[0];
      btnLab.textContent = me ? labelOf(me) : "Choose a family";
      if (!pop.hidden) paintList();
      if (say) say.textContent = me
        ? me.marks + (me.marks === 1 ? " mark" : " marks")
        : "";
      bar.hidden = bar.getAttribute("data-quiet") === "1" && lines.length < 2;
      nudge();
    }

    /* A DOT, NOT A BANNER. Only the reader's own work counts (progress-kit.js stamps it), a day after the first change if
       they have never backed up and a week after a backup that is behind. The dot sends them to My research, which says why. */
    function nudge() {
      var a = bar.querySelector("a.ra-lines-l");
      if (!a) return;
      var first = null, rec = null, last = null;
      try {
        first = localStorage.getItem("ra-own-first"); last = localStorage.getItem("ra-own-last");
        rec = JSON.parse(localStorage.getItem("ra-backup-v1") || "null");
      } catch (e) { return; }
      var day = 86400000, now = Date.now(), why = "";
      if (first && !(rec && rec.at) && now - Date.parse(first) >= day) why = "Not backed up yet";
      else if (rec && rec.at && last && last > rec.at && now - Date.parse(rec.at) >= 7 * day) why = "Not backed up for " + Math.floor((now - Date.parse(rec.at)) / day) + " days";
      a.classList.toggle("ra-lines-warn", !!why);
      a.title = why ? why + ": open My research to back it up" : "Your research: every family you are tracking";
    }

    sel.addEventListener("change", function () {
      P.setActive(sel.value);
      draw();
      /* EVERYTHING ON THE PAGE IS NOW ABOUT A DIFFERENT FAMILY. Rather than
         each surface subscribing to a store it does not own, the one event
         it already listens for is fired — the same one a mark fires. */
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
