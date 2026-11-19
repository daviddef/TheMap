/* THE FULL FIX LIST WORKSPACE: the page over the canvas that lists everything to fix, as a checklist. It is drawn here, in this page, from the model fixlist.js builds; the
   rows are fixlist-rows.js's (the same component the canvas's side panel draws for one person). It keeps nothing of its own: ticks and "left as is" go through the decisions store
   (/roots/js/decisions.js), which the six-word copy already carries.

   BIG LISTS. A file can have thousands of rows. Only the section headers are drawn at first; a section's rows are drawn when it is opened, one page (100) at a time, and only
   the section that changed is redrawn when a row is ticked. Counts come from one pass over the rows (tally), never from the page. */
import { buildModel, tally, visible, toOpen, rrView, createState, arranged, catalogueChoices, nameMatcher, PRIORITY, PLACES, ORPHANS, ORDERS, ROW_SORTS, BATCH, PAGE } from './fixlist.js';
import { NEEDS } from '../roots/js/placereview.js';
import { rowEl, mk, FX_ICON, hoistRepeats, stripRepeats } from './fixlist-rows.js';
import { checklistText, checklistCsv, describe } from '../roots/js/checklist.js';
import { rowsFrom, fileTextOf, parseRows, summarise } from '../roots/js/decisions.js';

const n0 = n => Number(n).toLocaleString('en');
const PRIO_N = Object.keys(PRIORITY).length, PLACE_N = Object.keys(PLACES.table).length, ORPH_N = Object.keys(ORPHANS.table).length;   // sections ranked (see PRIORITY, PLACE_PRIORITY and ORPHAN_PRIORITY in fixlist.js)
const today = () => new Date().toISOString().slice(0, 10);
/* the two sort choices are remembered on this device only (a convenience: nothing else reads them); the page works without storage */
const keep = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* private window or blocked storage */ } return null; };

/* THREE LISTS, ONE PAGE: cfg.kind 'places' makes the Places tab's workspace (placereview.js rows) and 'orphans' the Orphans tab's (orphans.js rows), cfg.pfx the prefix their element
   ids use ('fxp', 'fxo'), so the panes can sit in one document from one piece of markup. The People workspace also owns the shared "keeping" section (cfg.keepRoot) and is told of
   the others with addPeer, so that saving, loading and forgetting decisions cover every list.

   cfg: { root, dec (the store), fixes (the My research summary store), links, show(keys), openSettings(), fileName(), syncOn(), livingHidden() (the canvas's living lock), capInfo(rows) (what the six-word copy leaves out, or null where that copy is not in play), onCount(open), onLists(), doc } */
