import type { Board } from '../model/types';
import { getAccessToken } from '../account/stack';

/**
 * Saved maps, over Neon's Data API.
 *
 * There is no server in this app and there is not one here either: the browser
 * talks to PostgREST directly, and row-level security on `maps` is what makes
 * that safe. Every policy is `owner_id = auth.user_id()`, and `owner_id`
 * defaults to `auth.user_id()` on insert, so a client cannot write a row it
 * would not be allowed to read back. The token is verified by the database on
 * every request; nothing here is trusted.
 *
 * The stored `board` column is the export format verbatim — the same JSON the
 * file exporter writes — so a map that round-trips through the cloud is the
 * same map that round-trips through disk.
 */

import { config } from '../config';


const base = () => config().dataApiUrl;

export interface SavedMap {
  id: string;
  title: string;
  nodeCount: number;
  updatedAt: string;
}

export class LibraryError extends Error {}

interface Row {
  id: string;
  title: string;
  node_count: number;
  updated_at: string;
  board?: Board;
}

const toSaved = (r: Row): SavedMap => ({
  id: r.id,
  title: r.title,
  nodeCount: r.node_count,
  updatedAt: r.updated_at,
});

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!base()) throw new LibraryError('Saving to an account is not set up in this build.');
  const token = await getAccessToken();
  if (!token) throw new LibraryError('You are signed out. Sign in again to save.');

  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new LibraryError('Could not reach your library. Check your connection.');
  }

  if (!res.ok) {
    // 403 here is row-level security doing its job — almost always a map that
    // belongs to somebody else, usually one that arrived in an imported file.
    if (res.status === 403) throw new LibraryError('That map belongs to another account.');
    if (res.status === 401) throw new LibraryError('You are signed out. Sign in again to save.');
    throw new LibraryError('Your library could not be reached just now.');
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Every map this account owns, most recently touched first. */
export async function listMaps(): Promise<SavedMap[]> {
  const rows = await request<Row[]>('/maps?select=id,title,node_count,updated_at&order=updated_at.desc');
  return rows.map(toSaved);
}

export async function loadMap(id: string): Promise<{ map: SavedMap; board: Board }> {
  const rows = await request<Row[]>(`/maps?id=eq.${encodeURIComponent(id)}&select=id,title,node_count,updated_at,board`);
  const row = rows[0];
  if (!row || !row.board) throw new LibraryError('That map is no longer in your library.');
  return { map: toSaved(row), board: row.board };
}

const countOf = (board: Board) => Object.keys(board.nodes).length;

export async function createMap(title: string, board: Board): Promise<SavedMap> {
  const rows = await request<Row[]>('/maps?select=id,title,node_count,updated_at', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    // owner_id is deliberately not sent: the column defaults to auth.user_id()
    // and the insert policy would reject anything else anyway.
    body: JSON.stringify({ title, board, node_count: countOf(board) }),
  });
  const row = rows[0];
  if (!row) throw new LibraryError('The map was not saved.');
  return toSaved(row);
}

export async function updateMap(id: string, title: string, board: Board): Promise<SavedMap> {
  const rows = await request<Row[]>(`/maps?id=eq.${encodeURIComponent(id)}&select=id,title,node_count,updated_at`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ title, board, node_count: countOf(board) }),
  });
  const row = rows[0];
  // No row back means the id is gone, or was never ours to begin with.
  if (!row) throw new LibraryError('That map is no longer in your library.');
  return toSaved(row);
}

export async function deleteMap(id: string): Promise<void> {
  await request<null>(`/maps?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}
