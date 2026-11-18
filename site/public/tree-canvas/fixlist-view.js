/* THE FULL FIX LIST WORKSPACE: the page over the canvas that lists everything to fix, as a checklist. It is drawn here, in this page, from the model fixlist.js builds; the
   rows are fixlist-rows.js's (the same component the canvas's side panel draws for one person). It keeps nothing of its own: ticks and "left as is" go through the decisions store
   (/roots/js/decisions.js), which the six-word copy already carries.

   BIG LISTS. A file can have thousands of rows. Only the section headers are drawn at first; a section's rows are drawn when it is opened, one page (100) at a time, and only
   the section that changed is redrawn when a row is ticked. Counts come from one pass over the rows (tally), never from the page. */
import { buildModel, tally, visible, toOpen, rrView, createState, arranged, PRIORITY, ORDERS, ROW_SORTS, BATCH, PAGE } from './fixlist.js';
import { rowEl, mk, FX_ICON } from './fixlist-rows.js';
import { checklistText, checklistCsv, describe } from '../roots/js/checklist.js';
import { rowsFrom, fileTextOf, parseRows, summarise } from '../roots/js/decisions.js';

const n0 = n => Number(n).toLocaleString('en');
const PRIO_N = Object.keys(PRIORITY).length;   // sections ranked (see PRIORITY in fixlist.js)
const today = () => new Date().toISOString().slice(0, 10);
/* the two sort choices are remembered on this device only (a convenience: nothing else reads them); the page works without storage */
const keep = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* private window or blocked storage */ } return null; };

