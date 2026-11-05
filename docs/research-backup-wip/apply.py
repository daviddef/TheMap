#!/usr/bin/env python3
"""Apply the research-backup work (items 1-3) to a clone of Record Atlas.

    python3 docs/research-backup-wip/apply.py CLONE_ROOT

Idempotent per patch: a patch whose "new" text is already present is skipped, so it is safe to run twice. Every replacement
must match exactly once or the script stops with the name of the patch, and nothing after it is applied.

Do NOT run it while a site build is running (it edits site/src and site/public). After it: `cd site && npm test`, a dev-server look at
/my-research/, /shared/ and /roots/ (Fix list), then the full `npm run build` ("built output is sound").
"""
import json, os, shutil, sys

root = sys.argv[1] if len(sys.argv) > 1 else "."
here = os.path.dirname(os.path.abspath(__file__))
S = lambda *p: os.path.join(root, "site", *p)


def read(p):
    return open(p, encoding="utf-8").read()


def write(p, s):
    open(p, "w", encoding="utf-8").write(s)


def sub(path, old, new, name, count=1):
    s = read(path)
    if new in s:
        print("  skip (already applied):", name)
        return
    if s.count(old) != count:
        sys.exit(f"PATCH FAILED: {name}: expected {count} match(es) of the old text in {path}, found {s.count(old)}")
    write(path, s.replace(old, new))
    print("  ok:", name)


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(os.path.join(here, src), dst)
    print("  copied:", os.path.relpath(dst, root))


print("new files")
copy("research-file.js", S("public", "js", "research-file.js"))
copy("decisions.js", S("public", "roots", "js", "decisions.js"))
copy("research-backup.test.js", S("test", "research-backup.test.js"))
copy("shared.astro", S("src", "pages", "shared.astro"))

# --- progress-kit.js: stamp the reader's own changes, never the fold-in of the published sessions ---------------------------
pk = S("public", "js", "progress-kit.js")
print("progress-kit.js")
sub(pk, "    var mem = null;\n", "    var mem = null;\n    var folding = false;   // true while the published sessions are folded in: that is not the reader's own change\n", "folding flag")
sub(pk, """    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(mem)); }
      catch (e) { /* quota or blocked; the page must not break over it */ }
    }""", """    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(mem)); }
      catch (e) { /* quota or blocked; the page must not break over it */ }
      /* WHEN THE READER LAST CHANGED SOMETHING, for the backup nudge (research-file.js, line-switcher.js). The fold-in of the
         family archives' published sessions goes through save() too and must not count, or every visitor would be told to
         back up work they never did. */
      if (!folding) {
        try {
          var now = new Date().toISOString();
          if (!localStorage.getItem("ra-own-first")) localStorage.setItem("ra-own-first", now);
          localStorage.setItem("ra-own-last", now);
        } catch (e) { /* stamps are a convenience */ }
      }
    }""", "own-change stamps")
sub(pk, """          window.raProgress.fromJSON(JSON.stringify(doc), "merge");""",
    """          folding = true;
          try { window.raProgress.fromJSON(JSON.stringify(doc), "merge"); } finally { folding = false; }""", "fold-in is not an own change")

# --- the header: a quiet dot on "Researching" when work is unsaved -----------------------------------------------------------
ls = S("public", "js", "line-switcher.js")
print("line-switcher.js")
sub(ls, """      bar.hidden = bar.getAttribute("data-quiet") === "1" && lines.length < 2;
    }
""", """      bar.hidden = bar.getAttribute("data-quiet") === "1" && lines.length < 2;
      nudge();
    }

    /* A DOT, NOT A BANNER. Only the reader's own work counts (progress-kit.js stamps it), a day after the first change if
       they have never backed up and a week after a backup that is behind. The dot sends them to My research, which says why. */
    function nudge() {
      var a = bar.querySelector("a.ra-lines-l");
      if (!a) return;
      var first = null, rec = null, last = null;
      try {
        first = localStorage.getItem("ra-own-first"); last = localStorage.getItem("ra-own-last");
        rec = JSON.parse(localStorage.getItem("ra-backup-v1") || "null");
      } catch (e) { return; }
      var day = 86400000, now = Date.now(), why = "";
      if (first && !(rec && rec.at) && now - Date.parse(first) >= day) why = "Not backed up yet";
      else if (rec && rec.at && last && last > rec.at && now - Date.parse(rec.at) >= 7 * day) why = "Not backed up for " + Math.floor((now - Date.parse(rec.at)) / day) + " days";
      a.classList.toggle("ra-lines-warn", !!why);
      a.title = why ? why + ": open My research to back it up" : "Your research: every family you are tracking";
    }
""", "backup dot")
sub(S("src", "components", "LineSwitcher.astro"), "  .ra-lines-c a.ra-lines-l { text-decoration: none; }",
    "  .ra-lines-c a.ra-lines-l { text-decoration: none; }\n  a.ra-lines-warn::after { content: \" \\25CF\"; color: var(--brick, #b5472f); }", "dot style")

