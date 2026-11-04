/* Links into the Ancestry tree an Ancestry export came from. In that export every person's record number IS Ancestry's own person number
   (0 @I120124089151@ INDI) and the tree number is in the header (HEAD > SOUR Ancestry… > _TREE > RIN 114002002), so nothing needs pasting.
   A link is given only when all three hold: the header names Ancestry as the source, it carries a numeric tree number, and the person's record
   number is a long number. A file that is not a clean Ancestry export gets no links, never a guessed one. Plain links; no DOM, no network. */
export const SITES = ['com.au', 'com', 'co.uk', 'ca'];
const walk = (n, f) => { for (const k of n.kids || []) { if (f(k)) return k; const r = walk(k, f); if (r) return r; } return null; };

/* parsed: the GEDCOM tree from gedcom.js. Returns { tree } or null. */
export function detectAncestry(parsed) {
  const head = (parsed && parsed.nodes || []).find(n => n.tag === 'HEAD'); if (!head) return null;
  const src = (head.kids || []).find(k => k.tag === 'SOUR'); if (!src || !/ancestry/i.test(src.val || '')) return null;
  const rin = walk(src, k => k.tag === 'RIN' && /^\d{6,12}$/.test((k.val || '').trim()));
  return rin ? { tree: rin.val.trim() } : null;
}
/* the person number of a record number such as I120124089151, or null when it is not a long number */
export const personNum = id => { const m = /^I(\d{6,15})$/.exec(String(id || '')); return m ? m[1] : null; };
export function personUrl(anc, id, site = 'com.au') {
  const n = personNum(id); if (!anc || !n) return null;
  return 'https://www.ancestry.' + (SITES.includes(site) ? site : 'com.au') + '/family-tree/person/tree/' + anc.tree + '/person/' + n;
}
