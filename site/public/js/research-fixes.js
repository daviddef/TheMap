/* MY RESEARCH, THE SAVED TREE FIXES, AS ONE LINE. What the Fix list in the Tree Canvas found in a tree file is kept in this browser (ra-gedcom-fixes-v1,
 * written by roots/js/decisions.js while "Remember my decisions" is on): counts per kind of fix and place text as typed, never a person. It used to have a
 * tab of its own here. Now there is one line with the number left, a link to the Fix list, and the saved list in a shut fold under it, because this page is
 * the only place that saved copy can be read without opening the tree file again. Nothing is shown when there is nothing left to fix.
 * The old address #fixes (the Tree Canvas front page still uses it) opens the fold. #all, #sessions and #story, the other old tab addresses, land on the
 * research view; a story address scrolls to the stories. Place text is the reader's own, so every node is built with textContent. */
(function () {
  var script = document.currentScript, BASE = (script && script.getAttribute("data-base")) || "/";
  var FKEY = "ra-gedcom-fixes-v1", box = document.getElementById("mr-fixes");
  if (!box) return;
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function read() { try { var r = localStorage.getItem(FKEY), d = r && JSON.parse(r); return d && d.trees ? d : { v: 1, trees: {} }; } catch (e) { return { v: 1, trees: {} }; } }
  function rest(s) { return Math.max(0, (s.total || 0) - (s.done || 0) - (s.asis || 0)); }
  function leftIn(t) { return (t && t.sections || []).reduce(function (a, s) { return a + rest(s); }, 0); }

  function card(n, t) {
    var c = el("article", null, "mr-fx"), head = el("header", null, "mr-fx-head"), left = leftIn(t);
    head.append(el("h3", n), el("span", (left ? left + " left to fix" : "all done") + " · kept " + t.saved, "mr-fx-meta")); c.append(head);
    var groups = {}, order = [];
    (t.sections || []).forEach(function (s) { var g = s.group || "Other"; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(s); });
    order.forEach(function (g) {
      var gd = el("div", null, "mr-fx-group"); gd.append(el("h4", g));
      groups[g].forEach(function (s) {
        var r = rest(s), row = el("div", null, "mr-fx-row"), bar = el("span", null, "mr-fx-bar"), fill = el("i");
        fill.style.width = Math.round(100 * ((s.done || 0) + (s.asis || 0)) / Math.max(1, s.total)) + "%"; bar.append(fill);
        row.append(el("span", s.title, "mr-fx-t"), bar, el("span", r ? r + " of " + s.total + " left" : "all " + s.total + " done", "mr-fx-c" + (r ? "" : " ok"))); gd.append(row);
      });
      c.append(gd);
    });
    var pl = (t.places || []).filter(function (p) { return p.s === "o"; });
    if (pl.length) {
      var det = el("details", null, "mr-fx-places"), sm = el("summary"); sm.append(el("b", "Places to correct or choose "), el("span", "(" + pl.length + (pl.length >= 150 ? "+" : "") + ")", "muted")); det.append(sm);
      var ul = el("ul"); pl.slice(0, 60).forEach(function (p) { var li = el("li"); li.append(el("span", p.t, "mr-fx-raw")); if (p.to) li.append(" → ", el("b", p.to)); ul.append(li); });
      det.append(ul); if (pl.length > 60) det.append(el("p", "and " + (pl.length - 60) + " more in the Tree Canvas", "cap")); c.append(det);
    }
    var foot = el("p", null, "mr-fx-foot"), fg = el("button", "Forget this list"); fg.type = "button"; fg.className = "link";
    fg.onclick = function () { var x = read(); delete x.trees[n]; try { if (Object.keys(x.trees).length) localStorage.setItem(FKEY, JSON.stringify(x)); else localStorage.removeItem(FKEY); } catch (e) { /* blocked */ } draw(); };
    foot.append(fg); c.append(foot); return c;
  }

  function draw() {
    var was = box.querySelector("details.mr-fixsaved"), open = !!(was && was.open);
    var d = read(), names = Object.keys(d.trees).sort(function (a, b) { return String(d.trees[b].saved).localeCompare(String(d.trees[a].saved)); });
    var left = names.reduce(function (a, n) { return a + leftIn(d.trees[n]); }, 0);
    box.textContent = ""; box.hidden = !left;
    if (!left) return;
    var line = el("p", null, "mr-fixline");
    line.append(el("b", left.toLocaleString("en") + (left === 1 ? " fix" : " fixes") + " left in your " + (names.length === 1 ? "tree file" : "tree files") + "."), " ");
    var go = el("a", "Open the Fix list in the Tree Canvas"); go.href = BASE + "tree-canvas/?resume=1&to=fix"; line.append(go);
    var all = el("details", null, "mr-fixsaved"); all.open = open; all.append(el("summary", "What is saved here"));
    names.forEach(function (n) { all.append(card(n, d.trees[n])); });
    all.append(el("p", "Saved each time you open a tree and its Fix list. Places are listed as typed, people are only counted, and nothing leaves this browser. Switch “Remember my decisions on this device” off on the Fix list to stop.", "cap"));
    box.append(line, all);
  }

  /* THE OLD ADDRESSES. The page had tabs; their addresses still have somewhere to land. #fixes opens the saved list (or the top of the page when there is
     nothing to fix), #story and #story/<id> scroll to the stories, #all and #sessions are the research view itself. Nothing here rewrites the address. */
  function landOld() {
    var g = (location.hash || "").replace("#", ""), to = null;
    if (g === "fixes") { var d = box.querySelector("details.mr-fixsaved"); if (d) { d.open = true; to = box; } }
    else if (/^story(\/|$)/.test(g)) to = document.getElementById("mr-stories");
    moved = false;
    if (to) setTimeout(function () { follow(to, 10, null); }, 400);
  }
  /* The map and the lists above are still being drawn, so the target keeps moving down the page for a while: follow it for a few seconds, only when it has
     moved, and never once the reader has taken the page somewhere else. */
  var moved = false;
  function follow(to, tries, last) {
    if (moved || !to.scrollIntoView) return;
    var at = to.getBoundingClientRect ? Math.round(to.getBoundingClientRect().top + (window.scrollY || 0)) : 0;
    if (at !== last) to.scrollIntoView({ block: "start" });
    if (tries > 1) setTimeout(function () { follow(to, tries - 1, at); }, 600);
  }

  draw(); landOld();
  ["wheel", "touchstart", "keydown", "pointerdown"].forEach(function (e) { window.addEventListener(e, function () { moved = true; }, { passive: true }); });
  window.addEventListener("storage", draw);
  window.addEventListener("hashchange", landOld);
})();
