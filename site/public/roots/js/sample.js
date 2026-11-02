/* A made-up family, as GEDCOM text, for the "Try a sample" button and for the tests. Every person here is invented; the places are real so
   the resolver has something to do, and a few are deliberately awkward (ambiguous, a venue, a country said twice, a typo, not a place). */
export function makeSample() {
  const L = [];
  const rec = (...a) => L.push(...a);
  rec('0 HEAD', '1 SOUR SampleMaker', '2 NAME Roots sample', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8');
  const people = [];
  const P = (id, given, sur, sex, by, bp, dy, dp, opts = {}) => people.push({ id, given, sur, sex, by, bp, dy, dp, ...opts });
  // four generations of two invented lines; the youngest are alive on purpose
  P(1, 'Ansel', 'Marlowe', 'M', 1821, 'Grahamstown, Eastern Cape, South Africa', 1893, 'Grahamstown, Eastern Cape, South Africa');
  P(2, 'Bettina', 'Verhoef', 'F', 1826, 'Cape Town', 1901, 'Cape Town, Cape Colony, South Africa');
  P(3, 'Corin', 'Marlowe', 'M', 1850, 'Port Elizabeth, Eastern Cape, South Africa', 1921, 'Kimberley, Northern Cape, South Africa', { resi: [[1880, 'Kimberley, Northern Cape, South Africa']] });
  P(4, 'Dilys', 'Penhallow', 'F', 1853, 'St Austell, Cornwall, England', 1929, 'Port Elizabeth, South Africa');
  P(5, 'Edric', 'Marlowe', 'M', 1879, 'Kimberley, Northern Cape, South Africa South Africa', 1944, 'Durban, KwaZulu-Natal, South Africa');
  P(6, 'Fenna', 'Ostrowski', 'F', 1884, 'Kraków, Poland', 1960, 'Durban, South Africa');
  P(7, 'Gideon', 'Marlowe', 'M', 1911, 'St Mary\'s Church, Durban, Natal', 1990, 'Cape Town');
  P(8, 'Hester', 'Ostrowski', 'F', 1914, 'Durban', 1999, 'Cape Town');
  P(9, 'Ivo', 'Marlowe', 'M', 1946, 'Springfield', null, null);                 // ambiguous on purpose
  P(10, 'Jelka', 'Kovač', 'F', 1949, 'Gračišće, Istria, Croatia', null, null);
  P(11, 'Kasimir', 'Ostrowski', 'M', 1850, 'Kraków, Poland', 1915, 'Chicago, Illinois, United States');
  P(12, 'Lidwina', 'Kozak', 'F', 1855, 'Rijeka, Croatia', 1930, 'Chicago, Illinois, USA');
  P(13, 'Mirko', 'Kovač', 'M', 1880, 'Fiume, Hungary', 1950, 'Rijeka, Primorje-Gorski Kotar, Croatia');
  P(14, 'Nadia', 'Zupan', 'F', 1884, 'Gračišće', 1962, 'Pazin, Istria, Croatia');
  P(15, 'Orla', 'Marlowe', 'F', 1975, 'Cape Town, South Africa', null, null);
  P(16, 'Piet', 'Venter', 'M', 1980, 'Xyzzyville, Nowhere', null, null);   // not a place
  P(17, 'Quill', 'Marlowe', 'M', 2008, 'Johannesburg, Gauteng, South Africa', null, null);
  P(18, 'Rosalind', 'Penhallow', 'F', 1822, 'Truro, Cornwall', 1890, 'St Austell, Cornwall, England');
  const fam = (id, h, w, kids) => ({ id, h, w, kids });
  const F = [fam(1, 1, 2, [3]), fam(2, 3, 4, [5]), fam(3, 5, 6, [7]), fam(4, 7, 8, [9]), fam(5, 9, 10, [15, 17]), fam(6, 11, 12, [6]), fam(7, 13, 14, [10]), fam(8, null, 18, [4])];
  for (const p of people) {
    rec('0 @I' + p.id + '@ INDI', '1 NAME ' + p.given + ' /' + p.sur + '/', '2 GIVN ' + p.given, '2 SURN ' + p.sur, '1 SEX ' + p.sex,
      '1 BIRT', '2 DATE ' + (p.id % 4 === 0 ? 'ABT ' : '') + p.by, '2 PLAC ' + p.bp);
    if (p.dy) rec('1 DEAT', '2 DATE ' + p.dy, '2 PLAC ' + p.dp);
    for (const [y, pl] of p.resi || []) rec('1 RESI', '2 DATE ' + y, '2 PLAC ' + pl);
    if (p.id === 3) rec('1 NOTE A long note that is split over several lines so that CONC and', '2 CONC  CONT both get exercised by the reader.', '2 CONT A second paragraph.');
    if (p.id === 5) rec('1 _UID ABCDEF0123456789', '1 _POSITION 12 34');          // vendor tags must survive
  }
  for (const f of F) {
    rec('0 @F' + f.id + '@ FAM'); if (f.h) rec('1 HUSB @I' + f.h + '@'); if (f.w) rec('1 WIFE @I' + f.w + '@');
    for (const k of f.kids) rec('1 CHIL @I' + k + '@');
  }
  rec('0 TRLR');
  return L.join('\r\n') + '\r\n';
}
