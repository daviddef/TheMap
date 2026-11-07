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

  if (typeof module !== "undefined" && module.exports) module.exports = { cardsFor: cardsFor, shrinkDims: shrinkDims, splitSections: splitSections, consolidate: consolidate, yearsIn: yearsIn };
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
          if (!r.ok) throw new Error(j.error || "Something went wrong. Try again in a minute.");
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

    function guard(fn) {
      return function () {
        var args = arguments;
        if (busy) return; busy = true; go.disabled = true; photo.disabled = true;
        Promise.resolve().then(function () { return fn.apply(null, args); }).catch(function (e) { say(e && e.message || "Something went wrong.", true); })
          .then(function () { busy = false; go.disabled = false; photo.disabled = false; });
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
          return shrink(f).then(function (data) {
            say("Reading " + tag + "\u2026 this can take a few seconds.");
            return call("transcribe", { image: { media_type: "image/jpeg", data: data } });
          }).then(function (j) {
            var r = j.result || {}, lines = (r.lines || []).map(function (l) { return l.text; }).filter(Boolean);
            if (typeof j.left === "number") last = " Tries left today: " + j.left + ".";
            if (!lines.length) { note += " " + (r.note || "No readable line was found in " + tag + "."); return; }
            var n = splitSections(text.value).length + 1, cur = text.value.trim();
            text.value = cur ? cur + "\n\n\u2014 Picture " + n + " \u2014\n" + lines.join("\n") : lines.join("\n");
            added++;
            (r.lines || []).forEach(function (l) { doubts = doubts.concat(l.doubtful || []); });
            if (r.note) note += " " + r.note;
          }, function (e) { failed = e; });
        });
      }, Promise.resolve()).then(function () {
        updateGo();
        if (added && window.raHandover) window.raHandover.open();
        var n = splitSections(text.value).length;
        if (failed) { say((added ? "Read " + added + " of " + files.length + ", then it stopped: " : "") + (failed.message || "Something went wrong.") + last, true); return; }
        if (!added) { say(note.trim() || "No readable line was found.", true); return; }
        say("Check the text below against your " + (n > 1 ? "pictures" : "picture") + (doubts.length ? " (the reader was unsure of: " + doubts.join(", ") + ")" : "") +
          ", correct anything wrong, then press " + (n > 1 ? "Read these entries. Each entry is read on its own and costs one more try" : "Read this line") + "." + note + last);
      });
    });
    photo.addEventListener("change", function () { var fs = [].slice.call(photo.files || []); photo.value = ""; if (fs.length) readImages(fs); });
    text.addEventListener("paste", function (e) {
      var items = [].slice.call((e.clipboardData && e.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
      if (items.length) { e.preventDefault(); readImages(items); }
    });
    var drop = document.getElementById("ask-drop");
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-over"); }); });
    drop.addEventListener("drop", function (e) { var fs = e.dataTransfer && e.dataTransfer.files ? [].slice.call(e.dataTransfer.files) : []; if (fs.length) readImages(fs); });

    /* Touching the box is what loads the bot check. */
    ["focus", "click"].forEach(function (ev) { text.addEventListener(ev, function () { loadTurnstile().catch(function () {}); }, { once: true }); });
    photo.addEventListener("click", function () { loadTurnstile().catch(function () {}); });
    box.hidden = false;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
