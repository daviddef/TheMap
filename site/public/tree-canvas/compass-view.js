/* COMPASS: your family on the map through time. THE WORKSPACE. A full-screen page over the canvas (like the Fix list): it reads the SAME loaded file and the SAME archive selection as the
   canvas (window.RR and the Compare view's archive cache, handed in by app.js), draws them on a Leaflet map with the Atlas's tiles, and plays them through the years.

   WHAT IS REUSED. The Atlas's own data: history.json (the movements, voyages and chapters behind /history/), history-ground.json (who held the ground, by year), mortality.json (mass-mortality events),
   /p/<id>.json (a place's register volumes and collections, the same file the canvas's "Where next" panel reads), the flag files (/fl/), the vendored Leaflet and the same Esri tiles. The curve and the
   flag-in-force lookup are /history/'s own, ported (history-theatre.js is a whole page's player tied to its own markup; this is a workspace with its own).
   THE RULES. Only people who have died are placed (a living person is never on the map and in no total); a place or year the file does not state is estimated and drawn dashed; a book is never
   called searched; nothing leaves the device but map tiles and same-origin requests; no person's name goes anywhere but this page and, when asked, the clipboard text of a book request (which has none).
   Everything computed is in compass-model.js (tested); this file is the drawing and the wiring. No inline style attribute or script: the page's CSP allows neither (Leaflet and this file use the DOM's style API). */
import * as M from './compass-model.js';

const SPEEDS = [[1, 'Slow: 1 year a second'], [2, 'Steady: 2 years a second'], [4, 'Quick: 4 years a second'], [8, 'Fast: 8 years a second']];
const WINDOWS = [[1, 'this year'], [5, 'last 5 years'], [10, 'last 10 years'], [25, 'last 25 years']];
const KIND = { conquest: 'Conquest', occupation: 'Occupation', migration: 'Migration', voyage: 'Voyage', mortality: 'Mass mortality' };
const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const n0 = n => n.toLocaleString('en');
const plural = (n, a, b) => n0(n) + ' ' + (n === 1 ? a : b);

function h(tag, cls, txt, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null && txt !== '') e.textContent = txt;
  if (attrs) for (const k of Object.keys(attrs)) { if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
  return e;
}
const btn = (cls, txt, fn, attrs) => { const b = h('button', cls, txt, { type: 'button', ...(attrs || {}) }); if (fn) b.addEventListener('click', fn); return b; };
const ico = (d, cls) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); if (cls) s.setAttribute('class', cls); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); return s; };
const yrs = (a, b) => (a == null && b == null ? 'years not given' : a === b || b == null ? String(a) : (a == null ? '' : a) + '–' + (b == null ? '' : b));

let basemapsP = null;
function loadBasemaps() {
  if (window.raBasemaps) return Promise.resolve();
  if (basemapsP) return basemapsP;
  basemapsP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/js/basemaps.js'; s.onload = () => res(); s.onerror = () => { basemapsP = null; rej(new Error('basemaps.js could not be loaded')); };
    document.head.append(s);
  });
  return basemapsP;
}
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/vendor/leaflet/leaflet.min.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.min.js'; s.onload = () => res(); s.onerror = () => { leafletP = null; rej(new Error('the map library could not be loaded')); }; document.head.append(s);
  });
  return leafletP;
}
let progP = null;
function loadProgress() {
  if (window.raProgress) return Promise.resolve(window.raProgress);
  if (progP) return progP;
  progP = new Promise(res => { const s = document.createElement('script'); s.src = '/js/progress-kit.js'; s.onload = () => res(window.raProgress || null); s.onerror = () => { progP = null; res(null); }; document.head.append(s); });
  return progP;
}
const jsonCache = new Map();
const getJson = u => { if (!jsonCache.has(u)) jsonCache.set(u, fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }).catch(e => { jsonCache.delete(u); throw e; })); return jsonCache.get(u); };

/* a gentle curve between two places, /history/'s own (a quadratic bend, longitude wrapped the short way round) */
function curve(a, b) {
  const lat1 = a[0], lon1 = a[1], lat2 = b[0]; let lon2 = b[1];
  const dl = lon2 - lon1; if (dl > 180) lon2 -= 360; else if (dl < -180) lon2 += 360;
  const mx = (lat1 + lat2) / 2, my = (lon1 + lon2) / 2, dx = lat2 - lat1, dy = lon2 - lon1, len = Math.sqrt(dx * dx + dy * dy) || 1, off = Math.min(len * 0.22, 28);
  const cx = mx + (-dy / len) * off, cy = my + (dx / len) * off, pts = [];
  for (let i = 0; i <= 28; i++) { const t = i / 28, u = 1 - t; pts.push([u * u * lat1 + 2 * u * t * cx + t * t * lat2, u * u * lon1 + 2 * u * t * cy + t * t * lon2]); }
  return pts;
}

/* How often the expensive things ran, for the page to be held to its promise that going to the canvas and back does not redraw anything (tests and the measurement read this; nothing is sent). */
export const stats = { builds: 0, indexes: 0, opens: 0, resumes: 0, draws: 0, dots: 0, arcs: 0, grounds: 0, fits: 0, mapInits: 0 };
const idMap = new WeakMap(); let idSeq = 0;
const idOf = o => { if (!o || typeof o !== 'object') return String(o); let i = idMap.get(o); if (!i) { i = ++idSeq; idMap.set(o, i); } return i; };

/* the compass rose by the wordmark: a ring, four ticks, a needle (red north). Decoration only (aria-hidden); the needle turns toward the pointer, or toward the selected place, unless the visitor asks for reduced motion. */
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, attrs[k]); return e; }
function roseSvg() {
  const s = svgEl('svg', { viewBox: '0 0 48 48', class: 'cp-rose', 'aria-hidden': 'true', focusable: 'false' });
  s.append(svgEl('circle', { cx: 24, cy: 24, r: 21, class: 'ring' }));
  for (const [x1, y1, x2, y2] of [[24, 3, 24, 8], [24, 40, 24, 45], [3, 24, 8, 24], [40, 24, 45, 24]]) s.append(svgEl('line', { x1, y1, x2, y2, class: 'tick' }));
  const g = svgEl('g', { class: 'needle', transform: 'rotate(25 24 24)' });
  g.append(svgEl('polygon', { points: '24,7 29.5,24 18.5,24', class: 'n' }), svgEl('polygon', { points: '24,41 18.5,24 29.5,24', class: 's' }));
  s.append(g, svgEl('circle', { cx: 24, cy: 24, r: 2.6, class: 'pin' }));
  return s;
}

/* deps: { root, sources() -> [{key, name, ck, tree, atlas}], archives: {key: {name, color}}, chosen() -> [archive keys the canvas's Compare holds], loadArchive(key) -> Promise<{tree, atlas}>,
   showOnCanvas(canvasKey), close() } */
