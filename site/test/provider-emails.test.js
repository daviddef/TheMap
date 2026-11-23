/* Who to e-mail for each archive (David: «all the "where the paper is", do we know who people should email for each ... add an email icon»).
   The addresses are role mailboxes our family archives wrote to or read off an institution's own page; a dead one is never shown; Wikidata fills in
   only where nothing else is known; and the row carries an icon that is a mailto link with the state as its tooltip. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const data = JSON.parse(readFileSync(root + "data/provider-emails.json", "utf8"));
const map = readFileSync(root + "site/src/components/RecordMap.astro", "utf8");
const attach = JSON.parse(execFileSync("python3", ["-c", "import sys,json;sys.path.insert(0,'scripts');import provider_emails as p;print(json.dumps(p.em_by_provider()))"], { cwd: root, encoding: "utf8" }));

test("every address is a role mailbox with a state, a source and a note; no free-mail, no duplicates", () => {
  const seen = new Set();
  for (const e of data.emails) {
    assert.ok(data.states[e.state], e.email + " has a state the file defines");
    assert.ok(e.via && e.note, e.email + " says where it was met and what was done");
    assert.ok(!/@(gmail|me|icloud|hotmail|outlook|yahoo)\./i.test(e.email), e.email + " is not a person's free-mail");
    assert.ok(!seen.has(e.email.toLowerCase()), e.email + " once");
    seen.add(e.email.toLowerCase());
  }
});

test("a dead address is kept so nobody tries it again, and is never attached to a provider", () => {
  const dead = data.emails.filter((e) => e.state === "dead").map((e) => e.email.toLowerCase());
  assert.ok(dead.includes("sandfdoc@mweb.co.za"));
  for (const v of Object.values(attach)) for (const a of v) assert.ok(!dead.includes(a[0].toLowerCase()), a[0]);
});

test("the best state leads, a branch mailbox does not, and Wikidata is only a fallback", () => {
  assert.equal(attach["dari"][0][0], "obrada@riarhiv.hr", "the Rijeka head office leads, not the Senj branch that answered");
  assert.equal(attach["gospic"][0][1], "answered");
  assert.ok(attach["gospic"].every((a) => a[1] !== "wikidata"), "a provider with an address we met never shows Wikidata's older one");
  assert.ok(Object.values(attach).some((v) => v[0][1] === "wikidata"), "and Wikidata fills the providers nobody has written to");
});

test("the Where the paper is row carries the icon as a mailto link whose tooltip names the address and how far to trust it", () => {
  assert.match(map, /function mailIcon\(em, name, pid\)/);
  assert.match(map, /href="mailto:' \+ esc\(a\[0\]\)/);
  assert.match(map, /MAIL_WHY = \{ answered:/);
  assert.match(map, /mailIcon\(em, name, pid\) \+ '<span class="ra-vy">'/, "on the new front door, before the distance");
  assert.match(map, /\}, null, x\.p\.em, x\.p\.id\)\);/, "the archive rows pass the provider's addresses");
});