export function createWorkspace(cfg) {
  const root = cfg.root, doc = root.ownerDocument, PL = cfg.kind === 'places', OR = cfg.kind === 'orphans', pfx = cfg.pfx || 'fx', KIND = PL ? PLACES : OR ? ORPHANS : null, PEOPLE = pfx === 'fx';
  const pid = id => pfx + id.slice(2);                                                   // 'fx-sec-x' -> 'fxp-sec-x' for the Places pane
  const $ = s => root.querySelector(pfx === 'fx' ? s : s.replace(/#fx-/g, '#' + pfx + '-'));
  const byId = id => root.querySelector('#' + pid(id));
  const keepRoot = cfg.keepRoot || root, $k = s => keepRoot.querySelector(s), peers = [];
  const said = new Map();   // section key -> the lines its rows share, shown once above them (see hoistRepeats)
  let m = null, cmp = null, salt = '', model = buildModel(null, null, '', KIND), mode = 'open', groupFilter = '', q = '', personId = null, personName = '', loaded = null, collapse = false;
  /* the sort choices and picked research names are remembered on this device for the People and Places lists (a convenience: nothing else reads them); the Orphans list keeps nothing of its own, so the only thing it stores is the decisions, in the store the other lists use */
  const keepL = (k, v) => (OR ? null : keep(k, v));
  const OK = PL ? 'ra-fixp-order' : 'ra-fix-order', RK = PL ? 'ra-fixp-rows' : 'ra-fix-rows';   // (the Orphans list never reads or writes either: see keepL)
  let order = keepL(OK) in ORDERS ? keepL(OK) : 'priority', rowsHow = keepL(RK) in ROW_SORTS ? keepL(RK) : 'useful';
  let autoOpen = false;
  /* RESEARCH NAMES: the visitor picks the names (or an archive's names) their research is about; rows that name anyone with any spelling of them are all that is shown. picks: 'n:<family id>' or 'a:<archive>' -> {label, forms} */
  let choices = null, nameTest = null, catAsked = false; const picks = new Map();
  const prioN = PL ? PLACE_N : OR ? ORPH_N : PRIO_N;
  const open = new Map(), shown = new Map(), opened = new Set(), listeners = [];
  let tl = null, sumTimer = 0;
  const st = createState(cfg.dec, { saved: () => { drawKeep(); document.dispatchEvent(new CustomEvent('ra-progress-changed')); } });
  const ctx = {
    st, get links() { return cfg.links(); }, show: keys => cfg.show(keys), collapseNotes: () => collapse,
    onChange(s, i, row, kind) { st.flush(); after(s, i, row, kind); },
    /* the Places tab's "Try a nearby spelling": the reader's answer comes back through suggested() */
    suggest: PL && cfg.suggest ? i => { asked.set(i.raw, i); cfg.suggest(i.raw); } : undefined,
  };
  const asked = new Map();
  Object.defineProperty(ctx, 'fileName', { get: () => (cfg.fileName && cfg.fileName()) || '' });

  /* the Places pane is cloned from the People pane's markup: take out what only makes sense for people, and say its own words */
  if (PL) {
    const nm = $('#fx-name'); if (nm) nm.closest('label').remove();
    for (const sel of ['#fx-names', '#fx-who']) { const e = $(sel); if (e) e.remove(); }
    const q0 = $('#fx-q'); q0.placeholder = 'a place, a person, a candidate'; q0.previousElementSibling.textContent = 'Search by place or name';
    $('#fx-empty').textContent = 'Nothing to review: every place in this file was found exactly.';
    const fl = $('#fx-fold').closest('label'), lk = doc.createElement('label'); lk.className = 'fxck'; lk.innerHTML = '<input type="checkbox" id="' + pfx + '-likely"><span>Has a likely candidate</span>'; fl.after(lk);
  }
  /* the Orphans pane keeps the research-name filter (the surnames of a group are searched in every spelling) and drops what only the other lists have: one person's rows, and the Atlas notes */
  if (OR) {
    const who = $('#fx-who'); if (who) who.remove();
    const fold = $('#fx-fold'); if (fold) fold.closest('label').remove();
    const q0 = $('#fx-q'); q0.placeholder = 'a place, a surname, a person'; q0.previousElementSibling.textContent = 'Search by place or name';
    $('#fx-empty').textContent = 'Nothing to connect: every person in this file is joined to a tree.';
    /* one quiet line of counts and an (i) that says, in plain words, what the words mean */
    const sum = mk(doc, 'div', 'fxsum'), line = mk(doc, 'p', 'stsub fxcounts'), what = mk(doc, 'div', 'fxwhat'), ib = mk(doc, 'button', 'fx-ib'); line.id = pfx + '-counts'; line.setAttribute('role', 'status'); what.id = pfx + '-what'; what.hidden = true;
    ib.type = 'button'; ib.id = pfx + '-i'; ib.innerHTML = FX_ICON.info; ib.title = 'What do orphan, detached family and dead end mean?'; ib.setAttribute('aria-label', 'What do orphan, detached family and dead end mean?'); ib.setAttribute('aria-expanded', 'false'); ib.setAttribute('aria-controls', what.id);
    what.append(mk(doc, 'p', null, 'Your file links each person to their parents, partners and children. Follow those links from one person and you reach everyone connected to them: that set of people is a tree. These words are about where the links stop.'));
    const ul = mk(doc, 'ul', 'fxwhat-l');
    for (const [b, t] of [['Orphan.', ' A person with no links at all: no parent, no partner and no child in your file. They sit on their own.'],
      ['Detached family.', ' A small set of 2 to 19 people linked to each other but to nobody else. A branch that was never joined to a bigger tree.'],
      ['Dead end.', ' A person inside a big tree (20 or more people) whose parents are not recorded. The line stops there. Dead ends are counted here but listed on the People tab, under “Find what is missing”.'],
      ['Not drawn yet.', ' People with no birth year or no place, so they cannot be put on a map. They are listed on the People tab too.']]) { const li = mk(doc, 'li'); li.append(mk(doc, 'b', null, b), t); ul.append(li); }
    what.append(ul, mk(doc, 'p', null, 'The rows below are the orphans and the detached families, grouped by where they were born. Each row names the record collections the Atlas knows for that place and those years, so you know where to look for the missing link. Nothing here changes your file.'));
    ib.onclick = () => { what.hidden = !what.hidden; ib.setAttribute('aria-expanded', String(!what.hidden)); };
    line.append(mk(doc, 'span', 'fxc-t')); sum.append(line, ib, what); $('#fx-sub').after(sum);
  }

  /* ---- loading ---- */
  function setData(msg, cmpRaw, saltKey) {
    m = msg || null; cmp = cmpRaw || null; salt = saltKey || '';
    model = buildModel(m, cmp, salt, KIND); st.load(model, loaded); tl = tally(model, st);
    if (!$('#fx-body').closest('[hidden]')) draw(); else paintTop();
    badge();
    keepSummary();
  }
  /* the count the tab and the canvas's badge show: rows still to do (the Places tab counts the four kinds of text a visitor can act on, as Roots & Routes' own badge does) */
  const badge = () => { tl = tl || tally(model, st); cfg.onCount && cfg.onCount(PL ? NEEDS.reduce((n, k) => n + (tl.sec[k] ? tl.sec[k].open : 0), 0) : tl.open); };
  let likelyOnly = false;   // the Places tab's "Has a likely candidate" filter
  const rules = () => ({ q, mode, personId, rows: rowsHow, names: nameTest, likely: likelyOnly });

  /* ---- the top: counts, progress, hints ---- */
  function paintTop() {
    tl = tl || tally(model, st);
    const done = tl.handled, total = tl.total, pct = total ? Math.round(100 * done / total) : 100;
    const bar = $('#fx-bar'); bar.setAttribute('aria-valuenow', String(pct)); bar.setAttribute('aria-valuetext', n0(done) + ' of ' + n0(total) + ' done'); bar.firstElementChild.style.width = pct + '%';
    $('#fx-prog').textContent = total ? n0(done) + ' of ' + n0(total) + ' done · ' + n0(tl.open) + ' to do' : (PL ? 'Nothing to review' : OR ? 'Nothing to connect' : 'Nothing to fix');
    const hasMh = !!(cfg.links() && cfg.links().get && cfg.links().get().mh), anc = !!(cfg.links() && cfg.links().get && cfg.links().get().anc);
    $('#fx-hint').hidden = hasMh || anc || !total;
    /* one plain line: are living people in this list or not? It is the canvas's own living lock (Settings), the same one that decided whether the reader put them in */
    const lv = $('#fx-living'); lv.hidden = !m;
    if (m) lv.firstElementChild.textContent = (cfg.livingHidden && cfg.livingHidden()) || (OR && m.omitted) ? 'Living people are left out of this list.' : 'Living people are included in this list.';
    if (PL) $('#fx-sub').textContent = !m ? 'The places are read from a GEDCOM. Open one and they are worked out here, in this browser; nothing is sent.'
      : 'The places in ' + (cfg.fileName() || 'your file') + ' that the Atlas could not settle exactly, as a list to work down. Copy a candidate, open the person in your own tree, correct the text there, then open the file again: a row that has been fixed is gone.';
    else if (OR) {
      $('#fx-sub').textContent = !m ? 'The orphans are worked out from the tree the reader made. Open a file and they are listed here, in this browser; nothing is sent.'
        : 'The people in ' + (cfg.fileName() || 'your file') + ' who are in no tree, grouped by where they were born, with the Atlas’s record collections for that place and those years. Find the link in a record, add it in your own tree program, then open the file again: a row that has been fixed is gone.';
      const c = $('#fxo-counts'), M = m && m.summary;
      if (c) { c.hidden = !M; if (M) c.firstElementChild.textContent = n0(M.orphans) + (M.orphans === 1 ? ' orphan' : ' orphans') + ' · ' + n0(M.clusters) + (M.clusters === 1 ? ' detached family' : ' detached families') + ' (' + n0(M.clusterPeople) + (M.clusterPeople === 1 ? ' person' : ' people') + ') · ' + n0(M.deadEnds) + (M.deadEnds === 1 ? ' dead end' : ' dead ends') + (M.undrawn ? ' · ' + n0(M.undrawn) + ' not drawn yet' : '') + (m.omitted ? ' · ' + n0(m.omitted) + ' living, counted but not listed' : '') + (M.bridgedPeople ? '. ' + n0(M.bridgedPeople) + (M.bridgedPeople === 1 ? ' person in a small group is' : ' people in small groups are') + ' joined to a tree through someone not drawn yet.' : ''); }
    }
    else $('#fx-sub').textContent = !m && !model.hasCmp ? 'The fix list is made from a GEDCOM. Open one and it is worked out here, in this browser; nothing is sent.'
      : 'Made in your browser from ' + (cfg.fileName() || 'your file') + (model.main ? ' · ' + n0(model.main) + ' people in the main tree' : '') + '. Fix things in your own tree program, then open the file again: a row that has been fixed is gone.';
    drawKeep();
    const f = $('#fx-who'); if (f) f.hidden = personId == null; if (f && personId != null) { f.firstElementChild.textContent = 'Only rows that name ' + (personName || 'this person'); }
    $('#fx-empty').hidden = !!total || !m && !model.hasCmp;
  }
  function drawKeep() {
    if (!PEOPLE) return cfg.drawKeep && cfg.drawKeep();   // the keeping section is the People workspace's
    const on = cfg.dec.isOn() && cfg.dec.available(), box = $k('#fx-keepon'); box.checked = cfg.dec.isOn(); box.disabled = !cfg.dec.available();
    const k = cfg.dec.count(), t = $k('#fx-saved'); t.classList.toggle('saved', on);
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
      const x = tl.sec[s.key], el = byId('fx-sec-' + s.key); if (!el) continue;
      const c = el.querySelector('.fx-sc'); if (c) { c.textContent = progress(x); c.title = progress(x) + ' done'; }
      const bar = el.querySelector('.fx-mini i'); if (bar) bar.style.width = (x.total ? Math.round(100 * (x.done + x.asis) / x.total) : 0) + '%';
      const ok = x.open === 0; el.classList.toggle('sec-done', ok); const t = el.querySelector('summary .fx-tick'); if (t) t.hidden = !ok;
    }
    for (const g of model.groups) {
      const el = byId('fx-grp-' + g.key); if (!el) continue; const x = tl.grp[g.key], ok = x.total > 0 && x.open === 0;
      el.classList.toggle('group-done', ok); el.querySelector('.fx-tick').hidden = !ok; el.querySelector('.fx-gc').textContent = n0(x.total - x.open) + ' of ' + n0(x.total) + ' done';
      const b = byId('fx-gact-' + g.key); if (b && b._paint) b._paint();
    }
    badge();
  }
  /* a tick greys the row where it is (so an accidental one can be taken back); "left as is" takes it off the list, or, in a filter that shows it, redraws it */
  function after(s, i, row, kind) {
    paintCounts();
    if (kind === 'a' && row && row.isConnected) {
      const drop = (mode === 'open' && st.isAsIs(i.key)) || (mode === 'asis' && !st.isAsIs(i.key));
      if (drop) { const body = row.parentElement; row.remove(); if (body && !body.querySelector('.fx-row')) drawSection(s); }
      else row.replaceWith(stripRepeats(rowEl(doc, ctx, s, i), said.get(s.key)));
    }
    keepSummary(); listeners.forEach(f => f());
  }
  function drawSection(s, el) {
    const d = el || byId('fx-sec-' + s.key); if (!d) return; const body = d.querySelector('.fx-sbody'); body.textContent = '';
    if (!s.items.length) { body.append(mk(doc, 'p', 'fx-small', s.cmp ? 'Nothing from the comparison yet.' : 'Nothing to do here.')); return; }
    const items = visible(s, st, rules()), cap = shown.get(s.key) || PAGE;
    const left = s.items.filter(i => st.isAsIs(i.key) && !st.isDone(i.key)).length;
    if (left && mode !== 'asis') { const b = mk(doc, 'button', 'fx-link', n0(left) + ' left as is: show them again'); b.type = 'button'; b.onclick = () => { st.setMany(s.items.filter(i => st.isAsIs(i.key)).map(i => i.key), 'a', false); st.flush(); open.set(s.key, true); paintCounts(); drawSection(s); }; body.append(b); }
    if (!items.length) body.append(mk(doc, 'p', 'fx-small', mode === 'open' && !q && personId == null && !nameTest ? 'Nothing left to do here.' : 'No rows match.'));
    const frag = doc.createDocumentFragment(), rows = items.slice(0, cap).map(i => rowEl(doc, ctx, s, i));
    /* a line every drawn row would repeat (the same Next step, the same note) is said once, quietly, above the rows */
    const once = hoistRepeats(rows); said.set(s.key, once.sigs);
    if (once.lines.length) { const h = mk(doc, 'div', 'fx-hoist'); h.append(...once.lines); body.prepend(h); }
    for (const r of rows) frag.append(r);
    body.append(frag);
    if (items.length > cap) { const b = mk(doc, 'button', 'fx-link fx-more', 'Show ' + Math.min(PAGE, items.length - cap) + ' more of ' + n0(items.length - cap)); b.type = 'button'; b.onclick = () => { shown.set(s.key, cap + PAGE); drawSection(s); }; body.append(b); }
    d.dataset.drawn = '1';
  }
  /* one section is ONE line, in the same columns for every section: [chevron] title | how many | progress (bar and "1 of 37") | (i) | priority. Its rows open under it. */
  function sectionEl(s) {
    const d = mk(doc, 'details', 'fx-sec fx-sec-' + s.key); d.id = pid('fx-sec-' + s.key);
    const x = tl.sec[s.key], sum = mk(doc, 'summary'), tk = mk(doc, 'span', 'fx-tick', '✓'); tk.title = 'Done: nothing left to do here'; tk.hidden = true;
    const title = mk(doc, 'span', 'fx-st'); title.append(tk, mk(doc, 'b', null, s.title));
    const cnt = mk(doc, 'span', 'fx-n', n0(s.items.length)); cnt.title = n0(s.items.length) + (s.items.length === 1 ? ' row' : ' rows');
    const pg = mk(doc, 'span', 'fx-pg'), mini = mk(doc, 'span', 'fx-mini'), fill = mk(doc, 'i'); mini.append(fill); fill.style.width = (x.total ? Math.round(100 * (x.done + x.asis) / x.total) : 0) + '%';
    const c = mk(doc, 'span', 'fx-sc', progress(x)); c.title = progress(x) + ' done'; pg.append(mini, c);
    const how = mk(doc, 'div', 'fx-how'); how.hidden = true;
    how.append(mk(doc, 'p', 'fx-small', s.how));
    if (s.why) { const pp = mk(doc, 'p', 'fx-small fx-prwhy'); pp.append(mk(doc, 'b', null, s.level + ' priority (' + s.rank + ' of ' + prioN + '). '), s.why); how.append(pp); }
    const info = mk(doc, 'button', 'fx-ib', null); info.type = 'button'; info.innerHTML = FX_ICON.info; info.title = 'What is this list, and why this priority?'; info.setAttribute('aria-label', 'What is this list, and why is it ' + s.level.toLowerCase() + ' priority? ' + s.title); info.setAttribute('aria-expanded', 'false');
    /* the explanation lives inside the <details>, so a closed section hides it: opening it is part of the click (an empty section opens to just the explanation) */
    info.onclick = e => { e.preventDefault(); e.stopPropagation(); const show = how.hidden || !d.open; how.hidden = !show; if (show && !d.open) d.open = true; info.setAttribute('aria-expanded', String(show)); };
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
    b.type = 'button'; bar.append(say, b); bar.id = pid('fx-gact-' + g.key);
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
    const narrow = q || personId != null || nameTest;
    for (const { g, secs } of lay) {
      if (groupFilter && g.key !== groupFilter) continue;
      const x = tl.grp[g.key], head = mk(doc, 'div', 'fx-ghead'), h = mk(doc, 'h2', 'fx-group'); h.id = pid('fx-grp-' + g.key); const gt = mk(doc, 'span', 'fx-tick', '✓'); gt.hidden = !(x.total > 0 && x.open === 0);
      h.append(gt, mk(doc, 'span', null, g.title), mk(doc, 'span', 'fx-gn', n0(x.total)), mk(doc, 'span', 'fx-gc', n0(x.total - x.open) + ' of ' + n0(x.total) + ' done'));
      h.classList.toggle('group-done', !gt.hidden);
      head.append(h); if (x.total && g.key !== 'compare') head.append(openAllBar(g, secs));
      box.append(head, mk(doc, 'p', 'fx-gh', g.how));
      for (const s of secs) {
        if (narrow) { const hits = visible(s, st, { q, mode: 'all', personId, names: nameTest, likely: likelyOnly }).length; if (!hits) continue; if (autoOpen) open.set(s.key, true); }
        box.append(sectionEl(s));
      }
    }
    autoOpen = false; if (picks.size) drawChips();
    if (!box.firstChild) box.append(mk(doc, 'p', 'fx-small', model.total ? 'Nothing matches that. Clear the search or the filters.' : (m || model.hasCmp ? 'Nothing to fix.' : '')));
  }
  function keepSummary() {
    if (!PEOPLE) return;   // the "My research" summary is of the People list's sections
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
  ordSel.onchange = e => { order = e.target.value; keepL(OK, order); draw(); };
  rowSel.onchange = e => { rowsHow = e.target.value; keepL(RK, rowsHow); shown.clear(); draw(); };
  if (PL) $('#fx-likely').onchange = e => { likelyOnly = e.target.checked; shown.clear(); draw(); };
  const fo = $('#fx-fold'); if (fo) fo.onchange = e => { collapse = e.target.checked; for (const d of root.querySelectorAll('.fx-notes')) d.open = !collapse; };
  $('#fx-expand').onclick = () => { for (const s of model.sections) if (s.items.length) open.set(s.key, true); draw(); };
  $('#fx-collapse').onclick = () => { open.clear(); for (const s of model.sections) open.set(s.key, false); draw(); };
  const wx = $('#fx-whoX'); if (wx) wx.onclick = () => setPerson(null);
  const sb = $('#fx-settings'); if (sb) sb.onclick = () => cfg.openSettings();
  const sl = $('#fx-living-set'); if (sl) sl.onclick = () => cfg.openSettings();
  /* the keeping section (the switch, save, load, forget) belongs to the People workspace and covers both lists: the other one is a peer */
  const all = () => [{ asIs: st.asIs, ticked: st.ticked }, ...peers.map(p => p.sets())];
  if (PEOPLE) {
    doc.addEventListener('ra-sync-done', () => drawKeep());   // the six-word code loads a moment after the page: say so once it is there
    $k('#fx-keepon').onchange = e => {
      const on = e.target.checked; cfg.dec.setOn(on); cfg.dec.optOut(!on);
      if (!on) cfg.fixes.forget(); else { st.flush(); peers.forEach(p => p.flush()); cfg.dec.putMany(all().flatMap(x => [...x.asIs].map(k => [k, 'a', true]).concat([...x.ticked].map(k => [k, 'd', true])))); keepSummary(); }
      drawKeep();
    };
    $k('#fx-save').onclick = () => download('fix-decisions-' + today() + '.json', fileTextOf(rowsFrom(new Set(all().flatMap(x => [...x.asIs])), new Set(all().flatMap(x => [...x.ticked])))), 'application/json');
    $k('#fx-load').onclick = () => $k('#fx-file').click();
    $k('#fx-file').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { const text = await f.text(); loaded = parseRows(text); if (cfg.dec.isOn()) cfg.dec.load(text); let n = st.load(model, loaded); tl = tally(model, st); draw(); badge(); for (const p of peers) n += p.reapply(loaded); $k('#fx-saved').textContent = n0(n) + ' earlier decisions re-applied from the file.'; }
      catch (x) { $k('#fx-saved').textContent = 'That is not a decisions file.'; }
    };
    $k('#fx-forget').onclick = () => { cfg.dec.forget(); cfg.fixes.forget(); loaded = null; st.ticked.clear(); st.asIs.clear(); tl = tally(model, st); draw(); badge(); peers.forEach(p => p.reset()); };
    $k('#fx-txt').onclick = () => m && download('fix-list.txt', checklistText(rrView(model), today()), 'text/plain;charset=utf-8');
    $k('#fx-csv').onclick = () => m && download('fix-list.csv', '﻿' + checklistCsv(rrView(model)), 'text/csv;charset=utf-8');
    $k('#fx-pdf').onclick = () => m && toPdf();
  }
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
        for (const i of visible(s, st, { q, mode: 'open', names: nameTest, likely: likelyOnly })) {
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
  /* ---- research names ---- */
  const NAMEKEY = 'ra-fix-names';   // (the Orphans list never reads or writes it: see keepL)
  function setNames() { nameTest = nameMatcher([...picks.values()].flatMap(p => p.forms)); }
  function saveNames() { keepL(NAMEKEY, JSON.stringify([...picks.keys()])); }
  function pickFor(v) {
    if (!choices) return null;
    if (v.startsWith('a:')) { const a = choices.archives.find(x => 'a:' + x.key === v); return a ? { label: a.label + ' (all its names)', forms: a.forms } : null; }
    const n = choices.names.find(x => 'n:' + x.id === v); return n ? { label: n.name, forms: n.forms } : null;
  }
  function fillNames() {
    const sel = $('#fx-name'); if (!sel) return; sel.textContent = '';
    if (!choices || !(choices.names.length || choices.archives.length)) { sel.append(new Option('Names are not available', '')); sel.disabled = true; return; }
    sel.disabled = false; sel.append(new Option('Pick a name or an archive…', ''));
    const ga = doc.createElement('optgroup'); ga.label = 'An archive: all of its names';
    for (const a of choices.archives) ga.append(new Option(a.label + ' · ' + a.names.length + (a.names.length === 1 ? ' name' : ' names'), 'a:' + a.key));
    const gn = doc.createElement('optgroup'); gn.label = 'A research name';
    for (const n of choices.names) gn.append(new Option(n.name + (n.archiveLabels.length ? ' · ' + n.archiveLabels.join(', ') : ''), 'n:' + n.id));
    if (ga.children.length) sel.append(ga); sel.append(gn);
  }
  /* what is picked, as chips that each take one pick back; and how many rows the picks leave */
  function drawChips() {
    const c = $('#fx-names'); if (!c) return; c.textContent = ''; c.hidden = !picks.size; if (!picks.size) return;
    for (const [k, p] of picks) {
      const chip = mk(doc, 'span', 'fxchip'), x = mk(doc, 'button', null, '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Stop filtering by ' + p.label);
      chip.title = 'Spellings counted: ' + p.forms.slice(0, 40).join(', ') + (p.forms.length > 40 ? ' and ' + (p.forms.length - 40) + ' more' : '');
      x.onclick = () => { picks.delete(k); saveNames(); setNames(); shown.clear(); draw(); drawChips(); };
      chip.append(mk(doc, 'b', null, p.label), mk(doc, 'span', 'fx-small', n0(p.forms.length) + (p.forms.length === 1 ? ' spelling' : ' spellings')), x); c.append(chip);
    }
    let rows = 0, secs = 0; for (const s of model.sections) { const n = visible(s, st, { q, mode, personId, names: nameTest, likely: likelyOnly }).length; rows += n; if (n) secs++; }
    c.append(mk(doc, 'span', 'fx-small', 'Showing ' + n0(rows) + (rows === 1 ? ' row' : ' rows') + (rows ? ' in ' + n0(secs) + (secs === 1 ? ' section' : ' sections') : '') + ' that name them, in any spelling the Atlas lists.'));
  }
  function loadChoices() {
    if (catAsked || !cfg.catalogue) return; catAsked = true;
    cfg.catalogue().then(cat => {
      choices = cat ? catalogueChoices(cat) : null; fillNames();
      let saved = []; try { saved = JSON.parse(keepL(NAMEKEY) || '[]'); } catch (e) { saved = []; }
      for (const k of Array.isArray(saved) ? saved : []) { const p = typeof k === 'string' ? pickFor(k) : null; if (p) picks.set(k, p); }
      setNames(); drawChips(); if (picks.size && !$('#fx-body').closest('[hidden]')) { shown.clear(); draw(); }
    });
  }
  const nameSel = $('#fx-name');
  if (nameSel) nameSel.onchange = e => { const v = e.target.value; e.target.value = ''; const p = v && pickFor(v); if (!p) return; picks.set(v, p); saveNames(); setNames(); shown.clear(); autoOpen = true; draw(); drawChips(); };
  function fillGroups() { const s = $('#fx-grp'); s.textContent = ''; s.append(new Option('Every group', '')); for (const { g } of arranged(model, tl, order)) s.append(new Option(g.title, g.key)); s.value = groupFilter; }
  /* the reader's nearby spellings for a text (a place that was not found), as rows to copy */
  function suggested(msg) {
    const i = asked.get(msg.raw); if (!i) return; asked.delete(msg.raw);
    i.sugg = (msg.rows || []).map((c, n) => ({ n: c.n, region: c.region || null, k: c.k, label: (msg.labels && msg.labels[n]) || c.n }));
    const hit = model.byKey.get(i.key); if (hit) drawSection(hit.s);
  }
  return {
    setData, setPerson, st, ctx, draw, paintCounts, suggested,
    /* the other list's side of the shared keeping section (see addPeer in the People workspace) */
    addPeer: w => peers.push(w), sets: () => ({ asIs: st.asIs, ticked: st.ticked }), flush: () => st.flush(),
    reset() { st.ticked.clear(); st.asIs.clear(); tl = tally(model, st); draw(); badge(); },
    /* the other list was used (a tick or "left as is" on a row both lists have, keyed alike): take its state for those rows. Nothing is read or written in the store: it already holds them. */
    adopt(o) {
      const ok = o.model().byKey; let n = 0;
      for (const k of model.byKey.keys()) {
        if (!ok.has(k)) continue; const d = o.st.isDone(k), a = o.st.isAsIs(k);
        if (d !== st.isDone(k) || a !== st.isAsIs(k)) { if (d) st.ticked.add(k); else st.ticked.delete(k); if (a) st.asIs.add(k); else st.asIs.delete(k); n++; }
      }
      if (n) { tl = tally(model, st); badge(); }
      return n;
    },
    reapply(rows) { const n = st.load(model, rows); tl = tally(model, st); draw(); badge(); return n; },
    drawKeep,
    model: () => model, tally: () => (tl = tl || tally(model, st)), onChange: f => listeners.push(f),
    refresh() { fillGroups(); draw(); },
    /* the page is about to be shown: fill the group list, and show everyone or only one person's rows */
    present(person) { loadChoices(); fillGroups(); if (person) setPerson(person.id, person.name); else { personId = null; personName = ''; open.clear(); autoOpen = false; draw(); } },
    changed() { paintCounts(); keepSummary(); listeners.forEach(f => f()); },
    clearFilters() { q = ''; $('#fx-q').value = ''; mode = 'open'; $('#fx-mode').value = 'open'; groupFilter = ''; personId = null; personName = ''; likelyOnly = false; if (PL) $('#fx-likely').checked = false; },
  };
}