# --- /my-research/: backup, send, import, share --------------------------------------------------------------------------------
mr = S("src", "pages", "my-research.astro")
print("my-research.astro")
sub(mr, "  <ProgressKit />\n  <LineSwitcher />\n", "  <ProgressKit />\n  <script is:inline src={u(\"/js/research-file.js\")}></script>\n  <LineSwitcher />\n", "load research-file.js")
s = read(mr)
if 'id="mr-safe"' not in s:
    a = s.index('  <p class="mrbtns">')
    b = s.index("business, not ours.</p>", a) + len("business, not ours.</p>")
    html = '''  <div id="mr-safe" class="mrsafe">
    <p id="mr-status" class="mrstatus" role="status"></p>
    <p class="mrbtns">
      <button type="button" id="mr-export">Back up my research</button>
      <button type="button" id="mr-send" hidden>Send the file…</button>
      <button type="button" id="mr-import">Import a file</button>
      <input type="file" id="mr-file" accept="application/json,.json" hidden />
      <span id="mr-said" role="status" aria-live="polite"></span>
    </p>
    {/* WHERE THE FILE ACTUALLY GOES. A page cannot read your download folder and must not pretend to: what it CAN say for
        certain is the file's name, which it chooses, and that the browser puts it wherever downloads go. */}
    <p class="mrwhere3">The file is named <code id="mr-fname">record-atlas-research-…json</code> and lands wherever this browser
    saves downloads, usually <b>Downloads</b>. It holds every family line, every mark and, if you use the tree page, your fix-it
    decisions. <b>Importing merges and never replaces</b>, so a laptop and a phone can both be right. A copy of the browser storage
    saved with <code>save-browser-storage.js</code> from an older address of this site imports too.</p>
    <p class="mrwhere3" id="mr-persist"></p>
  </div>

  <div id="mr-share" class="mrsafe">
    <h2 class="mrh">Share what you have found</h2>
    <p class="cap">A pack is the work itself: which volumes, which pages, what state, under which family line. It holds no tree and no
    fix-it decisions, and your notes stay out unless you tick them in. Whoever opens it sees it as <b>reported by you, not
    checked</b>, and can merge it into their own research and carry on from where you stopped.</p>
    <p class="mrbtns">
      <label>Share <select id="mr-pscope"></select></label>
      <label class="mrck"><input type="checkbox" id="mr-pnotes" /> Include my notes</label>
    </p>
    <p class="cap" id="mr-ppreview"></p>
    <p class="mrbtns">
      <button type="button" id="mr-pfile">Download the pack</button>
      <button type="button" id="mr-plink">Copy a link</button>
      <span id="mr-pnote" role="status" aria-live="polite"></span>
    </p>
  </div>'''
    write(mr, s[:a] + html + s[b:])
    print("  ok: backup and share markup")
else:
    print("  skip (already applied): backup and share markup")
