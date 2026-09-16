#!/usr/bin/env python3
"""Open Graph cards, one per kind of page.

A shared link to Gračišće rendered as a blank grey rectangle, which is what a
page with no og:image gets. One card per PAGE TYPE rather than per page: 5,924
images would be a gigabyte of pictures nobody looks at twice, and the type is
what actually differs — a place, an archive, a surname, a dataset.

Drawn in the site's own palette so a card looks like the page it opens.
"""
import os
from PIL import Image, ImageDraw, ImageFont

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
OUT = "site/public/og"
os.makedirs(OUT, exist_ok=True)

GROUND, INK, INK3, ACCENT, RULE = "#EDEBE5", "#16222A", "#7C8A91", "#1F5C6B", "#D3D0C7"
SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_B = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"

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
    d.text((80, 540), "daviddef.github.io/TheMap", font=f, fill=ACCENT)
    im.save(f"{OUT}/{key}.png", optimize=True)
    print(f"  og/{key}.png  {os.path.getsize(f'{OUT}/{key}.png')//1024} KB")
print(f"{len(CARDS)} cards -> {OUT}")
