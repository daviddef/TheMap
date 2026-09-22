/* WHERE A SURNAME IS BORNE, DRAWN.

   The surname page listed countries in a table and left the reader to
   picture it. Geneanet draws it, and that is most of why people use
   Geneanet for names. This draws it from the registers this atlas
   actually holds.

   INLINE SVG, BUILT ONCE, NO JAVASCRIPT. There are 19,779 surname pages.
   Loading Leaflet and fetching tiles on each would be a megabyte of
   machinery to show six dots, on pages whose whole ambition is to be
   fast enough to cite. The geometry is already here — country outlines
   in public/c/, centroids in public/country-points.json — so the picture
   is composed at build time and ships as a few kilobytes of markup that
   renders before any script runs and prints correctly.

   FRAMED ON THE NAME, NOT ON THE WORLD. Drawing a world map to put two
   dots on Slovenia and Croatia wastes the reader's attention on ocean.
   The viewBox is the bounding box of the countries that actually carry
   the name, so a Slovene name gets Slovenia and an Irish-and-American
   one gets the Atlantic between them.

   THREE THINGS IT MUST NOT IMPLY, and the code below is mostly these:

   1. A DOT IS A COUNTRY, NOT A PLACE. It sits at the country's centroid
      because that is all a national register supports. There is no claim
      that the Peeters live in the middle of Belgium. The dot is drawn as
      wide as the country is, faintly, so it reads as «somewhere in here»
      rather than «here» — and the outline is drawn under it for the same
      reason.
   2. A COUNT AND AN ATTESTATION ARE DIFFERENT CLAIMS. A filled dot is a
      state's count. A hollow ring is «attested, not counted» — Denmark,
      which publishes which surnames exist and not how many carry each,
      and the family archives. Sizing a ring by a number nobody published
      would invent the number. This is the same grammar the main map
      uses, where hollow means nobody walked it.
   3. BLANK IS NOT ABSENCE. A map showing Poland and nothing else looks
      like a claim about the rest of the world. It is a claim about
      eleven registers. The caption says so, every time, and the page
      that draws this must not drop it. */

import fs from "node:fs";
import path from "node:path";

const PUBLIC = path.join(process.cwd(), "public");

let POINTS = null;
const OUTLINES = new Map();

function centroids() {
  if (POINTS) return POINTS;
  POINTS = {};
  try {
    const d = JSON.parse(
      fs.readFileSync(path.join(PUBLIC, "country-points.json"), "utf8"));
    for (const c of d.countries || []) POINTS[c.cc] = c;
  } catch { /* the map is simply not drawn */ }
  return POINTS;
}

function outline(cc) {
  const key = String(cc || "").toLowerCase();
  if (OUTLINES.has(key)) return OUTLINES.get(key);
  let v = null;
  try {
    v = JSON.parse(fs.readFileSync(path.join(PUBLIC, "c", key + ".json"), "utf8"));
  } catch { v = null; }
  OUTLINES.set(key, v);
  return v;
}

/* Equirectangular with a standard parallel, which is wrong about area
   and right about being legible at this size with no dependency.
   Longitude is squeezed by cos(mid latitude) or Europe comes out looking
   like it was stood on. Nothing here is measured off the picture. */

