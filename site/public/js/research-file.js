/* THE RESEARCH FILE: one dated backup of everything this browser holds, and packs of it to share.

   WHY THIS EXISTS. A reader's marks live in localStorage (`ra-progress-v1`), per address. A private window, cleared site
   data, a new computer, or the move from daviddef.github.io to recordatlas.org (6 Oct 2026) leaves them behind, and the only
   way out was an Export button nobody was reminded to press. This module makes the file complete, tells the page how stale
   the last backup is, and makes packs a reader can hand to someone else.

   THE FILE STAYS v2 AND ADDITIVE. `lines`, `active`, `marks` are exactly what progress-kit's fromJSON reads, so every file
   ever exported, and the published research-sessions.json, still imports. New, optional fields: `kind`, `decisions` (the
   tree viewer's fix-it decisions, hashed: see roots/js/decisions.js) and `pack` (what a pack holds and what it leaves out).

   A PACK IS NOT A BACKUP. It holds only what a progress mark already holds: which volume, which pages, what state, when,
   under which family line. It never holds the fix-it decisions (those describe somebody's tree), and it leaves the free-text
   notes out unless the sender ticks them in, because a note is where a person's name ends up.

   Pure functions at the top (tested in node: test/research-file.test.js); the browser glue is at the bottom. */
