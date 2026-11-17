#!/usr/bin/env node
/* Does a tree.json built elsewhere open on the Tree Canvas, and is the living rule applied to it?
 *
 *   node scripts/test-tree-json.mjs            (the reader tests always run; the end-to-end test needs site/public/roots/data, built by
 *                                               python3 scripts/build-roots-data.py, or RECORD_ATLAS_ROOTS=<a roots folder> to use another copy)
 *
 * The family below is invented. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTreeJson, placeMentions, siteOf } from '../site/public/roots/js/treejson.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.dirname(HERE);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL  ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));

const FAMILY = {
  meta: { title: 'Kovač family', site: 'https://kovac.example.org', source: 'ignored' },
  people: [
    { id: 'a1', sex: 'm', given: 'Josip', sur: 'Kovač', by: 1851, dy: 1923, bp: 'Kastav, Croatia', dp: 'Rijeka, Croatia', bd: '1851-03-02', page: '/people/josip-kovac/', cx: 2, spouse: ['a2'], kids: ['a3'],
      route: [['Kastav, Croatia', 1851, 0], ['Rijeka, Croatia', 1880, 1]], srcs: [{ t: 'Baptism register', u: 'https://example.org/b' }, { t: 'Odd', u: 'javascript:alert(1)' }] },
    { id: 'a2', sex: 'f', given: 'Marija', sur: 'Kovač', by: 1855, dy: 1930, bp: 'Rijeka, Croatia', spouse: ['a1'], kids: ['a3'] },
    { id: 'a3', sex: 'm', given: 'Ivan', sur: 'Kovač', by: 1880, dy: 1960, bp: 'Rijeka, Croatia', dp: 'Brisbane, Australia', father: 'a1', mother: 'a2', kids: ['a4', 'ghost'] },
    { id: 'a4', sex: 'f', given: 'Ana', sur: 'Kovač', by: 1925, bp: 'Brisbane, Australia', father: 'a3', bd: '1925-06-01', page: '/people/ana/', cx: 1 },
    { id: 'a5', sex: 'm', given: 'Petar', sur: 'Kovač', by: 1990, bp: 'Sydney, Australia', father: 'a4' },
    { id: 'a6', sex: 'f', given: 'Lena', sur: 'Kovač', by: 1950, dy: 1951, bp: 'Brisbane, Australia', living: true },
  ],
};

/* ---- the reader ---- */
{
  const bad = [
    ['{not json', /not valid JSON/], ['[1,2]', /bare list/], ['{"a":1}', /no "people" list/], ['{"people":[]}', /empty/], ['{"people":[{"given":"x"}]}', /unique "id"/],
  ];
  for (const [t, re] of bad) { const r = readTreeJson(t); ok(!r.ok && re.test(r.error), 'bad file says so plainly: ' + t + ' -> ' + (r.error || 'accepted')); }

  const r = readTreeJson(JSON.stringify(FAMILY));
  ok(r.ok, 'the invented family reads');
  const P = new Map(r.tree.people.map(p => [p.id, p]));
  eq(r.tree.meta.source, 'tree.json', 'source is set by the reader, not the file');
  eq(r.tree.meta.site, 'kovac.example.org', 'site is a host only');
  eq(P.get('a1').page, '/people/josip-kovac/', 'a page path is kept when the file names its site');
  eq(P.get('a1').srcs.map(s => s.u), ['https://example.org/b', ''], 'only https source links survive');
  eq(P.get('a3').kids, ['a4'], 'a link to someone not in the file is dropped');
  eq(r.notes.brokenLinks, 1, 'and counted');
  eq(P.get('a4').mother, null, 'no mother invented');
  ok(P.get('a3').father === 'a1' && P.get('a1').kids.includes('a3') && P.get('a4').father === 'a3', 'family links agree');
  ok(P.get('a2').kids.includes('a3'), "a parent's kids list gains the child who names them");

  /* the living rule: 1990 with no death, and the one flagged living, are cards with a name and a family only; 1925 with no death is also after 1920 */
  for (const id of ['a4', 'a5', 'a6']) {
    const p = P.get(id);
    ok(p.living === true && p.by === undefined && p.dy === undefined && !p.bp && !p.bd && !p.page && !p.cx && !(p.srcs && p.srcs.length) && !p.occ, id + ' is a name-and-family card only');
    ok(p.given && p.sur, id + ' keeps the name');
  }
  eq(P.get('a4').father, 'a3', 'a living card keeps its family');
  eq(r.notes.living, 3, 'three living cards counted');
  ok(P.get('a1').living !== true && P.get('a3').living !== true, 'the dead are not touched');

  /* a dead-but-estimated death year born after 1920 is treated as living */
  const e = readTreeJson(JSON.stringify({ people: [{ id: 'x', given: 'A', sur: 'B', by: 1950, dy: 2001, dye: true }] }));
  ok(e.tree.people[0].living === true, 'an estimated death year does not release someone born after 1920');

  /* no site named: page links are ignored and the reader says so */
  const n = readTreeJson(JSON.stringify({ people: [{ id: 'x', given: 'A', sur: 'B', by: 1800, dy: 1850, page: '/p/' }] }));
  eq(n.tree.people[0].page, '', 'a page link needs meta.site');
  ok(n.notes.pageDropped === 1, 'and the visitor is told');

  /* unsafe inputs */
  const u = readTreeJson(JSON.stringify({ people: [{ id: 'x', given: '<img onerror=1>', sur: 'S', by: 1800, dy: 1850, page: 'https://evil.example/', bd: '<script>' }, { id: 'x', given: 'dup' }, { given: 'noid' }] }));
  eq(u.tree.people.length, 1, 'a repeated id and an entry with no id are skipped');
  eq(u.tree.people[0].page, '', 'an absolute page address is refused');
  eq(u.tree.people[0].bd, '', 'a date that is not a date is dropped');
  eq(siteOf('http://plain.example'), '', 'http sites are refused');
  eq(siteOf('https://user:pw@evil.example'), '', 'credentials in a site are refused');
  eq(siteOf('https://ok.example.org/path'), 'ok.example.org', 'a path is cut to the host');

  eq([...placeMentions(r.tree).keys()].sort(), ['Brisbane, Australia', 'Kastav, Croatia', 'Rijeka, Croatia'], 'places are read from the dead only, birth, death and route');
}

