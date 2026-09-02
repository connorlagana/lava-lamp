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
import { type Board, createMap, deleteMap, libraryConfigured, LibraryError, listMaps, loadMap, type SavedMap, updateMap } from '@field/core';

import { useApp, useCamera } from '../store/app';
import { useSession } from '../account/session';

/**
 * Saving a map to an account.
 *
 * The rule this file exists to enforce: the board never waits on the network.
 * Everything is still written to IndexedDB the instant it changes, exactly as
 * before; saving to an account is an additional, explicit act, and if it fails
 * the map on screen is untouched and still on disk. An account is somewhere to
 * put a map, not the place the map lives.
 */

/** What is on screen over the canvas, if anything of ours. */
export type LibrarySheet = 'none' | 'account' | 'library' | 'name';

export interface LibraryApi {
  enabled: boolean;
  sheet: LibrarySheet;
  openSheet: (sheet: LibrarySheet) => void;

  /** the row this board is linked to, if any */
  remoteId: string | null;
  title: string;
  saving: boolean;
  /** true when the board has changed since the last successful save */
  dirty: boolean;
  savedAt: number;

  maps: SavedMap[];
  loadingMaps: boolean;

  /** The save button. Decides for itself whether to ask for a name or a login. */
  save: () => void;
  saveAs: (title: string) => Promise<void>;
  refresh: () => Promise<void>;
  openMap: (id: string) => Promise<void>;
  removeMap: (id: string) => Promise<void>;
  /** the name to offer in the naming sheet */
  suggestedTitle: () => string;
}

const LibraryContext = createContext<LibraryApi | null>(null);

export const useLibrary = () => {
  const v = useContext(LibraryContext);
  if (!v) throw new Error('useLibrary outside provider');
  return v;
};

const UNTITLED = 'Untitled map';

