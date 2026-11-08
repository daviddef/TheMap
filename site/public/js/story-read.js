/* READING THE PICTURES IN A STORY. A census sheet, a petition, a certificate: each picture is sent, once the reader presses the button, to
   ai.recordatlas.org (which passes it to Claude and keeps nothing but counts), read as a whole document, and turned into plain sentences about
   the people on it who share a surname with the story. Those sentences are added to the story's own words, where the reader can see and edit
   them, and the Atlas reads the story again. Nothing leaves the browser before the press, and only on recordatlas.org (the Worker answers
   no other address). The bot check (Turnstile) is loaded at the first press. Everything from the server is text; nothing is put in as markup.

   The pure half (docText and the helpers) is exported for the tests. Classic script. */
(function (root) {
  "use strict";
  var BASE = "https://ai.recordatlas.org", SITEKEY = "0x4AAAAAAF2I0BQDrTvBa0pm";

  function fold(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  /* two surnames are the same name written differently when their first five letters differ by at most one ("Slavic", "Slavich") */
  function near(a, b) {
    a = fold(a).slice(0, 5); b = fold(b).slice(0, 5); if (a.length < 4 || b.length < 4) return false;
    var d = 0; for (var i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) d++; return d <= 1;
  }
  /* "SLAVICH: JOZEF" and "Slavic, Giovanni" are the surname first; the story reads a given name first */
  function cleanName(n) {
    n = String(n || "").replace(/\s+/g, " ").trim();
    var m = /^([^:,]+)\s*[:,]\s*(.+)$/.exec(n); if (m) n = m[2] + " " + m[1];
    return n.split(" ").map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w; }).join(" ");
  }
  /* A place as a form wrote it ("R.D. No. 2, Box 73, Worthington, Penna.", "452 W. 40 St., New York City", "New York, N.Y.") as a place name the Atlas can
     find: the street and box lines are dropped, and a US state at the end becomes "United States", which is what tells the place finder which
     Worthington or which New York is meant. Anything else is left as written. */
  var STATES = /^(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|penna|penn|pa|n y|ny|nyc|ill|calif|mass|conn|mich|wash|minn|wis|ind|fla|ga|va|md|nj|n j|oh|tex)$/;
  function cleanPlace(v) {
    var parts = String(v || "").split(",").map(function (x) { return x.replace(/\s+/g, " ").trim(); }).filter(Boolean);
    parts = parts.filter(function (x) { return !/\d/.test(x) && !/\b(?:st|street|ave|avenue|rd|road|box|r\.?\s?d\.?|no)\b\.?$/i.test(x) && !/^(?:r\.?\s?d\.?|box)\b/i.test(x); });
    if (parts.length > 1 && STATES.test(fold(parts[parts.length - 1]))) parts[parts.length - 1] = "United States";
    else if (parts.length === 1 && STATES.test(fold(parts[0])) && /^(?:ny|n y|nyc)$/.test(fold(parts[0]))) parts[0] = "New York, United States";
    parts = parts.map(function (x) { return /^new york city$/i.test(x) ? "New York" : x; });
    return parts.join(", ");
  }
  function yearOf(s) { var m = /(1[5-9]\d\d|20[0-2]\d)/.exec(String(s || "")); return m ? m[1] : ""; }
  function surnameOf(n) { var w = cleanName(n).split(" ").filter(Boolean); return w.length ? w[w.length - 1] : ""; }
  function relevant(p, keys, i) {
    var sn = surnameOf(p.name_as_written);
    if (keys && keys.length) return keys.some(function (k) { return near(sn, k); });
    return i === 0 || /petition|applicant|declarant|head|subject|passenger/i.test(String(p.role || ""));
  }

  /* One picture as read: the sentences about the people on it that the story is about, a label, and who else is on it. */
  function docText(doc, keys) {
    doc = doc || {};
    var persons = doc.persons || [], yr = yearOf(doc.date_on_document), sents = [], names = [], others = [];
    var mine = persons.filter(function (p, i) { return relevant(p, keys, i); });
    persons.forEach(function (p) { if (mine.indexOf(p) < 0 && p.name_as_written) others.push(cleanName(p.name_as_written)); });
    mine.forEach(function (p) {
      var d = p.details || {}, nm = cleanName(p.name_as_written); if (!nm) return; names.push(nm);
      var born = [cleanPlace(d.birthplace) && "in " + cleanPlace(d.birthplace), d.born && "on " + d.born].filter(Boolean).join(" ");
      if (born) sents.push(nm + " was born " + born + ".");
      if (cleanPlace(d.residence)) sents.push(nm + " lived in " + cleanPlace(d.residence) + (yr ? " in " + yr : "") + ".");
    });
    if (mine.length) {
      (doc.fields || []).forEach(function (f) {
        var l = String(f.label || ""), v = String(f.value || "").trim(); if (!v || f.doubt) return;
        if (/emigrat/i.test(l + " " + v) && v.length < 60) sents.push(names[0] + " emigrated from " + cleanPlace(v.replace(/^.*emigrated (?:to the united states of america )?from\s*/i, "")) + ".");
        else if (/last\s+(?:foreign\s+)?residence/i.test(l)) sents.push(names[0] + " lived in " + cleanPlace(v) + ".");
      });
      if (mine.length === 1 && persons.length <= 3) (doc.events || []).forEach(function (e) {
        var w = String(e.what || ""), pl = cleanPlace(e.place), y = yearOf(e.date) || yr; if (!pl) return;
        if (/arriv|entry|entered|landed|admit/i.test(w)) sents.push(names[0] + " arrived in " + pl + (y ? " in " + y : "") + ".");
        else if (/emigrat|depart|left|sail|embark/i.test(w)) sents.push(names[0] + " emigrated from " + pl + (y ? " in " + y : "") + ".");
        else if (/naturali|petition|declar|resid|census|enumerat|regist/i.test(w)) sents.push(names[0] + " lived in " + pl + (y ? " in " + y : "") + ".");
      });
    }
    var seen = {}; sents = sents.filter(function (s) { var k = fold(s); if (seen[k]) return false; seen[k] = 1; return true; });
    var label = String(doc.doc_type || "").trim() + (yr ? ", " + yr : "");
    return { label: label.replace(/^,\s*/, ""), sentences: sents, names: names, others: others.slice(0, 12), found: mine.length > 0 };
  }
  /* the block that goes into the story for one picture */
  function block(n, file, d) {
    var head = "— Picture " + n + " (" + (d.label || file) + ") —";
    return head + "\n" + (d.sentences.length ? d.sentences.join(" ") : "Nobody with a matching surname was found on this picture.");
  }
  var BLOCK_RE = /(?:^|\n\n)— Picture \d+ \([^\n]*\) —\n[^\n]*/g;
  function stripBlocks(t) { return String(t || "").replace(BLOCK_RE, "").replace(/\s+$/, ""); }

  var api = { cleanPlace: cleanPlace, fold: fold, near: near, cleanName: cleanName, docText: docText, block: block, stripBlocks: stripBlocks };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryRead = api;
  if (typeof document === "undefined") return;

  /* ---- the call to the Worker ---------------------------------------------------------------------------------------------- */
  var token = null, wid = null, tsLoading = null, host = null, aiId = null;
  function loadTurnstile() {
    if (tsLoading) return tsLoading;
    tsLoading = new Promise(function (ok, fail) {
      host = document.createElement("div"); host.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:3000"; document.body.appendChild(host);
      window.__raTsReady2 = function () {
        try { wid = window.turnstile.render(host, { sitekey: SITEKEY, theme: "auto", callback: function (t) { token = t; }, "expired-callback": function () { token = null; }, "error-callback": function () { token = null; } }); ok(); } catch (e) { fail(e); }
      };
      if (window.turnstile) { window.__raTsReady2(); return; }
      var s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__raTsReady2"; s.async = true;
      s.onerror = function () { fail(new Error("The bot check did not load.")); }; document.head.appendChild(s);
    });
    return tsLoading;
  }
  function takeToken() {
    return loadTurnstile().then(function () { return new Promise(function (ok, fail) {
      var n = 0, t = setInterval(function () { if (token) { clearInterval(t); var v = token; token = null; ok(v); } else if (++n > 80) { clearInterval(t); fail(new Error("The bot check is taking too long. Reload the page and try again.")); } }, 250);
    }); });
  }
  function identity() {
    if (aiId !== null) return Promise.resolve(aiId);
    var raw = null; try { raw = JSON.parse(localStorage.getItem("ra-sync-v1") || "null"); } catch (e) { /* none */ }
    if (!raw || !raw.phrase || !window.raResearchSync) { aiId = false; return Promise.resolve(aiId); }
    return window.raResearchSync.deriveKeys(raw.phrase).then(function (k) { aiId = { id: k.aiId, token: k.aiToken }; return aiId; }).catch(function () { aiId = false; return aiId; });
  }
  function call(path, body) {
    if (typeof root.__raAiStub === "function") return Promise.resolve(root.__raAiStub(path, body));       /* the tests stand in for the Worker */
    if (!root.__raAiAnyHost && !/(^|\.)recordatlas\.org$/.test(location.hostname)) return Promise.reject(new Error("Claude can only read pictures on recordatlas.org. This is a test copy of the site, so that button cannot work here."));
    return Promise.all([takeToken(), identity()]).then(function (v) {
      var h = { "Content-Type": "application/json", "X-Turnstile": v[0] };
      if (v[1]) { h["X-AI-Id"] = v[1].id; h["Authorization"] = "Bearer " + v[1].token; }
      return fetch(BASE + "/v1/" + path, { method: "POST", headers: h, body: JSON.stringify(body) });
    }).then(function (r) {
      try { if (wid != null && window.turnstile) window.turnstile.reset(wid); } catch (e) { /* next press asks again */ }
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error((j.error || "Something went wrong. Try again in a minute.") + (j.reason ? " (reason: " + j.reason + ")" : "")); return j; });
    });
  }

  /* Read the pictures one after another. `items` are {f (the File), shot?}; each gets .r = {label, sentences, names, others, found, doc} and .shot (the
     shrunk picture, to be kept). Stops at the first failure and says how far it got. */
  function read(items, keys, say) {
    var pics = root.raStoryPics, left = null, failed = null, got = 0;
    return items.reduce(function (chain, it, i) {
      return chain.then(function () {
        if (failed || it.r) return;
        var tag = items.length > 1 ? "picture " + (i + 1) + " of " + items.length : "the picture";
        say("Shrinking " + tag + "…");
        return (it.shot ? Promise.resolve(it.shot) : pics.shrink(it.f || it.file)).then(function (shot) {
          it.shot = shot; say("Reading " + tag + " field by field… this takes up to half a minute.");
          return call("document", { image: { media_type: "image/jpeg", data: shot.data }, context: { place: "" } });
        }).then(function (j) {
          if (typeof j.left === "number") left = j.left;
          var d = docText(j.result || {}, keys); d.doc = j.result || {}; it.r = d; got++;
        }).then(null, function (e) { failed = e; });
      });
    }, Promise.resolve()).then(function () { return { failed: failed, left: left, got: got }; });
  }
  api.read = read; api.call = call;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
