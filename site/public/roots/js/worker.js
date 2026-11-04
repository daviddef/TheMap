/* The import runs here, off the page's main thread. It can read the static Atlas files next to the page and nothing else: the only
   fetches in this file are to those files, and what is fetched never includes anything from the GEDCOM beyond which country files and flag
   images the tree needs (the site's server log can see that much, as it can for any page). */
import { Session } from './pipeline.js';

let session = null, base = '';
const io = {
  json: async p => { const r = await fetch(base + p); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); },
  flag: async id => { const r = await fetch(base + '../fl/' + id + '.svg'); if (!r.ok) throw new Error('flag ' + id); return r.text(); },
};
const say = msg => self.postMessage({ type: 'progress', msg });

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.cmd === 'load') {
      base = m.base; session = new Session(io, say);
      const out = await session.load(new Uint8Array(m.bytes));
      self.postMessage({ type: 'done', first: true, ...out });
    } else if (m.cmd === 'export' && session) {
      const r = session.export(m.mode);
      self.postMessage({ type: 'exported', mode: m.mode, text: r.text, logText: r.logText, changed: r.changed, stats: r.stats, lines: r.lines, from: r.from });
    } else if (m.cmd === 'edit' && session) {
      const err = session.edit(m.edit);
      if (err) self.postMessage({ type: 'edit-error', msg: err }); else self.postMessage({ type: 'done', first: false, ...(await session.draw()) });
    } else if (m.cmd === 'who' && session) {
      const info = session.personInfo(m.id); self.postMessage({ type: 'who', id: m.id, name: info ? info.name : null });
    } else if (m.cmd === 'living' && session) {
      session.liveMode = m.hide ? 'redact' : 'show';
      self.postMessage({ type: 'done', first: false, ...(await session.draw()) });
    } else if (m.cmd === 'checklist' && session) {
      self.postMessage({ type: 'checklist', ...session.checklist({ living: m.living, ancestry: m.ancestry }) });
    } else if (m.cmd === 'offer' && session) {
      self.postMessage({ type: 'offer', ...session.contributions() });
    } else if (m.cmd === 'suggest' && session) {
      self.postMessage({ type: 'suggested', raw: m.raw, rows: session.suggest(m.raw) });
    } else if (m.cmd === 'find' && session) {
      self.postMessage({ type: 'found', q: m.q, rows: session.find(m.q) });
    } else if (m.cmd === 'person' && session) {
      self.postMessage({ type: 'person', info: session.personInfo(m.id) });
    } else if (m.cmd === 'pick' && session) {
      session.pick(m.raw, m.cand);
      self.postMessage({ type: 'done', first: false, ...(await session.draw()) });
    }
  } catch (err) { self.postMessage({ type: 'error', msg: String(err && err.message || err) }); }
};