export function LibraryProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const cam = useCamera();
  const session = useSession();

  const [sheet, setSheet] = useState<LibrarySheet>('none');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [maps, setMaps] = useState<SavedMap[]>([]);
  const [loadingMaps, setLoadingMaps] = useState(false);

  // Board objects are replaced wholesale on every commit, so identity is a
  // free and exact answer to "has anything changed since we saved?".
  const savedBoard = useRef<Board | null>(null);

  const enabled = session.enabled && libraryConfigured();
  const remoteId = app.board.remoteId ?? null;
  const dirty = savedBoard.current !== app.board;

  const appRef = useRef(app);
  appRef.current = app;

  const openSheet = useCallback((next: LibrarySheet) => setSheet(next), []);

  const suggestedTitle = useCallback(() => {
    const board = appRef.current.board;
    if (board.title && board.title !== 'Field' && board.title !== UNTITLED) return board.title;
    // The map's own first words are a better name than anything we could ask for.
    const roots = Object.values(board.nodes).filter((n) => !n.parentId);
    const named = roots.find((n) => n.text.trim());
    return named ? named.text.trim().slice(0, 80) : UNTITLED;
  }, []);

  /**
   * Links the board to its row without disturbing undo history.
   *
   * `snapshot` is the board that was actually sent. If the user kept typing
   * while the request was in flight, what is on screen now is not what was
   * saved, and the button has to keep saying so — marking it clean would be a
   * quiet lie about where their last sentence is.
   */
  const link = useCallback((map: SavedMap, snapshot: Board) => {
    const board = appRef.current.board;
    const next: Board = { ...board, remoteId: map.id, title: map.title };
    appRef.current.commit(next, { silent: true });
    if (board === snapshot) savedBoard.current = next;
    setSavedAt(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || session.status !== 'signed-in') return;
    setLoadingMaps(true);
    try {
      setMaps(await listMaps());
    } catch (err) {
      appRef.current.toast(err instanceof LibraryError ? err.message : 'Your library could not be read.');
    } finally {
      setLoadingMaps(false);
    }
  }, [enabled, session.status]);

  // The list is small and changes rarely; fetch it once per sign-in.
  useEffect(() => {
    if (session.status === 'signed-in') void refresh();
    else setMaps([]);
  }, [session.status, refresh]);

  const saveAs = useCallback(
    async (title: string) => {
      const clean = title.trim() || UNTITLED;
      setSaving(true);
      try {
        const snapshot = appRef.current.board;
        const map = await createMap(clean, { ...snapshot, remoteId: null });
        link(map, snapshot);
        setMaps((prev) => [map, ...prev.filter((m) => m.id !== map.id)]);
        appRef.current.toast(`Saved as “${map.title}”`);
        setSheet('none');
      } catch (err) {
        appRef.current.toast(err instanceof LibraryError ? err.message : 'The map could not be saved.');
      } finally {
        setSaving(false);
      }
    },
    [link],
  );

  const save = useCallback(() => {
    if (!enabled) return;
    const board = appRef.current.board;
    if (!Object.keys(board.nodes).length) {
      appRef.current.toast('There is nothing on the sheet to save yet');
      return;
    }
    if (session.status !== 'signed-in') {
      setSheet('account');
      return;
    }
    const id = board.remoteId;
    if (!id) {
      setSheet('name');
      return;
    }
    void (async () => {
      setSaving(true);
      try {
        const map = await updateMap(id, board.title || UNTITLED, { ...board, remoteId: null });
        // Only clean if nothing was typed while the request was in flight.
        if (appRef.current.board === board) savedBoard.current = board;
        setSavedAt(Date.now());
        setMaps((prev) => [map, ...prev.filter((m) => m.id !== map.id)]);
      } catch (err) {
        // The row is gone, or was never ours: fall back to saving a fresh one
        // rather than telling someone their work has nowhere to go.
        if (err instanceof LibraryError) {
          appRef.current.commit({ ...appRef.current.board, remoteId: null }, { silent: true });
          appRef.current.toast(`${err.message} Saving it as a new map.`);
          setSheet('name');
        } else {
          appRef.current.toast('The map could not be saved.');
        }
      } finally {
        setSaving(false);
      }
    })();
  }, [enabled, session.status]);

  const openMap = useCallback(
    async (id: string) => {
      try {
        const { map, board } = await loadMap(id);
        const next: Board = { ...board, remoteId: map.id, title: map.title };
        appRef.current.replaceBoard(next, `Opened “${map.title}”`);
        savedBoard.current = next;
        setSavedAt(Date.now());
        setSheet('none');
        setTimeout(() => cam.fitAll(), 40);
      } catch (err) {
        appRef.current.toast(err instanceof LibraryError ? err.message : 'That map could not be opened.');
      }
    },
    [cam],
  );

  const removeMap = useCallback(
    async (id: string) => {
      try {
        await deleteMap(id);
        setMaps((prev) => prev.filter((m) => m.id !== id));
        // Unlink the open board if it was the one that just went.
        if (appRef.current.board.remoteId === id) {
          appRef.current.commit({ ...appRef.current.board, remoteId: null }, { silent: true });
          savedBoard.current = null;
        }
        appRef.current.toast('Map deleted');
      } catch (err) {
        appRef.current.toast(err instanceof LibraryError ? err.message : 'That map could not be deleted.');
      }
    },
    [],
  );

  const value = useMemo<LibraryApi>(
    () => ({
      enabled,
      sheet,
      openSheet,
      remoteId,
      title: app.board.title,
      saving,
      dirty,
      savedAt,
      maps,
      loadingMaps,
      save,
      saveAs,
      refresh,
      openMap,
      removeMap,
      suggestedTitle,
    }),
    [
      enabled, sheet, openSheet, remoteId, app.board.title, saving, dirty, savedAt,
      maps, loadingMaps, save, saveAs, refresh, openMap, removeMap, suggestedTitle,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
