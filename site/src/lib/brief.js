/* A provider's `what` is a sentence or two on a list page. One archive's
   (Državni arhiv u Pazinu) has grown into a 42,000-character research log, which
   turned /country/hr/ into a wall of text. Lists show the first sentences up to a
   limit and the archive's own page carries the rest. */
export function brief(text, max = 320) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "")) + (stop > max * 0.5 ? "" : "…");
}
