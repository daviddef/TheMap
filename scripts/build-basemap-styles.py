#!/usr/bin/env python3
"""Draw the Atlas's own vector basemap looks as MapLibre style JSON: site/public/basemap-styles/{smooth,smooth-dark,ink,ink-dark}.json.

WHAT THESE ARE. Four small styles over the free OpenFreeMap vector tiles (OpenMapTiles schema, OpenStreetMap data), the same
tiles OpenFreeMap's own Liberty look is drawn from. No key, no account, no Stadia or Stamen. The tiles host is the only
third party they contact (tiles.openfreemap.org: the tile index, the tiles, and the label fonts).

  Smooth       soft blue-grey land, pale water, muted crisp labels, hairline roads, country borders drawn clearly
  Smooth dark  a LIGHTER, softer dark than Esri's dark grey (land about 1.8 times as bright as Esri's #404040): blue-grey slate, labels that pass 4.5:1 (test/basemap-styles.test.js)
  Ink          black on white, the spirit of a printed map
  Ink dark     white on black

WHY A SCRIPT AND NOT FOUR HAND-WRITTEN FILES. The four share one layer list; only the palette differs. Change a colour here, run
`python3 scripts/build-basemap-styles.py`, commit the four files. The files are what the site serves (same-origin, so Compass's
strict CSP allows them) and what the tests read.

THE ZOOM NUMBERS are MapLibre's, one less than Leaflet's: the bridge (public/vendor/maplibre/leaflet-maplibre-gl.js) draws 512 px
vector tiles at maplibre zoom z-1 so they match Leaflet's 256 px zoom z. A layer here with minzoom 5 first shows at Leaflet zoom 6.

THE ATLAS'S OWN DATA IS THE POINT. Land and water are quiet, roads are hairlines, no shops, no peaks, no buildings below street level:
the teal and orange dots, and Compass's coloured regime fills, are the only strong colour on the map.
"""
import json, pathlib, sys

OUT = pathlib.Path(__file__).resolve().parent.parent / "site" / "public" / "basemap-styles"

TILES = "https://tiles.openfreemap.org/planet"
GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf"
ATTRIBUTION = ('<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> '
               '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> '
               'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>')

# One palette per look. Every colour the style uses is named here.
PALETTES = {
    "smooth": dict(
        name="Smooth", dark=False,
        land="#e9edf2", water="#cbdae9", water_line="#c0d1e3", wood="#e1e9e8", park="#e0e9e5", ice="#f6f8fb", sand="#ece9e4",
        landuse="#e4e8ee", building="#dfe4ea",
        road_major="#fbfcfd", road_casing="#d2d9e2", road_minor="#f4f6f9",
        border2="#6f7f96", border2_far=0.55, border_disputed="#8b97a8", border4="#98a5b6", border_maritime="#b4c2d4",
        label="#374253", label_soft="#566377", label_place="#2a3342", label_country="#475467", label_water="#365a82",
        halo="rgba(233,237,242,0.92)", halo_water="rgba(203,218,233,0.85)", halo_w=1.4,
    ),
    "smooth-dark": dict(
        name="Smooth dark", dark=True,
        land="#4a5567", water="#3b4556", water_line="#445064", wood="#4a5b60", park="#475a5c", ice="#5b6779", sand="#544f55",
        landuse="#505b6e", building="#566174",
        road_major="#66738a", road_casing="#404a5b", road_minor="#5b677c",
        border2="#d0d9e8", border2_far=0.65, border_disputed="#a3afc1", border4="#98a6bb", border_maritime="#62718a",
        label="#d9e0ec", label_soft="#c6d0df", label_place="#f0f4f9", label_country="#e8edf5", label_water="#a9c2e0",
        halo="rgba(74,85,103,0.9)", halo_water="rgba(59,69,86,0.85)", halo_w=1.4,
    ),
    "ink": dict(
        name="Ink", dark=False,
        land="#ffffff", water="#d6d6d6", water_line="#9a9a9a", wood="#ffffff", park="#f1f1f1", ice="#ffffff", sand="#ffffff",
        landuse="#f4f4f4", building="#e4e4e4",
        road_major="#1a1a1a", road_casing="#ffffff", road_minor="#6e6e6e",
        border2="#000000", border2_far=0.9, border_disputed="#444444", border4="#555555", border_maritime="#9a9a9a",
        label="#111111", label_soft="#333333", label_place="#000000", label_country="#000000", label_water="#333333",
        halo="rgba(255,255,255,0.95)", halo_water="rgba(214,214,214,0.9)", halo_w=1.6,
    ),
    "ink-dark": dict(
        name="Ink dark", dark=True,
        land="#0a0a0a", water="#262626", water_line="#6a6a6a", wood="#0a0a0a", park="#161616", ice="#0a0a0a", sand="#0a0a0a",
        landuse="#141414", building="#1d1d1d",
        road_major="#e6e6e6", road_casing="#0a0a0a", road_minor="#8a8a8a",
        border2="#ffffff", border2_far=0.9, border_disputed="#cccccc", border4="#bbbbbb", border_maritime="#6a6a6a",
        label="#f2f2f2", label_soft="#d0d0d0", label_place="#ffffff", label_country="#ffffff", label_water="#d0d0d0",
        halo="rgba(10,10,10,0.95)", halo_water="rgba(38,38,38,0.9)", halo_w=1.6,
    ),
}

