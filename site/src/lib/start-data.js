/* THE NUMBERS AND EXAMPLES BEHIND THE START PAGE AND THE STORY TOUR, ALL READ FROM THE DATA.

   /start/ and the tour (public/js/start-tour.js, chapters served at /start-tour.html) say a lot about what the Atlas holds. A figure typed into
   prose is a second claim free to drift from the data, and this page exists to say what the map does not know, so every number is computed
   here, at build time, from the files the other pages read:

     places, volumes, access classes ........ index.json (lib/atlas.js, whole)
     walked places, Croatian depth .......... src/data/places-full.json
     regions and eras, the regimes .......... public/regions.json
     flag pages, hubs ....................... src/flags-pages, data/flag-index.json
     given-name and surname families ........ data/given-name-families.json, data/surname-families.json
     dated place names (Fiume, Salisbury) ... data/place-names.json
     other names of places .................. data/gazetteer.json.gz (the gazetteer the find box searches)
     newspapers, terms, sources, declined ... data/trove-newspapers.json, data/record-terms.json, public/providers.json, data/_declined.json

   Two layers. computeStartNumbers() and buildTour() are pure: they take the loaded files and return numbers and strings, so a test can feed
   them a fixture. loadInputs() reads the files from disk, as lib/atlas.js does and for the same reason (plain Node can run it; no bundler).

   What is NOT in the data, and is therefore a hand-built example, is named in EXAMPLES below and labelled "example" or "invented" wherever
   it appears: the grandmother and her photograph, the register page, the journey Fiume - Genoa - Melbourne, the newspaper clipping, the six
   example words, the hand-placed hub ovals and the illustrative borders on the map. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { atlas } from "./atlas.js";

export const fmt = (n) => Number(n).toLocaleString("en-GB");
const WORDS = ["nil", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* THE HAND-BUILT PART, IN ONE PLACE. Choices of example, not facts: each id or form must exist in the catalogue it points at (the test checks). */
export const EXAMPLES = {
  placeIds: { fiume: "rijeka", salisbury: "harare" },       // place-names.json ids; the old name and its dates come from the catalogue
  fiumeRegionPlace: "rijeka",                               // the full place whose region's eras give the rulers
  surnameFamily: "zubrinic",                                // surname-families.json id
  givenFamily: "giovanni",                                  // given-name-families.json id
  givenForms: ["Ivan", "Johann", "Giovanni", "Zuane", "John"],
  abroadForm: "Zubrinich",                                  // the form the family's branches abroad use (attested, with countries)
  wordCandidates: ["maple", "harbor", "candle", "river", "ocean", "lantern", "island", "garden", "bridge", "anchor", "meadow"],
  filedYear: 1930,                                          // "a 1930 baptism may be filed under ..."
};
/* regime id -> the flag the tour draws (simplified, by hand) and its colour on the year ruler. Anything else is drawn as a neutral "other". */
const REGIME_FLAG = { habsburg: "ah", italy: "it", yugo: "yu", croatia: "hr" };
const FLAG_COLOUR = { ah: "#E0B73A", it: "#1F9A5B", yu: "#2A4E9C", hr: "#C8202F", disp: "#6B7F8A" };
const SHORT = { habsburg: "Habsburg", italy: "Italy", german: "German occupation", yugo: "Yugoslavia", croatia: "Croatia" };

/* ---------- reading the files ---------- */
/* The catalogues live in the repository's data/ and the build writes a thinner copy of some of them into public/ for the browser; the pages that
   need the whole catalogue read data/ first (dataFirst), the ones that need the built file read public/ first. */
