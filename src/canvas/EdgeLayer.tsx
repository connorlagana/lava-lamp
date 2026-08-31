import { memo, useMemo } from 'react';
import type { Board, ID, Rect } from '../model/types';
import type { GraphIndex } from '../model/graph';
import { associationGeometry, branchGeometry, rectsIntersect } from './geometry';
import { PAPER } from './palette';

/**
 * Every relationship on the board, drawn once into a single SVG that shares
 * the world transform. Branches are solid and quiet; associations are dotted
 * and quieter still. No arrowheads: this is not a diagram.
 */

export interface EdgeLayerProps {
  board: Board;
  index: GraphIndex;
  focusSet: Set<ID> | null;
  draggingId: ID | null;
  dragTension: number;
  editingLinkId: ID | null;
  hoverId: ID | null;
  cull: Rect;
  onLinkClick: (id: ID, e: React.MouseEvent) => void;
}

const boundsOf = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
});

function EdgeLayerImpl({
  board,
  index,
  focusSet,
  draggingId,
  dragTension,
  editingLinkId,
  hoverId,
  cull,
  onLinkClick,
}: EdgeLayerProps) {
  const branches = useMemo(() => {
    const out: { key: string; d: string; depth: number; dim: boolean }[] = [];
    for (const node of Object.values(board.nodes)) {
      if (!node.parentId || !board.nodes[node.parentId]) continue;
      const parent = board.nodes[node.parentId];
      // cheap reject on centres before measuring anchors
      if (!rectsIntersect(boundsOf(parent, node), cull)) continue;
      const tension = draggingId === node.id || draggingId === node.parentId ? dragTension : 0;
      const g = branchGeometry(board, node.parentId, node.id, tension);
      if (!g) continue;
      out.push({
        key: node.id,
        d: g.d,
        depth: Math.min(node.depth, 4),
        dim: !!focusSet && !(focusSet.has(node.id) && focusSet.has(node.parentId)),
      });
    }
    return out;
    // index participates so ordering changes refresh the layer
  }, [board, index, focusSet, draggingId, dragTension, cull]);

  const associations = useMemo(() => {
    const out: {
      id: ID;
      d: string;
      label: string;
      mid: { x: number; y: number };
      dim: boolean;
      hot: boolean;
    }[] = [];
    for (const link of Object.values(board.links)) {
      const a = board.nodes[link.source];
      const b = board.nodes[link.target];
      if (!a || !b) continue;
      if (!rectsIntersect(boundsOf(a, b), cull)) continue;
      const g = associationGeometry(board, link.source, link.target);
      if (!g) continue;
      out.push({
        id: link.id,
        d: g.d,
        label: link.id === editingLinkId ? '' : link.label,
        mid: g.mid,
        dim: !!focusSet && !(focusSet.has(link.source) && focusSet.has(link.target)),
        hot: hoverId === link.source || hoverId === link.target,
      });
    }
    return out;
  }, [board, focusSet, editingLinkId, hoverId, cull]);

  return (
    <svg className="edges" aria-hidden overflow="visible">
      <g>
        {branches.map((b) => (
          <path
            key={b.key}
            className="branch"
            data-depth={b.depth}
            data-dim={b.dim || undefined}
            d={b.d}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      <g>
        {associations.map((a) => (
          <g key={a.id} data-dim={a.dim || undefined} className="assoc-group">
            <path className="assoc-hit" d={a.d} vectorEffect="non-scaling-stroke" onClick={(e) => onLinkClick(a.id, e)} />
            <path className="assoc" data-hot={a.hot || undefined} d={a.d} vectorEffect="non-scaling-stroke" />
            {a.label && (
              <text
                className="assoc-label"
                x={a.mid.x}
                y={a.mid.y}
                textAnchor="middle"
                dominantBaseline="middle"
                stroke={PAPER}
                strokeWidth={5}
                paintOrder="stroke"
                onClick={(e) => onLinkClick(a.id, e)}
              >
                {a.label}
              </text>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}

export const EdgeLayer = memo(EdgeLayerImpl);
