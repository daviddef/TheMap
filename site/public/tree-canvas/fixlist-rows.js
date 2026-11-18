/* The Fix list's ROW: one component, drawn by the full-list workspace on this page and by the canvas's side panel (a person's own rows), which is another document: so every
   function takes the `doc` it draws into, and nothing here touches the page's own globals. A row is a checkbox ("Done"), the problem in a plain sentence, the people it
   names (each a link to their profile on MyHeritage or Ancestry when the Settings link is set, otherwise plain text), the one-click copy buttons for paste-ready text, a
   "Leave as is" button, the Atlas's next step and notes. Styles: fixrows.css (copied into the canvas build too), all in --fx-* variables the host page sets.

   Everything drawn is set with textContent or an attribute, never as HTML, apart from the fixed icons below (our own markup). */
import { peopleOf, copyActions, REL_WORD } from './fixlist.js';

const ICON = {
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  tree: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9.5" y="3" width="5" height="4" rx="1"/><rect x="3" y="17" width="5" height="4" rx="1"/><rect x="16" y="17" width="5" height="4" rx="1"/><path d="M12 7v5M5.5 17v-5h13v5"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.5V4.5h8l8.5 8.5-8 8z"/><path d="M8 8.5v.01"/></svg>',
};
export const FX_ICON = ICON;
const MAXP = 3;

