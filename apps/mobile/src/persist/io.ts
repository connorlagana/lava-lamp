import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { emptyAttrs, recomputeDepths, uid, type Board, type Thought } from '@field/core';

/**
 * Getting a map in and out of the phone.
 *
 * The JSON is the storage format verbatim — byte for byte what the web app
 * writes — which is the whole point: a map exported on a laptop opens here,
 * and a map exported here opens there. The account column holds the same shape
 * again, so the three of them are one format with three transports.
 *
 * There is no "download" on a phone, so an export writes a file into the app's
 * own cache and hands it to the system share sheet. Where it goes after that
 * is the operating system's business.
 */

const filename = (board: Board) => {
  const slug =
    (board.title || 'field-map')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'field-map';
  return `${slug}.json`;
};

export async function exportBoard(board: Board): Promise<void> {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, filename(board));
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(board, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: board.title || 'Field map',
      UTI: 'public.json',
    });
  }
}

/**
 * Read a map back off the disk.
 *
 * An imported file arrives *unlinked* on purpose — `remoteId` is stripped, and
 * every id is reissued. A map someone sends you must not try to overwrite the
 * row it came from, and two copies of the same map on one board must not share
 * ids. This mirrors `pickJSONFile` in the web app exactly.
 */
export async function importBoard(): Promise<Board | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json', '*/*'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.length) return null;

  try {
    const file = new File(picked.assets[0].uri);
    const parsed = JSON.parse(file.textSync()) as Partial<Board>;
    return adopt(parsed);
  } catch {
    return null;
  }
}

/** Reissue every id, drop the remote link, and put the depths back. */
function adopt(raw: Partial<Board>): Board | null {
  if (!raw || typeof raw !== 'object' || !raw.nodes) return null;

  const remap = new Map<string, string>();
  const idFor = (old: string) => {
    let next = remap.get(old);
    if (!next) {
      next = uid();
      remap.set(old, next);
    }
    return next;
  };

  const nodes: Record<string, Thought> = {};
  for (const [oldId, node] of Object.entries(raw.nodes)) {
    if (!node) continue;
    const id = idFor(oldId);
    nodes[id] = {
      ...node,
      id,
      parentId: node.parentId ? idFor(node.parentId) : null,
      note: node.note ?? '',
      attrs: { ...emptyAttrs(), ...(node.attrs ?? {}) },
      accent: node.accent ?? 'none',
      type: node.type ?? null,
      depth: node.depth ?? 0,
      createdAt: node.createdAt ?? Date.now(),
      updatedAt: node.updatedAt ?? Date.now(),
    };
  }

  const links: Board['links'] = {};
  for (const link of Object.values(raw.links ?? {})) {
    if (!link || !remap.has(link.source) || !remap.has(link.target)) continue;
    const id = uid();
    links[id] = {
      ...link,
      id,
      source: idFor(link.source),
      target: idFor(link.target),
      label: link.label ?? '',
    };
  }

  const board: Board = {
    version: 1,
    id: uid(),
    title: raw.title || 'Untitled map',
    // Deliberately absent: an imported map is nobody's row.
    remoteId: null,
    nodes,
    links,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  recomputeDepths(board);
  return board;
}
