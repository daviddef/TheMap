/* The one thing besides a kept file that this page remembers on the visitor's device: the last MyHeritage link they pasted (the site code and tree
   number it carries, nothing from the GEDCOM). It lives in this browser's own localStorage, is read back when the page opens, and is never sent
   anywhere. Every access is wrapped: private windows, blocked site data and previews refuse storage, and the page works without it. */
const KEY = 'recordatlas.roots.myheritage-link';
export const loadLink = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
export const saveLink = v => { try { if (v) localStorage.setItem(KEY, String(v).slice(0, 600)); else localStorage.removeItem(KEY); return true; } catch (e) { return false; } };
