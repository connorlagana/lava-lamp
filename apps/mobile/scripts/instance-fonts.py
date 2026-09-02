#!/usr/bin/env python3
"""
Turn the two vendored web faces into what Skia can actually open.

Two problems with handing the browser's fonts straight to a phone:

1. Skia does not read woff2. It wants a plain TTF, so both faces are
   decompressed.

2. Fraunces is a *variable* font, and the board's layout is derived from
   measured text width. The browser picks a weight per depth and — because
   `font-optical-sizing: auto` is on — an optical size to match the font size.
   Skia would open the file at its default instance (wght 900) and measure
   every string wider than the web did, which would not merely look different:
   `graph.boxOf` feeds the layout engine, so the tree would lay out wrong.

   So one static instance is baked per depth, pinned at exactly the axis values
   the browser resolves for that depth. `measure(text, depth)` then has one
   typeface per depth to ask, and the two platforms agree.

The pins below mirror DEPTH_STYLES in packages/core/src/canvas/typography.ts,
and this script fails loudly if they have drifted apart.

    python3 scripts/instance-fonts.py
"""
import pathlib
import re
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / 'apps/web/src/fonts'
OUT = pathlib.Path(__file__).resolve().parents[1] / 'assets/fonts'
TYPOGRAPHY = ROOT / 'packages/core/src/canvas/typography.ts'

# depth -> (family, weight, optical size). Depth 0 is the display face.
PINS = [
    ('display', 400, None),
    ('text', 620, 22.0),
    ('text', 570, 17.5),
    ('text', 530, 15.0),
    ('text', 500, 13.5),
]


def check_against_core() -> None:
    """DEPTH_STYLES is the source of truth; shout if these pins have drifted."""
    text = TYPOGRAPHY.read_text()
    rows = re.findall(
        r"\{\s*family:\s*'(\w+)',\s*size:\s*([\d.]+),\s*weight:\s*(\d+)", text
    )
    if not rows:
        sys.exit('could not read DEPTH_STYLES out of typography.ts')
    actual = [(f, int(w), None if f == 'display' else float(s)) for f, s, w in rows]
    if actual != PINS:
        sys.exit(
            'DEPTH_STYLES has changed and these instances no longer match it.\n'
            f'  typography.ts: {actual}\n'
            f'  this script:   {PINS}\n'
            'Update PINS above and re-run.'
        )


def main() -> None:
    check_against_core()
    OUT.mkdir(parents=True, exist_ok=True)

    display = TTFont(SRC / 'bagel-fat-one-latin.woff2')
    display.flavor = None
    display.save(OUT / 'depth-0.ttf')
    print(f'depth-0.ttf   Bagel Fat One  (static)')

    for depth, (family, weight, opsz) in enumerate(PINS):
        if family == 'display':
            continue
        var = TTFont(SRC / 'fraunces-latin-var.woff2')
        static = instancer.instantiateVariableFont(
            var, {'wght': weight, 'opsz': opsz}, inplace=True, updateFontNames=False
        )
        static.flavor = None
        path = OUT / f'depth-{depth}.ttf'
        static.save(path)
        size = path.stat().st_size // 1024
        print(f'depth-{depth}.ttf   Fraunces wght={weight} opsz={opsz}  ({size}KB)')


if __name__ == '__main__':
    main()
