#!/usr/bin/env python3
"""Open Graph cards, one per kind of page.

A shared link to Gračišće rendered as a blank grey rectangle, which is what a
page with no og:image gets. One card per PAGE TYPE rather than per page: 5,924
images would be a gigabyte of pictures nobody looks at twice, and the type is
what actually differs — a place, an archive, a surname, a dataset.

Drawn in the site's own palette so a card looks like the page it opens.
"""
import os
import sys

# PILLOW IS THE ONE DEPENDENCY IN THIS PIPELINE THAT IS NOT THE STANDARD
# LIBRARY, and this script joined `npm run data` on 11 October — which means a
# missing Pillow would stop the whole data build on any machine that has not
# got it, including David's, where Homebrew's python refuses `pip install` under
# PEP 668. The cards are the least load-bearing thing the pipeline makes: every
# page falls back to the committed generic card if the per-place ones are
# absent (place/[id].astro reads the directory rather than assuming), so the
# honest behaviour is to say so and stop, not to take the build down with it.
try:
    from PIL import Image, ImageDraw, ImageFont
except ModuleNotFoundError:
    print("og cards SKIPPED: Pillow is not installed "
          "(pip install pillow, or a venv). The six committed cards in "
          "site/public/og/ still serve; per-place cards will be absent and "
          "every place page will fall back to og/place.png.", flush=True)
    sys.exit(0)

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
OUT = "site/public/og"
os.makedirs(OUT, exist_ok=True)

GROUND, INK, INK3, ACCENT, RULE = "#EDEBE5", "#16222A", "#7C8A91", "#1F5C6B", "#D3D0C7"
# THE FONTS HAD TO EXIST ON A LINUX RUNNER TOO. These were three absolute
# paths into /System/Library/Fonts, so this script ran on a Mac and nowhere
# else — fine while it made six cards by hand, useless once the cards are
# built by CI. First match wins, Georgia and Arial still preferred so the
# cards a Mac makes are byte-identical to the ones it made before.
def _font(*names):
    for n in names:
        for d in ("/System/Library/Fonts/Supplemental/",
                  "/usr/share/fonts/truetype/dejavu/",
                  "/usr/share/fonts/truetype/liberation/", ""):
            if os.path.exists(d + n):
                return d + n
    raise SystemExit("no usable font found for " + names[0])

SERIF = _font("Georgia.ttf", "DejaVuSerif.ttf", "LiberationSerif-Regular.ttf")
SERIF_B = _font("Georgia Bold.ttf", "DejaVuSerif-Bold.ttf", "LiberationSerif-Bold.ttf")
SANS = _font("Arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf")

CARDS = [
    ("default",  "Record Atlas", "Every place your people came from, and who holds the paper"),
    ("place",    "A place",      "Every name it has been written under, whose empire held it, and every surviving volume"),
    ("archive",  "An archive",   "What it holds, which ground it covers, and what it costs to look"),
    ("surname",  "A surname",    "Every spelling it takes, and the countries it is attested in"),
    ("region",   "Whose archive","Which empire held this ground in which years — and therefore where the paper is"),
    ("dataset",  "Open data",    "Surnames, archives and record regions. CC0, and downloadable"),
]


def wrap(draw, text, font, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        t = (line + " " + w).strip()
        if draw.textlength(t, font=font) <= width:
            line = t
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


for key, title, sub in CARDS:
    im = Image.new("RGB", (1200, 630), GROUND)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 14, 630], fill=ACCENT)                  # the spine
    d.line([(80, 176), (1120, 176)], fill=RULE, width=2)

    brand = ImageFont.truetype(SERIF_B, 34)
    d.text((80, 96), "Record", font=brand, fill=INK)
    w = d.textlength("Record ", font=brand)
    d.text((80 + w, 96), "Atlas", font=ImageFont.truetype(SERIF, 34), fill=ACCENT)

    t = ImageFont.truetype(SERIF, 76)
    d.text((80, 232), title, font=t, fill=INK)

    s = ImageFont.truetype(SANS, 30)
    y = 348
    for line in wrap(d, sub, s, 1000)[:3]:
        d.text((80, y), line, font=s, fill=INK3)
        y += 44

    f = ImageFont.truetype(SANS, 22)
    d.text((80, 540), "recordatlas.org", font=f, fill=ACCENT)
    im.save(f"{OUT}/{key}.png", optimize=True)
    print(f"  og/{key}.png  {os.path.getsize(f'{OUT}/{key}.png')//1024} KB")
