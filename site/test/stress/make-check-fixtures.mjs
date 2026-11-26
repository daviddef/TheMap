/* WRITES test/fixtures/story-check/*.json: for each story below, the words, the reading the real reader made of them (with the heavy gazetteer rows left out), and the few
   gazetteer answers the check asks for (which phrases are places, which words are given names, the country names). test/story-check.test.js reads these, so the check is
   tested against REAL readings without the built public/ data. Run it again after a reader change to see what the reader now does with each story:
     node test/stress/make-check-fixtures.mjs          # rewrites the fixtures, prints each story's confidence and problems
   The expectations live in the test, not here: a changed reading that is now right should move the expectation, on purpose. */
import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, ctx } from "./ctx.mjs";
import { opts } from "./invariants.mjs";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(SITE, "test/fixtures/story-check");
const M = { exports: {} }; new Function("module", fs.readFileSync(path.join(SITE, "public/js/story-check.js"), "utf8"))(M);
const K = M.exports;

export const STORIES = {
  /* an invented story of a shape the reader got wrong end to end before #257 */
  "ancestor-line": "I am new here and need help with my family from Croatia. I live outside Croatia, so it is hard. I'm trying to track down my great grandparents and beyond. My great grandfather is Josip PERKOVIĆ and his wife, my great grandmother is Barbara, born LONČAR. That is nearly all I know about them. They're born likely 1900s and Married late 1920s. They had 5 children and one of them is my grandma born 1944. They lived in Dreznik near Nova Gradiska. I think one of their sons, Stjepan, moved away to Austria while my grandma went to Austria too, then Bosnia and finally settling in Macedonia after she married. The 3 kids stayed in Croatia. If anyone recognises them, or has them in a tree, please say, as I cannot get further back. And their 5 kids are Katica, Zora, Anica, Stjepan, and one unknown brother. I have put a picture of Barbara with two of her daughters beside her, Katica and Anica if that helps.",
  /* realistic messy ones, written the way a forum or group post is */
  "named-grandfather-kids": "My grandfather Antonio Rossi was born in 1921 in Fiume. He married Maria Bianchi in 1946 and they had four children: Giovanni, Luisa, Paolo and my mother Anna. They left for Australia in 1952 and settled in Adelaide.",
  "mums-side": "My mum's side is from Slovenia. Her mother, Marija Kos, was born in Idrija in 1930 and her father Jože Kos was a miner. Mum was born in 1955 in Ljubljana and moved to Melbourne in 1975.",
  "step-family": "My dad's stepfather Franz Huber came from Graz. Dad's real father died in the war in 1944. Dad's mum Anna remarried in 1947 and they moved to Vienna.",
  "argentina": "My nonna Giuseppina was born in a small village near Udine called Ovaro in 1899. Her husband Luigi emigrated to Buenos Aires in 1923 and she followed in 1925 with their two sons Pietro and Mario.",
  "maiden-priest": "My great aunt Katarina Horvat was a nun in Zagreb. Her brother, Father Josip Horvat, was a priest in Senj. Our grandmother was born Maria Horvat in 1901 and married Ivan Blažević.",
  "partial-dates": "Somebody told me my great grandfather came to Canada around 1910 from somewhere in Galicia. He had a brother who stayed behind and three sisters. Not sure of any names.",
  "nickname": "My grandfather Giovanni, who everyone called Nino, was born in Trieste in 1915. His brother 'Bepi' went to Canada.",
  "several-countries": "My grandmother was born in Pula in 1928 when it was Italy, grew up in Zadar, fled to Italy after the war, then went to Chicago in 1956.",
  "facebook-post": "Hello everyone, looking for info on my grandad Michael Murphy b. 1890 Cork. He went to Boston 1910 and married Bridget O'Sullivan. Their kids were Tom, Peg and Mary.",
  /* stories the reader reads well: the check must stay quiet */
  "clean-grandfather": "My grandfather was born in Cork in 1900 and moved to Boston in 1923.",
  "clean-full-name": "Ivan Blazevic was born in Senj in 1880 and died in Rijeka in 1950.",
  "clean-occupation": "Giovanni Bianchi, farmer, born Udine 1890, emigrated to Buenos Aires 1912.",
  "clean-photo": "My great-grandfather Ivan Kauzlarić came from Fužine to Pittsburgh around 1928. All I have is this photo.",
};

const strip = (k, v) => {
  if (k === "row") return v && { n: v.n, cc: v.cc };
  if (k === "pool" || k === "info" || k === "surnameFam" || k === "forms" || k === "groups" || k === "family" || k === "by" || k === "mort" || k === "plan") return undefined;
  if (k === "given" && v && typeof v === "object") return undefined;
  if (k === "alts") return Array.isArray(v) ? v.map((a) => ({ n: a && a.n })) : v;
  return v;
};
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
for (const [id, text] of Object.entries(STORIES)) {
  const p = parse(text), r = K.check(text, p, opts);
  const toks = K.tokens(text).map((t) => t.f), phrases = new Set(), given = new Set();
  for (let i = 0; i < toks.length; i++) { for (let n = 1; n <= 3 && i + n <= toks.length; n++) { const ph = toks.slice(i, i + n).join(" "); if (opts.isPlace(ph)) phrases.add(ph); } if (opts.isGiven(toks[i])) given.add(toks[i]); }
  fs.writeFileSync(path.join(OUT, id + ".json"), JSON.stringify({ id, text, reading: JSON.parse(JSON.stringify(p, strip)), places: [...phrases], given: [...given], countries: ctx.countries }, null, 1) + "\n");
  console.log(`${id.padEnd(24)} ${r.confidence.padEnd(5)} ${r.problems.filter((x) => x.severity !== "info").map((x) => x.severity[0] + ":" + x.code).join(" ")}`);
}
