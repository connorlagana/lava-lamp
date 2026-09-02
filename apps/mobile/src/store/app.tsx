import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { type Accent, type Attributes, type Board, boardBounds, boundsOfNodes, buildIndex, type Camera, centerOn, clamp, descendants, fitRect, type GraphIndex, type ID, interpolateCamera, linkedTo, MAX_ZOOM, MIN_ZOOM, type Point, type ThoughtType } from '@field/core';

import * as C from '@field/core';
import { AppState, Dimensions } from 'react-native';
import { loadBoard, loadCamera, makeBoardSaver, saveCamera } from '../persist/db';

import { loadFonts } from '../fonts';

/**
 * One provider owns the board, the history, the transient UI state and the
 * camera. Camera lives in its own context so that panning never re-renders the
 * node tree.
 */

export interface UIState {
  selectedId: ID | null;
  editingId: ID | null;
  openId: ID | null;
  focusId: ID | null;
  linkingFrom: ID | null;
  editingLinkId: ID | null;
  paletteOpen: boolean;
  paletteSeed: string;
  draggingId: ID | null;
  dragTension: number;
  confirmDeleteId: ID | null;
  toast: string | null;
}

const initialUI: UIState = {
  selectedId: null,
  editingId: null,
  openId: null,
  focusId: null,
  linkingFrom: null,
  editingLinkId: null,
  paletteOpen: false,
  paletteSeed: '',
  draggingId: null,
  dragTension: 0,
  confirmDeleteId: null,
  toast: null,
};

export interface CommitOptions {
  /** Merge with the previous commit sharing this key (typing, dragging). */
  coalesce?: string;
  /** Do not record an undo step at all. */
  silent?: boolean;
}

export interface AppApi {
  board: Board;
  index: GraphIndex;
  ui: UIState;
  /** ids visible in focus mode, or null when the whole map is showing */
  focusSet: Set<ID> | null;
  ready: boolean;
  savedAt: number;

  setUI: (patch: Partial<UIState>) => void;
  toast: (message: string) => void;

  commit: (next: Board, opts?: CommitOptions) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  createRootAt: (at: Point) => ID;
  createChild: (parentId: ID) => ID | null;
  createSibling: (id: ID) => ID | null;
  setText: (id: ID, text: string) => void;
  setNote: (id: ID, note: string) => void;
  setAttrs: (id: ID, attrs: Partial<Attributes>) => void;
  setAccent: (id: ID, accent: Accent, cascade?: boolean) => void;
  setType: (id: ID, type: ThoughtType | null) => void;
  moveNode: (id: ID, to: Point, withSubtree: boolean) => void;
  deleteThought: (id: ID) => void;
  link: (a: ID, b: ID) => void;
  setLinkLabel: (id: ID, label: string) => void;
  removeLink: (id: ID) => void;
  tidy: (id: ID) => void;
  replaceBoard: (board: Board, message?: string) => void;

  select: (id: ID | null) => void;
  edit: (id: ID | null) => void;
  open: (id: ID | null) => void;
  focus: (id: ID | null) => void;
}

export interface CameraApi {
  camera: Camera;
  viewport: { w: number; h: number };
  setViewport: (v: { w: number; h: number }) => void;
  setCamera: (c: Camera | ((prev: Camera) => Camera)) => void;
  animateTo: (target: Camera, ms?: number) => void;
  zoomBy: (factor: number, at?: Point) => void;
  fitAll: () => void;
  fitNodes: (ids: ID[], maxZoom?: number) => void;
  centerNode: (id: ID, zoom?: number) => void;
  cameraRef: React.MutableRefObject<Camera>;
}

const AppContext = createContext<AppApi | null>(null);
const CameraContext = createContext<CameraApi | null>(null);

export const useApp = () => {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp outside provider');
  return v;
};
export const useCamera = () => {
  const v = useContext(CameraContext);
  if (!v) throw new Error('useCamera outside provider');
  return v;
};

