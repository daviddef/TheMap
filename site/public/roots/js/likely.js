/* A "LIKELY" CANDIDATE FOR A PLACE TEXT THAT COULD BE SEVERAL PLACES, from where the people who use it, and their relatives, are firmly recorded.

   THE RULE. For a place text with two or more candidates:
     1. EVIDENCE PEOPLE are everyone who uses the text, and their relatives (parents, brothers and sisters, spouses, children). Each is a person once, however many events they have.
     2. A person's EVIDENCE PLACES are their other recorded places that the reader placed FIRMLY (one place, no doubt: tier confident, confident-by-region, or chosen). A text that could
        be several places is never evidence for another such text, and the text being judged is never evidence for itself.
     3. Each person VOTES for the candidate their evidence places are nearest to. Closeness (AFFINITY) is 1 within NEAR_KM, less out to FAR_KM and nothing beyond; a place in the same
        region and country as the candidate counts a little more than a place the same distance away in another. Candidates a person is equally close to share that vote.
     4. A FAMILY IS ONE VOICE. People joined by the relatives above form one family; each family gives one point in all, shared among its members' votes. A big family cannot outvote a
        small one, and two families that disagree are two voices.
     5. A candidate is marked LIKELY only with enough to go on: at least MIN_PEOPLE people with a firm place near any candidate, at least MIN_WINNER of them nearest this one, its score
        at least MARGIN times the next candidate's and at least MIN_SHARE of all the scores. When it is close, the country or ruler of the day breaks the tie, only if at least MIN_WINNER
        dated records agree and by the same margin. Otherwise nothing is marked and the row says there are no clear neighbours.
   It is a SUGGESTION from where relatives are recorded, never a finding, and it changes nothing: the candidate stays one to copy. The reason line carries counts only: no name, no place.

   No DOM, no network, nothing stored. Pure functions over what the reader already holds. */

export const LIKELY = { MIN_PEOPLE: 3, MIN_WINNER: 2, MARGIN: 1.5, MIN_SHARE: 0.5, NEAR_KM: 25, FAR_KM: 150, SAME_REGION_KM: 100, MAX_USERS: 600 };

const rad = Math.PI / 180;
export function km(a, b, c, d) {
  const dl = (d - b) * rad, p = a * rad, q = c * rad, s = Math.sin((q - p) / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin(dl / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(s)));
}
/* how close a firm place is to a candidate, 0..1 */
export function affinity(f, c) {
  const d = km(f.y, f.x, c.y, c.x);
  if (d <= LIKELY.NEAR_KM) return 1;
  if (d > LIKELY.FAR_KM) return 0;
  const a = 0.8 * (1 - (d - LIKELY.NEAR_KM) / (LIKELY.FAR_KM - LIKELY.NEAR_KM));
  const sameRegion = f.k === c.k && f.region && c.region && f.region === c.region && d <= LIKELY.SAME_REGION_KM;
  return Math.min(1, a + (sameRegion ? 0.15 : 0));
}
const yearOf = v => { const m = /\b(\d{4})\b/.exec(v || ''); return m ? +m[1] : null; };

/* env: { P (people by id: father, mother, spouse[], kids[]), byRaw (checklist.js eventsByPlace: raw -> { people: [{ id, date }] }), firm(raw) -> { y, x, k, region } or null (only a firmly placed text),
          regime(y, x, year) -> an id for who held that ground that year, or null (optional) }
   -> { likely(raw, cands) } where cands are [{ n, k, y, x, region }] (any order, 2 or more) and the answer is
      { idx, reason } (idx: the candidate's place in `cands`) or { none: 'few' | 'tied' } (never for fewer than two candidates: that gives null). Answers are remembered per text. */