/* ---- end to end: the same Atlas files the page reads, then the canvas's own corpus builder ---- */
{
  const roots = process.env.RECORD_ATLAS_ROOTS || path.join(ROOT, 'site', 'public', 'roots');
  if (!fs.existsSync(path.join(roots, 'data', 'atlas.json'))) console.log('skip  end-to-end (no ' + path.join(roots, 'data', 'atlas.json') + ')');
  else {
    const { Session } = await import('../site/public/roots/js/pipeline.js');
    const fl = fs.existsSync(path.join(ROOT, 'site', 'public', 'fl')) ? path.join(ROOT, 'site', 'public', 'fl') : path.join(roots, '..', 'fl');
    const io = { json: async p => JSON.parse(fs.readFileSync(path.join(roots, p), 'utf8')), flag: async id => fs.readFileSync(path.join(fl, id + '.svg'), 'utf8') };
    const s = new Session(io, () => {});
    const out = await s.loadTree(new TextEncoder().encode(JSON.stringify(FAMILY)));
    const T = out.tree, P = new Map(T.people.map(p => [p.id, p]));
    ok(out.kind === 'tree', 'the session says it read a tree.json');
    ok(P.get('a1').bp && /Kastav/.test(P.get('a1').bp), 'Kastav is placed');
    ok(out.atlas.places.length >= 2 && out.atlas.places.some(p => p.cn === 'HR') && out.atlas.places.some(p => p.cn === 'AU'), 'places carry their countries (HR, AU)');
    ok(out.atlas.places.every(p => p.fl.length), 'each place has a flag timeline');
    ok(!out.atlas.places.some(p => /Sydney/.test(p.n)), "the living person's birth place is not looked up or drawn");
    /* bare names, as Roots & Routes writes them: "Mascali" means nothing alone, so the file's own place table (name, coordinates, country) places it; the flag still comes from the Atlas */
    const bare = { meta: { title: 'Bare names' }, places: [{ n: 'Mascali', lat: 37.756, lon: 15.2, cn: 'Italy' }, { n: 'Brisbane', lat: -27.469, lon: 153.024, cn: 'AU' }, { n: 'Nowhere', lat: 99, lon: 0, cn: 'Italy' }, { n: '<img src=x onerror=1>', lat: 1, lon: 1, cn: 'Atlantis' }],
      people: [{ id: 'b1', given: 'A', sur: 'B', sex: 'm', by: 1850, dy: 1900, bp: 'Mascali', dp: 'Brisbane' }, { id: 'b2', given: 'C', sur: 'B', sex: 'f', by: 1850, dy: 1900, bp: 'Nowhere' }] };
    const b = await new Session(io, () => {}).loadTree(new TextEncoder().encode(JSON.stringify(bare)));
    ok(b.atlas.places.some(p => p.n === 'Mascali' && p.cn === 'IT') && b.atlas.places.some(p => p.n === 'Brisbane' && p.cn === 'AU'), "a place the file already placed keeps that place (country name or code)");
    ok(b.atlas.places.every(p => p.fl.length) && b.atlas.flags.length > 0, 'its flags come from the Atlas, not from the file');
    ok(!JSON.stringify(b.atlas).includes('onerror'), 'nothing from the file is passed on as markup');
    ok(b.tree.people.find(p => p.id === 'b2').unplaced === true, 'an impossible coordinate is ignored, and the place is looked up by its text (here, not found)');
    const living = JSON.stringify(P.get('a5')) + JSON.stringify(P.get('a6'));
    ok(!/Sydney|1990|1950/.test(living), 'nothing of the living is in what the canvas receives');
    /* the canvas's own corpus builder (Tree Canvas/src/js/fromtree.js); TC_FROMTREE points at it when this checkout is not beside the Tree Canvas folder */
    const { createRequire } = await import('node:module');
    const cand = process.env.TC_FROMTREE || path.join(ROOT, '..', 'Tree Canvas', 'src', 'js', 'fromtree.js');
    const fromtree = fs.existsSync(cand) ? createRequire(import.meta.url)(cand) : null;
    if (fromtree && fromtree.corpus) {
      const c = fromtree.corpus(T, out.atlas);
      ok(c.archives.length === 1 && c.archives[0].k === 'you', "the canvas calls it the visitor's own, never an archive");
      ok(c.archives[0].host === 'kovac.example.org', 'the owner\'s site is the host for page links');
      const row = id => c.people.find(r => r[1] === id);
      ok(row('a1')[15] === '/people/josip-kovac/' && row('a1')[24] === 2, 'page link and corrections count reach the canvas');
      ok(row('a1')[23] === '' && row('a1')[22] === '1851-03-02', 'full birth date reaches the canvas');
      ok(row('a5')[5] === null && row('a5')[15] === '', 'a living card reaches the canvas with no date and no page');
      ok((row('a5')[17] & 8) === 8, 'a living card is flagged living (bit 8)');
    } else console.log('skip  canvas corpus (fromtree.js not found)');
  }
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