/** Where the map sits when you open it for the very first time. */
function openingShot(board: Board, viewport: { w: number; h: number }): Camera {
  const nodes = Object.values(board.nodes);
  if (!nodes.length) return { x: viewport.w / 2, y: viewport.h / 2, z: 1 };
  const bounds = boardBounds(board);
  const top = nodes.reduce((a, b) => (a.y <= b.y ? a : b));
  const z = clamp(Math.min(1, (viewport.w - 200) / Math.max(bounds.w * 0.76, 1)), 0.55, 1);
  return {
    z,
    x: viewport.w / 2 - top.x * z,
    y: viewport.h * 0.22 - top.y * z,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [board, setBoardState] = useState<Board>(() => C.emptyBoard());
  const [ui, setUIState] = useState<UIState>(initialUI);
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [historyTick, setHistoryTick] = useState(0);

  const boardRef = useRef(board);
  const past = useRef<Board[]>([]);
  const future = useRef<Board[]>([]);
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const saver = useMemo(() => makeBoardSaver(() => setSavedAt(Date.now())), []);

  const applyBoard = useCallback(
    (next: Board) => {
      boardRef.current = next;
      setBoardState(next);
      saver.schedule(next);
    },
    [saver],
  );

  const commit = useCallback(
    (next: Board, opts?: CommitOptions) => {
      const prev = boardRef.current;
      if (next === prev) return;
      if (!opts?.silent) {
        const now = Date.now();
        const key = opts?.coalesce;
        const merge = !!key && lastCoalesce.current?.key === key && now - lastCoalesce.current.at < 1200;
        if (!merge) {
          past.current.push(prev);
          if (past.current.length > 150) past.current.shift();
        }
        lastCoalesce.current = key ? { key, at: now } : null;
        future.current = [];
        setHistoryTick((t) => t + 1);
      }
      applyBoard(next);
    },
    [applyBoard],
  );

  const setUI = useCallback((patch: Partial<UIState>) => setUIState((prev) => ({ ...prev, ...patch })), []);

  const toast = useCallback((message: string) => {
    setUIState((prev) => ({ ...prev, toast: message }));
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setUIState((prev) => ({ ...prev, toast: null })),
      2600,
    );
  }, []);

  // ---- camera ------------------------------------------------------------
  const [camera, setCameraState] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const cameraRef = useRef(camera);
  const [viewport, setViewportState] = useState(() => {
    const w = Dimensions.get('window');
    return { w: w.width, h: w.height };
  });
  const viewportRef = useRef(viewport);
  const animation = useRef<number | undefined>(undefined);

  const cameraSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setCamera = useCallback((c: Camera | ((prev: Camera) => Camera)) => {
    const next = typeof c === 'function' ? c(cameraRef.current) : c;
    const clamped: Camera = { ...next, z: clamp(next.z, MIN_ZOOM, MAX_ZOOM) };
    cameraRef.current = clamped;
    setCameraState(clamped);
    clearTimeout(cameraSaveTimer.current);
    cameraSaveTimer.current = setTimeout(() => saveCamera(cameraRef.current), 600);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animation.current) cancelAnimationFrame(animation.current);
    animation.current = undefined;
  }, []);

  const animateTo = useCallback(
    (target: Camera, ms = 620) => {
      stopAnimation();
      const from = cameraRef.current;
      const vp = viewportRef.current;
      if (C.prefersReducedMotion() || ms <= 0) {
        setCamera(target);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        setCamera(interpolateCamera(from, target, t, vp));
        if (t < 1) animation.current = requestAnimationFrame(step);
        else animation.current = undefined;
      };
      animation.current = requestAnimationFrame(step);
    },
    [setCamera, stopAnimation],
  );

  const setViewport = useCallback((v: { w: number; h: number }) => {
    viewportRef.current = v;
    setViewportState(v);
  }, []);

  const zoomBy = useCallback(
    (factor: number, at?: Point) => {
      stopAnimation();
      const vp = viewportRef.current;
      const anchor = at ?? { x: vp.w / 2, y: vp.h / 2 };
      setCamera((c) => {
        const z = clamp(c.z * factor, MIN_ZOOM, MAX_ZOOM);
        const k = z / c.z;
        return { z, x: anchor.x - (anchor.x - c.x) * k, y: anchor.y - (anchor.y - c.y) * k };
      });
    },
    [setCamera, stopAnimation],
  );

  const fitNodes = useCallback(
    (ids: ID[], maxZoom = 1) => {
      const rect = ids.length ? boundsOfNodes(boardRef.current, ids) : boardBounds(boardRef.current);
      animateTo(fitRect(rect, viewportRef.current, 130, maxZoom));
    },
    [animateTo],
  );

  const fitAll = useCallback(() => {
    animateTo(fitRect(boardBounds(boardRef.current), viewportRef.current, 130, 1));
  }, [animateTo]);

  const centerNode = useCallback(
    (id: ID, zoom?: number) => {
      const n = boardRef.current.nodes[id];
      if (!n) return;
      const z = zoom ?? clamp(cameraRef.current.z, 0.85, 1.4);
      animateTo(centerOn({ x: n.x, y: n.y }, viewportRef.current, z));
    },
    [animateTo],
  );

  // ---- load / save -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fonts first, and not out of politeness: the board measures its own
      // text, so a width taken against the fallback face would be baked into
      // every node position. The app is invisible until this resolves anyway.
      const [stored, storedCamera] = await Promise.all([loadBoard(), loadCamera(), loadFonts()]);
      if (cancelled) return;
      // A first visit gets a blank sheet, not somebody else's map. The example
      // is one command away for anyone who wants to see the idea worked through.
      const next = stored && Object.keys(stored.nodes ?? {}).length ? stored : C.emptyBoard();
      boardRef.current = next;
      setBoardState(next);
      if (storedCamera && Number.isFinite(storedCamera.z)) {
        cameraRef.current = storedCamera;
        setCameraState(storedCamera);
      } else {
        // First run frames the top of the map rather than cramming all of it
        // in: a few large words, with the rest waiting just below the fold.
        const c = openingShot(next, viewportRef.current);
        cameraRef.current = c;
        setCameraState(c);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [saver]);

  // The desktop app flushes on beforeunload. A phone is never unloaded — it is
  // backgrounded, and may be killed outright without another frame, so the
  // board goes to disk the moment the app stops being frontmost.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') saver.flushNow(boardRef.current);
    });
    return () => sub.remove();
  }, [saver]);

  // ---- derived -----------------------------------------------------------
  const index = useMemo(() => buildIndex(board), [board]);

  const focusSet = useMemo(() => {
    if (!ui.focusId || !board.nodes[ui.focusId]) return null;
    const core = [ui.focusId, ...descendants(index, ui.focusId)];
    const set = new Set<ID>(core);
    for (const id of core) for (const n of linkedTo(index, id)) set.add(n);
    return set;
  }, [ui.focusId, board, index]);

  // ---- board actions -----------------------------------------------------
  const createRootAt = useCallback(
    (at: Point) => {
      const { board: next, id } = C.createRoot(boardRef.current, at);
      commit(next);
      setUI({ selectedId: id, editingId: id, openId: null });
      return id;
    },
    [commit, setUI],
  );

  const createChild = useCallback(
    (parentId: ID) => {
      const { board: next, id } = C.createChild(boardRef.current, parentId);
      if (next === boardRef.current) return null;
      commit(next);
      setUI({ selectedId: id, editingId: id });
      return id;
    },
    [commit, setUI],
  );

  const createSibling = useCallback(
    (id: ID) => {
      const { board: next, id: created } = C.createSibling(boardRef.current, id);
      if (next === boardRef.current) return null;
      commit(next);
      setUI({ selectedId: created, editingId: created });
      return created;
    },
    [commit, setUI],
  );

  const setText = useCallback(
    (id: ID, text: string) => commit(C.setText(boardRef.current, id, text), { coalesce: `text:${id}` }),
    [commit],
  );
  const setNote = useCallback(
    (id: ID, note: string) => commit(C.setNote(boardRef.current, id, note), { coalesce: `note:${id}` }),
    [commit],
  );
  const setAttrs = useCallback(
    (id: ID, attrs: Partial<Attributes>) => commit(C.setAttrs(boardRef.current, id, attrs), { coalesce: `attrs:${id}` }),
    [commit],
  );
  const setAccent = useCallback(
    (id: ID, accent: Accent, cascade = false) => commit(C.setAccent(boardRef.current, id, accent, cascade)),
    [commit],
  );
  const setType = useCallback((id: ID, type: ThoughtType | null) => commit(C.setType(boardRef.current, id, type)), [commit]);
  const moveNode = useCallback(
    (id: ID, to: Point, withSubtree: boolean) =>
      commit(C.moveNode(boardRef.current, id, to, withSubtree), { coalesce: `move:${id}` }),
    [commit],
  );

  const deleteThought = useCallback(
    (id: ID) => {
      const node = boardRef.current.nodes[id];
      if (!node) return;
      const parent = node.parentId;
      commit(C.deleteSubtree(boardRef.current, id));
      setUI({
        selectedId: parent ?? null,
        editingId: null,
        openId: null,
        confirmDeleteId: null,
        focusId: null,
      });
    },
    [commit, setUI],
  );

  const link = useCallback(
    (a: ID, b: ID) => {
      const { board: next, id } = C.linkThoughts(boardRef.current, a, b);
      if (!id) return;
      commit(next);
      setUI({ linkingFrom: null, editingLinkId: id });
    },
    [commit, setUI],
  );

  const setLinkLabel = useCallback(
    (id: ID, label: string) => commit(C.setLinkLabel(boardRef.current, id, label), { coalesce: `link:${id}` }),
    [commit],
  );
  const removeLink = useCallback((id: ID) => commit(C.removeLink(boardRef.current, id)), [commit]);

  const tidy = useCallback(
    (id: ID) => {
      commit(C.tidy(boardRef.current, id));
      toast('Branch tidied');
    },
    [commit, toast],
  );

  const replaceBoard = useCallback(
    (next: Board, message?: string) => {
      commit(next);
      setUIState({ ...initialUI });
      if (message) toast(message);
    },
    [commit, toast],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(boardRef.current);
    lastCoalesce.current = null;
    applyBoard(prev);
    setHistoryTick((t) => t + 1);
    setUIState((u) => ({ ...u, editingId: null }));
  }, [applyBoard]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(boardRef.current);
    lastCoalesce.current = null;
    applyBoard(next);
    setHistoryTick((t) => t + 1);
    setUIState((u) => ({ ...u, editingId: null }));
  }, [applyBoard]);

  const select = useCallback((id: ID | null) => setUI({ selectedId: id, editingId: null }), [setUI]);
  const edit = useCallback((id: ID | null) => setUI({ editingId: id, selectedId: id ?? null }), [setUI]);
  const open = useCallback((id: ID | null) => setUI({ openId: id, editingId: null, selectedId: id ?? null }), [setUI]);
  const focus = useCallback((id: ID | null) => setUI({ focusId: id }), [setUI]);

  const appValue = useMemo<AppApi>(
    () => ({
      board,
      index,
      ui,
      focusSet,
      ready,
      savedAt,
      setUI,
      toast,
      commit,
      undo,
      redo,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
      createRootAt,
      createChild,
      createSibling,
      setText,
      setNote,
      setAttrs,
      setAccent,
      setType,
      moveNode,
      deleteThought,
      link,
      setLinkLabel,
      removeLink,
      tidy,
      replaceBoard,
      select,
      edit,
      open,
      focus,
    }),
    // historyTick keeps canUndo / canRedo honest without storing arrays in state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      board, index, ui, focusSet, ready, savedAt, historyTick, setUI, toast, commit, undo, redo,
      createRootAt, createChild, createSibling, setText, setNote, setAttrs, setAccent, setType,
      moveNode, deleteThought, link, setLinkLabel, removeLink, tidy, replaceBoard, select, edit, open, focus,
    ],
  );

  const cameraValue = useMemo<CameraApi>(
    () => ({ camera, viewport, setViewport, setCamera, animateTo, zoomBy, fitAll, fitNodes, centerNode, cameraRef }),
    [camera, viewport, setViewport, setCamera, animateTo, zoomBy, fitAll, fitNodes, centerNode],
  );

  return (
    <AppContext.Provider value={appValue}>
      <CameraContext.Provider value={cameraValue}>{children}</CameraContext.Provider>
    </AppContext.Provider>
  );
}
