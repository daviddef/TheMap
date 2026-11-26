/* On My research a book's title opens that FamilySearch book, not the town page. The address comes from the town's own file, looked up by the book's
 * waypoint and never built from it; a book the file does not list keeps the town link. Waypoints and places here are invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");
const S = (() => { const m = { exports: {} }; new Function("module", read("public/js/research-synopsis.js"))(m); return m.exports; })();
const URL1 = "https://www.familysearch.org/ark:/61903/3:1:INVENTED?wc=ZZ11-AAA", URL2 = "https://familysearch.org/search/image/ZZ22-BBB";
const PLACE = { volumes: [{ waypoint: "ZZ11-AAA", url: URL1 }, { waypoint: "ZZ33-CCC" }, { waypoint: "ZZ44-DDD", url: "https://example.invalid/not-familysearch" }],
  moreBooks: [{ waypoint: "ZZ22-BBB", url: URL2 }] };

test("a book's address is the one the town's file holds for its waypoint", () => {
  assert.equal(S.bookUrl("volume:ZZ11-AAA", "/place/nowhere/", PLACE), URL1);
  assert.equal(S.bookUrl("volume:ZZ11-AAA:123", "/place/nowhere/", PLACE), URL1, "a waypoint with a suffix is the same book");
  assert.equal(S.bookUrl("volume:ZZ22-BBB", "/place/nowhere/", PLACE), URL2, "a later book past the first sixty");
});

test("nothing is guessed: no listing, no address", () => {
  for (const id of ["volume:ZZ33-CCC", "volume:ZZ44-DDD", "volume:ZZ99-ZZZ"]) assert.equal(S.bookUrl(id, "/place/nowhere/", PLACE), "", id);
  assert.equal(S.bookUrl("volume:ZZ11-AAA", "/place/nowhere/", null), "", "the town's file has not arrived");
  assert.equal(S.bookUrl("film:ZZ11-AAA", "/place/nowhere/", PLACE), "", "only books");
  assert.equal(S.bookUrl("volume:ZZ99-ZZZ", URL1, null), URL1, "a mark that already holds a FamilySearch address keeps it");
  assert.equal(S.bookUrl("volume:ZZ99-ZZZ", "https://example.invalid/x", null), "");
});

test("the build keeps the first sixty and the link of each later book a family session has marked", () => {
  const py = `
import sys, json
sys.path.insert(0, "../scripts")
import importlib.util
spec = importlib.util.spec_from_file_location("b", "../scripts/build.py"); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
vols = [{"waypoint": "W%02d:%d" % (i, i), "url": "https://www.familysearch.org/x/%d" % i, "from": 1800 + i, "t": "row"} for i in range(1, 8)]
vols[6].pop("url")
kept, more = b.cap_volumes(list(reversed(vols)), 3, {"W02", "W05", "W07"})
same, none = b.cap_volumes(vols[:2], 3, {"W02"})
open("/dev/stdout", "w").write(json.dumps({"kept": [v["waypoint"] for v in kept], "more": more, "same": len(same), "none": none,
  "missing": sorted(b.marked_waypoints("no-such-file.json"))}))
`;
  const out = JSON.parse(execFileSync("python3", ["-c", py], { cwd: path.join(here, ".."), encoding: "utf8" }));
  assert.deepEqual(out.kept, ["W01:1", "W02:2", "W03:3"]);
  assert.deepEqual(out.more, [{ waypoint: "W05:5", url: "https://www.familysearch.org/x/5" }], "marked, past the cap and with an address; only the two fields");
  assert.equal(out.same, 2); assert.deepEqual(out.none, []); assert.deepEqual(out.missing, []);
});

test("every place on My research that names a book uses its address, and fetches the town's file when it is not there yet", () => {
  const page = read("src/pages/my-research.astro"), over = read("public/js/research-overview.js");
  assert.match(page, /function bookName\(r, pid, cls\)/);
  assert.match(page, /data-book-place/);
  assert.match(page, /bookName\(r, null, "mrt"\)/, "the rows");
  assert.match(page, /bookName\(r, pid\)/, "found something in");
  assert.match(over, /function bookEl\(r, pid, text\)/);
  assert.match(over, /bookEl\(r, p\.pid\)/);
  assert.match(over, /volumes: d\.volumes, moreBooks: d\.moreBooks|moreBooks/);
  assert.doesNotMatch(page, /familysearch\.org\/[^"']*" \+ (wp|waypoint)/, "no address is put together from a waypoint");
});
