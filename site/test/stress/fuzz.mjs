import { parse } from "./ctx.mjs";
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const V = {
  rel: ["My grandfather", "my grandmother", "My father", "my mum", "His father", "Her mother", "My great grandfather", "My uncle", "I", "We", "They", "He", "She", "my name is Anna", "My wife", "My son"],
  verb: ["was born in", "moved to", "came from", "lived in", "died in", "married in", "emigrated to", "left", "returned to", "settled in", "worked in", "was from", "went to", "arrived in", "grew up in"],
  place: ["Cork", "Dublin", "Boston", "Naples", "Zagreb", "Brisbane", "Perth", "Springfield", "Paris", "London", "Georgia", "Jordan", "Florence", "Victoria", "Sydney", "Rijeka", "Fiume", "Łódź", "Zürich", "São Paulo", "Ireland", "South Africa", "County Cork", "New York", "Saint Louis", "St. Louis", "O'Brien", "Ho Chi Minh City", "the Bronx", "N/A", "???", "123", "x"],
  year: ["1900", "in 1923", "1950s", "'45", "c. 1880", "2099", "1066", "19", "0", "1999.", "(1922)", "1900-1950"],
  junk: ["", "…", "—", "!!!", "\n", "\n\n", "😀", "<b>", "</i>", "%", "&amp;", "\\", "\"", "''", "((", ")", "[", "{", "$1", "null", "undefined", "__proto__", "constructor", "toString", "hasOwnProperty"],
  name: ["Anton Kovac", "Maria Rossi", "John", "Ivan", "Giovanni Bianchi", "O'Brien", "van der Berg", "de la Cruz", "Mary-Jane", "X Æ A-12"],
  occ: ["a stonemason", "a farmer", "a miner", "worked as a baker", "a priest", "a soldier"],
};
const parts = ["rel", "verb", "place", "year", "junk", "name", "occ"];
let bad = 0, worst = 0, n = 3000;
for (let i = 0; i < n; i++) {
  const len = 1 + Math.floor(rnd() * 24); const out = [];
  for (let j = 0; j < len; j++) { const k = pick(parts); out.push(pick(V[k])); if (rnd() < 0.3) out.push(pick([".", ",", ";", ".\n"])); }
  const text = out.join(" ");
  const t0 = Date.now(); let p;
  try { p = parse(text); } catch (e) { bad++; if (bad <= 8) console.log("CRASH", JSON.stringify(text).slice(0, 160), "\n  ", e.message.slice(0, 120)); continue; }
  const ms = Date.now() - t0; worst = Math.max(worst, ms);
  if (ms > 300) console.log("SLOW", ms, JSON.stringify(text).slice(0, 120));
  // sanity: no stop without a row; years sane; no NaN
  for (const s of p.stops || []) if (!s.row || !s.row.n || (s.year != null && !(s.year >= 1000 && s.year <= 2100))) { bad++; if (bad <= 8) console.log("BAD STOP", JSON.stringify(text).slice(0, 140), JSON.stringify({ n: s.row && s.row.n, y: s.year })); }
  for (const pe of p.people || []) if (/undefined|null|NaN|\[object/.test(String(pe.name))) { bad++; if (bad <= 8) console.log("BAD NAME", JSON.stringify(text).slice(0, 140), pe.name); }
}
console.log("fuzz", n, "stories; problems", bad, "; slowest", worst, "ms");