s = read(mr)
if "RF.exportAll" not in s:
    a = s.index('      document.getElementById("mr-export").addEventListener("click", function () {')
    b = s.index("      /* A BOOK ONTO THE TO-DO LIST.", a)
    js = r'''      /* BACK UP, SEND, IMPORT, SHARE. The file logic lives in public/js/research-file.js (tested in test/research-backup.test.js);
         this is only the buttons. */
      var RF = window.raResearchFile;
      var statusEl = document.getElementById("mr-status");
      var escH = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
      function refreshStatus() {
        if (!RF) return;
        var st = RF.backupStatus();
        statusEl.textContent = st.text;
        statusEl.className = "mrstatus " + st.level;
      }
      function showPersist(r) {
        var el = document.getElementById("mr-persist");
        el.textContent = r === "yes" ? "This browser has agreed to keep this data unless you clear it yourself."
          : r === "no" ? "This browser may remove this data when it needs space. A backup file is the only safe copy." : "";
      }
      function saveFile(name, text) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        a.download = name; a.click(); URL.revokeObjectURL(a.href);
      }
      document.getElementById("mr-export").addEventListener("click", function () {
        var out = RF.exportAll(), sm = RF.summary(out.file);
        saveFile(out.name, out.text);
        RF.noteBackup("download");
        said.textContent = "Saved as " + out.name + " · " + sm.volumes + " volumes, " + sm.lines + " family line" + (sm.lines === 1 ? "" : "s") +
          (sm.decisions ? ", " + sm.decisions + " fix-it decisions" : "");
        RF.persist().then(showPersist);
        refreshStatus();
      });
      var send = document.getElementById("mr-send");
      try {
        if (navigator.canShare && navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] })) send.hidden = false;
      } catch (e) { /* no share sheet here */ }
      send.addEventListener("click", function () {
        var out = RF.exportAll();
        navigator.share({ files: [new File([out.text], out.name, { type: "application/json" })], title: "Record Atlas research backup" })
          .then(function () { RF.noteBackup("share"); said.textContent = "Shared " + out.name; refreshStatus(); })
          .catch(function () { /* cancelled */ });
      });
      var file = document.getElementById("mr-file");
      document.getElementById("mr-import").addEventListener("click", function () { file.click(); });
      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          try {
            var res = RF.importText(String(r.result));
            said.textContent = "Merged " + res.marks + " marks" + (res.decisions ? " and " + res.decisions + " fix-it decisions" : "") + " from " + f.name +
              (res.kind === "record-atlas-pack" ? " (a shared pack: it is kept as its own family line)" : "");
            draw(); refreshStatus();
          } catch (e) {
            said.textContent = "That is not a Record Atlas research file (an export, a pack, or a copy of browser storage).";
          }
          file.value = "";
        };
        r.readAsText(f);
      });
      var psel = document.getElementById("mr-pscope"), pnotes = document.getElementById("mr-pnotes");
      var pprev = document.getElementById("mr-ppreview"), pnote = document.getElementById("mr-pnote");
      function fillScope() {
        var cur = psel.value;
        psel.innerHTML = '<option value="">everything, every family line</option>' + P.lines().map(function (l) {
          return '<option value="' + escH(l.slug) + '">' + escH(l.name + (l.where ? " of " + l.where : "")) + "</option>";
        }).join("");
        psel.value = cur;
      }
      function currentPack() { return RF.pack({ line: psel.value || null, notes: pnotes.checked }); }
      function preview() {
        var sm = RF.summary(currentPack());
        pprev.textContent = "This pack holds " + sm.volumes + " volumes (" + sm.pages + " pages) across " + sm.lines + " family line" + (sm.lines === 1 ? "" : "s") +
          (pnotes.checked ? ", with " + sm.notes + " of your notes: read them first, a note is where a name ends up" : ", without notes") + ".";
      }
      document.getElementById("mr-pfile").addEventListener("click", function () {
        saveFile("record-atlas-pack-" + (psel.value || "all") + "-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(currentPack(), null, 1));
        pnote.textContent = "Saved. Send the file to whoever should have it.";
      });
      document.getElementById("mr-plink").addEventListener("click", function () {
        RF.encodeLink(currentPack()).then(function (t) {
          var url = location.origin + BASE + "shared/#pack=" + t;
          if (url.length > RF.LINK_MAX) { pnote.textContent = "Too big for a link (" + url.length + " characters). Download the pack and send the file."; return; }
          return navigator.clipboard.writeText(url).then(function () {
            pnote.textContent = "Link copied (" + url.length + " characters). The pack travels inside the link; nothing is stored on our server.";
          }, function () { pnote.textContent = url; });
        });
      });
      [psel, pnotes].forEach(function (x) { x.addEventListener("change", preview); });
      document.addEventListener("ra-progress-changed", function () { fillScope(); preview(); refreshStatus(); });
      fillScope(); preview(); refreshStatus();
      if (RF) RF.persisted().then(function (p) { if (p) showPersist("yes"); });
'''
    write(mr, s[:a] + js + s[b:])
    print("  ok: backup and share script")