function roots(dataFirst) {
  const c = process.cwd();
  if (dataFirst) return [path.join(c, "..", "data"), path.join(c, "data"), path.join(c, "src", "data"), path.join(c, "public"), path.join(c, "site", "public")];
  return [path.join(c, "public"), path.join(c, "src", "data"), path.join(c, "..", "data"), path.join(c, "data"),
          path.join(c, "site", "public"), path.join(c, "site", "src", "data")];
}
function readJson(name, { gz = false, optional = false, dataFirst = false } = {}) {
  for (const r of roots(dataFirst)) {
    try {
      const buf = fs.readFileSync(path.join(r, name));
      return JSON.parse((gz ? zlib.gunzipSync(buf) : buf).toString("utf8"));
    } catch { /* next root */ }
  }
  if (optional) return null;
  throw new Error(`${name} not found; looked in:\n  ${roots(dataFirst).join("\n  ")}\nRun \`npm run data\`.`);
}
let GAZ = null;
function gazetteerCounts() {
  if (GAZ) return GAZ;
  const g = readJson("gazetteer.json.gz", { gz: true, optional: true, dataFirst: true });
  let places = 0, names = 0, all = 0;
  for (const r of (g && g.places) || []) { all++; if (r.a && r.a.length) { places++; names += r.a.length; } }
  return (GAZ = { all, places, names });
}
export function loadInputs() {
  const flagDir = path.join(process.cwd(), "src", "flags-pages");
  let flagPages = 0;
  try { flagPages = fs.readdirSync(flagDir).filter((f) => f.endsWith(".html") && f !== "index.html").length; } catch { /* none */ }
  const regionsFile = readJson("regions.json");
  const prov = readJson("providers.json");
  const trove = readJson("trove-newspapers.json", { optional: true, dataFirst: true }) || {};
  const declined = readJson("_declined.json", { optional: true, dataFirst: true });
  const shows = readJson("archives-showcase.json", { optional: true });
  return {
    places: atlas.places, rank: atlas.rank || [], countryNames: atlas.countries || {},
    full: readJson("places-full.json").places,
    regions: regionsFile.regions, regimes: regionsFile.regimes || {},
    providers: prov.providers,
    declined: Array.isArray(declined) ? declined.length : Array.isArray(declined && declined.declined) ? declined.declined.length : Object.keys(declined || {}).length,
    flagPages, flagIndex: readJson("flag-index.json", { dataFirst: true }),
    trove: (trove.counts && trove.counts.titles) || 0,
    terms: (readJson("record-terms.json", { dataFirst: true }).terms || []).length,
    givenFamilies: readJson("given-name-families.json", { dataFirst: true }), surnameFamilies: readJson("surname-families.json", { dataFirst: true }),
    placeNames: readJson("place-names.json", { dataFirst: true }),
    gazetteer: gazetteerCounts(),
    countryPoints: (readJson("country-points.json", { optional: true }) || {}).countries || [],
    syncWords: readJson("sync-words.json", { optional: true }) || {},
    /* the same count /my-work/ lists: the family archives in the showcase, plus Our Family, the landing site they meet in */
    archives: shows ? (shows.archives || []).length + 1 : 0,
    repo: (readJson("site.json", { optional: true }) || {}).repo,
  };
}