export function createCompass(deps) {
  const root = deps.root;
  const st = { open: false, year: 1900, span: [1500, 2000], playing: false, speed: 2, win: 10, colour: 'side', filter: { ...M.DEFAULT_FILTER }, on: new Set(), extra: new Map(), idx: null, ctx: null, focus: null, srcs: [],
    sel: null, tab: 'under', showAll: false, ground: true, hist: null, mort: null, shapes: null, placeCache: new Map(), loading: '', notes: [], more: {}, planNote: '' };
  let map = null, basemap = null, layers = {}, timer = 0, raf = 0, travellers = [], built = false, groundKey = '', mapOk = false, lastDraw = null, el = {};

  /* ---------------- the page ---------------- */
  function build() {
    if (built) return; built = true; stats.builds++;
    root.textContent = '';
    const head = h('header', 'cp-head');
    el.back = btn('stbtn cp-backbtn', '← Back to the canvas', () => deps.close(), { id: 'cp-back' });
    /* the wordmark is the Tree Canvas's own (Lilita One, two-tone, a sticker ledge under it, tilted; "by Record Atlas" tilted with a dotted underline), with a small compass rose.
       The words are the accessible name; the rose is decoration. */
    const brand = h('div', 'cp-brand');
    el.rose = roseSvg(); brand.append(el.rose);
    const stack = h('div', 'cp-logo');
    el.title = h('h1', 'cp-title', null, { id: 'cpTitle', tabindex: '-1' });
    el.title.append(document.createTextNode('Com'), h('b', '', 'pass'));
    const by = h('p', 'cp-by'); by.append(document.createTextNode('by '), h('a', '', 'Record Atlas', { href: '/', target: '_blank', rel: 'noopener', title: 'Record Atlas, in a new tab' }));
    stack.append(el.title, by); brand.append(stack);
    el.sum = h('p', 'cp-sum', '', { id: 'cp-sum' });
    head.append(el.back, brand, el.sum);
    el.filters = h('section', 'cp-filters', null, { 'aria-label': 'Who is on the map' });
    el.main = h('div', 'cp-main');
    el.stage = h('div', 'cp-stage');
    el.mapBox = h('div', 'cp-map', '', { id: 'cp-map', role: 'application', 'aria-label': 'Map of where the people in your file were, by year. Arrow keys move the map, plus and minus zoom.', tabindex: '0' });
    el.year = h('div', 'cp-year', '', { 'aria-hidden': 'true' });
    el.caption = h('p', 'cp-caption', '', { role: 'status', 'aria-live': 'polite', id: 'cp-caption' });
    el.legend = h('div', 'cp-legend');
    el.load = h('div', 'cp-load', 'Loading the map…', { role: 'status' });
    el.stage.append(el.mapBox, el.year, el.caption, el.legend, el.load);
    el.panel = h('aside', 'cp-panel', null, { 'aria-label': 'Under way, places and people' });
    el.sheet = btn('cp-sheet', 'Panel', () => { el.panel.classList.toggle('shut'); el.sheet.setAttribute('aria-expanded', el.panel.classList.contains('shut') ? 'false' : 'true'); }, { 'aria-expanded': 'true', 'aria-label': 'Show or hide the panel' });
    el.panel.append(el.sheet);
    el.tabs = h('div', 'cp-tabs', null, { role: 'tablist', 'aria-label': 'Panel' });
    el.body = h('div', 'cp-pbody', null, { id: 'cp-pbody' });
    el.panel.append(el.tabs, el.body);
    el.main.append(el.stage, el.panel);
    el.bar = h('footer', 'cp-bar');
    el.chapters = h('div', 'cp-chapters', null, { role: 'group', 'aria-label': 'Quick jumps to a chapter of history' });
    el.play = btn('cp-play', '', () => togglePlay(), { 'aria-label': 'Play', 'aria-pressed': 'false', title: 'Play or pause' });
    el.playIco = ico('M8 5v14l11-7z'); el.play.append(el.playIco);
    el.range = h('input', 'cp-range', null, { type: 'range', min: '1500', max: '2000', step: '1', value: '1900', 'aria-label': 'Year' });
    el.range.addEventListener('input', () => { stop(); setYear(+el.range.value, true); });
    el.dens = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.dens.setAttribute('class', 'cp-dens'); el.dens.setAttribute('viewBox', '0 0 1000 40'); el.dens.setAttribute('preserveAspectRatio', 'none'); el.dens.setAttribute('aria-hidden', 'true');
    el.scrub = h('div', 'cp-scrub'); el.scrub.append(el.dens, el.range);
    el.yrOut = h('output', 'cp-yrout', '', { for: 'cp-range' });
    el.speed = h('select', 'cp-sel', null, { 'aria-label': 'Playback speed' });
    for (const [v, l] of SPEEDS) el.speed.append(h('option', '', l, { value: v }));
    el.speed.value = String(st.speed);
    el.speed.addEventListener('change', () => { st.speed = +el.speed.value; if (st.playing) { clearInterval(timer); timer = setInterval(tick, 1000 / st.speed); } });
    el.winSel = h('select', 'cp-sel', null, { 'aria-label': 'How far back moves, births and deaths are shown' });
    for (const [v, l] of WINDOWS) el.winSel.append(h('option', '', 'Moves: ' + l, { value: v }));
    el.winSel.value = String(st.win);
    el.winSel.addEventListener('change', () => { st.win = +el.winSel.value; draw(); });
    const row = h('div', 'cp-row'); row.append(el.play, el.scrub, el.yrOut, el.speed, el.winSel);
    el.bar.append(el.chapters, row);
    root.append(head, el.filters, el.main, el.bar);
    el.range.id = 'cp-range';
  }

  /* ---------------- sources, index, focus ---------------- */
  function gatherSources() {
    const base = deps.sources() || [], out = base.slice(0, 1);
    const have = new Set(base.map(s => s.key));
    for (const s of base.slice(1)) out.push(s);
    for (const [k, v] of st.extra) if (!have.has(k) && v) out.push({ key: k, name: (deps.archives[k] || {}).name || k, ck: k, tree: v.tree, atlas: v.atlas });
    return out;
  }
  function reindex(keepFocus) {
    const all = gatherSources(), want = all.filter((s, i) => i === 0 || st.on.has(s.key));
    st.srcs = want; stats.indexes++;
    st.idx = M.buildIndex(want.map(s => ({ key: s.key, name: s.name, tree: s.tree, atlas: s.atlas })));
    const sp = M.yearSpan(st.idx), now = new Date().getFullYear();
    st.span = sp ? [Math.max(600, sp[0] - 0), Math.min(now, Math.max(sp[0] + 1, sp[1]))] : [1500, now];
    st.ctx = makeCtx();
    if (!keepFocus || !st.focus) st.year = Math.min(Math.max(st.year, st.span[0]), st.span[1]);
  }
  function makeCtx() {
    const f = st.focus;
    if (!f) return { rel: null, focus: null };
    const rel = st.srcs.map((s, i) => (i === f.s ? M.relations(s.tree, f.id) : new Map()));
    const p = st.idx && st.idx.persons.find(q => q.s === f.s && q.id === f.id);
    const raw = st.srcs[f.s] && st.srcs[f.s].tree.people.find(q => String(q.id) === String(f.id));
    return { rel, focus: { s: f.s, id: f.id, sk: (p && p.sk) || (raw && (raw.sk || String(raw.sur || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))) || '' } };
  }
  function pickFocus(want) {
    st.focus = null;
    const sources = st.srcs;
    const find = (s, id) => sources[s] && sources[s].tree.people.some(p => String(p.id) === String(id));
    if (want && want.person != null) {
      let s = Number.isInteger(want.a) && find(want.a, want.person) ? want.a : sources.findIndex((x, i) => find(i, want.person));
      if (s >= 0) { st.focus = { s, id: String(want.person) }; return; }
    }
    const t = sources[0] && sources[0].tree;
    if (t && t.focus != null && find(0, t.focus)) st.focus = { s: 0, id: String(t.focus) };
  }
  const personRec = i => st.idx.persons[i];
  const srcOf = p => st.srcs[p.s];
  function focusName() {
    const f = st.focus; if (!f) return null;
    const raw = st.srcs[f.s].tree.people.find(q => String(q.id) === String(f.id));
    return raw && !M.isLiving(raw) ? ((raw.given || '') + ' ' + (raw.sur || '')).trim() || '(no name)' : null;   // a person who may be living is never named here
  }

  /* ---------------- filters and the top bar ---------------- */
  function drawFilters() {
    const F = el.filters; F.textContent = '';
    const grp = (label, ...kids) => { const g = h('div', 'cp-grp'); g.append(h('span', 'cp-glab', label), ...kids); return g; };
    const chip = (label, on, fn, attrs) => { const c = btn('cp-chip', label, fn, { 'aria-pressed': on ? 'true' : 'false', ...(attrs || {}) }); return c; };
    const f = st.filter, fn = focusName();
    const hasFocus = !!st.focus;
    /* the people: whose map this is */
    const arch = h('div', 'cp-chips', null, { role: 'group', 'aria-label': 'Which trees' });
    const main = st.srcs[0];
    arch.append(h('span', 'cp-chip static', main ? main.name : 'Your file', { title: 'The tree the canvas holds' }));
    for (const k of Object.keys(deps.archives)) {
      if (main && main.key === k) continue;
      const a = deps.archives[k], c = chip(a.name, st.on.has(k), () => toggleArchive(k), { title: 'Add or take away the ' + a.name + ' archive, the same choice as Compare' });
      c.style.setProperty('--c', a.color); c.classList.add('arch'); arch.append(c);
    }
    const who = h('div', 'cp-chips', null, { role: 'group', 'aria-label': 'Which people' });
    for (const [v, l, t] of [['all', 'Everyone', ''], ['f', "Father's side", "The selected person's father and his ancestors"], ['m', "Mother's side", "The selected person's mother and her ancestors"], ['line', 'This family line', 'People with the selected person’s surname family']]) {
      const c = chip(l, f.scope === v, () => { st.filter = { ...st.filter, scope: v }; draw(); drawFilters(); }, { title: t || undefined });
      if (v !== 'all' && !hasFocus) c.disabled = true;
      who.append(c);
    }
    const gen = h('select', 'cp-sel', null, { 'aria-label': 'Generations from the selected person' });
    gen.append(h('option', '', 'Any generation', { value: 0 }));
    for (let g = 1; g <= 6; g++) gen.append(h('option', '', g + (g === 1 ? ' generation' : ' generations') + ' from them', { value: g }));
    gen.value = String(f.gen); gen.disabled = !hasFocus;
    gen.addEventListener('change', () => { st.filter = { ...st.filter, gen: +gen.value }; draw(); });
    const ev = h('div', 'cp-chips', null, { role: 'group', 'aria-label': 'What to show' });
    for (const [k, l, t] of [['born', 'Born', 'People in their first years of life (the window of years you chose)'], ['lived', 'Lived', 'People alive, neither just born nor close to death'], ['died', 'Died', 'People in their last years of life']]) ev.append(chip(l, f[k], () => { st.filter = { ...st.filter, [k]: !st.filter[k] }; draw(); drawFilters(); }, { title: t }));
    const colour = h('div', 'cp-chips', null, { role: 'group', 'aria-label': 'Colour the arrows by' });
    colour.append(chip("Side", st.colour === 'side', () => { st.colour = 'side'; draw(); drawFilters(); }, { title: 'Blue for the father’s side, orange for the mother’s, as in the Fan', disabled: !hasFocus || null }));
    colour.append(chip('Family line', st.colour === 'line', () => { st.colour = 'line'; draw(); drawFilters(); }, { title: 'One colour for each family line, as on the canvas' }));
    const follow = h('p', 'cp-follow', fn ? 'Following ' + fn + '.' : hasFocus ? 'Following a person who may be living (their name and places are never shown).' : 'No one is selected on the canvas, so the side and generation filters are off.');
    F.append(grp('Trees', arch), grp('People', who, gen), grp('Show', ev), grp('Colour', colour), follow);
    if (!hasFocus && st.colour === 'side') st.colour = 'line';
  }
  async function toggleArchive(k) {
    if (st.on.has(k)) { st.on.delete(k); reindex(true); st.ctx = makeCtx(); drawFilters(); draw(); drawSummary(); return; }
    st.loading = 'Reading the ' + (deps.archives[k] ? deps.archives[k].name : k) + ' archive…'; showLoad(st.loading);
    try {
      const v = await deps.loadArchive(k);
      st.extra.set(k, v); st.on.add(k); reindex(true); st.ctx = makeCtx();
    } catch (e) { note('The ' + ((deps.archives[k] || {}).name || k) + ' archive could not be read just now (' + String((e && e.message) || e).slice(0, 80) + '). Nothing is assumed about it.', true); }
    st.loading = ''; showLoad(''); drawFilters(); setRange(); draw(); drawSummary();
  }
  function note(text, err) { st.notes = [{ text, err: !!err }]; renderBody(); }
  function showLoad(text) { el.load.textContent = text; el.load.hidden = !text; }
  function drawSummary() {
    const s = M.summaryText(st.idx.stats), undated = st.idx.stats.reduce((a, x) => a + x.undated, 0);
    el.sum.textContent = s.line + (undated ? ' ' + n0(undated) + ' have no birth year, so they are not on the map.' : '');
  }

  /* ---------------- the map ---------------- */
  async function ensureMap() {
    if (map) return;
    await loadLeaflet(); stats.mapInits++;
    const L = window.L;
    map = L.map(el.mapBox, { worldCopyJump: true, minZoom: 2, maxZoom: 12, zoomControl: false, keyboard: true, zoomSnap: 0.5, attributionControl: true }).setView([35, 10], 3);
    L.control.zoom({ position: 'topright', zoomInTitle: 'Zoom in', zoomOutTitle: 'Zoom out' }).addTo(map);
    const light = [L.tileLayer(TILE + 'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 8, maxNativeZoom: 8, attribution: 'Esri, HERE, Garmin &middot; &copy; OpenStreetMap contributors' })];
    map.createPane('cpLabels').style.zIndex = 250; map.getPane('cpLabels').style.pointerEvents = 'none';
    light.push(L.tileLayer(TILE + 'World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { pane: 'cpLabels', maxZoom: 8, maxNativeZoom: 8 }));
    /* Map | Night dots, the same two-button switcher and the same layer code as the Atlas map (public/js/basemaps.js, loaded as a same-origin
       script, which this page's CSP allows). Dark theme opens on Night dots, light on the light grey, a choice made with the switcher wins, and
       if the map library file is missing the light grey is drawn as before. */
    try { await loadBasemaps(); basemap = window.raBasemaps.attach(L, map, { light, labelsPane: 'cpLabels' }); } catch (e) { light.forEach(l => l.addTo(map)); }
    map.createPane('cpGround').style.zIndex = 300; map.getPane('cpGround').style.pointerEvents = 'none';
    map.createPane('cpArcs').style.zIndex = 420;
    layers = { ground: L.layerGroup().addTo(map), arcs: L.layerGroup().addTo(map), route: L.layerGroup().addTo(map), dots: L.layerGroup().addTo(map) };
    layers.groundR = L.canvas({ pane: 'cpGround', padding: 0.3 });
    map.on('zoomend moveend', () => { if (st.open) drawDots(); });
    map.on('click', () => { /* a click on empty ground leaves the selection as it is */ });
    mapOk = true;
    fitToPeople();
  }
  function fitToPeople() {
    stats.fits++;
    if (!map || !st.idx) return;
    const pa = M.peopleAt(st.idx, st.year, st.filter, st.ctx, st.win), pts = [];
    for (const k of pa.by.keys()) { const pl = st.idx.places.get(k); if (pl) pts.push([pl.lat, pl.lon]); }
    if (pts.length) { try { map.fitBounds(window.L.latLngBounds(pts).pad(0.25), { maxZoom: 6, animate: false }); } catch (e) { /* keep the view */ } }
  }
  const project = (lat, lon) => map.project([lat, lon], map.getZoom());

  function dotIcon(c, i, labelled, yr) {
    const L = window.L, r = M.dotRadius(c.n), pl = c.places === 1 ? st.idx.places.get(c.keys[0]) : null;
    const wrap = h('span', 'cp-dotw' + (c.est * 2 > c.n ? ' est' : '') + (c.places > 1 ? ' multi' : ''));
    const dot = h('span', 'cp-dot'); dot.style.width = dot.style.height = r * 2 + 'px'; dot.append(h('b', '', c.n > 999 ? Math.round(c.n / 100) / 10 + 'k' : String(c.n)));
    wrap.append(dot);
    if (labelled) {
      const lab = h('span', 'cp-lab');
      const fl = pl && M.flagAt(pl.fl, yr);
      if (fl) { const im = h('img', 'cp-fl', '', { alt: '', src: '/fl/' + fl + '.svg', loading: 'lazy' }); im.addEventListener('error', () => { im.remove(); }); lab.append(im); }
      lab.append(document.createTextNode(c.label)); lab.style.left = r * 2 + 5 + 'px'; wrap.append(lab);
    }
    return L.divIcon({ className: 'cp-icon', html: wrap, iconSize: [r * 2, r * 2], iconAnchor: [r, r] });
  }
  function drawDots() {
    stats.dots++;
    if (!map || !st.idx) return;
    const L = window.L, pa = M.peopleAt(st.idx, st.year, st.filter, st.ctx, st.win), z = map.getZoom();
    const cell = z < 4 ? 60 : z < 6 ? 44 : 30;
    const cl = M.clusterPlaces([...pa.by.values()], st.idx.places, project, z >= 9 ? 1 : cell);
    layers.dots.clearLayers();
    const sel = st.sel && st.sel.kind === 'person' ? st.sel : null;
    cl.slice(0, 180).forEach((c, i) => {
      const labelled = i < (z < 4 ? 8 : z < 6 ? 18 : 40) || z >= 8;
      const title = c.label + ': ' + plural(c.n, 'person', 'people') + (c.est ? ', ' + c.est + ' estimated' : '');
      const mk = L.marker([c.lat, c.lon], { icon: dotIcon(c, i, labelled, st.year), keyboard: true, title, alt: title, riseOnHover: true, zIndexOffset: Math.min(900, c.n) });
      mk.on('click', () => { if (c.keys.length > 1 && z < 11) { const b = L.latLngBounds(c.keys.map(k => { const p = st.idx.places.get(k); return [p.lat, p.lon]; })); map.fitBounds(b.pad(0.4), { maxZoom: 10 }); } else selectPlace(c.keys[0]); });
      mk.addTo(layers.dots);
      const e = mk.getElement(); if (e) { e.setAttribute('role', 'button'); if (sel) e.classList.add('dim'); }
    });
    el.legendDots = cl.length;
  }
  function drawArcs(moves) {
    stats.arcs++;
    const L = window.L; layers.arcs.clearLayers(); travellers = [];
    const animate = st.playing && !reduceMotion();
    const top = moves.slice(0, 60);
    top.forEach((m, i) => {
      const a = st.idx.places.get(m.from), b = st.idx.places.get(m.to); if (!a || !b) return;
      const pts = curve([a.lat, a.lon], [b.lat, b.lon]), col = M.colourHex(m.colour), w = 1.8 + Math.min(9, Math.sqrt(m.n) * 1.8);
      const line = L.polyline(pts, { color: col, weight: w, opacity: m.est ? 0.55 : 0.8, dashArray: m.est ? '4 7' : null, lineCap: 'round', pane: 'cpArcs', className: 'cp-arc' + (m.est ? ' est' : ''), bubblingMouseEvents: false });
      line.on('click', () => selectMove(m));
      line.addTo(layers.arcs);
      /* the arrowhead: a small chevron at three-fifths of the way, turned along the line */
      const k = Math.floor(pts.length * 0.6), p0 = pts[k - 1], p1 = pts[k];
      const ang = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);   // screen: lon right, lat up
      const head = L.marker(p1, { icon: L.divIcon({ className: 'cp-arrowic', html: h('span', 'cp-ah'), iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false, keyboard: false, pane: 'cpArcs' });
      head.addTo(layers.arcs);
      const e = head.getElement(); if (e) { e.firstChild.style.transform = 'rotate(' + (90 - ang * 180 / Math.PI) + 'deg)'; e.firstChild.style.borderBottomColor = col; }
      line.getElement && setTimeout(() => { const pe = line.getElement(); if (pe) { pe.setAttribute('role', 'img'); pe.setAttribute('aria-label', plural(m.n, 'person', 'people') + ' moved from ' + a.name + ' to ' + b.name + ' in ' + m.year); } }, 0);
      if (animate && i < 18) { const dot = L.circleMarker(pts[0], { radius: 3 + Math.min(3, w / 3), color: '#fff', weight: 1, fillColor: col, fillOpacity: 1, pane: 'cpArcs', interactive: false }); dot.addTo(layers.arcs); travellers.push({ dot, pts, off: (i * 0.37) % 1 }); }
    });
    cancelAnimationFrame(raf);
    if (travellers.length) {
      const t0 = performance.now();
      const step = now => { const t = ((now - t0) / 2400) % 1; for (const tr of travellers) { const u = (t + tr.off) % 1, f = u * (tr.pts.length - 1), i = Math.floor(f), q = tr.pts[i], r = tr.pts[Math.min(i + 1, tr.pts.length - 1)], w = f - i; tr.dot.setLatLng([q[0] + (r[0] - q[0]) * w, q[1] + (r[1] - q[1]) * w]); } raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    }
  }
  function drawRoute() {
    const L = window.L; layers.route.clearLayers();
    const s = st.sel; if (!s || s.kind !== 'person') return;
    const p = personRec(s.i), stays = p.stays;
    for (let i = 1; i < stays.length; i++) {
      const a = st.idx.places.get(stays[i - 1].k), b = st.idx.places.get(stays[i].k); if (!a || !b) continue;
      const est = stays[i].me;
      L.polyline(curve([a.lat, a.lon], [b.lat, b.lon]), { color: '#d24b1f', weight: 5, opacity: 0.92, dashArray: est ? '5 8' : null, pane: 'cpArcs', className: 'cp-route' + (est ? ' est' : ''), interactive: false }).addTo(layers.route);
    }
    stays.forEach((sy, i) => {
      const pl = st.idx.places.get(sy.k); if (!pl) return;
      const wrap = h('span', 'cp-stop' + (sy.est ? ' est' : '')); wrap.append(h('b', '', String(i + 1))); wrap.append(h('span', 'cp-stoplab', sy.a + (sy.est ? ' (est.)' : '') + ' ' + pl.name));
      L.marker([pl.lat, pl.lon], { icon: L.divIcon({ className: 'cp-icon', html: wrap, iconSize: [22, 22], iconAnchor: [11, 11] }), keyboard: false, interactive: false, zIndexOffset: 2000 }).addTo(layers.route);
    });
  }
  /* who held the ground, by year: /history/'s own boundaries, tinted */
  function drawGround() {
    stats.grounds++;
    if (!map) return;
    const L = window.L;
    if (!st.ground) { layers.ground.clearLayers(); groundKey = ''; return; }
    if (!st.shapes) return;
    const act = st.shapes.filter(sh => sh.s <= st.year && st.year < sh.e), key = act.map(sh => sh.n + sh.s).join('|');
    if (key === groundKey) return;
    groundKey = key; layers.ground.clearLayers();
    const dark = isDark();
    for (const sh of act) {
      let hh = 0; const sKey = sh.q || sh.n; for (let i = 0; i < sKey.length; i++) hh = (hh * 31 + sKey.charCodeAt(i)) >>> 0;
      const col = 'hsl(' + (hh % 360) + ',' + (dark ? 55 : 50) + '%,' + (dark ? 58 : 42) + '%)';
      for (const ring of sh.p) L.polygon(ring.map(c => [c[1], c[0]]), { renderer: layers.groundR, pane: 'cpGround', color: col, weight: 1, opacity: 0.5, fillColor: col, fillOpacity: dark ? 0.16 : 0.2, interactive: false, smoothFactor: 1.5 }).addTo(layers.ground);
    }
  }
  const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); };

  /* ---------------- selection ---------------- */
  function selectPlace(key) { st.sel = { kind: 'place', key }; st.more = {}; renderBody(); if (map) { const p = st.idx.places.get(key); if (p && map.getZoom() < 5) map.setView([p.lat, p.lon], 5); else if (p) map.panTo([p.lat, p.lon]); } openPanel(); drawRoute(); drawDots(); loadPlaceBooks(key); }
  function selectPerson(i, pan) {
    st.sel = { kind: 'person', i }; renderBody(); openPanel();
    const p = personRec(i), first = p.stays.find(s => st.year >= s.a && st.year <= s.b) || p.stays[0], pl = first && st.idx.places.get(first.k);
    drawRoute(); drawDots();
    if (map && pl && pan !== false) { const pts = p.stays.map(s => st.idx.places.get(s.k)).filter(Boolean).map(q => [q.lat, q.lon]); if (pts.length > 1) map.fitBounds(window.L.latLngBounds(pts).pad(0.35), { maxZoom: 7 }); else map.setView([pl.lat, pl.lon], Math.max(map.getZoom(), 5)); }
  }
  function selectMove(m) { st.sel = { kind: 'move', m }; st.more = {}; renderBody(); openPanel(); }
  function clearSel() { st.sel = null; renderBody(); drawRoute(); drawDots(); restNeedle(); }
  const openPanel = () => { el.panel.classList.remove('shut'); el.sheet.setAttribute('aria-expanded', 'true'); setTimeout(restNeedle, 80); };

  /* ---------------- the panel ---------------- */
  function drawTabs() {
    el.tabs.textContent = '';
    for (const [k, l] of [['under', 'Under way'], ['table', 'Table']]) {
      const t = btn('cp-tab', l, () => { st.tab = k; st.sel = null; renderBody(); drawRoute(); drawDots(); }, { role: 'tab', 'aria-selected': st.tab === k && !st.sel ? 'true' : 'false', id: 'cpt-' + k, 'aria-controls': 'cp-pbody' });
      el.tabs.append(t);
    }
  }
  function renderBody() {
    drawTabs();
    const B = el.body; B.textContent = '';
    for (const n of st.notes) B.append(h('p', 'cp-note' + (n.err ? ' err' : ''), n.text, { role: 'status' }));
    if (st.sel && st.sel.kind === 'place') return placePanel(B);
    if (st.sel && st.sel.kind === 'person') return personPanel(B);
    if (st.sel && st.sel.kind === 'move') return movePanel(B);
    if (st.tab === 'table') return tablePanel(B);
    underPanel(B);
  }
  const back = (B, label) => { const b = btn('cp-backlink', '← ' + (label || 'Back to the list'), clearSel); B.append(b); };
  const personLink = (p, label) => { const b = btn('cp-plink', label || p.name, () => selectPerson(p.i)); b.title = 'Draw ' + p.name + '’s route on the map'; return b; };

  function underPanel(B) {
    B.append(h('h2', 'cp-h', 'Under way, ' + st.year));
    const toggle = h('label', 'cp-tog'); const cb = h('input', '', null, { type: 'checkbox' }); cb.checked = st.showAll; cb.addEventListener('change', () => { st.showAll = cb.checked; renderBody(); });
    toggle.append(cb, h('span', '', 'Show every event in the world, not only those that touch where your people were'));
    B.append(toggle);
    if (!st.hist) { B.append(h('p', 'cp-muted', st.histFailed ? 'The Atlas’s history data could not be loaded, so nothing is listed here. The map and the people still work.' : 'Loading what was going on…')); return; }
    const pa = M.peopleAt(st.idx, st.year, st.filter, st.ctx, st.win);
    const present = [...pa.by.values()].map(e => { const pl = st.idx.places.get(e.key); return { key: e.key, cn: pl.cn, lat: pl.lat, lon: pl.lon, ev: pl.ev, n: e.n }; });
    const r = M.relevantEvents(st.hist, st.mort, st.year, present, { all: st.showAll });
    if (!r.rows.length) { B.append(h('p', 'cp-muted', st.showAll ? 'Nothing in the Atlas is under way this year.' : 'Nothing in the Atlas touches where your people were in ' + st.year + '. Try the box above for the whole world.')); return; }
    B.append(h('p', 'cp-muted', plural(r.total, 'event', 'events') + (r.total > r.rows.length ? ', the first ' + r.rows.length + ' shown' : '') + '. Each is something an Atlas page says happened.'));
    const ol = h('ol', 'cp-ev');
    for (const e of r.rows) {
      const li = h('li', 'cp-evi k-' + e.kind);
      li.append(h('span', 'cp-kind', KIND[e.kind] || e.kind));
      li.append(h('span', 'cp-evt', e.title.replace(/^[^·]*· /, '')));
      li.append(h('span', 'cp-evy', yrs(e.from, e.to) + (e.why ? ' · ' + e.why.replace(/touches ([A-Z]{2})$/, (m, c) => 'touches ' + cname(c)) : '')));
      li.append(h('a', 'cp-evl', 'Atlas page', { href: e.href, target: '_blank', rel: 'noopener', 'aria-label': 'The Atlas page for ' + e.title }));
      ol.append(li);
    }
    B.append(ol);
  }
  function cname(cc) { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; } }

  /* the text alternative: the same facts as a table, for the year in view */
  function tablePanel(B) {
    const pa = M.peopleAt(st.idx, st.year, st.filter, st.ctx, st.win), mv = M.movesIn(st.idx, st.year, st.win, st.filter, st.ctx, st.colour);
    B.append(h('h2', 'cp-h', 'The same, as a table: ' + st.year));
    B.append(h('p', 'cp-muted', plural(pa.total, 'person', 'people') + ' at ' + plural(pa.by.size, 'place', 'places') + (pa.est ? '; ' + pa.est + ' estimated' : '') + '. People who may be living are never placed.'));
    const tb = h('table', 'cp-tbl'); tb.append(h('caption', 'cp-vh', 'Places with people in ' + st.year));
    const hd = h('tr'); for (const x of ['Place', 'People', 'Born', 'Died', 'Estimated']) hd.append(h('th', '', x, { scope: 'col' })); tb.append(h('thead')).firstChild.append(hd);
    const body = h('tbody');
    for (const e of [...pa.by.values()].sort((a, b) => b.n - a.n).slice(0, st.more.rows || 40)) {
      const pl = st.idx.places.get(e.key), tr = h('tr'), td = h('td'); td.append(btn('cp-plink', pl.name, () => selectPlace(e.key))); tr.append(td);
      for (const v of [e.n, e.born, e.died, e.est]) tr.append(h('td', 'num', String(v)));
      body.append(tr);
    }
    tb.append(body); B.append(tb);
    if (pa.by.size > (st.more.rows || 40)) B.append(btn('stbtn small', 'Show 40 more places', () => { st.more.rows = (st.more.rows || 40) + 40; renderBody(); }));
    if (mv.length) {
      B.append(h('h3', 'cp-h3', 'Moves in the ' + (st.win === 1 ? 'year' : st.win + ' years') + ' to ' + st.year));
      const ul = h('ul', 'cp-mvl');
      for (const m of mv.slice(0, 25)) { const li = h('li'); li.append(btn('cp-plink', plural(m.n, 'person', 'people') + ': ' + st.idx.places.get(m.from).name + ' to ' + st.idx.places.get(m.to).name + ', ' + m.year + (m.est ? ' (estimated)' : ''), () => selectMove(m))); ul.append(li); }
      B.append(ul);
    } else B.append(h('p', 'cp-muted', 'No one moved in that time, as far as the file says.'));
  }

  function movePanel(B) {
    const m = st.sel.m, a = st.idx.places.get(m.from), b = st.idx.places.get(m.to);
    back(B);
    B.append(h('h2', 'cp-h', a.name + ' → ' + b.name));
    B.append(h('p', 'cp-muted', plural(m.n, 'person', 'people') + ' moved, ' + (m.est ? 'in or near ' : 'in ') + m.year + '. ' + (m.est ? 'The file does not date this move: it is worked out from other dates, so it is drawn dashed.' : 'The file states this move.')));
    const ul = h('ul', 'cp-pl');
    for (const i of m.people.slice(0, st.more.p || 30)) { const p = personRec(i), li = h('li'); li.append(personLink(p)); li.append(h('span', 'cp-py', p.by + '–' + p.dy)); ul.append(li); }
    B.append(ul);
    if (m.people.length > (st.more.p || 30)) B.append(btn('stbtn small', 'Show more', () => { st.more.p = (st.more.p || 30) + 30; renderBody(); }));
  }

  function personPanel(B) {
    const p = personRec(st.sel.i); back(B, 'Back');
    B.append(h('h2', 'cp-h', p.name));
    B.append(h('p', 'cp-muted', 'Born ' + (p.bye ? 'about ' : '') + p.by + ', died ' + (p.dye ? 'about ' : '') + p.dy + '. Their whole route, with the years the file gives:'));
    const ol = h('ol', 'cp-route');
    p.stays.forEach((s, i) => {
      const pl = st.idx.places.get(s.k), li = h('li', s.est ? 'est' : ''); const b = btn('cp-plink', pl.name, () => selectPlace(s.k)); li.append(b);
      li.append(h('span', 'cp-py', yrs(s.a, s.b) + (s.est ? ' · estimated' : '') + (i === 0 ? ' · born' : i === p.stays.length - 1 ? ' · died' : '')));
      ol.append(li);
    });
    B.append(ol);
    const canvasKey = srcOf(p).ck + ':' + p.id;
    const row = h('p', 'cp-acts'); row.append(btn('stbtn small', 'Show on the canvas', () => deps.showOnCanvas(canvasKey), { title: 'Close Compass and select them on the canvas' }));
    B.append(row);
    B.append(h('p', 'cp-fine', 'Dashed stretches are estimated: the file gives no year or place for them, so they are worked out from relatives or from the life’s length.'));
  }

  function placePanel(B) {
    const key = st.sel.key, pl = st.idx.places.get(key); if (!pl) return clearSel();
    back(B);
    const head = h('h2', 'cp-h'); const fl = M.flagAt(pl.fl, st.year);
    if (fl) { const im = h('img', 'cp-fl big', '', { alt: 'The flag over ' + pl.name + ' in ' + st.year, src: '/fl/' + fl + '.svg' }); im.addEventListener('error', () => im.remove()); head.append(im); }
    head.append(document.createTextNode(pl.name)); B.append(head);
    if (pl.id) { const ap = h('p', 'cp-fine'); ap.append(h('a', '', 'The Atlas\u2019s page for ' + pl.name, { href: '/place/' + encodeURIComponent(pl.id) + '/', target: '_blank', rel: 'noopener' })); B.append(ap); }
    const holders = st.shapes ? M.holdersAt(st.shapes, pl.lat, pl.lon, st.year) : [];
    if (holders.length) B.append(h('p', 'cp-muted', 'Held in ' + st.year + ' by ' + holders.map(x => x.name + ' (' + x.from + '–' + (x.to >= 2027 ? 'present' : x.to) + ')').join('; ') + ', as the Atlas draws the boundaries.'));
    /* the people there this year */
    const pa = M.peopleAt(st.idx, st.year, st.filter, st.ctx, st.win), e = pa.by.get(key);
    B.append(h('h3', 'cp-h3', 'Here in ' + st.year));
    if (!e) B.append(h('p', 'cp-muted', 'No one the filters let through is recorded here in ' + st.year + '.'));
    else {
      B.append(h('p', 'cp-muted', plural(e.n, 'person', 'people') + (e.est ? ' (' + e.est + ' estimated)' : '') + ', of whom ' + e.born + ' born and ' + e.died + ' dying in the last ' + (st.win === 1 ? 'year' : st.win + ' years') + '.'));
      const ul = h('ul', 'cp-pl');
      for (const i of e.people.slice(0, st.more.p || 25)) { const p = personRec(i), li = h('li'); li.append(personLink(p)); li.append(h('span', 'cp-py', p.by + '–' + p.dy)); ul.append(li); }
      B.append(ul);
      if (e.people.length > (st.more.p || 25)) B.append(btn('stbtn small', 'Show more people', () => { st.more.p = (st.more.p || 25) + 25; renderBody(); }));
    }
    /* births and deaths here, over the window */
    const [lo, hi] = M.rangeInView(st.year, st.win); let births = 0, deaths = 0;
    for (const p of st.idx.persons) { if (!M.passesWho(p, st.filter, st.ctx)) continue; if (p.by >= lo && p.by <= hi && p.stays[0].k === key) births++; if (p.dy >= lo && p.dy <= hi && p.stays[p.stays.length - 1].k === key) deaths++; }
    B.append(h('p', 'cp-muted', 'In ' + yrs(lo, hi) + ': ' + plural(births, 'birth', 'births') + ' and ' + plural(deaths, 'death', 'deaths') + ' here. Marriages are not read onto the map yet.'));
    /* books */
    B.append(h('h3', 'cp-h3', 'Books for ' + yrs(lo, hi)));
    const box = h('div', 'cp-books', null, { id: 'cp-books' }); B.append(box); renderBooks(box, key);
  }

  /* ---------------- the books ---------------- */
  function loadPlaceBooks(key) {
    const pl = st.idx.places.get(key); if (!pl || !pl.id || st.placeCache.has(pl.id)) return;
    st.placeCache.set(pl.id, 'loading');
    getJson('/p/' + encodeURIComponent(pl.id) + '.json').then(j => { st.placeCache.set(pl.id, j); }).catch(() => { st.placeCache.set(pl.id, 'none'); }).then(() => { if (st.sel && st.sel.kind === 'place' && st.sel.key === key) { const b = el.body.querySelector('#cp-books'); if (b) renderBooks(b, key); } });
  }
  function renderBooks(box, key) {
    box.textContent = '';
    const pl = st.idx.places.get(key), rec = pl.id ? st.placeCache.get(pl.id) : null;
    if (!pl.id) { box.append(h('p', 'cp-muted', 'The Atlas has no page for this place name, so it lists no books for it.')); return; }
    if (rec === 'loading' || rec == null) { box.append(h('p', 'cp-muted', 'Asking the Atlas what it lists for ' + pl.name + '…')); return; }
    if (rec === 'none') { box.append(h('p', 'cp-muted', 'The Atlas’s record for this place could not be read just now.')); return; }
    const [lo, hi] = M.rangeInView(st.year, st.win), books = M.booksFor(rec, lo, hi), show = st.more.b || 6;
    if (!books.length) { box.append(h('p', 'cp-muted', 'The Atlas lists no volumes or collections for this place.')); return; }
    box.append(h('p', 'cp-fine', plural(books.length, 'book or collection', 'books and collections') + ' the Atlas knows for this place, those that cover ' + yrs(lo, hi) + ' first. Listing a book is not saying it was searched.'));
    const plan = h('p', 'cp-plannote', st.planNote, { role: 'status' }); box.append(plan);
    for (const b of books.slice(0, show)) box.append(bookRow(b, pl, rec, plan));
    if (books.length > show) box.append(btn('stbtn small', 'Show ' + Math.min(10, books.length - show) + ' more', () => { st.more.b = show + 10; renderBooks(box, key); }));
  }
  function bookRow(b, pl, rec, plan) {
    const r = h('div', 'cp-book fit' + b.fit);
    r.append(h('b', 'cp-bt', b.title));
    r.append(h('span', 'cp-bm', (b.kind === 'volume' ? 'Register volume' : b.kind === 'collection' ? 'Collection' : 'Record set') + ' · ' + yrs(b.from, b.to) + (b.provider ? ' · ' + b.provider : '') + (b.fit === 2 ? ' · covers these years' : b.fit === 1 ? ' · near these years' : '')));
    const acts = h('span', 'cp-bacts');
    acts.append(h('a', 'stbtn small', 'Open', { href: b.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open ' + b.title + ' (a new tab)' }));
    const cp = btn('stbtn small', 'Copy request', () => copyText(M.requestText(b, pl.name, rec.region || rec.country || ''), cp, 'Copy request', 'Copied'), { 'aria-label': 'Copy a plain request for ' + b.title });
    acts.append(cp);
    if (b.id) {
      const planBtn = btn('stbtn small', 'Plan it', null, { 'aria-label': 'Mark ' + b.title + ' as planned in My research' });
      loadProgress().then(P => { if (!P) { planBtn.remove(); return; } paintPlan(planBtn, P, b); });
      planBtn.addEventListener('click', () => planIt(planBtn, b, pl, plan));
      acts.append(planBtn);
    }
    r.append(acts); return r;
  }
  function paintPlan(btnEl, P, b) { const m = P.get(b.id); if (m && m.state) { btnEl.textContent = m.state === 'planned' ? 'Planned' : 'Marked: ' + m.state; btnEl.setAttribute('aria-pressed', 'true'); btnEl.disabled = m.state !== 'planned' ? true : false; } }
  async function planIt(btnEl, b, pl, plan) {
    const P = await loadProgress(); if (!P) return;
    if (!P.active()) { askLine(btnEl, b, pl, plan, P); return; }
    doPlan(btnEl, b, pl, plan, P);
  }
  function doPlan(btnEl, b, pl, plan, P) {
    const m = P.get(b.id); if (m && m.state) { plan.textContent = 'Already marked in My research (' + m.state + '). Left as it was.'; st.planNote = plan.textContent; return; }
    P.setWhat(b.id, { t: b.title, where: pl.name, href: pl.id ? '/place/' + pl.id + '/' : '/' });
    P.setState(b.id, 'planned');
    try { document.dispatchEvent(new CustomEvent('ra-progress-changed')); } catch (e) { /* no listener */ }
    const ln = P.lines().find(l => l.active);
    st.planNote = 'Planned in My research' + (ln ? ' (' + ln.name + ')' : '') + '. Nothing about a person is saved, only the book; it stays in this browser and in your six-word copy if you turned that on. ';
    plan.textContent = st.planNote; plan.append(h('a', '', 'See My research', { href: '/my-research/', target: '_blank', rel: 'noopener' }));
    paintPlan(btnEl, P, b);
  }
  /* a mark needs a research line to sit in (My research's own rule): pick one, or name a new one, without leaving the map */
  function askLine(btnEl, b, pl, plan, P) {
    plan.textContent = ''; const box = h('span', 'cp-line');
    box.append(h('span', '', 'Marks sit in a research line. Choose one: '));
    const sel = h('select', 'cp-sel', null, { 'aria-label': 'Research line' });
    for (const l of P.lines()) sel.append(h('option', '', l.name, { value: l.slug }));
    sel.append(h('option', '', 'A new line…', { value: '' }));
    const nm = h('input', 'cp-in', null, { type: 'text', placeholder: 'Name the line (a surname, say)', 'aria-label': 'Name of the new research line', maxlength: '60' }); nm.hidden = !!P.lines().length;
    sel.addEventListener('change', () => { nm.hidden = !!sel.value; });
    if (!P.lines().length) sel.value = '';
    const go = btn('stbtn small primary', 'Use it', () => {
      let slug = sel.value;
      if (!slug) { const name = nm.value.trim(); if (!name) { nm.focus(); return; } slug = P.addLine(name, pl.name); } else P.setActive(slug);
      box.remove(); doPlan(btnEl, b, pl, plan, P);
    });
    box.append(sel, nm, go); plan.append(box);
  }
  function copyText(text, b, was, done) {
    const ok = () => { b.textContent = done; setTimeout(() => { b.textContent = was; }, 1800); };
    try { navigator.clipboard.writeText(text).then(ok, () => fallback()); } catch (e) { fallback(); }
    function fallback() { const t = h('textarea', 'cp-vh', text, { 'aria-hidden': 'true' }); document.body.append(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { /* nothing to do */ } t.remove(); }
  }

  /* ---------------- time ---------------- */
  function setRange() {
    el.range.min = String(st.span[0]); el.range.max = String(st.span[1]); el.range.value = String(st.year);
    el.dens.textContent = '';
    const d = M.densityByDecade(st.idx, st.span[0], st.span[1]), mx = Math.max(1, ...d.map(x => x.n)), W = 1000 / Math.max(1, d.length);
    d.forEach((x, i) => { const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); const hh = 38 * x.n / mx; r.setAttribute('x', String(i * W)); r.setAttribute('width', String(Math.max(1, W - 1))); r.setAttribute('y', String(40 - hh)); r.setAttribute('height', String(hh)); el.dens.append(r); });
    el.chapters.textContent = '';
    const chs = ((st.hist && st.hist.chapters) || []).filter(c => c.to >= st.span[0] && c.from <= st.span[1]);
    for (const c of chs) el.chapters.append(btn('cp-chip chap', c.title, () => jumpChapter(c), { title: c.from + '–' + c.to + ': ' + c.blurb }));
    if (!chs.length) el.chapters.hidden = true; else el.chapters.hidden = false;
  }
  function jumpChapter(c) {
    stop(); const y = Math.min(st.span[1], Math.max(st.span[0], c.from)); setYear(y, true);
    if (map && c.view) map.setView([c.view[0], c.view[1]], c.view[2], { animate: !reduceMotion() });
  }
  function setYear(y, now) {
    y = Math.max(st.span[0], Math.min(st.span[1], Math.round(y)));
    st.year = y; el.range.value = String(y); draw(now);
  }
  function tick() { if (st.year >= st.span[1]) { stop(); return; } setYear(st.year + 1); }
  function togglePlay() { st.playing ? stop() : start(); }
  function start() {
    if (st.year >= st.span[1]) setYear(st.span[0]);
    st.playing = true; clearInterval(timer); timer = setInterval(tick, 1000 / st.speed); playUi(); el.caption.setAttribute('aria-live', 'off'); draw();
  }
  function stop() { if (!st.playing) { return; } st.playing = false; clearInterval(timer); cancelAnimationFrame(raf); playUi(); el.caption.setAttribute('aria-live', 'polite'); draw(); }
  function playUi() {
    el.play.setAttribute('aria-pressed', st.playing ? 'true' : 'false'); el.play.setAttribute('aria-label', st.playing ? 'Pause' : 'Play');
    el.playIco.firstChild.setAttribute('d', st.playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z');
  }

  /* ---------------- the needle ---------------- */
  const needle = { a: 25, to: 25, raf: 0, idle: 0 };
  function aimNeedle(deg, snap) {
    needle.to = deg;
    if (Math.abs(((deg - needle.a + 540) % 360) - 180) < 0.05 && !needle.raf) return;
    const g = el.rose && el.rose.querySelector('.needle'); if (!g) return;
    const set = a => g.setAttribute('transform', 'rotate(' + a.toFixed(1) + ' 24 24)');
    cancelAnimationFrame(needle.raf);
    if (reduceMotion() || snap) { needle.a = deg; set(deg); return; }
    const step = () => { const d = ((needle.to - needle.a + 540) % 360) - 180; if (Math.abs(d) < 0.6) { needle.a = needle.to; set(needle.a); return; } needle.a += d * 0.22; set(needle.a); needle.raf = requestAnimationFrame(step); };
    needle.raf = requestAnimationFrame(step);
  }
  /* at rest the needle points toward the selected place or person's first place (from the middle of the map), else a slight tilt */
  function restNeedle() {
    if (!st.open) return;
    const s = st.sel, key = s && (s.kind === 'place' ? s.key : s.kind === 'person' ? ((personRec(s.i).stays || [])[0] || {}).k : null), pl = key && st.idx.places.get(key);
    if (pl && map) { const c = map.getSize(), q = map.latLngToContainerPoint([pl.lat, pl.lon]); if (Math.hypot(q.x - c.x / 2, q.y - c.y / 2) > 8) { aimNeedle(Math.atan2(q.x - c.x / 2, -(q.y - c.y / 2)) * 180 / Math.PI); return; } }
    aimNeedle(25);
  }
  function onPointer(e) {
    if (!st.open || reduceMotion() || !el.rose) return;
    const r = el.rose.getBoundingClientRect(); if (!r.width) return;
    aimNeedle(Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI);
    clearTimeout(needle.idle); needle.idle = setTimeout(restNeedle, 2600);
  }

  /* ---------------- one draw ---------------- */
  let underT = 0;
  function draw(now) {
    if (!st.open || !st.idx) return;
    stats.draws++;
    el.year.textContent = String(st.year); el.yrOut.textContent = String(st.year); el.range.setAttribute('aria-valuetext', String(st.year));
    const f = st.filter, pa = M.peopleAt(st.idx, st.year, f, st.ctx, st.win), mv = M.movesIn(st.idx, st.year, st.win, f, st.ctx, st.colour);
    if (mapOk) { drawGround(); drawDots(); drawArcs(mv); drawRoute(); }
    /* the quiet caption: movement if there is any, else how long they have stayed */
    let cap = '';
    if (!pa.total) cap = 'No one the filters let through is recorded in ' + st.year + '.';
    else if (mv.length) cap = M.moveCaption(mv, st.idx.places, st.year, st.win);
    else {
      const fk = M.focusPlaceAt(st.idx, st.year, pa.by, st.ctx.focus);
      if (fk) {
        const e = pa.by.get(fk), line = M.mainLine(st.idx, e, st.ctx.focus), fam = line ? (st.idx.persons.find(p => p.sk === line) || {}).sur : '';
        const run = M.stayRun(st.idx, fk, st.year, line, f, st.ctx);
        cap = run ? M.stayCaption(run, st.idx.places.get(fk).name, fam) : '';
        if (!st.playing && cap === '') cap = plural(pa.total, 'person', 'people') + ' recorded in ' + st.year + '.';
      }
    }
    el.caption.textContent = cap; el.caption.hidden = !cap;
    drawLegend(mv);
    if (!st.sel) { clearTimeout(underT); underT = setTimeout(() => { if (st.open && !st.sel) renderBody(); }, now ? 0 : 140); }
    lastDraw = { total: pa.total, moves: mv.length };
  }
  function drawLegend(mv) {
    const L = el.legend; L.textContent = '';
    const item = (c, t, cls) => { const s = h('span', 'cp-li ' + (cls || '')); const sw = h('i', 'sw'); sw.style.setProperty('--c', c); s.append(sw, document.createTextNode(t)); return s; };
    if (st.colour === 'side' && st.focus) L.append(item(M.SIDE_COLOUR.f, "Father's side"), item(M.SIDE_COLOUR.m, "Mother's side"), item(M.SIDE_COLOUR.n, 'Others'));
    else L.append(item('#6b5a44', 'Arrows coloured by family line'));
    L.append(item('#6b5a44', 'Dashed: estimated', 'dash'));
    L.append(h('span', 'cp-li', 'Arrow width: people moving'));
  }

  /* ---------------- open and close ---------------- */
  /* what the map was built from: the trees (by identity, so a tree read again is a different one) and the archives chosen to compare. While this is unchanged, coming back to Compass changes nothing. */
  const signature = () => (deps.sources() || []).map(s => s.key + '#' + idOf(s.tree)).join('|') + '||' + (deps.chosen() || []).join(',');
  const handedKey = o => (o && o.person != null ? (o.a != null ? o.a : '') + ':' + o.person : '');
  /* the same file, the same Compare: nothing is rebuilt, redrawn or refetched. The map, its pins and arcs, the year, the selection, the panel and its scroll are as they were left; the map is told its size once, and redrawn only if the window changed size meanwhile. */
  function resume(o, quiet) {
    stats.resumes++; st.open = true; root.hidden = false;
    document.addEventListener('pointermove', onPointer);
    const hk = handedKey(o);
    if (hk && hk !== st.handed) {   // someone else was selected on the canvas since: follow them (the year, the zoom and the panel stay)
      st.handed = hk; pickFocus(o); st.ctx = makeCtx(); st.colour = st.focus ? st.colour : 'line'; drawFilters(); drawSummary(); draw(true);
    }
    if (map) {
      const before = map.getSize(); map.invalidateSize({ animate: false }); const after = map.getSize();
      if (before.x !== after.x || before.y !== after.y) { groundKey = ''; draw(true); }
    }
    restNeedle();
    if (!quiet) { const f = st.lastFocus && root.contains(st.lastFocus) && !st.lastFocus.closest('[hidden]') ? st.lastFocus : el.title; try { f.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
  }
  async function open(o, opts) {
    build(); stats.opens++;
    const sig = signature(), quiet = !!(opts && opts.quiet);
    if (st.idx && st.sig === sig && map && mapOk) return resume(o, quiet);
    st.sig = sig; st.handed = handedKey(o);
    st.open = true; st.notes = []; st.sel = null; st.tab = 'under';
    const compares = deps.chosen(); st.on = new Set(compares);
    st.extra = new Map(); for (const k of st.on) { /* archives the canvas's Compare already holds come in through deps.sources() */ }
    reindex(false); pickFocus(o || null); st.ctx = makeCtx();
    st.year = (() => { const f = st.focus && st.idx.persons.find(p => p.s === st.focus.s && p.id === st.focus.id); return f ? Math.round((f.by + f.dy) / 2) : Math.round((st.span[0] + st.span[1]) / 2); })();
    st.year = Math.max(st.span[0], Math.min(st.span[1], st.year));
    if (!st.focus) st.colour = 'line';
    drawFilters(); drawSummary(); setRange(); playUi(); renderBody();
    document.addEventListener('pointermove', onPointer); aimNeedle(25, true);
    if (!st.shown) { st.shown = true; if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) { el.panel.classList.add('shut'); el.sheet.setAttribute('aria-expanded', 'false'); } }   // on a phone the map comes first; the panel is one tap up
    root.hidden = false; showLoad('Loading the map…');
    try { await ensureMap(); } catch (e) { showLoad(''); note('The map could not be drawn (' + String((e && e.message) || e) + '). The table still lists the same facts.', true); st.tab = 'table'; renderBody(); setYear(st.year, true); return; }
    showLoad(''); setTimeout(() => { map.invalidateSize(); fitToPeople(); draw(true); }, 30);
    if (!quiet) el.title.focus();
    /* the Atlas's own history, in the background: the map and the people never wait for it */
    if (!st.hist) {
      Promise.all([getJson('/history.json'), getJson('/mortality.json').catch(() => null)]).then(([hh, mm]) => { st.hist = hh; st.mort = mm; setRange(); if (st.open) renderBody(); }).catch(() => { st.histFailed = true; if (st.open) renderBody(); });
    }
    if (!st.shapes) getJson('/history-ground.json').then(g => { st.shapes = g.shapes || []; if (st.open) { groundKey = ''; drawGround(); } }).catch(() => { /* plain tiles */ });
  }
  function close() { stop(); if (root.contains(document.activeElement) && document.activeElement !== root) st.lastFocus = document.activeElement; st.open = false; root.hidden = true; clearTimeout(underT); clearTimeout(needle.idle); cancelAnimationFrame(needle.raf); document.removeEventListener('pointermove', onPointer); }
  function onKey(e) {
    if (!st.open) return false;
    if (e.key === ' ' && e.target === el.mapBox) { e.preventDefault(); togglePlay(); return true; }
    return false;
  }
  return { open, close, stats: () => ({ ...stats }), isOpen: () => st.open, onKey, state: () => st, redraw: () => { if (st.open) { groundKey = ''; draw(true); } } };
}
