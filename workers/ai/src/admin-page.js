/* The admin page: ONE self-contained document. No external script, font, image or request (apart from the one link to the site's visit
   counter, which the reader clicks). It holds no token and no data: it asks for the token, keeps it in sessionStorage only, and then calls the
   JSON routes of this same Worker. Everything that comes from the server is written with textContent, never innerHTML.
   Written with String.raw so regular expressions keep their backslashes; so this text must contain no backtick and no dollar-brace. */
export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Ask Claude admin</title>
<style>
:root { --ground:#EDEBE5; --panel:#F7F6F2; --ink:#16222A; --accent:#1F5C6B; --muted:#5B6870; --line:#D8D5CB; --bad:#9A3B2E; --good:#2F6B3F; }
@media (prefers-color-scheme: dark) { :root { --ground:#101820; --panel:#17212A; --ink:#E8E6DF; --accent:#6FB6C6; --muted:#9AA7AE; --line:#2B3843; --bad:#E08A7C; --good:#7FC08F; } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin:0; background:var(--ground); color:var(--ink); font:16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width:60rem; margin:0 auto; padding:1rem 16px 4rem; }
h1, h2 { font-family: Fraunces, Georgia, "Times New Roman", serif; font-weight:600; line-height:1.2; }
h1 { font-size:1.6rem; margin:1rem 0 .25rem; }
h2 { font-size:1.2rem; margin:0 0 .75rem; }
p { margin:.4rem 0; }
.sub, .note { color:var(--muted); font-size:.9rem; }
section { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:1rem; margin:1rem 0; }
table { border-collapse:collapse; width:100%; font-size:.92rem; }
th, td { text-align:right; padding:.35rem .5rem; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; }
th:first-child, td:first-child { text-align:left; }
th { font-weight:600; color:var(--muted); font-size:.8rem; }
.scroll { overflow-x:auto; }
button, input, select { font:inherit; color:inherit; }
button { background:var(--accent); color:var(--panel); border:0; border-radius:8px; padding:.5rem 1rem; cursor:pointer; min-height:44px; }
button.quiet { background:transparent; color:var(--accent); border:1px solid var(--accent); }
button[aria-pressed="true"] { outline:2px solid var(--ink); outline-offset:2px; }
input[type=text], input[type=number], input[type=password] { background:var(--ground); border:1px solid var(--line); border-radius:6px; padding:.4rem .5rem; width:100%; min-height:40px; }
input:disabled { opacity:.45; }
a { color:var(--accent); }
.row { display:grid; grid-template-columns:1fr; gap:.25rem .75rem; padding:.55rem 0; border-bottom:1px solid var(--line); }
@media (min-width:640px) { .row { grid-template-columns: 1fr 9rem 8rem; align-items:center; } .row.wide { grid-template-columns: 1fr 16rem; } }
.row label { cursor:pointer; }
.src { font-size:.75rem; color:var(--muted); }
.chk { display:flex; gap:.4rem; align-items:center; font-size:.9rem; }
.chk input { width:1.2rem; height:1.2rem; }
.bar { fill:var(--accent); } .axis { stroke:var(--line); } .lbl { fill:var(--muted); font-size:10px; }
.err { color:var(--bad); } .ok { color:var(--good); }
.tools { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin:.5rem 0; }
.hidden { display:none; }
</style>
</head>
<body>
<main>
<h1>Ask Claude: admin</h1>
<p class="sub">Counts only. Nothing anyone pasted, photographed or was answered is kept, and nothing about who asked.</p>

<section id="gate">
  <h2>Token</h2>
  <p class="note">Paste the admin token. It is kept for this browser tab only and is sent only to this address.</p>
  <form id="gateform" class="tools" autocomplete="off">
    <input id="tok" type="password" aria-label="Admin token" autocomplete="off" style="max-width:24rem">
    <button type="submit">Open</button>
  </form>
  <p id="gatemsg" class="err" role="alert"></p>
</section>

<div id="app" class="hidden">
  <div class="tools"><button class="quiet" id="signout" type="button">Close this session</button><button class="quiet" id="refresh" type="button">Refresh</button><span id="stamp" class="note"></span></div>

  <section>
    <h2>Use</h2>
    <div class="scroll"><table id="periods"><thead><tr><th></th><th>Today (UTC)</th><th>This month</th><th>Last 30 days</th></tr></thead><tbody></tbody></table></div>
    <p class="note" id="coston"></p>
  </section>

  <section>
    <h2>Requests a day, last 30 days</h2>
    <svg id="chart" viewBox="0 0 600 150" role="img" aria-label="Requests per day, last 30 days" style="width:100%;height:auto"></svg>
    <p class="note">Hover or tap a bar for its day and number.</p>
  </section>

  <section>
    <h2>By kind and by model</h2>
    <div class="tools" id="ranges" role="group" aria-label="Range">
      <button class="quiet" type="button" data-days="7" aria-pressed="false">7 days</button>
      <button class="quiet" type="button" data-days="30" aria-pressed="true">30 days</button>
      <button class="quiet" type="button" data-days="90" aria-pressed="false">90 days</button>
    </div>
    <div class="scroll"><table id="bykind"><thead><tr><th>Kind</th><th>Requests</th><th>Answered</th><th>Errors</th><th>Input tokens</th><th>Output tokens</th></tr></thead><tbody></tbody></table></div>
    <div class="scroll" style="margin-top:1rem"><table id="bymodel"><thead><tr><th>Model</th><th>Requests</th><th>Input tokens</th><th>Output tokens</th></tr></thead><tbody></tbody></table></div>
    <p class="note" id="errclasses"></p>
  </section>

  <section>
    <h2>Turned away</h2>
    <p class="note">Requests that were refused before Claude was asked, for the chosen range.</p>
    <div class="scroll"><table id="refused"><thead><tr><th>Reason</th><th>Count</th></tr></thead><tbody></tbody></table></div>
  </section>

  <section>
    <h2>Configuration</h2>
    <p class="note">Takes effect on the next request; no redeploy. Tick Unlimited for no limit. A setting you have not changed here keeps the value the Worker was deployed with.</p>
    <form id="cfg" autocomplete="off">
      <div id="cfgrows"></div>
      <div class="tools"><button type="submit">Save</button><span id="cfgmsg" class="note" role="status"></span></div>
    </form>
    <div id="changed"></div>
    <p class="note">The limits count requests (a photo or a whole document counts as several). They do not stop a long answer from costing more than a short one. The hard ceiling on spend is the monthly limit on the key at console.anthropic.com, which lives outside this Worker and cannot be changed here. Prices are only used to estimate cost on this page.</p>
  </section>

  <section>
    <h2>Site visits</h2>
    <p>Visits to the site are counted at <a href="https://recordatlas.goatcounter.com" target="_blank" rel="noopener noreferrer">recordatlas.goatcounter.com</a>, which has its own login. They are not counted here: this page only knows about calls to Ask Claude.</p>
  </section>
</div>
</main>
<script>
(function () {
  "use strict";
  var KEY = "ra-ai-admin-token", token = "", days90 = [], range = 30, cfg = null;
  try { token = sessionStorage.getItem(KEY) || ""; } catch (e) { token = ""; }
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = String(text); if (cls) e.className = cls; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function fmt(n) { return Number(n || 0).toLocaleString(); }

  function api(path, opts) {
    opts = opts || {};
    return fetch(path, { method: opts.method || "GET", cache: "no-store", body: opts.body, headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" } }).then(function (r) {
      if (r.status === 401 || r.status === 404) { signOut("That token was not accepted."); throw new Error("auth"); }
      return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || ("error " + r.status)); e.problems = j.problems || []; throw e; } return j; });
    });
  }
  function signOut(msg) {
    token = ""; try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    $("app").className = "hidden"; $("gate").className = ""; $("gatemsg").textContent = msg || ""; $("tok").value = "";
  }
  function open(t) {
    token = t;
    return api("/v1/admin/ping").then(function () {
      try { sessionStorage.setItem(KEY, token); } catch (e) { /* ignore */ }
      $("gate").className = "hidden"; $("app").className = ""; $("gatemsg").textContent = ""; return load();
    }).catch(function (e) { if (e.message !== "auth") $("gatemsg").textContent = "Could not reach the server."; });
  }

  /* ---- numbers ---- */
  function sumDays(list) {
    var t = { requests: 0, ok: 0, errors: 0, in: 0, out: 0 };
    list.forEach(function (d) { Object.keys(d.kinds).forEach(function (k) { var v = d.kinds[k]; t.requests += v.requests; t.ok += v.ok; t.errors += v.errors; t.in += v.in; t.out += v.out; }); });
    return t;
  }
  function cost(t) {
    var p = cfg && cfg.config; if (!p || (p.PRICE_IN_PER_MTOK == null && p.PRICE_OUT_PER_MTOK == null)) return null;
    var c = (t.in * (p.PRICE_IN_PER_MTOK || 0) + t.out * (p.PRICE_OUT_PER_MTOK || 0)) / 1e6;
    return "about $" + (c < 1 ? c.toFixed(3) : c.toFixed(2));
  }

  function renderPeriods() {
    var tb = $("periods").tBodies[0]; clear(tb);
    var today = days90.slice(-1), month = days90.filter(function (d) { return d.day.slice(0, 7) === days90[days90.length - 1].day.slice(0, 7); }), last30 = days90.slice(-30);
    var sets = [sumDays(today), sumDays(month), sumDays(last30)];
    [["Requests", "requests"], ["Answered", "ok"], ["Errors", "errors"], ["Input tokens", "in"], ["Output tokens", "out"]].forEach(function (r) {
      var tr = el("tr"); tr.appendChild(el("td", r[0])); sets.forEach(function (s) { tr.appendChild(el("td", fmt(s[r[1]]))); }); tb.appendChild(tr);
    });
    var tr = el("tr"); tr.appendChild(el("td", "Estimated cost")); sets.forEach(function (s) { tr.appendChild(el("td", cost(s) || "not set")); }); tb.appendChild(tr);
    $("coston").textContent = cost(sets[0]) !== null || cost(sets[1]) !== null
      ? "Cost is an ESTIMATE from the token counts and the prices set below (today's prices applied to all days). Check the Anthropic console for the real figure."
      : "No prices are set, so cost is not estimated here; set them under Configuration, or read the real figure in the Anthropic console.";
  }

  function svgEl(tag, attrs) {
    var ns = ["http:", "", "www.w3.org", "2000", "svg"].join("/");
    var e = document.createElementNS(ns, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e;
  }
  function renderChart() {
    var svg = $("chart"); clear(svg);
    var list = days90.slice(-30), max = 1; list.forEach(function (d) { var n = sumDays([d]).requests; if (n > max) max = n; });
    var W = 600, H = 150, top = 14, bottom = 22, plot = H - top - bottom, bw = W / list.length;
    svg.appendChild(svgEl("line", { x1: 0, x2: W, y1: H - bottom, y2: H - bottom, "class": "axis" }));
    var m = svgEl("text", { x: 2, y: 10, "class": "lbl" }); m.textContent = fmt(max); svg.appendChild(m);
    list.forEach(function (d, i) {
      var n = sumDays([d]).requests, h = Math.max(n ? 2 : 1, Math.round(plot * n / max));
      var r = svgEl("rect", { x: (i * bw + 1).toFixed(1), y: H - bottom - h, width: Math.max(1, bw - 2).toFixed(1), height: h, "class": "bar", opacity: n ? 1 : 0.25 });
      var t = svgEl("title"); t.textContent = d.day + ": " + fmt(n) + (n === 1 ? " request" : " requests"); r.appendChild(t); svg.appendChild(r);
    });
    [0, list.length - 1].forEach(function (i) { var t = svgEl("text", { x: i === 0 ? 2 : W - 2, y: H - 6, "class": "lbl", "text-anchor": i === 0 ? "start" : "end" }); t.textContent = list[i].day; svg.appendChild(t); });
  }

  function renderTables() {
    var list = days90.slice(-range), kinds = {}, models = {}, refused = {}, errs = {};
    list.forEach(function (d) {
      Object.keys(d.kinds).forEach(function (k) { var a = kinds[k] = kinds[k] || { requests: 0, ok: 0, errors: 0, in: 0, out: 0 }, v = d.kinds[k]; Object.keys(a).forEach(function (f) { a[f] += v[f]; }); });
      Object.keys(d.models).forEach(function (k) { var a = models[k] = models[k] || { requests: 0, in: 0, out: 0 }, v = d.models[k]; Object.keys(a).forEach(function (f) { a[f] += v[f]; }); });
      Object.keys(d.refused).forEach(function (k) { refused[k] = (refused[k] || 0) + d.refused[k]; });
      Object.keys(d.errorsBy || {}).forEach(function (k) { errs[k] = (errs[k] || 0) + d.errorsBy[k]; });
    });
    function fill(id, obj, cols, empty) {
      var tb = $(id).tBodies[0]; clear(tb); var keys = Object.keys(obj).sort();
      if (!keys.length) { var tr0 = el("tr"), td0 = el("td", empty); td0.colSpan = cols.length + 1; tr0.appendChild(td0); tb.appendChild(tr0); return; }
      keys.forEach(function (k) { var tr = el("tr"); tr.appendChild(el("td", k)); cols.forEach(function (c) { tr.appendChild(el("td", fmt(typeof obj[k] === "number" ? obj[k] : obj[k][c]))); }); tb.appendChild(tr); });
    }
    fill("bykind", kinds, ["requests", "ok", "errors", "in", "out"], "Nothing in this range.");
    fill("bymodel", models, ["requests", "in", "out"], "Nothing in this range.");
    var names = { bot: "Bot check failed", paused: "Service paused", too_large: "Request too large", limit: "A limit was hit", other: "Other" }, named = {};
    Object.keys(refused).forEach(function (k) { named[names[k] || k] = refused[k]; });
    fill("refused", named, [], "Nothing was turned away in this range.");
    var parts = Object.keys(errs).sort().map(function (k) { return fmt(errs[k]) + " x " + k; });
    $("errclasses").textContent = parts.length ? "Errors from Claude by status: " + parts.join(", ") + "." : "";
  }

  /* ---- configuration ---- */
  var LIMITS = [["ANON_DAILY", "Visitor with no six words: tries a day, per address"], ["ID_NEW_DAILY", "New six-word identity: tries on its first day"],
    ["ID_DAILY", "Six-word identity: most tries a day (it grows by 2 a day of age)"], ["ID_MONTHLY", "Six-word identity: tries a month"],
    ["IP_DAILY", "One address: tries a day, however many identities it makes"], ["SITE_DAILY_REQUESTS", "Whole site: requests a day"],
    ["SITE_MONTHLY_REQUESTS", "Whole site: requests a month"], ["SITE_DAILY_TOKENS", "Whole site: tokens a day"]];
  var OTHERS = [["MODEL", "Model for register lines and photos", "text"], ["PLAN_MODEL", "Model for research plans", "text"],
    ["MAX_OUT_TOKENS", "Most tokens in one short answer", "number"], ["PLAN_MAX_TOKENS", "Most tokens in one research plan", "number"],
    ["PRICE_IN_PER_MTOK", "Price: dollars per million input tokens (blank = not set)", "price"], ["PRICE_OUT_PER_MTOK", "Price: dollars per million output tokens (blank = not set)", "price"]];
  var fields = {};

  function srcNote(k) { return cfg.source[k] === "saved" ? "set here" : cfg.source[k] === "deployed" ? "from the deployed settings" : "built-in default"; }
  function renderConfig() {
    var box = $("cfgrows"); clear(box); fields = {};
    var on = el("div", null, "row wide"), lab = el("label", "Service on (off pauses Ask Claude for everyone)"); lab.htmlFor = "f_AI_ENABLED";
    var cbx = document.createElement("input"); cbx.type = "checkbox"; cbx.id = "f_AI_ENABLED"; cbx.checked = !!cfg.config.AI_ENABLED; fields.AI_ENABLED = { kind: "bool", input: cbx };
    var w = el("div", null, "chk"); w.appendChild(cbx); w.appendChild(el("span", srcNote("AI_ENABLED"), "src")); on.appendChild(lab); on.appendChild(w); box.appendChild(on);
    LIMITS.forEach(function (p) {
      var k = p[0], row = el("div", null, "row"), l = el("label", p[1]); l.htmlFor = "f_" + k;
      var inp = document.createElement("input"); inp.type = "number"; inp.min = "0"; inp.step = "1"; inp.id = "f_" + k; inp.value = cfg.config[k] || "";
      var un = el("label", null, "chk"), uc = document.createElement("input"); uc.type = "checkbox"; uc.checked = !cfg.config[k]; un.appendChild(uc); un.appendChild(el("span", "Unlimited"));
      inp.disabled = uc.checked; uc.addEventListener("change", function () { inp.disabled = uc.checked; if (!uc.checked && !inp.value) inp.focus(); });
      var note = el("div", srcNote(k), "src"); l.appendChild(note);
      row.appendChild(l); row.appendChild(inp); row.appendChild(un); box.appendChild(row); fields[k] = { kind: "limit", input: inp, unl: uc };
    });
    OTHERS.forEach(function (p) {
      var k = p[0], row = el("div", null, "row wide"), l = el("label", p[1]); l.htmlFor = "f_" + k; l.appendChild(el("div", srcNote(k), "src"));
      var inp = document.createElement("input"); inp.id = "f_" + k; inp.type = p[2] === "text" ? "text" : "number"; if (p[2] !== "text") { inp.min = "0"; inp.step = p[2] === "price" ? "any" : "1"; }
      inp.value = cfg.config[k] == null ? "" : cfg.config[k]; row.appendChild(l); row.appendChild(inp); box.appendChild(row); fields[k] = { kind: p[2], input: inp };
    });
  }
  function collect() {
    var patch = {}, bad = [];
    Object.keys(fields).forEach(function (k) {
      var f = fields[k], was = cfg.config[k], now;
      if (f.kind === "bool") now = f.input.checked;
      else if (f.kind === "limit") { if (f.unl.checked) now = 0; else { now = Number(f.input.value); if (f.input.value === "" || !isFinite(now) || now < 0) { bad.push(k); return; } now = Math.floor(now); } }
      else if (f.kind === "text") now = f.input.value.trim();
      else if (f.kind === "number") { now = f.input.value === "" ? 0 : Number(f.input.value); if (!isFinite(now) || now < 0) { bad.push(k); return; } }
      else { now = f.input.value.trim() === "" ? null : Number(f.input.value); if (now !== null && (!isFinite(now) || now < 0)) { bad.push(k); return; } }
      if (now !== was && !(f.kind === "price" && now === null && was === null)) patch[k] = f.kind === "price" && now === null ? "" : now;
    });
    return { patch: patch, bad: bad };
  }
  function showChanged(ch) {
    var box = $("changed"); clear(box); var keys = Object.keys(ch);
    if (!keys.length) { box.appendChild(el("p", "Nothing changed.", "note")); return; }
    box.appendChild(el("p", "Saved. What changed:"));
    var ul = el("ul"); keys.forEach(function (k) { ul.appendChild(el("li", k + ": " + String(ch[k].from == null ? "not set" : ch[k].from) + " to " + String(ch[k].to == null ? "not set" : ch[k].to))); }); box.appendChild(ul);
  }

  function load() {
    return Promise.all([api("/v1/admin/report?days=90"), api("/v1/admin/config")]).then(function (res) {
      days90 = res[0].days; cfg = res[1]; $("stamp").textContent = "Updated " + new Date(res[0].now).toISOString().replace("T", " ").slice(0, 16) + " UTC";
      renderPeriods(); renderChart(); renderTables(); renderConfig();
    }).catch(function (e) { if (e.message !== "auth") $("gatemsg").textContent = "Could not load: " + e.message; });
  }

  $("gateform").addEventListener("submit", function (ev) { ev.preventDefault(); var t = $("tok").value.trim(); if (t) open(t); });
  $("signout").addEventListener("click", function () { signOut(""); });
  $("refresh").addEventListener("click", function () { load(); });
  $("ranges").addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest("button") : null; if (!b) return;
    range = Number(b.getAttribute("data-days")); Array.prototype.forEach.call($("ranges").children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); renderTables();
  });
  $("cfg").addEventListener("submit", function (ev) {
    ev.preventDefault(); var c = collect(), msg = $("cfgmsg");
    if (c.bad.length) { msg.className = "err"; msg.textContent = "Check: " + c.bad.join(", "); return; }
    msg.className = "note"; msg.textContent = "Saving...";
    api("/v1/admin/config", { method: "PUT", body: JSON.stringify(c.patch) }).then(function (j) {
      msg.className = "ok"; msg.textContent = "Saved."; showChanged(j.changed || {}); cfg = { config: j.config, source: j.source, saved: j.saved }; renderConfig(); renderPeriods();
    }).catch(function (e) { if (e.message === "auth") return; msg.className = "err"; msg.textContent = "Not saved: " + e.message + (e.problems && e.problems.length ? " (" + e.problems.join("; ") + ")" : ""); });
  });

  if (token) open(token);
})();
</script>
</body>
</html>
`;
