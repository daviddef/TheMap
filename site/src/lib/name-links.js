/* SITES THAT KEEP A PAGE FOR EACH SURNAME: any directory row whose address takes the name ({surname}, or {SURNAME} where
   the site wants capitals) and covers one of the countries the name is attested in. Links only: the atlas reads nothing
   from them. The story page has the same rule in public/js/story-engine.js (nameLinks), and a test holds the two together. */
export function nameLinks(providers, name, ccs) {
  if (!name) return [];
  return (providers || [])
    .filter((p) => /\{(surname|SURNAME)\}/.test(p.deepLink || "") && (p.countries || []).some((c) => (ccs || []).includes(c)))
    .map((p) => ({
      id: p.id,
      name: String(p.name).split(" \u2014 ")[0],
      url: p.deepLink.replace("{surname}", encodeURIComponent(name))
        .replace("{SURNAME}", encodeURIComponent(name.toUpperCase().replace(/\s+/g, "_"))),
    }));
}
