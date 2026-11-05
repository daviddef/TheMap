/* ONE PAGE PER GIVEN NAME, read from the two files that already hold the facts.
 *
 * public/given-names.json is what the name finder reads (forms by language, whether a record has met them), and the
 * catalogue data/given-name-families.json holds the evidence behind each form. This joins them for the page of one name:
 * the cards by language, and for each form the pages that carry it. Nothing here is written by hand and nothing about a
 * person is in either file. data/name-meanings.json adds what the name is said to come from, where sources have been read. */
import fs from "node:fs";
import path from "node:path";

const first = (list) => list.find((p) => fs.existsSync(p));
const read = (list) => JSON.parse(fs.readFileSync(first(list), "utf8"));
const here = process.cwd();

let cache = null;
export function names() {
  if (cache) return cache;
  const feed = read([path.join(here, "public", "given-names.json"), path.join(here, "site", "public", "given-names.json")]);
  const cat = read([path.join(here, "..", "data", "given-name-families.json"), path.join(here, "data", "given-name-families.json")]);
  /* The people file is optional: a build without it shows pages without that section. */
  const bf = first([path.join(here, "..", "data", "name-bearers.json"), path.join(here, "data", "name-bearers.json")]);
  const bearers = bf ? (JSON.parse(fs.readFileSync(bf, "utf8")).names || {}) : {};
  const mean = read([path.join(here, "..", "data", "name-meanings.json"), path.join(here, "data", "name-meanings.json")]).names || {};
  const evid = {};
  for (const f of cat.families) {
    const m = {};
    for (const x of f.members) {
      const refs = (x.evidence || []).filter((e) => e.kind === "source" && /^https?:/.test(e.ref || "")).map((e) => e.ref);
      const alsoRefs = {};
      for (const a of x.also || []) alsoRefs[a.lang] = (a.evidence || []).map((e) => e.ref).filter((r) => /^https?:/.test(r || ""));
      m[x.form.toLowerCase()] = { refs: [...new Set(refs)].slice(0, 3), alsoRefs };
    }
    evid[f.id] = m;
  }
  const label = Object.fromEntries(feed.languages.map((l) => [l.key, l.label]));
  const core = feed.languages.filter((l) => l.core).map((l) => l.key);
  const order = [...core, ...feed.languages.filter((l) => !l.core).sort((a, b) => a.label.localeCompare(b.label)).map((l) => l.key)];
  cache = { rows: feed.rows, label, order, core, meanings: mean, bearers, evid, total: feed.totalForms };
  return cache;
}

/* The word on a form: how far the catalogue's claim goes, in plain words. */
export function confidence(f, lang, evid) {
  if (f.seen > 0) return { key: "met", text: "met on a record" };
  if (f.status === "rule") return { key: "rule", text: "register form" };
  if (f.status === "case-by-case") return { key: "check", text: "check each record" };
  if (f.shared) return { key: "same", text: "same spelling" };
  return { key: "sourced", text: "sourced" };
}

export function hostOf(url) {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}