export function mk(doc, tag, cls, text) { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function ibtn(doc, icon, title, onclick, cls) { const b = mk(doc, 'button', 'fx-ib' + (cls ? ' ' + cls : '')); b.type = 'button'; b.innerHTML = ICON[icon]; b.title = title; b.setAttribute('aria-label', title); b.onclick = onclick; return b; }
function ilink(doc, icon, title, href) { const a = mk(doc, 'a', 'fx-ib'); a.innerHTML = ICON[icon]; a.title = title; a.setAttribute('aria-label', title); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function link(doc, text, href, title) { const a = mk(doc, 'a', null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; if (title) a.title = title; return a; }
const okHref = u => /^https?:\/\//i.test(u) ? u : (/^\/[^/]/.test(u || '') ? 'https://recordatlas.org' + u : '');

/* copy: the clipboard where the page may use it, else the old way; the button says "Copied" for a moment */
export async function copyText(doc, text, btn) {
  try { await doc.defaultView.navigator.clipboard.writeText(text); }
  catch (e) { const t = doc.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; doc.body.append(t); t.select(); try { doc.execCommand('copy'); } catch (x) { /* the text is on screen to select by hand */ } t.remove(); }
  if (!btn) return;
  const was = btn.innerHTML, wt = btn.title, icon = btn.classList.contains('fx-ib');
  if (icon) { btn.innerHTML = ICON.check; btn.title = 'Copied'; } else btn.textContent = 'Copied';
  btn.classList.add('ok'); setTimeout(() => { btn.innerHTML = was; btn.title = wt; btn.classList.remove('ok'); }, 1200);
}

/* one person (or one event) as a tidy line: name (the link), the record number, what the event was, then the icons */
function nameNodes(doc, name, nl) {
  if (!nl) return [name]; const out = []; let rest = name || '';
  if (nl.given && rest.startsWith(nl.given.t)) { out.push(link(doc, nl.given.t, okHref(nl.given.u))); rest = rest.slice(nl.given.t.length); }
  if (nl.sur && rest.endsWith(nl.sur.t)) { out.push(rest.slice(0, rest.length - nl.sur.t.length), link(doc, nl.sur.t, okHref(nl.sur.u))); } else out.push(rest);
  return out;
}
export function personLine(doc, ctx, p, o) {
  o = o || {};
  const li = mk(doc, 'li', 'fx-p'), pn = mk(doc, 'span', 'fx-pn'), u = o.archive ? null : (ctx.links && p.id != null && !p.gone ? ctx.links.url(p.id, p.name) : null);
  const href = o.href || (u && (u.mh || u.anc)) || '';
  /* THE NAME IS ONE LINK, to the tree site when the Settings link is set; the Atlas's pages for the name never go away: with a link set they are their own two icons beside the
     others (the surname's page and the given name's page), without one they are the name's own words, as on Roots & Routes. An archive row's name is the archive's page. */
  let atlas = null;
  if (href) { const a = link(doc, p.name || '(no name)', href, (o.archive ? 'Open in the ' + o.archive + ' archive' : u && u.mh ? 'Open on MyHeritage' : 'Open on Ancestry') + ' (a new tab)'); a.className = 'fx-name'; pn.append(a); if (!o.archive && p.nl && p.name) atlas = p.nl; }
  else if (p.nl && p.name) pn.append(...nameNodes(doc, p.name, p.nl));
  else pn.textContent = p.name || '(no name)';
  li.append(pn);
  if (p.id != null && !o.archive) li.append(mk(doc, 'span', 'fx-pid', String(p.id)));
  /* the event and its year are two cells (so "Birth" and "Death" make one column and the years another, tabular), a free-text chip is one cell across both */
  if (o.chip) li.append(mk(doc, 'span', 'fx-ev wide', o.chip));
  else if (p.ev || p.by) { li.append(mk(doc, 'span', 'fx-ev', p.ev || 'Born')); const yr = p.ev ? p.date : p.by; if (yr) li.append(mk(doc, 'span', 'fx-yr', String(yr))); }
  const acts = mk(doc, 'span', 'fx-acts');
  if (o.copyName !== false && p.name && !o.archive) acts.append(ibtn(doc, 'copy', 'Copy the name', function () { copyText(doc, p.name, this); }));
  if (atlas) for (const [k, what] of [['sur', 'surname'], ['given', 'given name']]) { const l = atlas[k], h = l && okHref(l.u); if (h) acts.append(ilink(doc, 'tag', 'The Atlas\'s page for the ' + what + ' ' + l.t + ' (a new tab)', h)); }
  if (u && u.tree) acts.append(ilink(doc, 'tree', 'Open this person in the tree on MyHeritage (a new tab)', u.tree));
  if (u && u.mh && u.anc) acts.append(ilink(doc, 'open', 'Open this person on Ancestry (a new tab)', u.anc));
  const key = o.key || (p.id != null && !p.gone && !o.archive ? 'you:' + p.id : '');
  if (key && ctx.show && !o.noShow) acts.append(ibtn(doc, 'target', 'Show on canvas', () => ctx.show([key])));
  if (acts.childNodes.length) li.append(acts);
  return li;
}
function plist(doc, ctx, list, total) {
  const ul = mk(doc, 'ul', 'fx-pl'); list.slice(0, MAXP).forEach(p => ul.append(personLine(doc, ctx, p)));
  const w = mk(doc, 'div'); w.append(ul);
  if (list.length > MAXP) {
    const more = list.slice(MAXP), rest = mk(doc, 'ul', 'fx-pl'); rest.hidden = true;   // the rest are only built when asked for: a place text can have hundreds of people
    const b = mk(doc, 'button', 'fx-link', 'Show ' + more.length + ' more'); b.type = 'button'; b.setAttribute('aria-expanded', 'false');
    b.onclick = () => { if (!rest.firstChild) more.forEach(p => rest.append(personLine(doc, ctx, p))); rest.hidden = !rest.hidden; b.textContent = rest.hidden ? 'Show ' + more.length + ' more' : 'Show fewer'; b.setAttribute('aria-expanded', String(!rest.hidden)); };
    w.append(rest, b);
  }
  if (total > list.length) w.append(mk(doc, 'small', 'fx-muted', 'and ' + (total - list.length) + ' more, all in the spreadsheet'));
  return w;
}
/* what the Atlas holds, as a list: a label, the text, its links. A line that says the Atlas has nothing is marked so it reads as a statement, not a gap. */
function infoList(doc, lines) {
  const ul = mk(doc, 'ul', 'fx-atl');
  for (const x of lines) {
    const li = mk(doc, 'li', x.none ? 'none' : x.outside ? 'outside' : null); li.append(mk(doc, 'b', null, x.k + ' '), x.t);
    if (x.l && x.l.length) { li.append(' '); x.l.forEach((y, n) => { if (n) li.append(' · '); const u = okHref(y.u); li.append(u ? link(doc, y.t, u) : y.t); }); }
    ul.append(li);
  }
  return ul;
}

/* the Compare status mark: an emoji, never a button and never the word "check"; the meaning is in its tooltip and its label */
export function qMark(doc, reason) {
  const e = mk(doc, 'span', 'fx-q', '❓'), t = 'The two records disagree on a detail: ' + reason;
  e.title = t; e.setAttribute('role', 'img'); e.setAttribute('aria-label', t); return e;
}

/* ctx: { st (the decisions), links, show(keys), onChange(s, i), fileName, collapseNotes(), compact } */
export function rowEl(doc, ctx, s, i) {
  const st = ctx.st, row = mk(doc, 'div', 'fx-row' + (ctx.compact ? ' compact' : '')), cb = mk(doc, 'input'); cb.type = 'checkbox';
  const done = st.isDone(i.key), asis = !done && st.isAsIs(i.key);
  cb.checked = done; row.classList.toggle('done', done); row.classList.toggle('asis', asis);
  const body = mk(doc, 'div', 'fx-body'), head = mk(doc, 'div', 'fx-head'), note = mk(doc, 'div', 'fx-note');
  const evs = n => n + ' event' + (n === 1 ? '' : 's');
  const cpL = a => { const b = mk(doc, 'button', 'fx-cand'); b.type = 'button'; b.innerHTML = ICON.copy + '<span></span>'; b.lastChild.textContent = a.label; b.title = a.title; b.setAttribute('aria-label', a.title); b.onclick = function () { copyText(doc, a.text, this); }; return b; };
  let label = '';
  if (s.key === 'places' || s.key === 'check') {
    label = i.raw + ' to ' + i.to;
    const swap = mk(doc, 'span', 'fx-swap'); swap.append(mk(doc, 'span', 'fx-was', i.raw), mk(doc, 'span', 'fx-arrow', '→'), mk(doc, 'b', 'fx-now', i.to));
    const acts = mk(doc, 'span', 'fx-acts2'); copyActions(s, i).forEach(a => acts.append(cpL(a))); head.append(swap, acts);
    if (s.key === 'check') note.textContent = 'Suggestion only: ' + i.why;
    body.append(head); if (note.textContent) body.append(note); body.append(mk(doc, 'div', 'fx-evs', evs(i.count)), plist(doc, ctx, i.people, i.count));
  } else if (s.key === 'decide') {
    label = i.raw; head.append(mk(doc, 'span', 'fx-was plain', i.raw)); body.append(head);
    const cs = mk(doc, 'div', 'fx-cands');
    if (i.cands.length) { cs.append(mk(doc, 'span', 'fx-muted', 'Could be: ')); copyActions(s, i).forEach(a => cs.append(cpL(a))); } else cs.append(mk(doc, 'span', 'fx-muted', 'No candidate found: look it up by hand.'));
    body.append(cs, mk(doc, 'div', 'fx-evs', evs(i.count)), plist(doc, ctx, i.people, i.count));
  } else if (s.key === 'dupes') {
    label = 'Possibly the same person: ' + i.an + ' and ' + i.bn; head.append(mk(doc, 'b', null, 'Possibly the same person')); note.textContent = i.note + (i.ap || i.bp ? ' · ' + (i.ap || '—') + ' / ' + (i.bp || '—') : '');
    body.append(head, note, plist(doc, ctx, [{ name: i.an, id: i.a }, { name: i.bn, id: i.b }], 2));
  } else if (s.key === 'apart') {
    label = i.size + ' people not connected to the main tree'; head.append(mk(doc, 'b', null, i.size + (i.size === 1 ? ' person' : ' people') + ' not connected to the main tree')); body.append(head, plist(doc, ctx, i.people, i.size));
    note.textContent = (i.gone ? 'The file names ' + i.gone + ' relative' + (i.gone === 1 ? '' : 's') + ' of these people who ' + (i.gone === 1 ? 'is' : 'are') + ' not in it, so it may be a partial export.'
      : 'In this file there is no parent, spouse or child link from ' + (i.size === 1 ? 'this person' : 'these people') + ' to anyone else.') + ' Built from ' + (ctx.fileName || 'the file you loaded') + '. If they are joined in your tree now, export again.'; body.append(note);
  } else if (s.key === 'suspect') {
    label = i.name; const one = mk(doc, 'ul', 'fx-pl solo'); one.append(personLine(doc, ctx, { name: i.name, id: i.id, nl: i.nl })); head.append(one); body.append(head);
    const ul = mk(doc, 'ul', 'fx-reasons'); for (const r of i.reasons) ul.append(mk(doc, 'li', null, r.text)); body.append(ul);
  } else if (s.key === 'ages') {
    label = i.country; head.append(mk(doc, 'b', null, i.country + ' written for ' + (i.from === i.to ? i.from : i.from + '–' + i.to) + ', when it was ' + i.label));
    body.append(head, mk(doc, 'div', 'fx-evs', i.count + ' event' + (i.count === 1 ? '' : 's') + ', ' + i.n + (i.n === 1 ? ' person' : ' people')), plist(doc, ctx, i.people, i.n));
  } else if (s.key === 'leads') {
    label = i.name; const one = mk(doc, 'ul', 'fx-pl solo'); one.append(personLine(doc, ctx, { name: i.name, id: i.id, by: i.born, nl: i.nl })); head.append(one);
    body.append(head, mk(doc, 'div', 'fx-note', 'Born ' + i.born + ' at ' + i.place + '. The Atlas lists these for that place and time:'));
    const ul = mk(doc, 'ul', 'fx-reasons');
    for (const c of i.cols) { const li = mk(doc, 'li'), u = /^https?:\/\//.test(c.url) ? c.url : ''; li.append(u ? link(doc, c.title, u) : c.title, ' ' + [c.provider, c.from ? c.from + (c.to ? '–' + c.to : '') : ''].filter(Boolean).join(' · ')); ul.append(li); }
    if (i.more) ul.append(mk(doc, 'li', 'fx-muted', 'and ' + i.more + ' more in the Atlas')); body.append(ul);
  } else if (s.key === 'cmpmiss') {
    label = i.name + ' is missing from your file';
    const one = mk(doc, 'ul', 'fx-pl solo'); one.append(personLine(doc, ctx, { name: i.name, id: null }, { archive: i.archive, href: i.url, chip: [i.yrs, i.place].filter(Boolean).join(' · '), key: i.ck, noShow: false })); head.append(one);
    if (i.text) { const b = mk(doc, 'button', 'fx-add'); b.type = 'button'; b.innerHTML = ICON.plus + '<span>Copy details</span>'; b.title = 'Copy their details as plain text, to add to your tree by hand'; b.setAttribute('aria-label', 'Copy details to add ' + i.name + ' to your tree'); b.onclick = function () { copyText(doc, i.text, this); }; head.append(b); }
    body.append(head);
    const rel = mk(doc, 'div', 'fx-note'); rel.append((i.archive || 'The archive') + ' has them' + (i.rel && REL_WORD[i.rel] && i.relName ? ' as the ' + REL_WORD[i.rel] + ' of ' : '. '));
    if (i.relName) { const u = ctx.links && i.relId ? ctx.links.url(i.relId, i.relName) : null, h = u && (u.mh || u.anc); rel.append(h ? link(doc, i.relName, h, 'Open on MyHeritage (a new tab)') : i.relName, ' (in your file). Your file has no one in that place.'); }
    body.append(rel);
  } else if (s.key === 'cmpdiff') {
    label = i.fname + ': ' + i.reason;
    head.append(qMark(doc, i.reason), mk(doc, 'span', 'fx-reason', i.reason)); body.append(head);
    const ul = mk(doc, 'ul', 'fx-pl');
    ul.append(personLine(doc, ctx, { name: i.fname, id: i.fid }, { chip: 'Your file' + (i.fyrs ? ' · ' + i.fyrs : ''), key: i.fkey || 'you:' + i.fid }));
    ul.append(personLine(doc, ctx, { name: i.aname, id: null }, { archive: i.archive, href: i.url, chip: (i.archive || 'Archive') + (i.ayrs ? ' · ' + i.ayrs : ''), key: i.ck }));
    body.append(ul);
  } else {                                                                                        // years, names, dates: one person, a note under
    label = i.name || '(no name)'; const one = mk(doc, 'ul', 'fx-pl solo'); one.append(personLine(doc, ctx, { name: i.name, id: i.id, nl: i.nl }, { copyName: !!i.name })); head.append(one);
    note.textContent = i.note + (i.with ? ' · with ' + i.with : '') + (i.kin ? ' · ' + i.kin : '') + (i.born && s.key !== 'dates' ? ' · born ' + i.born : '') + (i.place ? ' · born at ' + i.place : '');
    body.append(head, note);
  }
  cb.setAttribute('aria-label', 'Done: ' + label.slice(0, 120));
  /* LEAVE AS IS: "I know this is right: hide it". Offered on every row; taken back from "left as is" in the status filter. */
  const leave = mk(doc, 'button', 'fx-leave', asis ? 'Show again' : 'Leave as is'); leave.type = 'button';
  leave.title = asis ? 'Put this row back on the list' : 'I know this is right: take it off the list'; leave.onclick = () => { st.set(i.key, 'a', !st.isAsIs(i.key)); ctx.onChange(s, i, row, 'a'); };
  head.append(leave);
  if (i.next) { const n = mk(doc, 'p', 'fx-next'); n.append(mk(doc, 'b', null, 'Next step '), i.next); body.append(n); }
  if (i.info && i.info.length) {
    const d = mk(doc, 'details', 'fx-notes'); d.open = !(ctx.collapseNotes && ctx.collapseNotes()); const sm = mk(doc, 'summary'); sm.append(mk(doc, 'b', null, 'What the Atlas holds '), mk(doc, 'span', 'fx-muted', '(' + i.info.length + ')')); d.append(sm, infoList(doc, i.info)); body.append(d);
  }
  cb.onchange = () => { st.set(i.key, 'd', cb.checked); row.classList.toggle('done', cb.checked); ctx.onChange(s, i, row, 'd'); };
  row.append(cb, body); return row;
}
