import type { Accent, Attributes, Board, ID, Point, Thought, ThoughtType } from '../model/types';
import { emptyAttrs } from '../model/types';
import { buildIndex, descendants, recomputeDepths, subtree } from '../model/graph';
import { placeNewChild, placeNewSibling, tidyBranch, translateSubtree } from '../model/layout';
import { uid } from '../lib/id';

/**
 * Every board mutation is a pure function Board -> Board.
 * The store owns history; these know nothing about undo, React or the DOM.
 */

const clone = (board: Board): Board => ({
  ...board,
  nodes: { ...board.nodes },
  links: { ...board.links },
  updatedAt: Date.now(),
});

const touch = (board: Board, id: ID) => {
  const n = board.nodes[id];
  if (n) board.nodes[id] = { ...n, updatedAt: Date.now() };
};

export function newThought(partial: Partial<Thought> = {}): Thought {
  const now = Date.now();
  return {
    id: uid(),
    text: '',
    note: '',
    parentId: null,
    x: 0,
    y: 0,
    accent: 'none',
    type: null,
    attrs: emptyAttrs(),
    depth: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function emptyBoard(title = 'Field'): Board {
  const now = Date.now();
  return { version: 1, id: uid('board'), title, nodes: {}, links: {}, createdAt: now, updatedAt: now };
}

export function createRoot(board: Board, at: Point): { board: Board; id: ID } {
  const next = clone(board);
  const node = newThought({ x: Math.round(at.x), y: Math.round(at.y), depth: 0, pinned: true });
  next.nodes[node.id] = node;
  return { board: next, id: node.id };
}

export function createChild(board: Board, parentId: ID, text = ''): { board: Board; id: ID } {
  const parent = board.nodes[parentId];
  if (!parent) return { board, id: parentId };
  const next = clone(board);
  const node = newThought({
    text,
    parentId,
    depth: parent.depth + 1,
    x: parent.x,
    y: parent.y + 80,
  });
  next.nodes[node.id] = node;
  placeNewChild(next, parentId, node.id);
  touch(next, parentId);
  return { board: next, id: node.id };
}

export function createSibling(board: Board, siblingId: ID, text = ''): { board: Board; id: ID } {
  const sib = board.nodes[siblingId];
  if (!sib) return { board, id: siblingId };
  if (!sib.parentId) {
    const next = clone(board);
    const node = newThought({ text, x: sib.x + 240, y: sib.y, depth: 0, pinned: true });
    next.nodes[node.id] = node;
    return { board: next, id: node.id };
  }
  const next = clone(board);
  const node = newThought({
    text,
    parentId: sib.parentId,
    depth: sib.depth,
    x: sib.x,
    y: sib.y,
  });
  next.nodes[node.id] = node;
  placeNewSibling(next, siblingId, node.id);
  return { board: next, id: node.id };
}

export function setText(board: Board, id: ID, text: string): Board {
  const n = board.nodes[id];
  if (!n || n.text === text) return board;
  const next = clone(board);
  next.nodes[id] = { ...n, text, updatedAt: Date.now() };
  return next;
}

export function setNote(board: Board, id: ID, note: string): Board {
  const n = board.nodes[id];
  if (!n || n.note === note) return board;
  const next = clone(board);
  next.nodes[id] = { ...n, note, updatedAt: Date.now() };
  return next;
}

export function setAttrs(board: Board, id: ID, attrs: Partial<Attributes>): Board {
  const n = board.nodes[id];
  if (!n) return board;
  const next = clone(board);
  next.nodes[id] = { ...n, attrs: { ...n.attrs, ...attrs }, updatedAt: Date.now() };
  return next;
}

export function setAccent(board: Board, id: ID, accent: Accent, cascade = false): Board {
  const n = board.nodes[id];
  if (!n) return board;
  const next = clone(board);
  const index = buildIndex(board);
  const ids = cascade ? subtree(index, id) : [id];
  for (const nid of ids) {
    next.nodes[nid] = { ...next.nodes[nid], accent, updatedAt: Date.now() };
  }
  return next;
}

export function setType(board: Board, id: ID, type: ThoughtType | null): Board {
  const n = board.nodes[id];
  if (!n) return board;
  const next = clone(board);
  next.nodes[id] = { ...n, type, updatedAt: Date.now() };
  return next;
}

/** Dragging a node carries its subtree only when the user asks for it (Alt). */
export function moveNode(board: Board, id: ID, to: Point, withSubtree = false): Board {
  const n = board.nodes[id];
  if (!n) return board;
  const next = clone(board);
  if (withSubtree) {
    const index = buildIndex(board);
    translateSubtree(next, index, id, to.x - n.x, to.y - n.y);
    next.nodes[id] = { ...next.nodes[id], pinned: true, updatedAt: Date.now() };
  } else {
    next.nodes[id] = { ...n, x: to.x, y: to.y, pinned: true, updatedAt: Date.now() };
  }
  return next;
}

/** Removes a node and everything hanging beneath it, plus any links that touched them. */
export function deleteSubtree(board: Board, id: ID): Board {
  if (!board.nodes[id]) return board;
  const index = buildIndex(board);
  const doomed = new Set(subtree(index, id));
  const next = clone(board);
  for (const nid of doomed) delete next.nodes[nid];
  for (const l of Object.values(next.links)) {
    if (doomed.has(l.source) || doomed.has(l.target)) delete next.links[l.id];
  }
  recomputeDepths(next);
  return next;
}

/** Deletes just this node; its children are adopted by its parent. */
export function deleteNodeKeepingChildren(board: Board, id: ID): Board {
  const n = board.nodes[id];
  if (!n) return board;
  const index = buildIndex(board);
  const next = clone(board);
  for (const kid of index.children.get(id) ?? []) {
    next.nodes[kid] = { ...next.nodes[kid], parentId: n.parentId };
  }
  delete next.nodes[id];
  for (const l of Object.values(next.links)) {
    if (l.source === id || l.target === id) delete next.links[l.id];
  }
  recomputeDepths(next);
  return next;
}

export function reparent(board: Board, id: ID, parentId: ID | null): Board {
  const n = board.nodes[id];
  if (!n || id === parentId) return board;
  if (parentId) {
    const index = buildIndex(board);
    if (descendants(index, id).includes(parentId)) return board; // no loops
  }
  const next = clone(board);
  next.nodes[id] = { ...n, parentId, updatedAt: Date.now() };
  recomputeDepths(next);
  return next;
}

export function linkThoughts(board: Board, source: ID, target: ID, label = ''): { board: Board; id: ID | null } {
  if (source === target || !board.nodes[source] || !board.nodes[target]) return { board, id: null };
  const existing = Object.values(board.links).find(
    (l) =>
      (l.source === source && l.target === target) || (l.source === target && l.target === source),
  );
  if (existing) return { board, id: existing.id };
  const next = clone(board);
  const now = Date.now();
  const link = { id: uid('l'), source, target, label, createdAt: now, updatedAt: now };
  next.links[link.id] = link;
  return { board: next, id: link.id };
}

export function setLinkLabel(board: Board, id: ID, label: string): Board {
  const l = board.links[id];
  if (!l) return board;
  const next = clone(board);
  next.links[id] = { ...l, label, updatedAt: Date.now() };
  return next;
}

export function removeLink(board: Board, id: ID): Board {
  if (!board.links[id]) return board;
  const next = clone(board);
  delete next.links[id];
  return next;
}

export function tidy(board: Board, rootId: ID): Board {
  const placed = tidyBranch(board, rootId);
  if (!placed.size) return board;
  const next = clone(board);
  for (const [id, p] of placed) {
    next.nodes[id] = {
      ...next.nodes[id],
      x: Math.round(p.x),
      y: Math.round(p.y),
      pinned: id === rootId ? next.nodes[id].pinned : false,
      updatedAt: Date.now(),
    };
  }
  return next;
}
