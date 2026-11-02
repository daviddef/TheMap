/* Export: the original GEDCOM lines with a small, listed set of edits applied. Nothing is regenerated, so with no edits the output is the input.
   Every edit goes into a change log (line number, what it was, what it is now, why). No DOM, no network: runs in the worker and under Node.

   Edits, each switched on by an option:
     coords  add coordinates (MAP / LATI / LONG), an Atlas id and an _ATLAS_EDIT tag under a PLAC whose place was matched exactly or picked by
             the user; the PLAC text itself is not touched and nothing already there is changed
     apply   (cleaned) a place the user picked on the review screen replaces the PLAC text; the old text is kept in an _ORIG child
     share   (shareable) living people are redacted to a bare record, their family events are dropped, so the file can be sent to a relative
   Not edited, ever: pointers, record order, vendor tags, notes, sources, media pointers, anything the options do not name. */
import { get } from './gedcom.js';

const EXACT = new Set(['confident', 'confident-by-region', 'user']);   // coordinates are written only for a place we are sure of, or one the user chose
const last = n => { let m = n.ln; for (const k of n.kids) m = Math.max(m, last(k)); return m; };
const coord = (v, pos, neg) => (v < 0 ? neg : pos) + Math.abs(v).toFixed(6);

/* ctx: { P: Map(id -> {liv}), resolve(raw) -> {tier, place} | null, picked(raw) -> bool, label(place) -> string, atlasId(place) -> string | null } */
export function buildExport(parsed, ctx, opt = {}) {
  const lines = parsed.lines, date = opt.date || '', rep = new Map(), ins = new Map(), del = new Set(), log = [];
  const stats = { coords: 0, applied: 0, redacted: 0, famTrimmed: 0, reencoded: false };
  const note = (op, ln, old, nw, why) => log.push({ line: ln + 1, op, old, new: nw, why });
  const insertAfter = (ln, arr, why) => { ins.set(ln, (ins.get(ln) || []).concat(arr)); note('insert', ln, null, arr, why); };

  const livingIds = new Set();
  if (opt.share) {
    const idOf = x => x.replace(/@/g, '');
    for (const r of parsed.nodes) if (r.tag === 'INDI' && r.xref && ctx.P.get(idOf(r.xref)) && ctx.P.get(idOf(r.xref)).liv) livingIds.add(r.xref);
    for (const r of parsed.nodes) {
      if (r.tag === 'INDI' && livingIds.has(r.xref)) {
        const end = last(r); let keep = 0;
        for (let i = r.ln + 1; i <= end; i++) del.add(i);
        for (const k of r.kids) if (['FAMC', 'FAMS', 'SEX'].includes(k.tag)) { for (let i = k.ln; i <= last(k); i++) del.delete(i); keep++; }
        const nameLn = r.ln;                                                          // the NAME line is rebuilt, so it goes after the record line
        ins.set(nameLn, (ins.get(nameLn) || []).concat(['1 NAME Living /Living/']));
        stats.redacted++; note('redact', r.ln, null, null, 'living person ' + r.xref + ': name, events, notes, sources and places removed; family links kept');
      } else if (r.tag === 'FAM' && r.kids.some(k => (k.tag === 'HUSB' || k.tag === 'WIFE') && livingIds.has(k.val))) {
        let any = false;
        for (const k of r.kids) if (!['HUSB', 'WIFE', 'CHIL'].includes(k.tag)) { for (let i = k.ln; i <= last(k); i++) del.add(i); any = true; }
        if (any) { stats.famTrimmed++; note('redact', r.ln, null, null, 'family ' + r.xref + ' includes a living person: its events and notes removed'); }
      }
    }
  }

  let sweep = null;
  if (opt.share) {                                                    // a living person's name written into somebody's note is still their name
    const names = new Set(); for (const [, q] of ctx.P) if (q.liv && q.given && q.sur) { names.add(q.given.split(/\s+/)[0] + ' ' + q.sur.split(/\s+/)[0]); names.add(q.given.trim() + ' ' + q.sur.trim()); }
    const SKIP = new Set(['NAME', 'GIVN', 'SURN', 'NSFX', 'NPFX', 'SPFX', 'NICK', '_MARNM', '_AKA', 'ALIA', 'HUSB', 'WIFE', 'CHIL', 'FAMC', 'FAMS', 'DATE', 'PLAC', 'MAP', 'LATI', 'LONG', 'SEX', 'ASSO', 'SOUR', 'HEAD', 'FORM', 'FILE']), W = /[^\s,.;:()"\[\]]+/g;
    let n = 0;
    const LINE = /^(\s*(\d+) (?:@[^@]+@ )?(\w+))(?: (.*))?$/;
    if (names.size) for (let i = 0; i < lines.length; i++) {
      if (del.has(i)) continue;
      const m = LINE.exec(lines[i]); if (!m || m[3] === 'CONC' || SKIP.has(m[3]) || lines[i].length < 12) continue;
      const chain = [i];                                              // the line and the CONC lines that continue it (a name can be cut at a line break)
      while (i + chain.length < lines.length) { const q = LINE.exec(lines[i + chain.length]); if (q && q[3] === 'CONC' && +q[2] === +m[2] + 1 && !del.has(i + chain.length)) chain.push(i + chain.length); else break; }
      const joined = (m[4] || '') + chain.slice(1).map(k => LINE.exec(lines[k])[4] || '').join('');
      const ws = [...joined.matchAll(W)]; let out = joined, hit = false;
      for (let k = 0; k + 1 < ws.length; k++) for (let w = 2; w <= 5 && k + w <= ws.length; w++) {
        const g = ws.slice(k, k + w).map(x => x[0]).join(' ');
        if (names.has(g)) { out = out.split(g).join('Living'); hit = true; }
      }
      if (hit) {
        if (chain.length === 1) rep.set(i, m[1] + ' ' + out);
        else {
          const cut = []; for (let a = 0; a < out.length; a += 180) cut.push(out.slice(a, a + 180));
          rep.set(i, m[1] + ' ' + cut[0]); for (const k of chain.slice(1)) del.add(k);
          ins.set(i, (ins.get(i) || []).concat(cut.slice(1).map(c => (+m[2] + 1) + ' CONC ' + c)));
        }
        n++; note('redact', i, null, null, 'a living person\'s name written in a note, source or event text');
      }
      i += chain.length - 1;
    }
    stats.textRedacted = n;
    if (names.size) {                                                 // last sweep over what will be written: any line still holding a living name as plain text
      const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sweep = { re: new RegExp([...names].sort((a, b) => b.length - a.length).map(esc).join('|'), 'g'), SKIP, LINE };
    }
  }

  /* The workbench edits. Additions (a date where there was none, a note, a source, a duplicate hint) are always written; a date that REPLACES one
     is written only in Cleaned and Shareable, so Enriched stays additive. */
  function applyOverlay() {
    const recs = new Map(parsed.nodes.filter(r => r.xref).map(r => [r.xref.replace(/@/g, ''), r])), used = new Set(parsed.nodes.map(r => r.xref).filter(Boolean));
    const fresh = () => { let i = 1; while (used.has('@RR' + i + '@')) i++; used.add('@RR' + i + '@'); return '@RR' + i + '@'; };
    const lineOf = (lvl, tag, v) => lvl + ' ' + tag + (v ? ' ' + v : '');
    const textLines = (lvl, tag, str) => {                                 // a (possibly long, multi-line) text as NOTE/CONT/CONC lines
      const out = []; str.split(/\r?\n/).forEach((para, i) => {
        const cut = []; for (let a = 0; a < Math.max(para.length, 1); a += 200) cut.push(para.slice(a, a + 200));
        cut.forEach((c, k) => out.push(i === 0 && k === 0 ? lineOf(lvl, tag, c) : k === 0 ? (lvl + 1) + ' CONT ' + c : (lvl + 1) + ' CONC ' + c));
      }); return out;
    };
    const srcRecs = [], srcId = new Map();
    for (const e of opt.overlay.edits) {
      const r = recs.get(e.who); if (!r || r.tag !== 'INDI') continue;
      if (opt.share && livingIds.has(r.xref)) continue;
      const end = last(r), tag = lineOf(2, '_ATLAS_EDIT', e.op + ' ' + date);
      if (e.op === 'date') {
        const ev = r.kids.find(k => k.tag === (e.field === 'birth' ? 'BIRT' : 'DEAT')), d = ev && get(ev, 'DATE');
        if (d) {
          if (!opt.apply) { note('skipped', d.ln, null, null, 'a ' + e.field + ' date you changed was not written (Enriched never changes an existing value; use Cleaned): ' + lines[d.ln].trim()); continue; }
          const old = lines[d.ln], nw = old.replace(/^(\s*\d+\s+DATE\s).*$/, (m, a) => a + e.value);
          if (nw !== old) { rep.set(d.ln, nw); note('replace', d.ln, old, [nw], 'date you corrected'); insertAfter(last(d), [(d.lvl + 1) + ' _ORIG ' + d.val], 'the date as it was'); stats.dates = (stats.dates || 0) + 1; }
        } else if (ev) { insertAfter(last(ev), [lineOf(ev.lvl + 1, 'DATE', e.value), lineOf(ev.lvl + 1, '_ATLAS_EDIT', 'date added ' + date)], 'a ' + e.field + ' date you added'); stats.dates = (stats.dates || 0) + 1; }
        else { insertAfter(end, [lineOf(1, e.field === 'birth' ? 'BIRT' : 'DEAT'), lineOf(2, 'DATE', e.value), lineOf(2, '_ATLAS_EDIT', 'date added ' + date)], 'a ' + e.field + ' you added'); stats.dates = (stats.dates || 0) + 1; }
      } else if (e.op === 'note') { insertAfter(end, [...textLines(1, 'NOTE', e.text), tag], 'a note you wrote'); stats.notes = (stats.notes || 0) + 1; }
      else if (e.op === 'source') {
        const k = e.title + '|' + (e.url || ''); let id = srcId.get(k);
        if (!id) { id = fresh(); srcId.set(k, id); srcRecs.push('0 ' + id + ' SOUR', '1 TITL ' + e.title.slice(0, 240), ...(e.url ? textLines(1, 'NOTE', e.url) : []), lineOf(1, '_ATLAS_EDIT', 'source added ' + date)); }
        insertAfter(end, ['1 SOUR ' + id, ...(e.page ? ['2 PAGE ' + e.page.slice(0, 240)] : []), tag], 'a source you added'); stats.sources = (stats.sources || 0) + 1;
      } else if (e.op === 'merge') {
        const o = recs.get(e.other); if (!o || (opt.share && livingIds.has(o.xref))) continue;
        insertAfter(end, ['1 ASSO ' + o.xref, '2 RELA possible duplicate (you marked these two as maybe the same person; nothing was merged)', tag], 'a duplicate hint you marked'); stats.merges = (stats.merges || 0) + 1;
      }
    }
    if (srcRecs.length) { const tr = parsed.nodes.find(n => n.tag === 'TRLR'); if (tr) { ins.set(tr.ln - 1, (ins.get(tr.ln - 1) || []).concat(srcRecs)); note('insert', tr.ln - 1, null, srcRecs, 'the sources you added'); } }
  }

  const walk = (n, depth) => {
    for (const k of n.kids) {
      if (k.tag === 'PLAC' && k.val.trim() && !del.has(k.ln)) place(k, k.lvl + 1);
      else if (k.kids.length) walk(k, depth + 1);
    }
  };
  const place = (n, lvl) => {
    const raw = n.val.trim(), r = ctx.resolve(raw);
    if (!r || !r.place || !EXACT.has(r.tier)) return;
    const pk = ctx.picked(raw);
    if (opt.apply && pk && !n.kids.some(k => k.tag === 'CONC' || k.tag === 'CONT')) {
      const lab = ctx.label(r.place);
      if (lab && lab !== raw) {
        const old = lines[n.ln], nw = old.replace(/^(\s*\d+\s+PLAC\s).*$/, (m, a) => a + lab);
        if (nw !== old) { rep.set(n.ln, nw); note('replace', n.ln, old, [nw], 'place you confirmed on the review screen'); insertAfter(n.ln, [lvl + ' _ORIG ' + raw], 'the text as it was'); stats.applied++; }
      }
    }
    if (opt.coords && !n.kids.some(k => k.tag === 'MAP')) {
      const p = r.place, id = ctx.atlasId(r.place), add = [lvl + ' MAP', (lvl + 1) + ' LATI ' + coord(p.y, 'N', 'S'), (lvl + 1) + ' LONG ' + coord(p.x, 'E', 'W')];
      if (id) add.push(lvl + ' _ATLAS_ID ' + id);
      add.push(lvl + ' _ATLAS_EDIT coordinates ' + date);
      insertAfter(last(n), add, 'coordinates for ' + raw.slice(0, 60) + (ctx.picked(raw) ? ' (your pick)' : ''));
      stats.coords++;
    }
  };
  if (opt.coords || opt.apply) for (const r of parsed.nodes) if (r.tag !== 'HEAD') walk(r, 0);

  if (opt.overlay && opt.overlay.edits.length) applyOverlay();
  for (const i of parsed.report.relinedAt || []) if (i < lines.length && !del.has(i)) note('recode', i, null, [lines[i].slice(0, 100)], 'bytes that were not valid UTF-8 were read as Windows-1252; written as UTF-8');
  if (parsed.report.relinedAt && parsed.report.relinedAt.length) stats.recoded = parsed.report.relinedAt.length;
  // a file that was not UTF-8 is written as UTF-8, and says so
  const used = parsed.report.used || 'utf-8', head = parsed.nodes.find(n => n.tag === 'HEAD');
  const changed = log.length > 0;
  if (changed && !/^utf-8(?: \+ .*)?$/.test(used) && head) {
    const ch = get(head, 'CHAR');
    if (ch) { const old = lines[ch.ln], nw = old.replace(/CHAR\s.*$/, 'CHAR UTF-8'); if (nw !== old) { rep.set(ch.ln, nw); note('replace', ch.ln, old, [nw], 'the file was read as ' + used + '; it is written as UTF-8'); } }
    stats.reencoded = true;
  }
  if (changed && head) insertAfter(last(head), ['1 _ATLAS_EXPORT Roots & Routes (Record Atlas) ' + date + (opt.share ? ' shareable' : opt.apply ? ' cleaned' : ' enriched')], 'marks the file as touched by this tool');

  const out = []; let swept = 0;
  const emit = x => {
    if (sweep && x.length >= 12) { const m = sweep.LINE.exec(x); if (m && !sweep.SKIP.has(m[3])) { sweep.re.lastIndex = 0; if (sweep.re.test(x)) { swept++; x = x.replace(sweep.re, 'Living'); } } }
    out.push(x);
  };
  for (let i = 0; i < lines.length; i++) {
    if (!del.has(i)) emit(rep.has(i) ? rep.get(i) : lines[i]);
    const a = ins.get(i); if (a) for (const x of a) emit(x);
  }
  if (swept) { stats.textRedacted = (stats.textRedacted || 0) + swept; note('redact', -1, null, null, swept + ' more lines had a living person\'s name in them (found in a final sweep of the new file)'); }
  const bom = parsed.bom && /^utf-8/.test(used) ? '﻿' : '';
  const text = bom + out.join(parsed.eol) + (parsed.endsWithEol ? parsed.eol : '');
  return { text, log, stats, changed, lines: out.length, from: lines.length };
}

export function logText(r, mode) {
  const s = r.stats, L = ['Roots & Routes: change log', 'Mode: ' + mode, '', 'Lines in the original: ' + r.from, 'Lines in the new file: ' + r.lines, ''];
  if (!r.changed) return L.concat(['No changes. The new file is identical to the one you gave us.']).join('\n');
  if (s.dates) L.push(s.dates + ' dates you set or corrected.');
  if (s.notes) L.push(s.notes + ' notes you wrote.');
  if (s.sources) L.push(s.sources + ' sources you added.');
  if (s.merges) L.push(s.merges + ' pairs marked as possibly the same person (an ASSO link; nothing merged).');
  if (s.coords) L.push(s.coords + ' places given coordinates (MAP, LATI, LONG) and an _ATLAS_EDIT tag; the place text is unchanged.');
  if (s.applied) L.push(s.applied + ' place texts replaced by a place you confirmed; the old text is kept in _ORIG.');
  if (s.redacted) L.push(s.redacted + ' living people reduced to a bare record; ' + s.famTrimmed + ' family records lost their events and notes.');
  if (s.textRedacted) L.push(s.textRedacted + ' lines of notes or source text mentioned a living person by name; the name is replaced by "Living".');
  if (s.recoded) L.push(s.recoded + ' lines held bytes that were not valid UTF-8 (usually Windows-1252 accents); they are written as UTF-8.');
  if (s.reencoded) L.push('The text encoding was changed to UTF-8.');
  if (s.redacted) L.push('Names are matched as "Given Surname" in notes and source text. A living person written some other way (a nickname, "Mrs J. Smith", "my cousin") is not found: read your notes before you share.');
  L.push('', 'Every change, by line number in the original:');
  for (const e of r.log) L.push('  ' + (e.line > 0 ? 'line ' + e.line : 'new file') + ' · ' + e.op + (e.old ? ' · was: ' + e.old : '') + (e.new ? ' · now: ' + e.new.join(' / ') : '') + ' · ' + e.why);
  return L.join('\n');
}
