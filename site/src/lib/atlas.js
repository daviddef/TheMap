/* THE WHOLE ATLAS, FOR THINGS THAT ARE NOT THE MAP.

   index.json was split in two so the map can draw before the quiet dots
   arrive: index.json carries the places that have something to show,
   index-quiet.json the ones that are real ground nobody has walked yet.
   That split is a loading strategy for ONE consumer — the browser.

   Every static page is built on a machine with the whole file already on
   disk and nothing to wait for. Left to import index.json alone they
   would have quietly dropped 4,904 places: no /place/<id>/ page for any
   of them, missing from their country's list, absent from the coverage
   totals. So the pages import this instead, and get the index whole.

   READ FROM DISK, NOT IMPORTED. This used to `import idx from
   "../../public/index.json"`, which works only because a bundler
   rewrites it — plain Node refuses a JSON import without an attribute,
   so the module could not be loaded by a test, and the one part of the
   build that decides whether 21,085 places exist had no way to be
   checked outside a full build. It also asks Vite to inline both files
   into every page that imports them, which is the cost that killed the
   build when the surname corpus grew. Same pattern as
   lib/surname-corpus.js, for the same two reasons. */
import fs from "node:fs";
import path from "node:path";

const ROOTS = [
  path.join(process.cwd(), "public"),
  path.join(process.cwd(), "site", "public"),
];

function read(name) {
  for (const r of ROOTS) {
    try {
      return JSON.parse(fs.readFileSync(path.join(r, name), "utf8"));
    } catch { /* try the next root */ }
  }
  throw new Error(
    `${name} not found — looked in:\n  ` + ROOTS.join("\n  ") +
    "\nRun `npm run data` (scripts/build.py writes it).");
}

let cached = null;

function load() {
  if (cached) return cached;
  const idx = read("index.json");
  let quiet = { places: [] };
  /* The quiet half is promised by a stub in index.json. If index.json
     says it exists it must be there — a missing half is 4,904 places
     silently gone, which is the bug this module was written for. */
  if (idx.quiet && idx.quiet.file) quiet = read(idx.quiet.file);
  cached = { ...idx, places: idx.places.concat(quiet.places || []) };
  return cached;
}

export const atlas = new Proxy({}, {
  get: (_, k) => load()[k],
  has: (_, k) => k in load(),
  ownKeys: () => Reflect.ownKeys(load()),
  getOwnPropertyDescriptor: (_, k) =>
    Object.getOwnPropertyDescriptor(load(), k),
});

export default atlas;
