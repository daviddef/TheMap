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

  if (typeof module !== "undefined" && module.exports) module.exports = { cardsFor: cardsFor, shrinkDims: shrinkDims };
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

    /* ---- the draft ---------------------------------------------------------------------------------------------- */
    function show(res, left) {
      out.textContent = "";
      var r = res.result || {};
      if (r.unparsed) { out.append(el("h3", "Draft"), el("p", r.draft)); return; }
      var c = el("div", null, "rr-card");
      c.append(el("h3", "Draft reading"), el("p", r.draft || "", "rr-means"));
      if (r.note) c.append(el("p", r.note, "cap"));
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
      c.append(el("p", "A draft to check against the page and the cards, not a finding." + (typeof left === "number" ? " Tries left today: " + left + "." : ""), "cap"));
      out.append(c);
    }

    function guard(fn) {
      return function () {
        if (busy) return; busy = true; go.disabled = true; photo.disabled = true;
        Promise.resolve().then(fn).catch(function (e) { say(e && e.message || "Something went wrong.", true); })
          .then(function () { busy = false; go.disabled = false; photo.disabled = false; });
      };
    }

    go.addEventListener("click", guard(function () {
      var t = text.value.trim();
      if (!t) { say("Paste or type a line first.", true); return null; }
      say("Reading… this can take a few seconds.");
      return call("translate", { text: t, cards: cardsFor(t, idx, R) }).then(function (j) { say(""); show(j, j.left); });
    }));

    /* A photo is shrunk and re-drawn in the browser (which drops its hidden data), sent to be transcribed, and the lines come
       back into the box to be corrected by the reader BEFORE anything is translated. */
    photo.addEventListener("change", guard(function () {
      var f = photo.files && photo.files[0]; photo.value = "";
      if (!f) return null;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { say("Use a JPEG, PNG or WebP picture.", true); return null; }
      say("Shrinking the picture…");
      return new Promise(function (ok, fail) {
        var img = new Image(), url = URL.createObjectURL(f);
        img.onload = function () {
          var d = shrinkDims(img.naturalWidth, img.naturalHeight), cv = document.createElement("canvas");
          cv.width = d.w; cv.height = d.h; cv.getContext("2d").drawImage(img, 0, 0, d.w, d.h);
          URL.revokeObjectURL(url);
          var data = cv.toDataURL("image/jpeg", 0.85).split(",")[1]; ok(data);
        };
        img.onerror = function () { URL.revokeObjectURL(url); fail(new Error("That picture could not be opened.")); };
        img.src = url;
      }).then(function (data) {
        say("Reading the picture… this can take a few seconds.");
        return call("transcribe", { image: { media_type: "image/jpeg", data: data } });
      }).then(function (j) {
        var r = j.result || {}, lines = (r.lines || []).map(function (l) { return l.text; }).filter(Boolean);
        if (!lines.length) { say(r.note || "No readable line was found in that picture.", true); return; }
        text.value = lines.join("\n");
        var doubt = [].concat.apply([], (r.lines || []).map(function (l) { return l.doubtful || []; }));
        say("Check the text below against your picture" + (doubt.length ? " (the reader was unsure of: " + doubt.join(", ") + ")" : "") +
          ", correct anything wrong, then press Read this line." + (r.note ? " " + r.note : ""));
      });
    }));

    /* Touching the box is what loads the bot check. */
    ["focus", "click"].forEach(function (ev) { text.addEventListener(ev, function () { loadTurnstile().catch(function () {}); }, { once: true }); });
    photo.addEventListener("click", function () { loadTurnstile().catch(function () {}); });
    box.hidden = false;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
