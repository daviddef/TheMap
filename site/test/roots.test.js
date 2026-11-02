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
  const out = await new Session(io).load(enc(makeSample()));
  const living = out.tree.people.filter(p => p.dy === null);
  assert.ok(living.length >= 3, "the sample has living people");
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
  const files = ["index.html", "viewer.html", "roots.css", "js/app.js", "js/worker.js", "js/gedcom.js", "js/model.js", "js/resolver.js", "js/atlas.js", "js/pipeline.js", "js/sample.js", "js/export.js", "js/workbench.js", "js/contribute.js", "js/lookup.js", "js/checklist.js"]
    .filter(f => fs.existsSync(R + f));
  const html = fs.readFileSync(R + "index.html", "utf8");
  assert.match(html, /Content-Security-Policy/); assert.match(html, /connect-src 'self'/); assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i); assert.doesNotMatch(html, /goatcounter|adsbygoogle|googletagmanager|gtag\(/i);
  for (const f of files) {
    const s = fs.readFileSync(R + f, "utf8");
    assert.doesNotMatch(s, /goatcounter|adsbygoogle|googletagmanager|google-analytics|sendBeacon|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie/, f + " must not phone home or keep the file");
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
  const info = s.personInfo("I1"); assert.equal(info.name, "Living person"); assert.equal(info.look.first, "Zed"); assert.equal(info.look.living, true);
});

test("fix list: places, years, impossible dates, duplicates and loose groups, as text and as a spreadsheet", async () => {
  const { Session } = await import(R + "js/pipeline.js"); const { checklistText, checklistCsv } = await import(R + "js/checklist.js");
  const g = ["0 HEAD", "1 CHAR UTF-8",
    "0 @I1@ INDI", "1 NAME Ann /Alpha/", "1 SEX F", "1 BIRT", "2 DATE 1900", "1 DEAT", "2 DATE 1890",                      // died before born
    "0 @I2@ INDI", "1 NAME Bob /Beta/", "1 SEX M", "1 BIRT", "2 DATE 1850", "1 FAMS @F1@",
    "0 @I3@ INDI", "1 NAME Cy /Beta/", "1 SEX M", "1 BIRT", "2 DATE 1855", "1 FAMC @F1@",                                         // 5 years after his father
    "0 @I4@ INDI", "1 NAME =Evil /Dup/", "1 SEX M", "1 BIRT", "2 DATE 1700", "0 @I5@ INDI", "1 NAME =Evil /Dup/", "1 SEX M", "1 BIRT", "2 DATE 1701",
    "0 @I6@ INDI", "1 NAME Dee /Nobirth/", "1 SEX F",
    "0 @F1@ FAM", "1 HUSB @I2@", "1 CHIL @I3@", "0 TRLR"].join("\n") + "\n";
  const s = new Session(io); await s.load(enc(g));
  const c = s.checklist({ living: true }), by = k => c.sections.find(x => x.key === k).items;
  assert.deepEqual(c.sections.map(x => x.key), ["places", "check", "decide", "years", "dates", "dupes", "apart"]);
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
  const hidden = s.checklist({ living: false }); assert.ok(hidden.sections.length === 7);
});
