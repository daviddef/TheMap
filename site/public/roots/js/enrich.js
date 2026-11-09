/* The Atlas's help for the fix list: for each row, where to look, what was happening, what else the file holds about the person, how the name
   might be written, and a suggested next step. Everything comes from data already on this page (atlas.json, the catalogues, the page index) and
   from the visitor's own file; nothing is looked up elsewhere and nothing is sent. Where the Atlas has nothing the row says so in plain words;
   nothing is inferred for a place it does not hold. No DOM, no network.

   A line is { k: label, t: text, l: [{ t, u }] (links), none: true when this is a statement that the Atlas has nothing }.
   A path starting with / is a page of this site; anything else is another site's page. */
import { norm } from './resolver.js';
import { inside } from './atlas.js';

const yr = v => { const m = /\b(\d{4})\b/.exec(v || ''); return m ? +m[1] : null; };
const fold = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const ANCESTRY_SITES = ['com.au', 'com', 'co.uk', 'ca'];
export const slugSurname = x => String(x).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const span = (a, b) => (a === b || b === null || b === undefined ? String(a) : a + '–' + b);
const list = (a, n = 6) => a.slice(0, n).join(', ') + (a.length > n ? ' and ' + (a.length - n) + ' more' : '');
const NONE = (k, t) => ({ k, t, none: true });

/* env: { core: AtlasCore, pages: { surnames: [slug], countries: [cc], flags: { cc: '/flags/…/' } }, given: [{ id, name, m: [[form, status]] }],
          sur: [{ id, name, m: [[form, status]] }], target(raw) -> { name, lat, lon, iso, region } | null, P, shown(p), keep(p), est } */
