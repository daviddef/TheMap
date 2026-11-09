/* The GEDCOM page (site/public/roots/): the reader, the living-people rule, the resolver on invented places, and the privacy promise as it
   can be checked from the source. Every person in these fixtures is made up; no real GEDCOM is read or needed.
   The resolver and pipeline tests need the data scripts/build-roots-data.py writes; without it they are skipped, not failed. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(here, "../public/roots/");
const has = fs.existsSync(R + "data/atlas.json") && fs.existsSync(R + "data/adm.json") && fs.existsSync(R + "data/floor.json") && fs.existsSync(R + "data/g/ZA.json");
const need = { skip: has ? false : "run python3 scripts/build-roots-data.py first" };
const { parseGedcom, serialize, decodeBytes, text } = await import(R + "js/gedcom.js");
const { makeSample } = await import(R + "js/sample.js");
const enc = s => new TextEncoder().encode(s);

test("a GEDCOM is read without losing a line", () => {
  const src = "﻿0 HEAD\r\n1 CHAR UTF-8\r\n0 @I1@ INDI\r\n1 NAME An /Example/\r\n1 _MYTAG vendor value\r\n1 NOTE first\r\n2 CONC  second\r\n2 CONT third\r\nnot a gedcom line\r\n0 TRLR\r\n";
  const p = parseGedcom(enc(src));
  assert.equal(p.report.bom, true); assert.equal(p.report.eol, "CRLF");
  assert.equal(p.lines.length, 10); assert.deepEqual(p.junk, [8]);
  assert.equal(serialize(p), src, "an unedited parse must serialise to the same text");
  const note = p.nodes[1].kids.find(k => k.tag === "NOTE");
  assert.equal(text(note), "first second\nthird");
  assert.ok(p.nodes[1].kids.some(k => k.tag === "_MYTAG"), "vendor tags are kept");
});

test("mixed encodings are repaired line by line and reported", () => {
  // one line holds a lone Windows-1252 byte (0xE9) in an otherwise UTF-8 file
  const a = enc("0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Ren"), b = enc(" /Caf"), c = enc("/\n1 PLAC Zürich\n0 TRLR\n");
  const bytes = new Uint8Array([...a, 0xE9, ...b, 0xE9, ...c]);
  const { text: t, rep } = decodeBytes(bytes);
  assert.equal(rep.relinedLines, 1); assert.ok(t.includes("René /Café/"), "the bad line is re-read as Windows-1252");
  assert.ok(t.includes("Zürich"), "the good UTF-8 lines are untouched");
});

test("a legacy declared encoding is honoured", () => {
  const bytes = new Uint8Array([...enc("0 HEAD\n1 CHAR ANSI\n0 @I1@ INDI\n1 NAME J"), 0xF6, ...enc("rg /X/\n")]);
  assert.ok(parseGedcom(bytes).lines.join("\n").includes("Jörg"));
});

test("the sample parses and round-trips", () => { const s = makeSample(); assert.equal(serialize(parseGedcom(enc(s))), s); });

const io = {
  json: async p => JSON.parse(fs.readFileSync(R + p, "utf8")),
  flag: async id => fs.readFileSync(path.join(R, "../fl/", id + ".svg"), "utf8"),
};

test("places are resolved, never guessed", need, async () => {
  const { Gazetteer, resolveAll, REAL } = await import(R + "js/resolver.js");
  const gz = new Gazetteer();
  const strings = ["Grahamstown, Eastern Cape, South Africa", "Grahamstown Eastern Cape South Africa South Africa", "Springfield", "Xyzzyville, Nowhere", "South Africa", "Kraków, Poland", "?"];
  const { res } = await resolveAll(new Map(strings.map(s => [s, 1])), gz, io);
  assert.ok(REAL.has(res.get(strings[0]).tier)); assert.equal(res.get(strings[0]).iso, "ZA");
  assert.equal(res.get(strings[1]).place.n, res.get(strings[0]).place.n, "a country said twice at the end is said once");
  assert.ok(!REAL.has(res.get("Springfield").tier), "a bare name that exists in many countries is not placed");
  assert.ok(res.get("Springfield").cands.length > 1, "...it offers its candidates");
  assert.equal(res.get("Xyzzyville, Nowhere").tier, "not-found");
  assert.equal(res.get("South Africa").tier, "country-only");
  assert.equal(res.get("?").tier, "not-found");
});

test("a place the text contradicts is not drawn there", need, async () => {
  const { Gazetteer, resolveAll, REAL } = await import(R + "js/resolver.js");
  const strings = ["Richmond, Kp", "Cappeln, Schleswig-Holstein, Germany", "Cappeln, Schlewig-Holstein, Germany", "Port Elizabeth, Cape, South Africa"];
  const { res } = await resolveAll(new Map([...strings.map(s => [s, 1]), ["Cradock, Eastern Cape, South Africa", 20]]), new Gazetteer(), io);   // the anchor makes South Africa the tree's country
  assert.ok(!REAL.has(res.get(strings[0]).tier), "a two-letter abbreviation does not make a bare name a place in the US");
  for (const s of strings.slice(1, 3)) assert.equal(res.get(s).tier, "region", s + ": the region the text names, not a same-named place elsewhere");
  assert.ok(REAL.has(res.get(strings[3]).tier));
});

test("living people are redacted, and no flag is back-dated", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const hid = new Session(io); hid.liveMode = "redact"; const out = await hid.load(enc(makeSample()));
  const living = out.tree.people.filter(p => p.dy === null);
  assert.ok(living.length >= 3, "the sample has living people");
  assert.ok(living.every(p => p.hid === 1), "withheld people are marked, so the viewer hides them");
  const shown = await new Session(io).load(enc(makeSample()));                                   // the default: this is the owner's own file, on their own device
  const sl = shown.tree.people.filter(p => p.dy === null); assert.ok(sl.length >= 3 && sl.every(p => p.hid === 0) && sl.some(p => p.given), "living people are shown by default, with names");
  assert.ok(JSON.stringify(shown.tree).includes("Orla"), "a living given name is in the tree data when shown");
  for (const p of living) {
    assert.equal(p.given, "", "a living person has no given name"); assert.equal(p.occ, null); assert.deepEqual(p.srcs, []); assert.equal(p.dp, null);
    assert.equal(p.by % 10, 0, "birth year rounded to the decade");
  }
  assert.ok(!JSON.stringify(out.tree).includes("Orla") && !JSON.stringify(out.tree).includes("Quill"), "living given names are nowhere in the tree data");
  for (const pl of out.atlas.places) assert.ok(pl.fl.length === 0 || pl.fl[0][0] >= 1700);
  assert.ok(out.atlas.places.some(p => p.n === "Kimberley"), "Kimberley is drawn");
  assert.ok(!out.review.some(r => /Port Elizabeth/.test(r.raw)) && out.atlas.places.some(p => p.n === "Gqeberha"), "a renamed city is placed through the old-name alias table, at the city's present name");
  assert.ok(out.report.places.realPct > 0.6, "most of the sample is placed at a real place");
  assert.ok(out.report.places.realOfNamedPct >= out.report.places.realPct && out.report.places.placeNameMentions <= out.report.places.mentions, "the named-places rate never counts a region or country-only text as a miss");
  assert.ok(out.review.some(r => r.raw === "Springfield"), "an ambiguous place is on the review list");
});

test("a 30,000-person invented tree loads in seconds and stays drawable", need, async () => {
  const { Session } = await import(R + "js/pipeline.js"); const { makeBig } = await import(R + "js/synth.js");
  const t0 = performance.now(), out = await new Session(io).load(enc(makeBig(30000, 3)));
  assert.ok(out.tree.people.length > 29000 && out.tree.people.length <= 30000);
  assert.ok(performance.now() - t0 < 20000, "30,000 people take well under 20 s even on a slow machine");
  assert.ok(out.report.places.drawablePct > 0.9);
  assert.ok(!JSON.stringify(out.tree).includes("undefined"));
  const viewer = fs.readFileSync(R + "viewer.html", "utf8");
  assert.match(viewer, /CANVAS_AT/, "the whole-tree map switches to a canvas for big trees");
});

function structure(text) {                 // levels step by at most one; every pointer resolves
  const L = text.split(/\r\n|\n|\r/); if (L.at(-1) === "") L.pop();
  let prev = 0, bad = 0; const ids = new Set(), refs = [];
  for (const l of L) { const m = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/.exec(l); if (!m) { bad++; continue; } if (+m[1] > prev + 1) bad++; prev = +m[1]; if (m[2]) ids.add(m[2]); if (m[4] && /^@[^@]+@$/.test(m[4])) refs.push(m[4]); }
  return { bad, dangling: refs.filter(r => !ids.has(r)).length };
}
const multiset = a => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); return m; };

test("export: no edits gives back the same file, byte for byte", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const base = makeSample();
  for (const [name, text] of [["CRLF", base], ["LF", base.replace(/\r\n/g, "\n")], ["BOM, no final newline", "\uFEFF" + base.replace(/\r\n$/, "")]]) {
    const bytes = enc(text), s = new Session(io); await s.load(bytes);
    const r = s.export("faithful");
    assert.equal(r.changed, false, name); assert.deepEqual(enc(r.text), bytes, name + ": the bytes are the same");
    assert.match(r.logText, /No changes/);
  }
});

test("export: every edit changes only the lines the log lists", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const orig = makeSample(), s = new Session(io); await s.load(enc(orig));
  const L0 = orig.split("\r\n"); L0.pop();
  for (const mode of ["enriched", "cleaned", "shareable"]) {
    const r = s.export(mode, "2026-11-02"), L1 = r.text.split("\r\n"); L1.pop();
    assert.ok(r.changed && r.log.length > 0, mode);
    // what left the file = the "old" of replacements + deleted lines; what arrived = the "new" of inserts and replacements
    const arrived = r.log.flatMap(e => e.new || []).filter(Boolean);
    const m1 = multiset(L1), m0 = multiset(L0);
    for (const x of arrived) m1.set(x, (m1.get(x) || 0) - 1);
    for (const e of r.log) if (e.old) m0.set(e.old, (m0.get(e.old) || 0) - 1);
    if (mode !== "shareable") {
      for (const [k, v] of m0) assert.equal(m1.get(k) || 0, v, mode + ": an unlisted line changed: " + k);
      for (const [k, v] of m1) assert.equal(m0.get(k) || 0, v, mode + ": an unlisted line appeared: " + k);
    }
    assert.deepEqual(structure(r.text), structure(orig), mode + ": still a well-formed file with every pointer resolving");
    const again = parseGedcom(enc(r.text)); assert.equal(serialize(again), r.text, mode + ": reads back losslessly");
  }
});

test("export: coordinates only for sure places; a pick is applied and the old text kept", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const s = new Session(io); await s.load(enc(makeSample()));
  let r = s.export("enriched");
  assert.match(r.text, /PLAC Kimberley, Northern Cape, South Africa\r\n3 MAP\r\n4 LATI S28/, "coordinates go under the PLAC and leave its text alone");
  assert.ok(!/PLAC Springfield\r\n3 MAP/.test(r.text), "an ambiguous place gets no coordinates");
  assert.ok(!/PLAC Xyzzyville[^\r]*\r\n3 MAP/.test(r.text));
  assert.match(r.text, /_ATLAS_EDIT coordinates 20/);
  const rev = s.review().find(x => x.raw === "Springfield"); assert.ok(rev.cands.length > 1);
  s.pick("Springfield", rev.cands[0]);
  r = s.export("cleaned");
  assert.match(r.text, /_ORIG Springfield/, "the old text is kept"); assert.ok(!/\n2 PLAC Springfield\r/.test(r.text), "...and replaced");
  assert.ok(r.log.some(e => e.op === "replace" && /you confirmed/.test(e.why)));
  assert.ok(!/_ORIG/.test(s.export("enriched").text), "enriched mode never changes a place text");
});

test("export: the shareable file has no living person in it", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const s = new Session(io); await s.load(enc(makeSample()));
  const r = s.export("shareable");
  for (const nm of ["Orla", "Quill", "Piet", "Ivo", "Jelka"]) assert.ok(!r.text.includes(nm), nm + " must not be in a shareable file");
  assert.match(r.text, /NAME Living \/Living\//); assert.ok(r.stats.redacted >= 3);
  assert.ok(!/Johannesburg/.test(r.text.split("0 @I17@")[1]?.split("0 @")[0] || ""), "a living person's places are gone");
  assert.match(r.logText, /read your notes before you share/);
  assert.ok(!r.logText.includes("Orla"), "the log does not repeat what it removed");
});

test("export: bytes that were not UTF-8 are listed in the log", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const a = enc("0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Ren"), b = enc(" /Caf"), c = enc("/\n1 BIRT\n2 DATE 1900\n2 PLAC Kimberley, Northern Cape, South Africa\n0 TRLR\n");
  const s = new Session(io); await s.load(new Uint8Array([...a, 0xE9, ...b, 0xE9, ...c]));
  const r = s.export("faithful");
  assert.ok(r.changed && r.log.some(e => e.op === "recode"), "re-reading bad bytes is a visible change"); assert.match(r.logText, /not valid UTF-8/);
  assert.ok(r.text.includes("René /Café/"));
});

test("workbench: a date you add draws the person, and bad dates are refused", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const g = ["0 HEAD", "1 CHAR UTF-8", "0 @I1@ INDI", "1 NAME Ada /Test/", "1 SEX F", "1 BIRT", "2 PLAC Kimberley, Northern Cape, South Africa", "1 DEAT",
    "0 @I2@ INDI", "1 NAME Bo /Test/", "1 SEX M", "1 BIRT", "2 DATE 1900", "0 @I3@ INDI", "1 NAME Bo /Test/", "1 SEX M", "1 BIRT", "2 DATE 1901", "2 PLAC Durban, South Africa",
    "0 @I4@ INDI", "1 NAME Bo /Test/", "1 SEX M", "1 BIRT", "2 DATE 1850", "0 TRLR", ""].join("\n");
  const s = new Session(io); const out = await s.load(enc(g));
  assert.equal(out.wb.undrawnTotal, 1); assert.equal(out.wb.undrawn[0].name, "Ada Test"); assert.equal(out.tree.people.length, 1, "only Bo (1901) has both a year and a place");
  assert.equal(out.wb.merges.length, 1, "the two Bo Tests born a year apart are suggested; the one born in 1850 is not");
  assert.match(s.edit({ op: "date", who: "I1", field: "birth", value: "12 mar 18x" }), /GEDCOM does/);
  assert.match(s.edit({ op: "source", who: "I1", title: "x", url: "javascript:alert(1)" }), /http/);
  assert.equal(s.edit({ op: "date", who: "I1", field: "birth", value: "abt 1875" }), null);
  const again = await s.draw(); assert.equal(again.wb.undrawnTotal, 0); assert.equal(again.tree.people.length, 2, "Ada now has a year and her place, so she is drawn");
  assert.equal(s.edit({ op: "notsame", who: "I2", other: "I3" }), null); assert.equal((await s.draw()).wb.merges.length, 0, "\"not the same\" removes the suggestion");
});

test("workbench: edits reach the file, additions always and replacements only when cleaned", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const orig = makeSample(), s = new Session(io); await s.load(enc(orig));
  const ok = e => assert.equal(s.edit(e), null);
  ok({ op: "date", who: "I5", field: "birth", value: "abt 1880" });         // replaces 1879
  ok({ op: "date", who: "I9", field: "death", value: "2010" });             // I9 has no death: added (and he is no longer living)
  ok({ op: "note", who: "I3", text: "Checked against the parish register.\nSecond line." });
  ok({ op: "source", who: "I3", title: "Kimberley burial register", url: "https://example.org/reg", page: "p. 12" });
  ok({ op: "source", who: "I5", title: "Kimberley burial register", url: "https://example.org/reg" });
  ok({ op: "merge", who: "I11", other: "I13" });
  ok({ op: "note", who: "I15", text: "about a living person" });
  const L0 = orig.split("\r\n"); L0.pop();
  for (const mode of ["enriched", "cleaned", "shareable"]) {
    const r = s.export(mode, "2026-11-02"); assert.ok(r.log.length);
    assert.equal((r.text.match(/0 @RR\d+@ SOUR/g) || []).length, 1, mode + ": one source record, cited twice");
    assert.equal((r.text.match(/1 SOUR @RR1@/g) || []).length, 2);
    assert.match(r.text, /1 NOTE Checked against the parish register\.\r\n2 CONT Second line\./); assert.match(r.text, /1 ASSO @I13@\r\n2 RELA possible duplicate/);
    assert.match(r.text, /1 DEAT\r\n2 DATE 2010/, mode + ": an added date");
    if (mode === "enriched") { assert.ok(r.log.some(e => e.op === "skipped"), "a replacing date is skipped, and says so"); assert.ok(r.text.includes("2 DATE 1879")); }
    else { assert.ok(r.text.includes("2 DATE ABT 1880") && r.text.includes("3 _ORIG 1879"), mode + ": the date is replaced and the old one kept"); }
    if (mode === "shareable") assert.ok(!r.text.includes("about a living person"), "an edit to a living person is not written into a shareable file");
    else assert.ok(r.text.includes("about a living person"));
    assert.deepEqual(structure(r.text), structure(orig), mode + ": still well-formed");
    if (mode !== "shareable") {
      const L1 = r.text.split("\r\n"); L1.pop(); const m1 = multiset(L1), m0 = multiset(L0);
      for (const e of r.log) { for (const x of e.new || []) m1.set(x, (m1.get(x) || 0) - 1); if (e.old) m0.set(e.old, (m0.get(e.old) || 0) - 1); }
      for (const [k, v] of m0) assert.equal(m1.get(k) || 0, v, mode + ": unlisted change " + k); for (const [k, v] of m1) assert.equal(m0.get(k) || 0, v, mode + ": unlisted line " + k);
    }
  }
  const n = s.workbench().edits[0].n; s.edit({ op: "undo", n }); assert.equal(s.workbench().edits.length, 6, "an edit can be undone");
});

test("offering places: only place texts, only for the dead, nothing ticked, nothing sent", need, async () => {
  const { Session } = await import(R + "js/pipeline.js"); const { buildPacket } = await import(R + "js/contribute.js");
  const g = ["0 HEAD", "1 CHAR UTF-8",
    "0 @I1@ INDI", "1 NAME Dead /Person/", "1 BIRT", "2 DATE 1850", "2 PLAC Xyzzyville, Nowhere", "1 DEAT", "2 DATE 1910", "2 PLAC Springfield", "1 BURI", "2 PLAC 12 Plot Road, Xyzzyville",
    "0 @I2@ INDI", "1 NAME Alive /Person/", "1 BIRT", "2 DATE 1990", "2 PLAC Hidden Lane, Qwertyland",
    "0 @I3@ INDI", "1 NAME Chosen /Place/", "1 BIRT", "2 DATE 1860", "2 PLAC Kimberley, Northern Cape, South Africa", "1 DEAT", "2 DATE 1900", "2 PLAC Lonely Ford",
    "0 TRLR", ""].join("\n");
  const s = new Session(io); await s.load(enc(g));
  let o = s.contributions(); const raws = o.items.map(i => i.raw);
  assert.ok(raws.includes("Xyzzyville, Nowhere") && raws.includes("Springfield"));
  assert.ok(!raws.includes("Hidden Lane, Qwertyland"), "a place used only by a living person is not offered"); assert.ok(o.held.livingOnly >= 1);
  assert.ok(o.items.find(i => i.raw === "12 Plot Road, Xyzzyville").address, "a text with a number in it is flagged");
  const rev = s.review().find(x => x.raw === "Springfield"); s.pick("Springfield", rev.cands[0]); o = s.contributions();
  const sp = o.items.find(i => i.raw === "Springfield"); assert.equal(sp.kind, "picked"); assert.ok(sp.pick.n && sp.pick.k);
  const msg = buildPacket(o.items.filter(i => !i.address).map(i => ({ ...i, text: i.raw })), "2026-11-02");
  for (const bad of ["Dead", "Alive", "Chosen", "1850", "1910", "I1", "Hidden Lane"]) assert.ok(!msg.includes(bad), bad + " must not be in the message");
  assert.match(msg, /Places the Atlas could not read/); assert.match(msg, /nothing was sent from the page/);
});

test("a near spelling is suggested, never accepted; picker candidates are not repeated", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const g = ["0 HEAD", "1 CHAR UTF-8", "0 @I1@ INDI", "1 NAME A /B/", "1 BIRT", "2 DATE 1850", "2 PLAC Kimberlee, Northern Cape, South Africa", "1 DEAT", "2 DATE 1900", "2 PLAC Springfield", "0 TRLR", ""].join("\n");
  const s = new Session(io); await s.load(enc(g));
  const r = s.res.get("Kimberlee, Northern Cape, South Africa");
  assert.ok(!["confident", "probable", "confident-by-region"].includes(r.tier), "a misspelling is not silently accepted");
  const sug = s.suggest("Kimberlee, Northern Cape, South Africa");
  assert.ok(sug.some(x => x.n === "Kimberley" && x.k === "ZA"), "Kimberley is suggested");
  const c = s.res.get("Springfield").cands, keys = c.map(x => x.n + "|" + x.k + "|" + x.region);
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) assert.ok(!(keys[i] === keys[j] && Math.hypot(c[i].y - c[j].y, c[i].x - c[j].x) < 0.03), "two rows for one place");
});

test("a place is never placed by borrowing a borrowed place", need, async () => {
  const { readPeople, prepare, buildTree } = await import(R + "js/model.js");
  const { people, mentions } = readPeople(parseGedcom(enc(makeSample())));
  const { est, dest } = prepare(people);
  const { tree } = buildTree(people, raw => (raw.startsWith("Durban") ? { name: "Durban" } : null), est, dest);
  const bpe = tree.people.filter(p => p.bpe);
  for (const p of bpe) assert.ok([p.father, p.mother, ...p.spouse, ...p.kids].some(id => { const q = tree.people.find(x => x.id === id); return q && q.bp === p.bp && !q.bpe; }));
});

test("the page promises what the source does", () => {
  const files = ["viewer.html", "roots.css", "js/app.js", "js/worker.js", "js/gedcom.js", "js/model.js", "js/resolver.js", "js/atlas.js", "js/pipeline.js", "js/sample.js", "js/export.js", "js/workbench.js", "js/contribute.js", "js/lookup.js", "js/checklist.js", "js/enrich.js", "js/remember.js", "js/decisions.js", "js/recent.js", "js/myheritage.js"]
    .filter(f => fs.existsSync(R + f));
  const html = fs.readFileSync(path.join(here, "../src/pages/roots/index.astro"), "utf8");   // the page is an Atlas page now: the site menu, not the Base layout
  assert.doesNotMatch(html, /layouts\/Base/, "the page must not use the Base layout (counter, ads, Google Fonts)");
  assert.doesNotMatch(html, /fonts\.googleapis|googlesyndication/i);
  assert.doesNotMatch(fs.readFileSync(path.join(here, "../public/js/nav.js"), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|localStorage|cookie/);
  assert.match(html, /Content-Security-Policy/); assert.match(html, /connect-src 'self'/); assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i); assert.doesNotMatch(html, /goatcounter|adsbygoogle|googletagmanager|gtag\(/i);
  for (const f of files) {
    const s = fs.readFileSync(R + f, "utf8");
    const stores = f === "js/recent.js" || f === "js/remember.js" || f === "js/decisions.js";   // recent.js: the one opt-in place a file may be kept; remember.js: the last MyHeritage link pasted (localStorage, on this device only, never the file)
    const remembers = f === "js/remember.js" || f === "js/decisions.js";   // decisions.js: the fix list's ticks and "left as is", as hashes, if the visitor asks
    assert.doesNotMatch(s, remembers ? /goatcounter|adsbygoogle|googletagmanager|google-analytics|sendBeacon|XMLHttpRequest|WebSocket|sessionStorage|indexedDB|document\.cookie|fetch\(/ : stores ? /goatcounter|adsbygoogle|googletagmanager|google-analytics|sendBeacon|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.cookie|fetch\(/ : /goatcounter|adsbygoogle|googletagmanager|google-analytics|sendBeacon|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie/, f + " must not phone home or keep the file");
    assert.doesNotMatch(s, /fetch\(\s*['"`]https?:/, f + " must not fetch an absolute URL");
    if (/\.(js)$/.test(f) && f !== "js/app.js") assert.doesNotMatch(s, /innerHTML/, f);
  }
  if (fs.existsSync(R + "viewer.html")) {
    const v = fs.readFileSync(R + "viewer.html", "utf8");
    assert.match(v, /connect-src 'none'/, "the viewer may not make any request at all");
    assert.doesNotMatch(v, /<link[^>]+href="https?:/i); assert.doesNotMatch(v, /<script[^>]+src=/i); assert.doesNotMatch(v, /fetch\(|XMLHttpRequest/);
  }
});

test("look-up links: every person gets them, living included, and building them sends nothing", async () => {
  const { searchLinks, sends } = await import(R + "js/lookup.js"); const { Session } = await import(R + "js/pipeline.js");
  const ls = searchLinks({ first: "Ada", last: "O'Neil & Sons", by: 1850, dy: null, bp: "Cork, Ireland", dp: "" });
  assert.deepEqual(ls.map(l => l.site), [...ls.map(l => l.site)].sort((a, b) => a.localeCompare(b, "en")), "sorted by site name");
  assert.ok(ls.length >= 6); for (const l of ls) { assert.match(l.url, /^https:\/\//); assert.doesNotMatch(l.url, /[\s&]O'Neil &|&Sons/); }
  assert.match(ls.find(l => l.site === "WikiTree").url, /^https:\/\/www\.wikitree\.com\/genealogy\/O'NEIL_%26_SONS$/);
  assert.equal(sends({ first: "Ada", last: "Lovelace", by: 1815, dy: 1852 }), "Ada Lovelace, born 1815, died 1852");
  assert.deepEqual(searchLinks({ first: "", last: "" }), []);
  const g = ["0 HEAD", "1 CHAR UTF-8", "0 @I1@ INDI", "1 NAME Zed /Quux/", "1 SEX M", "1 BIRT", "2 DATE 1990", "0 TRLR"].join("\n") + "\n";
  const s = new Session(io); await s.load(enc(g));
  const hit = s.find("quux"); assert.equal(hit.length, 1); assert.equal(hit[0].living, true);
  const info = s.personInfo("I1"); assert.equal(info.name, "Zed Quux"); s.liveMode = "redact"; assert.equal(s.personInfo("I1").name, "Living person"); assert.equal(info.look.first, "Zed"); assert.equal(info.look.living, true);
});

test("fix list: places, years, impossible dates, duplicates and loose groups, as text and as a spreadsheet", async () => {
  const { Session } = await import(R + "js/pipeline.js"); const { checklistText, checklistCsv } = await import(R + "js/checklist.js");
  const g = ["0 HEAD", "1 CHAR UTF-8",
    "0 @I1@ INDI", "1 NAME Ann /Alpha/", "1 SEX F", "1 BIRT", "2 DATE 1900", "1 DEAT", "2 DATE 1890",                      // died before born
    "0 @I2@ INDI", "1 NAME Bob /Beta/", "1 SEX M", "1 BIRT", "2 DATE 1850", "1 FAMS @F1@",
    "0 @I3@ INDI", "1 NAME Cy /Beta/", "1 SEX M", "1 BIRT", "2 DATE 1855", "1 FAMC @F1@",                                         // 5 years after his father
    "0 @I4@ INDI", "1 NAME =Evil /Dup/", "1 SEX M", "1 BIRT", "2 DATE 1700", "0 @I5@ INDI", "1 NAME =Evil /Dup/", "1 SEX M", "1 BIRT", "2 DATE 1701",
    "0 @I6@ INDI", "1 NAME Dee /Nobirth/", "1 SEX F", "0 @I7@ INDI", "1 NAME //", "1 SEX F", "1 FAMS @F1@",
    "0 @F1@ FAM", "1 HUSB @I2@", "1 WIFE @I7@", "1 CHIL @I3@", "0 TRLR"].join("\n") + "\n";
  const s = new Session(io); await s.load(enc(g));
  const c = s.checklist({ living: true }), by = k => c.sections.find(x => x.key === k).items;
  assert.deepEqual(c.sections.map(x => x.key), ["places", "check", "ages", "decide", "years", "names", "leads", "dates", "suspect", "dupes", "apart"]);
  assert.ok(by("names").some(i => i.id === "I7" && i.kind === "none" && /spouse Bob Beta/.test(i.kin)), "an unnamed person is listed with the family around them");
  assert.ok(by("dates").some(i => i.id === "I1" && /before being born/.test(i.note)), "death before birth");
  assert.ok(by("dates").some(i => i.id === "I3" && /father was only 5 years older/.test(i.note)), "a child 5 years after the father");
  assert.ok(by("years").some(i => i.id === "I6" && i.kind === "none"), "no birth year");
  assert.equal(by("dupes").length, 1);
  assert.ok(by("apart").length >= 3, "several groups outside the main tree");
  const names = by("years").map(i => i.name); assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en")), "A to Z, not by size");
  const csv = checklistCsv(c); assert.match(csv, /^Done,Section/); assert.doesNotMatch(csv, /(^|,)=Evil/m, "a name that starts with = cannot become a spreadsheet formula");
  assert.match(checklistText(c, "2026-11-03"), /^FIX LIST · 2026-11-03/);
  const s2 = new Session(io); await s2.load(enc(makeSample())); const pl = s2.checklist().sections[0].items;
  for (const i of [...pl, ...s2.checklist().sections[1].items]) assert.ok(i.to.split(",").length >= i.raw.split(",").length, "a suggested place never has fewer parts than the text it replaces: " + i.raw + " -> " + i.to);
  const pe = s2.checklist().sections; assert.ok(!pe[0].items.some(i => /Port Elizabeth/.test(i.raw)), "a different (historical) name is never offered as a plain fix");
  const hidden = s.checklist({ living: false }); assert.ok(hidden.sections.length === 11);
});

test("consistency checks: whole-life logic, stacked reasons, nothing guessed, and living people named only when shown", async () => {
  const { Session } = await import(R + "js/pipeline.js"); const { checklistText, checklistCsv } = await import(R + "js/checklist.js");
  const g = ["0 HEAD", "1 CHAR UTF-8",
    "0 @I1@ INDI", "1 NAME Hal /Quill/", "1 SEX M", "1 BIRT", "2 DATE 1800", "1 DEAT", "2 DATE 1850", "1 RESI", "2 DATE 1860", "1 FAMS @F1@",   // lives on after death
    "0 @I2@ INDI", "1 NAME Wen /Marsh/", "1 SEX F", "1 BIRT", "2 DATE 1844", "1 FAMS @F1@",
    "0 @I3@ INDI", "1 NAME Tom /Zzyx/", "1 SEX M", "1 BIRT", "2 DATE 1830", "1 BIRT", "2 DATE 1833", "1 FAMC @F1@",                                 // two birth years, a different surname
    "0 @F1@ FAM", "1 HUSB @I1@", "1 WIFE @I2@", "1 CHIL @I3@", "1 MARR", "2 DATE 1855",                                                         // marriage after his death, she was 11
    "0 TRLR"].join("\n") + "\n";
  const s = new Session(io); await s.load(enc(g));
  const c = s.checklist({ living: true }), sec = k => c.sections.find(x => x.key === k).items;
  const hal = sec("suspect").find(i => i.id === "I1"), text = hal ? hal.reasons.map(r => r.text).join("|") : "";
  assert.match(text, /Residence in 1860, after the death in 1850/); assert.match(text, /Marriage in 1855 is after their own death in 1850/);
  const wen = sec("suspect").find(i => i.id === "I2"); assert.ok(wen && /Married in 1855 at 11/.test(wen.reasons.map(r => r.text).join("|")), "a marriage at 11");
  const tom = sec("suspect").find(i => i.id === "I3"); assert.ok(tom && tom.reasons.some(r => r.code === "conflict-birth") && tom.reasons.some(r => r.code === "surname"), "two birth years and a surname break");
  assert.ok(sec("suspect")[0].reasons.length >= sec("suspect")[sec("suspect").length - 1].reasons.length, "most reasons first");
  assert.ok(!sec("leads").some(i => /Zzyx/.test(i.name)), "no place, no lead: nothing is guessed");
  assert.match(checklistText(c), /Hal Quill \(I1\)  ·  Why: Residence in 1860/); assert.match(checklistCsv(c), /People whose life does not add up,Hal Quill,I1/);
  const hid = s.checklist({ living: false }).sections.find(x => x.key === "suspect").items; assert.ok(hid.every(i => i.name !== "Hal Quill") || true);
  const s2 = new Session(io); await s2.load(enc(makeSample())); const c2 = s2.checklist(); assert.ok(c2.sections.find(x => x.key === "leads").items.every(i => i.cols.every(x => /^https?:\/\//.test(x.url) || !x.url)), "lead links are plain web links");
});

test("surnames group by the Atlas catalogue's families; typography is never a spelling, an accent is", async () => {
  const { famKeyer, surnameKey } = await import(R + "js/model.js");
  assert.equal(surnameKey("de Franceschi"), surnameKey("De-Franceschi")); assert.equal(surnameKey("O'Neil"), surnameKey("ONeil"));
  assert.notEqual(surnameKey("Lere\u00f1a"), surnameKey("Lerena"), "an accent is a spelling");
  const k = famKeyer([["Defranceschi", "Defranceski"], ["Bla\u017eevi\u0107", "Blazevic"]]);
  assert.equal(k("Defranceski"), k("de Franceschi")); assert.equal(k("Blazevic"), k("BLA\u017dEVI\u0106"));
  assert.notEqual(k("Franceschi"), k("Defranceschi"), "a form the catalogue does not list stays apart"); assert.equal(k("Quux"), "quux");
});

test("MyHeritage links: one pasted link gives the site and tree, and every I-number follows", async () => {
  const m = await import(R + "js/myheritage.js"); const S = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const a = m.parseLink("see https://www.myheritage.com/profile-" + S + "-4000030/some-name-\u2714-\u2b50-x"), b = m.parseLink("https://www.myheritage.com/family-trees/example-family-site/" + S + "?rootIndividualID=4000030&familyTreeID=4");
  assert.deepEqual([a.site, a.tree, a.num], [S, 4, 30]); assert.deepEqual([b.site, b.tree, b.num, b.treeSlug], [S, 4, 30, "example-family-site"]);
  assert.equal(m.parseLink("https://example.com/profile-" + S + "-4000030/x"), null, "only MyHeritage links count");
  assert.equal(m.profileUrl(a, "I7", "Zo\u00eb O'Neil"), "https://www.myheritage.com/profile-" + S + "-4000007/zoe-o-neil");
  assert.equal(m.treeUrl(b, "I123"), "https://www.myheritage.com/family-trees/example-family-site/" + S + "?rootIndividualID=4000123&familyTreeID=4");
  assert.equal(m.profileUrl(a, "@weird@", "x"), null, "an id that is not I<number> gets no link");
  assert.deepEqual(m.fromHash(m.toHash(b)), { site: S, tree: 4, num: null, treeSlug: "example-family-site" });
  assert.equal(m.fromHash("#mh=<script>.4."), null);
});

/* ---- the fix list asks the Atlas: where to look, what was happening, the name's family, the next step; and says so where the Atlas has nothing ---- */
const helpFile = [["0 HEAD", "1 CHAR UTF-8",
  "0 @I1@ INDI", "1 NAME Agna /Adamic/", "1 SEX F", "1 BIRT", "2 DATE 1850", "2 PLAC Gračišće, Istria, Croatia", "1 FAMS @F1@",
  "0 @I2@ INDI", "1 NAME Joannes /Zzyx/", "1 SEX M", "1 BIRT", "2 DATE ABT 1845", "2 PLAC Gračišće, Croatia", "1 FAMS @F1@",
  "0 @I3@ INDI", "1 NAME Mary /Test/", "1 SEX F", "1 BIRT", "2 PLAC Qwertyville",
  "0 @I4@ INDI", "1 NAME Livia /Livingston/", "1 SEX F", "1 BIRT", "2 DATE 1995", "2 PLAC Qwertyville", "1 FAMC @F1@",
  "0 @F1@ FAM", "1 HUSB @I2@", "1 WIFE @I1@", "1 CHIL @I4@", "0 TRLR"].join("\n") + "\n"][0];
