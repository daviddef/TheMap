/* My research leads with the map: it comes before the family picker, and the long «About the name» card is shut until the reader opens it. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, "../src/pages/my-research.astro"), "utf8");
const intro = fs.readFileSync(path.join(here, "../public/js/name-intro.js"), "utf8");

test("the map, its caption and its hint come before the family picker in the Research panel", () => {
  const at = (id) => page.indexOf('id="' + id + '"');
  assert.ok(at("mr-map") > 0 && at("mr-all") > 0);
  assert.ok(at("mr-map") < at("mr-map-cap") && at("mr-map-cap") < at("mr-dots-hint") && at("mr-dots-hint") < at("mr-all"));
  assert.ok(at("mr-all") < at("mr-stories") && at("mr-stories") < at("mr-body"));
});

test("the name introduction is shut by default and remembers only a choice the reader made", () => {
  assert.match(intro, /root\.open = localStorage\.getItem\(KEY\) === "1"/);
  assert.match(intro, /sum\.addEventListener\("click"/);
  assert.doesNotMatch(intro, /root\.addEventListener\("toggle"/, "drawing the card is not a choice");
});
