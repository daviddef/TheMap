/* The whole import, with no DOM and no network of its own: bytes in, tree + Atlas slice + report + review list out.
   `io` supplies the Atlas's static files (json(path), flag(id)); in the page that is fetch of same-origin files, in the tests it reads disk.
   Nothing here sends the GEDCOM, or anything derived from it, anywhere. */
import { parseGedcom } from './gedcom.js';
import * as model from './model.js';
import { readPeople, prepare, buildTree } from './model.js';
import { BUILD } from './build.js';
import { Gazetteer, resolveAll, REAL, COARSE, REVIEW, addCountryNames, parseParts } from './resolver.js';
import { buildExport, logText } from './export.js';
import { offerable } from './contribute.js';
import { Overlay, suggestMerges, cleanDate, yearOf } from './workbench.js';
import { buildChecklist } from './checklist.js';
import { buildConsistency } from './consistency.js';
import { AtlasCore, targetOf, nameTargets, buildAtlas } from './atlas.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Session {
  constructor(io, progress) { this.io = io; this.progress = progress || (() => {}); this.gz = new Gazetteer(); this.overrides = new Map(); this.t = {}; this.overlay = new Overlay(); this.liveMode = 'show'; }

  async load(bytes) {
    const T = this.t, tick = (k, t0) => { T[k] = Math.round(now() - t0); };
    let t0 = now(); this.progress('Reading the file');
    this.parsed = parseGedcom(bytes); tick('parse', t0);
    t0 = now(); this.progress('Finding people and places');
    const { people, mentions } = readPeople(this.parsed); this.P = people; this.mentions = mentions;
    this.snap = new Map([...people].map(([id, p]) => [id, { by: p.by, byApprox: p.byApprox, dy: p.dy, deathKnown: p.deathKnown, srcs: p.srcs.slice() }]));
    const y = prepare(people); this.est = y.est; this.dest = y.dest; tick('model', t0);
    t0 = now(); this.progress('Reading the Atlas');
    this.core = new AtlasCore(await this.io.json('data/atlas.json')); tick('atlasLoad', t0);
    try { this.families = await this.io.json('data/surname-families.json'); } catch (e) { this.families = []; }       // spellings the Atlas catalogue treats as one name
    t0 = now(); this.progress('Placing ' + mentions.size.toLocaleString('en') + ' different places');
    addCountryNames(this.core.c.countries);
    const r = await resolveAll(mentions, this.gz, this.io, (kind, i, n, cc) => this.progress('Loading the ' + cc + ' places (' + i + ' of ' + n + ')'));
    this.nb = r.byNeighbours; this.res = r.res; this.prior = r.prior; this.countries = r.countries; tick('resolve', t0);
    return this.draw();
  }

  /* (Re)draw from the current resolutions plus the user's picks. Cheap enough to run after every pick. */
  async draw(living = this.liveMode) {
    const T = this.t; let t0 = now(); this.progress('Building the tree');
    const targets = new Map(), of = new Map();
    for (const raw of this.mentions.keys()) {
      const r = this.overrides.has(raw) ? { tier: 'user', place: this.overrides.get(raw) } : this.res.get(raw);
      const t = targetOf(r, this.core.c); if (!t) continue;
      if (!targets.has(t.id)) targets.set(t.id, t); of.set(raw, t.id);
    }
    nameTargets(targets);
    const placeFor = raw => { const id = of.get(raw); return id ? { name: targets.get(id).n } : null; };
    const { tree, report } = buildTree(this.P, placeFor, this.est, this.dest, { living });
    T.tree = Math.round(now() - t0);
    const used = new Set(); for (const p of tree.people) { if (p.bp) used.add(p.bp); if (p.dp) used.add(p.dp); }
    const keep = new Map([...targets].filter(([, t]) => used.has(t.n)));
    t0 = now(); this.progress('Drawing flags and regimes');
    const atlas = await buildAtlas(keep, this.core, id => this.io.flag(id)); T.atlas = Math.round(now() - t0);
    this.tree = tree; this.atlas = atlas;
    return { tree, atlas, report: this.report(report), review: this.review(), wb: this.workbench(), timings: { ...T }, build: { pipeline: BUILD, model: model.MODEL_BUILD } };
  }

  /* spellings near the place part of a text, in the country the text names (or, with none, the countries the tree uses most) */
  suggest(raw) {
    const r = this.res.get(raw); if (!r) return [];
    const ccs = r.said ? [r.said] : r.iso ? [r.iso] : [...this.prior].slice(0, 3), first = parseParts(raw, this.gz).map(x => x.trim()).filter(Boolean)[0] || raw;
    return ccs.flatMap(cc => this.gz.suggest(first, cc)).slice(0, 6);
  }
  contributions() { return offerable(this); }

  /* ---- the workbench ---- */
  shown(p) { return p.liv && this.liveMode !== 'show' ? 'Living person' : ((p.given + ' ' + p.sur).trim() || p.id); }
  /* Put every person back as the file states them, apply the user's date edits, re-estimate. Cheap enough to run after each edit. */
  refresh() {
    for (const [id, p] of this.P) { const s = this.snap.get(id); p.by = s.by; p.byApprox = s.byApprox; p.dy = s.dy; p.deathKnown = s.deathKnown; p.srcs = s.srcs.slice(); }
    for (const e of this.overlay.edits) {
      const p = this.P.get(e.who); if (!p) continue;
      if (e.op === 'date') { const y = yearOf(e.value); if (!y) continue; if (e.field === 'birth') { p.by = y.y; p.byApprox = y.approx; } else { p.dy = y.y; p.deathKnown = true; } }
      else if (e.op === 'source') p.srcs.push(e.url ? { t: e.title.slice(0, 140), u: e.url } : { t: e.title.slice(0, 140) });
    }
    const y = prepare(this.P); this.est = y.est; this.dest = y.dest;
  }
  workbench() {
    const undrawn = [];
    for (const p of this.P.values()) if (p.by === null) undrawn.push({ id: p.id, name: this.shown(p), place: p.liv && this.liveMode !== 'show' ? null : p.bpRaw });
    undrawn.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
    const merges = suggestMerges(this.P, this.est, this.overlay).slice(0, 300).map(m => ({ ...m, an: this.shown(this.P.get(m.a)), bn: this.shown(this.P.get(m.b)), ay: this.P.get(m.a).by, by: this.P.get(m.b).by, ap: this.P.get(m.a).bpRaw, bp: this.P.get(m.b).bpRaw }));
    return { undrawn: undrawn.slice(0, 500), undrawnTotal: undrawn.length, merges, edits: this.overlay.edits.map(e => ({ ...e, name: this.shown(this.P.get(e.who) || { id: e.who }) })) };
  }
  find(q) {
    const fold = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const t = fold(q || '').trim(); if (t.length < 2) return [];
    const words = t.split(/\s+/).filter(Boolean);                                          // every word typed, in any order: "ivan defranceski" finds Ivan Anton Defranceski
    const out = []; for (const p of this.P.values()) { const n = fold(p.given + ' ' + p.sur); if (words.every(w => n.includes(w)) || p.id.toLowerCase() === t.replace(/^@|@$/g, '')) out.push(p); if (out.length >= 25) break; }
    return out.map(p => ({ id: p.id, name: (p.given + ' ' + p.sur).trim() || p.id, living: !!p.liv, by: p.by, bp: p.bpRaw, est: this.est.has(p.id) }));
  }
  /* One edit from the page. Returns an error string for something the user can fix, or null. */
  edit(e) {
    if (e.op === 'undo') { this.overlay.remove(e.n); this.refresh(); return null; }
    const p = this.P.get(e.who); if (!p) return 'That person is not in the file.';
    if (e.op === 'date') {
      if (e.field !== 'birth' && e.field !== 'death') return 'Which date?';
      const v = cleanDate(e.value); if (!v) return 'Write the date the way GEDCOM does: 1850, ABT 1850, MAR 1850, 12 MAR 1850, BEF 1850 or BET 1840 AND 1845.';
      this.overlay.add({ op: 'date', who: e.who, field: e.field, value: v });
    } else if (e.op === 'note') { const t = String(e.text || '').trim(); if (!t) return 'The note is empty.'; this.overlay.add({ op: 'note', who: e.who, text: t.slice(0, 5000) }); }
    else if (e.op === 'source') {
      const title = String(e.title || '').trim(); if (!title) return 'A source needs a title.';
      const url = String(e.url || '').trim(); if (url && !/^https?:\/\/\S+$/.test(url)) return 'The link must start with http:// or https://.';
      this.overlay.add({ op: 'source', who: e.who, title, url: url || null, page: String(e.page || '').trim() || null });
    } else if (e.op === 'merge') { if (!this.P.get(e.other) || e.other === e.who) return 'Pick two different people.'; this.overlay.add({ op: 'merge', who: e.who, other: e.other }); }
    else if (e.op === 'notsame') { this.overlay.dismiss(e.who, e.other); }
    else if (e.op === 'undo') this.overlay.remove(e.n);
    else return 'Unknown edit.';
    this.refresh(); return null;
  }
  personInfo(id) {
    const p = this.P.get(id); if (!p) return null;
    const rec = this.parsed.nodes.find(n => n.xref === '@' + id + '@'), dt = tag => { const ev = rec && rec.kids.find(k => k.tag === tag), d = ev && ev.kids.find(k => k.tag === 'DATE'); return d ? d.val : null; };
    return { id, name: this.shown(p), birth: dt('BIRT'), death: dt('DEAT'), by: p.by, living: !!p.liv, estimated: this.est.has(id), edits: this.overlay.of(id),
      look: { first: p.given, last: p.sur, by: p.by, dy: p.dy, bp: p.bpRaw || '', dp: p.dpRaw || '', living: !!p.liv } };
  }

  /* The file with the chosen edits applied to its own lines, and the change log. mode: 'faithful' | 'enriched' | 'cleaned' | 'shareable'. */
  export(mode = 'enriched', date = new Date().toISOString().slice(0, 10)) {
    const opt = { faithful: {}, enriched: { coords: true }, cleaned: { coords: true, apply: true }, shareable: { coords: true, apply: true, share: true } }[mode];
    if (!opt) throw new Error('unknown export mode ' + mode);
    const ctx = {
      P: this.P, picked: raw => this.overrides.has(raw),
      resolve: raw => (this.overrides.has(raw) ? { tier: 'user', place: this.overrides.get(raw) } : this.res.get(raw)),
      label: p => { const c = this.core.c.countries[p.k]; return [p.n, p.region, c ? c[0] : p.k].filter(Boolean).join(', '); },
      atlasId: p => { const a = this.core.match(p.n, p.k, p.y, p.x); return a ? String(a[0]) : null; },
    };
    const r = buildExport(this.parsed, ctx, { ...opt, date, overlay: this.overlay });
    return { ...r, logText: logText(r, mode) };
  }

  /* The fix list for the tree they keep elsewhere. opt.living false names living people as 'Living person' and leaves their places out. */
  checklist(opt = {}) {
    const core = this.core, living = opt.living !== false;
    const label = p => { const c = core.c.countries[p.k]; return [p.n, p.region, c ? c[0] : p.k].filter(Boolean).join(', '); };
    const resolve = raw => (this.overrides.has(raw) ? { tier: 'user', place: this.overrides.get(raw) } : this.res.get(raw));
    const out = buildChecklist({ parsed: this.parsed, P: this.P, est: this.est, dest: this.dest, living, label,
      merges: suggestMerges(this.P, this.est, this.overlay), resolve });
    /* checks that need the whole life or the Atlas: only places the resolver is sure of are used, so a guess never raises a flag */
    const SURE = new Set([...REAL, 'user']);
    const locate = raw => { const r = resolve(raw); if (!r || !SURE.has(r.tier)) return null; const t = targetOf(r, core.c); if (!t || t.kind !== 'place') return null; const c = core.c.countries[t.iso]; return { ...t, today: c ? c[0] : null }; };
    const period = (t, y) => { const rg = core.eraRegime(core.regionOf(t.lat, t.lon), y); if (!rg) return null; const iso = core.c.riso[rg]; return iso ? { label: (core.c.regimes[rg] || {}).label || rg, iso } : null; };
    const cols = (t, y) => { const a = core.match(t.name, t.iso, t.lat, t.lon); if (!a) return []; return a[6].filter(c => (c[2] === null || c[2] <= y) && (c[3] === null || y <= c[3])).map(c => ({ title: c[0], url: c[1], from: c[2], to: c[3], provider: core.c.prov[c[4]] || '' })); };
    const shown = p => (p.liv && !living ? 'Living person' : ((p.given || '') + ' ' + (p.sur || '')).trim() || p.id);
    const { suspect, leads, ages } = buildConsistency({ parsed: this.parsed, P: this.P, est: this.est, dest: this.dest, keep: p => living || !p.liv, shown, locate, period, cols, families: this.families || [] });
    const at = out.sections.findIndex(s => s.key === 'dates') + 1;
    out.sections.splice(at, 0,
      { key: 'suspect', title: 'People whose life does not add up', how: 'Several kinds of check on a whole life: events after a death or before a birth, a marriage too young or after a spouse died, two different birth or death years, places too far apart for the years between them, and a surname that changes between father and child. Recorded years only, and only places the Atlas is sure of. Each is a place to look, not a verdict: “Leave as is” hides one you know is right.', items: suspect },
      { key: 'ages', title: 'Today’s country on an older date', how: 'Places written with today’s country for a date when the Atlas shows another power ruling it (for example South Africa under Dutch or British rule). Often fine: it is how people name a place today. Your tree may want the name used at the time, and the maps already draw the flag of the day.', items: ages },
      { key: 'leads', title: 'Where to look next', how: 'People with no parents in your file, born where the Atlas lists a record collection for those years. The links open the collection’s own site; nothing from your file is sent.', items: leads });
    out.counts = Object.fromEntries(out.sections.map(s => [s.key, s.items.length]));
    return out;
  }

  pick(raw, cand) { if (cand) this.overrides.set(raw, cand); else this.overrides.delete(raw); }

  report(treeReport) {
    const by = {}, w = {}; let total = 0, real = 0, drawable = 0, named = 0, claims = 0, claimsDrawable = 0;
    for (const [k, c] of this.mentions) {
      const r = this.overrides.has(k) ? { tier: 'user', place: this.overrides.get(k) } : this.res.get(k), t = r.tier;
      by[t] = (by[t] || 0) + 1; w[t] = (w[t] || 0) + c; total += c;
      if (REAL.has(t) || t === 'user') { real += c; named += c; } else if (t === 'district') named += c;
      const drawn = !!targetOf(r, this.core.c); if (drawn) drawable += c;               // counted only if there is something to draw
      if (t !== 'region' && t !== 'country-only') { claims += c; if (drawn) claimsDrawable += c; }   // a text that names a place, not just a region or a country
    }
    return { file: { ...this.parsed.report }, people: treeReport,
      places: { distinct: this.mentions.size, mentions: total, byTier: by, mentionsByTier: w, atRealPlace: real, atNamedPlace: named, drawableAtSomeLevel: drawable,
        placeNameMentions: claims, realOfNamedPct: claims ? real / claims : 0, drawableOfNamedPct: claims ? claimsDrawable / claims : 0, realPct: total ? real / total : 0, namedPct: total ? named / total : 0, drawablePct: total ? drawable / total : 0, countriesLoaded: this.countries.length, priorCountries: [...this.prior], byNeighbours: this.nb } };
  }

  /* Everything that is not an exact place, A to Z (a list people can scan), with the candidates the resolver found. Picks are applied. */
  review() {
    const out = [];
    for (const [raw, count] of this.mentions) {
      const r = this.res.get(raw), picked = this.overrides.has(raw);
      if (REAL.has(r.tier) && !picked) continue;
      out.push({ raw, count, tier: picked ? 'user' : r.tier, iso: r.iso, cands: r.cands, picked: picked ? this.overrides.get(raw) : null });
    }
    return out.sort((a, b) => a.raw.localeCompare(b.raw, 'en'));
  }
}

export { REAL, COARSE, REVIEW };
