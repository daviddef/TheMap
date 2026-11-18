/* The numbers on the strip at the top of the Roots & Routes tree views (People, Orphans, Detached families, Dead ends, Places), worked out from the tree the reader
   made and nothing else. The Tree Canvas's "Your file" page shows them without opening the viewer, so the rules are written out here exactly as the viewer
   applies them, and test/your-file.test.js runs the viewer's own code over the same trees and fails if the two ever disagree.

   The rules (the viewer's, not new ones):
   - a CONNECTED TREE is a group of people joined by parent, spouse or child links that holds 20 or more people;
   - a DETACHED FAMILY is such a group of 2 to 19 people; an ORPHAN is a group of one (nobody joined to them);
   - a DEAD END is a person in a connected tree with no recorded father and no recorded mother;
   - a person is "living" here when the reader withheld their name (hid === 1);
   - PLACES are the distinct birth places drawn, and "in the Record Atlas" those the Atlas slice has an id for.
   Nothing here is estimated: every figure is a count of what the reader produced. Pure: tree in, numbers out. */

const BIG = 20;   // the smallest connected tree

export function treeMetrics(tree, atlas) {
  const list = [], P = new Map();
  for (const r of (tree && tree.people) || []) {
    const p = { id: r.id, father: r.father || null, mother: r.mother || null, spouse: r.spouse || [], kids: r.kids || [], bp: r.bp, hid: r.hid === 1 ? 1 : 0 };
    P.set(p.id, p); list.push(p);
  }
  const comp = new Map(), sizes = [];
  for (const p of list) {
    if (comp.has(p.id)) continue;
    const c = sizes.length, q = [p.id]; comp.set(p.id, c); let n = 0;
    while (q.length) {
      const x = P.get(q.pop()); n++;
      for (const y of [x.father, x.mother, ...x.spouse, ...x.kids]) if (y && P.has(y) && !comp.has(y)) { comp.set(y, c); q.push(y); }
    }
    sizes.push(n);
  }
  let main = 0, orph = 0, dead = 0, living = 0; const mainComps = new Set(), clusComps = new Set(); let clusPeople = 0;
  for (const p of list) {
    const s = sizes[comp.get(p.id)];
    if (s >= BIG) { main++; mainComps.add(comp.get(p.id)); if (!p.father && !p.mother) dead++; }
    else if (s === 1) orph++;
    else { clusPeople++; clusComps.add(comp.get(p.id)); }
    if (p.hid === 1) living++;
  }
  const PL = {}; for (const a of (atlas && atlas.places) || []) PL[a.n] = a;
  const places = new Set(list.map(p => p.bp)), inAt = [...places].filter(n => PL[n] && PL[n].id).length;
  const undrawn = tree && tree.undrawn && tree.undrawn.length ? tree.undrawn.length : 0;
  return { total: list.length, trees: mainComps.size, treePeople: main, living, orphans: orph, clusters: clusComps.size, clusterPeople: clusPeople, deadEnds: dead, undrawn,
    places: places.size, placesInAtlas: inAt };
}

/* the strip as the viewer words it: [count, label, small line], same order, same sentences */
export function metricTiles(M) {
  const n = x => x.toLocaleString('en');
  return [
    [M.total, 'People', M.trees + ' connected trees (' + n(M.treePeople) + ' people) · ' + M.living + ' living, withheld'],
    [M.orphans, 'Orphans', 'records joined to no one'],
    [M.clusters, 'Detached families', M.clusterPeople + ' people in small families outside every tree'],
    [M.deadEnds, 'Dead ends', 'in a tree, but no parents recorded'],
    ...(M.undrawn ? [[M.undrawn, 'Not drawn yet', 'no year or no place to draw']] : []),
    [M.places, 'Places', M.placesInAtlas + ' in the Record Atlas · ' + (M.places - M.placesInAtlas) + ' not yet'],
  ];
}
