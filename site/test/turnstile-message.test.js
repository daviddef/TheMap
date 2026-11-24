/* "Cloudflare error": the bot check showed «Unable to connect to website» and the page said nothing. The page now hears the widget's error and says what to do,
   naming the address when it is not recordatlas.org (the check is only set up for that host). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of ["ask-claude.js", "story-read.js"]) {
  const js = fs.readFileSync(path.join(here, "../public/js", f), "utf8");
  test(f + ": a widget error ends the wait with a message, instead of a silent 20 seconds", () => {
    assert.match(js, /"error-callback": function \(c\) \{ token = null; tsErr = String\(c \|\| "x"\); \}/);
    assert.match(js, /else if \(tsErr\) \{ clearInterval\(t\); var em = tsErr; tsErr = null; fail\(new Error\(tsMessage\(em\)\)\); \}/);
    assert.match(js, /The bot check could not connect/);
    assert.match(js, /It only works on recordatlas\.org, and this is/);
    assert.match(js, /challenges\.cloudflare\.com and try once more/);
  });
}
