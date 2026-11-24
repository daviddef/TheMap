/* METAMORPHIC CHECK: the same story, written with different whitespace, Unicode form, quotes, line endings or a zero-width mark, must be read the same; and reading it twice must give the same answer. Prints every difference. */
import { parse } from "./ctx.mjs";
const sig = p => JSON.stringify({ s: p.stops.map(s=>[s.row.n,s.row.cc,s.year??null,s.role||null]), g: p.given||null, sn: p.surname||null, l: p.left??null, b: p.born??null });
const BASE = [
 "My great-grandfather Ivan Horvat was born in Senj, Croatia in 1880 and emigrated to Chicago in 1905. He died in Chicago in 1950.",
 "My grandmother Maria Rossi was born in Trieste in 1902. She married Giovanni in Fiume in 1925 and moved to Buenos Aires.",
 "Grandad John Smith left Cork in 1847 for Liverpool, then sailed to New York. He settled in Boston.",
 "My father Józef Kowalski was born in Kraków in 1921, lived in Warsaw, and died in London in 1999.",
 "Anna Müller was born in Wien in 1890 and moved to Hamburg in 1912.",
];
const MUT = {
  nfd: t=>t.normalize("NFD"), nfc: t=>t.normalize("NFC"),
  ws: t=>t.replace(/ /g,"  ").replace(/\./g,".\n\n"), tabs: t=>t.replace(/ /g,"\t"),
  nbsp: t=>t.replace(/ /g," "), zw: t=>t.replace(/(\w{4})/,"$1​"),
  quotes: t=>t.replace(/'/g,"’"), trail: t=>"  "+t+"   \n", crlf: t=>t.replace(/\n/g,"\r\n"),
  dashes: t=>t.replace(/-/g,"‑"), 
};
let bad=0, tot=0;
for (const b of BASE) { const s0 = sig(await parse(b)); for (const [k,f] of Object.entries(MUT)) { tot++; const s1 = sig(await parse(f(b))); if (s1!==s0) { bad++; console.log("DIFF",k,"|",b.slice(0,40),"\n  base",s0,"\n  mut ",s1); } } 
  const again = sig(await parse(b)); if (again!==s0) { bad++; console.log("NONDETERMINISTIC", b.slice(0,40)); } }
console.log("metamorphic", tot, "bad", bad);
