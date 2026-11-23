/* WHICH SPELLINGS ARE THE SAME FAMILY, FOR MY RESEARCH'S «LOOK FOR DUPLICATES».
 *
 * A family in My research is named by a surname, and the same family turns up under two spellings (Lerena and Llerena, Defranceschi and
 * Defrančeski). The one catalogue of spellings (data/surname-families.json) already says which forms were written for the same family, with the
 * evidence, so the page asks it instead of guessing. Only forms whose status is `same` are listed: `attested` and `rule` forms are spellings
 * worth searching for, not proof that two lines of research are one family, and `lead`, `case-by-case` and `not-same` are never merged on.
 * Each form is folded the way the page folds a family's name (capitals, accents, spaces, hyphens and apostrophes do not matter). A group is a
 * list of such keys; a family with a single form is left out.
 */
import cat from "../../../data/surname-families.json";

function squash(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/đ/g, "d").replace(/ł/g, "l").replace(/ø/g, "o").replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/œ/g, "oe")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function GET() {
  const groups = [];
  for (const f of cat.families || []) {
    const keys = [];
    for (const m of f.members || []) {
      if (m.status !== "same") continue;
      const k = squash(m.form);
      if (k && keys.indexOf(k) < 0) keys.push(k);
    }
    if (keys.length > 1) groups.push(keys.sort());
  }
  groups.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return new Response(JSON.stringify({ note: "Surname spellings the catalogue says are the same family (status same), folded to lower case without accents, spaces or punctuation.", groups }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