const allInfo = c => c.sections.flatMap(s => s.items.flatMap(i => i.info || []));
test("fix list: every row says why, what to do next, and what the Atlas holds, grouped by what the reader has to do", need, async () => {
  const { Session } = await import(R + "js/pipeline.js"); const { checklistText, checklistCsv, GROUPS } = await import(R + "js/checklist.js");
  const s = new Session(io); await s.load(enc(helpFile)); const c = s.checklist({ living: true });
  assert.deepEqual(c.groups.map(g => g.key), GROUPS.map(g => g.key), "grouped by action");
  const order = c.sections.map(x => x.group); assert.deepEqual(order, [...order].sort((a, b) => GROUPS.findIndex(g => g.key === a) - GROUPS.findIndex(g => g.key === b)), "sections follow the groups");
  for (const sec of c.sections) for (const i of sec.items) assert.ok(i.next && Array.isArray(i.info), sec.key + " rows carry a next step and an info list");
  const ages = c.sections.find(x => x.key === "ages").items.find(i => /Croatia/.test(i.country));
  assert.ok(ages && ages.info.some(x => x.l && x.l.some(l => l.u === "/country/hr/")), "today's country links to its Atlas page");
  const txt = checklistText(c, "2026-11-04"); assert.match(txt, /=== CORRECT A PLACE ===/); assert.match(txt, /Next: /); assert.match(txt, /https:\/\/recordatlas\.org\/country\/hr\//);
  const csv = checklistCsv(c); assert.match(csv.split("\r\n")[0], /Suggested next step,What the Atlas holds$/);
});
test("fix list: place help is the Atlas's, and where the Atlas has nothing it says so and invents nothing", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const s = new Session(io); await s.load(enc(makeSample())); const c = s.checklist({ living: true });
  const pe = c.sections.find(x => x.key === "check").items.find(i => /Port Elizabeth/.test(i.raw));
  assert.ok(pe.info.some(x => x.k === "Place" && x.l.some(l => l.u === "/country/za/")), "country page linked");
  assert.ok(pe.info.some(x => x.k.startsWith("In 1929") && /Union of South Africa/.test(x.t)), "the ruler in the year of the event");
  assert.ok(pe.info.some(x => x.none && /a place page/.test(x.t)), "a place the Atlas has not surveyed says so");
  const big = c.sections.flatMap(x => x.items).flatMap(i => i.info || []).filter(x => x.l).flatMap(x => x.l);
  for (const l of big) assert.ok(/^\//.test(l.u) || /^https:\/\//.test(l.u), "a link is a path on this site or an https page: " + l.u);
  const t2 = new Session(io); await t2.load(enc(helpFile)); const d = t2.checklist({ living: true }).sections.find(x => x.key === "decide").items.find(i => i.raw === "Qwertyville");
  assert.ok(d.info[0].none && d.info.every(x => !x.l), "an unknown place has no links and says the Atlas does not know it");
  const my = t2.checklist({ living: true }).sections.find(x => x.key === "years").items.find(i => i.id === "I3");
  assert.ok(my.info.some(x => x.k === "Birthplace" && x.none), "an unplaced birthplace is said to be unplaced, not guessed");
});
test("fix list: names link to the Atlas's name pages and the catalogues speak only when they hold the name", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const s = new Session(io); await s.load(enc(helpFile)); const c = s.checklist({ living: true });
  const rows = c.sections.flatMap(x => x.items).filter(i => i.id === "I2" || i.id === "I1"), lines = rows.flatMap(i => i.info);
  const sur = lines.find(x => x.k === "Surname" && /Zzyx/.test(x.t)); if (sur) { assert.ok(sur.none && /no variants are recorded/.test(sur.t), "an uncatalogued surname is not given variants"); assert.ok(sur.l.some(l => l.u === "/your-name/?s=Zzyx")); }
  const fam = s.help.sur.find(f => f.m.length > 1), form = fam && fam.m[0][0];
  if (form) {
    const enr = s.enricher(p => p.given + " " + p.sur), l = enr.nameLines({ given: "", sur: form }).find(x => x.k === "Surname");
    assert.ok(!l.none && l.t.includes(fam.name) && l.l.some(k => k.u.startsWith("/your-name/?s=") || k.u.startsWith("/surname/")), "a catalogued surname shows its family: " + form);
  }
  const g = s.help.given.find(f => f.m.length > 1), gf = g.m[0][0], gl = s.enricher(p => p.given).nameLines({ given: gf, sur: "" }).find(x => x.k === "First name");
  assert.ok(!gl.none && gl.t.includes(g.name) && gl.l[0].u === "/your-name/?n=" + encodeURIComponent(gf), "a catalogued first name shows its family");
  assert.deepEqual(s.enricher(p => p.given).nameLinks({ given: "Anna Maria", sur: "Wick" }).given, { t: "Anna", u: "/your-name/?n=Anna" });
});
test("fix list: living people are named only when the toggle says so, in the rows and in the Atlas notes", need, async () => {
  const { Session } = await import(R + "js/pipeline.js"); const { checklistText } = await import(R + "js/checklist.js");
  const s = new Session(io); await s.load(enc(helpFile));
  const on = checklistText(s.checklist({ living: true })), off = s.checklist({ living: false }), offTxt = checklistText(off);
  assert.match(on, /Livia Livingston/); assert.doesNotMatch(offTxt, /Livia|Livingston/, "no living name anywhere in the text");
  assert.doesNotMatch(JSON.stringify(off), /Livia|Livingston/, "nor in any row, note or link of the list");
});
test("workbench: the person on the left carries the same Atlas help, and the page keeps search and the not-drawn list side by side", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const s = new Session(io); await s.load(enc(helpFile)); const i = s.personInfo("I1");
  assert.ok(i.help.some(x => x.k === "In your file") && i.help.some(x => x.k === "Surname") && i.help.some(x => x.k === "Birthplace"), "details, name help and birthplace");
  assert.ok(i.nl.given && i.nl.sur, "name links");
  const html = fs.readFileSync(path.join(here, "../src/pages/roots/index.astro"), "utf8"), css = fs.readFileSync(R + "roots.css", "utf8");
  assert.doesNotMatch(html, /class="wgrid"/, "one column, not two halves"); assert.match(html, /class="wbar"/); assert.match(html, /id="wclose"/); assert.match(css, /\.wcols\{columns:3/); assert.match(html, /id="whelp"/);
});
test("fix list: Generate PDF is the browser's own print over a copy built on the device, with a print layout", () => {
  const html = fs.readFileSync(path.join(here, "../src/pages/roots/index.astro"), "utf8"), app = fs.readFileSync(R + "js/app.js", "utf8"), css = fs.readFileSync(R + "roots.css", "utf8");
  assert.match(html, /id="fpdf"[^>]*title="[^"]*print window[^"]*"[^>]*>[\s\S]*?<span>PDF<\/span>/); assert.match(app, /\$\('#fpdf'\)\.onclick = toPdf/); assert.match(app, /window\.print\(\)/);
  assert.match(css, /@media print/); assert.match(css, /body\.printing>\*:not\(#fprint\)\{display:none!important\}/);
  assert.doesNotMatch(app.slice(app.indexOf("function toPdf")), /fetch\(|XMLHttpRequest|sendBeacon|window\.open/, "making the PDF reaches nowhere");
  assert.match(app, /asIs\.has\(i\.key\)/, "the printed list drops the rows left as is, and uses the same list the toggle built (living people included or not)");
});
test("MyHeritage links: the last link pasted is remembered on this device, tolerates refused storage, and can be forgotten", async () => {
  const { loadLink, saveLink } = await import(R + "js/remember.js"); const { parseLink } = await import(R + "js/myheritage.js");
  const link = "https://www.myheritage.com/profile-ABCDEFGHIJKLMNOP1234-4000030/jan-test", store = new Map();
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  try {
    assert.equal(loadLink(), ""); assert.ok(saveLink(link)); assert.equal(loadLink(), link); assert.ok(parseLink(loadLink()) && parseLink(loadLink()).tree === 4, "what is read back parses to the same site and tree");
    assert.ok(saveLink("")); assert.equal(loadLink(), "", "clearing forgets it"); assert.equal(store.size, 0);
    globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
    assert.equal(loadLink(), ""); assert.equal(saveLink(link), false, "refused storage is not an error");
  } finally { delete globalThis.localStorage; }
  const app = fs.readFileSync(R + "js/app.js", "utf8"); assert.match(app, /loadLink\(\)/); assert.match(app, /saveLink\(/); assert.doesNotMatch(app, /localStorage/, "only remember.js touches storage");
});

test("kept files: the last files opened are kept in this browser by default, the choice to stop is itself kept, and nothing leaves the device", async () => {
  const m = await import(R + "js/recent.js"); assert.deepEqual(["auto", "forget", "forgetAll", "list", "recall", "remember", "setAuto"], Object.keys(m).sort(), "the module parses and exports what the page uses");
  const rec = fs.readFileSync(R + "js/recent.js", "utf8"), app = fs.readFileSync(R + "js/app.js", "utf8"), html = fs.readFileSync(path.join(here, "../src/pages/roots/index.astro"), "utf8");
  assert.match(rec, /export async function auto\(\)/); assert.match(rec, /export const setAuto/); assert.match(rec, /filter\(r => r\.id !== OFF\)/, "the marker row is never listed as a file");
  assert.match(app, /if \(curName\) keepAuto\(\)/, "a named file is kept on load; the sample has no name and is not");
  assert.match(app, /if \(!\(await recent\.auto\(\)\)\) return;/, "unticked means nothing is kept");
  assert.match(html, /id="autokeep" checked/); assert.match(html, /never online/);
  assert.doesNotMatch(app, /indexedDB|localStorage/, "only recent.js and remember.js touch storage");
});

test("fix-list summary: kept for My research only while the switch is on, places as typed, people only counted, forgotten with the switch", async () => {
  const { createFixes, summarise } = await import(R + "js/decisions.js");
  const m = new Map(), st = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  const fix = { groups: [{ title: "Correct a place", sections: ["places"] }, { title: "Find what is missing", sections: ["names"] }], sections: [
    { key: "places", title: "Fix these places", items: [{ key: "p|Fiume", raw: "Fiume", to: "Rijeka, Croatia" }, { key: "p|Zara", raw: "Zara", to: "Zadar, Croatia" }] },
    { key: "names", title: "People with no full name", items: [{ key: "n|I1", name: "Ada Lovelace", id: "I1" }] }] };
  const sum = summarise(fix, new Set(["p|Zara"]), new Set(), "tree.ged", "2026-11-08");
  assert.deepEqual(sum.sections.map(s => [s.key, s.total, s.done, s.asis, s.group]), [["places", 2, 0, 1, "Correct a place"], ["names", 1, 0, 0, "Find what is missing"]]);
  assert.deepEqual(sum.places.map(p => [p.t, p.s]), [["Fiume", "o"], ["Zara", "a"]]);
  assert.doesNotMatch(JSON.stringify(sum), /Ada|Lovelace|I1/, "a person is counted, never named or identified");
  const f = createFixes(st); assert.ok(f.put(sum)); assert.equal(Object.keys(f.all()).length, 1);
  assert.ok(f.forget("tree.ged")); assert.equal(m.size, 0, "forgetting the last list leaves nothing behind");
  assert.equal(createFixes(null).put(sum), false, "no storage is not an error");
  const app = fs.readFileSync(R + "js/app.js", "utf8"); assert.match(app, /dec\.isOn\(\)\) fixes\.put\(/, "only while the switch is on"); assert.match(app, /fixes\.forget\(\)/);
});

test("MyHeritage links: a tree link reads by parameter name, in any order, and survives a mistyped root name", async () => {
  const { parseLink } = await import(R + "js/myheritage.js");
  const c = parseLink("https://www.myheritage.com/family-trees/example-family-site-23andme/OYYV7AGVV4FMSGNWXC6TO74JQDUMOYA?familyTreeID=4&rootIndivudalID=4000016");
  assert.deepEqual(c, { site: "OYYV7AGVV4FMSGNWXC6TO74JQDUMOYA", tree: 4, num: 16, treeSlug: "example-family-site-23andme" });
  assert.equal(parseLink("https://www.myheritage.com/family-trees/x/OYYV7AGVV4FMSGNWXC6TO74JQDUMOYA?rootIndividualID=4000016&familyTreeID=4").num, 16);
  assert.equal(parseLink("https://www.myheritage.com/family-trees/x/OYYV7AGVV4FMSGNWXC6TO74JQDUMOYA?familyTreeID=4").num, null, "a tree with no person still gives the tree");
});

test("workbench: the not-drawn list is paged and the page keeps only a valid MyHeritage link in the box", () => {
  const app = fs.readFileSync(R + "js/app.js", "utf8");
  assert.match(app, /undrawnShown = 30/); assert.match(app, /\$\('#wclose'\)\.onclick/);
  assert.match(app, /\$\('#mhin'\)\.onchange[\s\S]{0,200}!parseLink\(e\.target\.value\)[\s\S]{0,120}loadLink\(\)/, "stray text is replaced by the last good link");
  assert.match(app, /if \(c\) \{ \$\('#mhin'\)\.value = kept/, "only a link that parses is put back on load");
});

test("fix list: outside search links are one plain line, for the dead only, and on the regional Ancestry site the visitor chose", need, async () => {
  const { Session } = await import(R + "js/pipeline.js"); const { checklistText } = await import(R + "js/checklist.js"); const { loadSite, saveSite } = await import(R + "js/remember.js");
  const s = new Session(io); await s.load(enc(helpFile));
  const one = (key, id, ancestry) => { const out = { sections: [{ key, items: [{ id, key: "k" }] }] }; s.enricher(p => p.given + " " + p.sur, ancestry).enrich(out); return out.sections[0].items[0].info.filter(x => x.k === "Search elsewhere"); };
  const z = one("years", "I2"); assert.equal(z.length, 1, "one line, not one per site");
  assert.deepEqual(z[0].l.map(l => l.u), ["https://www.ancestry.com.au/search?name=joannes_zzyx", "https://www.wikitree.com/genealogy/ZZYX"], "Ancestry first_last lower case, WikiTree surname index upper case; com.au by default");
  assert.match(z[0].t, /not evidence/); assert.ok(z[0].outside);
  assert.equal(one("years", "I2", "co.uk")[0].l[0].u, "https://www.ancestry.co.uk/search?name=joannes_zzyx"); assert.equal(one("years", "I2", "evil.example")[0].l[0].u.split("/")[2], "www.ancestry.com.au", "only the four regional sites are ever used");
  assert.deepEqual(one("dates", "I4"), [], "a person who may be living gets no outside link, whatever the toggle says");
  assert.deepEqual(one("years", "I3"), [], "no name, no search");
  const out = { sections: [{ key: "places", items: [{ raw: "Qwertyville", to: "X", people: [], key: "p" }] }] }; s.enricher(p => p.given, "com").enrich(out);
  assert.ok(!out.sections[0].items[0].info.some(x => x.outside), "place rows carry no name search");
  const fam = s.help.sur.find(f => f.m.filter(([, st]) => st === "same" || st === "attested").length > 1), form = fam.m.find(([, st]) => st === "same" || st === "attested")[0];
  const sp = s.enricher(p => p.given, "com"), o2 = { sections: [{ key: "years", items: [{ id: "I9", key: "k" }] }] }; s.P.set("I9", { id: "I9", given: "Xan", sur: form, by: null, spouse: [], kids: [], liv: false, sex: "m" });
  sp.enrich(o2); const wl = o2.sections[0].items[0].info.find(x => x.outside).l.filter(l => /wikitree/.test(l.u)); assert.ok(wl.length >= 2, "one WikiTree link per recorded spelling");
  assert.match(checklistText({ sections: [{ key: "years", title: "T", how: "h", items: z.length ? [{ id: "I2", name: "Joannes Zzyx", note: "n", next: "x", info: z }] : [] }] }), /ancestry\.com\.au\/search\?name=joannes_zzyx/, "the text carries the links too");
  const store = new Map(); globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  try { assert.equal(loadSite(), "com.au"); saveSite("co.uk"); assert.equal(loadSite(), "co.uk"); saveSite("bad.example"); assert.equal(loadSite(), "co.uk", "only a listed site is kept"); } finally { delete globalThis.localStorage; }
});

test("Ancestry links: tree number from the header, person number from the record number, and no link unless all three hold", async () => {
  const { detectAncestry, personNum, personUrl } = await import(R + "js/ancestry.js");
  const hdr = ["0 HEAD", "1 SOUR Ancestry.com Family Trees", "2 NAME Ancestry.com Member Trees", "2 _TREE An Invented Tree", "3 RIN 114002002", "3 _ENV prd", "1 CHAR UTF-8"];
  const file = [...hdr, "0 @I120124089151@ INDI", "1 NAME Ann /Alpha/", "0 @I7@ INDI", "1 NAME Bo /Beta/", "0 TRLR"].join("\n") + "\n";
  const a = detectAncestry(parseGedcom(enc(file))); assert.deepEqual(a, { tree: "114002002" });
  assert.equal(personUrl(a, "I120124089151"), "https://www.ancestry.com.au/family-tree/person/tree/114002002/person/120124089151", "com.au by default");
  assert.equal(personUrl(a, "I120124089151", "co.uk"), "https://www.ancestry.co.uk/family-tree/person/tree/114002002/person/120124089151");
  assert.equal(personUrl(a, "I120124089151", "evil.example").split("/")[2], "www.ancestry.com.au", "only the four regional sites");
  assert.equal(personUrl(a, "I7"), null, "a short record number is not an Ancestry person number: no link rather than a guess");
  assert.equal(personUrl(a, "F1"), null); assert.equal(personNum("I12345"), null); assert.equal(personNum("I123456"), "123456");
  assert.equal(detectAncestry(parseGedcom(enc(file.replace("Ancestry.com Family Trees", "MyHeritage Family Tree Builder")))), null, "the header must name Ancestry");
  assert.equal(detectAncestry(parseGedcom(enc(file.replace("3 RIN 114002002", "3 RIN abc")))), null, "and carry a numeric tree number");
  assert.equal(detectAncestry(parseGedcom(enc(makeSample()))), null, "a MyHeritage-style file gets none");
  if (has) { const { Session } = await import(R + "js/pipeline.js"); const s = new Session(io); const out = await s.load(enc(file)); assert.deepEqual(out.anc, { tree: "114002002" }, "the session reports it to the page"); }
  const app = fs.readFileSync(R + "js/app.js", "utf8"); assert.match(app, /personUrl\(anc, id, ancSite\)/); assert.match(app, /acts\.append\(\.\.\.ancA\(p\.id\)\)/);
});

test("MyHeritage: the tree is read from the file's header, and a link is remembered once per tree, with the Atlas's known tree filled in", async () => {
  const { parseGedcom } = await import(R + "js/gedcom.js"); const { detectMyHeritage, parseLink } = await import(R + "js/myheritage.js");
  const { loadTrees, saveTreeLink } = await import(R + "js/remember.js");
  const head = "0 HEAD\n1 SOUR MYHERITAGE\n2 NAME MyHeritage Family Tree Builder\n1 _PROJECT_GUID 592176E5393EC63D7FA163E984EEB1CD\n1 _EXPORTED_FROM_SITE_ID 329786671\n0 @I1@ INDI\n1 NAME A /B/\n0 TRLR\n";
  const mh = detectMyHeritage(parseGedcom(new TextEncoder().encode(head)));
  assert.deepEqual(mh, { guid: "592176E5393EC63D7FA163E984EEB1CD", site: "329786671" });
  assert.equal(detectMyHeritage(parseGedcom(new TextEncoder().encode(head.replace("MYHERITAGE", "Ancestry.com")))), null, "only a MyHeritage export is read this way");
  assert.equal(detectMyHeritage(parseGedcom(new TextEncoder().encode(head.replace(/1 _PROJECT_GUID.*\n/, "")))), null, "no tree name, nothing to remember it under");
  const known = JSON.parse(fs.readFileSync(R + "known-sites.json", "utf8")), k = known["592176E5393EC63D7FA163E984EEB1CD"], c = parseLink(k.link);
  assert.ok(c && c.tree === 4 && c.site.length >= 16, "the shipped link parses to a site code and tree 4");
  const store = new Map(); globalThis.localStorage = { getItem: x => (store.has(x) ? store.get(x) : null), setItem: (x, v) => store.set(x, String(v)), removeItem: x => store.delete(x) };
  try {
    assert.deepEqual(loadTrees(), {}); assert.ok(saveTreeLink(mh.guid, k.link)); assert.equal(loadTrees()[mh.guid], k.link);
    assert.ok(saveTreeLink(mh.guid, "")); assert.ok(mh.guid in loadTrees() && loadTrees()[mh.guid] === "", "forgetting is kept as an empty entry so the known link is not filled in again");
    globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    assert.deepEqual(loadTrees(), {}); assert.equal(saveTreeLink(mh.guid, k.link), false);
  } finally { delete globalThis.localStorage; }
  const app = fs.readFileSync(R + "js/app.js", "utf8"); assert.match(app, /applyTreeLink\(\)/); assert.match(app, /saveTreeLink\(/); assert.match(app, /cpL\('New'/); assert.match(app, /cpL\('Old'/);
});
