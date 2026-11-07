/* ALWAYS-ON SYNC. If this browser has the six words (localStorage `ra-sync-v1`), the research is kept online on EVERY page, not only on /backup/.

   conn.js, which is on every page, loads this (with research-sync.js, research-file.js and, where the page has not got it, progress-kit.js) only when
   the six words are present, so a reader who never set sync up downloads none of it.

   WHAT TRIGGERS A SAVE. Anything this browser holds that research-file.js backs up: the marks, the fix-it decisions, the areas and views, the
   tree files' names, and the MyHeritage / Ancestry link settings. Not every one of those announces a change, so the page is checked for a change every
   20 seconds while it is showing (a cheap fingerprint of those keys against the one saved at the last sync), on the progress-changed event, and
   once more as the page is hidden or left. A change is saved 15 seconds after the last one, so a burst of edits is one save.

   WHAT IT DOES WITH ANOTHER DEVICE'S COPY. It merges it in, then saves the union. A merge only adds: it replaces nothing and never unmarks what
   this browser holds. (That also means a mark deleted on one device can come back from another. The /backup/ page says so.)

   QUIET. No dialog and no prompt. The one trace is `ra-sync-note` in localStorage and a `ra-sync-done` event, which /backup/ shows. A failure (offline,
   service down) is retried later and never touches the research on this device. */
(function (root) {
  "use strict";
  var KEY = "ra-sync-v1", FP = "ra-sync-fp", NOTE = "ra-sync-note";
  var WATCH = ["ra-progress-v1", "ra-fix-decisions-v1", "ra-areas-v1", "ra-gedcom-names-v1",
    "recordatlas.roots.myheritage-link", "recordatlas.roots.ancestry-site", "recordatlas.roots.myheritage-trees"];
  var QUIET_MS = 15000, WATCH_MS = 20000, PULL_MS = 60000;

  /* A small, stable fingerprint of a list of strings (FNV-1a over everything, with the lengths). Not security: a change detector. */
  function fingerprint(parts) {
    var h = 0x811c9dc5, n = 0;
    parts.forEach(function (s) {
      s = s == null ? "" : String(s); n += s.length; h ^= 0x1f; h = Math.imul(h, 0x01000193) >>> 0;
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    });
    return h.toString(16) + "-" + n;
  }

  /* What to do after looking: merge the online copy if another device saved since this one did, and save if the merge or a local change made
     this browser differ from the online copy. `fp` is the fingerprint now (after any merge is applied by the caller, pass merge's result back in),
     `stored` the one noted at the last sync. With no stored one (the first pass of a browser that synced before this existed) it saves once. */
  function plan(st, got, fp, stored) {
    var newer = !!(got && got.saved && (!st.saved || Date.parse(got.saved) > Date.parse(st.saved) + 1000));
    return { merge: newer, push: newer || !st.saved || !stored || fp !== stored };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { fingerprint: fingerprint, plan: plan, WATCH: WATCH };
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.raSyncAuto) return;

  var SY = window.raResearchSync, RF = window.raResearchFile;
  function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function wr(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function state() { try { var v = JSON.parse(rd(KEY)); return v && v.phrase ? v : null; } catch (e) { return null; } }
  function now() { return fingerprint(WATCH.map(rd)); }

  var opts = {}, keys = null, keysFor = null, busy = false, lastPull = 0, quiet = null, backoff = 0;
  try { var m = /[?&]syncbase=([^&]+)/.exec(location.search); if (m && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) opts.base = decodeURIComponent(m[1]); } catch (e) { /* default */ }

  function done(detail) { document.dispatchEvent(new CustomEvent("ra-sync-done", { detail: detail })); }

  function pass(force) {
    var st = state();
    if (!st || busy || !SY || !RF || !RF.exportAll) return Promise.resolve();
    if (navigator.onLine === false) return Promise.resolve();
    if (!force && Date.now() - lastPull < 3000) return Promise.resolve();
    busy = true; lastPull = Date.now();
    var kp = keys && keysFor === st.phrase ? Promise.resolve(keys) : SY.deriveKeys(st.phrase).then(function (k) { keys = k; keysFor = st.phrase; return k; });
    return kp.then(function (k) {
      return SY.pull(k, opts).then(function (got) {
        var p = plan(st, got, now(), rd(FP)), merged = 0;
        if (p.merge) {
          var r = RF.importText(got.text); merged = r && r.marks || 0;
          st.saved = got.saved; wr(KEY, JSON.stringify(st));
          wr(NOTE, JSON.stringify({ at: new Date().toISOString(), merged: merged, from: got.saved }));
          document.dispatchEvent(new CustomEvent("ra-progress-changed"));
        }
        if (!p.push) { wr(FP, now()); backoff = 0; done({ ok: true, saved: false, merged: merged }); return; }
        var out = RF.exportAll();
        return SY.push(k, out.text, opts).then(function (r2) {
          var cur = state() || st; cur.saved = r2.saved; wr(KEY, JSON.stringify(cur)); wr(FP, now()); RF.noteBackup("sync");
          document.dispatchEvent(new CustomEvent("ra-conn-refresh")); backoff = 0; done({ ok: true, saved: true, merged: merged });
        });
      });
    }).catch(function (e) { backoff = Math.min((backoff || 30000) * 2, 600000); done({ ok: false, message: e && e.message || "Could not reach the online copy." }); })
      .then(function () { busy = false; });
  }

  function later(ms) { clearTimeout(quiet); if (state()) quiet = setTimeout(function () { pass(true); }, Math.max(ms, backoff)); }
  function changedNow() { var st = state(); return !!st && (!st.saved || now() !== rd(FP)); }

  document.addEventListener("ra-progress-changed", function () { later(QUIET_MS); });
  document.addEventListener("ra-sync-enabled", function () { later(1000); });
  setInterval(function () {
    if (document.hidden || !state()) return;
    if (changedNow()) later(QUIET_MS); else if (Date.now() - lastPull > PULL_MS * 5) pass(false);
  }, WATCH_MS);
  /* leaving or hiding the page: save what is waiting now (best effort; the keys are already made, so it is one request) */
  function leaving() { if (changedNow() && keys) pass(true); }
  document.addEventListener("visibilitychange", function () { if (document.hidden) leaving(); else if (Date.now() - lastPull > PULL_MS) pass(false); });
  window.addEventListener("pagehide", leaving);
  window.addEventListener("online", function () { later(2000); });

  window.raSyncAuto = { pass: pass, kick: later, changed: changedNow, fingerprint: now };
  setTimeout(function () { pass(true); }, 2500);
})(typeof window !== "undefined" ? window : this);
