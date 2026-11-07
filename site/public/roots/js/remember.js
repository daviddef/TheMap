/* The one thing besides a kept file that this page remembers on the visitor's device: the last MyHeritage link they pasted (the site code and tree
   number it carries, nothing from the GEDCOM). It lives in this browser's own localStorage, is read back when the page opens, and is never sent
   anywhere. Every access is wrapped: private windows, blocked site data and previews refuse storage, and the page works without it. */
const KEY = 'recordatlas.roots.myheritage-link';
export const loadLink = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
export const saveLink = v => { try { if (v) localStorage.setItem(KEY, String(v).slice(0, 600)); else localStorage.removeItem(KEY); return true; } catch (e) { return false; } };

/* The link for each TREE, by the tree's name in the file's header (see detectMyHeritage): the link is pasted once for a tree and remembered for every
   later file from it. An empty string is a deliberate "forget this one", so a link the visitor cleared is not filled in again. */
const TREES_KEY = 'recordatlas.roots.myheritage-trees';
export const loadTrees = () => { try { const o = JSON.parse(localStorage.getItem(TREES_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
export const saveTreeLink = (guid, link) => { try { const o = loadTrees(); o[String(guid)] = String(link || '').slice(0, 600); localStorage.setItem(TREES_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } };

/* the regional Ancestry site the visitor prefers for outside-search links (com.au, com, co.uk or ca): a choice from a short list, kept the same way */
const SITE_KEY = 'recordatlas.roots.ancestry-site', SITES = ['com.au', 'com', 'co.uk', 'ca'];
export const loadSite = () => { try { const v = localStorage.getItem(SITE_KEY); return SITES.includes(v) ? v : 'com.au'; } catch (e) { return 'com.au'; } };
export const saveSite = v => { try { if (SITES.includes(v)) localStorage.setItem(SITE_KEY, v); return true; } catch (e) { return false; } };
