/* Links into the MyHeritage tree the file came from. A GEDCOM that MyHeritage exported numbers people I1, I2 … and MyHeritage addresses the same
   person as  <tree number> x 1,000,000 + that number  (tree 4, I30 -> 4000030), under a site code that is the same for every person. Neither the
   site code nor the tree number is in the file, so the visitor pastes ONE profile or tree link, from which both are read. Plain links: the page
   sends nothing. No DOM, no network. */

const SITE = /[A-Z0-9]{16,64}/;
const slug = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'person';

/* A pasted profile link (…/profile-<site>-<id>/name) or tree link (…/family-trees/<slug>/<site>?rootIndividualID=<id>&familyTreeID=<n>).
   Returns { site, tree, num, treeSlug } or null. `num` is the person's number inside the tree: the file's I<num>. */
export function parseLink(text) {
  const t = String(text || '');
  let m = new RegExp('myheritage\\.[a-z.]+/profile-(' + SITE.source + ')-(\\d+)', 'i').exec(t);
  if (m) { const id = +m[2]; return { site: m[1].toUpperCase(), tree: Math.floor(id / 1e6), num: id % 1e6, treeSlug: null }; }
  m = new RegExp('myheritage\\.[a-z.]+/family-trees/([^/?#\\s]+)/(' + SITE.source + ')\\?([^\\s#]*)', 'i').exec(t);
  if (m) {
    /* parameters read by name, in any order; the person's is any "root…ID" so a mistyped name (rootIndivudalID) still works */
    const q = {}; for (const kv of m[3].split('&')) { const [k, v] = kv.split('='); if (k) q[k.toLowerCase()] = v || ''; }
    const rk = Object.keys(q).find(k => /^root.*id$/.test(k)), root = rk && /^\d+$/.test(q[rk]) ? +q[rk] : null;
    const tree = /^\d+$/.test(q.familytreeid || '') ? +q.familytreeid : root !== null ? Math.floor(root / 1e6) : null;
    if (tree !== null) return { site: m[2].toUpperCase(), tree, num: root === null ? null : root % 1e6, treeSlug: slug(decodeURIComponent(m[1])) };
  }
  return null;
}

/* THE TREE A FILE CAME FROM, READ FROM ITS HEADER, so a link is asked for once per tree and never again. A MyHeritage export names its tree in
   _PROJECT_GUID (one per tree: the main tree and the Mazza tree differ) and its family site in _EXPORTED_FROM_SITE_ID. Neither is the site code or the
   tree number a link needs, but the GUID is a stable name to remember them under. Returns { guid, site } or null. No DOM, no network. */
export function detectMyHeritage(parsed) {
  const head = (parsed && parsed.nodes || []).find(n => n.tag === 'HEAD'); if (!head) return null;
  const kids = head.kids || [], src = kids.find(k => k.tag === 'SOUR'); if (!src || !/myheritage/i.test(src.val || '')) return null;
  const val = t => { const k = kids.find(x => x.tag === t); return k && k.val ? k.val.trim() : ''; };
  const guid = val('_PROJECT_GUID').toUpperCase(), site = val('_EXPORTED_FROM_SITE_ID');
  return /^[0-9A-F]{16,64}$/.test(guid) ? { guid, site: /^\d{1,12}$/.test(site) ? site : '' } : null;
}

/* The number of a file id like I30, or null for an id that does not follow MyHeritage's numbering. */
export const numOf = id => { const m = /^I(\d{1,6})$/.exec(String(id || '')); return m ? +m[1] : null; };

export function profileUrl(cfg, id, name) {
  const n = numOf(id); if (!cfg || n === null) return null;
  return 'https://www.myheritage.com/profile-' + cfg.site + '-' + (cfg.tree * 1e6 + n) + '/' + slug(name);   // any name will do; the part must be there
}
export function treeUrl(cfg, id) {
  const n = numOf(id); if (!cfg || n === null) return null;
  return 'https://www.myheritage.com/family-trees/' + (cfg.treeSlug || 'tree') + '/' + cfg.site + '?rootIndividualID=' + (cfg.tree * 1e6 + n) + '&familyTreeID=' + cfg.tree;
}

/* The setting kept in the page's address (#mh=<site>.<tree>.<slug>) so a bookmark remembers it: the site code and tree number only, nothing from the file. */
export const toHash = cfg => '#mh=' + cfg.site + '.' + cfg.tree + '.' + (cfg.treeSlug || '');
export function fromHash(h) {
  const m = /^#mh=([A-Z0-9]{16,64})\.(\d{1,4})\.([a-z0-9-]*)$/.exec(String(h || '')); return m ? { site: m[1], tree: +m[2], num: null, treeSlug: m[3] || null } : null;
}
