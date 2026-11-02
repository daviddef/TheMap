/* "Look this person up elsewhere": search links for other sites, built from a person's name, years and places. The page makes no request itself:
   these are plain links the visitor chooses to open in a new tab, and nothing leaves the device until they click one. No DOM, no network. */

const enc = encodeURIComponent, plus = s => enc(s).replace(/%20/g, '+');
const yr = y => (Number.isFinite(y) ? String(y) : '');

/* q: { first, last, by, dy, bp, dp } (years are numbers or null, places are the file's own text). Returns [{ site, note, url }] A to Z by site. */
export function searchLinks(q) {
  const first = (q.first || '').trim(), last = (q.last || '').trim(), by = yr(q.by), dy = yr(q.dy), bp = (q.bp || '').trim(), dp = (q.dp || '').trim();
  if (!first && !last) return [];
  const full = [first, last].filter(Boolean).join(' '), under = [first, last].filter(Boolean).join('_').replace(/\s+/g, '_');
  const P = (base, o) => base + '?' + Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => k + '=' + (k === 'names' ? plus(v) : enc(v))).join('&');
  const out = [
    { site: 'Ancestry', note: 'records and public trees (a free account may be needed to see results)', url: P('https://www.ancestry.com/search/', { name: under, birth: by, death: dy }) },
    { site: 'FamilySearch records', note: 'historical records, free with an account', url: P('https://www.familysearch.org/search/record/results', { 'q.givenName': first, 'q.surname': last, 'q.birthLikeDate.from': by, 'q.birthLikeDate.to': by, 'q.birthLikePlace': bp, 'q.deathLikeDate.from': dy, 'q.deathLikeDate.to': dy, 'q.deathLikePlace': dp }) },
    { site: 'FamilySearch Family Tree', note: 'the shared world tree, free with an account', url: P('https://www.familysearch.org/search/tree/results', { 'q.givenName': first, 'q.surname': last, 'q.birthLikeDate.from': by, 'q.birthLikeDate.to': by, 'q.birthLikePlace': bp, 'q.deathLikeDate.from': dy, 'q.deathLikeDate.to': dy, 'q.deathLikePlace': dp }) },
    { site: 'Find a Grave', note: 'burials and memorials', url: P('https://www.findagrave.com/memorial/search', { firstname: first, lastname: last, birthyear: by, birthyearfilter: by ? '5' : '', deathyear: dy, deathyearfilter: dy ? '5' : '', location: dp }) },
    { site: 'Geni', note: 'family trees', url: P('https://www.geni.com/search', { search_type: 'people', names: full }) },
    { site: 'MyHeritage', note: 'name pages with matching trees and records', url: 'https://www.myheritage.com/names/' + [first, last].filter(Boolean).map(s => enc(s.toLowerCase().replace(/\s+/g, '_'))).join('_') },
    { site: 'WikiTree', note: 'surname page (its search form cannot be filled from a link)', url: last ? 'https://www.wikitree.com/genealogy/' + enc(last.toUpperCase().replace(/\s+/g, '_')) : 'https://www.wikitree.com/wiki/Special:SearchPerson' },
  ];
  return out.sort((a, b) => a.site.localeCompare(b.site, 'en'));
}

/* The line that says what a click sends, so the visitor sees it before they click. */
export function sends(q) {
  const bits = [[q.first, q.last].filter(Boolean).join(' ')];
  if (Number.isFinite(q.by)) bits.push('born ' + q.by); if (Number.isFinite(q.dy)) bits.push('died ' + q.dy);
  return bits.filter(Boolean).join(', ');
}
