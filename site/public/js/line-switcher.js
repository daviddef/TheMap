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
      /* the ones made here, then the ones the family research sessions publish; each alphabetical. The headings show only when both exist. */
      var mine = shownLines.filter(function (l) { return !l.session; }), theirs = shownLines.filter(function (l) { return l.session; });
      shownLines = mine.concat(theirs);
      var heads = mine.length && theirs.length;
      list.textContent = ""; at = -1;
      shownLines.forEach(function (l, i) {
        if (heads && i === 0) list.append(mk("li", "ra-cb-grp", "Yours"));
        if (heads && i === mine.length) list.append(mk("li", "ra-cb-grp", "From the family research sessions"));
        var li = mk("li", "ra-cb-opt" + (l.active ? " is-on" : "")), main = mk("span", "ra-cb-main");
        li.setAttribute("data-i", String(i));
        li.id = uidc + "-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", l.active ? "true" : "false");
        main.append(mk("b", null, l.name === "My research so far" ? "Research Names" : l.name)); if (l.where) main.append(mk("span", null, " of " + l.where));
        /* a family the sessions publish links to the archive that did the work (its own site, in a new tab); the Atlas holds no page per family */
        (l.archives || []).slice(0, 2).forEach(function (a) {
          var lk = mk("a", "ra-cb-arch", "\u2197 " + String(a.name).replace(/^The /, "").replace(/ Archive$/, "")); lk.href = a.url; lk.target = "_blank"; lk.rel = "noopener";
          lk.title = "Open " + a.name + " in a new tab";
          ["mousedown", "click"].forEach(function (t) { lk.addEventListener(t, function (e) { e.stopPropagation(); }); });
          main.append(lk);
        });
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
      at = i; var cur = null;
      [].forEach.call(list.querySelectorAll(".ra-cb-opt"), function (li) { var on = li.getAttribute("data-i") === String(i); li.classList.toggle("is-at", on); if (on) cur = li; });
      if (cur) { q.setAttribute("aria-activedescendant", cur.id); cur.scrollIntoView({ block: "nearest" }); } else q.removeAttribute("aria-activedescendant");
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

    /* MY RESEARCH'S BAR. On that page the bar also says whose research this is, which family research session it came from, and carries
       the things you do to a family: rename it, remove it, print or save it as a PDF. Rename and Remove open a small panel in the bar
       (the pop-up question box is not used). Remove takes this family's marks only, never the books themselves, and is refused for the
       last family. Merging two families and a whole-session view do not exist yet. */
    var isAdmin = bar.classList.contains("ra-lines-admin"), fam = null, origTitle = document.title;
    if (isAdmin) {
      fam = { who: mk("span", "ra-fam-who"), sess: mk("span", "ra-fam-sess"), tools: mk("span", "ra-fam-tools"), panel: mk("div", "ra-fam-panel") };
      fam.panel.hidden = true;
      /* round icon buttons, the same make as the header's Save, Read and Contrast; the words are the tooltip and the screen-reader name */
      var ICO = { pen: '<path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" />', bin: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />', print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />' };
      function tool(label, cls, fn, ico) {
        var b = mk("button", "ra-fam-b ra-fam-i" + (cls ? " " + cls : "")); b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
        b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICO[ico] + "</svg>";
        b.addEventListener("click", fn); fam.tools.append(b); return b;
      }
      function current() { return P.lines().filter(function (l) { return l.active; })[0]; }
      function openPanel(kind) {
        var me = current(); if (!me) return;
        var p = fam.panel; p.innerHTML = ""; p.hidden = false;
        if (kind === "rename") {
          var n = mk("input"), w = mk("input"), ok = mk("button", "ra-fam-b pri", "Save name"), no = mk("button", "ra-fam-b", "Cancel");
          n.value = me.name; n.setAttribute("aria-label", "Family name"); w.value = me.where || ""; w.placeholder = "Where (optional)"; w.setAttribute("aria-label", "Where, optional");
          ok.type = "button"; no.type = "button";
          function go() { if (!n.value.trim()) { n.focus(); return; } P.renameLine(me.slug, n.value, w.value); p.hidden = true; draw(); document.dispatchEvent(new CustomEvent("ra-progress-changed")); }
          ok.addEventListener("click", go); no.addEventListener("click", function () { p.hidden = true; });
          [n, w].forEach(function (i) { i.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } else if (e.key === "Escape") p.hidden = true; }); });
          p.append(mk("span", "", "Rename this family"), n, w, ok, no); n.focus(); n.select();
        } else {
          var only = P.lines().length < 2, go2 = mk("button", "ra-fam-b pri danger", "Remove " + labelOf(me)), no2 = mk("button", "ra-fam-b", "Keep it");
          go2.type = "button"; no2.type = "button";
          if (only) { p.append(mk("span", "", "This is your only family, so it cannot be removed. Rename it, or add another family first."), no2); no2.textContent = "OK"; }
          else {
            p.append(mk("span", "", "Remove " + labelOf(me) + " and the " + me.marks + (me.marks === 1 ? " mark" : " marks") + " made under it? The books and pages themselves stay, and other families keep theirs. This cannot be undone."), go2, no2);
            go2.addEventListener("click", function () {
              P.removeLine(me.slug); var rest = P.lines(); if (rest.length && !rest.some(function (l) { return l.active; })) P.setActive(rest[0].slug);
              p.hidden = true; draw(); document.dispatchEvent(new CustomEvent("ra-progress-changed"));
            });
          }
          no2.addEventListener("click", function () { p.hidden = true; });
        }
      }
      tool("Rename this family", "", function () { openPanel("rename"); }, "pen");
      tool("Remove this family", "danger", function () { openPanel("remove"); }, "bin");
      tool("Print or save as PDF", "", function () { window.print(); }, "print");
      var after = bar.querySelector(".ra-lines-n");
      bar.insertBefore(fam.who, sel); bar.insertBefore(fam.sess, sel); bar.insertBefore(fam.tools, sel);
      bar.append(fam.panel);
      if (after) bar.insertBefore(after, fam.panel);
    }
    function drawAdmin(me) {
      if (!fam) return;
      fam.who.textContent = me ? labelOf(me) : "No family chosen";
      fam.sess.textContent = "";
      if (me) {
        var ar = me.archives || [];
        if (ar.length) {
          fam.sess.append("From the research session" + (ar.length > 1 ? "s " : " "));
          ar.slice(0, 3).forEach(function (a, i) { if (i) fam.sess.append(", "); var s = String(a.name || a.id || a).replace(/^The /, ""), url = a.url || a.href; if (url) { var l = mk("a", "", s + " \u2197"); l.href = url; l.target = "_blank"; l.rel = "noopener"; fam.sess.append(l); } else fam.sess.append(s); });
        } else fam.sess.append(me.session ? "From a family research session" : "Started by you");
      }
      fam.tools.hidden = !me;
      /* the page's own title says whose research it is */
      var h = document.querySelector(".pagehead h1"), ttl = me ? "My research: " + labelOf(me) : "My research";
      if (h) h.textContent = ttl;
      var tail = /\s[|\u2014\u2013-]\s.*$/.exec(origTitle); document.title = ttl + (tail ? tail[0] : "");
    }

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
      drawAdmin(me);
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

    /* A mark was asked for while no family is chosen: nothing was written; ask which family it is for. */
    document.addEventListener("ra-need-family", function () {
      if (!bar.offsetParent || !pop.hidden) return;
      openPop(false); q.placeholder = "Which family is this for? Pick one"; setTimeout(function () { q.placeholder = "Find a family or a place"; }, 6000);
    });
    document.addEventListener("ra-progress-changed", draw);
    draw();
    }
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", start);
    else start();
  })();