export function surnameMap(ccs, { width = 680 } = {}) {
  const pts = centroids();
  const rows = (ccs || [])
    .map((c) => ({ ...c, pt: pts[c.cc], ring: outline(c.cc) }))
    .filter((c) => c.pt);
  if (!rows.length) return null;

  /* FRAMED ON THE CENTROIDS, NOT ON THE OUTLINES' BOUNDING BOXES.
     Two reasons, and the first cost a rewrite. The `box` in public/c is
     [minLat, minLon, maxLat, maxLon] and this code read it as x,y pairs,
     so every frame was computed from latitudes treated as longitudes and
     every map clamped to the same useless height.
     The second reason survives the fix: France's box runs from -61° to
     +51° longitude because Guadeloupe and Réunion are France, the
     Netherlands reaches Curaçao, and the United States crosses the
     antimeridian. Framing on those draws an ocean to show a French name.
     Centroids are where a national register's dot goes anyway, so they
     are what the picture is about; outlines are context and SVG clips
     them for free. */
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  for (const r of rows) {
    minX = Math.min(minX, r.pt.x); maxX = Math.max(maxX, r.pt.x);
    minY = Math.min(minY, r.pt.y); maxY = Math.max(maxY, r.pt.y);
  }
  if (maxX - minX > 180) { minX = -180; maxX = 180; }
  /* Padding proportional to the span, with a floor, so one country gets
     a region around it and six countries are not squeezed to the edges.
     A fixed number of degrees made Slovenia and Eurasia the same shape. */
  const padX = Math.max(6, (maxX - minX) * 0.28);
  const padY = Math.max(4, (maxY - minY) * 0.28);
  minX = Math.max(-180, minX - padX); maxX = Math.min(180, maxX + padX);
  minY = Math.max(-85, minY - padY); maxY = Math.min(85, maxY + padY);

  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  const midLat = (minY + maxY) / 2;
  const squeeze = Math.max(0.25, Math.cos(midLat * Math.PI / 180));
  const height = Math.max(170, Math.min(420,
    Math.round(width * (spanY / (spanX * squeeze)))));
  const X = (lon) => ((lon - minX) / spanX) * width;
  const Y = (lat) => ((maxY - lat) / spanY) * height;

  const counted = rows.filter((r) => r.n != null).map((r) => r.n);
  const top = counted.length ? Math.max(...counted) : 0;
  const rad = (n) => (!top || n == null ? 5 : 5 + 16 * Math.sqrt(n / top));

  const esc = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* RINGS TOO SMALL TO SEE COST THE SAME AS RINGS YOU CAN.
     The United States is 74 rings, most of them Aleutian islands a
     fraction of a pixel across at this scale, and drawing them all made
     a 26 KB picture — on nineteen thousand pages. A ring is kept only if
     its projected box reaches 1.5px, and a country keeps its eight
     biggest, which is the difference between a coastline and a texture
     nobody can resolve. */
  const paths = [];
  for (const r of rows) {
    const rings = ((r.ring && r.ring.rings) || [])
      .filter((ring) => ring.length >= 3)
      .map((ring) => {
        let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
        for (const [lon, lat] of ring) {
          const x = X(lon), y = Y(lat);
          if (x < a) a = x; if (x > b) b = x;
          if (y < c) c = y; if (y > d) d = y;
        }
        return { ring, size: Math.max(b - a, d - c),
                 x0: a, x1: b, y0: c, y1: d };
      })
      /* And a ring the frame cannot show costs exactly as much as one
         it can. Framing on centroids means Alaska, Guadeloupe and
         Curaçao are usually outside the picture, still fully written
         out and then clipped by the renderer — a thousand coordinates
         a page, on nineteen thousand pages, drawing nothing. */
      .filter((o) => o.size >= 1.5
                  && o.x1 >= -2 && o.x0 <= width + 2
                  && o.y1 >= -2 && o.y0 <= height + 2)
      .sort((p1, p2) => p2.size - p1.size)
      .slice(0, 8);
    /* AND POINTS THAT LAND ON THE SAME PIXEL ARE NOT A COASTLINE.
       These outlines are drawn at whatever resolution suited a world
       map; at 680px across a region, consecutive vertices routinely
       round to the same place. Keeping one point per pixel of travel
       takes a ten-country name from 31 KB to a few, and no reader can
       tell the difference — the first and last points are always kept,
       so nothing closes in the wrong place. */
    for (const { ring } of rings) {
      const out = [];
      let px = null, py = null;
      for (let i = 0; i < ring.length; i++) {
        const x = X(ring[i][0]), y = Y(ring[i][1]);
        const last = i === ring.length - 1;
        if (!out.length || last || Math.abs(x - px) + Math.abs(y - py) >= 1) {
          out.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
          px = x; py = y;
        }
      }
      if (out.length >= 3) {
        paths.push('<path d="M' + out.join("L") + 'Z" class="sm-land"/>');
      }
    }
  }

  const dots = rows
    .slice()
    .sort((a, b) => (a.n || 0) - (b.n || 0))   // big dots last, on top
    .map((r) => {
      const cx = X(r.pt.x).toFixed(1), cy = Y(r.pt.y).toFixed(1);
      const known = r.n != null;
      const title = esc(r.pt.n || r.cc) + (known
        ? ` — ${r.n.toLocaleString()} people`
        : " — attested, not counted");
      return `<g class="${known ? "sm-c" : "sm-u"}"><title>${title}</title>`
        + `<circle cx="${cx}" cy="${cy}" r="${rad(r.n).toFixed(1)}"/></g>`;
    });

  return {
    drawn: rows.length,
    missing: (ccs || []).length - rows.length,
    counted: counted.length,
    height,
    svg: `<svg viewBox="0 0 ${width} ${height}" width="100%" `
       + `height="${height}" role="img" class="sm">`
       + `<g>${paths.join("")}</g><g>${dots.join("")}</g></svg>`,
  };
}

