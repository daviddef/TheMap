/* "ASK CLAUDE" ON /read/: paste a line of a register, or photograph one, and get a draft reading that leans on the page's own cards.

   WHAT LEAVES THE BROWSER, AND WHEN. Nothing, until the reader presses Read or chooses a photo. Then the text (or the shrunk picture)
   goes to ai.recordatlas.org, which passes it to Claude and keeps nothing but counts. Cloudflare's bot check (Turnstile) is loaded only
   when the reader first touches the box, so a visit to /read/ that never uses it contacts nobody. The six words, if the reader has set up
   sync, give the service a separate identity (labels "ai-id" and "ai-token"), which lifts the daily allowance and opens nothing else.

   Pure helpers are exported for the tests (module.exports); everything that touches the page is in boot(). All text from the server goes
   in with textContent, never as HTML. */
(function () {
  "use strict";
  var BASE = "https://ai.recordatlas.org", SITEKEY = "0x4AAAAAAF2I0BQDrTvBa0pm", MAX_EDGE = 1600, MAX_CARDS = 12;

  /* The cards the pasted line matches, for the model's first source: the best card per word, no card twice. */
  function cardsFor(text, idx, R) {
    var seen = {}, out = [];
    String(text || "").split(/[\s,;:.()\[\]"“”]+/).filter(function (w) { return w.length >= 3; }).slice(0, 60).forEach(function (w) {
      if (out.length >= MAX_CARDS) return;
      var hit = R.find(idx, w, {})[0];
      if (!hit || hit.score < 50 || seen[hit.term.id]) return;
      seen[hit.term.id] = 1;
      var t = hit.term;
      out.push({ term: t.forms[0], forms: (t.forms || []).slice(1, 6), meaning: t.means, trap: t.note || "" });
    });
    return out;
  }

  /* The size a photo is shrunk to: longest edge at most MAX_EDGE, never enlarged. */
  function shrinkDims(w, h) {
    var k = Math.min(1, MAX_EDGE / Math.max(w, h, 1));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  /* Several pictures share one box, each under a line "— Picture 2 —". A box with no such line is one entry. */
  var SEP = /^[ \t]*[-\u2014\u2013=]+[ \t]*picture[ \t]*\d*[ \t]*[-\u2014\u2013=]+[ \t]*$/gim;
  function splitSections(t) {
    return String(t || "").split(SEP).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function yearsIn(t) {
    var out = [], re = /(^|[^0-9])(1[0-9]{3}|20[0-3][0-9])(?![0-9])/g, m;
    while ((m = re.exec(String(t || "")))) out.push(+m[2]);
    return out;
  }
  /* What can honestly be said across several readings without a further call: the years written, who is named in more than one picture
     (the same spelling, which is a lead and not proof of one person), the roles each name took, and every reading Claude doubted.
     Nothing is merged into a tree: two pictures need not be one family. */
  function consolidate(entries) {
    var yrs = [], people = {}, order = [], doubt = [];
    entries.forEach(function (e) {
      yrs = yrs.concat(yearsIn(e.text));
      var r = (e.result && e.result.result) || e.result || {};
      (r.roles || []).forEach(function (x) {
        var k = String(x.w || "").toLowerCase().replace(/\s+/g, " ").trim(); if (!k) return;
        var p = people[k] || (people[k] = { w: x.w, roles: [], inn: [] }); if (!people[k].order) { people[k].order = 1; order.push(k); }
        var tag = e.n + ":" + x.role;
        if (p.roles.indexOf(tag) < 0) p.roles.push(tag);
        if (p.inn.indexOf(e.n) < 0) p.inn.push(e.n);
      });
      (r.words || []).forEach(function (w) { if (w.doubt) doubt.push({ w: w.w, why: w.why || "", n: e.n }); });
    });
    var names = order.map(function (k) { return people[k]; });
    return {
      years: yrs.length ? [Math.min.apply(null, yrs), Math.max.apply(null, yrs)] : null,
      names: names,
      recurring: names.filter(function (p) { return p.inn.length > 1; }),
      doubt: doubt
    };
  }

  /* A document as read, without its empty fields, so the case-file request is small and the model is not shown blanks. */
  function compactDoc(o) {
    if (Array.isArray(o)) { var a = o.map(compactDoc).filter(function (x) { return x !== undefined; }); return a.length ? a : undefined; }
    if (o && typeof o === "object") {
      var r = {}, any = false;
      Object.keys(o).forEach(function (k) { var v = compactDoc(o[k]); if (v !== undefined && v !== false) { r[k] = v; any = true; } });
      return any ? r : undefined;
    }
    if (o == null || (typeof o === "string" && !o.trim())) return undefined;
    return o;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { compactDoc: compactDoc, cardsFor: cardsFor, shrinkDims: shrinkDims, splitSections: splitSections, consolidate: consolidate, yearsIn: yearsIn };
  if (typeof document === "undefined") return;

  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }

  function boot() {
    var box = document.getElementById("ask"); if (!box) return;
    var R = window.raReadRecord, D = JSON.parse(document.getElementById("rr-data").textContent), idx = R.index(D.terms);
    var text = document.getElementById("ask-text"), go = document.getElementById("ask-go"), photo = document.getElementById("ask-photo");
    var status = document.getElementById("ask-status"), out = document.getElementById("ask-out"), ts = document.getElementById("ask-ts");
    var token = null, wid = null, tsLoading = null, ai = null, busy = false;

    function say(msg, bad) { status.textContent = msg || ""; status.className = "cap ask-status" + (bad ? " ask-bad" : ""); }

    /* Turnstile, loaded on first use. A token is good for one call; reset() asks for the next. */
    function loadTurnstile() {
      if (tsLoading) return tsLoading;
      tsLoading = new Promise(function (ok, fail) {
        window.__raTsReady = function () {
          try {
            wid = window.turnstile.render(ts, { sitekey: SITEKEY, theme: "auto", callback: function (t) { token = t; },
              "expired-callback": function () { token = null; }, "error-callback": function () { token = null; } });
            ok();
          } catch (e) { fail(e); }
        };
        if (window.turnstile) { window.__raTsReady(); return; }
        var s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__raTsReady"; s.async = true;
        s.onerror = function () { fail(new Error("bot check did not load")); };
        document.head.appendChild(s);
      });
      return tsLoading;
    }
    function takeToken() {
      return loadTurnstile().then(function () {
        return new Promise(function (ok, fail) {
          var n = 0, t = setInterval(function () {
            if (token) { clearInterval(t); var v = token; token = null; ok(v); }
            else if (++n > 80) { clearInterval(t); fail(new Error("The bot check is taking too long. Reload the page and try again.")); }
          }, 250);
        });
      });
    }
    function nextToken() { try { if (wid != null && window.turnstile) window.turnstile.reset(wid); } catch (e) {} }

    /* The six words, if this browser has them, give a separate identity. Derived once (it is slow on purpose). */
    function identity() {
      if (ai !== null) return Promise.resolve(ai);
      var raw = null; try { raw = JSON.parse(localStorage.getItem("ra-sync-v1") || "null"); } catch (e) {}
      if (!raw || !raw.phrase || !window.raResearchSync) { ai = false; return Promise.resolve(ai); }
      return window.raResearchSync.deriveKeys(raw.phrase).then(function (k) { ai = { id: k.aiId, token: k.aiToken }; return ai; })
        .catch(function () { ai = false; return ai; });
    }

    /* THE METER: how many reads are left, shown before anything is pressed and kept current after every answer. The numbers come from the
       Worker (GET /v1/allowance, which asks nothing of the reader); on a test copy of the site there is no Worker, so there is no meter. */
    var meterEl = document.getElementById("ask-meter");
    function paintMeter(m) {
      if (!meterEl) return;
      var t = "", cls = "cap ask-meter";
      if (m.siteOpen === false) { t = m.which === "sitemonth" ? "The free reads for this month are used up for everyone. They return on the 1st. Searching the Atlas, your research and your stories all still work." : "The free reads for today are used up for everyone. They return tomorrow. Searching the Atlas, your research and your stories all still work."; cls += " is-out"; }
      else if (typeof m.left === "number") {
        if (m.left <= 0) { t = m.which === "month" ? "You have used this month's reads. They return on the 1st." : "You have used today's reads" + (m.of ? " (" + m.of + ")" : "") + ". They return tomorrow."; cls += " is-out"; }
        else t = "Reads left today: " + m.left + (m.of ? " of " + m.of : "") + ". Reading a whole document counts as 2.";
      }
      meterEl.className = cls; meterEl.textContent = t; meterEl.hidden = !t;
    }
    function loadMeter() {
      if (!meterEl || (!window.__raAiAnyHost && !/(^|\.)recordatlas\.org$/.test(location.hostname))) return;
      identity().then(function (id) {
        var h = {}; if (id) { h["X-AI-Id"] = id.id; h["Authorization"] = "Bearer " + id.token; }
        return fetch(BASE + "/v1/allowance", { headers: h });
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) paintMeter({ left: j.left, of: j.of, siteOpen: j.siteOpen, which: j.siteOpen === false ? "site" : null }); }).catch(function () { /* no meter: the page works without it */ });
    }
    setTimeout(loadMeter, 600);

    function call(path, body) {
      /* The Worker answers only requests from recordatlas.org, so on any other address (a preview, a test copy) the press would end in a
         browser error nobody can read. Say so up front. `window.__raAiAnyHost` is for the tests, which stand in for the Worker. */
      if (!window.__raAiAnyHost && !/(^|\.)recordatlas\.org$/.test(location.hostname))
        return Promise.reject(new Error("Claude can only read lines on recordatlas.org. This is a test copy of the site, so that button cannot work here. \u201cWhat the Atlas holds on this\u201d does."));
      return Promise.all([takeToken(), identity()]).then(function (v) {
        var h = { "Content-Type": "application/json", "X-Turnstile": v[0] };
        if (v[1]) { h["X-AI-Id"] = v[1].id; h["Authorization"] = "Bearer " + v[1].token; }
        return fetch(BASE + "/v1/" + path, { method: "POST", headers: h, body: JSON.stringify(body) });
      }).then(function (r) {
        nextToken();
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok && typeof j.left === "number") paintMeter({ left: j.left, of: j.of, siteOpen: true });
          else if (!r.ok && j.limit) paintMeter(j.limit === "site" || j.limit === "tokens" || j.limit === "sitemonth" ? { siteOpen: false, which: j.limit } : { left: 0, of: null, siteOpen: true, which: j.limit });
          if (!r.ok) throw new Error((j.error || "Something went wrong. Try again in a minute.") + (j.reason ? " (reason: " + j.reason + ")" : ""));
          return j;
        });
      }, function (e) { nextToken(); throw e; });
    }


    /* ---- language, and who is in the entry ------------------------------------------------------------------------ */
    var LANGS = { la: "Latin", it: "Italian", de: "German", hr: "Croatian", en: "English" };
    var lastText = "";
    function yearOf(t) { var m = /(?:^|[^0-9])(1[0-9]{3}|20[0-3][0-9])(?![0-9])/.exec(String(t || "")); return m ? m[1] : ""; }
    /* The language is read from the cards the line matched, not guessed: each term card carries its own. */
    function languageOf(t) {
      var by = {}, n = 0, got = cardsFor(t, idx, R);
      got.forEach(function (c) {
        var hit = D.terms.filter(function (x) { return x.forms[0] === c.term; })[0];
        if (hit && hit.lang) { by[hit.lang] = (by[hit.lang] || 0) + 1; n++; }
      });
      var ks = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
      return ks.length ? ks.map(function (k) { return LANGS[k] || k; }).join(", ") + " (from " + n + " register " + (n === 1 ? "word" : "words") + " on our cards)" : "";
    }
    /* The people the draft names, as blocks in a row like the tree page: parents, the person the entry is about, godparents and
       witnesses, the priest. Drawn dashed, because every one of them is a reading of a draft and not a documented person. */
    function miniTree(roles, year) {
      var g = { parents: [], focus: [], god: [], clergy: [], other: [] };
      roles.forEach(function (x) {
        var r = String(x.role || "").toLowerCase();
        /* godparent before parent: "godparent" contains "parent". "child baptised" is the person, "priest" the one who baptised. */
        var k = /god|sponsor|susceptor|patrin|witness|testis|testes/.test(r) ? "god" : /priest|officiant|minister|curate|vicar|pastor/.test(r) ? "clergy"
          : /father|mother|parent|pater|mater/.test(r) ? "parents" : /child|infant|baptis|born|groom|bride|deceased|buried|husband|wife|spouse|dead/.test(r) ? "focus" : "other";
        g[k].push(x);
      });
      if (!roles.length) return null;
      var wrap = el("div", null, "mt"), row = el("div", null, "mt-row");
      function block(x, kind, extra) {
        var b = el("div", null, "mt-b mt-" + kind);
        b.append(el("span", String(x.role || "").toUpperCase(), "mt-lab"), el("b", x.w));
        if (extra) b.append(el("span", extra, "mt-yr"));
        return b;
      }
      function col(list, kind, extra) { var c = el("div", null, "mt-col"); list.forEach(function (x) { c.append(block(x, kind, extra)); }); return c; }
      var cols = [];
      if (g.parents.length) cols.push(col(g.parents, "parent"));
      if (g.focus.length) cols.push(col(g.focus, "focus", year));
      if (g.god.length) cols.push(col(g.god, "god"));
      if (g.clergy.length) cols.push(col(g.clergy, "clergy"));
      if (g.other.length) cols.push(col(g.other, "other"));
      cols.forEach(function (c, i) { if (i) row.append(el("span", null, "mt-link")); row.append(c); });
      wrap.append(el("p", "Who is in the entry", "lab"), row,
        el("p", "Read from Claude's draft, so every block is a lead to check against the page, not a documented person.", "cap"));
      return wrap;
    }
    /* ---- the draft ---------------------------------------------------------------------------------------------- */
    function buildCard(res, txt, title) {
      var r = res.result || {};
      var c = el("div", null, "rr-card");
      if (r.unparsed) { c.append(el("h3", title || "Draft"), el("p", r.draft)); return c; }
      c.append(el("h3", title ? title + " \u2014 draft reading" : "Draft reading"), el("p", r.draft || "", "rr-means"));
      var lg = languageOf(txt);
      if (lg) c.append(el("p", "Written in: " + lg, "ask-lang"));
      if (r.note) c.append(el("p", r.note, "cap"));
      var mt = miniTree(r.roles || [], yearOf(txt));
      if (mt) c.append(mt);
      (r.words || []).length && (function () {
        var ul = el("ul", null, "ask-words");
        r.words.forEach(function (w) {
          var li = el("li", null, w.doubt ? "ask-doubt" : "");
          li.append(el("b", w.w), document.createTextNode(" " + (w.gloss || "") + " "),
            el("span", w.from === "card" ? "from our card" : "the model's own knowledge", "ask-src " + (w.from === "card" ? "is-card" : "is-model")));
          if (w.doubt) li.append(el("span", " doubtful" + (w.why ? ": " + w.why : ""), "ask-why"));
          ul.append(li);
        });
        c.append(el("p", "Word by word", "lab"), ul);
      })();
      if ((r.roles || []).length) c.append(el("p", "Who is who: " + r.roles.map(function (x) { return x.w + " (" + x.role + ")"; }).join("; "), "cap"));
      if ((r.not_said || []).length) {
        var ul2 = el("ul", null, "cap"); r.not_said.forEach(function (s) { ul2.append(el("li", s)); });
        c.append(el("p", "What the line does not say", "lab"), ul2);
      }
      return c;
    }
    function show(res, left) {
      out.textContent = "";
      var c = buildCard(res, lastText, "");
      c.append(el("p", "A draft to check against the page and the cards, not a finding." + (typeof left === "number" ? " Tries left today: " + left + "." : ""), "cap"));
      out.append(c);
    }
    /* Several pictures read, one card over all of them: the years, the languages, who recurs, what was doubted. */
    function summaryCard(done, total, left) {
      var K = consolidate(done), c = el("div", null, "rr-card ask-all");
      c.append(el("h3", total > done.length ? "The " + done.length + " pictures read so far (of " + total + ")" : "All " + done.length + " pictures together"));
      var ol = el("ol", null, "ask-entries");
      done.forEach(function (e) {
        var d = ((e.result && e.result.result) || {}).draft || "";
        ol.append(el("li", "Picture " + e.n + ": " + (d.length > 150 ? d.slice(0, 147) + "\u2026" : d)));
      });
      c.append(ol);
      if (K.years) c.append(el("p", "Years written in them: " + (K.years[0] === K.years[1] ? K.years[0] : K.years[0] + "\u2013" + K.years[1]) + ".", "cap"));
      var langs = {}; done.forEach(function (e) { var l = languageOf(e.text); if (l) langs[l.replace(/ \(from.*$/, "")] = 1; });
      if (Object.keys(langs).length) c.append(el("p", "Written in: " + Object.keys(langs).join("; ") + ".", "ask-lang"));
      if (K.names.length) {
        c.append(el("p", "People named", "lab"));
        var ul = el("ul", null, "ask-words");
        K.names.forEach(function (p) {
          var li = el("li", null, p.inn.length > 1 ? "ask-recur" : "");
          li.append(el("b", p.w), document.createTextNode(" " + p.roles.map(function (t) { var i = t.indexOf(":"); return t.slice(i + 1) + " (picture " + t.slice(0, i) + ")"; }).join(", ")));
          ul.append(li);
        });
        c.append(ul);
        if (K.recurring.length) c.append(el("p", K.recurring.map(function (p) { return p.w; }).join(", ") + (K.recurring.length === 1 ? " is" : " are") +
          " written in more than one picture. The same spelling is a lead, not proof of one person: check the places and dates before joining them.", "cap"));
      }
      if (K.doubt.length) c.append(el("p", "Readings Claude doubted: " + K.doubt.map(function (d) { return d.w + " (picture " + d.n + ")"; }).join(", ") + ".", "cap"));
      c.append(el("p", "Each picture was read on its own and nothing is joined into a family tree: pictures need not be one family. A draft to check against the pages, not a finding." +
        (typeof left === "number" ? " Tries left today: " + left + "." : ""), "cap"));
      return c;
    }

    var lastOk = false;
    function setBusy(b) {
      busy = b; go.disabled = b; photo.disabled = b;
      ["ask-read-docs", "ask-read-lines", "ask-clear"].forEach(function (id) { var x = document.getElementById(id); if (x) x.disabled = b; });
    }
    function guard(fn) {
      return function () {
        var args = arguments;
        if (busy) return Promise.resolve();
        setBusy(true); lastOk = false;
        return Promise.resolve().then(function () { return fn.apply(null, args); }).catch(function (e) { say(e && e.message || "Something went wrong.", true); })
          .then(function () { setBusy(false); });
      };
    }

    /* what the handover (handover.js) is made from: each draft, remembered against the exact words it was made for */
    function handNote(txt, j) { var H = window.raHandover; if (H) { H.note(txt, j, (languageOf(txt) || "").replace(/ \(from.*$/, "")); H.open(); } }
    var MAX_PICS = 4;
    function updateGo() { go.textContent = splitSections(text.value).length > 1 ? "Read these entries" : "Read this line"; }
    text.addEventListener("input", updateGo);

    go.addEventListener("click", guard(function () {
      var t = text.value.trim();
      if (!t) { say("Paste or type a line first.", true); return null; }
      var parts = splitSections(t);
      if (parts.length <= 1) {
        lastText = t;
        say("Reading\u2026 this can take a few seconds.");
        return call("translate", { text: t, cards: cardsFor(t, idx, R) }).then(function (j) { say(""); show(j, j.left); handNote(t, j); out.scrollIntoView({ block: "nearest", behavior: "smooth" }); document.dispatchEvent(new CustomEvent("ra-ask-read")); });
      }
      if (parts.length > MAX_PICS) { say("That is " + parts.length + " entries. Read at most " + MAX_PICS + " at a time: delete some from the box, then press the button again.", true); return null; }
      /* One call per entry, one after another: each is its own try, and a stop part-way keeps what was read. */
      var done = [], left = null, failed = null;
      out.textContent = "";
      return parts.reduce(function (chain, part, i) {
        return chain.then(function () {
          if (failed) return;
          say("Reading entry " + (i + 1) + " of " + parts.length + "\u2026 this can take a few seconds each.");
          return call("translate", { text: part, cards: cardsFor(part, idx, R) }).then(function (j) {
            left = j.left; var e = { n: i + 1, text: part, result: j }; done.push(e);
            out.append(buildCard(j, part, "Picture " + (i + 1))); handNote(part, j);
          }, function (e) { failed = e; });
        });
      }, Promise.resolve()).then(function () {
        if (done.length) out.prepend(summaryCard(done, parts.length, left));
        say(failed ? (done.length ? "Stopped after " + done.length + " of " + parts.length + ": " : "") + (failed.message || "Something went wrong.") : "", !!failed);
        lastText = t;
        out.scrollIntoView({ block: "nearest", behavior: "smooth" });
        document.dispatchEvent(new CustomEvent("ra-ask-read"));
      });
    }));

    /* Photos are shrunk and re-drawn in the browser (which drops their hidden data), sent to be transcribed one after another, and the lines
       come back into the box to be corrected by the reader BEFORE anything is translated. A second picture is added under the first, each
       under its own "\u2014 Picture N \u2014" line, so the reader can fix or delete any of them. They can arrive three ways: the button (several
       at once), pictures pasted from the clipboard, or files dropped on the box. All three end up here. */
    function shrink(f) {
      return new Promise(function (ok, fail) {
        var img = new Image(), url = URL.createObjectURL(f);
        img.onload = function () {
          var d = shrinkDims(img.naturalWidth, img.naturalHeight), cv = document.createElement("canvas");
          cv.width = d.w; cv.height = d.h; cv.getContext("2d").drawImage(img, 0, 0, d.w, d.h);
          URL.revokeObjectURL(url);
          ok(cv.toDataURL("image/jpeg", 0.85).split(",")[1]);
        };
        img.onerror = function () { URL.revokeObjectURL(url); fail(new Error("That picture could not be opened.")); };
        img.src = url;
      });
    }
    var readImages = guard(function (files) {
      files = [].slice.call(files || []);
      var bad = files.filter(function (f) { return !/^image\/(jpeg|png|webp)$/.test(f.type); });
      files = files.filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); });
      if (!files.length) { say("Use a JPEG, PNG or WebP picture.", true); return null; }
      var have = splitSections(text.value).length, room = MAX_PICS - have, note = "";
      if (room <= 0) { say("The box already holds " + MAX_PICS + " entries, the most that are read together. Delete one first.", true); return null; }
      if (files.length > room) { note = " Only the first " + room + " were read; " + MAX_PICS + " entries is the most read together."; files = files.slice(0, room); }
      if (bad.length) note += " " + bad.length + " file" + (bad.length === 1 ? " was" : "s were") + " not a JPEG, PNG or WebP picture and " + (bad.length === 1 ? "was" : "were") + " skipped.";
      var added = 0, doubts = [], failed = null, last = "";
      return files.reduce(function (chain, f, i) {
        return chain.then(function () {
          if (failed) return;
          var tag = files.length > 1 ? "Picture " + (i + 1) + " of " + files.length : "the picture";
          say("Shrinking " + tag + "\u2026");
          var pic = null;
          return shrink(f).then(function (data) {
            pic = data;
            say("Reading " + tag + "\u2026 this can take a few seconds.");
            return call("transcribe", { image: { media_type: "image/jpeg", data: data } });
          }).then(function (j) {
            var r = j.result || {}, lines = (r.lines || []).map(function (l) { return l.text; }).filter(Boolean);
            if (typeof j.left === "number") last = " Tries left today: " + j.left + ".";
            if (!lines.length) { note += " " + (r.note || "No readable line was found in " + tag + "."); return; }
            var n = splitSections(text.value).length + 1, cur = text.value.trim();
            text.value = cur ? cur + "\n\n\u2014 Picture " + n + " \u2014\n" + lines.join("\n") : lines.join("\n");
            if (window.raHandover) window.raHandover.picture(n, pic);
            added++;
            (r.lines || []).forEach(function (l) { doubts = doubts.concat(l.doubtful || []); });
            if (r.note) note += " " + r.note;
          }, function (e) { failed = e; });
        });
      }, Promise.resolve()).then(function () {
        lastOk = !failed && added > 0;
        updateGo();
        if (added && window.raHandover) window.raHandover.open();
        var n = splitSections(text.value).length;
        if (failed) { say((added ? "Read " + added + " of " + files.length + ", then it stopped: " : "") + (failed.message || "Something went wrong.") + last, true); return; }
        if (!added) { say(note.trim() || "No readable line was found.", true); return; }
        say("Check the text below against your " + (n > 1 ? "pictures" : "picture") + (doubts.length ? " (the reader was unsure of: " + doubts.join(", ") + ")" : "") +
          ", correct anything wrong, then press " + (n > 1 ? "Read these entries. Each entry is read on its own and costs one more try" : "Read this line") + "." + note + last);
      });
    });
    /* ---- the tray: pictures wait here, with a thumbnail each, until a button is pressed -------------------------------------
       Nothing is read, and no try is spent, when a picture is dropped, pasted or chosen. The reader can add more pictures, type or edit the
       line, give the place, remove one that was a mistake, and then choose how to read them. */
    var tray = [], trayEl = document.getElementById("ask-tray"), readyEl = document.getElementById("ask-ready"), readyN = document.getElementById("ask-ready-n"), readyCost = document.getElementById("ask-ready-cost");
    function renderTray() {
      trayEl.textContent = "";
      tray.forEach(function (t, i) {
        var li = el("li", null, "ask-thumb"), a = el("a"); a.href = t.url; a.target = "_blank"; a.rel = "noopener"; a.title = "Open " + (t.file.name || "picture " + (i + 1)) + " full size";
        var im = el("img"); im.src = t.url; im.alt = "Picture " + (i + 1) + (t.file.name ? ", " + t.file.name : ""); a.append(im);
        var x = el("button", "\u00d7", "ask-thumb-x"); x.type = "button"; x.setAttribute("aria-label", "Remove picture " + (i + 1));
        x.addEventListener("click", function () { if (busy) return; URL.revokeObjectURL(t.url); tray.splice(i, 1); renderTray(); say(tray.length ? "" : "No pictures left."); });
        li.append(a, el("span", String(i + 1), "ask-thumb-n"), x); trayEl.append(li);
      });
      var n = tray.length; trayEl.hidden = !n; readyEl.hidden = !n;
      if (n) {
        readyN.textContent = n + (n === 1 ? " picture" : " pictures") + " ready. Nothing sent yet.";
        readyCost.textContent = "Documents (census page, petition, certificate, form): about " + (2 * n + (n > 1 ? 2 : 0)) + " tries. Register lines (baptism, marriage, burial): about " + 3 * n + ", then 1 per entry.";
      }
    }
    function clearTray() { tray.forEach(function (t) { URL.revokeObjectURL(t.url); }); tray = []; renderTray(); }
    function addToTray(files) {
      files = [].slice.call(files || []);
      var good = files.filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); }), bad = files.length - good.length, room = MAX_PICS - tray.length, note = "";
      if (!good.length) { say("Use a JPEG, PNG or WebP picture.", true); return; }
      if (room <= 0) { say("The tray already holds " + MAX_PICS + " pictures, the most that are read together. Remove one first.", true); return; }
      if (good.length > room) { note = " Only the first " + room + " were added: " + MAX_PICS + " is the most read together."; good = good.slice(0, room); }
      if (bad) note += " " + bad + " file" + (bad === 1 ? " was" : "s were") + " not a JPEG, PNG or WebP picture and " + (bad === 1 ? "was" : "were") + " skipped.";
      good.forEach(function (f) { tray.push({ file: f, url: URL.createObjectURL(f) }); });
      renderTray(); loadTurnstile().catch(function () {});
      say(note.trim());
    }
    function files() { return tray.map(function (t) { return t.file; }); }
    function afterRead(p) { return p.then(function () { if (lastOk) clearTray(); }); }
    photo.addEventListener("change", function () { var fs = [].slice.call(photo.files || []); photo.value = ""; if (fs.length) addToTray(fs); });
    document.getElementById("ask-read-docs").addEventListener("click", function () { if (tray.length) afterRead(readDocuments(files())); });
    document.getElementById("ask-read-lines").addEventListener("click", function () { if (tray.length) afterRead(readImages(files())); });
    document.getElementById("ask-clear").addEventListener("click", function () { if (!busy) { clearTray(); say("Pictures removed."); } });
    text.addEventListener("paste", function (e) {
      var items = [].slice.call((e.clipboardData && e.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
      if (items.length) { e.preventDefault(); addToTray(items); }
    });
    var drop = document.getElementById("ask-drop");
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-over"); }); });
    drop.addEventListener("drop", function (e) { var fs = e.dataTransfer && e.dataTransfer.files ? [].slice.call(e.dataTransfer.files) : []; if (fs.length) addToTray(fs); });


    /* ---- whole documents: census sheets, petitions, certificates, forms ---------------------------------------------------
       Each picture is read as a whole document (every filled-in field, in the original spelling), then one more step compares them and writes
       a case file. Registers of one line each still go through the buttons above. */
    function sub(c, label, items, cls) {
      items = (items || []).filter(Boolean); if (!items.length) return;
      var ul = el("ul", null, cls || "ask-words"); items.forEach(function (t) { ul.append(typeof t === "string" ? el("li", t) : t); });
      if (label) c.append(el("p", label, "lab")); c.append(ul);
    }
    function status2(t) { return el("span", " " + t, "ask-src " + (t === "inferred" ? "is-model" : "is-card")); }
    function docCard(x, bare) {
      var d = x.doc || {}, c = el("div", null, (bare ? "" : "rr-card ") + "ask-doc");
      if (d.unparsed) { if (!bare) c.append(el("h3", "Document " + x.n)); c.append(el("p", d.draft || "")); return c; }
      if (!bare) c.append(el("h3", "Document " + x.n + (d.doc_type ? ": " + d.doc_type : "")));
      var meta = [d.date_on_document && "Date on it: " + d.date_on_document, d.issuer && "Issued by: " + d.issuer, (d.places_named || []).length && "Places written on it: " + d.places_named.join("; ")].filter(Boolean);
      if (meta.length) c.append(el("p", meta.join(" · "), "cap"));
      if (d.what_it_is) c.append(el("p", d.what_it_is, "rr-means"));
      sub(c, "People on it, as written", (d.persons || []).map(function (p) {
        var t = p.details || {}, bits = [t.age && "age " + t.age, t.born && "born " + t.born, t.birthplace && "birthplace " + t.birthplace, t.residence && "residence " + t.residence, t.occupation && "occupation " + t.occupation, t.other].filter(Boolean);
        var li = el("li"); li.append(el("b", p.name_as_written || ""), document.createTextNode((p.role ? " (" + p.role + ")" : "") + (bits.length ? ": " + bits.join("; ") : ""))); return li;
      }));
      var det = el("details", null, "hd-det"); det.append(el("summary", "Every field, as written (" + (d.fields || []).length + ")"));
      var ul = el("ul", null, "ask-words");
      (d.fields || []).forEach(function (f) { var li = el("li", null, f.doubt ? "ask-doubt" : ""); li.append(el("b", f.label || ""), document.createTextNode(" " + (f.value || "") + (f.doubt ? " (doubtful)" : ""))); ul.append(li); });
      det.append(ul); if ((d.fields || []).length) c.append(det);
      sub(c, "Numbers on it", (d.ids || []).map(function (i) { return (i.kind || "") + ": " + (i.value || ""); }), "cap");
      sub(c, "Not readable", d.not_legible, "cap");
      if (d.legibility) c.append(el("p", d.legibility, "cap"));
      return c;
    }
    /* The parts of the results that come from the reading itself, as plain blocks for the tabs: the story (who may be one person, what happened
       when, what does not fit), the facts about the person, and each document in full. The Atlas parts are drawn by case-atlas.js. */
    var VERDICT = { likely: "Likely the same person", possible: "Possibly the same person", unlikely: "Probably different people", "not enough": "Not enough to say if one person" };
    function storyNode(cf) {
      if (!cf) return null;
      if (cf.unparsed) return el("p", cf.draft || "");
      var w = el("div", null, "rs-story");
      (cf.groups || []).forEach(function (g) {
        var box = el("div", null, "rs-verdict is-" + String(g.verdict || "").replace(/\s+/g, "-"));
        box.append(el("b", VERDICT[g.verdict] || g.verdict || ""), el("span", "documents " + (g.docs || []).join(", ")));
        var why = (g.because || []).length || (g.against || []).length;
        if (why) {
          var det = el("details", null, "rs-why"); det.append(el("summary", "Why"));
          sub(det, "Points the same way", g.because); sub(det, "Does not fit", g.against); box.append(det);
        }
        w.append(box);
      });
      if ((cf.timeline || []).length) {
        var ol = el("ol", null, "rs-time");
        cf.timeline.forEach(function (t) {
          var li = el("li"); li.append(el("b", t.date || "?"), document.createTextNode(" " + (t.event || "") + (t.place ? " \u00b7 " + t.place : "")));
          if (t.status === "inferred") li.append(el("span", "inferred", "ask-src is-model"));
          if (t.source) li.append(el("span", t.source, "rs-src")); ol.append(li);
        });
        w.append(ol);
      }
      var gaps = (cf.conflicts || []).map(function (x) { var li = el("li"); li.append(el("b", x.issue || ""), document.createTextNode(" " + (x.detail || "") + (x.how_to_settle ? " To settle: " + x.how_to_settle : ""))); return li; });
      if (gaps.length) { var dc = el("details", null, "rs-more"); dc.append(el("summary", gaps.length + (gaps.length === 1 ? " thing to settle" : " things to settle"))); sub(dc, "", gaps); w.append(dc); }
      var notes = (cf.adds || []).concat(cf.cautions || []);
      if (notes.length) { var dn = el("details", null, "rs-more"); dn.append(el("summary", "Notes and cautions")); sub(dn, "", notes); w.append(dn); }
      return w.children.length ? w : null;
    }
    function peopleNode(cf) {
      if (!cf || !(cf.profile || []).length) return null;
      var w = el("div", null, "rs-facts"); w.append(el("h3", "What the documents say about them", "rs-h"));
      var ul = el("ul", null, "rs-list");
      cf.profile.forEach(function (f) { var li = el("li"); li.append(document.createTextNode(f.fact || "")); if (f.status === "inferred") li.append(el("span", "inferred", "ask-src is-model")); if (f.evidence) li.append(el("span", f.evidence, "rs-src")); ul.append(li); });
      w.append(ul); return w;
    }
    function docsNode(got) {
      var w = el("div", null, "rs-docs");
      got.forEach(function (x, i) {
        var dd = x.doc || {}, d = el("details", null, "rs-doc"); if (got.length === 1 || i === 0) d.open = true;
        var sm = el("summary"); sm.append(el("b", "Document " + x.n), el("span", [dd.doc_type, dd.date_on_document].filter(Boolean).join(" \u00b7 "), "cx-sum"));
        d.append(sm, docCard(x, true)); w.append(d);
      });
      return w;
    }
    /* The Atlas page for the documents: map, who held the ground, registers, sources, names. Drawn under the case file (or first, with one
       document). case-atlas.js announces the finished page, and the names in the readings are then highlighted and handed to the hand-over. */
    function showResults(got, cf) {
      var CA = window.raCaseAtlas, parts = { story: storyNode(cf), people: peopleNode(cf), docs: docsNode(got) };
      out.textContent = "";
      if (!CA || !got.length) { [parts.story, parts.people, parts.docs].forEach(function (n) { if (n) out.append(n); }); return; }
      var mount = el("div", null, "cx-mount"); mount.id = "ask-case-atlas"; out.append(mount);
      CA.render(got, cf, mount, parts);
    }
    var caseFileNow = null;
    document.addEventListener("ra-case-layer", function (e) {
      var CA = window.raCaseAtlas, H = window.raHandover;
      if (H && H.atlas) H.atlas(e.detail);
      if (CA && CA.highlight) CA.highlight(out, e.detail);
    });
    var readDocuments = guard(function (files) {
      files = [].slice.call(files || []).filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); });
      if (!files.length) { say("Use a JPEG, PNG or WebP picture.", true); return null; }
      if (files.length > MAX_PICS) files = files.slice(0, MAX_PICS);
      var got = [], failed = null, left = null, where = (document.getElementById("ask-where") || {}).value || "";
      out.textContent = ""; caseFileNow = null; var H = window.raHandover; if (H) { H.documents([], null); if (H.atlas) H.atlas(null); }
      return files.reduce(function (chain, f, i) {
        return chain.then(function () {
          if (failed) return;
          var tag = files.length > 1 ? "document " + (i + 1) + " of " + files.length : "the document";
          say("Shrinking " + tag + "…");
          return shrink(f).then(function (data) {
            say("Reading " + tag + " field by field… this takes up to half a minute.");
            return call("document", { image: { media_type: "image/jpeg", data: data }, context: { place: where } }).then(function (j) {
              left = j.left; var x = { n: i + 1, name: f.name || "", pic: data, doc: j.result || {} }; got.push(x); out.append(docCard(x));
              if (H) H.documents(got.slice(), null);
            });
          }).then(null, function (e) { failed = e; });
        });
      }, Promise.resolve()).then(function () {
        lastOk = !failed && got.length > 0;
        if (failed) { say((got.length ? "Read " + got.length + " of " + files.length + ", then it stopped: " : "") + (failed.message || "Something went wrong.") + (typeof left === "number" ? " Tries left today: " + left + "." : ""), true); if (H && got.length) H.open(); showResults(got, null); return; }
        if (got.length < 2) { say("One document read. Add a second to compare them and make a case file." + (typeof left === "number" ? " Tries left today: " + left + "." : "")); if (H) H.open(); showResults(got, null); return; }
        say("Comparing the " + got.length + " documents…");
        var facts = window.raAtlasFacts, atlas = facts ? [facts.place && "Place: " + facts.place, facts.country, facts.polity && "Whose ground in " + facts.year + ": " + facts.polity, facts.language && "Register language: " + facts.language].filter(Boolean).join("; ") : "";
        return call("casefile", { docs: got.map(function (x, i) { return compactDoc(Object.assign({ doc: i + 1 }, x.doc)); }), atlas: atlas }).then(function (j) {
          left = j.left; caseFileNow = j.result || null; if (H) { H.documents(got.slice(), caseFileNow); H.open(); } showResults(got, caseFileNow);
          say("Done. A draft to check against the pictures, not a finding." + (typeof left === "number" ? " Tries left today: " + left + "." : ""));
        }, function (e) { if (H) H.open(); showResults(got, null); say("The documents were read, but the comparison stopped: " + (e.message || "Something went wrong.") + " Each document above is still usable.", true); });
      });
    });
    /* Touching the box is what loads the bot check. */
    ["focus", "click"].forEach(function (ev) { text.addEventListener(ev, function () { loadTurnstile().catch(function () {}); }, { once: true }); });
    photo.addEventListener("click", function () { loadTurnstile().catch(function () {}); });
    box.hidden = false;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
