import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { INK_RGB, demoBoard, emptyBoard, searchNodes, type ID } from '@field/core';
import { useApp, useCamera } from '../store/app';
import { useSession } from '../account/session';
import { useLibrary } from '../library/library';
import { exportBoard, importBoard } from '../persist/io';
import { Row, Sheet } from './Sheet';

/**
 * Search, and the handful of things that act on the whole map.
 *
 * The desktop app reaches this with ⌘K and it is the spine of the thing —
 * every command in the app lives in it. Here it is one button in the corner,
 * and the list is shorter on purpose: the per-thought commands have somewhere
 * better to be now (the ring, and the sheet behind `···`), so what is left is
 * genuinely map-level. Thoughts still come first when the query matches any,
 * because finding a thought is what this is mostly for.
 */

export function CommandSheet({
  open,
  onClose,
  onAccount,
  onLibrary,
}: {
  open: boolean;
  onClose: () => void;
  onAccount: () => void;
  onLibrary: () => void;
}) {
  const app = useApp();
  const cam = useCamera();
  const session = useSession();
  const library = useLibrary();
  const [query, setQuery] = useState('');

  const hits = useMemo(
    () => (query.trim() ? searchNodes(app.board, query).slice(0, 8) : []),
    [app.board, query],
  );

  const close = () => {
    setQuery('');
    onClose();
  };

  const act = (fn: () => void) => () => {
    fn();
    close();
  };

  const go = (id: ID) => {
    app.select(id);
    cam.centerNode(id);
    close();
  };

  return (
    <Sheet open={open} onClose={close}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search this map, or reach for something"
        placeholderTextColor={`rgba(${INK_RGB}, 0.32)`}
        style={styles.field}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {hits.map((hit) => {
        const node = app.board.nodes[hit.id];
        if (!node) return null;
        return (
          <Pressable
            key={hit.id}
            onPress={() => go(hit.id)}
            style={({ pressed }) => [styles.hit, pressed && { opacity: 0.5 }]}
          >
            <Text style={styles.hitText} numberOfLines={1}>
              {node.text.trim() || 'A thought'}
            </Text>
            {/* where it sits in the tree, so two thoughts by the same name are
                still tellable apart */}
            <Text style={styles.hitKind} numberOfLines={1}>
              {hit.path}
            </Text>
          </Pressable>
        );
      })}

      {!query.trim() ? (
        <>
          <Row label="Zoom to fit" onPress={act(() => cam.fitAll())} />
          <Row label="Undo" hint={app.canUndo ? undefined : 'Nothing to undo'} onPress={act(app.undo)} />
          <Row label="Redo" hint={app.canRedo ? undefined : 'Nothing to redo'} onPress={act(app.redo)} />

          <Row
            label="Export map as JSON"
            hint="The storage format, verbatim"
            onPress={act(() => exportBoard(app.board))}
          />
          <Row
            label="Import map from JSON"
            hint="Arrives unlinked from wherever it came from"
            onPress={act(async () => {
              const board = await importBoard();
              if (board) app.replaceBoard(board, 'Map imported');
            })}
          />

          {session.enabled ? (
            <Row
              label={session.account ? 'Your maps' : 'Save to an account'}
              hint={session.account?.email ?? 'Somewhere for a map to live besides this phone'}
              onPress={act(() => (session.account ? onLibrary() : onAccount()))}
            />
          ) : null}
          {session.account && library.enabled ? (
            <Row label="Sign out" onPress={act(() => session.signOut())} />
          ) : null}

          <Row
            label="Load the example map"
            hint="Energy, housing, AI — with the cross-links"
            onPress={act(() => app.replaceBoard(demoBoard(), 'Example map loaded'))}
          />
          <Row
            label="Clear the board"
            tone="warn"
            onPress={act(() => app.replaceBoard(emptyBoard(), 'Board cleared'))}
          />
        </>
      ) : null}

      {query.trim() && !hits.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nothing on this map by that name.</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: {
    fontFamily: 'field-depth-2',
    fontSize: 18,
    color: `rgba(${INK_RGB}, 0.9)`,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `rgba(${INK_RGB}, 0.12)`,
    marginBottom: 6,
  },
  hit: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `rgba(${INK_RGB}, 0.06)`,
  },
  hitText: {
    flexShrink: 1,
    fontFamily: 'field-depth-2',
    fontSize: 16,
    color: `rgba(${INK_RGB}, 0.9)`,
  },
  hitKind: {
    fontFamily: 'field-depth-4',
    fontSize: 11,
    letterSpacing: 0.6,
    color: `rgba(${INK_RGB}, 0.4)`,
  },
  empty: { paddingVertical: 18 },
  emptyText: {
    fontFamily: 'field-depth-4',
    fontSize: 13,
    color: `rgba(${INK_RGB}, 0.45)`,
  },
});
