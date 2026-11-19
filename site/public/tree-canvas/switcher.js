/* The switcher between the Canvas, Compass and the Atlas (the three round orange buttons, #sw). Canvas and Compass are two views of one page: both stay alive, so a hop between them draws nothing again (see
   compass-view.js resume()). The Atlas is another page: a real link that opens a new tab by default, so the tree stays open and loaded here; Alt-click goes there in this tab instead. */
/* 'same' only for a plain Alt-click (the others are the browser's own: Ctrl/Cmd/Shift/middle-click already open a tab or window by themselves) */
export const atlasMode = e => (e && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.button || 0) === 0 ? 'same' : 'tab');
export function createSwitcher({ root, canvas, compass }) {
  const b = k => root.querySelector('[data-v="' + k + '"]');
  const mark = v => { for (const k of ['canvas', 'compass']) { const x = b(k); if (v === k) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); } };
  b('canvas').addEventListener('click', () => canvas());
  b('compass').addEventListener('click', () => compass());
  b('atlas').addEventListener('click', e => { if (atlasMode(e) === 'same') { e.preventDefault(); location.assign(b('atlas').href); } });
  return { mark, show: on => { root.hidden = !on; }, current: () => (b('compass').getAttribute('aria-current') ? 'compass' : 'canvas') };
}
