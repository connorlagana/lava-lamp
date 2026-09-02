#!/usr/bin/env python3
"""
Prove the phone measures text the way the browser does.

This is the load-bearing assumption of the whole port. `graph.boxOf` calls
`measure`, the layout engine calls `boxOf`, and node positions are written
straight to the database — so if the two platforms disagree about how wide a
word is, they disagree about where thoughts go, and a map tidied on a phone
comes back subtly wrong on a laptop.

The browser renders Fraunces as a *variable* font, picking `wght` from the
depth's font-weight and — because `font-optical-sizing: auto` is on — `opsz`
from its font-size. The phone renders one static instance per depth, baked by
`instance-fonts.py`. This checks that the baked instance really does carry the
advance widths the variable font would have produced at that location, by
computing them a second way: straight out of the HVAR delta store.

Note the `avar` table. Fraunces bends both of its interesting axes, so the
naive (value - default) / (max - default) normalisation is wrong and will
report a disagreement of about a pixel per headline that is not really there.
The mapping has to be applied. That is the one subtlety in this file.

    python3 scripts/check-font-parity.py

Exits non-zero if any string disagrees by more than per-glyph rounding.
"""
import pathlib
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib.models import piecewiseLinearMap
from fontTools.varLib.varStore import VarStoreInstancer

ROOT = pathlib.Path(__file__).resolve().parents[3]
VARIABLE = ROOT / 'apps/web/src/fonts/fraunces-latin-var.woff2'
INSTANCES = pathlib.Path(__file__).resolve().parents[1] / 'assets/fonts'

# depth -> (weight, optical size), mirroring DEPTH_STYLES. Depth 0 is the
# display face, which is static and has nothing to check.
PINS = {1: (620, 22.0), 2: (570, 17.5), 3: (530, 15.0), 4: (500, 13.5)}

SAMPLES = [
    'Energy',
    'grid-scale storage',
    'What will we be creating today?',
    'housing supply',
    'Why is nothing being built?',
]


def main() -> None:
    var = TTFont(VARIABLE)
    fvar = var['fvar']
    hvar = var['HVAR']
    base = var['hmtx']
    cmap = var.getBestCmap()
    order = var.getGlyphOrder()
    axes = {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in fvar.axes}
    avar = var['avar'].segments if 'avar' in var else {}
    upem = var['head'].unitsPerEm

    def normalise(tag: str, value: float) -> float:
        lo, default, hi = axes[tag]
        if value == default:
            n = 0.0
        elif value > default:
            n = (value - default) / (hi - default)
        else:
            n = (value - default) / (default - lo)
        return piecewiseLinearMap(n, avar[tag]) if tag in avar else n

    worst = 0.0
    failed = False

    for depth, (weight, opsz) in PINS.items():
        location = {
            'wght': normalise('wght', weight),
            'opsz': normalise('opsz', opsz),
            'SOFT': 0.0,
            'WONK': normalise('WONK', 1),
        }
        deltas = VarStoreInstancer(hvar.table.VarStore, fvar.axes, location)
        static = TTFont(INSTANCES / f'depth-{depth}.ttf')['hmtx']

        for sample in SAMPLES:
            want = have = 0.0
            for ch in sample:
                glyph = cmap.get(ord(ch))
                if glyph is None:
                    continue
                index = (
                    hvar.table.AdvWidthMap.mapping[glyph]
                    if hvar.table.AdvWidthMap
                    else order.index(glyph)
                )
                want += base[glyph][0] + deltas[index]
                have += static[glyph][0]

            drift = abs(want - have)
            worst = max(worst, drift)
            # Instancing rounds each glyph's advance to an integer, so half a
            # unit per glyph is expected and anything beyond it is not.
            budget = len(sample) * 0.5 + 0.01
            ok = drift <= budget
            failed |= not ok
            print(
                f'  depth {depth}  {sample[:34]:36} '
                f'drift={drift:6.2f}  budget={budget:6.2f}  {"ok" if ok else "MISMATCH"}'
            )

    size = 22
    print(f'\nworst drift {worst:.2f} units at {upem}/em = {worst / upem * size:.4f}px on a {size}px line')
    if failed:
        sys.exit('font instances do not match the variable font — re-run instance-fonts.py')
    print('instances agree with the variable font.')


if __name__ == '__main__':
    main()