print(f"{len(CARDS)} cards -> {OUT}")


# ---- A CARD PER PLACE, FOR THE PLACES THAT HAVE SOMETHING ------------------
# Worklist row 54: «21,085 place pages share one social card», so every place
# on earth is a grey rectangle when somebody shares it.
#
# NOT ONE PER PLACE PAGE, AND THE ARITHMETIC IS WHY. There are 54,043 place
# pages and a card is 29 KB: 1.48 GB, against the 2.23 GiB of headroom left
# after the artifact spent a day over GitHub's ceiling on 9 October. Two
# thirds of the room, for pages nobody links to.
#
# 1,907 of those places have a collection reaching them, and a page with
# nothing on it is not a page anybody shares. Those get a card naming the
# place, its country and what is actually there — 50 MB — and the rest keep
# the generic one. The docstring above says 5,924 images «would be a gigabyte
# of pictures nobody looks at twice»; this is the same objection, answered by
# only drawing the ones somebody might.
#
# NOT DONE: row 54 also asks for «its shape on a small map». The outlines are
# country-level in site/public/c/, so a shape would be the country and not the
# place — a cartouche of Italy behind the word Giustimana, which is decoration
# rather than information. Left out on purpose.
import json

CN = {k: v["name"] for k, v in
      json.load(open("data/countries.json"))["countries"].items()}

# THE FILE THE PAGES THEMSELVES COME FROM, not data/places.json. place/[id]
# builds its routes from places-full.json's 54,043 rows; data/places.json holds
# 7,391. Both happen to list the same 1,907 places with collections today, so
# either would have drawn the right cards — but a card written for an id with
# no page is an og:image pointing at a 404, and the only way that stays true is
# to read the same file the router reads.
places = json.load(open("site/src/data/places-full.json"))["places"]
pdir = os.path.join(OUT, "place")
os.makedirs(pdir, exist_ok=True)

made = 0
for p in places:
    cols = p.get("collections") or []
    if not cols:
        continue
    im = Image.new("RGB", (1200, 630), GROUND)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 14, 630], fill=ACCENT)
    d.line([(80, 176), (1120, 176)], fill=RULE, width=2)

    brand = ImageFont.truetype(SERIF_B, 34)
    d.text((80, 96), "Record", font=brand, fill=INK)
    w = d.textlength("Record ", font=brand)
    d.text((80 + w, 96), "Atlas", font=ImageFont.truetype(SERIF, 34), fill=ACCENT)

    # The name at whatever size still fits one line: «Sant'Angelo a Cupolo»
    # is three times the width of «Bari» and both have to read.
    name = p.get("name") or p.get("id")
    size = 76
    while size > 34 and d.textlength(name, font=ImageFont.truetype(SERIF, size)) > 1020:
        size -= 4
    d.text((80, 232), name, font=ImageFont.truetype(SERIF, size), fill=INK)

    sans = ImageFont.truetype(SANS, 30)
    where = CN.get(p.get("country") or "", p.get("country") or "")
    if where:
        d.text((80, 232 + size + 28), where, font=sans, fill=INK3)

    # WHAT IS ACTUALLY THERE, counted, not claimed. The years are the span the
    # collections themselves declare, so a card never promises a century the
    # shelf cannot answer for.
    yrs = [c.get("from") for c in cols if c.get("from")] + \
          [c.get("to") for c in cols if c.get("to")]
    line = f"{len(cols):,} collection" + ("" if len(cols) == 1 else "s")
    if yrs:
        line += f"  \u00b7  {min(yrs)}\u2013{max(yrs)}"
    d.text((80, 470), line, font=ImageFont.truetype(SANS, 34), fill=ACCENT)

    d.text((80, 540), "recordatlas.org", font=ImageFont.truetype(SANS, 22), fill=ACCENT)
    im.save(os.path.join(pdir, p["id"] + ".png"), optimize=True)
    made += 1

tot = sum(os.path.getsize(os.path.join(pdir, f)) for f in os.listdir(pdir))
print(f"og/place/*.png   {made:,} cards, {tot/1048576:.0f} MB "
      f"({len(places) - made:,} places with nothing keep the generic card)")
