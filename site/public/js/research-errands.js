/* ERRANDS, IN THE RESEARCH VIEW ON /my-research/. A letter to «where the record is»: started from the pencil beside an institution (on the map's
   «Where the paper is» rows and on the story page's sources, which link here with ?errand=<provider id>), drafted from the plain template in
   errands.js, edited here, and kept with the research with a status: to do, drafted, sent, answered.

   Nothing is sent from here. «Open in my e-mail» hands the letter to the reader's own mail program; «Mark as sent» is the reader saying so,
   and it also marks the institution «written, no reply» in the research (progress-kit.js), where the letters list already looks.

   Everything is built with textContent: the institution's name and the reader's words are never trusted as markup. */
(function () {
  "use strict";
  var host = document.getElementById("mr-errands"), P = window.raProgress, E = window.raErrands;
  if (!host || !P || !E) return;
  var BASE = (host.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var confirmDel = null, openId = null, note = "", PROVS = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function day(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
  function nm(l) { return l.name === "My research so far" ? "Research Names" : l.name; }
  function lineInfo(slug) { var r = null; P.lines().forEach(function (l) { if (l.slug === slug) r = l; }); return r; }
  function getProviders() {
    if (PROVS) return Promise.resolve(PROVS);
    return fetch(BASE + "providers.json").then(function (r) { return r.json(); }).then(function (d) { PROVS = {}; (d.providers || []).forEach(function (p) { PROVS[p.id] = p; }); return PROVS; })
      .catch(function () { PROVS = {}; return PROVS; });
  }

  /* A letter marked sent is a «written, no reply» mark in the research for that family: the same list the rest of My research already reads. */
  function markWritten(e) {
    if (!e.pid || !e.line || !lineInfo(e.line)) return;
    var prev = P.active();
    try { P.setActive(e.line); P.setWhat("source:" + e.pid, { t: e.name || e.pid }); P.setState("source:" + e.pid, "written"); } catch (x) { /* the research is unchanged; the errand still says sent */ }
    try { if (prev && prev !== e.line) P.setActive(prev); } catch (x) { /* none */ }
  }

  /* ?errand=<provider id> from the pencil: the open letter for this institution and family if there is one, else a new draft */
  function fromLink() {
    var q; try { q = new URLSearchParams(location.search); } catch (x) { return Promise.resolve(); }
    var pid = q.get("errand"); if (!pid) return Promise.resolve();
    var line = P.active() || "";
    var have = E.open(pid, line);
    var strip = function () { try { var u = new URL(location.href); u.searchParams.delete("errand"); history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); } catch (x) { /* leave it */ } };
    if (have) { openId = have.id; strip(); return Promise.resolve(); }
    return getProviders().then(function (pv) {
      var p = pv[pid]; strip();
      if (!p) { note = "That institution is not in the directory, so there is no letter to start."; return; }
      var li = line && lineInfo(line);
      var id = E.create({ pid: pid, inst: p.name, line: line, family: li ? nm(li) : "", where: li && li.where || "", to: p.em && p.em[0] ? p.em[0][0] : "", url: p.url });
      if (id) openId = id;
    });
  }

  function statusBar(e) {
    var bar = el("div", "mre-steps"); bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "Where this letter stands");
    E.STATUS.forEach(function (s) {
      var b = el("button", "mre-step" + (s === e.status ? " mre-on" : ""), E.SAY[s]); b.type = "button"; b.setAttribute("aria-pressed", s === e.status ? "true" : "false");
      b.addEventListener("click", function () {
        if (s === e.status) return;
        E.update(e.id, { status: s }); if (s === "sent") markWritten(E.get(e.id));
      });
      bar.append(b);
    });
    return bar;
  }

  function card(e) {
    var c = el("article", "mre-card"), head = el("div", "mre-head"), t = el("h4", "mre-name"); c.setAttribute("data-id", e.id);
    if (e.url) { var a = el("a", null, e.name || e.pid); a.href = e.url; a.rel = "noopener"; t.append(a); } else t.textContent = e.name || e.pid;
    head.append(t);
    var li = e.line && lineInfo(e.line); if (li) head.append(el("span", "mre-fam", nm(li)));
    c.append(head);
    var dates = ["Started " + day(e.created)];
    if (e.sent) dates.push("sent " + day(e.sent)); if (e.answered) dates.push("answered " + day(e.answered));
    c.append(el("p", "mre-meta", dates.join(" · ")), statusBar(e));

    var det = el("details", "mre-letter"); det.open = openId === e.id;
    det.addEventListener("toggle", function () { if (det.open) openId = e.id; else if (openId === e.id) openId = null; });
    det.append(el("summary", null, "The letter"));

    var lab1 = el("label", "mre-lab", "To (an e-mail address, if you have one)"), to = el("input", "mre-in"); to.type = "email"; to.value = e.to || ""; to.placeholder = "name@institution.example"; to.autocomplete = "off";
    lab1.append(to);
    var lab2 = el("label", "mre-lab", "Subject"), sub = el("input", "mre-in"); sub.type = "text"; sub.value = e.subject; lab2.append(sub);
    var lab3 = el("label", "mre-lab", "Letter"), body = el("textarea", "mre-body"); body.value = e.body; body.rows = 16; lab3.append(body);
    var left = el("p", "mre-left"), paint = function () {
      var n = E.unfilled(body.value);
      left.textContent = n ? n + (n === 1 ? " [bracket] is still to fill in before this is ready to send." : " [brackets] are still to fill in before this is ready to send.") : "No [brackets] left. Read it once more, then send it from your own e-mail.";
      left.className = "mre-left" + (n ? " mre-warn" : "");
    };
    paint();
    var keep = function () { E.update(e.id, { to: to.value.trim(), subject: sub.value, body: body.value }); };
    [to, sub, body].forEach(function (x) { x.addEventListener("input", function () { paint(); keep(); }); });
    det.append(lab1, lab2, lab3, left);

    var row = el("div", "mre-row");
    var mail = el("a", "mrs-btn mrs-pri", "Open in my e-mail"); mail.rel = "noopener";
    var setMail = function () { var cur = { to: to.value.trim(), subject: sub.value, body: body.value }; mail.href = cur.to ? E.mailto(cur) : "#"; mail.setAttribute("aria-disabled", cur.to ? "false" : "true"); mail.title = cur.to ? "Your e-mail program opens with this letter ready. Nothing is sent until you press send there." : "Add an address above first. Many institutions take requests only by post or through a form: their site says."; };
    setMail(); [to, sub, body].forEach(function (x) { x.addEventListener("input", setMail); });
    mail.addEventListener("click", function (ev) { if (mail.getAttribute("aria-disabled") === "true") ev.preventDefault(); });
    var copy = el("button", "mrs-btn", "Copy the letter"); copy.type = "button";
    copy.addEventListener("click", function () {
      var text = sub.value + "\n\n" + body.value, done = function (ok) { copy.textContent = ok ? "Copied" : "Select the letter and copy it"; setTimeout(function () { copy.textContent = "Copy the letter"; }, 2200); };
      try { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { body.select(); done(false); }); } catch (x) { body.select(); done(false); }
    });
    row.append(mail, copy);
    if (confirmDel === e.id) {
      var sure = el("button", "mrs-btn mrs-danger", "Yes, delete it"), no = el("button", "mrs-btn", "Keep it"); sure.type = "button"; no.type = "button";
      sure.addEventListener("click", function () { E.remove(e.id); confirmDel = null; });
      no.addEventListener("click", function () { confirmDel = null; draw(); });
      row.append(el("span", "mrs-ask", "Delete this letter? This cannot be undone."), sure, no);
    } else {
      var del = el("button", "mrs-link", "Delete this errand"); del.type = "button"; del.addEventListener("click", function () { confirmDel = e.id; draw(); }); row.append(del);
    }
    det.append(row);
    var lab4 = el("label", "mre-lab", "Notes (a reply, a reference number, a fee)"), nt = el("textarea", "mre-notes"); nt.value = e.note || ""; nt.rows = 2; lab4.append(nt);
    nt.addEventListener("input", function () { E.update(e.id, { note: nt.value }); });
    det.append(lab4);
    c.append(det);
    return c;
  }

  function draw() {
    host.textContent = "";
    var all = E.list(), h = el("section", "mre");
    h.append(el("h2", "mr-h", "Errands"));
    h.append(el("p", "cap", "Letters to where the record is. Press the pencil beside an institution in “Where the paper is” and a plain letter is drafted here for you to finish. Nothing is sent from the Atlas: you send it from your own e-mail, then say so here."));
    if (note) { h.append(el("p", "mre-note", note)); }
    if (!all.length) { h.append(el("p", "cap", "No errands yet.")); host.append(h); return; }
    E.STATUS.slice().forEach(function (s) {
      var group = all.filter(function (e) { return e.status === s; }); if (!group.length) return;
      h.append(el("h3", "mrs-sub", E.SAY[s] + " (" + group.length + ")"));
      group.forEach(function (e) { h.append(card(e)); });
    });
    host.append(h);
  }

  /* an edit made in a box here redraws nothing (the box would lose its place); a change from elsewhere, or a button here, does */
  var redraw = function () { var a = document.activeElement; if (a && host.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return; draw(); };
  document.addEventListener("ra-errands-changed", redraw);
  window.addEventListener("storage", redraw);
  var go = function () {
    fromLink().then(function () {
      draw();
      var c = openId && host.querySelector('[data-id="' + openId + '"]');
      if (c) { try { c.scrollIntoView({ block: "start" }); } catch (x) { /* older browsers */ } }
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
