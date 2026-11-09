/* WHAT EACH PLACE WAS CALLED, AS KEYS, FOR THE STORY READER.
 *
 * A story that says Fiume, Pola, Gallignana or Zara means a place the Atlas holds under today's name. The search index carries a place's other
 * names only as one long string, so a place with several of them lost most; here each folded name is a key to the places that answer to it.
 * Built at build from the two files that hold names (data/places.json `names`, and the dated-names catalogue data/place-names.json). Nothing is
 * typed or guessed: a name is here because one of those files says so. The reader treats a name as a search term, never as a finding.
 */
import places from "../../../data/places.json";
import cat from "../../../data/place-names.json";

function fold(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/đ/g, "d").replace(/ł/g, "l").replace(/ø/g, "o").replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/œ/g, "oe")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function GET() {
  const rows = Array.isArray(places) ? places : Array.isArray(places.places) ? places.places : Object.values(places.places || places);
  const al = {};
  const add = (name, id, own) => {
    const k = fold(name);
    if (k.length < 4 || k === fold(own)) return;
    const l = (al[k] ||= []);
    if (l.indexOf(id) < 0) l.push(id);
  };
  for (const p of rows) for (const n of p.names || []) add(n.n, p.id, p.name);
  for (const p of cat.places || []) for (const n of p.names || []) add(n.name, p.id, p.name);
  const keys = Object.keys(al).sort();
  const out = {};
  for (const k of keys) out[k] = al[k];
  return new Response(JSON.stringify({ aliases: out }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