/* cfg: { root, dec (the store), fixes (the My research summary store), links, show(keys), openSettings(), fileName(), syncOn(), livingHidden() (the canvas's living lock), capInfo(rows) (what the six-word copy leaves out, or null where that copy is not in play), onCount(open), onLists(), doc } */
export function createWorkspace(cfg) {
  const root = cfg.root, doc = root.ownerDocument, $ = s => root.querySelector(s);
  let m = null, cmp = null, salt = '', model = buildModel(null, null, ''), mode = 'open', groupFilter = '', q = '', personId = null, personName = '', loaded = null, collapse = false;
  let order = keep('ra-fix-order') in ORDERS ? keep('ra-fix-order') : 'priority', rowsHow = keep('ra-fix-rows') in ROW_SORTS ? keep('ra-fix-rows') : 'useful';
  let autoOpen = false;
  const open = new Map(), shown = new Map(), opened = new Set(), listeners = [];
  let tl = null, sumTimer = 0;
  const st = createState(cfg.dec, { saved: () => { drawKeep(); document.dispatchEvent(new CustomEvent('ra-progress-changed')); } });
  const ctx = {
    st, get links() { return cfg.links(); }, show: keys => cfg.show(keys), collapseNotes: () => collapse,
    onChange(s, i, row, kind) { st.flush(); after(s, i, row, kind); },
  };
  Object.defineProperty(ctx, 'fileName', { get: () => (cfg.fileName && cfg.fileName()) || '' });

  /* ---- loading ---- */
  function setData(msg, cmpRaw, saltKey) {
    m = msg || null; cmp = cmpRaw || null; salt = saltKey || '';
    model = buildModel(m, cmp, salt); st.load(model, loaded); tl = tally(model, st);
    if (!$('#fx-body').closest('[hidden]')) draw(); else paintTop();
    cfg.onCount && cfg.onCount(tl.open);
    keepSummary();
  }
  const rules = () => ({ q, mode, personId, rows: rowsHow });

  /* ---- the top: counts, progress, hints ---- */
  function paintTop() {
    tl = tl || tally(model, st);
    const done = tl.handled, total = tl.total, pct = total ? Math.round(100 * done / total) : 100;
    const bar = $('#fx-bar'); bar.setAttribute('aria-valuenow', String(pct)); bar.setAttribute('aria-valuetext', n0(done) + ' of ' + n0(total) + ' done'); bar.firstElementChild.style.width = pct + '%';
    $('#fx-prog').textContent = total ? n0(done) + ' of ' + n0(total) + ' done · ' + n0(tl.open) + ' to do' : 'Nothing to fix';
    const hasMh = !!(cfg.links() && cfg.links().get && cfg.links().get().mh), anc = !!(cfg.links() && cfg.links().get && cfg.links().get().anc);
    $('#fx-hint').hidden = hasMh || anc || !total;
    /* one plain line: are living people in this list or not? It is the canvas's own living lock (Settings), the same one that decided whether the reader put them in */
    const lv = $('#fx-living'); lv.hidden = !m;
    if (m) lv.firstElementChild.textContent = cfg.livingHidden && cfg.livingHidden() ? 'Living people are left out of this list.' : 'Living people are included in this list.';
    $('#fx-sub').textContent = !m && !model.hasCmp ? 'The fix list is made from a GEDCOM. Open one and it is worked out here, in this browser; nothing is sent.'
      : 'Made in your browser from ' + (cfg.fileName() || 'your file') + (model.main ? ' · ' + n0(model.main) + ' people in the main tree' : '') + '. Fix things in your own tree program, then open the file again: a row that has been fixed is gone.';
    drawKeep();
    const f = $('#fx-who'); f.hidden = personId == null; if (personId != null) { f.firstElementChild.textContent = 'Only rows that name ' + (personName || 'this person'); }
    $('#fx-empty').hidden = !!total || !m && !model.hasCmp;
  }
  function drawKeep() {
    const on = cfg.dec.isOn() && cfg.dec.available(), box = $('#fx-keepon'); box.checked = cfg.dec.isOn(); box.disabled = !cfg.dec.available();
    const k = cfg.dec.count(), t = $('#fx-saved'); t.classList.toggle('saved', on);
    /* the six-word copy carries 15,000 rows at most (research-file.js says which are dropped); say so when this device holds more, and that they stay here */
    const cap = on && cfg.capInfo ? cfg.capInfo(cfg.dec.rows()) : null, over = cap ? cap.decisions : 0, capSay = over ? ' ' + n0(over) + (over === 1 ? ' decision is' : ' decisions are') + ' beyond the ' + n0(cap.kept) + ' the six words can carry; ' + (over === 1 ? 'it stays' : 'they stay') + ' on this device.' : '';
    t.textContent = !cfg.dec.available() ? 'This browser has no storage for it (a private window?). Save the decisions to a file instead.'
      : on ? '✓ Saved on this device: ' + n0(k) + (k === 1 ? ' decision' : ' decisions') + (st.pending() ? ' (saving…)' : '') + '. ' + (cfg.syncOn() ? 'With your six words on, they are also copied to your encrypted copy within about half a minute, and an untick travels too.' : 'Turn on the six words (Connection & Backup) to keep them on every device.') + capSay
        : k ? n0(k) + ' decisions are stored on this device; turn this on to keep new ones too.' : 'Not kept: ticks and "left as is" are lost when you close the page.';
  }

  /* ---- drawing ---- */
  const secDone = s => s.items.every(i => st.isDone(i.key) || st.isAsIs(i.key));
  const progress = x => n0(x.done + x.asis) + ' of ' + n0(x.total);
  function paintCounts() {
    tl = tally(model, st); paintTop();
    for (const s of model.sections) {
      const x = tl.sec[s.key], el = doc.getElementById('fx-sec-' + s.key); if (!el) continue;
      const c = el.querySelector('.fx-sc'); if (c) { c.textContent = progress(x); c.title = progress(x) + ' done'; }
      const bar = el.querySelector('.fx-mini i'); if (bar) bar.style.width = (x.total ? Math.round(100 * (x.done + x.asis) / x.total) : 0) + '%';
      const ok = x.open === 0; el.classList.toggle('sec-done', ok); const t = el.querySelector('summary .fx-tick'); if (t) t.hidden = !ok;
    }
    for (const g of model.groups) {
      const el = doc.getElementById('fx-grp-' + g.key); if (!el) continue; const x = tl.grp[g.key], ok = x.total > 0 && x.open === 0;
      el.classList.toggle('group-done', ok); el.querySelector('.fx-tick').hidden = !ok; el.querySelector('.fx-gc').textContent = n0(x.total - x.open) + ' of ' + n0(x.total) + ' done';
      const b = doc.getElementById('fx-gact-' + g.key); if (b && b._paint) b._paint();
    }
    cfg.onCount && cfg.onCount(tl.open);
  }
  /* a tick greys the row where it is (so an accidental one can be taken back); "left as is" takes it off the list, or, in a filter that shows it, redraws it */
  function after(s, i, row, kind) {
    paintCounts();
    if (kind === 'a' && row && row.isConnected) {
      const drop = (mode === 'open' && st.isAsIs(i.key)) || (mode === 'asis' && !st.isAsIs(i.key));
      if (drop) { const body = row.parentElement; row.remove(); if (body && !body.querySelector('.fx-row')) drawSection(s); }
      else row.replaceWith(rowEl(doc, ctx, s, i));
    }
    keepSummary(); listeners.forEach(f => f());
  }
  function drawSection(s, el) {
    const d = el || doc.getElementById('fx-sec-' + s.key); if (!d) return; const body = d.querySelector('.fx-sbody'); body.textContent = '';
    if (!s.items.length) { body.append(mk(doc, 'p', 'fx-small', s.cmp ? 'Nothing from the comparison yet.' : 'Nothing to do here.')); return; }
    const items = visible(s, st, rules()), cap = shown.get(s.key) || PAGE;
    const left = s.items.filter(i => st.isAsIs(i.key) && !st.isDone(i.key)).length;
    if (left && mode !== 'asis') { const b = mk(doc, 'button', 'fx-link', n0(left) + ' left as is: show them again'); b.type = 'button'; b.onclick = () => { st.setMany(s.items.filter(i => st.isAsIs(i.key)).map(i => i.key), 'a', false); st.flush(); open.set(s.key, true); paintCounts(); drawSection(s); }; body.append(b); }
    if (!items.length) body.append(mk(doc, 'p', 'fx-small', mode === 'open' && !q && personId == null ? 'Nothing left to do here.' : 'No rows match.'));
    const frag = doc.createDocumentFragment();
    for (const i of items.slice(0, cap)) frag.append(rowEl(doc, ctx, s, i));
    body.append(frag);
    if (items.length > cap) { const b = mk(doc, 'button', 'fx-link fx-more', 'Show ' + Math.min(PAGE, items.length - cap) + ' more of ' + n0(items.length - cap)); b.type = 'button'; b.onclick = () => { shown.set(s.key, cap + PAGE); drawSection(s); }; body.append(b); }
    d.dataset.drawn = '1';
  }
  /* one section is ONE line, in the same columns for every section: [chevron] title | how many | progress (bar and "1 of 37") | (i) | priority. Its rows open under it. */
  function sectionEl(s) {
    const d = mk(doc, 'details', 'fx-sec fx-sec-' + s.key); d.id = 'fx-sec-' + s.key;
    const x = tl.sec[s.key], sum = mk(doc, 'summary'), tk = mk(doc, 'span', 'fx-tick', '✓'); tk.title = 'Done: nothing left to do here'; tk.hidden = true;
    const title = mk(doc, 'span', 'fx-st'); title.append(tk, mk(doc, 'b', null, s.title));
    const cnt = mk(doc, 'span', 'fx-n', n0(s.items.length)); cnt.title = n0(s.items.length) + (s.items.length === 1 ? ' row' : ' rows');
    const pg = mk(doc, 'span', 'fx-pg'), mini = mk(doc, 'span', 'fx-mini'), fill = mk(doc, 'i'); mini.append(fill); fill.style.width = (x.total ? Math.round(100 * (x.done + x.asis) / x.total) : 0) + '%';
    const c = mk(doc, 'span', 'fx-sc', progress(x)); c.title = progress(x) + ' done'; pg.append(mini, c);
    const how = mk(doc, 'div', 'fx-how'); how.hidden = true;
    how.append(mk(doc, 'p', 'fx-small', s.how));
    if (s.why) { const pp = mk(doc, 'p', 'fx-small fx-prwhy'); pp.append(mk(doc, 'b', null, s.level + ' priority (' + s.rank + ' of ' + PRIO_N + '). '), s.why); how.append(pp); }
    const info = mk(doc, 'button', 'fx-ib', null); info.type = 'button'; info.innerHTML = FX_ICON.info; info.title = 'What is this list, and why this priority?'; info.setAttribute('aria-label', 'What is this list, and why is it ' + s.level.toLowerCase() + ' priority? ' + s.title); info.setAttribute('aria-expanded', 'false');
    info.onclick = e => { e.preventDefault(); e.stopPropagation(); how.hidden = !how.hidden; info.setAttribute('aria-expanded', String(!how.hidden)); };
    const chip = mk(doc, 'span', 'fx-pr fx-pr-' + s.level.toLowerCase(), s.level); chip.title = s.level + ' priority: ' + (s.why || '');
    sum.append(title, cnt, pg, info, chip); d.append(sum, how, mk(doc, 'div', 'fx-sbody'));
    if (!s.items.length) d.classList.add('fx-empty');
    d.open = !!open.get(s.key) && s.items.length > 0;
    d.addEventListener('toggle', () => { open.set(s.key, d.open); if (d.open && !d.dataset.drawn) drawSection(s, d); });
    if (d.open) drawSection(s, d);
    if (x.open === 0 && x.total) { d.classList.add('sec-done'); tk.hidden = false; }
    return d;
  }
  /* OPEN ALL, A BATCH AT A TIME (Roots & Routes' own rule): every person on the rows still to do in a group, each in its own tab on the tree site, ten at a time. */
  function openAllBar(g, secs) {
    const bar = mk(doc, 'div', 'fx-gact'), b = mk(doc, 'button', 'fx-openall'), say = mk(doc, 'span', 'fx-small fx-muted');
    b.type = 'button'; bar.append(say, b); bar.id = 'fx-gact-' + g.key;
    const urlOf = p => { const L = cfg.links(), u = L && L.url ? L.url(p.id, p.name) : null; return u ? (u.mh || u.anc || '') : ''; };
    const paint = () => {
      const todo = toOpen(secs, st, rules()), left = todo.filter(p => !opened.has(p.id) && urlOf(p)), usable = todo.some(urlOf), n = left.length;
      b.disabled = !usable || !n;
      b.textContent = !usable ? 'Open people' : !n ? 'All opened' : n > BATCH ? 'Open next ' + BATCH + ' people' : 'Open ' + n + (n === 1 ? ' person' : ' people');
      b.title = !usable ? 'Add your MyHeritage tree link in Settings (or open an Ancestry export) and each person can be opened here' : 'Open the next people in this group, each in its own tab';
      say.textContent = !usable ? (todo.length ? 'Needs your tree link (Settings).' : '') : (todo.length - n) + ' of ' + todo.length + (todo.length === 1 ? ' person' : ' people') + ' opened' + (n > BATCH ? ', ' + n + ' to go' : '');
    };
    b.onclick = () => {
      let blocked = 0, did = 0;
      for (const p of toOpen(secs, st, rules()).filter(p => !opened.has(p.id) && urlOf(p)).slice(0, BATCH)) {
        const w = doc.defaultView.open(urlOf(p), '_blank');
        if (w) { try { w.opener = null; } catch (e) { /* cross-origin already */ } opened.add(p.id); did++; } else { blocked++; break; }
      }
      paint();
      if (blocked) say.textContent = (did ? did + ' opened, then' : 'Nothing opened:') + ' your browser blocked the extra tabs. Allow pop-ups for this site (the icon at the right of the address bar), then press again.';
    };
    bar._paint = paint; paint(); return bar;
  }
  function draw() {
    tl = tally(model, st); const box = $('#fx-body'); box.textContent = ''; paintTop();
    /* a section opens on its own when it is the first with something to do, or when a search or a person narrows the list to it */
    const lay = arranged(model, tl, order);
    if (!open.size) { const first = lay.flatMap(x => x.secs).find(s => tl.sec[s.key].open > 0); if (first) open.set(first.key, true); }
    const narrow = q || personId != null;
    for (const { g, secs } of lay) {
      if (groupFilter && g.key !== groupFilter) continue;
      const x = tl.grp[g.key], head = mk(doc, 'div', 'fx-ghead'), h = mk(doc, 'h2', 'fx-group'); h.id = 'fx-grp-' + g.key; const gt = mk(doc, 'span', 'fx-tick', '✓'); gt.hidden = !(x.total > 0 && x.open === 0);
      h.append(gt, mk(doc, 'span', null, g.title), mk(doc, 'span', 'fx-gn', n0(x.total)), mk(doc, 'span', 'fx-gc', n0(x.total - x.open) + ' of ' + n0(x.total) + ' done'));
      h.classList.toggle('group-done', !gt.hidden);
      head.append(h); if (x.total && g.key !== 'compare') head.append(openAllBar(g, secs));
      box.append(head, mk(doc, 'p', 'fx-gh', g.how));
      for (const s of secs) {
        if (narrow) { const hits = visible(s, st, { q, mode: 'all', personId }).length; if (!hits) continue; if (autoOpen) open.set(s.key, true); }
        box.append(sectionEl(s));
      }
    }
    autoOpen = false;
    if (!box.firstChild) box.append(mk(doc, 'p', 'fx-small', model.total ? 'Nothing matches that. Clear the search or the filters.' : (m || model.hasCmp ? 'Nothing to fix.' : '')));
  }
  function keepSummary() {
    clearTimeout(sumTimer);
    sumTimer = setTimeout(() => { if (m && cfg.fileName() && cfg.dec.isOn()) cfg.fixes.put(summarise(rrView(model), st.asIs, st.ticked, cfg.fileName())); }, 600);
  }

  /* ---- the controls ---- */
  let qT = 0;
  $('#fx-q').oninput = e => { clearTimeout(qT); qT = setTimeout(() => { q = e.target.value; shown.clear(); autoOpen = true; draw(); }, 150); };
  $('#fx-mode').onchange = e => { mode = e.target.value; shown.clear(); draw(); };
  $('#fx-grp').onchange = e => { groupFilter = e.target.value; draw(); };
  const ordSel = $('#fx-order'), rowSel = $('#fx-rows');
  for (const [k, t] of Object.entries(ORDERS)) ordSel.append(new Option(t, k)); ordSel.value = order;
  for (const [k, t] of Object.entries(ROW_SORTS)) rowSel.append(new Option(t, k)); rowSel.value = rowsHow;
  ordSel.onchange = e => { order = e.target.value; keep('ra-fix-order', order); draw(); };
  rowSel.onchange = e => { rowsHow = e.target.value; keep('ra-fix-rows', rowsHow); shown.clear(); draw(); };
  $('#fx-fold').onchange = e => { collapse = e.target.checked; for (const d of root.querySelectorAll('.fx-notes')) d.open = !collapse; };
  $('#fx-expand').onclick = () => { for (const s of model.sections) if (s.items.length) open.set(s.key, true); draw(); };
  $('#fx-collapse').onclick = () => { open.clear(); for (const s of model.sections) open.set(s.key, false); draw(); };
  $('#fx-whoX').onclick = () => setPerson(null);
  const sb = $('#fx-settings'); if (sb) sb.onclick = () => cfg.openSettings();
  const sl = $('#fx-living-set'); if (sl) sl.onclick = () => cfg.openSettings();
  doc.addEventListener('ra-sync-done', () => drawKeep());   // the six-word code loads a moment after the page: say so once it is there
  $('#fx-keepon').onchange = e => {
    const on = e.target.checked; cfg.dec.setOn(on); cfg.dec.optOut(!on);
    if (!on) cfg.fixes.forget(); else { st.flush(); cfg.dec.putMany([...st.asIs].map(k => [k, 'a', true]).concat([...st.ticked].map(k => [k, 'd', true]))); keepSummary(); }
    drawKeep();
  };
  $('#fx-save').onclick = () => download('fix-decisions-' + today() + '.json', fileTextOf(rowsFrom(st.asIs, st.ticked)), 'application/json');
  $('#fx-load').onclick = () => $('#fx-file').click();
  $('#fx-file').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const text = await f.text(); loaded = parseRows(text); if (cfg.dec.isOn()) cfg.dec.load(text); const n = st.load(model, loaded); tl = tally(model, st); draw(); cfg.onCount && cfg.onCount(tl.open); $('#fx-saved').textContent = n0(n) + ' earlier decisions re-applied from the file.'; }
    catch (x) { $('#fx-saved').textContent = 'That is not a decisions file.'; }
  };
  $('#fx-forget').onclick = () => { cfg.dec.forget(); cfg.fixes.forget(); loaded = null; st.ticked.clear(); st.asIs.clear(); tl = tally(model, st); draw(); cfg.onCount && cfg.onCount(tl.open); };
  $('#fx-txt').onclick = () => m && download('fix-list.txt', checklistText(rrView(model), today()), 'text/plain;charset=utf-8');
  $('#fx-csv').onclick = () => m && download('fix-list.csv', '﻿' + checklistCsv(rrView(model)), 'text/csv;charset=utf-8');
  $('#fx-pdf').onclick = () => m && toPdf();
  function download(name, text, type) { const u = URL.createObjectURL(new Blob([text], { type })), a = doc.createElement('a'); a.href = u; a.download = name; doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  /* The PDF is the browser's own "Save as PDF" over a print-ready copy of the list, built here from the same rows. Nothing is uploaded. */
  function toPdf() {
    const was = doc.getElementById('fx-print'); if (was) was.remove();
    const p = mk(doc, 'div'); p.id = 'fx-print';
    p.append(mk(doc, 'h1', null, 'Fix list'), mk(doc, 'p', 'fx-small', 'Made in your browser from your GEDCOM, ' + today() + (model.main ? ' · ' + n0(model.main) + ' people in the main tree' : '') + '. Tick a box when the line is done in your own tree. Help from Record Atlas (recordatlas.org); where the Atlas has nothing, the line says so.'));
    const view = rrView(model);
    for (const g of view.groups) {
      const secs = g.sections.map(k => view.sections.find(x => x.key === k)).filter(x => x && x.items.length); if (!secs.length) continue;
      p.append(mk(doc, 'h2', null, g.title), mk(doc, 'p', 'fx-small', g.how));
      for (const s of secs) {
        p.append(mk(doc, 'h3', null, s.title + ' (' + s.items.length + ')'));
        for (const i of visible(s, st, { q, mode: 'open' })) {
          const d = describe(s, i), row = mk(doc, 'div', 'fx-pitem'), main = mk(doc, 'div'); row.append(mk(doc, 'span', 'fx-pbox', '☐')); main.append(mk(doc, 'b', null, d.head));
          if (d.why) main.append(mk(doc, 'div', 'fx-pwhy', d.why)); if (d.people) main.append(mk(doc, 'div', 'fx-ppeople', d.people));
          if (d.next) { const n = mk(doc, 'div', 'fx-pnext'); n.append(mk(doc, 'b', null, 'Next step '), d.next); main.append(n); }
          for (const x of d.info) main.append(mk(doc, 'div', 'fx-pinfo', x.k + ': ' + x.t));
          row.append(main); p.append(row);
        }
      }
    }
    doc.body.append(p); doc.body.classList.add('fx-printing');
    const undo = () => { doc.body.classList.remove('fx-printing'); p.remove(); doc.defaultView.removeEventListener('afterprint', undo); };
    doc.defaultView.addEventListener('afterprint', undo); setTimeout(() => { try { doc.defaultView.print(); } catch (e) { undo(); } }, 60);
  }

  function setPerson(id, name) { personId = id == null ? null : String(id); personName = name || ''; shown.clear(); open.clear(); autoOpen = true; draw(); }
  function fillGroups() { const s = $('#fx-grp'); s.textContent = ''; s.append(new Option('Every group', '')); for (const { g } of arranged(model, tl, order)) s.append(new Option(g.title, g.key)); s.value = groupFilter; }
  return {
    setData, setPerson, st, ctx, draw, paintCounts,
    model: () => model, tally: () => (tl = tl || tally(model, st)), onChange: f => listeners.push(f),
    refresh() { fillGroups(); draw(); },
    /* the page is about to be shown: fill the group list, and show everyone or only one person's rows */
    present(person) { fillGroups(); if (person) setPerson(person.id, person.name); else { personId = null; personName = ''; open.clear(); autoOpen = false; draw(); } },
    changed() { paintCounts(); keepSummary(); listeners.forEach(f => f()); },
    clearFilters() { q = ''; $('#fx-q').value = ''; mode = 'open'; $('#fx-mode').value = 'open'; groupFilter = ''; personId = null; personName = ''; },
  };
}
