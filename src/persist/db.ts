import type { Board, Camera } from '../model/types';

/**
 * Local persistence. IndexedDB when it is available, localStorage when it is
 * not. One record for the board, one for the camera, so a save while panning
 * never rewrites the graph.
 *
 * The stored shape is exactly the export shape, which is what makes adding a
 * cloud sync later a transport problem rather than a migration problem.
 */

const DB_NAME = 'field';
const DB_VERSION = 1;
const STORE = 'state';
const BOARD_KEY = 'board';
const VIEW_KEY = 'view';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    // A blocked or wedged open request can otherwise never settle, and a
    // thinking board that never appears is worse than one without a database.
    // Give up after a moment, and let the next call try again.
    const bail = window.setTimeout(() => {
      dbPromise = null;
      resolve(null);
    }, 4000);
    const settle = (value: IDBDatabase | null) => {
      window.clearTimeout(bail);
      resolve(value);
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => settle(req.result);
    req.onerror = () => settle(null);
    req.onblocked = () => settle(null);
  });
  return dbPromise;
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) {
    try { localStorage.setItem(`field:${key}`, JSON.stringify(value)); } catch { /* full or blocked */ }
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

async function get<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) {
    try {
      const raw = localStorage.getItem(`field:${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => resolve(null);
  });
}

export const loadBoard = () => get<Board>(BOARD_KEY);
export const loadCamera = () => get<Camera>(VIEW_KEY);
export const saveCamera = (camera: Camera) => put(VIEW_KEY, camera);

/** Debounced so a burst of keystrokes writes once. */
export function makeBoardSaver(onSaved?: () => void) {
  let timer: number | undefined;
  let pending: Board | null = null;
  let inFlight = false;

  const flush = async () => {
    if (inFlight || !pending) return;
    const board = pending;
    pending = null;
    inFlight = true;
    await put(BOARD_KEY, board);
    inFlight = false;
    onSaved?.();
    if (pending) flush();
  };

  return {
    schedule(board: Board) {
      pending = board;
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 450);
    },
    flushNow(board?: Board) {
      if (board) pending = board;
      window.clearTimeout(timer);
      return flush();
    },
  };
}
