/* RECORD ATLAS READ TOOLS: what the API and the MCP server can answer, from the published data.
 *
 * Pure: every dependency is passed in (`load(name)` reads a published file, `R` is public/js/record-reader.js, `terms` is
 * data/record-terms.json), so the same code runs in the Worker and in the tests. Nothing is written anywhere.
 *
 * THE RULES THIS FOLLOWS (docs/atlas-mcp-plan.md section 3): no guessing (an ambiguous name comes back as candidates with
 * `ambiguous: true`, never a "closest"); every answer says which file it came from and when that file was built; nothing about
 * a person is ever returned, because nothing about a person is in these files. */

const norm = s => String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const clip = (s, n) => String(s || "").slice(0, n);

export function makeTools({ load, R, terms }) {
  const nameIdx = new WeakMap();
  function givenIndex(g) {
    if (nameIdx.has(g)) return nameIdx.get(g);
    const by = new Map(), add = (k, row, how) => { if (!k) return; if (!by.has(k)) by.set(k, []); const a = by.get(k); if (!a.some(x => x.row === row)) a.push({ row, how }); };
    for (const row of g.rows) {
      add(norm(row.canon), row, "name");
      for (const [lang, forms] of Object.entries(row.langs || {})) for (const f of forms) add(norm(f.form), row, lang);
    }
    nameIdx.set(g, by); return by;
  }

  const tools = {
    atlas_given_name: {
      description: "Every spelling of a given name across languages and registers (Ivan, Johann, Giovanni, Zuane and Joannes are one name), from the Atlas's catalogue. Exact matches only: an ambiguous name returns every candidate.",
      input: { type: "object", properties: { name: { type: "string", description: "A given name as written, in any language" } }, required: ["name"] },
      async run({ name }) {
        const g = await load("given-names.json"), q = norm(name);
        if (!q) return { error: "give a name" };
        const hits = givenIndex(g).get(q) || [];
        const rows = hits.map(h => h.row);
        return {
          asOf: g.built, source: "/given-names.json", query: name, ambiguous: rows.length > 1,
          note: "status: seen = met on a record; lead = the right form in that language, never yet seen; rule = made by a grammar rule (e.g. Latin cases). A lead is a thing to search, not a finding.",
          matches: rows.map(r => ({
            id: r.id, canonical: r.canon, page: `/name/${r.id}/`, forms: r.forms,
            languages: Object.fromEntries(Object.entries(r.langs || {}).map(([l, fs]) => [l, fs.slice(0, 8).map(f => ({ form: f.form, status: f.status, ...(f.seen ? { seen: f.seen } : {}), ...(f.notNominative ? { case: f.notNominative } : {}) }))])),
          })),
          ...(rows.length ? {} : { found: false, note2: "Not in the catalogue. That is not a finding about the name: the catalogue holds 630 name families so far." }),
        };
      },
    },

    atlas_term: {
      description: "What a word, abbreviation or ending in an old church register means (Latin so far), from the reading-the-record cards. Tolerates other endings, i/j, u/v and signs like 7bris.",
      input: { type: "object", properties: { word: { type: "string" }, record: { type: "string", enum: ["baptism", "marriage", "burial"], description: "Narrow to one kind of record" } }, required: ["word"] },
      async run({ word, record }) {
        const idx = R.index(terms.terms), found = R.find(idx, word, record ? { events: [record] } : undefined);
        return {
          asOf: terms.asOf || null, source: "data/record-terms.json (bundled)", query: word, count: found.length,
          terms: found.slice(0, 8).map(f => ({ id: f.term.id, forms: f.term.forms.slice(0, 8), abbreviations: f.term.abbr, means: f.term.means, records: f.term.events, role: f.term.role, note: f.term.note, sources: f.term.src.map(k => terms.sources[k] && terms.sources[k].url).filter(Boolean) })),
          ...(found.length ? {} : { found: false, note2: "No card matches. The list is short so far; that is not a finding about the word." }),
        };
      },
    },

    atlas_date: {
      description: "Decode a date as written in a register (Latin words, Roman numerals, 7bris for September) into a day, month and year, showing the working and any warning (a day that cannot exist, a Julian-calendar year).",
      input: { type: "object", properties: { text: { type: "string", description: "e.g. 'die 30 7bris 1671'" } }, required: ["text"] },
      async run({ text }) { const d = R.decodeDate(clip(text, 300)); return { source: "public/js/record-reader.js", query: text, ...d }; },
    },

    atlas_providers: {
      description: "Archives and websites that hold records, with what they hold, how access works and when it was last checked. Filter by country code, access class or a word in the name.",
      input: { type: "object", properties: { country: { type: "string", description: "ISO 3166 alpha-2, e.g. HR" }, access: { type: "string" }, q: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } } },
      async run({ country, access, q, limit }) {
        const p = await load("providers.json"), n = Math.min(Math.max(Number(limit) || 20, 1), 50), cc = country ? String(country).toUpperCase() : null, qq = q ? norm(q) : null;
        const rows = (p.providers || []).filter(r => (!cc || (r.countries || []).includes(cc)) && (!access || r.access === access) && (!qq || norm(r.name + " " + r.id).includes(qq)));
        return {
          source: "/providers.json", total: rows.length, shown: Math.min(rows.length, n), accessLegend: p.access,
          providers: rows.slice(0, n).map(r => ({ id: r.id, name: r.name, url: r.url, kind: r.kind, access: r.access, countries: r.countries, what: clip(r.what, 400), checked: r.checked || null })),
        };
      },
    },

    atlas_context: {
      description: "The Atlas's published contract: when it was built, what it covers and the rule for reading eras. Call this to see how fresh the data is.",
      input: { type: "object", properties: {} },
      async run() { const c = await load("context.json"); return { source: "/context.json", generated: c.generated, contract: c.contract, rule: c.rule, counts: c.counts }; },
    },
  };
  return tools;
}
