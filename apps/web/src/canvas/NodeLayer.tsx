import { memo, useMemo } from 'react';
import { type Board, boxOf, type ID, pigmentOf, type Rect, rectsIntersect } from '@field/core';

import { NodeView } from './NodeView';

export interface NodeLayerProps {
  board: Board;
  selectedId: ID | null;
  editingId: ID | null;
  linkingFrom: ID | null;
  focusSet: Set<ID> | null;
  cull: Rect;
  onPointerDown: (e: React.PointerEvent, id: ID) => void;
  onDoubleClick: (id: ID) => void;
  onCommitText: (id: ID, text: string) => void;
  onLiveText: (id: ID, text: string) => void;
  onAddChild: (id: ID) => void;
  onHandleDown: (e: React.PointerEvent, id: ID) => void;
  onHover: (id: ID | null) => void;
}

function NodeLayerImpl(props: NodeLayerProps) {
  const { board, selectedId, editingId, linkingFrom, focusSet, cull } = props;

  // Only what is on screen gets a DOM node; the map can hold thousands.
  const visible = useMemo(
    () =>
      Object.values(board.nodes).filter(
        (n) => n.id === editingId || n.id === selectedId || rectsIntersect(boxOf(n), cull),
      ),
    [board, cull, editingId, selectedId],
  );

  return (
    <div className="nodes">
      {visible.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          pigment={pigmentOf(board, node.id)}
          selected={node.id === selectedId}
          editing={node.id === editingId}
          dim={!!focusSet && !focusSet.has(node.id)}
          linkTarget={!!linkingFrom && linkingFrom !== node.id}
          onPointerDown={props.onPointerDown}
          onDoubleClick={props.onDoubleClick}
          onCommitText={props.onCommitText}
          onLiveText={props.onLiveText}
          onAddChild={props.onAddChild}
          onHandleDown={props.onHandleDown}
          onHover={props.onHover}
        />
      ))}
    </div>
  );
}

export const NodeLayer = memo(NodeLayerImpl);
