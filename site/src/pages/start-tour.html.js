/* THE CHAPTERS OF THE STORY TOUR, as an HTML fragment at /start-tour.html. Fetched by public/js/start-tour-gate.js only when the tour opens, so no page
   carries it. Every number in it is computed (lib/start-data.js) and the whole thing is one small static file per build. It is not a page: it has no
   <html>, no menu, and nothing links to it, so it is also left out of the sitemap. */
import { startNumbers, inputs, buildTour } from "../lib/start-data.js";
import { tourMarkup } from "../lib/start-tour-markup.js";
import { countries } from "../lib/inventory.js";
import { u } from "../lib/url.js";

export function GET() {
  const n = startNumbers({ countriesKnown: countries });
  const t = buildTour(inputs(), n, { base: u("/") });
  return new Response(tourMarkup(t), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