export function makeLikely(env) {
  const P = env.P, byPerson = new Map(), memo = new Map(), firmMemo = new Map();
  const firm = raw => { if (firmMemo.has(raw)) return firmMemo.get(raw); const f = env.firm(raw) || null; firmMemo.set(raw, f); return f; };
  for (const [raw, g] of env.byRaw) for (const p of g.people) { let l = byPerson.get(p.id); if (!l) byPerson.set(p.id, l = []); l.push([raw, yearOf(p.date)]); }
  const relatives = id => {
    const p = P.get(id); if (!p) return [];
    const out = new Set(); for (const x of [p.father, p.mother, ...p.spouse, ...p.kids]) if (x) out.add(x);
    for (const par of [p.father, p.mother]) { const q = par && P.get(par); if (q) for (const s of q.kids) if (s !== id) out.add(s); }
    return [...out];
  };
  function judge(raw, cands) {
    const g = env.byRaw.get(raw); if (!g) return { none: 'few' };
    const users = [...new Set(g.people.map(p => p.id))].slice(0, LIKELY.MAX_USERS);
    /* the evidence people, and which family each belongs to (union-find over the links followed) */
    const up = new Map(), find = a => { while (up.get(a) !== a) { up.set(a, up.get(up.get(a))); a = up.get(a); } return a; }, join = (a, b) => { const x = find(a), y = find(b); if (x !== y) up.set(x, y); };
    for (const u of users) { if (!up.has(u)) up.set(u, u); for (const r of relatives(u)) { if (!up.has(r)) up.set(r, r); join(u, r); } }
    const fams = new Map();   // family root -> [{ places: [{ f, year }] }] for each person with a firm place near any candidate
    let voters = 0;
    const perCand = cands.map(() => ({ score: 0, nearest: 0, near: 0, regimeAgree: 0 }));
    for (const id of up.keys()) {
      const ev = byPerson.get(id); if (!ev) continue;
      const places = []; for (const [r, y] of ev) { if (r === raw) continue; const f = firm(r); if (f) places.push({ f, y }); }
      if (!places.length) continue;
      const aff = cands.map(c => { let best = 0; for (const pl of places) best = Math.max(best, affinity(pl.f, c)); return best; });
      const top = Math.max(...aff); if (top <= 0) continue;
      voters++;
      const winners = aff.map((a, i) => (a >= top - 0.05 ? i : -1)).filter(i => i >= 0);
      const root = find(id); let fam = fams.get(root); if (!fam) fams.set(root, fam = []);
      fam.push({ winners, places, aff });
    }
    if (voters < LIKELY.MIN_PEOPLE) return { none: 'few', voters };
    for (const fam of fams.values()) {
      const w = 1 / fam.length;
      for (const m of fam) {
        for (const i of m.winners) { perCand[i].score += w / m.winners.length; perCand[i].nearest += 1 / m.winners.length; }
        m.aff.forEach((a, i) => { if (a >= 1) perCand[i].near++; });
      }
    }
    const order = perCand.map((c, i) => i).sort((a, b) => perCand[b].score - perCand[a].score || perCand[b].nearest - perCand[a].nearest);
    const total = perCand.reduce((n, c) => n + c.score, 0), W = order[0], S = order[1];
    let win = W, regimeNote = '';
    const clear = (a, b) => perCand[a].score >= LIKELY.MARGIN * perCand[b].score;
    if (!clear(W, S)) {
      /* a close call: who held that ground at the dates of their records breaks it, only if the dated records clearly agree */
      if (!env.regime) return { none: 'tied', voters };
      const tied = order.filter(i => perCand[i].score * LIKELY.MARGIN >= perCand[W].score);
      const rs = tied.map(() => 0);
      for (const fam of fams.values()) for (const m of fam) for (const pl of m.places) { if (pl.y === null) continue; const rf = env.regime(pl.f.y, pl.f.x, pl.y); if (!rf) continue; tied.forEach((i, n) => { if (env.regime(cands[i].y, cands[i].x, pl.y) === rf) rs[n]++; }); }
      const o = rs.map((v, n) => n).sort((a, b) => rs[b] - rs[a]), best = rs[o[0]], next = rs[o[1]] || 0;
      if (best < LIKELY.MIN_WINNER || best < LIKELY.MARGIN * next) return { none: 'tied', voters };
      win = tied[o[0]]; regimeNote = ' Where they are recorded, it was the same country as theirs at the dates of their records (' + best + ' records).';
    }
    if (perCand[win].nearest < LIKELY.MIN_WINNER || (!regimeNote && perCand[win].score < LIKELY.MIN_SHARE * total)) return { none: win === W ? 'tied' : 'few', voters };
    const m = perCand[win], nearest = Math.round(m.nearest * 10) / 10, whole = Number.isInteger(nearest) ? String(nearest) : nearest.toFixed(1);
    const reason = whole + ' of ' + voters + ' people connected to this text (those who use it, their relatives, and their other records) are recorded firmly nearest this one' + (m.near ? '; ' + m.near + ' of the ' + voters + ' have a record within ' + LIKELY.NEAR_KM + ' km of it.' : '.') + regimeNote;
    return { idx: win, reason, voters, nearest: m.nearest };
  }
  return {
    likely(raw, cands) { if (!cands || cands.length < 2) return null; if (memo.has(raw)) return memo.get(raw); const r = judge(raw, cands); memo.set(raw, r); return r; },
  };
}
