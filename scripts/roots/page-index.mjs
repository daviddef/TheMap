// Which Atlas pages exist, so the Roots & Routes fix list links only to pages that do: surnames that earn a page, countries with a page, and each
// country's flags page. Reads the site's own libraries (the same ones that decide what gets built), so it cannot drift from them.
// Run from the site/ directory:  node ../scripts/roots/page-index.mjs <out.json>
import fs from "node:fs";
import { registerHooks } from "node:module";

// The libraries import their JSON the way the bundler lets them (no import attribute); plain Node wants one, so give every .json import the attribute.
registerHooks({ load(url, context, next) { return next(url, url.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context); } });
const { corpus } = await import("../../site/src/lib/surname-corpus.js");
const { surnamePageRows } = await import("../../site/src/lib/surname-pages.js");
const { COUNTRY_PAGES } = await import("../../site/src/lib/country-pages.js");
const { flagPage } = await import("../../site/src/lib/flags.js");

const out = process.argv[2];
const surnames = [...surnamePageRows(corpus().surnames || []).slugs].sort();
const countries = [...COUNTRY_PAGES].sort();
const flags = {};
for (const cc of countries) { const p = flagPage(cc); if (p) flags[cc] = p; }
fs.writeFileSync(out, JSON.stringify({ surnames, countries, flags }));
console.log("pages.json: " + surnames.length + " surname pages, " + countries.length + " country pages, " + Object.keys(flags).length + " flag pages");
