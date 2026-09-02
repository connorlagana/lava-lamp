import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { anchorOn, associationPath, type Camera, clamp, expandRect, type ID, type Point, type Rect, screenToWorld, visibleWorldRect } from '@field/core';

import { useApp, useCamera, type AppApi } from '../store/app';

import { EdgeLayer } from './EdgeLayer';
import { NodeLayer } from './NodeLayer';
import { Pigments } from './Pigments';

/**
 * The surface. Owns every pointer gesture and the world transform, and
 * nothing else. Node and edge layers are memoised so a pan touches exactly one
 * style property.
 */

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; origin: Point; camera: Camera }
  | { kind: 'press'; origin: Point }
  | {
      kind: 'node';
      id: ID;
      origin: Point;
      grab: Point;
      moved: boolean;
      subtree: boolean;
      lastAt: number;
      lastPos: Point;
    }
  | { kind: 'link'; from: ID; cursor: Point };

/**
 * How far past the edge of the screen we keep rendering. A fixed world
 * distance would shrink to nothing when zoomed out, so a pan of a few hundred
 * pixels would re-cull constantly; scaling it to the view keeps the work rare.
 */
const cullMargin = (visible: Rect) => Math.max(320, Math.min(visible.w, visible.h) * 0.4);

export function Canvas() {
  const app = useApp();
  const cam = useCamera();
  const { camera } = cam;
  const viewportRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>({ kind: 'none' });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [cull, setCull] = useState<Rect>({ x: -2000, y: -2000, w: 4000, h: 4000 });
  const [pending, setPending] = useState<{ from: ID; cursor: Point } | null>(null);
  // Capturing the pointer retargets the browser's own dblclick to the
  // viewport, so a node's second tap is recognised here instead.
  const lastTap = useRef<{ id: ID; at: number }>({ id: '', at: 0 });
  const appRef = useRef(app);
  appRef.current = app;

  // ---- viewport measurement ---------------------------------------------
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const apply = () => cam.setViewport({ w: el.clientWidth, h: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- culling ----------------------------------------------------------
  useEffect(() => {
    const visible = visibleWorldRect(camera, cam.viewport);
    const margin = cullMargin(visible);
    const safe = expandRect(visible, margin * 0.35);
    const inside =
      safe.x >= cull.x &&
      safe.y >= cull.y &&
      safe.x + safe.w <= cull.x + cull.w &&
      safe.y + safe.h <= cull.y + cull.h;
    const target = expandRect(visible, margin);
    // Grow when the view escapes the current window, shrink when zooming in
    // has left it several times larger than it needs to be.
    if (!inside || cull.w > target.w * 2.2 || cull.h > target.h * 2.2) setCull(target);
  }, [camera, cam.viewport, cull]);

  const toWorld = useCallback(
    (client: Point): Point => {
      const rect = viewportRef.current?.getBoundingClientRect();
      const x = client.x - (rect?.left ?? 0);
      const y = client.y - (rect?.top ?? 0);
      return screenToWorld(cam.cameraRef.current, { x, y });
    },
    [cam.cameraRef],
  );

  const toLocal = useCallback((client: Point): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { x: client.x - (rect?.left ?? 0), y: client.y - (rect?.top ?? 0) };
  }, []);

  // ---- trackpad ---------------------------------------------------------
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        // pinch, or cmd + scroll
        const factor = Math.exp(-e.deltaY * scale * 0.0125);
        cam.zoomBy(clamp(factor, 0.75, 1.35), toLocal({ x: e.clientX, y: e.clientY }));
      } else {
        cam.setCamera((c) => ({ ...c, x: c.x - e.deltaX * scale, y: c.y - e.deltaY * scale }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [cam, toLocal]);

  // ---- space to pan ------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // ---- gestures ----------------------------------------------------------
  const endGesture = useCallback(() => {
    const g = gesture.current;
    if (g.kind === 'node' && g.moved) {
      appRef.current.setUI({ draggingId: null, dragTension: 0 });
    }
    gesture.current = { kind: 'none' };
  }, []);

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const target = e.target as HTMLElement;
    if (target.closest('.thought') || target.closest('.assoc-hit') || target.closest('.link-label-editor')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const origin = { x: e.clientX, y: e.clientY };
    if (spaceHeld || e.button === 1) {
      gesture.current = { kind: 'pan', origin, camera: cam.cameraRef.current };
    } else {
      gesture.current = { kind: 'press', origin };
    }
  };

  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, id: ID) => {
      if (e.button === 2) return;
      const a = appRef.current;
      if (a.ui.linkingFrom && a.ui.linkingFrom !== id) {
        a.link(a.ui.linkingFrom, id);
        return;
      }
      if (a.ui.editingId === id) return;
      e.stopPropagation();

      const now = performance.now();
      if (lastTap.current.id === id && now - lastTap.current.at < 400) {
        lastTap.current = { id: '', at: 0 };
        gesture.current = { kind: 'none' };
        a.open(id);
        return;
      }
      lastTap.current = { id, at: now };

      (viewportRef.current as HTMLElement).setPointerCapture(e.pointerId);
      a.select(id);
      if (spaceHeld) {
        gesture.current = { kind: 'pan', origin: { x: e.clientX, y: e.clientY }, camera: cam.cameraRef.current };
        return;
      }
      const node = a.board.nodes[id];
      const world = toWorld({ x: e.clientX, y: e.clientY });
      gesture.current = {
        kind: 'node',
        id,
        origin: { x: e.clientX, y: e.clientY },
        grab: { x: world.x - node.x, y: world.y - node.y },
        moved: false,
        subtree: e.altKey,
        lastAt: performance.now(),
        lastPos: { x: node.x, y: node.y },
      };
    },
    [cam.cameraRef, spaceHeld, toWorld],
  );

  const onHandlePointerDown = useCallback((e: React.PointerEvent, id: ID) => {
    (viewportRef.current as HTMLElement).setPointerCapture(e.pointerId);
    const local = toLocal({ x: e.clientX, y: e.clientY });
    gesture.current = { kind: 'link', from: id, cursor: local };
    setPending({ from: id, cursor: local });
    appRef.current.setUI({ selectedId: id, linkingFrom: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toLocal]);

  // Every handler handed to a memoised layer must keep its identity, or a pan
  // would re-render every node on screen.
  const onOpenNote = useCallback((id: ID) => appRef.current.open(id), []);
  const onCommitText = useCallback((id: ID, text: string) => commitText(appRef.current, id, text), []);
  const onLiveText = useCallback((id: ID, text: string) => appRef.current.setText(id, text), []);
  const onAddChild = useCallback((id: ID) => appRef.current.createChild(id), []);
  const onHover = useCallback((id: ID | null) => appRef.current.setUI({ hoverId: id }), []);
  const onLinkClick = useCallback((id: ID, e: React.MouseEvent) => {
    e.stopPropagation();
    appRef.current.setUI({ editingLinkId: id });
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g.kind === 'none') return;
    const dx = e.clientX - ('origin' in g ? g.origin.x : 0);
    const dy = e.clientY - ('origin' in g ? g.origin.y : 0);

    if (g.kind === 'press') {
      if (Math.hypot(dx, dy) > 4) {
        gesture.current = { kind: 'pan', origin: g.origin, camera: cam.cameraRef.current };
      }
      return;
    }
    if (g.kind === 'pan') {
      cam.setCamera({ ...g.camera, x: g.camera.x + dx, y: g.camera.y + dy });
      return;
    }
    if (g.kind === 'link') {
      const cursor = toLocal({ x: e.clientX, y: e.clientY });
      gesture.current = { ...g, cursor };
      setPending({ from: g.from, cursor });
      return;
    }
    if (g.kind === 'node') {
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      const a = appRef.current;
      if (!g.moved) a.setUI({ draggingId: g.id, editingId: null });
      const world = toWorld({ x: e.clientX, y: e.clientY });
      const to = { x: Math.round(world.x - g.grab.x), y: Math.round(world.y - g.grab.y) };
      const now = performance.now();
      const dt = Math.max(16, now - g.lastAt);
      const speed = Math.hypot(to.x - g.lastPos.x, to.y - g.lastPos.y) / dt;
      const tension = clamp(speed * 1.6, 0, 1);
      gesture.current = { ...g, moved: true, lastAt: now, lastPos: to };
      a.moveNode(g.id, to, g.subtree);
      a.setUI({ draggingId: g.id, dragTension: tension });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    const a = appRef.current;

    if (g.kind === 'press') {
      const moved = Math.hypot(e.clientX - g.origin.x, e.clientY - g.origin.y) > 4;
      if (!moved) {
        if (a.ui.linkingFrom) a.setUI({ linkingFrom: null });
        else if (a.ui.editingLinkId) a.setUI({ editingLinkId: null });
        else if (a.ui.selectedId || a.ui.editingId) a.setUI({ selectedId: null, editingId: null });
        else a.createRootAt(toWorld({ x: e.clientX, y: e.clientY }));
      }
    }

    if (g.kind === 'link') {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const targetEl = el?.closest('.thought') as HTMLElement | null;
      const targetId = targetEl?.dataset.id;
      setPending(null);
      if (targetId && targetId !== g.from) a.link(g.from, targetId);
      else a.setUI({ linkingFrom: null });
    }

    endGesture();
  };

  // ---- link label editing -------------------------------------------------
  const editingLink = app.ui.editingLinkId ? app.board.links[app.ui.editingLinkId] : null;
  const labelAnchor = (() => {
    if (!editingLink) return null;
    const a = app.board.nodes[editingLink.source];
    const b = app.board.nodes[editingLink.target];
    if (!a || !b) return null;
    const from = anchorOn(a, b);
    const to = anchorOn(b, a);
    const mid = {
      x: (from.x + to.x) / 2 - (to.y - from.y) * 0.065,
      y: (from.y + to.y) / 2 + (to.x - from.x) * 0.065,
    };
    return mid;
  })();

  const pendingPath = (() => {
    if (!pending) return null;
    const node = app.board.nodes[pending.from];
    if (!node) return null;
    const world = screenToWorld(camera, pending.cursor);
    return associationPath(anchorOn(node, world), world, 0.06);
  })();

  const dimmed = app.focusSet;
  const hoverWithLinks = app.ui.hoverId && app.index.linked.has(app.ui.hoverId) ? app.ui.hoverId : null;
  const worldStyle = {
    transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.z})`,
  } as React.CSSProperties;

  return (
    <div
      ref={viewportRef}
      className="viewport"
      data-space={spaceHeld || undefined}
      data-linking={app.ui.linkingFrom ? true : undefined}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={endGesture}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Pigments />

      <div className="ambient" aria-hidden>
        <i className="wash w1" />
        <i className="wash w2" />
        <i className="wash w3" />
        <i className="wash w4" />
        <i className="wash w5" />
        <i className="wash w6" />
      </div>

      <div className="world" style={worldStyle}>
        <EdgeLayer
          board={app.board}
          index={app.index}
          focusSet={dimmed}
          draggingId={app.ui.draggingId}
          dragTension={app.ui.dragTension}
          editingLinkId={app.ui.editingLinkId}
          hoverId={hoverWithLinks}
          cull={cull}
          onLinkClick={onLinkClick}
        />

        {pendingPath && (
          <svg className="edges pending" aria-hidden overflow="visible">
            <path className="assoc" d={pendingPath} vectorEffect="non-scaling-stroke" />
          </svg>
        )}

        <NodeLayer
          board={app.board}
          selectedId={app.ui.selectedId}
          editingId={app.ui.editingId}
          linkingFrom={app.ui.linkingFrom}
          focusSet={dimmed}
          cull={cull}
          onPointerDown={onNodePointerDown}
          onDoubleClick={onOpenNote}
          onCommitText={onCommitText}
          onLiveText={onLiveText}
          onAddChild={onAddChild}
          onHandleDown={onHandlePointerDown}
          onHover={onHover}
        />

        {editingLink && labelAnchor && (
          <div
            className="link-label-editor"
            style={{
              transform: `translate(${labelAnchor.x}px, ${labelAnchor.y}px) scale(${1 / camera.z}) translate(-50%, -50%)`,
            }}
          >
            <input
              autoFocus
              defaultValue={editingLink.label}
              placeholder="requires, enables, competes with"
              spellCheck={false}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') {
                  app.setLinkLabel(editingLink.id, (e.target as HTMLInputElement).value.trim());
                  app.setUI({ editingLinkId: null });
                }
              }}
              onBlur={(e) => {
                app.setLinkLabel(editingLink.id, e.target.value.trim());
                app.setUI({ editingLinkId: null });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Empty text is not a thought: a blank leaf removes itself on commit. */
function commitText(app: AppApi, id: ID, text: string) {
  const node = app.board.nodes[id];
  const trimmed = text.trim();
  if (!node) return;
  if (!trimmed && !node.note.trim() && !app.index.children.get(id)?.length) {
    app.deleteThought(id);
    return;
  }
  app.setText(id, trimmed);
  app.setUI({ editingId: null, selectedId: id });
}
