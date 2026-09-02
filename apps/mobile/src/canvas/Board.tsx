import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Group,
  Path,
  Picture,
  Skia,
  type SkPicture,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ACCENT_RGB,
  MAX_ZOOM,
  MIN_ZOOM,
  anchorOn,
  associationPath,
  boxOf,
  clamp,
  expandRect,
  lampClock,
  lavaFor,
  pigmentOf,
  screenToWorld,
  visibleWorldRect,
  type ID,
  type Point,
  type Rect,
} from '@field/core';
import { useApp, useCamera } from '../store/app';
import { anyLive, gatherEdges, paintLive, paintStill, visibleNodes, type PaintState } from './paint';
import { Lamp } from './Lamp';

/**
 * The surface.
 *
 * Two things are true at once here and the whole file is arranged around them.
 * Panning must never touch React — it is a transform on a Skia group, driven
 * by a shared value on the UI thread, so a finger dragging the board costs
 * nothing but a matrix. And the board itself must be re-recorded when it
 * changes, which is JavaScript work, so it is kept off the pan path entirely.
 *
 * What is left is a small amount of bookkeeping to move the camera's position
 * back across to React occasionally — for culling, and so the rest of the app
 * knows where it is looking.
 */

/**
 * How far past the edge of the screen we keep drawing.
 *
 * This is a correctness bound, not a tuning knob, and the reason is the trade
 * the rest of this file is built on: the camera never touches React while a
 * finger is down, so the cull cannot follow a pan — it is recomputed once, when
 * the gesture ends. Everything the finger reaches before then has to have been
 * recorded already, or the leading edge of the pan runs onto paper that was
 * never drawn and the thoughts there simply are not on it.
 *
 * So the margin has to cover whatever one gesture can travel. A finger cannot
 * travel further than the screen in a single stroke and there is no inertia to
 * carry it on afterwards, and one screen of *screen* pixels is exactly one
 * `visible` of *world* units at any zoom — so the long side of the visible rect
 * is both necessary and sufficient. It also leaves room for a pinch to roughly
 * double the visible rect before that, too, outruns the recording.
 *
 * It records a good deal more than it used to. The re-recordings get rarer in
 * the same proportion — a wider window is crossed less often — so what this
 * really costs is the size of one recording, which is the right thing to spend
 * to never show someone a blank half of their map.
 */
const cullMargin = (visible: Rect) => Math.max(visible.w, visible.h);

/** 30fps, the rate the web app's lamp runs at. */
const FRAME = 1000 / 30;

/** How long a finger must rest on a thought before it picks it up. */
const HOLD_MS = 240;