export function makeEnricher(env) {
  const { core, P, shown } = env, C = core.c;
  const sPages = new Set(env.pages && env.pages.surnames || []), cPages = new Set(env.pages && env.pages.countries || []), fPages = (env.pages && env.pages.flags) || {};
  const gMap = new Map(), sMap = new Map();
  for (const g of env.given || []) for (const [form] of g.m) gMap.set(fold(form), g);
  for (const f of env.sur || []) for (const [form] of f.m) sMap.set(fold(form), f);
  const anc = ANCESTRY_SITES.includes(env.ancestry) ? env.ancestry : 'com.au';
  const cname = cc => (C.countries[cc] || [cc])[0];
  const countryLinks = cc => {
    const l = []; if (cPages.has(cc)) l.push({ t: cname(cc) + ' in the Atlas', u: '/country/' + cc.toLowerCase() + '/' });
    if (fPages[cc]) l.push({ t: 'its flags', u: fPages[cc] }); return l;
  };
  const provName = k => C.prov[k] || '';
  const eraAt = (rid, y) => {
    if (!rid) return null; const es = C.regions[rid].eras;
    for (const e of es) if (e[0] <= y && y < e[1]) return e; return y >= es[es.length - 1][1] ? es[es.length - 1] : null;
  };
  const memo = new Map();

  /* ---- a place, as the Atlas holds it, for the years the events fall in ---- */
  function placeLines(raw, years, o = {}) {
    const key = raw + '|' + years.join(',') + '|' + (o.short ? 's' : '') + (o.noRecords ? 'n' : ''); if (memo.has(key)) return memo.get(key);
    const out = [], t = env.target(raw); let res = out;
    if (!t) { res.push(NONE('Place', 'The Atlas could not pin “' + raw + '” to one place, so it has no records, rulers or flags to offer for it. Settle the place first.')); memo.set(key, res); return res; }
    const ap = core.match(t.name, t.iso, t.lat, t.lon), cc = t.iso, gaps = [];
    const where = [t.name, t.region && t.region !== t.name ? t.region : '', cname(cc)].filter(Boolean).join(', ');
    const wl = []; if (ap) wl.push({ t: 'the place in the Atlas', u: '/place/' + ap[0] + '/' }); wl.push(...countryLinks(cc));
    res.push({ k: 'Place', t: where + (ap ? '' : ' (the Atlas has not surveyed this one)'), l: wl });
    if (ap) {
      const other = [...(ap[5] || []).filter(n => norm(n) !== norm(ap[1])), ...(ap[8] || []).map(([f, to, n]) => n + ' (' + (f && to ? f + '–' + to : f ? 'from ' + f : 'until ' + to) + ')')];
      if (other.length) res.push({ k: 'Also written', t: list(other, 8) }); else gaps.push('other names');
    } else gaps.push('a place page', 'other names');
    const ys = years.filter(Boolean).sort((a, b) => a - b), lo = ys[0], hi = ys[ys.length - 1];
    if (lo !== undefined) {
      const rid = core.regionOf(t.lat, t.lon), pts = lo === hi ? [lo] : [lo, hi];
      if (!rid) gaps.push('a record region for this spot, so no ruler by date'); else {
        const groups = new Map();
        for (const y of pts) { const e = eraAt(rid, y); if (!e) continue; const sig = e[2] + '|' + e[0]; const g = groups.get(sig); if (g) g.ys.push(y); else groups.set(sig, { e, ys: [y] }); }
        if (!groups.size) gaps.push('a ruler for this spot in ' + span(lo, hi));
        for (const { e, ys: yy } of groups.values()) {
          const iso = C.riso[e[2]], reg = C.regimes[e[2]] || {}, fl = [];
          if (iso && fPages[iso]) fl.push({ t: 'the flag of the day', u: fPages[iso] });
          res.push({ k: 'In ' + span(yy[0], yy[yy.length - 1]), t: (e[3] || reg.label || e[2]) + ' (' + e[0] + '–' + e[1] + ').' + (e[6] ? ' ' + e[6] : ''), l: fl });
          const fu = (e[5] || []).map(provName).filter(Boolean); if (fu.length && !o.short) res.push({ k: 'Archives of the day', t: 'Records of those years are filed with: ' + list(fu, 5) + '.' });
        }
      }
      if (!o.short) {
        const evs = []; for (const ev of C.events) { if (ev.t < lo || ev.f > hi) continue; if (!ev.g && !(ev.poly && ev.poly.some(r => inside(t.lat, t.lon, r)))) continue; evs.push(ev); }
        if (evs.length) res.push({ k: 'Happening then', t: list(evs.sort((a, b) => a.f - b.f).map(ev => ev.n + ' (' + span(ev.f, ev.t) + ')'), 4) });
      }
    } else gaps.push('a date on these events, so no ruler, flag or events by year');
    if (!o.noRecords && !o.short) {
      if (ap) {
        const hit = lo === undefined ? ap[6] : ap[6].filter(c => (c[2] === null || c[2] <= hi) && (c[3] === null || lo <= c[3]));
        if (hit.length) res.push({ k: 'Records', t: hit.length + ' collection' + (hit.length === 1 ? '' : 's') + (lo === undefined ? '' : ' for ' + span(lo, hi)) + ': ' + list(hit.map(c => c[0] + (provName(c[4]) ? ' (' + provName(c[4]) + ')' : '')), 3), l: hit.slice(0, 3).filter(c => /^https?:\/\//.test(c[1])).map(c => ({ t: c[0].slice(0, 40), u: c[1] })) });
        else if (ap[6].length) res.push(NONE('Records', 'The Atlas lists ' + ap[6].length + ' collection' + (ap[6].length === 1 ? '' : 's') + ' for this place, none covering ' + span(lo, hi) + '.'));
        else gaps.push('online record collections for this place');
        if (ap[7] && ap[7].length) res.push({ k: 'Not photographed', t: ap[7].length + ' volume' + (ap[7].length === 1 ? ' is' : 's are') + ' catalogued but not online: ' + list(ap[7].map(c => c[0]), 2) + '.' });
      } else gaps.push('record collections for this place');
    }
    if (gaps.length && !o.short) res.push(NONE('Atlas has no', gaps.join('; ') + '.'));
    memo.set(key, res); return res;
  }

  /* ---- a person: the file's own facts, the name's family, the birthplace ---- */
  function nameLinks(p) {
    const nl = {}, g = (p.given || '').split(/\s+/)[0];
    if (g) nl.given = { t: g, u: '/your-name/?n=' + encodeURIComponent(g) };
    if (p.sur) nl.sur = { t: p.sur, u: sPages.has(slugSurname(p.sur)) ? '/surname/' + slugSurname(p.sur) + '/' : '/your-name/?s=' + encodeURIComponent(p.sur) };
    return nl;
  }
  function nameLines(p) {
    const out = [], g = (p.given || '').split(/\s+/)[0];
    if (p.sur) {
      const f = sMap.get(fold(p.sur)), links = [{ t: p.sur + ' in Say your name', u: '/your-name/?s=' + encodeURIComponent(p.sur) }];
      if (sPages.has(slugSurname(p.sur))) links.push({ t: 'the ' + p.sur + ' page', u: '/surname/' + slugSurname(p.sur) + '/' });
      if (f) {
        const same = f.m.filter(([x, s]) => (s === 'same' || s === 'attested') && fold(x) !== fold(p.sur)).map(([x]) => x), tries = f.m.filter(([x, s]) => (s === 'rule' || s === 'lead') && fold(x) !== fold(p.sur)).map(([x]) => x);
        out.push({ k: 'Surname', t: p.sur + ' is in the Atlas family “' + f.name + '”' + (same.length ? '. One name, met on records as: ' + list(same, 8) : '') + (tries.length ? '. Worth searching, not yet seen: ' + list(tries, 6) : '') + '.', l: links });
      } else out.push(NONE('Surname', p.sur + ' is not in the Atlas’s catalogue of spelling families, so no variants are recorded for it. Say your name still searches it.')); out[out.length - 1].l = links;
    }
    if (g) {
      const f = gMap.get(fold(g)), links = [{ t: g + ' in Say your name', u: '/your-name/?n=' + encodeURIComponent(g) }];
      if (f) {
        const o = f.m.filter(([x, st]) => st !== 'lead' && fold(x) !== fold(g)).map(([x]) => x), tr = f.m.filter(([x, st]) => st === 'lead' && fold(x) !== fold(g)).map(([x]) => x);
        out.push({ k: 'First name', t: g + ' is the family “' + f.name + '”' + (o.length ? ': also written ' + list(o, 10) : '') + (tr.length ? '. Worth searching, not yet seen on a record: ' + list(tr, 6) : '') + ' (registers use the local form).', l: links });
      }
      else out.push({ ...NONE('First name', g + ' is not in the Atlas’s catalogue of first-name equivalents.'), l: links });
    }
    return out;
  }
  /* Outside search links for people, as ONE short line. Plain links: nothing is sent until the visitor clicks, and a click gives that site a name.
     Never for a person who may be living: they get no link at all. WikiTree: the surname index for the surname and each spelling the Atlas has
     seen on a record (its person search takes a POST, so it cannot be filled from a link). Ancestry: a search by first_last on the chosen regional site. */
  function searchLine(people) {
    const l = [], seen = new Set();
    for (const p of people) {
      if (!p || p.liv) continue;
      const first = (p.given || '').trim().split(/\s+/)[0], sur = (p.sur || '').trim(), us = x => x.toLowerCase().replace(/\s+/g, '_');
      if (first && sur) { const q = encodeURIComponent(us(first) + '_' + us(sur)); if (!seen.has('a' + q)) { seen.add('a' + q); l.push({ t: 'Ancestry: ' + first + ' ' + sur, u: 'https://www.ancestry.' + anc + '/search?name=' + q }); } }
      if (sur) {
        const fam = sMap.get(fold(sur)), forms = [sur, ...(fam ? fam.m.filter(([x, st]) => (st === 'same' || st === 'attested') && fold(x) !== fold(sur)).map(([x]) => x) : [])].slice(0, 5);
        for (const f of forms) { const k = f.toUpperCase().replace(/\s+/g, '_'); if (!seen.has('w' + k)) { seen.add('w' + k); l.push({ t: 'WikiTree: ' + f.toUpperCase(), u: 'https://www.wikitree.com/genealogy/' + encodeURIComponent(k) }); } }
      }
    }
    return l.length ? [{ k: 'Search elsewhere', t: 'outside sites: user-submitted trees and paywalled records. Leads to check, not evidence.', l, outside: true }] : [];
  }
  const rel = id => (id && P.get(id) ? shown(P.get(id)) : '');
  function lifeLines(p) {
    const bits = [], miss = [], b = p.by !== null && p.by !== undefined;
    bits.push(b ? 'born ' + (env.est.has(p.id) ? 'about ' : p.byApprox ? 'about ' : '') + p.by + (env.est.has(p.id) ? ' (estimated from relatives)' : '') + (p.bpRaw ? ' at ' + p.bpRaw : '') : 'no birth year' + (p.bpRaw ? ' (born at ' + p.bpRaw + ')' : ''));
    if (!b) miss.push('a birth year'); if (!p.bpRaw) miss.push('a birth place');
    if (p.dy !== null && p.dy !== undefined && !(env.dest && env.dest.has(p.id))) bits.push('died ' + p.dy + (p.dpRaw ? ' at ' + p.dpRaw : '')); else if (!p.liv) miss.push('a death year');
    const par = [p.father && 'father ' + rel(p.father), p.mother && 'mother ' + rel(p.mother)].filter(Boolean);
    if (par.length) bits.push(par.join(', ')); else miss.push('parents');
    const sp = (p.spouse || []).map(rel).filter(Boolean); if (sp.length) bits.push('spouse ' + list(sp, 3)); else miss.push('a spouse');
    if ((p.kids || []).length) bits.push((p.kids.length) + ' child' + (p.kids.length === 1 ? '' : 'ren'));
    const out = [{ k: 'In your file', t: bits.join('; ') + '.' }]; if (miss.length) out.push({ k: 'Missing', t: list(miss, 6) + '.' });
    return out;
  }
  /* the person's whole help block; o.birth false leaves out the birthplace (the row already shows it) */
  function personLines(p, o = {}) {
    const out = [...lifeLines(p), ...nameLines(p)];
    if (o.birth !== false && p.bpRaw) {
      const ys = p.by !== null && p.by !== undefined ? [p.by] : [], pl = placeLines(p.bpRaw, ys, { noRecords: !!o.noRecords }).map(x => ({ ...x, k: x.k === 'Place' ? 'Birthplace' : x.k }));
      out.push(...pl);
    }
    return out;
  }

  const NEXT = {
    places: 'In your own tree, open each person listed, edit the event and paste the standard form (copy button). One paste per event.',
    check: 'Look at the date and the source for one event. If the suggestion is the name used at the time, paste it; if the text was right for its day, leave it and note the modern name.',
    decide: 'Pick the candidate your sources support (a second record naming the same parish or county settles most), paste it, or leave it as written.',
    ages: 'Optional: write the name the place had at the time (the “Also written” names on its Atlas page), or keep today’s name. The maps already draw the flag of the day.',
    years: 'Look for a baptism, marriage, census or gravestone that gives a year. Try the name spellings and first-name forms below.',
    names: 'The relatives shown are the way in: look for the record that names this person (a baptism, a marriage, a will).',
    leads: 'Search the collections listed for the baptism and the parents, using each spelling of the surname below.',
    dates: 'Open both people and compare the source behind each date. One is usually a typo, a different person, or an estimate written as fact.',
    suspect: 'Open the person and test each reason against its source. If the file is right, press “Leave as is”.',
    dupes: 'Compare parents, places and sources. Merge in your own tree only if they agree; if not, keep them apart and note why.',
    apart: 'Look for a parent, spouse or child who joins this group to the main tree: the first named person is the place to start.',
  };

  /* Adds i.next, i.info (lines) and i.nl (name links) to every item. */
  function enrich(out) {
    for (const s of out.sections) for (const i of s.items) {
      i.next = NEXT[s.key] || '';
      const yearsOf = ppl => [...new Set((ppl || []).map(x => yr(x.date)).filter(Boolean))];
      if (s.key === 'places' || s.key === 'check') i.info = placeLines(i.raw, yearsOf(i.people));
      else if (s.key === 'decide') {
        const ys = yearsOf(i.people), info = [];
        const first = i.raw.split(',')[0].trim(), same = (core.byName.get(norm(first)) || []).slice(0, 3);
        for (const ap of same) info.push({ k: 'Atlas knows it as', t: '“' + first + '” is a recorded name of ' + ap[1] + ', ' + cname(ap[2]) + (norm(ap[1]) === norm(first) ? '' : ' (its name today is ' + ap[1] + ')'), l: [{ t: 'the place in the Atlas', u: '/place/' + ap[0] + '/' }, ...countryLinks(ap[2])] });
        for (const c of i.candPlaces || []) {
          const ap = core.match(c.n, c.k, c.y, c.x), l = [...(ap ? [{ t: 'the place in the Atlas', u: '/place/' + ap[0] + '/' }] : []), ...countryLinks(c.k)];
          info.push({ k: 'Candidate', t: i.cands[(i.candPlaces || []).indexOf(c)] + (ap ? '' : ' (not surveyed by the Atlas)'), l });
        }
        if (!info.length) info.push(NONE('Atlas', 'The Atlas has no candidate and does not know “' + first + '” as an older name. Look it up by hand, and check the spelling against the person’s other places.'));
        if (ys.length) info.push({ k: 'Dates on these events', t: span(Math.min(...ys), Math.max(...ys)) + ': pick the candidate whose country held that ground then.' });
        i.info = info;
      } else if (s.key === 'ages') {
        i.info = [{ k: 'Country today', t: i.country, l: countryLinks(Object.entries(C.countries).find(([, v]) => v[0] === i.country)?.[0] || '') }, { k: 'In the Atlas', t: 'Shows ' + i.label + ' for ' + span(i.from, i.to) + '.' }];
      } else if (s.key === 'dupes') {
        const a = P.get(i.a), b = P.get(i.b); i.info = [];
        if (a && b) { i.info.push(...searchLine([a, b])); i.info.push(...nameLines(a).filter(x => x.k === 'Surname')); for (const p of [a, b]) if (p.bpRaw) i.info.push(...placeLines(p.bpRaw, p.by === null ? [] : [p.by], { short: true }).slice(0, 1).map(x => ({ ...x, k: shown(p) + ' born at' }))); }
      } else if (s.key === 'apart') i.info = [];
      else if (i.id && P.get(i.id)) {
        const p = P.get(i.id); i.nl = nameLinks(p);
        i.info = personLines(p, { noRecords: s.key === 'leads' });         // a lead's collections are already in its row
        if (s.key !== 'names' || p.sur) i.info.push(...searchLine(s.key === 'names' ? [{ ...p, given: '' }] : [p]));
      }
      if (!i.info) i.info = [];
    }
    return out;
  }
  return { enrich, placeLines, personLines, nameLines, nameLinks };
}