(function (root) {
  "use strict";
  var KEY_DEC = "ra-fix-decisions-v1", KEY_BACKUP = "ra-backup-v1", KEY_MYA = "ra-areas-v1", KEY_GED = "ra-gedcom-names-v1";
  var DAY = 86400000;

  function today(now) { return new Date(now || Date.now()).toISOString().slice(0, 10); }

  /* A cheap, stable fingerprint of the research, to tell "changed since the last backup" from "same". */
  function hash(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }
  function sigOf(progress, decisions) {
    return hash(stable({ l: progress.lines || {}, m: progress.marks || {}, d: decisions || {} }));
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hasWork(b) { return b && ((b.done && b.done.length) || b.state || b.note); }

  /* The whole backup: every line, every mark, and the fix-it decisions if there are any. */
  function buildBackup(progress, decisions, now, extras) {
    var out = { v: 2, kind: "record-atlas-research", exported: today(now), lines: clone(progress.lines || {}), active: progress.active, marks: clone(progress.marks || {}) };
    if (decisions && Object.keys(decisions).length) out.decisions = clone(decisions);
    /* THE MAP'S OWN SAVES, ADDITIVE AND OPTIONAL. Named areas (corners only) and saved views (a centre and a zoom), the deletions that keep a
       delete from being undone by another device, and the NAMES (never the contents) of the GEDCOM files last used in Roots & Routes, so a new
       device can say which files to add again. Nothing about a person: a file name is whatever the reader called the file. */
    extras = extras || {};
    var m = extras.mya;
    if (m && (Object.keys(m.areas || {}).length || Object.keys(m.views || {}).length || Object.keys(m.gone || {}).length)) {
      out.areas = clone(m.areas || {}); out.views = clone(m.views || {});
      if (Object.keys(m.gone || {}).length) out.gone = clone(m.gone);
    }
    if (extras.gedcoms && extras.gedcoms.length) out.gedcoms = clone(extras.gedcoms.slice(0, GED_MAX));
    var st = cleanSites(extras.sites);
    if (st) out.sites = st;
    return out;
  }
  var GED_MAX = 20;
  /* The link settings from the Roots & Routes page: the MyHeritage profile link last pasted (it carries the site and tree number the checklist
     links are built from) and the regional Ancestry site. A choice from a short list and one pasted address, nothing read from a GEDCOM. */
  var SITES = ["com.au", "com", "co.uk", "ca"];
  function cleanSites(x) {
    if (!x || typeof x !== "object") return null;
    var out = {}, mh = typeof x.mh === "string" ? x.mh.trim().slice(0, 600) : "";
    if (/^https?:\/\/[^\s]+$/i.test(mh)) out.mh = mh;
    if (SITES.indexOf(x.anc) >= 0) out.anc = x.anc;
    return Object.keys(out).length ? out : null;
  }
  /* Areas and views by id, the later `upd` winning; a deletion (gone[id]) removes an item last updated before it. */
  function mergeMya(mine, theirs) {
    mine = mine || {}; theirs = theirs || {};
    var out = { v: 1, areas: {}, views: {}, gone: {} };
    ["areas", "views"].forEach(function (k) {
      var a = mine[k] || {}, b = theirs[k] || {}, ids = {};
      Object.keys(a).concat(Object.keys(b)).forEach(function (i) { ids[i] = 1; });
      Object.keys(ids).forEach(function (i) {
        var x = a[i], y = b[i];
        out[k][i] = clone(!x ? y : !y ? x : ((y.upd || "") > (x.upd || "") ? y : x));
      });
    });
    [mine.gone || {}, theirs.gone || {}].forEach(function (g) {
      Object.keys(g).forEach(function (i) { if (!out.gone[i] || g[i] > out.gone[i]) out.gone[i] = g[i]; });
    });
    Object.keys(out.gone).forEach(function (i) {
      ["areas", "views"].forEach(function (k) { if (out[k][i] && out.gone[i] >= (out[k][i].upd || "")) delete out[k][i]; });
    });
    return out;
  }
  /* GEDCOM file names, newest first, one per name and size. */
  function mergeGedcoms(mine, theirs) {
    var by = {};
    (mine || []).concat(theirs || []).forEach(function (g) {
      if (!g || !g.name) return;
      var k = g.name + "|" + (g.size || 0);
      if (!by[k] || String(g.saved || "") > String(by[k].saved || "")) by[k] = { name: String(g.name).slice(0, 200), size: g.size || 0, saved: g.saved || "" };
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return String(b.saved).localeCompare(String(a.saved)); }).slice(0, GED_MAX);
  }

  /* A pack: everything, or one family line. Notes only if asked. Never the decisions. */
  function buildPack(progress, opts, now) {
    opts = opts || {};
    var line = opts.line || null, notes = !!opts.notes;
    var out = { v: 2, kind: "record-atlas-pack", exported: today(now), lines: {}, marks: {},
                pack: { scope: line ? "line" : "all", notes: notes, says: "Reported by the sender, not checked." } };
    var lines = progress.lines || {};
    Object.keys(lines).forEach(function (s) { if (!line || s === line) out.lines[s] = clone(lines[s]); });
    if (line && !out.lines[line]) throw new Error("No such family line.");
    out.active = line || progress.active;
    Object.keys(progress.marks || {}).forEach(function (k) {
      var m = progress.marks[k], by = {}, any = false;
      Object.keys(m.by || {}).forEach(function (s) {
        if (line && s !== line) return;
        var b = m.by[s]; if (!hasWork(b)) return;
        var c = clone(b); if (!notes) delete c.note;
        if (c.done || c.state || c.note) { by[s] = c; any = true; }
      });
      var walked = (m.walked || []).length > 0;
      if (!any && !walked) return;
      var cm = { by: by };
      ["t", "where", "href", "total"].forEach(function (f) { if (m[f] !== undefined) cm[f] = m[f]; });
      if (walked) cm.walked = clone(m.walked);
      out.marks[k] = cm;
    });
    return out;
  }

  function summary(file) {
    var marks = Object.keys(file.marks || {}), notes = 0, pages = 0;
    marks.forEach(function (k) {
      var m = file.marks[k];
      (m.walked || []).forEach(function (r) { pages += r[1] - r[0] + 1; });
      Object.keys(m.by || {}).forEach(function (s) {
        var b = m.by[s]; if (b.note) notes++;
        (b.done || []).forEach(function (r) { pages += r[1] - r[0] + 1; });
      });
    });
    return { lines: Object.keys(file.lines || {}).length, volumes: marks.length, notes: notes, pages: pages,
             decisions: Object.keys(file.decisions || {}).length, areas: Object.keys(file.areas || {}).length,
             views: Object.keys(file.views || {}).length, gedcoms: (file.gedcoms || []).length, sites: file.sites ? Object.keys(file.sites).length : 0 };
  }

  /* A file from anywhere: an export, a pack, the published sessions file, or what save-browser-storage.js downloaded. */
  function parseAny(text) {
    var d = JSON.parse(text), decisions = null;
    if (d && d.data && typeof d.data === "object" && d.data["ra-progress-v1"]) {          // a raw copy of browser storage
      var inner = d.data["ra-progress-v1"];
      var p = typeof inner === "string" ? JSON.parse(inner) : inner;
      if (d.data[KEY_DEC]) { try { var dd = JSON.parse(d.data[KEY_DEC]); decisions = dd && dd.rows || null; } catch (e) { /* unreadable: skip */ } }
      d = p;
    } else if (d && d.decisions) decisions = d.decisions;
    if (!d || !d.marks || typeof d.marks !== "object") throw new Error("not a Record Atlas research file");
    var mya = d.areas || d.views || d.gone ? { v: 1, areas: d.areas || {}, views: d.views || {}, gone: d.gone || {} } : null;
    return { progress: d, decisions: decisions, mya: mya, gedcoms: Array.isArray(d.gedcoms) ? d.gedcoms : null, sites: cleanSites(d.sites), kind: d.kind || (d.lines ? "export" : "old export") };
  }

  /* Union of two decision tables: a row decided on either device stays decided; the later date wins a tie. */
  function mergeDecisions(mine, theirs) {
    var out = clone(mine || {});
    Object.keys(theirs || {}).forEach(function (h) {
      var a = out[h], b = theirs[h];
      if (!a) { out[h] = clone(b); return; }
      if (b.a) a.a = 1; if (b.d) a.d = 1;
      if (b.t && (!a.t || b.t > a.t)) a.t = b.t;
    });
    return out;
  }

  /* How stale is the last backup? level: ok | nudge | urgent.

     "OWN WORK" IS TIMED, NOT COMPARED. The site folds the family archives' published sessions into every reader's store, so
     "has marks" is true for everyone and says nothing about whether the reader has done anything. progress-kit.js stamps
     `ra-own-first` and `ra-own-last` on a change the reader made (never on the fold-in), and the nudge is about those.
       rec  = {at}  the last backup;  own = {first, last}  ISO times of the reader's first and latest own change, or null.
     A reader who has never changed anything is never nudged. Never backed up: a nudge after a day, urgent after a week.
     Backed up but changed since: a nudge after a week, urgent after a month. */
  function status(rec, own, hasMarks, now) {
    now = now || Date.now();
    var ownFirst = own && own.first ? Date.parse(own.first) : null, ownLast = own && own.last ? Date.parse(own.last) : null;
    var days = function (t) { return Math.floor((now - t) / DAY); };
    if (!rec || !rec.at) {
      if (!hasMarks) return { level: "ok", never: true, days: null, changed: false, text: "Nothing to back up yet." };
      var d0 = ownFirst ? days(ownFirst) : null;
      var level0 = d0 === null ? "nudge" : d0 >= 7 ? "urgent" : d0 >= 1 ? "nudge" : "ok";
      return { level: level0, never: true, days: null, changed: true, text: "Never backed up. This browser is the only copy." };
    }
    var at = Date.parse(rec.at), since = days(at), changed = !!(ownLast && ownLast > at);
    if (!changed) return { level: "ok", never: false, days: since, changed: false, text: "Backed up " + ago(since) + ", and nothing of yours has changed since." };
    var level = since >= 30 ? "urgent" : since >= 7 ? "nudge" : "ok";
    return { level: level, never: false, days: since, changed: true, text: "Last backed up " + ago(since) + ". You have changed things since." };
  }
  function ago(d) { return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"; }

  /* Links: a small pack travels in the part of the address after the #, which a server never receives. */
  function b64url(bytes) {
    var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64url(t) {
    t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "=";
    var s = atob(t), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a;
  }
  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function encodeLink(file) {
    var bytes = new TextEncoder().encode(JSON.stringify(file));
    if (typeof CompressionStream === "function")
      return pipe(bytes, new CompressionStream("deflate-raw")).then(function (z) { return "z." + b64url(z); });
    return Promise.resolve("p." + b64url(bytes));
  }
  function decodeLink(t) {
    var kind = t.slice(0, 2), body = t.slice(2), bytes;
    try { bytes = unb64url(body); } catch (e) { return Promise.reject(new Error("The link is damaged.")); }
    var done = kind === "z." ? pipe(bytes, new DecompressionStream("deflate-raw")) : kind === "p." ? Promise.resolve(bytes) : Promise.reject(new Error("Not a Record Atlas pack link."));
    return done.then(function (b) { return new TextDecoder().decode(b); });
  }
  var LINK_MAX = 6000;     // characters of address: beyond this, browsers and mail clients start to cut links, so the file is the way

  var api = { hash: hash, sigOf: sigOf, buildBackup: buildBackup, buildPack: buildPack, summary: summary, parseAny: parseAny,
              mergeDecisions: mergeDecisions, mergeMya: mergeMya, mergeGedcoms: mergeGedcoms, status: status, encodeLink: encodeLink, decodeLink: decodeLink, LINK_MAX: LINK_MAX,
              KEY_DEC: KEY_DEC, KEY_BACKUP: KEY_BACKUP, KEY_MYA: KEY_MYA, KEY_GED: KEY_GED, cleanSites: cleanSites };

  /* ---- the browser glue -------------------------------------------------------------------------------------------- */
  if (typeof window !== "undefined" && window.raProgress) {
    var P = window.raProgress;
    var readJSON = function (k) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
    var progress = function () { return JSON.parse(P.toJSON()); };
    var decisions = function () { var d = readJSON(KEY_DEC); return d && d.rows ? d.rows : {}; };
    var rawGet = function (k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
    var KEY_MH = "recordatlas.roots.myheritage-link", KEY_ANC = "recordatlas.roots.ancestry-site";
    var hasWork_ = function () { return Object.keys(P.all()).length > 0; };
    api.current = function () { var p = progress(); return { progress: p, decisions: decisions(), sig: sigOf(p, decisions()) }; };
    var own = function () { try { return { first: localStorage.getItem("ra-own-first"), last: localStorage.getItem("ra-own-last") }; } catch (e) { return null; } };
    api.backupStatus = function () { return status(readJSON(KEY_BACKUP), own(), hasWork_()); };
    api.persisted = function () { return navigator.storage && navigator.storage.persisted ? navigator.storage.persisted().catch(function () { return false; }) : Promise.resolve(false); };
    api.noteBackup = function (how) {
      try { localStorage.setItem(KEY_BACKUP, JSON.stringify({ at: new Date().toISOString(), how: how })); } catch (e) { /* storage blocked: the page still says what it did */ }
    };
    api.exportAll = function () {
      var c = api.current(), file = buildBackup(c.progress, c.decisions, undefined, { mya: readJSON(KEY_MYA), gedcoms: readJSON(KEY_GED), sites: { mh: rawGet(KEY_MH), anc: rawGet(KEY_ANC) } }), name = "record-atlas-research-" + today() + ".json";
      return { file: file, name: name, text: JSON.stringify(file, null, 1) };
    };
    api.importText = function (text) {
      var got = parseAny(text), n = P.fromJSON(JSON.stringify(got.progress), "merge"), nd = 0;
      if (got.decisions) {
        var cur = readJSON(KEY_DEC) || { v: 1, on: false, rows: {} };
        cur.rows = mergeDecisions(cur.rows, got.decisions); nd = Object.keys(got.decisions).length;
        try { localStorage.setItem(KEY_DEC, JSON.stringify(cur)); } catch (e) { nd = 0; }
      }
      var na = 0, ng = 0;
      if (got.mya) {
        var cm = mergeMya(readJSON(KEY_MYA), got.mya);
        try { localStorage.setItem(KEY_MYA, JSON.stringify(cm)); na = Object.keys(got.mya.areas || {}).length + Object.keys(got.mya.views || {}).length; } catch (e) { na = 0; }
      }
      if (got.gedcoms) {
        try { localStorage.setItem(KEY_GED, JSON.stringify(mergeGedcoms(readJSON(KEY_GED), got.gedcoms))); ng = got.gedcoms.length; } catch (e) { ng = 0; }
      }
      /* a link setting made on this device is never replaced by one from a file: it only fills an empty place */
      if (got.sites) {
        try {
          if (got.sites.mh && !rawGet(KEY_MH)) localStorage.setItem(KEY_MH, got.sites.mh);
          if (got.sites.anc && !rawGet(KEY_ANC)) localStorage.setItem(KEY_ANC, got.sites.anc);
        } catch (e) { /* storage blocked */ }
      }
      return { marks: n, decisions: nd, areas: na, gedcoms: ng, kind: got.kind };
    };
    api.pack = function (opts) { return buildPack(progress(), opts); };
    /* THE NAMES OF THE GEDCOM FILES LAST USED, read from the Roots & Routes page's own browser store (database roots-recent) and kept as a
       short list of {name, size, saved} so the backup and the six-word copy can carry them. Names only: the files themselves never leave
       the device. A file forgotten on the Roots page before a page that loads this module is opened is not captured. */
    api.gedcomNames = function () { return readJSON(KEY_GED) || []; };
    api.refreshGedcomNames = function () {
      if (typeof indexedDB === "undefined") return Promise.resolve(api.gedcomNames());
      return new Promise(function (ok) {
        var req; try { req = indexedDB.open("roots-recent"); } catch (e) { return ok(api.gedcomNames()); }
        req.onupgradeneeded = function () { try { req.transaction.abort(); } catch (e) { /* no such store: nothing to read */ } };
        req.onerror = function () { ok(api.gedcomNames()); };
        req.onsuccess = function () {
          var db = req.result;
          try {
            var g = db.transaction("files", "readonly").objectStore("files").getAll();
            g.onsuccess = function () {
              var now = (g.result || []).map(function (r) { return { name: r.name, size: r.size, saved: new Date(r.saved || Date.now()).toISOString() }; });
              db.close();
              if (!now.length) return ok(api.gedcomNames());
              var merged = mergeGedcoms(api.gedcomNames(), now);
              try { localStorage.setItem(KEY_GED, JSON.stringify(merged)); } catch (e) { /* storage blocked */ }
              ok(merged);
            };
            g.onerror = function () { db.close(); ok(api.gedcomNames()); };
          } catch (e) { try { db.close(); } catch (x) { /* closed */ } ok(api.gedcomNames()); }
        };
      });
    };
    api.refreshGedcomNames();
    /* Ask the browser not to evict this origin's storage under pressure. It may say no; say so rather than pretend. */
    api.persist = function () {
      if (!navigator.storage || !navigator.storage.persist) return Promise.resolve("unsupported");
      return navigator.storage.persisted().then(function (p) { return p ? "yes" : navigator.storage.persist().then(function (g) { return g ? "yes" : "no"; }); }).catch(function () { return "unsupported"; });
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.raResearchFile = api;
})(typeof window !== "undefined" ? window : globalThis);
