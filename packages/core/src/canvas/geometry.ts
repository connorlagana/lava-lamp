import type { Board, Point, Rect, Thought } from '../model/types';
import { lampClock, radiusAt, waxFor } from './blob';
import { fieldPad } from './lava';
import { measure, padding } from './typography';

/**
 * Where a line should meet a thought: on its rim, never at its centre.
 *
 * The rim is not an ellipse — it is an ellipse with three slow harmonics laid
 * over it — so the meeting point is found in two steps. The angle is taken on
 * the underlying ellipse, which is where a straight run from the far node
 * crosses it; the radius is then read off the live curve at that angle. The
 * modulation tilts the true crossing by a fraction of a degree, far less than
 * the width of the line being drawn.
 *
 * Reading the *live* curve matters: a bubble whose outline breathes while its
 * branches stay pinned where the outline used to be looks broken within a
 * second or two. Deeper thoughts never move, so for most of a map this is the
 * same answer every time it is asked.
 */
export function anchorOn(node: Thought, toward: Point, clock = lampClock()): Point {
  const cx = node.x;
  const cy = node.y;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };

  const m = measure(node.text, node.depth);
  const fp = fieldPad(m, padding(node.depth), node.depth);
  const rx = m.w / 2 + fp.x;
  const ry = m.h / 2 + fp.y;

  const theta = Math.atan2(dy / ry, dx / rx);
  const r = radiusAt(waxFor(node.id, node.depth).a, theta, clock);
  return { x: cx + rx * r * Math.cos(theta), y: cy + ry * r * Math.sin(theta) };
}

/**
 * Parent to child: a soft branch. Control points lean along whichever axis
 * dominates, so a child directly below gets a gentle vertical stem and a child
 * off to the side gets a sweeping arc.
 * `tension` (0..1) is fed by dragging so the thread stretches a little.
 */
export function branchPath(from: Point, to: Point, tension = 0): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // A child below its parent always leaves downward and arrives from above,
  // however far sideways it sits. Only true side-by-side pairs get a lateral arc.
  const vertical = dy > 0 ? Math.abs(dy) >= Math.abs(dx) * 0.2 : Math.abs(dy) >= Math.abs(dx) * 0.7;
  const pull = (1 + tension * 0.35);

  if (vertical) {
    const k = Math.max(26, Math.abs(dy) * 0.46) * pull;
    return `M ${r(from.x)} ${r(from.y)} C ${r(from.x)} ${r(from.y + k)}, ${r(to.x)} ${r(to.y - k)}, ${r(to.x)} ${r(to.y)}`;
  }
  const k = Math.max(30, Math.abs(dx) * 0.44) * pull;
  const sign = Math.sign(dx) || 1;
  return `M ${r(from.x)} ${r(from.y)} C ${r(from.x + k * sign)} ${r(from.y)}, ${r(to.x - k * sign)} ${r(to.y)}, ${r(to.x)} ${r(to.y)}`;
}

/** Association: a single bowed curve, so it never overlaps a branch of the same pair. */
export function associationPath(from: Point, to: Point, bow = 0.13): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = Math.min(140, len * bow);
  return `M ${r(from.x)} ${r(from.y)} Q ${r(mx + nx * off)} ${r(my + ny * off)}, ${r(to.x)} ${r(to.y)}`;
}

/** Midpoint of the same quadratic, for placing a relationship label. */
export function associationMid(from: Point, to: Point, bow = 0.13): Point {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = Math.min(140, len * bow);
  const cx = mx + (-dy / len) * off;
  const cy = my + (dx / len) * off;
  // Bezier at t = 0.5
  return { x: 0.25 * from.x + 0.5 * cx + 0.25 * to.x, y: 0.25 * from.y + 0.5 * cy + 0.25 * to.y };
}

export interface EdgeGeometry {
  d: string;
  from: Point;
  to: Point;
  mid: Point;
}

export function branchGeometry(
  board: Board,
  parentId: string,
  childId: string,
  tension = 0,
  clock = lampClock(),
): EdgeGeometry | null {
  const parent = board.nodes[parentId];
  const child = board.nodes[childId];
  if (!parent || !child) return null;
  const from = anchorOn(parent, child, clock);
  const to = anchorOn(child, parent, clock);
  return { d: branchPath(from, to, tension), from, to, mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } };
}

export function associationGeometry(
  board: Board,
  sourceId: string,
  targetId: string,
  clock = lampClock(),
): EdgeGeometry | null {
  const a = board.nodes[sourceId];
  const b = board.nodes[targetId];
  if (!a || !b) return null;
  const from = anchorOn(a, b, clock);
  const to = anchorOn(b, a, clock);
  return { d: associationPath(from, to), from, to, mid: associationMid(from, to) };
}

const r = (n: number) => Math.round(n * 10) / 10;

export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const expandRect = (r0: Rect, by: number): Rect => ({
  x: r0.x - by,
  y: r0.y - by,
  w: r0.w + by * 2,
  h: r0.h + by * 2,
});
