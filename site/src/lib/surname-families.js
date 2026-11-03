/* WHICH SPELLINGS ARE ONE NAME — read from the one catalogue, never kept here.

   data/surname-families.json is written by scripts/surname_variants.py and is
   the only place any session or archive keeps a surname's variants. This reads
   it the way lib/surname-context.js reads its file: from disk, at build time,
   once. Absent is fine: a page simply has no family block.

   The two keys below are the same two the tool uses, and the page must agree
   with the tool or a reader and a session will be told different things about
   one name:

     formKey    case, spaces, hyphens and apostrophes only. Accents STAY: Lereña
                is a priest's own spelling and Lerena is not.
     searchKey  also drops accents, which is what an index does, so a search
                for one returns the other's records.

   Typography — De Franceschi, DeFranceschi, Defranceschi — is one form, derived
   here for display and never stored. */
import fs from "node:fs";
import path from "node:path";

const CANDIDATES = [
  path.join(process.cwd(), "..", "data", "surname-families.json"),
  path.join(process.cwd(), "data", "surname-families.json"),
];

export const STATUS_ORDER = ["same", "attested", "rule", "lead", "case-by-case"];
export const STATUS_LABEL = {
  same: "The same family",
  attested: "Met on this line's records",
  rule: "By a documented rule",
  lead: "Leads, never yet seen on a record",
  "case-by-case": "Decide each record on its own",
};
const PARTICLES = ["della", "del", "de", "di", "da", "van", "von", "du", "le", "la", "des", "ten", "ter"];

export const formKey = (s) =>
  String(s || "").normalize("NFC").toLowerCase().replace(/[\s'’-]+/g, "");
export const searchKey = (s) =>
  String(s || "").replace(/[đł]/gi, (c) => (c.toLowerCase() === "đ" ? "d" : "l")).replace(/ø/gi, "o").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* The ways ONE form is routinely typed. Shown, never stored. */
export function typedForms(form) {
  const plain = String(form).normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const bare = plain.replace(/[\s'’-]+/g, "");
  const out = new Set();
  const low = bare.toLowerCase();
  for (const p of PARTICLES) {
    if (low.startsWith(p) && low.length - p.length >= 5) {
      const rest = bare.slice(p.length);
      const cap = rest[0].toUpperCase() + rest.slice(1);
      out.add(p[0].toUpperCase() + p.slice(1) + cap.toLowerCase());
      out.add(p[0].toUpperCase() + p.slice(1) + cap);
      out.add(p[0].toUpperCase() + p.slice(1) + " " + cap);
      out.add(p + " " + cap);
      break;
    }
  }
  if (/['’]/.test(form)) out.add(String(form).replace(/['’]\s*/g, ""));
  out.delete(form);
  return [...out];
}

let CAT = null;
let IX = null;

function load() {
  if (CAT) return CAT;
  CAT = { families: [] };
  for (const f of CANDIDATES) {
    try { CAT = JSON.parse(fs.readFileSync(f, "utf8")); break; } catch { /* absent is fine */ }
  }
  IX = new Map();
  for (const fam of CAT.families || []) {
    for (const m of fam.members) IX.set(formKey(m.form), { fam, m, role: "member" });
    for (const m of fam.notSame || []) IX.set(formKey(m.form), { fam, m, role: "notSame" });
  }
  return CAT;
}

export function allFamilies() {
  return (load().families || []).slice().sort((a, b) => searchKey(a.name).localeCompare(searchKey(b.name)));
}

export function legend() {
  return load().statuses || {};
}

/* The family a surname belongs to: exactly as typed first, then as an index
   would read it. Returns {fam, m, role} or null. */
export function familyFor(name) {
  load();
  const hit = IX.get(formKey(name));
  if (hit) return hit;
  const sk = searchKey(name);
  for (const v of IX.values()) if (searchKey(v.m.form) === sk) return v;
  return null;
}

/* What to type into a search for this family: the forms a record has shown
   (same, attested) and the documented rules. The same list the tool's `terms`
   prints, so a reader and a session search for the same things. */
export function searchList(fam) {
  return fam.members
    .filter((m) => m.status === "same" || m.status === "attested" || m.status === "rule")
    .map((m) => m.form);
}

export function membersByStatus(fam) {
  const g = {};
  for (const s of STATUS_ORDER) g[s] = fam.members.filter((m) => m.status === s);
  return g;
}
