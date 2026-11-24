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
    var shownLines = [], at = -1, tgCount = null, SKEY = "ra-synopsis-scope";
    /* NOTHING CHOSEN YET MEANS THE FAMILY YOU ARE ON, which is what the page did before this existed. «All» is a choice, never the default. */
    function readScope() { try { var x = JSON.parse(localStorage.getItem(SKEY) || "null"); if (x && typeof x === "object") return x; } catch (e) { /* none */ } var a = P.active(); return { all: false, slugs: a ? [a] : [] }; }
    function writeScope(x) { try { localStorage.setItem(SKEY, JSON.stringify(x)); } catch (e) { /* storage blocked: lasts until the page closes */ } document.dispatchEvent(new CustomEvent("ra-scope-changed")); }
    var archChips = [];   /* the archive buttons in the open list: { b, slugs } */
    function archName(a) { return String(a.name).replace(/^The /, "").replace(/ Archive$/, ""); }
    /* AN ARCHIVE TICKS ALL ITS FAMILIES. Every family a research session publishes belongs to the archive that did the work (Mazza, Falco,
       D'Arcy...), so one press ticks every family under it, or unticks them when they are all ticked already; the other ticks are left alone. */
    function setMany(slugs, on) {
      var all = P.lines().map(function (l) { return l.slug; }), x = readScope(), cur = x.all ? all.slice() : (x.slugs || []).filter(function (s2) { return all.indexOf(s2) > -1; });
      slugs.forEach(function (s2) { var i = cur.indexOf(s2); if (on && i < 0) cur.push(s2); else if (!on && i > -1) cur.splice(i, 1); });
      writeScope({ all: cur.length === all.length, slugs: cur });
    }
    function inScope(slug) { var x = readScope(); return !!x.all || (x.slugs || []).indexOf(slug) > -1; }
    function toggleScope(slug) {
      var all = P.lines().map(function (l) { return l.slug; }), x = readScope(), cur = x.all ? all.slice() : (x.slugs || []).filter(function (s2) { return all.indexOf(s2) > -1; }), i = cur.indexOf(slug);
      if (i > -1) cur.splice(i, 1); else cur.push(slug);
      writeScope({ all: cur.length === all.length, slugs: cur });
    }
    /* the ticks and the count follow the stored set, whoever changed it (this list, or the tab) */
    function syncTicks() {
      var n = 0, tot = P.lines().length;
      [].forEach.call(list.querySelectorAll(".ra-cb-tog"), function (c) { c.checked = inScope(c.getAttribute("data-slug")); });
      var x = readScope(); n = x.all ? tot : (x.slugs || []).length;
      if (tgCount) tgCount.textContent = n + " of " + tot + " ticked";
      archChips.forEach(function (c) {
        var k = c.slugs.filter(inScope).length, state = k === c.slugs.length ? "true" : k ? "mixed" : "false";
        c.b.setAttribute("aria-pressed", state); c.b.classList.toggle("on", state === "true"); c.b.classList.toggle("part", state === "mixed");
      });
    }
    document.addEventListener("ra-scope-changed", syncTicks);
    document.addEventListener("ra-scope-changed", function () { if (fam) drawAdmin(P.lines().filter(function (l) { return l.active; })[0]); });
    window.addEventListener("storage", syncTicks);

    function labelOf(l) { return (l.name === "My research so far" ? "Research Names" : l.name) + (l.where ? " of " + l.where : ""); }
    function paintList() {
      var f = fold(q.value), lines = P.lines();
      shownLines = lines.filter(function (l) { return !f || fold(l.name + " " + l.where + " " + (l.archives || []).map(archName).join(" ")).indexOf(f) > -1; });   /* typing an archive's name finds its families */
      /* the ones made here, then the ones the family research sessions publish; each alphabetical. The headings show only when both exist. */
      var mine = shownLines.filter(function (l) { return !l.session; }), theirs = shownLines.filter(function (l) { return l.session; });
      shownLines = mine.concat(theirs);
      var heads = mine.length && theirs.length;
      list.textContent = ""; at = -1;
      /* SEVERAL AT ONCE IS A READING, NOT A FAMILY. Marks are made against ONE family (the one chosen by clicking its name, as always), so ticking
         families here does not change that one: it chooses which families My research reads together on its All families tab. The tick boxes, «Select
         all» and «Clear» only edit that set, which is kept in this browser (ra-synopsis-scope, shared with the tab). */
      if (lines.length > 1 && !f) {
        var lbl = bar.querySelector("a.ra-lines-l"), allHref = (lbl && lbl.getAttribute("href") || "/my-research/").split("#")[0] + "#all";
        var tg = mk("li", "ra-cb-all"), cnt = mk("span", "ra-cb-allcount"); tgCount = cnt;
        function bt(txt, fn) { var x = mk("button", "ra-cb-allbtn", txt); x.type = "button"; x.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); fn(); syncTicks(); }); return x; }
        var go = mk("a", "ra-cb-allgo", "Read together \u2192"); go.href = allHref;
        go.addEventListener("mousedown", function (e) { e.stopPropagation(); });
        /* ONE TOOLBAR LINE: the two edits on the left, how many are ticked and the way through on the right. The caption that used to sit above them is the tooltip. */
        tg.append(bt("Select all", function () { writeScope({ all: true, slugs: [] }); }), bt("Clear", function () { writeScope({ all: false, slugs: [] }); }), cnt, go);
        tg.title = "Read several together: tick families to read them as one on My research. Clicking a family's name still chooses the one you mark under.";
        list.append(tg);
        /* THE ARCHIVES, alphabetical: one button each, with how many of its families there are */
        archChips = [];
        var byArch = {}; lines.forEach(function (l) { (l.archives || []).forEach(function (a) { var k = archName(a); (byArch[k] = byArch[k] || []).push(l.slug); }); });
        var names = Object.keys(byArch).sort(function (a, b) { return a.localeCompare(b); });
        if (names.length) {
          var ar = mk("li", "ra-cb-arcs"); ar.append(mk("span", "ra-cb-arcs-l", "Tick a whole archive"));
          names.forEach(function (k) {
            var slugs = byArch[k], b = mk("button", "ra-cb-arcbtn", k + " \u00b7 " + slugs.length); b.type = "button";
            b.title = "Tick all " + slugs.length + (slugs.length === 1 ? " family" : " families") + " of the " + k + " archive, or untick them if they are all ticked";
            b.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); setMany(slugs, !slugs.every(inScope)); syncTicks(); });
            archChips.push({ b: b, slugs: slugs }); ar.append(b);
          });
          list.append(ar);
        }
        syncTicks();
      }
      shownLines.forEach(function (l, i) {
        if (heads && i === 0) list.append(mk("li", "ra-cb-grp", "Yours"));
        if (heads && i === mine.length) list.append(mk("li", "ra-cb-grp", "From the family research sessions"));
        var li = mk("li", "ra-cb-opt" + (l.active ? " is-on" : "")), main = mk("span", "ra-cb-main"), arc = mk("span", "ra-cb-arc");
        li.setAttribute("data-i", String(i));
        li.id = uidc + "-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", l.active ? "true" : "false");
        main.append(mk("b", null, l.name === "My research so far" ? "Research Names" : l.name)); if (l.where) main.append(mk("span", null, " of " + l.where));
        /* a family the sessions publish links to the archive that did the work (its own site, in a new tab); the Atlas holds no page per family */
        (l.archives || []).slice(0, 2).forEach(function (a) {
          var lk = mk("a", "ra-cb-arch", "\u2197 " + String(a.name).replace(/^The /, "").replace(/ Archive$/, "")); lk.href = a.url; lk.target = "_blank"; lk.rel = "noopener";
          lk.title = "Open " + a.name + " in a new tab";
          ["mousedown", "click"].forEach(function (t) { lk.addEventListener(t, function (e) { e.stopPropagation(); }); });
          arc.append(lk);
        });
        var tog = mk("input", "ra-cb-tog"); tog.type = "checkbox"; tog.checked = inScope(l.slug); tog.setAttribute("data-slug", l.slug);
        tog.setAttribute("aria-label", "Read " + l.name + " together with the others ticked");
        tog.addEventListener("mousedown", function (e) { e.stopPropagation(); e.preventDefault(); toggleScope(l.slug); syncTicks(); });
        tog.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); });
        tog.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.stopPropagation(); e.preventDefault(); toggleScope(l.slug); syncTicks(); } });
        li.append(tog, mk("span", "ra-cb-tick", l.active ? "\u2713" : ""), main, arc, mk("span", "ra-cb-n", l.marks + (l.marks === 1 ? " mark" : " marks")));
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
    /* CLICKING A NAME CHOOSES THAT ONE FAMILY. The ticks are for reading several together; a click on a name is a different, single choice, so the ticks are cleared (nothing ticked means the family you are on). */
    function choose(l) { writeScope({ all: false, slugs: [] }); P.setActive(l.slug); closePop(false); draw(); document.dispatchEvent(new CustomEvent("ra-progress-changed")); }
    function openPop(addMode) {
      cb.classList.add("is-open"); pop.hidden = false; btn.setAttribute("aria-expanded", "true"); q.value = ""; form.hidden = true; addBtn.hidden = false; paintList();
      /* KEEP IT ON THE SCREEN: the list is anchored to the button's left edge, and a button near the right of the header would push it off. */
      pop.style.left = "0px";
      var r = pop.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 8);
      if (over > 0) pop.style.left = Math.max(-over, -(r.left - 8)) + "px";
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
       last family. Merge folds this family into another (its pages, states and notes move across, nothing is lost), and Look for duplicates
       lists the families that are probably one, using the surname catalogue's «same» spellings as well as plain spelling. A whole-session
       view does not exist yet. */
    var isAdmin = bar.classList.contains("ra-lines-admin"), fam = null, origTitle = document.title;
    if (isAdmin) {
      fam = { who: mk("span", "ra-fam-who"), sess: mk("span", "ra-fam-sess"), tools: mk("span", "ra-fam-tools"), panel: mk("div", "ra-fam-panel") };
      fam.panel.hidden = true;
      /* round icon buttons, the same make as the header's Save, Read and Contrast; the words are the tooltip and the screen-reader name */
      var ICO = { pen: '<path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" />', bin: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />', print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />',
               merge: '<path d="M5 4c0 6 7 6 7 11v5M19 4c0 6-7 6-7 11" />', dup: '<path d="M9 9h10v11H9zM15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" />' };
      function tool(label, cls, fn, ico) {
        var b = mk("button", "ra-fam-b ra-fam-i" + (cls ? " " + cls : "")); b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
        b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICO[ico] + "</svg>";
        b.addEventListener("click", fn); fam.tools.append(b); return b;
      }
      function current() { return P.lines().filter(function (l) { return l.active; })[0]; }
      /* WHICH FAMILIES ARE PROBABLY ONE. Two families are suggested when their names are the same once capitals, accents, spaces and punctuation
         are ignored (D'Arcy and Darcy), or when the surname catalogue lists both spellings as the same family (status «same», never a
         spelling that was only seen). Two with different places are left alone: the place was given to tell them apart. A pair marked «not the
         same» is not offered again. */
      function squash(t) { return String(t || "").toLowerCase().replace(/\u0111/g, "d").replace(/\u0142/g, "l").replace(/\u00f8/g, "o").replace(/\u00df/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ""); }
      var GROUPS = null, groupsAsked = false;
      function loadGroups(then) {
        if (GROUPS) return then();
        if (groupsAsked) { return setTimeout(function () { then(); }, 400); }
        groupsAsked = true;
        var base = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
        fetch(base + "surname-groups.json").then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { GROUPS = (j && j.groups) || []; }).catch(function () { GROUPS = []; }).then(function () { then(); });
      }
      function notSame() { try { return JSON.parse(localStorage.getItem("ra-notsame") || "[]") || []; } catch (e) { return []; } }
      function pairKey(a, b) { return [a, b].sort().join("|"); }
      function suggestions() {
        var lines = P.lines(), ns = notSame(), out = [], seen = {};
        var groupOf = {}; (GROUPS || []).forEach(function (g, i) { g.forEach(function (k) { groupOf[k] = i; }); });
        for (var i = 0; i < lines.length; i++) for (var j = i + 1; j < lines.length; j++) {
          var a = lines[i], b = lines[j], ka = squash(a.name), kb = squash(b.name);
          if (!ka || !kb || ns.indexOf(pairKey(a.slug, b.slug)) > -1) continue;
          if (a.where && b.where && squash(a.where) !== squash(b.where)) continue;
          var why = ka === kb ? "Same name, apart from capitals, accents or punctuation" : (groupOf[ka] !== undefined && groupOf[ka] === groupOf[kb]) ? "The surname catalogue lists these as the same family" : "";
          if (!why || seen[pairKey(a.slug, b.slug)]) continue;
          seen[pairKey(a.slug, b.slug)] = 1;
          /* the one with more work is the one kept; on a tie, the one the sessions publish, then the first by name */
          var keep = a.marks !== b.marks ? (a.marks > b.marks ? a : b) : (a.session !== b.session ? (a.session ? a : b) : a), drop = keep === a ? b : a;
          out.push({ keep: keep, drop: drop, why: why });
        }
        return out;
      }
      function badge() {
        var t = fam.tools.querySelector(".ra-fam-dupbtn"); if (!t) return;
        var n = suggestions().length, bd = t.querySelector(".ra-fam-badge");
        if (!n) { if (bd) bd.remove(); return; }
        if (!bd) { bd = mk("span", "ra-fam-badge"); t.append(bd); }
        bd.textContent = String(n); t.title = n + (n === 1 ? " pair of families looks like one" : " pairs of families look like one") + ": look for duplicates";
      }
      function afterChange(p) { if (p) p.hidden = true; draw(); document.dispatchEvent(new CustomEvent("ra-progress-changed")); }
      /* a family that was ticked for reading together follows the merge, so the tick does not point at nothing */
      function mergeScope(from, into) {
        var x = readScope(); if (!x || !x.slugs) return;
        var i = x.slugs.indexOf(from); if (i < 0) return;
        x.slugs.splice(i, 1); if (x.slugs.indexOf(into) < 0) x.slugs.push(into); writeScope(x);
      }
      function doMerge(from, into, useName) {
        var f = P.lines().filter(function (l) { return l.slug === from; })[0], r = P.mergeLines(from, into);
        if (r && useName && f) P.renameLine(into, f.name, f.where);
        if (r) mergeScope(from, into);
        return r;
      }
      function openPanel(kind) {
        var me = current(); if (!me) return;
        var p = fam.panel; p.innerHTML = ""; p.hidden = false;
        if (kind === "merge") {
          var others = P.lines().filter(function (l) { return l.slug !== me.slug; });
          if (!others.length) { var ok0 = mk("button", "ra-fam-b", "OK"); ok0.type = "button"; ok0.addEventListener("click", function () { p.hidden = true; }); p.append(mk("span", "", "There is no other family to merge this one into."), ok0); return; }
          var sug = {}; suggestions().forEach(function (x) { if (x.drop.slug === me.slug) sug[x.keep.slug] = 1; else if (x.keep.slug === me.slug) sug[x.drop.slug] = 1; });
          others.sort(function (a, b) { return (sug[b.slug] ? 1 : 0) - (sug[a.slug] ? 1 : 0) || a.name.localeCompare(b.name); });
          var pick = mk("select"), keepName = mk("input"), kl = mk("label", "ra-fam-chk"), go3 = mk("button", "ra-fam-b pri", "Merge"), no3 = mk("button", "ra-fam-b", "Cancel"), say2 = mk("span", "ra-fam-say");
          pick.setAttribute("aria-label", "The family to merge into");
          others.forEach(function (l) { var o = mk("option", "", (sug[l.slug] ? "\u2713 looks the same \u00b7 " : "") + labelOf(l) + " (" + l.marks + (l.marks === 1 ? " mark)" : " marks)")); o.value = l.slug; pick.append(o); });
          keepName.type = "checkbox"; kl.append(keepName, " Keep the name \u201C" + labelOf(me) + "\u201D for the merged family");
          go3.type = "button"; no3.type = "button";
          function explain() {
            var t = others.filter(function (l) { return l.slug === pick.value; })[0]; if (!t) return;
            say2.textContent = "All " + me.marks + (me.marks === 1 ? " mark" : " marks") + " made under " + labelOf(me) + " move into " + labelOf(t) + "; pages are added together, nothing is lost, and " + labelOf(me) + " is removed. The books themselves are not touched. This cannot be undone, so back up first if you want to be safe.";
          }
          pick.addEventListener("change", explain); explain();
          go3.addEventListener("click", function () { var r = doMerge(me.slug, pick.value, keepName.checked); afterChange(p); });
          no3.addEventListener("click", function () { p.hidden = true; });
          p.append(mk("span", "", "Merge " + labelOf(me) + " into"), pick, kl, say2, go3, no3);
          pick.focus(); return;
        }
        if (kind === "dups") {
          var wait = mk("span", "", "Looking\u2026"); p.append(wait);
          loadGroups(function () {
            p.innerHTML = ""; var list = suggestions();
            var close = mk("button", "ra-fam-b", list.length ? "Close" : "OK"); close.type = "button"; close.addEventListener("click", function () { p.hidden = true; });
            if (!list.length) { p.append(mk("span", "", "No duplicates found: no two of your families share a name or a catalogued spelling."), close); return; }
            var ul = mk("ul", "ra-fam-dups");
            list.forEach(function (x) {
              var li = mk("li"), txt = mk("span", "ra-fam-dtxt"), m = mk("button", "ra-fam-b pri", "Merge into " + labelOf(x.keep)), n = mk("button", "ra-fam-b", "Not the same");
              m.type = "button"; n.type = "button";
              txt.append(mk("b", "", labelOf(x.keep)), " (" + x.keep.marks + ") and ", mk("b", "", labelOf(x.drop)), " (" + x.drop.marks + ") \u2014 " + x.why.toLowerCase() + ".");
              m.addEventListener("click", function () { doMerge(x.drop.slug, x.keep.slug, false); draw(); document.dispatchEvent(new CustomEvent("ra-progress-changed")); openPanel("dups"); });
              n.addEventListener("click", function () { var ns = notSame(); ns.push(pairKey(x.keep.slug, x.drop.slug)); try { localStorage.setItem("ra-notsame", JSON.stringify(ns)); } catch (e) { /* storage blocked: asked again next time */ } badge(); openPanel("dups"); });
              li.append(txt, m, n); ul.append(li);
            });
            p.append(mk("span", "", "These look like the same family:"), ul, close);
          });
          return;
        }
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
      tool("Merge this family into another", "", function () { openPanel("merge"); }, "merge");
      tool("Look for duplicate families", "ra-fam-dupbtn", function () { openPanel("dups"); }, "dup");
      tool("Remove this family", "danger", function () { openPanel("remove"); }, "bin");
      tool("Print or save as PDF", "", function () { window.print(); }, "print");
      var after = bar.querySelector(".ra-lines-n");
      bar.insertBefore(fam.who, sel); bar.insertBefore(fam.sess, sel); bar.insertBefore(fam.tools, sel);
      bar.append(fam.panel);
      if (after) bar.insertBefore(after, fam.panel);
    }
    /* THE FAMILIES THE PAGE IS READING, when more than one is ticked: the bar, the page title and the name card must say so, because the map and
       the lists below follow the ticks and not only the family you mark under. Fewer than two ticked means the one you mark under, as before. */
    function readSet() {
      var x = readScope(), ls = P.lines(), out = x && x.all ? ls : ls.filter(function (l) { return ((x && x.slugs) || []).indexOf(l.slug) > -1; });
      return out;
    }
    function joinNames(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
    function drawAdmin(me) {
      if (!fam) return;
      var set = readSet(), many = set.length > 1;
      bar.classList.toggle("ra-lines-many", many);
      fam.who.textContent = many ? joinNames(set.map(labelOf)) : me ? labelOf(me) : "No family chosen";
      fam.sess.textContent = "";
      if (many) {
        fam.sess.append("Reading " + set.length + " families together" + (me ? ". Your marks go under " + labelOf(me) + "." : "."));
      } else if (me) {
        var ar = me.archives || [];
        if (ar.length) {
          fam.sess.append("From the research session" + (ar.length > 1 ? "s " : " "));
          ar.slice(0, 3).forEach(function (a, i) { if (i) fam.sess.append(", "); var s = String(a.name || a.id || a).replace(/^The /, ""), url = a.url || a.href; if (url) { var l = mk("a", "", s + " \u2197"); l.href = url; l.target = "_blank"; l.rel = "noopener"; fam.sess.append(l); } else fam.sess.append(s); });
        } else fam.sess.append(me.session ? "From a family research session" : "Started by you");
      }
      fam.tools.hidden = !me;
      if (GROUPS) badge(); else loadGroups(badge);
      /* the page's own title says whose research it is */
      var h = document.querySelector(".pagehead h1"), ttl = many ? "My research: " + (set.length > 3 ? set.length + " families" : joinNames(set.map(labelOf))) : me ? "My research: " + labelOf(me) : "My research";
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
