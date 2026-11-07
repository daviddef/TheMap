/* THE CONNECTION DOT IN THE HEADER (Live / Local / Offline, and the warning when nothing has been backed up for a day). Moved out of Base.astro,
   where it was inlined into every page: 5 KB written 83,662 times is 415 MB of the 10 GB the deploy allows, and scripts/check-built.py now fails the
   build when one inline script that size is on half the pages. A classic script run as soon as it loads (not deferred), exactly where the inline
   one ran, so window.raConn exists for the pages that read it. */
(function () {
  var DAY = 864e5;
  function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function js(k) { try { return JSON.parse(rd(k)); } catch (e) { return null; } }
  function ts(v) { var t = v ? Date.parse(v) : NaN; return isNaN(t) ? null : t; }
  function get() {
    var now = Date.now(), online = navigator.onLine !== false;
    var sy = js("ra-sync-v1"), synced = !!(sy && sy.phrase);
    var bk = js("ra-backup-v1"), last = ts(bk && bk.at), sv = ts(sy && sy.saved);
    if (sv && (!last || sv > last)) last = sv;
    var first = ts(rd("ra-own-first")), own = ts(rd("ra-own-last"));
    /* NEVER BACKED UP, WITH RESEARCH HERE. The reader's own changes are stamped (ra-own-*), but a browser that held marks before
       the stamps existed, or got them from the published sessions, has none. David: "never backed up" must be called out, so
       research with no backup at all counts as unprotected, with 24 hours of grace counted from the first time this header
       saw it (ra-conn-first), so nobody is warned the moment they arrive. */
    var marks = 0; try { marks = Object.keys((js("ra-progress-v1") || {}).marks || {}).length; } catch (e) { marks = 0; }
    var seen = null;
    if (!last && marks) {
      seen = ts(rd("ra-conn-first"));
      if (!seen) { seen = now; try { localStorage.setItem("ra-conn-first", new Date(now).toISOString()); } catch (e) { /* storage blocked */ } }
    }
    var changed = !!(own && (!last || own > last)) || (!last && marks > 0);
    var ref = Math.min(first || now, seen || now), since = last ? now - last : now - ref;
    return { online: online, synced: synced, syncedAt: sv, fileAt: ts(bk && bk.at), last: last, own: own, changed: changed, never: !last, since: since, warn: changed && since > DAY,
             state: !online ? "offline" : synced ? "online" : "local" };
  }
  /* WHEN, IN WORDS AND IN A DATE. David: «show the number of days since last sync, and the date». «3 days ago (6 Nov 2026, 14:20)», or
     «today» for the same calendar day, so the count never says «0 days». */
  function when(t) {
    if (!t) return "";
    var d = new Date(t), now = new Date(), n = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / DAY);
    var at = d.toLocaleString(window.RA_LANG && window.RA_LANG !== "en" ? window.RA_LANG : undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    return T(n <= 0 ? "today" : n === 1 ? "1 day ago" : n + " days ago") + " (" + at + ")";
  }
  window.raConn = { get: get, when: when };
  /* the language table's translator (public/js/i18n.js); English when it is absent or the reader reads English */
  var T = window.RA_T || function (x) { return x; };
  var WORD = { online: "Live", local: "Local", offline: "Offline" };
  var TIP = { online: "Connected, and a copy of your research is kept online. Tap for Connection & Backup.",
              local: "Saved only in this browser. Tap to back it up or keep a copy online.",
              offline: "Offline: this page works from what is already loaded. Tap for Connection & Backup." };
  function days(ms) { var d = Math.floor(ms / DAY); return d <= 1 ? T("more than a day") : T(d + " days"); }
  function boot() {
    function set() {
      var c = get();
      [].slice.call(document.querySelectorAll(".ra-live")).forEach(function (el) {
        var t = el.querySelector(".ra-live-t"), w = el.querySelector(".ra-live-w");
        el.setAttribute("data-state", c.state);
        var tip = T(TIP[c.state]);
        if (c.synced) tip += " " + T(c.syncedAt ? "Last synced: " + when(c.syncedAt) + "." : "Not saved online yet.");
        if (c.fileAt) tip += " " + T("Last file backup: " + when(c.fileAt) + ".");
        if (t) t.textContent = T(WORD[c.state]);
        if (w) {
          w.hidden = !c.warn;
          if (c.warn) tip += " " + T("Warning: you have changed your research and it has not been backed up for " + days(c.since) + ".");
        }
        el.title = tip;
      });
      document.dispatchEvent(new CustomEvent("ra-conn", { detail: c }));
    }
    window.addEventListener("online", set); window.addEventListener("offline", set);
    window.addEventListener("storage", set); document.addEventListener("ra-progress-changed", set);
    document.addEventListener("ra-conn-refresh", set);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) set(); });
    setInterval(set, 60000); set();
  }
  /* two dots (beside the brand on narrow screens, in the Researching group on wide ones): the second is not parsed yet */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
