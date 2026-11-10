import test from "node:test";
import assert from "node:assert/strict";
import { keyFor, originFor } from "../src/index.js";

test("a folder is its index.html", () => {
  assert.equal(keyFor("/"), "index.html");
  assert.equal(keyFor("/place/senj/"), "place/senj/index.html");
});
test("a file is itself, accents decoded", () => {
  assert.equal(keyFor("/p/senj.json"), "p/senj.json");
  assert.equal(keyFor("/surname/%C5%BEubrini%C4%87/"), "surname/žubrinić/index.html");
});
test("traversal and bad escapes are refused", () => {
  assert.equal(keyFor("/a/../b"), null);
  assert.equal(keyFor("/%E0%A4%A"), null);
});

test("the origin URL always stays on the origin host", () => {
  assert.equal(originFor("https://recordatlas.org", "/place/senj/", "?x=1"), "https://recordatlas.org/place/senj/?x=1");
  assert.equal(originFor("https://recordatlas.org/", "/a", ""), "https://recordatlas.org/a");
  for (const p of ["//evil.com/x", "///evil.com", "//place//senj/", "/\\evil.com"]) {
    const u = new URL(originFor("https://recordatlas.org", p, ""));
    assert.equal(u.host, "recordatlas.org", p);
  }
});
