/* ERRANDS: a letter to «where the record is», drafted from a plain template, kept with the research, and nothing sent for you.

   An errand is one institution (a provider in the Atlas), the family research (line) it is for, the letter as the reader has it now (a
   subject and a body they can change), where it goes (an address, if we know one), and where it stands: to do, drafted, sent, answered.
   The Atlas never sends anything. «Open in my e-mail» hands the letter to the reader's own mail program, which they send or not; «sent»
   is something they say. Only text is kept; no person is looked up or filled in: the template leaves [brackets] for who, when and where,
   and the reader fills them.

   Stored under `ra-errands-v1` and carried in the research file (research-file.js) so it is backed up, shared between devices and
   encrypted with the six words when the reader has sync on. Removals are remembered (`gone`) so a merge cannot bring one back.

   A classic script (one <script> tag, evaluated by the tests); it touches localStorage only when asked to. */
(function (root) {
  "use strict";
  var KEY = "ra-errands-v1", STATUS = ["todo", "drafted", "sent", "answered"];
  var SAY = { todo: "To do", drafted: "Drafted", sent: "Sent", answered: "Answered" };
  var MAX = 120, SUBJ_MAX = 200, BODY_MAX = 6000, NOTE_MAX = 1000;

  function now() { return new Date().toISOString(); }
  function rid() { var a = new Uint8Array(6); (root.crypto || { getRandomValues: function (x) { for (var i = 0; i < x.length; i++) x[i] = Math.floor(Math.random() * 256); } }).getRandomValues(a); return "e" + Array.prototype.map.call(a, function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join(""); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function str(x, max) { return String(x == null ? "" : x).replace(/\s+$/g, "").slice(0, max); }
  function empty() { return { v: 1, errands: {}, gone: {} }; }

  /* The letter. A plain template, no model: it says who is writing about whom and what is asked, and leaves what only the reader knows in
     [square brackets]. `o`: inst (the institution's name), family (the family research's name), where (the place the family is from, if known). */
  function draft(o) {
    o = o || {};
    var inst = str(o.inst, MAX).trim() || "your institution", fam = str(o.family, MAX).trim(), where = str(o.where, MAX).trim();
    var who = fam ? "the " + fam + " family" : "[family name]";
    var from = where ? " of " + where : "";
    var subject = "Request for a search of records: " + (fam ? fam + " family" : "[family name]") + (where ? ", " + where : "");
    var body = [
      "Dear Sir or Madam,",
      "",
      "I am researching " + who + from + ". I am writing to ask whether " + inst + " holds records that could help, and how I can ask for a search.",
      "",
      "What I am looking for:",
      "- [the person's name, as it may be written in the register]",
      "- [the kind of record: baptism, marriage, burial, land, passenger list, …]",
      "- [the year or years, and the place]",
      "- [how that person was related to me, if you need to know]",
      "",
      "Could you please tell me:",
      "1. whether you hold these records, and the years they cover;",
      "2. whether I can ask for a search or for copies by e-mail, and the fee, if there is one;",
      "3. how I can pay from [my country].",
      "",
      "If you are not the right office, I would be grateful to be pointed to the one that is.",
      "",
      "Thank you for your time.",
      "",
      "Yours faithfully,",
      "[your name]",
      "[your address]"
    ].join("\n");
    return { subject: subject, body: body };
  }
  /* How many [brackets] are still to fill: a letter with some left is not ready to send. */
  function unfilled(text) { return (String(text || "").match(/\[[^\]\n]{1,80}\]/g) || []).length; }
  /* The link that hands the letter to the reader's own mail program. Long letters are cut by some programs, so the page also offers copy. */
  function mailto(e) {
    if (!e || !e.to) return "";
    return "mailto:" + encodeURIComponent(e.to).replace(/%40/g, "@") + "?subject=" + encodeURIComponent(e.subject || "") + "&body=" + encodeURIComponent(e.body || "");
  }

  /* What a stored or received document is allowed to hold. Anything else is dropped, so a hand-edited file cannot put markup or a huge string in. */
  function clean(d) {
    var out = empty();
    if (!d || typeof d !== "object") return out;
    Object.keys(d.gone || {}).forEach(function (i) { if (typeof d.gone[i] === "string") out.gone[String(i).slice(0, 40)] = d.gone[i].slice(0, 30); });
    var n = 0;
    Object.keys(d.errands || {}).forEach(function (id) {
      var e = d.errands[id]; if (!e || typeof e !== "object" || n >= 300) return;
      var r = { id: String(e.id || id).slice(0, 40), pid: str(e.pid, 100), name: str(e.name, MAX), line: str(e.line, 80), to: str(e.to, 160),
                subject: str(e.subject, SUBJ_MAX), body: str(e.body, BODY_MAX), note: str(e.note, NOTE_MAX),
                status: STATUS.indexOf(e.status) > -1 ? e.status : "todo", created: str(e.created, 30), updated: str(e.updated, 30) };
      if (typeof e.url === "string" && /^https?:\/\//.test(e.url)) r.url = e.url.slice(0, 300);
      if (e.sent) r.sent = str(e.sent, 30);
      if (e.answered) r.answered = str(e.answered, 30);
      if (out.gone[r.id] && out.gone[r.id] >= r.updated) return;
      out.errands[r.id] = r; n++;
    });
    return out;
  }

  /* Two copies (this device and another): an errand by id, the later `updated` winning; one removed after it was last changed stays removed. */
  function merge(mine, theirs) {
    mine = clean(mine); theirs = clean(theirs);
    var out = empty();
    [mine.gone, theirs.gone].forEach(function (g) { Object.keys(g).forEach(function (i) { if (!out.gone[i] || g[i] > out.gone[i]) out.gone[i] = g[i]; }); });
    var ids = {}; Object.keys(mine.errands).concat(Object.keys(theirs.errands)).forEach(function (i) { ids[i] = 1; });
    Object.keys(ids).forEach(function (id) {
      var a = mine.errands[id], b = theirs.errands[id], win = !a ? b : !b ? a : ((b.updated || "") > (a.updated || "") ? b : a);
      if (out.gone[id] && out.gone[id] >= (win.updated || "")) return;
      out.errands[id] = clone(win);
    });
    return clean(out);
  }

  var api = { KEY: KEY, STATUS: STATUS, SAY: SAY, draft: draft, unfilled: unfilled, mailto: mailto, clean: clean, merge: merge, empty: empty };

  /* ---- the store, in the browser ------------------------------------------------------------------------------------------------ */
  if (root.document) {
    var ls = function () { try { return root.localStorage; } catch (e) { return null; } };
    var read = function () { var s = ls(); try { return clean(JSON.parse(s.getItem(KEY) || "null")); } catch (e) { return empty(); } };
    var write = function (d) {
      var s = ls(); if (!s) return false;
      try { s.setItem(KEY, JSON.stringify(clean(d))); } catch (e) { return false; }
      try { root.document.dispatchEvent(new root.CustomEvent("ra-errands-changed")); root.document.dispatchEvent(new root.CustomEvent("ra-progress-changed")); } catch (e) { /* not in a page */ }   // the second is what makes a saved sync pick the change up
      return true;
    };
    api.load = read;
    api.list = function () { var d = read(); return Object.keys(d.errands).map(function (i) { return d.errands[i]; }).sort(function (a, b) { return String(b.updated).localeCompare(String(a.updated)); }); };
    api.get = function (id) { return read().errands[id] || null; };
    /* the one errand still open (to do or drafted) for this institution and family, so pressing «write» twice opens the same letter */
    api.open = function (pid, line) {
      var l = api.list().filter(function (e) { return e.pid === pid && e.line === (line || "") && (e.status === "todo" || e.status === "drafted"); });
      return l.length ? l[0] : null;
    };
    api.create = function (o) {
      o = o || {}; var d = read(), id = rid(), t = now(), L = draft(o);
      d.errands[id] = { id: id, pid: str(o.pid, 100), name: str(o.inst, MAX), line: str(o.line, 80), to: str(o.to, 160), subject: L.subject, body: L.body,
                        note: "", status: "drafted", created: t, updated: t };
      if (o.url) d.errands[id].url = o.url;
      return write(d) ? id : null;
    };
    api.update = function (id, patch) {
      var d = read(), e = d.errands[id]; if (!e) return false;
      ["subject", "body", "note", "to"].forEach(function (k) { if (patch && patch[k] != null) e[k] = patch[k]; });
      if (patch && patch.status && STATUS.indexOf(patch.status) > -1 && patch.status !== e.status) {
        e.status = patch.status;
        if (e.status === "sent") e.sent = now();
        if (e.status === "answered") e.answered = now();
      }
      e.updated = now(); d.errands[id] = e; return write(d);
    };
    api.remove = function (id) { var d = read(); if (!d.errands[id]) return false; delete d.errands[id]; d.gone[id] = now(); return write(d); };
    api.mergeIn = function (theirs) { var d = merge(read(), theirs); return write(d) ? Object.keys(d.errands).length : 0; };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raErrands = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
