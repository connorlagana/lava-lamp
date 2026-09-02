import { memo, useEffect, useMemo, useRef } from 'react';
import { associationGeometry, type Board, branchGeometry, type GraphIndex, type ID, joinLamp, lavaFor, PAPER, pigmentOf, type Rect, rectsIntersect, waxFor } from '@field/core';

/**
 * Every relationship on the board, drawn once into a single SVG that shares
 * the world transform. A branch is drawn in the wax of the thought it feeds,
 * so a family reads as one colour running down the page; associations stay
 * dotted, and take their colour from where they start. No arrowheads: this is
 * not a diagram.
 *
 * A line ends on the rim of the thought it touches, and the rims of the top
 * two ranks are always moving, so those lines are re-cut from the same clock
 * the bubbles use. Only the handful that touch a moving rim are redrawn; the
 * rest of a map is settled and never costs a frame.
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
    const out: {
      key: string;
      parentId: ID;
      tension: number;
      live: boolean;
      d: string;
      depth: number;
      dim: boolean;
      rgb: string;
    }[] = [];
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
        parentId: node.parentId,
        tension,
        live: waxFor(parent.id, parent.depth).live || waxFor(node.id, node.depth).live,
        d: g.d,
        depth: Math.min(node.depth, 4),
        dim: !!focusSet && !(focusSet.has(node.id) && focusSet.has(node.parentId)),
        rgb: lavaFor(pigmentOf(board, node.id), node.depth).rgb,
      });
    }
    return out;
    // index participates so ordering changes refresh the layer
  }, [board, index, focusSet, draggingId, dragTension, cull]);

  const associations = useMemo(() => {
    const out: {
      id: ID;
      source: ID;
      target: ID;
      live: boolean;
      d: string;
      label: string;
      mid: { x: number; y: number };
      dim: boolean;
      hot: boolean;
      rgb: string;
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
        source: link.source,
        target: link.target,
        live: waxFor(a.id, a.depth).live || waxFor(b.id, b.depth).live,
        d: g.d,
        label: link.id === editingLinkId ? '' : link.label,
        mid: g.mid,
        dim: !!focusSet && !(focusSet.has(link.source) && focusSet.has(link.target)),
        hot: hoverId === link.source || hoverId === link.target,
        rgb: lavaFor(pigmentOf(board, a.id), a.depth).rgb,
      });
    }
    return out;
  }, [board, focusSet, editingLinkId, hoverId, cull]);

  // Re-cut only the lines whose far end is breathing. Held by key rather than
  // by index so a re-order of the layer cannot point a path at its neighbour.
  const lines = useRef(new Map<string, SVGPathElement | null>());
  useEffect(() => {
    const moving = branches.filter((b) => b.live);
    const drifting = associations.filter((a) => a.live);
    if (!moving.length && !drifting.length) return;
    return joinLamp((clock) => {
      for (const b of moving) {
        const g = branchGeometry(board, b.parentId, b.key, b.tension, clock);
        if (g) lines.current.get(`b:${b.key}`)?.setAttribute('d', g.d);
      }
      for (const a of drifting) {
        const g = associationGeometry(board, a.source, a.target, clock);
        if (!g) continue;
        lines.current.get(`a:${a.id}`)?.setAttribute('d', g.d);
        lines.current.get(`h:${a.id}`)?.setAttribute('d', g.d);
      }
    });
  }, [branches, associations, board]);

  return (
    <svg className="edges" aria-hidden overflow="visible">
      <g>
        {branches.map((b) => (
          <path
            key={b.key}
            ref={(el) => void lines.current.set(`b:${b.key}`, el)}
            className="branch"
            data-depth={b.depth}
            data-dim={b.dim || undefined}
            style={{ '--edge': b.rgb } as React.CSSProperties}
            d={b.d}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      <g>
        {associations.map((a) => (
          <g
            key={a.id}
            data-dim={a.dim || undefined}
            className="assoc-group"
            style={{ '--edge': a.rgb } as React.CSSProperties}
          >
            <path
              ref={(el) => void lines.current.set(`h:${a.id}`, el)}
              className="assoc-hit"
              d={a.d}
              vectorEffect="non-scaling-stroke"
              onClick={(e) => onLinkClick(a.id, e)}
            />
            <path
              ref={(el) => void lines.current.set(`a:${a.id}`, el)}
              className="assoc"
              data-hot={a.hot || undefined}
              d={a.d}
              vectorEffect="non-scaling-stroke"
            />
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