else:
    print("  skip (already applied): backup and share script")
sub(mr, "  .mrwhere3 {", """  .mrsafe { margin: 18px 0 0; }
  .mrstatus { font-family: var(--sans); font-size: 14px; margin: 0 0 8px; padding-left: 10px; border-left: 3px solid var(--rule); }
  .mrstatus.nudge { border-left-color: var(--brass, #b08d3c); }
  .mrstatus.urgent { border-left-color: var(--brick, #b5472f); font-weight: 600; }
  .mrck { font-family: var(--sans); font-size: 13.5px; }
  .mrsafe select { font: inherit; font-family: var(--sans); font-size: 14px; max-width: 100%; }
  .mrwhere3 {""", "my-research styles")

# --- /roots/ fix list: remember what was ticked and left as is -----------------------------------------------------------------
ap = S("public", "roots", "js", "app.js")
print("roots app.js")
sub(ap, "import * as recent from './recent.js';", "import * as recent from './recent.js';\nimport { store as dec, rowsFrom, fileTextOf, parseRows, lookup } from './decisions.js';", "import decisions")
sub(ap, "cb.onchange = () => { cb.checked ? ticked.add(i.key) : ticked.delete(i.key); row.classList.toggle('done', cb.checked); fixCount(s); };",
    "cb.onchange = () => { cb.checked ? ticked.add(i.key) : ticked.delete(i.key); dec.put(i.key, 'd', cb.checked); row.classList.toggle('done', cb.checked); fixCount(s); };", "tick is remembered")
sub(ap, "asIs.add(i.key); drawFix();", "asIs.add(i.key); dec.put(i.key, 'a', true); drawFix();", "leave as is is remembered", count=2)
sub(ap, "for (const i of s.items) asIs.delete(i.key); d.dataset.open = '1'; drawFix();", "for (const i of s.items) { asIs.delete(i.key); dec.put(i.key, 'a', false); } d.dataset.open = '1'; drawFix();", "show again is remembered")
sub(ap, "function fixlist(m) { fix = m; drawFix(); }", """/* ---------- decisions kept on this device (opt-in, see decisions.js) ---------- */
let loaded = null;                                   // rows read from a file this session: applied, not kept unless the switch is on
function restoreDecisions(m) {
  let n = 0;
  for (const s of m.sections) for (const i of s.items) {
    const r = dec.get(i.key) || lookup(loaded, i.key); if (!r) continue;
    n++; if (r.a) asIs.add(i.key); if (r.d) ticked.add(i.key);
  }
  return n;
}
function decStatus(restored) {
  const on = $('#dec-on'); if (!on) return;
  on.checked = dec.isOn(); on.disabled = !dec.available();
  const kept = dec.count();
  $('#dec-said').textContent = !dec.available() ? 'This browser has no storage for it (a private window?). Save the decisions to a file instead.'
    : (restored ? restored + ' earlier decision' + (restored === 1 ? '' : 's') + ' re-applied. ' : '')
      + (dec.isOn() ? kept + ' kept on this device.' : kept ? kept + ' loaded from a file are stored on this device; turn this on to keep new ones too.' : 'Not kept: ticks and "left as is" are lost when you close the page.');
}
function fixlist(m) { fix = m; const n = restoreDecisions(m); drawFix(); decStatus(n); }
$('#dec-on').onchange = e => { dec.setOn(e.target.checked); if (e.target.checked) { for (const k of asIs) dec.put(k, 'a', true); for (const k of ticked) dec.put(k, 'd', true); } decStatus(0); };
$('#dec-save').onclick = () => saveAs('fix-decisions-' + new Date().toISOString().slice(0, 10) + '.json', fileTextOf(rowsFrom(asIs, ticked)), 'application/json');
$('#dec-load').onclick = () => $('#dec-file').click();
$('#dec-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const text = await f.text(); loaded = parseRows(text); if (dec.isOn()) dec.load(text); const n = fix ? restoreDecisions(fix) : 0; drawFix(); decStatus(n); }
  catch { $('#dec-said').textContent = 'That is not a decisions file.'; }
};
$('#dec-forget').onclick = () => { dec.forget(); loaded = null; decStatus(0); };""", "restore and wire decisions")
ix = S("src", "pages", "roots", "index.astro")
print("roots index.astro")
sub(ix, "Ticks stay in this page, so download the list to keep your place.", "Ticks and \"left as is\" stay in this page unless you ask to keep them: tick the box below, or save the decisions to a file.", "fix list intro")
sub(ix, '    <div id="fsecs"></div>', '''    <div class="dec">
      <label class="small"><input type="checkbox" id="dec-on"> Remember my decisions on this device</label>
      <span class="small" id="dec-said"></span>
      <span class="fdl"><button class="btn" id="dec-save">Save decisions</button><button class="btn" id="dec-load">Load decisions</button><button class="btn" id="dec-forget">Forget what is kept</button><input type="file" id="dec-file" accept="application/json,.json" hidden></span>
    </div>
    <p class="small">What is kept is a scrambled fingerprint of each row, with the day, and never a name, a date or a place. It is not encryption. Open the same tree again and the decisions are found again; switching the box off forgets them.</p>
    <div id="fsecs"></div>''', "decisions markup")