/* ---------- the numbers ---------- */
const SURVEYED = new Set(["free", "account", "index", "mixed", "paid", "catalogue", "onsite"]);
export function computeStartNumbers(i, extra = {}) {
  const dots = i.places.length;
  const accessOf = (p) => (typeof p.a === "number" && i.rank[p.a]) || "unsurveyed";
  const surveyed = i.places.filter((p) => SURVEYED.has(accessOf(p))).length;
  const unsurveyedPct = Math.round((1 - surveyed / dots) * 1000) / 10;
  const walkedPlaces = i.full.filter((p) => p.via !== "geonames-admin" && (p.collections || []).length);
  const hr = i.full.filter((p) => p.country === "HR");
  const volumes = i.places.reduce((a, p) => a + (p.v || 0), 0);
  const eras = i.regions.reduce((a, r) => a + r.eras.length, 0);
  const sources = i.providers.length;
  const unopened = i.providers.filter((p) => p.access === "unsurveyed").length;
  return {
    placesRaw: dots, places: fmt(dots),
    regionsRaw: i.regions.length, regions: fmt(i.regions.length),
    erasRaw: eras, eras: fmt(eras),
    volumesRaw: volumes, volumes: fmt(volumes), volumesM: (volumes / 1e6).toFixed(2) + "M",
    /* "countries and territories": the same definition as the home page's volumes pill and /countries/ (lib/country-metrics.js), handed in by
       the page, because that module reads its JSON through the bundler. Without it, the countries that have a dot on the map. */
    countries: fmt(extra.countriesKnown != null ? extra.countriesKnown : new Set(i.full.map((p) => p.country).filter(Boolean)).size),
    countriesWithDots: fmt(new Set(i.full.map((p) => p.country).filter(Boolean)).size),
    surveyed: fmt(surveyed), surveyedRaw: surveyed,
    unsurveyedPct: unsurveyedPct.toFixed(1), unsurveyedTenths: Math.round(unsurveyedPct * 10),
    walkedRaw: walkedPlaces.length, walked: fmt(walkedPlaces.length),
    walkedCountries: fmt(new Set(walkedPlaces.map((p) => p.country)).size),
    hrPlaces: fmt(hr.length), hrVolumes: fmt(hr.reduce((a, p) => a + (p.collections || []).length, 0)),
    flagPages: fmt(i.flagPages), hubs: fmt(i.flagIndex.counts.hubs),
    altPlaces: fmt(i.gazetteer.places), altNames: fmt(i.gazetteer.names), gazetteerPlaces: fmt(i.gazetteer.all),
    givenNames: fmt(i.givenFamilies.counts.families), givenForms: fmt(i.givenFamilies.counts.forms),
    surnameFamilies: fmt(i.surnameFamilies.counts.families),
    newspapers: fmt(i.trove), newspapersRaw: i.trove,
    terms: fmt(i.terms),
    sources: fmt(sources), sourcesUnopened: fmt(unopened), sourcesOpened: fmt(sources - unopened),
    declined: fmt(i.declined),
    archivesWord: WORDS[i.archives] || fmt(i.archives),
    repo: i.repo || "https://github.com/daviddef/TheMap",
  };
}

/* ---------- examples out of the catalogues ---------- */
const fold = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
export { fold };

function datedNames(cat, id) {
  const p = (cat.places || []).find((x) => x.id === id);
  if (!p) throw new Error(`place-names.json has no place ${id}`);
  return p;
}
/* [[untilYear, oldName], [9999, today's name]] from the dated names of one place: the longest-held name that ended in the past */
function nameLine(p) {
  const old = (p.names || []).filter((n) => n.to && n.status === "attested" && n.kind !== "exonym").sort((a, b) => (b.to - (b.from || 0)) - (a.to - (a.from || 0)))[0];
  if (!old) throw new Error(`place ${p.id} has no attested old name with an end year`);
  return { old, line: [[old.to, old.name], [9999, p.name]] };
}
function rulersFor(i, y0) {
  const place = i.full.find((p) => p.id === EXAMPLES.fiumeRegionPlace);
  const region = place && i.regions.find((r) => r.id === place.region);
  if (!region) throw new Error(`no region for ${EXAMPLES.fiumeRegionPlace}`);
  const eras = region.eras.filter((e) => e.to > y0).map((e) => ({ to: e.to, regime: e.regime }));
  const merged = [];
  for (const e of eras) { const last = merged[merged.length - 1]; if (last && last.regime === e.regime) last.to = e.to; else merged.push({ ...e }); }
  merged.forEach((e, k) => { if (k === merged.length - 1) e.to = 9999; });
  return merged.map((e) => {
    const flag = REGIME_FLAG[e.regime] || "disp";
    const label = (i.regimes[e.regime] && i.regimes[e.regime].label) || e.regime;
    return [e.to, label, flag, FLAG_COLOUR[flag], SHORT[e.regime] || label, e.regime];
  });
}
function family(list, id) {
  const f = (list.families || []).find((x) => x.id === id);
  if (!f) throw new Error(`no family ${id}`);
  return f;
}

