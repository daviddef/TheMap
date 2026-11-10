import test from "node:test";
import assert from "node:assert/strict";
import { inShard } from "../src/lib/shard.js";

test("unset keeps every page", () => {
  delete process.env.RA_SHARD;
  assert.equal(inShard("senj"), true);
});

test("every slug lands in exactly one slice, and a finer slice nests in a coarser one", () => {
  const slugs = Array.from({ length: 500 }, (_, i) => "place-" + i);
  try {
    for (const s of slugs) {
      let hits = 0;
      for (let i = 0; i < 8; i++) { process.env.RA_SHARD = i + "/8"; if (inShard(s)) hits++; }
      assert.equal(hits, 1, s);
      process.env.RA_SHARD = "0/16"; const fine = inShard(s);
      process.env.RA_SHARD = "0/8"; const coarse = inShard(s);
      if (fine) assert.equal(coarse, true);
    }
  } finally { delete process.env.RA_SHARD; }
});

test("a bad value is refused, not ignored", () => {
  process.env.RA_SHARD = "9/4";
  try { assert.throws(() => inShard("x")); } finally { delete process.env.RA_SHARD; }
});
