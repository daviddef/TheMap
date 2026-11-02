/* A made-up tree of any size, as GEDCOM text, for the scale tests. Every person is invented (syllable names, seeded random); places are real
   place names from a short list so the resolver and the Atlas have work to do. Not used by the page itself except the "Try a big sample" button. */
const PLACES = ['Grahamstown, Eastern Cape, South Africa', 'Cape Town, Western Cape, South Africa', 'Durban, KwaZulu-Natal, South Africa', 'Kimberley, Northern Cape, South Africa',
  'Pretoria, Gauteng, South Africa', 'Stellenbosch, Western Cape, South Africa', 'Cradock, Eastern Cape, South Africa', 'Bloemfontein, Free State, South Africa',
  'London, England', 'Bristol, Gloucestershire, England', 'Truro, Cornwall, England', 'Leeds, Yorkshire, England', 'Edinburgh, Scotland', 'Cork, County Cork, Ireland',
  'Kraków, Poland', 'Rijeka, Croatia', 'Zagreb, Croatia', 'Trieste, Italy', 'Hamburg, Germany', 'Leiden, Netherlands', 'Amsterdam, Netherlands',
  'Chicago, Illinois, United States', 'Boston, Massachusetts, United States', 'Toronto, Ontario, Canada', 'Sydney, New South Wales, Australia', 'Brisbane, Queensland, Australia',
  'Auckland, New Zealand', 'Buenos Aires, Argentina', 'Montevideo, Uruguay', 'Springfield', 'Xyzzyville, Nowhere'];
const SYL = ['an', 'bel', 'cor', 'dil', 'ed', 'fen', 'gid', 'hes', 'iv', 'jel', 'kas', 'lid', 'mir', 'nad', 'or', 'pi', 'qui', 'ros', 'sel', 'tam', 'ul', 'ver', 'wyn', 'zup'];
export function makeBig(n, seed = 1, places = PLACES) {
  let s = seed >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, pick = a => a[Math.floor(rnd() * a.length)];
  const nm = () => { const w = pick(SYL) + pick(SYL) + (rnd() < 0.5 ? pick(SYL) : ''); return w[0].toUpperCase() + w.slice(1); };
  const L = ['0 HEAD', '1 SOUR SynthMaker', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8'];
  const fams = []; let id = 0, queue = [];
  const person = (sur, by, sex) => {
    const i = ++id, home = pick(places), d = by + 45 + Math.floor(rnd() * 40), dead = d < 2000;
    L.push('0 @I' + i + '@ INDI', '1 NAME ' + nm() + ' /' + sur + '/', '1 SEX ' + sex, '1 BIRT', '2 DATE ' + (rnd() < 0.15 ? 'ABT ' : '') + by, '2 PLAC ' + home);
    if (dead) L.push('1 DEAT', '2 DATE ' + d, '2 PLAC ' + (rnd() < 0.7 ? home : pick(places)));
    if (rnd() < 0.3) L.push('1 RESI', '2 DATE ' + (by + 25), '2 PLAC ' + pick(places));
    return { i, by };
  };
  const roots = Math.max(1, Math.round(n / 4000));            // many families, not one tree: 4,000 people each
  for (let r = 0; r < roots; r++) queue.push([person(nm(), 1680 + Math.floor(rnd() * 30), 'M'), nm()]);
  while (id < n && queue.length) {
    const [h, sur] = queue.shift(), w = person(nm(), h.by + Math.floor(rnd() * 6) - 2, 'F'), kids = [], k = 1 + Math.floor(rnd() * 5);
    for (let j = 0; j < k && id < n; j++) kids.push(person(sur, h.by + 22 + j * 2 + Math.floor(rnd() * 8), rnd() < 0.5 ? 'M' : 'F'));
    fams.push({ h, w, kids });
    for (const c of kids) if (c.by < 1990) queue.push([c, sur]);
  }
  fams.forEach((f, i) => { L.push('0 @F' + (i + 1) + '@ FAM', '1 HUSB @I' + f.h.i + '@', '1 WIFE @I' + f.w.i + '@'); for (const c of f.kids) L.push('1 CHIL @I' + c.i + '@'); });
  L.push('0 TRLR');
  return L.join('\n') + '\n';
}