export function buildTour(i, n, { base = "" } = {}) {
  const b = base.replace(/\/$/, "");
  const pnFiume = datedNames(i.placeNames, EXAMPLES.placeIds.fiume), pnHarare = datedNames(i.placeNames, EXAMPLES.placeIds.salisbury);
  const fiume = nameLine(pnFiume), harare = nameLine(pnHarare);
  const rulers = rulersFor(i, 1850);
  const kindWord = { colonial: "a colonial name", official: "the official name then", exonym: "a foreign name" }[harare.old.kind] || "an older name";
  const sur = family(i.surnameFamilies, EXAMPLES.surnameFamily);
  const same = sur.members.filter((m) => m.status === "same").map((m) => m.form);
  const plain = same.find((f) => fold(f) === "zubrinic" && f === "Zubrinic") || same[1];
  const x = same.find((f) => /^Xubrinich$/.test(f)) || same[2];
  const abroad = sur.members.find((m) => m.form === EXAMPLES.abroadForm);
  if (!abroad) throw new Error(`${EXAMPLES.abroadForm} is not a member of ${sur.id}`);
  const forms = [sur.name, plain, x, abroad.form];
  const abroadWhere = [...new Set(abroad.evidence.flatMap((e) => e.where || []))];
  const homeWhere = [...new Set(sur.members.filter((m) => m.form === sur.name).flatMap((m) => m.evidence.flatMap((e) => e.where || [])))];
  const pt = (cc) => { const c = i.countryPoints.find((q) => q.cc === cc); return c ? [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10] : null; };
  const pins = [...homeWhere.slice(0, 1), ...abroadWhere].map((cc) => [cc, ...(pt(cc) || [0, 0])]);
  const cn = (cc) => i.countryNames[cc] || cc;
  const gv = family(i.givenFamilies, EXAMPLES.givenFamily);
  const gForms = new Set(gv.members.map((m) => m.form));
  for (const f of EXAMPLES.givenForms) if (!gForms.has(f)) throw new Error(`${f} is not in the given-name family ${gv.id}`);
  const words = ((i.syncWords && i.syncWords.words) || []);
  const have = EXAMPLES.wordCandidates.filter((w) => words.includes(w));
  const exWords = (have.length >= 6 ? have : words).slice(0, 6);

  /* the era the example year falls in: "a 1930 baptism may be filed under Italy" */
  const filedEra = rulers.find((r) => EXAMPLES.filedYear < r[0]);
  const hubOf = (slug) => (i.flagIndex.hubs || []).find((h) => h.url.includes(slug));
  const hubA = hubOf("habsburg-hub"), hubY = hubOf("yugoslavia-hub");
  const cross = hubA && /plus (.+?) crossing over/.exec(hubA.what);
  const hubNote = cross ? cross[1].replace(", and ", " and ") + " cross over" : "the hubs overlap";

  /* folded search terms for the hero box: this story's examples only, every form from the catalogues (never a guess) */
  const alt = (p, k) => [p.name, ...(p.names || []).map((q) => q.name)].map(fold);
  const placeKey = (p) => [...new Set(alt(p))].filter((s) => s.length > 2);
  const forFold = (arr) => [...new Set(arr.map(fold))].filter((s) => s.length >= 3);
  const re = (arr) => "^(" + arr.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")$";
  const match = [
    [re(placeKey(pnFiume)), { ch: 1, place: "fiume" }],
    [re(placeKey(pnHarare)), { ch: 1, place: "salisbury" }],
    [re(forFold(sur.members.map((m) => m.form))), { ch: 2 }],
    [re(forFold(gv.members.map((m) => m.form))), { ch: 2, t: 10.1 }],
  ];

  const data = {
    base: b, volumesText: n.volumes, hubNote,
    places: {
      fiume: { lon: round(placeLon(i, "rijeka") ?? 14.44, 2), lat: round(placeLat(i, "rijeka") ?? 45.33, 2), y0: 1850, y1: 2000, names: fiume.line, rulers,
        cam: { lon: 15.4, lat: 44.4, vw: 30, mvw: 18 }, note: "Names from the Atlas's dated-names catalogue; eras from its Kvarner region; flags simplified." },
      salisbury: { lon: round(placeLon(i, "harare") ?? 31.05, 2), lat: round(placeLat(i, "harare") ?? -17.83, 2), y0: 1890, y1: 2020, names: harare.line, rulers: null, kind: kindWord,
        cam: { lon: 31, lat: -17.6, vw: 40, mvw: 24 }, note: `Names from the Atlas's dated-names catalogue: ${harare.old.name} until ${harare.old.to}.` },
    },
    forms, pins,
    hubs: [hubA && [17.8, 47.6, 4.6, hubA.name, "#D1A154", -1], hubY && [18.2, 43.6, 3.7, hubY.name, "#C86A50", 1]].filter(Boolean),
    match,
  };

  const chip = (t) => `<button class="chip" type="button" data-try="${esc(t)}">${esc(t)}</button>`;
  const ex = {
    placeholder: esc(fiume.old.name),
    chips: [fiume.old.name, sur.name, harare.old.name].map(chip).join(""),
    givenEq: EXAMPLES.givenForms.map((f) => `<i>${esc(f)}</i>`).join('<span class="eqs">=</span>'),
    flagRow: rulers.map((r, k) => {
      const start = k === 0 ? `to ${r[0]}` : String(rulers[k - 1][0]);
      return `<div class="fl"><canvas data-flag="${r[2]}" width="168" height="112"></canvas><span><b>${start}</b><br>${esc(r[4])}</span></div>`;
    }).join(""),
    legend: [...new Map(rulers.map((r) => [r[2], r])).values()].map((r) => `<span><i class="sw" style="--c:${r[3]}"></i>${esc(r[4])}</span>`).join(""),
    callout: filedEra ? `A ${EXAMPLES.filedYear} baptism may be filed under <b>${esc(filedEra[4])}</b>` : "A record may be filed under another country",
    words: esc(exWords.join(" ")),
  };

  const sr = [
    `An invented grandmother, Nonna, left one clue: an old photograph with one word written on the back, ${fiume.old.name}. The question every visitor arrives with is: where is that record, and can I see it tonight? The atlas covers ${n.places} places, ${n.regions} record regions and ${n.volumes} register volumes. Type a place, a surname or a first name to begin. Examples to try: ${fiume.old.name}, ${sur.name}, ${harare.old.name}.`,
    `${fiume.old.name} is not on a modern map. Drag the year slider and the name changes: ${fiume.old.name} until ${fiume.old.to}, then ${pnFiume.name}, while the ruling flag changes with the eras of its record region: ${rulers.map((r) => r[4]).join(", ")}. The names come from the Atlas catalogue and the flags are simplified. Same place, every name it has had. The find box matches every name a place has had: the gazetteer behind it holds ${n.altPlaces} places that carry other names, ${n.altNames} other names in all. Another example: ${harare.old.name} is ${pnHarare.name}, renamed in ${harare.old.to}.`,
    `Her surname moved too. The example surname ${forms[0]} breaks into letters and re-forms as spellings the catalogue holds: ${forms.slice(1).join(", ")}. In ${homeWhere.map(cn).join(", ")} the forms ${forms.slice(0, 3).join(", ")} are found; the form ${forms[3]} is found in ${abroadWhere.map(cn).join(", ")}. A surname is spelt by the clerk, not the family. A first name does the same: ${EXAMPLES.givenForms.slice(0, -1).join(", ")} and ${EXAMPLES.givenForms.slice(-1)} are one name. The catalogue holds ${n.surnameFamilies} surname families and ${n.givenNames} given names in ${n.givenForms} forms.`,
    `The town changed hands, and each change of flag changed which archive holds the paper. Flags on the town, in order: ${rulers.map((r) => `${r[4]}${r[0] === 9999 ? " now" : " until " + r[0]}`).join("; ")}. The map recolours by era; the borders here are illustrative and simplified, not the Atlas data. A record from ${EXAMPLES.filedYear} may be filed under ${filedEra ? filedEra[4] : "another country"}. The atlas has ${n.flagPages} flag pages, ${n.eras} eras in ${n.regions} record regions, and groups countries into ${n.hubs} hubs by region${hubA && hubY ? `, for example ${hubY.name} and ${hubA.name}, which overlap where ${hubNote.replace(" cross over", "")} cross over` : ""}.`,
    `So who holds the paper? Every dot on the atlas map is coloured by what it would cost you to look: free images with no account, free images with an account, an index only, part free and part paid, behind a paywall, a catalogue entry with nothing photographed, on paper in a building, or grey, which means nobody has looked yet. That is eight states. The colours in this picture are illustrative: the real cost of each place is on the Atlas map. Zoomed in, register volumes stack up as book spines on a place. A grey dot means nobody has looked, never that nothing is there.`,
    `Not every record is a register. Australia has no parish registers: ${n.newspapers} digitised newspapers are the record for most ancestors before 1950. The clipping shown is an invented example.`,
    `Found it. Now read it. An invented example register page has a line reading die 30 7bris 1671. The Record Reader decodes a date: 7bris is September, so the line is 30 September 1671. A name found in the register, Joannes, is the same name as John in the Names catalogue. For a register entry or a page image, Claude gives a draft reading that you check; it is used only when you press the button. The reader has ${n.terms} sourced terms.`,
    `Now put her in a tree. A family-tree file, a GEDCOM, is dropped on the Tree Canvas. It is read in your browser and never uploaded. People fly onto the canvas as cards, in an invented family: You, Mother, Father, Nonna, Nonno and four great-grandparents. The same people can be seen as a tree, a fan, a night sky, lifespans and place lanes; there are more views, among them surnames, generations and household. A Fix list shows what needs tidying in your own tree, and a small red cross under a card says why a line stops there. Living people appear by name only.`,
    `Then follow where she went. Compass puts the family on the map through time. In this invented example the journey runs from Fiume in 1921, to Genoa in 1949, to Melbourne in 1950, drawn as dashed arcs with a small suitcase moving along them while a year slider plays. The dashed line joins places in order; it is not the route the family took. Beside it, the registers to ask for at each place, shown here as an example.`,
    `Keep what you find. Your research lives in this browser and nowhere else unless you back it up, with no account. You can save a file you own and import it on another device. Or keep an encrypted copy online using six words, made for you, for example ${exWords.join(" ")}; the server cannot read it, and lost words cannot be recovered. Nothing is sent unless you press Read it with Claude.`,
    `Take it with you. The Connect page offers every data file with a one-line curl command, no key or login; a read-only API that any website may call; an MCP server for AI assistants, read-only with no key; Sync, which keeps one encrypted copy of your research; and Ask Claude, which reads a pasted register line or a document photo and is metered.`,
    `Here is what we do not know. Of ${n.places} places on the map, ${n.unsurveyedPct} per cent have not yet been surveyed; ${n.surveyed} carry a cost to look that somebody established, and only ${n.walked}, in ${n.walkedCountries} countries, have been walked volume by volume. A grey dot means nobody has looked, never that nothing is there. That is the invitation: if you know a source the atlas lacks, you can add it. There is no login and no moderation queue; the form writes the message for you and nothing is sent from the page. It will be checked against the source before anything changes.`,
    `Your turn. Three doors: type a name, drop in a tree, or tell a story. Also the map, names, flags, history, the Record Reader and Connect. Where it came from: out of one family's archive, opened to the world; there are ${n.archivesWord} such archives. How it is built: a static site with no server, no database and no account; the data is plain JSON in a public repository, checked before it ships. Country outlines are Natural Earth, the gazetteer is GeoNames under CC BY 4.0, and maps are OpenStreetMap. Behind the atlas: what is being done, letters to send, my work, and what changed.`,
  ].map(esc);
  return { n, ex, sr, b, data };
}
function round(v, d) { const k = 10 ** d; return Math.round(v * k) / k; }
const placeLon = (i, id) => { const p = i.full.find((q) => q.id === id); return p ? Number(p.lon) : undefined; };
const placeLat = (i, id) => { const p = i.full.find((q) => q.id === id); return p ? Number(p.lat) : undefined; };

/* ---------- cached, for the page and the fragment endpoint ---------- */
let INPUTS = null;
export function inputs() { return INPUTS || (INPUTS = loadInputs()); }
const NUMS = new Map();
export function startNumbers(extra = {}) {
  const k = String(extra.countriesKnown);
  if (!NUMS.has(k)) NUMS.set(k, computeStartNumbers(inputs(), extra));
  return NUMS.get(k);
}