/* ---- THE SAME PICTURE, ONE GRAIN DOWN ------------------------------------
   A country dot is the best a national register supports. Belgium is not
   a national register: Statbel counts every surname in each of its 565
   communes, so for a Belgian name the map can stop pointing at a country
   and point at towns — which is the whole difference between «the
   Peeters are Belgian» and «2,060 Peeters in Antwerpen».

   Framed on the points, not on the country, because that is what this
   one is about: a name in four Flemish communes should draw Flanders,
   not Belgium with a corner used. The country outline goes underneath so
   the towns have a shape to sit in. */
export function placesMap(points, { cc = null, width = 680, max = 150 } = {}) {
  const pts = (points || []).filter((p) => p && p.y != null && p.x != null);
  if (!pts.length) return null;
  /* THE COMMONEST 150, AND SAY SO. Peeters is counted in 411 of the 565
     communes, and 400 dots is 35 KB of markup in which the four hundredth
     is three people and two pixels. The caller is told what was left out
     rather than the picture quietly implying the name stops there. */
  const shown = pts.slice(0, max);

  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  for (const p of shown) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const padX = Math.max(0.25, (maxX - minX) * 0.12);
  const padY = Math.max(0.15, (maxY - minY) * 0.12);
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;

  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  const squeeze = Math.max(0.25, Math.cos(((minY + maxY) / 2) * Math.PI / 180));
  /* TRUE ASPECT, AND LET CSS CAP THE HEIGHT. Clamping the viewBox
     squashed Belgium — 219 km north to south against 268 km east to
     west wants 555px and was being drawn at 460. A map that lies about
     shape to fit a layout is the wrong trade; the stylesheet has
     max-height and the SVG letterboxes. */
  const height = Math.max(160,
    Math.round(width * (spanY / (spanX * squeeze))));
  const X = (lon) => ((lon - minX) / spanX) * width;
  const Y = (lat) => ((maxY - lat) / spanY) * height;

  const land = [];
  const ring0 = cc && outline(cc);
  for (const ring of (ring0 && ring0.rings) || []) {
    if (ring.length < 3) continue;
    const out = [];
    let px = null, py = null;
    for (let i = 0; i < ring.length; i++) {
      const x = X(ring[i][0]), y = Y(ring[i][1]);
      if (!out.length || i === ring.length - 1
          || Math.abs(x - px) + Math.abs(y - py) >= 1) {
        out.push(`${x.toFixed(1)} ${y.toFixed(1)}`); px = x; py = y;
      }
    }
    if (out.length >= 3) land.push('<path d="M' + out.join("L")
      + 'Z" class="sm-land"/>');
  }

  const top = Math.max(...shown.map((p) => p.c || 0), 1);
  const esc = (t) => String(t).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  /* A hover label on every dot doubles the file to name towns holding
     four people. The forty biggest get one; the rest are a shape. */
  const ranked = shown.slice().sort((a, b) => (b.c || 0) - (a.c || 0));
  const named = new Set(ranked.slice(0, 40).map((p) => p.m || p.label));
  const dots = ranked
    .slice()
    .reverse()                                   // biggest drawn last
    .map((p) => {
      const r = 2.2 + 13 * Math.sqrt((p.c || 0) / top);
      const c = `<circle cx="${X(p.x).toFixed(0)}" cy="${Y(p.y).toFixed(0)}" `
        + `r="${r.toFixed(1)}"/>`;
      if (!named.has(p.m || p.label)) return `<g class="sm-c">${c}</g>`;
      return `<g class="sm-c"><title>${esc(p.nl || p.label || "")}`
        + ` \u2014 ${(p.c || 0).toLocaleString()}</title>${c}</g>`;
    });

  return {
    drawn: shown.length,
    omitted: pts.length - shown.length,
    height,
    svg: `<svg viewBox="0 0 ${width} ${height}" width="100%" `
       + `height="${height}" role="img" class="sm">`
       + `<g>${land.join("")}</g><g>${dots.join("")}</g></svg>`,
  };
}
