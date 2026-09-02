import { Skia, type SkPath, type SkPathBuilder } from '@shopify/react-native-skia';
import { BLOB_POINTS, blobPoints, type Shape } from '@field/core';

/**
 * The wax outline as a Skia path.
 *
 * The web builds an SVG `d` string out of the same samples; parsing that
 * string back into a path thirty times a second for every headline on the
 * board would be a strange way to spend a phone's battery, so the points go
 * straight into a path here instead. The curve construction is the same one,
 * kept deliberately line for line with `blobPath` in the core: Catmull-Rom
 * through every sample, converted segment by segment to a cubic, so the
 * outline is continuous in slope and no sample can become a corner.
 *
 * Built through one long-lived `SkPathBuilder` rather than by mutating a path
 * in place. Skia's paths are immutable now — the in-place calls still work but
 * warn on every use and are going away — and a builder that is reset and
 * detached costs one cheap handle per blob per frame.
 */

const WRAP = BLOB_POINTS - 1;

/** One builder for the whole board; reset before each outline. */
const builder: SkPathBuilder = Skia.PathBuilder.Make();

/** The outline of `s` at `clock`, as a fresh immutable path. */
export function blobPath(
  s: Shape,
  clock: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): SkPath {
  const { x, y, n } = blobPoints(s, clock, cx, cy, rx, ry);
  builder.reset();
  builder.moveTo(x[0], y[0]);
  for (let i = 0; i < n; i++) {
    const back = (i - 1) & WRAP;
    const next = (i + 1) & WRAP;
    const over = (i + 2) & WRAP;
    builder.cubicTo(
      x[i] + (x[next] - x[back]) / 6,
      y[i] + (y[next] - y[back]) / 6,
      x[next] - (x[over] - x[i]) / 6,
      y[next] - (y[over] - y[i]) / 6,
      x[next],
      y[next],
    );
  }
  builder.close();
  // Hands back the path and leaves the builder empty for the next one.
  return builder.detach();
}
