import type { Board, ID, Rect, Thought } from './types';
import { measure, padding } from '../canvas/typography';

/**
 * Read-only queries over the board. Nothing here mutates; the index is
 * recomputed whenever the board object identity changes.
 */

export interface GraphIndex {
  /** parent id -> ordered child ids (left to right, then by age) */
  children: Map<ID, ID[]>;
  roots: ID[];
  /** node id -> ids reachable through associative links */
  linked: Map<ID, ID[]>;
}

export function buildIndex(board: Board): GraphIndex {
  const children = new Map<ID, ID[]>();
  const roots: ID[] = [];
  const linked = new Map<ID, ID[]>();

  for (const n of Object.values(board.nodes)) {
    if (n.parentId && board.nodes[n.parentId]) {
      const list = children.get(n.parentId);
      if (list) list.push(n.id);
      else children.set(n.parentId, [n.id]);
    } else {
      roots.push(n.id);
    }
  }
  const byPosition = (a: ID, b: ID) => {
    const na = board.nodes[a];
    const nb = board.nodes[b];
    return na.x - nb.x || na.createdAt - nb.createdAt;
  };
  for (const list of children.values()) list.sort(byPosition);
  roots.sort(byPosition);

  const relate = (a: ID, b: ID) => {
    const list = linked.get(a);
    if (list) list.push(b);
    else linked.set(a, [b]);
  };
  for (const l of Object.values(board.links)) {
    if (!board.nodes[l.source] || !board.nodes[l.target]) continue;
    relate(l.source, l.target);
    relate(l.target, l.source);
  }

  return { children, roots, linked };
}

export const childrenOf = (index: GraphIndex, id: ID): ID[] => index.children.get(id) ?? [];

/** Walk up to the root. Cycle-guarded, because a bad import should not hang the app. */
export function ancestors(board: Board, id: ID): ID[] {
  const out: ID[] = [];
  const seen = new Set<ID>([id]);
  let cur = board.nodes[id]?.parentId ?? null;
  while (cur && board.nodes[cur] && !seen.has(cur)) {
    out.unshift(cur);
    seen.add(cur);
    cur = board.nodes[cur].parentId;
  }
  return out;
}

export function depthOf(board: Board, id: ID): number {
  return ancestors(board, id).length;
}

/** Depth-first list of every descendant, excluding the node itself. */
export function descendants(index: GraphIndex, id: ID): ID[] {
  const out: ID[] = [];
  const stack = [...childrenOf(index, id)];
  const seen = new Set<ID>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    stack.push(...childrenOf(index, cur));
  }
  return out;
}

export const subtree = (index: GraphIndex, id: ID): ID[] => [id, ...descendants(index, id)];

export function siblingsOf(board: Board, index: GraphIndex, id: ID): ID[] {
  const parent = board.nodes[id]?.parentId ?? null;
  return parent ? childrenOf(index, parent) : index.roots;
}

export const linkedTo = (index: GraphIndex, id: ID): ID[] => index.linked.get(id) ?? [];

/** Rewrites every node's cached depth. Cheap enough to run after any structural edit. */
export function recomputeDepths(board: Board): void {
  for (const n of Object.values(board.nodes)) {
    const d = depthOf(board, n.id);
    if (n.depth !== d) board.nodes[n.id] = { ...n, depth: d };
  }
}

/** The node's box in world space, text plus its breathing room. */
export function boxOf(node: Thought): Rect {
  const m = measure(node.text, node.depth);
  const p = padding(node.depth);
  const w = m.w + p.x * 2;
  const h = m.h + p.y * 2;
  return { x: node.x - w / 2, y: node.y - h / 2, w, h };
}

export function boardBounds(board: Board): Rect {
  const nodes = Object.values(board.nodes);
  if (!nodes.length) return { x: -400, y: -300, w: 800, h: 600 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const b = boxOf(n);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function boundsOfNodes(board: Board, ids: ID[]): Rect {
  const present = ids.map((id) => board.nodes[id]).filter(Boolean);
  if (!present.length) return boardBounds(board);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of present) {
    const b = boxOf(n);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export interface SearchHit {
  id: ID;
  score: number;
  path: string;
}

/** Small, forgiving substring search across titles, notes and link labels. */
export function searchNodes(board: Board, query: string, limit = 8): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const n of Object.values(board.nodes)) {
    const text = n.text.toLowerCase();
    let score = -1;
    if (text === q) score = 0;
    else if (text.startsWith(q)) score = 1;
    else if (text.includes(q)) score = 2;
    else if (n.note.toLowerCase().includes(q)) score = 3;
    if (score < 0) continue;
    hits.push({
      id: n.id,
      score: score + n.depth * 0.05,
      path: ancestors(board, n.id).map((a) => board.nodes[a].text).join('  /  '),
    });
  }
  hits.sort((a, b) => a.score - b.score || a.path.length - b.path.length);
  return hits.slice(0, limit);
}
