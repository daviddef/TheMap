/* PLACES TO REVIEW, as a checklist: every place text the Atlas could not settle exactly, with the candidates it found, and who and what uses it. The rows are the same ones
   Roots & Routes' "Places to review" tab draws (Session.review: every text whose tier is not an exact match), joined to the people and events that use each text (the fix
   list's own walk, checklist.js eventsByPlace) and to the Atlas's help for a place (enrich.js), and shaped like the fix list's (groups of sections of rows, each row keyed) so
   the Tree Canvas's Fix list can draw them with the same page.

   IT IS A LIST TO WORK DOWN IN THE TREE THE VISITOR KEEPS ELSEWHERE, NOT A PLACE TO EDIT. Nothing here picks a candidate, changes how a place is drawn or writes anything into the
   file: each row offers the text and the Atlas's candidates to copy, the people to open in the visitor's own tree, and a tick or "left as is", kept like every other fix-list
   decision. A row's key is `d|<place text>`: the key Roots & Routes' fix list already uses for the same text in its "Places to decide" section, so a decision made in either
   list is the same decision. No DOM, no network, no storage. */
import { REAL } from './resolver.js';

export const PEOPLE_CAP = 200;   // people listed per place text; the row says how many events there are in all

/* the tiers, in Roots & Routes' order, with its plain words for each */
export const TIERS = [
  ['ambiguous', 'Could be several places', 'More than one candidate and nothing in the text to choose between them. Copy the candidate your sources support into your tree.'],
  ['review-skipped-part', 'Matched only a later part', 'The first part of the text was not found; a later part (usually the town) was. Check it is the place meant.'],
  ['review-other-country', 'Found in a different country', 'The name exists, but not in the country the text names. Often an old name or a spelling; never accepted without you.'],
  ['not-found', 'Not found', 'No place of that name in the gazetteer. Old names, typos, house names and things that are not places end up here.'],
  ['parent-level', 'Drawn at the town only', 'The exact spot was not found; the town in the text is used.'],
  ['district', 'Drawn at the district only', 'The most specific part of the text is a municipality or county; people are drawn at its centre.'],
  ['region', 'Drawn at the region only', 'A province or county, so people are drawn at its centre and marked as such.'],
  ['country-only', 'Drawn at the country only', 'Only a country was given.'],
];
export const NEEDS = ['ambiguous', 'review-skipped-part', 'review-other-country', 'not-found'];   // the four a visitor can act on: Roots & Routes' badge counts exactly these
export const WITH_CANDIDATES = ['ambiguous', 'review-skipped-part', 'review-other-country'];
export const PLACE_GROUPS = [
  { key: 'choose', title: 'Choose a place', how: 'The text could be several places. Copy the one your sources support, open the people who use it in your own tree and correct the text there.', sections: ['ambiguous', 'review-skipped-part', 'review-other-country'] },
  { key: 'find', title: 'Find a place', how: 'No place of that name is in the gazetteer. Try a nearby spelling, look it up by hand, or leave it as written.', sections: ['not-found'] },
  { key: 'coarse', title: 'Drawn less exactly than the text says', how: 'The Atlas drew these at a town, a district, a region or a country, because the exact spot was not found. Often right; they are listed so you can see them.', sections: ['parent-level', 'district', 'region', 'country-only'] },
];
export const NEXT = {
  pick: 'Copy the candidate your sources support (a second record naming the same parish or county settles most) into your own tree, or leave the text as written.',
  'not-found': 'Look the place up by hand, or try a nearby spelling. If the text is right as written, press “Leave as is”.',
  coarse: 'Nothing to do unless you know the exact place: then correct the text in your own tree.',
};
const plain = (c, label) => ({ n: c.n, region: c.region || null, k: c.k, p: c.p || 0, y: c.y, x: c.x, label: label(c) });

/* env: { mentions: Map raw -> count, res: Map raw -> resolution, events: Map raw -> {count, people} (checklist.js eventsByPlace), living: bool,
          likely (likely.js makeLikely, optional), label(place) -> string, enrich(sections) (enrich.js: adds .info to each item) }
   -> { sections: [{ key, title, how, place: true, items }], groups, counts, hidden } */
export function buildPlaceReview(env) {
  const by = new Map(TIERS.map(t => [t[0], []])); let hidden = 0;
  for (const [raw, count] of env.mentions) {
    const r = env.res.get(raw); if (!r || REAL.has(r.tier)) continue;
    const list = by.get(r.tier); if (!list) continue;
    const ev = env.events.get(raw), people = ev ? ev.people : [];
    if (!env.living && !people.length) { hidden++; continue; }   // a text only a hidden living person uses is not shown at all
    list.push({ key: 'd|' + raw, raw, tier: r.tier, count, iso: r.iso || null, events: ev ? ev.count : 0, people: people.slice(0, PEOPLE_CAP), cands: (r.cands || []).map(c => plain(c, env.label)) });
  }
  const sections = TIERS.map(([key, title, how]) => ({ key, title, how, place: true, items: by.get(key).sort((a, b) => a.raw.localeCompare(b.raw, 'en')) }));
  /* the Atlas's help: for a text with candidates or none, what the Atlas knows by that name and each candidate's page (the fix list's "decide" help); for a text drawn at a town, that place's page */
  for (const s of sections) {
    if (!s.items.length) continue;
    const like = s.key === 'parent-level' ? 'places' : WITH_CANDIDATES.includes(s.key) || s.key === 'not-found' ? 'decide' : null;
    let tmp = [];
    if (like) { tmp = s.items.map(i => ({ ...i, cands: i.cands.map(c => c.label), candPlaces: i.cands.map(c => ({ n: c.n, k: c.k, y: c.y, x: c.x })) })); env.enrich({ sections: [{ key: like, items: tmp }] }); }
    /* a suggested candidate where the people who use the text, and their relatives, are firmly recorded (likely.js): the first five candidates, as the fix list judges them. Suggestion only. */
    if (env.likely && WITH_CANDIDATES.includes(s.key)) for (const i of s.items) {
      const L = env.likely.likely(i.raw, i.cands.slice(0, 5)); if (!L) continue;
      if (L.idx !== undefined) i.likely = { idx: L.idx, reason: L.reason }; else i.noNeighbours = true;
    }
    s.items.forEach((i, n) => { i.info = tmp[n] ? tmp[n].info : []; i.next = WITH_CANDIDATES.includes(s.key) ? NEXT.pick : s.key === 'not-found' ? NEXT['not-found'] : NEXT.coarse; });
  }
  return { sections, groups: PLACE_GROUPS.map(g => ({ key: g.key, title: g.title, how: g.how, sections: g.sections })), counts: Object.fromEntries(sections.map(s => [s.key, s.items.length])), hidden };
}
