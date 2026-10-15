#!/usr/bin/env python3
"""
Builds the MKG Services logo files in this folder from the site's own typeface
(Bricolage Grotesque). All text is converted to outlines, so the SVGs look the
same everywhere: favicons, <img> tags, print shops, embroidery, social avatars.

Run from the repo root:
    npm i --prefix /tmp/mkgfont @fontsource/bricolage-grotesque@5
    python3 brand/make-logo.py /tmp/mkgfont/node_modules/@fontsource/bricolage-grotesque/files

Edit the WORDS block to change the ring text (e.g. to add "LLC"), then rerun.
"""
import math
import os
import sys

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "fonts")

# ---- brand ---------------------------------------------------------------
INK = "#0f2e2c"
PINE = "#176b61"
PAPER = "#f7faf8"
LEMON = "#ffd93b"

WORDS = {
    "name": "MKG",
    "sub": "SERVICES",
    "top": "CHARLOTTE, NORTH CAROLINA",
    "bottom": "ESTABLISHED 2014",
}


# ---- font helpers ----------------------------------------------------------
class Face:
    def __init__(self, weight):
        path = os.path.join(FONT_DIR, f"bricolage-grotesque-latin-{weight}-normal.woff")
        self.tt = TTFont(path)
        self.upm = self.tt["head"].unitsPerEm
        self.glyphs = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()
        # HarfBuzz reads plain sfnt data, not the WOFF wrapper, so unpack it in memory.
        import io
        raw = io.BytesIO()
        self.tt.flavor = None
        self.tt.save(raw)
        self.hb = hb.Font(hb.Face(raw.getvalue()))
        self.hb.scale = (self.upm, self.upm)

    def shape(self, text, tracking_em=0.0):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {"kern": True, "liga": False})
        out = []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            out.append((self.order[info.codepoint], pos.x_advance + tracking_em * self.upm))
        return out

    def outline(self, name, xx, xy, yx, yy, dx, dy):
        pen = SVGPathPen(self.glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        self.glyphs[name].draw(TransformPen(pen, (xx, xy, yx, yy, dx, dy)))
        return pen.getCommands()


def text_line(face, text, size, cx, y, tracking=0.0):
    """Horizontal text centred on cx with its baseline at y. Returns an SVG path d."""
    glyphs = face.shape(text, tracking)
    s = size / face.upm
    total = sum(a for _, a in glyphs) * s - tracking * size
    x = cx - total / 2
    d = []
    for name, adv in glyphs:
        d.append(face.outline(name, s, 0, 0, -s, x, y))
        x += adv * s
    return " ".join(p for p in d if p)


def arc_text(face, text, size, cx, cy, radius, side, tracking=0.0):
    """Text set on a circle. side='top' reads clockwise over the top (baseline
    inside); side='bottom' reads left-to-right under the bottom (baseline outside)."""
    glyphs = face.shape(text, tracking)
    s = size / face.upm
    advs = [a * s for _, a in glyphs]
    total = sum(advs) - tracking * size
    span = math.degrees(total / radius)
    centre = 0 if side == "top" else 180
    sign = 1 if side == "top" else -1
    phi = centre - sign * span / 2
    d = []
    for (name, _), adv in zip(glyphs, advs):
        mid = phi + sign * math.degrees(adv / 2 / radius)
        r = math.radians(mid)
        px, py = cx + radius * math.sin(r), cy - radius * math.cos(r)
        theta = math.radians(mid if side == "top" else mid + 180)
        xx, xy = s * math.cos(theta), s * math.sin(theta)
        yx, yy = s * math.sin(theta), -s * math.cos(theta)
        adv_units = adv / s
        d.append(face.outline(name, xx, xy, yx, yy, px - xx * adv_units / 2, py - xy * adv_units / 2))
        phi += sign * math.degrees(adv / radius)
    return " ".join(p for p in d if p)


def sparkle(cx, cy, r, c=0.14):
    """Four-point sparkle; c sets how full the arms are (0 = needle-thin)."""
    k = c * r
    return (f"M{cx} {cy - r} Q{cx + k} {cy - k} {cx + r} {cy} Q{cx + k} {cy + k} {cx} {cy + r} "
            f"Q{cx - k} {cy + k} {cx - r} {cy} Q{cx - k} {cy - k} {cx} {cy - r}Z")


def crown(cx, cy, scale=1.0):
    """Three sparkles rising to the middle: a sparkle, and a nod to the Queen City's crown."""
    return " ".join([
        sparkle(cx, cy, 26 * scale),
        sparkle(cx - 52 * scale, cy + 20 * scale, 15 * scale),
        sparkle(cx + 52 * scale, cy + 20 * scale, 15 * scale),
    ])


# ---- the badge ---------------------------------------------------------------
def badge(scheme):
    """scheme: 'color' | 'mono' | 'reverse'"""
    heavy, bold = Face(800), Face(700)
    C = 256
    if scheme == "color":
        band, disc, text, accent, key = INK, PINE, PAPER, LEMON, LEMON
    elif scheme == "mono":
        band = disc = None
        text = accent = key = INK
    else:
        band = disc = None
        text = accent = key = PAPER

    parts = []
    if scheme == "color":
        parts.append(f'<circle cx="{C}" cy="{C}" r="254" fill="{band}"/>')
        parts.append(f'<circle cx="{C}" cy="{C}" r="247" fill="none" stroke="{text}" stroke-opacity="0.28" stroke-width="1.5"/>')
        parts.append(f'<circle cx="{C}" cy="{C}" r="200" fill="{disc}"/>')
        parts.append(f'<circle cx="{C}" cy="{C}" r="203" fill="none" stroke="{key}" stroke-width="2"/>')
    else:
        parts.append(f'<circle cx="{C}" cy="{C}" r="249" fill="none" stroke="{text}" stroke-width="10"/>')
        parts.append(f'<circle cx="{C}" cy="{C}" r="203" fill="none" stroke="{text}" stroke-width="2.5"/>')

    # ring text and separators
    parts.append(f'<path fill="{text}" d="{arc_text(bold, WORDS["top"], 22, C, C, 218, "top", 0.22)}"/>')
    parts.append(f'<path fill="{text}" d="{arc_text(bold, WORDS["bottom"], 22, C, C, 234, "bottom", 0.22)}"/>')
    parts.append(f'<path fill="{accent}" d="{sparkle(C - 226, C, 11)} {sparkle(C + 226, C, 11)}"/>')

    # centre
    parts.append(f'<path fill="{accent}" d="{crown(C, 158)}"/>')
    parts.append(f'<path fill="{text}" d="{text_line(heavy, WORDS["name"], 124, C, 312, -0.02)}"/>')
    parts.append(f'<path d="M198 331H314" stroke="{text}" stroke-opacity="{0.45 if scheme == "color" else 1}" stroke-width="1.5" stroke-linecap="round"/>')
    parts.append(f'<path fill="{text}" d="{text_line(bold, WORDS["sub"], 22, C, 360, 0.3)}"/>')

    return svg(512, parts, "MKG Services badge: Charlotte, North Carolina, established 2014")


def mark(scheme):
    """Compact mark for small sizes: disc, sparkle crown, MKG."""
    heavy = Face(800)
    C = 256
    parts = []
    if scheme == "color":
        parts.append(f'<circle cx="{C}" cy="{C}" r="256" fill="{PINE}"/>')
        text, accent = PAPER, LEMON
    elif scheme == "mono":
        parts.append(f'<circle cx="{C}" cy="{C}" r="249" fill="none" stroke="{INK}" stroke-width="14"/>')
        text = accent = INK
    else:
        text = accent = PAPER
    parts.append(f'<path fill="{accent}" d="{crown(C, 150, 1.5)}"/>')
    parts.append(f'<path fill="{text}" d="{text_line(heavy, WORDS["name"], 166, C, 366, -0.02)}"/>')
    return svg(512, parts, "MKG Services mark")


def svg(size, parts, title):
    body = "\n  ".join(parts)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="{title}">\n'
            f'  <title>{title}</title>\n  {body}\n</svg>\n')


def write(name, content):
    with open(os.path.join(HERE, name), "w") as f:
        f.write(content)
    print("wrote", name, f"{len(content) // 1024} KB")


if __name__ == "__main__":
    write("logo-badge.svg", badge("color"))
    write("logo-badge-mono.svg", badge("mono"))
    write("logo-badge-reverse.svg", badge("reverse"))
    write("logo-mark.svg", mark("color"))
    write("logo-mark-mono.svg", mark("mono"))
    write("logo-mark-reverse.svg", mark("reverse"))