sub(S("public", "roots", "roots.css"), ".fdl .btn{padding:5px 12px;font-size:14px}", ".fdl .btn{padding:5px 12px;font-size:14px}\n.dec{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:0 0 6px}", "decisions style")
import re
_b = S("public", "roots", "js", "build.js"); _t = read(_b)
if "'2026-11-06.a'" in _t: print("  skip (already applied): bump the build stamp")
else:
    write(_b, re.sub(r"export const BUILD = '[^']*';", "export const BUILD = '2026-11-06.a';", _t, count=1)); print("  ok: bump the build stamp")
rt = S("test", "roots.test.js")
sub(rt, '"js/remember.js", "js/recent.js", "js/myheritage.js"]', '"js/remember.js", "js/decisions.js", "js/recent.js", "js/myheritage.js"]', "test lists decisions.js")
sub(rt, 'const remembers = f === "js/remember.js";', 'const remembers = f === "js/remember.js" || f === "js/decisions.js";   // decisions.js: the fix list\'s ticks and "left as is", as hashes, if the visitor asks', "test: decisions.js may use localStorage and nothing else")
sub(rt, 'const stores = f === "js/recent.js" || f === "js/remember.js";', 'const stores = f === "js/recent.js" || f === "js/remember.js" || f === "js/decisions.js";', "test: decisions.js is a keeping module")

# --- worklist, whats-new -------------------------------------------------------------------------------------------------------
print("worklist and what's new")
wl = S("src", "data", "worklist.json")
w = json.load(open(wl, encoding="utf-8"))
orig = read(wl)
if json.dumps(w, ensure_ascii=False, indent=1) + "\n" != orig and json.dumps(w, ensure_ascii=False, indent=1) != orig:
    print("  !! worklist.json is not in json.dumps(indent=1) form: add the rows by hand from worklist-rows.json")
else:
    new = json.load(open(os.path.join(here, "worklist-rows.json"), encoding="utf-8"))
    have = {r["what"] for r in w["rows"]}
    n0 = max(r["n"] for r in w["rows"])
    added = 0
    for r in new:
        if r["what"] in have:
            continue
        n0 += 1; added += 1
        w["rows"].append({"n": n0, **r})
    write(wl, json.dumps(w, ensure_ascii=False, indent=1) + ("\n" if orig.endswith("\n") else ""))
    print(f"  ok: {added} worklist rows added")
print("done. Now: cd site && npm test; look at /my-research/, /shared/, /roots/; full npm run build; scripts/check-data.py")
