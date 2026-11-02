/* Offering places back to Record Atlas. Nothing here sends anything: it works out which place texts could be offered, and writes the message
   the visitor will read, edit and send themselves (their own email, or copy and paste). A place text only: no person, no date, no count, no
   file name. Each item is opted in one by one; the default is nothing. No DOM, no network. */

const FIRST_LINE = 'Places offered to Record Atlas from Roots & Routes';

/* Which place texts are offerable, and which are held back and why.
   livingOnly: used only by living people (or families with a living partner), so not offered.
   address: has a digit in it, so it may be a street address, a plot or a lot; the visitor can still include it after trimming it by hand. */
export function offerable(session) {
  const live = new Set(), dead = new Set(), P = session.P;
  const walk = (n, into) => { for (const k of n.kids) { if (k.tag === 'PLAC' && k.val.trim()) into.add(k.val.trim()); if (k.kids.length) walk(k, into); } };
  for (const r of session.parsed.nodes) {
    let into = dead;
    if (r.tag === 'INDI') { const p = r.xref && P.get(r.xref.replace(/@/g, '')); if (p && p.liv) into = live; }
    else if (r.tag === 'FAM') for (const k of r.kids) if ((k.tag === 'HUSB' || k.tag === 'WIFE') && P.get((k.val || '').replace(/@/g, '')) && P.get(k.val.replace(/@/g, '')).liv) into = live;
    walk(r, into);
  }
  const liveNames = new Set(), deadNames = new Set();               // "Given Surname" of everyone in the file: a place field sometimes holds a person's name
  for (const q of P.values()) if (q.given && q.sur) (q.liv ? liveNames : deadNames).add(q.given.split(/\s+/)[0] + ' ' + q.sur.split(/\s+/)[0]);
  const nameIn = (raw, set) => { const w = raw.split(/[\s,.;:()"]+/).filter(Boolean); for (let k = 0; k + 1 < w.length; k++) for (let n = 2; n <= 3 && k + n <= w.length; n++) if (set.has(w.slice(k, k + n).join(' '))) return true; return false; };
  const items = [], held = { livingOnly: 0, livingName: 0 };
  for (const [raw, count] of session.mentions) {
    const r = session.res.get(raw), picked = session.overrides.get(raw);
    const unread = ['not-found', 'ambiguous', 'review-other-country', 'review-skipped-part'].includes(r.tier) && !picked;
    if (!unread && !picked) continue;
    if (!dead.has(raw)) { held.livingOnly++; continue; }
    if (nameIn(raw, liveNames)) { held.livingName++; continue; }
    const it = { raw, kind: picked ? 'picked' : 'unread', address: /\d/.test(raw), named: nameIn(raw, deadNames) };
    if (picked) it.pick = { n: picked.n, region: picked.region || null, k: picked.k, y: Math.round(picked.y * 1000) / 1000, x: Math.round(picked.x * 1000) / 1000 };
    else if (r.iso) it.iso = r.iso;
    items.push(it);
  }
  items.sort((a, b) => a.raw.localeCompare(b.raw, 'en'));
  return { items, held };
}

/* The message, from the items the visitor ticked (with whatever text they trimmed it to). `items`: [{text, kind, pick?, iso?}] */
export function buildPacket(items, date) {
  const L = [FIRST_LINE, date, '',
    'These are place texts only. No names, dates, people or file names are included, and nothing was sent from the page: the sender chose these, read this message, and sent it.', ''];
  const un = items.filter(i => i.kind === 'unread'), pk = items.filter(i => i.kind === 'picked');
  if (un.length) { L.push('Places the Atlas could not read:'); for (const i of un) L.push('  ' + i.text + (i.iso ? '   [country read as ' + i.iso + ']' : '')); L.push(''); }
  if (pk.length) {
    L.push('Places the sender says are somewhere the Atlas did not choose (their pick, with the Atlas gazetteer\'s name and coordinates):');
    for (const i of pk) L.push('  ' + i.text + '  =>  ' + i.pick.n + (i.pick.region ? ', ' + i.pick.region : '') + ', ' + i.pick.k + ' (' + i.pick.y + ', ' + i.pick.x + ')');
    L.push('');
  }
  L.push('— Sent from Roots & Routes, Record Atlas');
  return L.join('\n');
}
