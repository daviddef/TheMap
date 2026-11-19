/* WHAT HAS BEEN ADDED TO THE NAME CATALOGUES, FOR THE WHAT'S-NEW PAGE.
 *
 * TAGGED «research», NOT «new». David: «new should be for app features vs research data.» A spelling, a form or a place name is data the
 * atlas gained; «new» is a thing the reader can now do.
 *
 * Read from the catalogues themselves (data/surname-families.json, data/given-name-families.json, data/place-names.json), which
 * stamp every piece of evidence, and from Mar 2026 every dated place name, with the day it was added. A day becomes one entry per
 * catalogue. Only a spelling, a family's headline name, a language and a place: NEVER evidence text, a note or a person, because
 * evidence is free text written by researchers (and the catalogues forbid people in it anyway; this is a second wall).
 *
 * A BULK DAY IS NOT A LIST. The first import put 222 spellings and 5,323 given-name forms in on one day each; naming them would bury
 * everything else on the page, so a day over BULK says how many, once, and the page links to the catalogue. */
import fs from "node:fs";
import path from "node:path";

const BULK = 25;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function read(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data", rel), "utf8")); }
  catch (e) { return null; }
}

/* WHERE A FORM CAME FROM, in words: the host of a public page it rests on (Wikipedia, Wiktionary), or the family archive that met it. Only the
   kind of source, never the evidence text (which is free text), so nothing about a person can come through. */
const HOSTS = { "en.wikipedia.org": "Wikipedia", "en.wiktionary.org": "Wiktionary", "www.wikidata.org": "Wikidata", "commons.wikimedia.org": "Wikimedia Commons" };
function origin(ref) {
  const r = String(ref || "");
  const a = /^archive:(.+)$/i.exec(r); if (a) return `the ${a[1].trim()} family archive`;
  try { const h = new URL(r).hostname; return HOSTS[h] || h.replace(/^www\./, ""); } catch (e) { return "a researcher's note"; }
}
function howText(src, what) {
  const parts = Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n.toLocaleString("en")})`);
  if (!parts.length) return "";
  return `Each ${what} carries the source it rests on: ${parts.join("; ")}.`;
}
const earliest = (ev) => (ev || []).map((e) => e && e.added).filter((d) => DAY.test(d || "")).sort()[0] || "";
const plural = (n, w) => `${n.toLocaleString("en")} ${w}${n === 1 ? "" : "s"}`;
const listed = (xs, max) => (xs.length <= max ? xs.join(", ") : xs.slice(0, max).join(", ") + " and " + (xs.length - max) + " more");

/* members added per day, grouped by the family's own headline name */
function byDay(cat, skipStatus) {
  const days = {};
  for (const f of (cat && cat.families) || []) {
    for (const m of f.members || []) {
      if (skipStatus && skipStatus.includes(m.status)) continue;
      const d = earliest(m.evidence);
      if (!d) continue;
      const day = (days[d] = days[d] || { forms: 0, fams: {}, src: {} });
      day.forms++;
      for (const e of m.evidence || []) if (e && e.added === d) { const o = origin(e.ref); day.src[o] = (day.src[o] || 0) + 1; }
      (day.fams[f.name] = day.fams[f.name] || []).push(m.form);
    }
  }
  return days;
}

export function namesNews(cats) {
  const c = cats || {
    surnames: read("surname-families.json"), given: read("given-name-families.json"), places: read("place-names.json"),
  };
  const out = [];

  for (const [date, d] of Object.entries(byDay(c.surnames, ["not-same"]))) {
    const fams = Object.keys(d.fams).sort((a, b) => a.localeCompare(b));
    let headline;
    if (d.forms > BULK) headline = `${plural(d.forms, "spelling")} of ${plural(fams.length, "surname")} added to the catalogue`;
    else headline = `New ${d.forms === 1 ? "spelling" : "spellings"}: ` +
      listed(fams.map((n) => `${n} (${d.fams[n].sort().join(", ")})`), 4);
    out.push({ date, kind: "research", headline: clip(headline), href: "/surname-families/",
      what: "The spellings below are now treated as the same family name when you search, with the evidence for each on its family page.",
      items: fams.slice(0, 250).map((n) => ({ t: n, w: d.fams[n].sort().join(", "), q: "s" })), more: Math.max(0, fams.length - 250), how: howText(d.src, "spelling") });
  }

  for (const [date, d] of Object.entries(byDay(c.given, ["not-same"]))) {
    const fams = Object.keys(d.fams).sort((a, b) => a.localeCompare(b));
    let headline;
    if (d.forms > BULK) headline = `${plural(d.forms, "form")} of ${plural(fams.length, "given name")} added: Ivan, Johann, Giovanni and the like, found as one name`;
    else headline = `New ${d.forms === 1 ? "form" : "forms"} of a given name: ` + listed(fams.map((n) => `${n} (${d.fams[n].sort().join(", ")})`), 4);
    out.push({ date, kind: "research", headline: clip(headline), href: "/your-name/",
      what: "Each name below is now searched in all its forms (Ivan, Johann and Giovanni are one name), so a register is not missed for the form a clerk used.",
      items: fams.slice(0, 250).map((n) => ({ t: n, w: d.fams[n].sort().join(", "), q: "n" })), more: Math.max(0, fams.length - 250), how: howText(d.src, "form") });
  }

  const pdays = {};
  for (const p of (c.places && c.places.places) || []) {
    for (const n of p.names || []) {
      if (!DAY.test(n.added || "")) continue;
      const day = (pdays[n.added] = pdays[n.added] || { names: 0, places: {} });
      day.names++;
      (day.places[p.name] = day.places[p.name] || []).push(n.name);
    }
  }
  for (const [date, d] of Object.entries(pdays)) {
    const ps = Object.keys(d.places).sort((a, b) => a.localeCompare(b));
    const headline = d.names > BULK
      ? `${plural(d.names, "old place name")} added for ${plural(ps.length, "place")}, so a record is searched under the name of its year`
      : `New place ${d.names === 1 ? "name" : "names"}: ` + listed(ps.map((n) => `${n} (also ${d.places[n].sort().join(", ")})`), 4);
    out.push({ date, kind: "research", headline: clip(headline), href: "/place-names/" });
  }
  return out;
}

function clip(h) { return h.length > 150 ? h.slice(0, 147).replace(/[;,(]?\s*\S*$/, "") + "…" : h; }
