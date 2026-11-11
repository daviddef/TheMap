/* WHAT THE FAMILY ARCHIVES HAVE DONE, FOR THE WHAT'S-NEW PAGE.
 *
 * Built from public/research-sessions.json, the file the archives' own searched.json rows are published into and that /my-research/
 * folds into a reader's browser. Only what that file already says in public: a family's surname, the place, the kind of book, the
 * day, how many pages, which source. NEVER a note: notes are free text written by a researcher and can name a person.
 *
 * Nothing here is a finding. «Read» means pages were recorded as read; «found something» is not repeated, because a state is a
 * researcher's word and this page is a diary of where the work went. */
import fs from "node:fs";
import path from "node:path";

const pagesOf = (done) => (done || []).reduce((n, r) => n + Math.max(0, (r[1] | 0) - (r[0] | 0) + 1), 0);

function placeName(id) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "p", id + ".json"), "utf8"));
    return { name: String(d.name || id).replace(/\s*\([^)]*\)\s*$/, ""), known: true };
  } catch (e) { return { name: id, known: false }; }
}

/* the source a mark stands for, in the words a visitor would use */
function sourceOf(id, m) {
  if (id.startsWith("antenati:")) return "Antenati";
  if (id.startsWith("collection:") || id.startsWith("volume:") || id.startsWith("film:")) return "FamilySearch";
  return String(m.t || id.replace(/^source:/, "")).replace(/\s*\(.*$/, "");
}

export function researchNews(data) {
  const lines = data.lines || {};
  const names = {};
  const place = (id) => (names[id] = names[id] || placeName(id));
  const fam = {};            // slug -> { name, places:Set, books, pages, sources:Set }
  const days = {};           // day -> { fams:Set, books, places:Set, sources:Set, rows:[] }
  const allPlaces = new Set(), allSources = new Set();
  let books = 0, pages = 0;
  for (const [id, m] of Object.entries(data.marks || {})) {
    const isBook = id.startsWith("volume:") || id.startsWith("film:");
    for (const [slug, b] of Object.entries(m.by || {})) {
      const f = (fam[slug] = fam[slug] || { name: (lines[slug] || {}).name || slug, places: new Set(), books: 0, pages: 0, sources: new Set() });
      const src = sourceOf(id, m);
      f.sources.add(src); allSources.add(src);
      const pg = pagesOf(b.done);
      if (isBook) { f.books++; f.pages += pg; books++; pages += pg; }
      const pid = isBook && m.where ? String(m.where) : "";
      if (pid) { f.places.add(pid); allPlaces.add(pid); }
      const day = /^\d{4}-\d{2}-\d{2}$/.test(b.since || "") ? b.since : "";
      if (day) {
        const d = (days[day] = days[day] || { fams: new Set(), books: 0, places: new Set(), sources: new Set(), rows: [] });
        d.fams.add(f.name); d.sources.add(src);
        if (isBook) d.books++;
        if (pid) d.places.add(pid);
        /* the exact thing, by title: never the note */
        const title = String(m.t || id.replace(/^[a-z]+:/, "")).replace(/\s+/g, " ").slice(0, 90);
        /* the address of the thing itself, when it has a public one: a register on Antenati, a film or collection on FamilySearch, a provider's own page */
        const href = /^https?:\/\//.test(m.href || "") ? m.href : null;
        const where = !isBook && m.where ? String(m.where).replace(/\s+/g, " ").slice(0, 60) : "";
        d.rows.push({ family: f.name, kind: isBook ? "book" : "source", title, source: src, placeId: pid, pages: pg, state: b.state || "", href, where });
      }
    }
  }
  const list = (a, max) => {
    const x = [...a];
    return x.length <= max ? x.join(", ") : x.slice(0, max).join(", ") + " and " + (x.length - max) + " more";
  };
  const entries = Object.entries(days).map(([date, d]) => {
    const pl = [...d.places].map((p) => place(p).name).sort((a, b) => a.localeCompare(b));
    const fams = [...d.fams].sort((a, b) => a.localeCompare(b));
    const bits = [];
    if (d.books) bits.push(`${d.books} book${d.books === 1 ? "" : "s"} read${pl.length ? " at " + list(pl, 4) : ""}`);
    const others = [...d.sources].filter((s) => s !== "FamilySearch");
    if (others.length) bits.push(`${d.books ? "also " : ""}used ${list(others.sort(), 3)}`);
    const who = fams.length <= 3 ? fams.join(", ") : fams.slice(0, 3).join(", ") + " and " + (fams.length - 3) + " more " + (fams.length === 4 ? "family" : "families");
    let headline = `Research: ${who} — ${bits.join("; ") || "work recorded"}`;
    if (headline.length > 150) headline = headline.slice(0, 147).replace(/[;,]?\s*\S*$/, "") + "…";
    const firstKnown = [...d.places].find((p) => place(p).known);
    const byFam = {};
    for (const r of d.rows) (byFam[r.family] = byFam[r.family] || []).push({ ...r, place: r.placeId ? place(r.placeId) : null });
    const detail = Object.keys(byFam).sort((a, b) => a.localeCompare(b)).map((family) => ({
      family,
      rows: byFam[family].sort((a, b) => (a.kind + a.title).localeCompare(b.kind + b.title, "en", { numeric: true })),
    }));
    return { date, kind: "research", headline, href: firstKnown ? `/place/${firstKnown}/` : null, detail };
  });
  const families = Object.values(fam).map((f) => ({
    name: f.name,
    places: [...f.places].map((p) => ({ id: p, ...place(p) })).sort((a, b) => a.name.localeCompare(b.name)),
    books: f.books, pages: f.pages, sources: [...f.sources].sort(),
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { entries, families, totals: { families: families.length, places: allPlaces.size, books, pages, sources: allSources.size } };
}
