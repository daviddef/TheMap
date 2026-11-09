import { F, ctx, parse } from "./ctx.mjs";
import { C } from "./corpus.mjs";
const only = process.argv[2];
const fold = (s) => String(s||"").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g,"");
let pass=0, fail=0, known=0; const bad=[], gapsSeen=[];
for (const c of C) {
  if (only && !c.id.includes(only)) continue;
  let p, err=null, ms;
  const t0=Date.now();
  try { p = parse(c.t); } catch(e){ err=e; }
  ms=Date.now()-t0;
  const probs=[];
  if (err) probs.push("CRASH "+err.message);
  else {
    const pl = (p.stops&&p.stops.length)?p.stops:(()=>{const o=[];(p.kin||[]).forEach(k=>k.stops.forEach(x=>o.push({row:x.row,year:x.year})));(p.people||[]).forEach(pe=>(pe.events||[]).forEach(ev=>{if(ev.place&&!o.some(q=>q.row===ev.place.row))o.push({row:ev.place.row,year:ev.year||null});}));return o;})();
    const got=pl.map(s=>s.row.n), yrs=pl.map(s=>s.year);
    const e=c.e||{};
    if (e.stops) {
      const ok = e.stops.length===got.length && e.stops.every((x,i)=>fold(got[i]).includes(fold(x)));
      if (!ok) probs.push("stops "+JSON.stringify(got.slice(0,8))+(got.length>8?" …("+got.length+")":"")+"  want "+JSON.stringify(e.stops));
    }
    if (e.years && pl.length===e.years.length) { if (JSON.stringify(yrs)!==JSON.stringify(e.years)) probs.push("years "+JSON.stringify(yrs)+" want "+JSON.stringify(e.years)); }
    if (e.rel && p.rel!==e.rel) probs.push("rel '"+p.rel+"' want "+e.rel);
    if (e.name!==undefined && fold(p.name)!==fold(e.name)) probs.push("name '"+p.name+"' want '"+e.name+"'");
    if (e.people) { const roles=(p.people||[]).map(x=>x.role); const miss=e.people.filter(r=>!roles.includes(r)); if (miss.length) probs.push("people "+JSON.stringify(roles)+" missing "+miss); }
    if (e.occ) { const o=JSON.stringify(p).toLowerCase(); if (!o.includes("occup")&&!o.includes(e.occ)) probs.push("occupation '"+e.occ+"' not kept"); }
    if (ms>500) probs.push("SLOW "+ms+"ms");
  }
  if (probs.length && c.gap) { known++; gapsSeen.push(c.id+": "+c.gap); } else if (probs.length) { fail++; bad.push({id:c.id,t:c.t.slice(0,90).replace(/\n/g," / "),probs}); } else { pass++; if (c.gap) bad.push({id:c.id,t:"(listed as a known gap but now passes)",probs:["remove its gap"]}); }
}
console.log("pass",pass,"fail",fail,"known gaps",known);
for (const b of bad) { console.log("\n✗ "+b.id+": "+b.t); b.probs.forEach(x=>console.log("   - "+x)); }

if (!only) { console.log("\nKnown gaps:"); gapsSeen.forEach(g=>console.log("  - "+g)); }
process.exitCode = fail ? 1 : 0;
