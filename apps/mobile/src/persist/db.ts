import * as SQLite from 'expo-sqlite';
import type { Board, Camera } from '@field/core';

/**
 * Local persistence, in the same shape the browser's IndexedDB store has: one
 * record for the board, one for the camera, so a save while panning never
 * rewrites the graph.
 *
 * The stored value is exactly the export format — the same JSON the file
 * exporter writes and the same JSON the account column holds — which is what
 * keeps a board portable between a phone, a laptop and a file.
 *
 * SQLite rather than AsyncStorage: a large map is a megabyte of JSON, and
 * AsyncStorage on Android has historically had a cursor limit that a board can
 * grow past. This is one row in one table, written whole.
 */

const BOARD_KEY = 'board';
const VIEW_KEY = 'view';
const GREETED_KEY = 'greeted';

let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

function open(): Promise<SQLite.SQLiteDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync('field.db');
      await db.execAsync(
        'PRAGMA journal_mode = WAL;' +
          'CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);',
      );
      return db;
    } catch {
      // A board that never appears is worse than a board that cannot be saved.
      return null;
    }
  })();
  return dbPromise;
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    await db.runAsync(
      'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      JSON.stringify(value),
    );
  } catch {
    /* out of space, or the file is gone from under us */
  }
}

async function get<T>(key: string): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM state WHERE key = ?',
      key,
    );
    return row ? (JSON.parse(row.value) as T) : null;
  } catch {
    return null;
  }
}

export const loadBoard = () => get<Board>(BOARD_KEY);
export const loadCamera = () => get<Camera>(VIEW_KEY);
export const saveCamera = (camera: Camera) => put(VIEW_KEY, camera);

/**
 * Whether the welcome has been answered. It is asked once and never again,
 * whichever way it went — a phone that cannot write this is a phone that asks
 * twice, which is the right way round for a screen that offers a way past it.
 */
export const loadGreeted = () => get<boolean>(GREETED_KEY);
export const saveGreeted = () => put(GREETED_KEY, true);

/** Debounced so a burst of keystrokes writes once. */
export function makeBoardSaver(onSaved?: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
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
      clearTimeout(timer);
      timer = setTimeout(flush, 450);
    },
    flushNow(board?: Board) {
      if (board) pending = board;
      clearTimeout(timer);
      return flush();
    },
  };
}