export function Board({
  onTapNode,
  onTapEmpty,
  onTapLink,
}: {
  onTapNode: (id: ID) => void;
  onTapEmpty: (at: Point) => void;
  onTapLink: (id: ID) => void;
}) {
  const app = useApp();
  const cam = useCamera();
  const { camera } = cam;

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cull, setCull] = useState<Rect>({ x: -2000, y: -2000, w: 4000, h: 4000 });
  const [clock, setClock] = useState(() => lampClock());
  /** where the finger is while a connection is being drawn out of a thought */
  const [reaching, setReaching] = useState<Point | null>(null);

  // The camera, mirrored onto the UI thread. React owns the authoritative copy
  // in the store; these three drive the transform between renders.
  const tx = useSharedValue(camera.x);
  const ty = useSharedValue(camera.y);
  const tz = useSharedValue(camera.z);

  /**
   * What a moving finger currently means, in a form a worklet can read.
   *
   * The pan runs on the UI thread and cannot ask a JS ref whether a thought is
   * being held, so the two states that change its meaning are mirrored into
   * shared values. Everything else about the drag stays on the JS thread,
   * where the board is.
   */
  const grabbed = useSharedValue(false);
  const linking = useSharedValue(false);
  /**
   * The selected thought's box, in world coordinates. The pan worklet needs to
   * know the instant a finger lands whether it landed on that thought, and it
   * cannot reach the board to ask, so the one box that matters is mirrored
   * across. A zero width means nothing is selected.
   */
  const selBox = useSharedValue<Rect>({ x: 0, y: 0, w: 0, h: 0 });

  const appRef = useRef(app);
  appRef.current = app;
  /**
   * The thought a drag picked up, where it was grabbed within it, and whether
   * it is properly in hand yet — see `arm`.
   */
  const held = useRef<{ id: ID; grab: Point; from: Point; armed: boolean } | null>(null);

  useEffect(() => {
    linking.value = app.ui.linkingFrom !== null;
  }, [app.ui.linkingFrom, linking]);

  const selected = app.ui.selectedId ? app.board.nodes[app.ui.selectedId] : null;
  useEffect(() => {
    selBox.value = selected ? boxOf(selected) : { x: 0, y: 0, w: 0, h: 0 };
  }, [selected, selBox]);

  // A camera moved by anything other than a finger — fit, undo, a jump from
  // search — has to be pushed back out to the UI thread.
  useEffect(() => {
    tx.value = camera.x;
    ty.value = camera.y;
    tz.value = camera.z;
  }, [camera.x, camera.y, camera.z, tx, ty, tz]);

  useEffect(() => {
    if (size.w && size.h) cam.setViewport(size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  // ---- culling -----------------------------------------------------------
  useEffect(() => {
    if (!size.w) return;
    const visible = visibleWorldRect(camera, size);
    const margin = cullMargin(visible);
    const safe = expandRect(visible, margin * 0.35);
    const inside =
      safe.x >= cull.x &&
      safe.y >= cull.y &&
      safe.x + safe.w <= cull.x + cull.w &&
      safe.y + safe.h <= cull.y + cull.h;
    const target = expandRect(visible, margin);
    if (!inside || cull.w > target.w * 2.2 || cull.h > target.h * 2.2) setCull(target);
  }, [camera, size, cull]);

  // ---- what is on screen -------------------------------------------------
  const state: PaintState = useMemo(
    () => ({
      board: app.board,
      index: app.index,
      cull,
      zoom: camera.z,
      selectedId: app.ui.selectedId,
      editingId: app.ui.editingId,
      linkingFrom: app.ui.linkingFrom,
      draggingId: app.ui.draggingId,
      dragTension: app.ui.dragTension,
      editingLinkId: app.ui.editingLinkId,
      focusSet: app.focusSet,
      clock,
    }),
    // `clock` deliberately absent: the still pass does not use it, and
    // rebuilding this thirty times a second is exactly what we are avoiding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      app.board, app.index, cull, camera.z, app.ui.selectedId, app.ui.editingId,
      app.ui.linkingFrom, app.ui.draggingId, app.ui.dragTension, app.ui.editingLinkId,
      app.focusSet,
    ],
  );

  const nodes = useMemo(() => visibleNodes(state), [state]);
  // Which edges belong to which pass, worked out once per change of board
  // rather than once per frame.
  const stillEdges = useMemo(() => gatherEdges(state, false), [state]);
  const liveEdges = useMemo(() => gatherEdges(state, true), [state]);

  // ---- the two recordings -------------------------------------------------
  const still: SkPicture = useMemo(() => {
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording();
    paintStill(canvas, state, nodes, stillEdges);
    return rec.finishRecordingAsPicture();
  }, [state, nodes, stillEdges]);

  const [live, setLive] = useState<SkPicture | null>(null);

  useEffect(() => {
    if (!anyLive(nodes, liveEdges)) {
      setLive(null);
      return;
    }
    let frame: number;
    let last = 0;
    const pulse = (now: number) => {
      frame = requestAnimationFrame(pulse);
      if (now - last < FRAME) return;
      last = now;
      const rec = Skia.PictureRecorder();
      const canvas = rec.beginRecording();
      paintLive(canvas, { ...state, clock: now / 1000 }, nodes, liveEdges);
      setLive(rec.finishRecordingAsPicture());
    };
    frame = requestAnimationFrame(pulse);
    return () => cancelAnimationFrame(frame);
  }, [state, nodes, liveEdges]);

  // The still pass needs *a* clock for the rims that do not move, so that a
  // node scrolling into view arrives at the shape it would have had.
  useEffect(() => setClock(lampClock()), [cull]);

  // ---- hit testing --------------------------------------------------------
  const worldAt = useCallback(
    (screen: Point): Point => screenToWorld({ x: tx.value, y: ty.value, z: tz.value }, screen),
    [tx, ty, tz],
  );

  const hitAt = useCallback((world: Point): ID | null => {
    const a = appRef.current;
    let found: ID | null = null;
    // Front to back: the last thing drawn is the thing on top.
    for (const node of Object.values(a.board.nodes)) {
      const b = boxOf(node);
      if (world.x >= b.x && world.x <= b.x + b.w && world.y >= b.y && world.y <= b.y + b.h) {
        found = node.id;
      }
    }
    return found;
  }, []);

  const hit = useCallback((screen: Point): ID | null => hitAt(worldAt(screen)), [hitAt, worldAt]);

  /** An association within reach of the finger, for labelling it. */
  const hitLink = useCallback(
    (screen: Point): ID | null => {
      const a = appRef.current;
      const world = worldAt(screen);
      // 16px of slack on screen, as the web's invisible fat stroke gives.
      const slack = 16 / tz.value;
      for (const link of Object.values(a.board.links)) {
        const from = a.board.nodes[link.source];
        const to = a.board.nodes[link.target];
        if (!from || !to) continue;
        const p = anchorOn(from, to);
        const q = anchorOn(to, from);
        if (distanceToSegment(world, p, q) <= slack) return link.id;
      }
      return null;
    },
    [worldAt, tz],
  );

  // ---- gestures ----------------------------------------------------------
  const commitCamera = useCallback(
    (x: number, y: number, z: number) => cam.setCamera({ x, y, z }),
    [cam],
  );

  /**
   * The moment a thought is really in hand: the board draws it as dragging and
   * the phone says so. Held back until the drag is certain, so a finger that
   * only meant to tap the selected thought leaves no trace behind it.
   */
  const arm = useCallback((h: { id: ID; armed: boolean }) => {
    if (h.armed) return;
    h.armed = true;
    appRef.current.setUI({ draggingId: h.id, editingId: null });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  /**
   * The selected thought is the one you can simply pick up.
   *
   * The desktop app drags on mousedown, because a mouse can hover and a press
   * is unambiguous. A finger cannot: the same touch that would start a drag is
   * the one that would have panned the board. Selecting first settles it — the
   * ringed thought answers to a finger exactly as it does on the web, and every
   * other touch still belongs to the board.
   *
   * The camera comes in from the worklet rather than being read here. The pan
   * may already be under way by the time this runs, and the grab has to be
   * measured from where the finger first landed.
   */
  const tryGrab = useCallback(
    (x: number, y: number, cx: number, cy: number, cz: number) => {
      const a = appRef.current;
      const id = a.ui.selectedId;
      const node = id ? a.board.nodes[id] : null;
      const world = screenToWorld({ x: cx, y: cy, z: cz }, { x, y });
      // Something is drawn over it here, or the selection has moved on since
      // the box was mirrored across: give the finger back to the board.
      if (!id || !node || a.ui.linkingFrom || hitAt(world) !== id) {
        grabbed.value = false;
        return;
      }
      held.current = {
        id,
        grab: { x: world.x - node.x, y: world.y - node.y },
        from: { x: node.x, y: node.y },
        armed: false,
      };
    },
    [hitAt, grabbed],
  );

  /**
   * A finger that rests on any thought picks it up too.
   *
   * What the selection does for the ringed thought, stillness does for all the
   * rest: a moment of not moving means this one, not the board. It is the
   * ordinary bargain on a touchscreen and needs no explaining to anyone.
   */
  const beginHold = useCallback(
    (x: number, y: number) => {
      const a = appRef.current;
      // A connection being drawn is its own gesture; do not also move things.
      if (a.ui.linkingFrom) return;
      // Already in hand: the finger landed on the selected thought and took it
      // there and then. The stillness only confirms the pickup.
      if (held.current) {
        arm(held.current);
        return;
      }
      const id = hit({ x, y });
      if (!id) return;
      const node = a.board.nodes[id];
      if (!node) return;
      const world = worldAt({ x, y });
      held.current = {
        id,
        grab: { x: world.x - node.x, y: world.y - node.y },
        from: { x: node.x, y: node.y },
        armed: false,
      };
      a.select(id);
      arm(held.current);
      grabbed.value = true;
    },
    [hit, worldAt, grabbed, arm],
  );

  const moveHeld = useCallback(
    (x: number, y: number) => {
      const h = held.current;
      if (!h) return;
      const a = appRef.current;
      arm(h);
      const world = worldAt({ x, y });
      const to = { x: Math.round(world.x - h.grab.x), y: Math.round(world.y - h.grab.y) };
      // How hard it is being thrown about, which is what bows its branches.
      const speed = Math.hypot(to.x - h.from.x, to.y - h.from.y) / 16;
      held.current = { ...h, from: to };
      // Alone, always. The desktop brings the whole branch when Alt is down,
      // and there is no second modifier here that is not a hidden mode — so a
      // dragged thought moves by itself and `Tidy branch` puts a family back
      // in order, which is the thing Alt-dragging was mostly used to avoid.
      a.moveNode(h.id, to, false);
      a.setUI({ draggingId: h.id, dragTension: clamp(speed * 1.6, 0, 1) });
    },
    [worldAt, arm],
  );

  const endHold = useCallback(() => {
    grabbed.value = false;
    const h = held.current;
    if (!h) return;
    held.current = null;
    // A finger that landed on the selected thought and lifted again without
    // moving it never picked it up, and so has nothing to put down.
    if (h.armed) appRef.current.setUI({ draggingId: null, dragTension: 0 });
  }, [grabbed]);

  /** Where a connection being drawn currently reaches. */
  const reachTo = useCallback(
    (x: number, y: number) => {
      if (!appRef.current.ui.linkingFrom) return;
      setReaching(worldAt({ x, y }));
    },
    [worldAt],
  );

  const dropReach = useCallback(
    (x: number, y: number) => {
      const a = appRef.current;
      const from = a.ui.linkingFrom;
      setReaching(null);
      if (!from) return;
      const target = hit({ x, y });
      if (target && target !== from) a.link(from, target);
      else a.setUI({ linkingFrom: null });
    },
    [hit],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .averageTouches(true)
        // Far enough that a finger settling in place is a hold rather than a
        // very short pan, so the two gestures do not both get a say.
        .minDistance(12)
        .onBegin((e) => {
          'worklet';
          // Whether this touch belongs to the selected thought is settled here,
          // on the UI thread, and not after a hop to JavaScript: a quick flick
          // clears the pan's threshold within a frame or two, and the board must
          // never move first and hand the thought over afterwards.
          if (linking.value) return;
          const b = selBox.value;
          if (b.w <= 0) return;
          const wx = (e.x - tx.value) / tz.value;
          const wy = (e.y - ty.value) / tz.value;
          if (wx < b.x || wx > b.x + b.w || wy < b.y || wy > b.y + b.h) return;
          grabbed.value = true;
          runOnJS(tryGrab)(e.x, e.y, tx.value, ty.value, tz.value);
        })
        .onChange((e) => {
          'worklet';
          // A held thought or a connection being drawn takes the finger; the
          // board only moves when neither of them wants it.
          if (grabbed.value || linking.value) return;
          tx.value += e.changeX;
          ty.value += e.changeY;
        })
        .onUpdate((e) => {
          'worklet';
          if (grabbed.value || linking.value) runOnJS(routeMove)(e.x, e.y);
        })
        .onEnd((e) => {
          'worklet';
          runOnJS(routeEnd)(e.x, e.y, tx.value, ty.value, tz.value);
        })
        .onFinalize(() => {
          'worklet';
          // Every ending, including the ones that never became a drag at all:
          // a tap the board lost, a cancelled touch, a hold that let go without
          // moving. Nothing may be left in hand.
          runOnJS(endHold)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tx, ty, tz, grabbed, linking, selBox],
  );

  function routeMove(x: number, y: number) {
    if (appRef.current.ui.linkingFrom) reachTo(x, y);
    else if (held.current) moveHeld(x, y);
  }

  function routeEnd(x: number, y: number, cx: number, cy: number, cz: number) {
    if (appRef.current.ui.linkingFrom) dropReach(x, y);
    // The camera only moved if nothing was in hand; whatever was, `onFinalize`
    // puts down a moment later.
    else if (!held.current) commitCamera(cx, cy, cz);
  }

  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(HOLD_MS)
        .onStart((e) => {
          'worklet';
          runOnJS(beginHold)(e.x, e.y);
        }),
    [beginHold],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          // Two fingers on a board mean the board, everywhere. If one of them
          // happened to be holding a thought, it puts it down where it stands.
          if (!grabbed.value) return;
          grabbed.value = false;
          runOnJS(endHold)();
        })
        .onChange((e) => {
          'worklet';
          const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, tz.value * e.scaleChange));
          const k = z / tz.value;
          // Keep the point between the fingers pinned to the same thought.
          tx.value = e.focalX - (e.focalX - tx.value) * k;
          ty.value = e.focalY - (e.focalY - ty.value) * k;
          tz.value = z;
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitCamera)(tx.value, ty.value, tz.value);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitCamera, tx, ty, tz, grabbed],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(260)
        .onEnd((e) => {
          'worklet';
          runOnJS(handleTap)(e.x, e.y);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function handleTap(x: number, y: number) {
    const id = hit({ x, y });
    if (id) {
      onTapNode(id);
      return;
    }
    // Nothing under the finger, but perhaps a line near it.
    const link = hitLink({ x, y });
    if (link) {
      onTapLink(link);
      return;
    }
    onTapEmpty(worldAt({ x, y }));
  }

  const gesture = useMemo(
    () => Gesture.Simultaneous(Gesture.Race(tap, Gesture.Simultaneous(hold, pan)), pinch),
    [tap, hold, pan, pinch],
  );

  /**
   * The camera, as one derived value.
   *
   * Not `[{ translateX: tx }, ...]` with the shared values themselves in it —
   * Skia reads the transform on the UI thread and wants plain numbers by the
   * time it gets there, so the array has to be *derived* rather than merely
   * to contain things that vary. Handing it the shared values instead throws
   * "Value is an object, expected a number" from saveCTM, on commit, well away
   * from here.
   */
  const transform = useDerivedValue(() => [
    { translateX: tx.value },
    { translateY: ty.value },
    { scale: tz.value },
  ]);

  // ---- the line being drawn out of a thought ------------------------------
  const reachPath = useMemo(() => {
    const from = app.ui.linkingFrom ? app.board.nodes[app.ui.linkingFrom] : null;
    if (!from || !reaching) return null;
    return Skia.Path.MakeFromSVGString(
      associationPath(anchorOn(from, reaching), reaching, 0.06),
    );
  }, [app.ui.linkingFrom, app.board, reaching]);

  const reachColour = useMemo(() => {
    const id = app.ui.linkingFrom;
    if (!id || !app.board.nodes[id]) return `rgb(${ACCENT_RGB.none})`;
    const node = app.board.nodes[id];
    return `rgb(${lavaFor(pigmentOf(app.board, id), node.depth).rgb})`;
  }, [app.ui.linkingFrom, app.board]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize({ w: width, h: height });
        }}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          {/* The lamp is behind everything and does not move with the camera:
              it is the paper the map is drawn on, not part of the map. */}
          <Lamp width={size.w} height={size.h} />

          <Group transform={transform}>
            <Picture picture={still} />
            {live && <Picture picture={live} />}
            {reachPath && (
              <Path
                path={reachPath}
                style="stroke"
                strokeWidth={1.9 / camera.z}
                strokeCap="round"
                color={reachColour}
                opacity={0.55}
              />
            )}
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

/** Distance from a point to a line segment, for putting a finger on a line. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = vx * vx + vy * vy;
  if (!len) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

export { clamp };