NAME = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]]
SANS, BOLD, ITAL = ["Noto Sans Regular"], ["Noto Sans Bold"], ["Noto Sans Italic"]


def zoom_width(*stops):
    return ["interpolate", ["exponential", 1.4], ["zoom"], *[v for s in stops for v in s]]


def layers(p):
    L = []
    src = "openmaptiles"

    def add(d):
        d.setdefault("source", src) if d["type"] != "background" else None
        L.append(d)

    add(dict(id="background", type="background", paint={"background-color": p["land"]}))
    add({"id": "landcover-wood", "type": "fill", "source-layer": "landcover", "filter": ["==", ["get", "class"], "wood"],
         "paint": {"fill-color": p["wood"], "fill-opacity": 0.7}})
    add({"id": "landcover-ice", "type": "fill", "source-layer": "landcover", "filter": ["==", ["get", "class"], "ice"],
         "paint": {"fill-color": p["ice"]}})
    add({"id": "landcover-sand", "type": "fill", "source-layer": "landcover", "filter": ["==", ["get", "class"], "sand"],
         "paint": {"fill-color": p["sand"], "fill-opacity": 0.6}})
    add({"id": "park", "type": "fill", "source-layer": "park", "minzoom": 5,
         "paint": {"fill-color": p["park"], "fill-opacity": 0.8}})
    add({"id": "landuse", "type": "fill", "source-layer": "landuse", "minzoom": 9,
         "filter": ["match", ["get", "class"], ["residential", "suburb", "neighbourhood", "commercial", "industrial", "retail"], True, False],
         "paint": {"fill-color": p["landuse"], "fill-opacity": 0.8}})
    add({"id": "water", "type": "fill", "source-layer": "water", "filter": ["!=", ["get", "brunnel"], "tunnel"],
         "paint": {"fill-color": p["water"]}})
    add({"id": "waterway", "type": "line", "source-layer": "waterway", "minzoom": 6,
         "filter": ["match", ["get", "class"], ["river", "canal"], True, False],
         "layout": {"line-cap": "round", "line-join": "round"},
         "paint": {"line-color": p["water_line"], "line-width": zoom_width([6, 0.5], [12, 1.6], [18, 5])}})
    add({"id": "building", "type": "fill", "source-layer": "building", "minzoom": 14,
         "paint": {"fill-color": p["building"], "fill-opacity": 0.8}})
    # Roads: hairlines, major ones first and only as far down as a reader looking for a place needs them.
    for rid, classes, mz, w in (
        ("road-minor", ["minor", "service"], 12, [[12, 0.3], [16, 1.5], [18, 6]]),
        ("road-tertiary", ["tertiary"], 10, [[10, 0.3], [14, 1.6], [18, 9]]),
        ("road-secondary", ["secondary", "primary"], 8, [[8, 0.4], [12, 1.4], [18, 12]]),
        ("road-trunk", ["trunk", "motorway"], 5, [[5, 0.4], [9, 1], [14, 3], [18, 14]]),
    ):
        add({"id": rid + "-casing", "type": "line", "source-layer": "transportation", "minzoom": max(mz, 10),
             "filter": ["all", ["match", ["get", "class"], classes, True, False], ["!=", ["get", "brunnel"], "tunnel"]],
             "layout": {"line-cap": "round", "line-join": "round"},
             "paint": {"line-color": p["road_casing"], "line-width": zoom_width(*[(z, round(v * 1.8, 2)) for z, v in w])}})
        add({"id": rid, "type": "line", "source-layer": "transportation", "minzoom": mz,
             "filter": ["all", ["match", ["get", "class"], classes, True, False], ["!=", ["get", "brunnel"], "tunnel"]],
             "layout": {"line-cap": "round", "line-join": "round"},
             "paint": {"line-color": p["road_minor"] if rid == "road-minor" else p["road_major"], "line-width": zoom_width(*w)}})
    # Borders. Country borders are the clear line; first-level divisions are a quiet dash that appears with the zoom.
    add({"id": "boundary-maritime", "type": "line", "source-layer": "boundary", "minzoom": 3,
         "filter": ["all", ["==", ["get", "admin_level"], 2], ["==", ["get", "maritime"], 1]],
         "paint": {"line-color": p["border_maritime"], "line-width": 0.8, "line-opacity": 0.7}})
    add({"id": "boundary-4", "type": "line", "source-layer": "boundary", "minzoom": 3,
         "filter": ["all", [">=", ["get", "admin_level"], 3], ["<=", ["get", "admin_level"], 6], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1]],
         "layout": {"line-join": "round"},
         "paint": {"line-color": p["border4"], "line-dasharray": [3, 2],
                   "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 8, 1, 12, 1.6],
                   "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 6, 0.9]}})
    add({"id": "boundary-disputed", "type": "line", "source-layer": "boundary", "minzoom": 1,
         "filter": ["all", ["==", ["get", "admin_level"], 2], ["==", ["get", "disputed"], 1], ["!=", ["get", "maritime"], 1]],
         "layout": {"line-join": "round"},
         "paint": {"line-color": p["border_disputed"], "line-dasharray": [2, 2],
                   "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 6, 1.4]}})
    add({"id": "boundary-2", "type": "line", "source-layer": "boundary",
         "filter": ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1]],
         "layout": {"line-cap": "round", "line-join": "round"},
         "paint": {"line-color": p["border2"],
                   "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, p["border2_far"], 4, 1],
                   "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 3, 1.1, 6, 1.6, 12, 2.6]}})

    # Labels. Names in English where OpenStreetMap has one, else the local name.
    halo = dict(**{"text-halo-color": p["halo"], "text-halo-width": p["halo_w"], "text-halo-blur": 0.4})
    water_halo = dict(**{"text-halo-color": p["halo_water"], "text-halo-width": p["halo_w"], "text-halo-blur": 0.4})
    add({"id": "water-name-line", "type": "symbol", "source-layer": "water_name", "minzoom": 4,
         "filter": ["match", ["geometry-type"], ["LineString", "MultiLineString"], True, False],
         "layout": {"symbol-placement": "line", "text-field": NAME, "text-font": ITAL, "text-size": 12, "text-letter-spacing": 0.15},
         "paint": dict(**{"text-color": p["label_water"]}, **water_halo)})
    add({"id": "water-name", "type": "symbol", "source-layer": "water_name", "minzoom": 1,
         "filter": ["match", ["geometry-type"], ["Point", "MultiPoint"], True, False],
         "layout": {"text-field": NAME, "text-font": ITAL, "text-max-width": 6, "text-letter-spacing": 0.18,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 6, 13, 10, 15]},
         "paint": dict(**{"text-color": p["label_water"]}, **water_halo)})
    add({"id": "road-name", "type": "symbol", "source-layer": "transportation_name", "minzoom": 12.5,
         "filter": ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], True, False],
         "layout": {"symbol-placement": "line", "text-field": NAME, "text-font": SANS, "text-size": 11, "text-rotation-alignment": "map"},
         "paint": dict(**{"text-color": p["label_soft"]}, **halo)})
    add({"id": "place-other", "type": "symbol", "source-layer": "place", "minzoom": 9.5,
         "filter": ["match", ["get", "class"], ["suburb", "neighbourhood", "quarter", "hamlet", "isolated_dwelling"], True, False],
         "layout": {"text-field": NAME, "text-font": SANS, "text-max-width": 8,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 12]},
         "paint": dict(**{"text-color": p["label_soft"]}, **halo)})
    add({"id": "place-village", "type": "symbol", "source-layer": "place", "minzoom": 8,
         "filter": ["==", ["get", "class"], "village"],
         "layout": {"text-field": NAME, "text-font": SANS, "text-max-width": 8,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 12.5]},
         "paint": dict(**{"text-color": p["label_soft"]}, **halo)})
    add({"id": "place-town", "type": "symbol", "source-layer": "place", "minzoom": 6,
         "filter": ["==", ["get", "class"], "town"],
         "layout": {"text-field": NAME, "text-font": SANS, "text-max-width": 8,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10.5, 11, 14]},
         "paint": dict(**{"text-color": p["label"]}, **halo)})
    add({"id": "place-city", "type": "symbol", "source-layer": "place", "minzoom": 3.5,
         "filter": ["all", ["==", ["get", "class"], "city"], ["!=", ["get", "capital"], 2]],
         "layout": {"text-field": NAME, "text-font": SANS, "text-max-width": 8,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 8, 14, 12, 19]},
         "paint": dict(**{"text-color": p["label_place"]}, **halo)})
    add({"id": "place-capital", "type": "symbol", "source-layer": "place", "minzoom": 3,
         "filter": ["all", ["==", ["get", "class"], "city"], ["==", ["get", "capital"], 2]],
         "layout": {"text-field": NAME, "text-font": BOLD, "text-max-width": 8,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11.5, 8, 14.5, 12, 20]},
         "paint": dict(**{"text-color": p["label_place"]}, **halo)})
    add({"id": "place-state", "type": "symbol", "source-layer": "place", "minzoom": 4, "maxzoom": 9,
         "filter": ["==", ["get", "class"], "state"],
         "layout": {"text-field": NAME, "text-font": SANS, "text-max-width": 8, "text-transform": "uppercase", "text-letter-spacing": 0.12,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 4, 9.5, 8, 12]},
         "paint": dict(**{"text-color": p["label_soft"]}, **halo)})
    add({"id": "place-country", "type": "symbol", "source-layer": "place", "maxzoom": 8,
         "filter": ["==", ["get", "class"], "country"],
         "layout": {"text-field": NAME, "text-font": BOLD, "text-max-width": 6.5, "text-letter-spacing": 0.04,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 4, 14, 7, 18]},
         "paint": dict(**{"text-color": p["label_country"]}, **halo)})
    return L


def style(key, p):
    return {
        "version": 8,
        "name": "Record Atlas " + p["name"],
        "metadata": {"ra:key": key, "ra:dark": p["dark"], "ra:attribution": ATTRIBUTION,
                     "ra:note": "Generated by scripts/build-basemap-styles.py; edit the palette there, not this file."},
        "glyphs": GLYPHS,
        "sources": {"openmaptiles": {"type": "vector", "url": TILES, "attribution": ATTRIBUTION}},
        "layers": layers(p),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for key, p in PALETTES.items():
        path = OUT / (key + ".json")
        path.write_text(json.dumps(style(key, p), separators=(",", ":"), ensure_ascii=False) + "\n")
        print(f"{path.relative_to(OUT.parent.parent.parent)}  {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    sys.exit(main())
