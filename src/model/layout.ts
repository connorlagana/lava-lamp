import type { Board, ID, Point } from './types';
import { boxOf, buildIndex, childrenOf, descendants, type GraphIndex } from './graph';
import { wobble } from '../lib/rand';

/**
 * Placement. Two rules govern everything here:
 *
 *   1. A branch may tidy itself. The map may never tidy itself.
 *   2. Anything the user has dragged is pinned and is never moved again
 *      unless they explicitly ask for a tidy.
 */

/** Vertical air between a parent and its children, by the parent's depth. */
export function verticalGap(depth: number): number {
  return [78, 64, 54, 46, 42][Math.min(depth, 4)];
}

/** Horizontal air between siblings, by their own depth. */
export function siblingGap(depth: number): number {
  return [46, 38, 32, 28, 26][Math.min(depth, 4)];
}

/**
 * A wide fan of children needs more headroom than a narrow one, or the
 * branches leaving the parent flatten into a spaghetti of near-horizontal
 * curves. Depth sets the base; the width of the row buys the rest.
 */
export function rowGap(depth: number, rowWidth: number): number {
  return verticalGap(depth) + Math.min(78, rowWidth * 0.05);
}

const halfH = (board: Board, id: ID) => boxOf(board.nodes[id]).h / 2;
const widthOf = (board: Board, id: ID) => boxOf(board.nodes[id]).w;

/**
 * Lay a parent's direct children out in a centred row beneath it.
 * Each child carries its own subtree along by the same delta, so deeper
 * structure keeps the shape the user gave it.
 */
export function arrangeChildren(board: Board, index: GraphIndex, parentId: ID): void {
  const parent = board.nodes[parentId];
  if (!parent) return;
  const kids = childrenOf(index, parentId);
  if (!kids.length) return;

  const depth = parent.depth + 1;
  const gap = siblingGap(depth);
  const widths = kids.map((id) => widthOf(board, id));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (kids.length - 1);
  let cursor = parent.x - total / 2;
  const baseY = parent.y + halfH(board, parentId) + rowGap(parent.depth, total);

  kids.forEach((id, i) => {
    const cx = cursor + widths[i] / 2 + wobble(id, 3, 5);
    const cy = baseY + halfH(board, id) + wobble(id, 7, 9);
    translateSubtree(board, index, id, cx - board.nodes[id].x, cy - board.nodes[id].y);
    cursor += widths[i] + gap;
  });
}

export function translateSubtree(board: Board, index: GraphIndex, id: ID, dx: number, dy: number): void {
  if (!dx && !dy) return;
  for (const nid of [id, ...descendants(index, id)]) {
    const n = board.nodes[nid];
    board.nodes[nid] = { ...n, x: n.x + dx, y: n.y + dy };
  }
}

/**
 * Where a brand new child should appear.
 * If none of its siblings has been placed by hand, the whole row re-centres
 * itself around the parent; otherwise the newcomer simply joins the right end.
 */
export function placeNewChild(board: Board, parentId: ID, newId: ID): void {
  const index = buildIndex(board);
  const parent = board.nodes[parentId];
  const kids = childrenOf(index, parentId);
  const anyPinned = kids.some((id) => id !== newId && board.nodes[id].pinned);

  if (!anyPinned) {
    arrangeChildren(board, index, parentId);
    return;
  }

  const others = kids.filter((id) => id !== newId);
  const rightmost = others.reduce((best, id) => {
    const b = boxOf(board.nodes[id]);
    return Math.max(best, b.x + b.w);
  }, -Infinity);
  const reference = others.length ? board.nodes[others[others.length - 1]] : parent;
  const child = board.nodes[newId];
  const depth = parent.depth + 1;

  board.nodes[newId] = {
    ...child,
    x: others.length
      ? rightmost + siblingGap(depth) + boxOf(child).w / 2
      : parent.x + wobble(newId, 3, 5),
    y: others.length
      ? reference.y
      : parent.y + halfH(board, parentId) + verticalGap(parent.depth) + boxOf(child).h / 2,
  };
}

/** A sibling lands beside its neighbour, then the row re-centres if it may. */
export function placeNewSibling(board: Board, afterId: ID, newId: ID): void {
  const after = board.nodes[afterId];
  const child = board.nodes[newId];
  const b = boxOf(after);
  board.nodes[newId] = {
    ...child,
    x: b.x + b.w + siblingGap(child.depth) + boxOf(child).w / 2,
    y: after.y,
  };
  if (after.parentId && !after.pinned) {
    const index = buildIndex(board);
    const kids = childrenOf(index, after.parentId);
    if (!kids.some((id) => id !== newId && board.nodes[id].pinned)) {
      arrangeChildren(board, index, after.parentId);
    }
  }
}

/**
 * Tidy one branch: a classic centred tree, softened by a deterministic wobble
 * so it reads as growth rather than as an org chart. Only ever touches the
 * node you asked for and what hangs below it.
 */
export function tidyBranch(board: Board, rootId: ID): Map<ID, Point> {
  const index = buildIndex(board);
  const root = board.nodes[rootId];
  if (!root) return new Map();

  const extent = new Map<ID, number>();
  const measureSubtree = (id: ID): number => {
    const kids = childrenOf(index, id);
    if (!kids.length) {
      const w = widthOf(board, id);
      extent.set(id, w);
      return w;
    }
    const depth = board.nodes[id].depth + 1;
    const gap = siblingGap(depth);
    const sum = kids.reduce((a, k) => a + measureSubtree(k), 0) + gap * (kids.length - 1);
    const w = Math.max(widthOf(board, id), sum);
    extent.set(id, w);
    return w;
  };
  measureSubtree(rootId);

  const placed = new Map<ID, Point>();
  const place = (id: ID, cx: number, cy: number) => {
    placed.set(id, { x: cx, y: cy });
    const kids = childrenOf(index, id);
    if (!kids.length) return;
    const node = board.nodes[id];
    const depth = node.depth + 1;
    const gap = siblingGap(depth);
    const total = kids.reduce((a, k) => a + (extent.get(k) ?? 0), 0) + gap * (kids.length - 1);
    let cursor = cx - total / 2;
    const baseY = cy + boxOf(node).h / 2 + rowGap(node.depth, total);
    for (const k of kids) {
      const w = extent.get(k) ?? 0;
      const kx = cursor + w / 2 + wobble(k, 11, 6);
      const ky = baseY + boxOf(board.nodes[k]).h / 2 + wobble(k, 13, 10);
      place(k, kx, ky);
      cursor += w + gap;
    }
  };
  place(rootId, root.x, root.y);

  return placed;
}

/** A free spot near a point, nudged downward until it stops colliding. */
export function findOpenSpot(board: Board, at: Point, w: number, h: number): Point {
  const boxes = Object.values(board.nodes).map(boxOf);
  const pad = 26;
  const spot = { ...at };
  for (let attempt = 0; attempt < 40; attempt++) {
    const rect = { x: spot.x - w / 2, y: spot.y - h / 2, w, h };
    const clash = boxes.find(
      (b) =>
        rect.x < b.x + b.w + pad &&
        rect.x + rect.w + pad > b.x &&
        rect.y < b.y + b.h + pad &&
        rect.y + rect.h + pad > b.y,
    );
    if (!clash) break;
    spot.y = clash.y + clash.h + pad + h / 2;
  }
  return spot;
}
