import { Pressable, StyleSheet, Text, View } from 'react-native';
import { INK_RGB, PAPER, descendants } from '@field/core';
import { useApp } from '../store/app';
import { Sheet } from './Sheet';

/**
 * The one question this app asks.
 *
 * Nothing here is ever lost to a keystroke — every structural change is
 * undoable — but a branch is not one thought, and undo is a poor answer to
 * "where did the last hour go?" So a thought with anything growing under it is
 * counted out loud before it goes, and a leaf goes without ceremony.
 */

export function DeleteGate() {
  const app = useApp();
  const id = app.ui.confirmDeleteId;
  const node = id ? app.board.nodes[id] : null;
  if (!node || !id) return null;

  const beneath = descendants(app.index, id).length;
  const close = () => app.setUI({ confirmDeleteId: null });

  return (
    <Sheet
      open
      onClose={close}
      title={node.text.trim() || 'This thought'}
      hint={`and ${beneath} ${beneath === 1 ? 'thought' : 'thoughts'} growing under it`}
      scroll={false}
    >
      <View style={styles.row}>
        <Pressable
          onPress={close}
          style={({ pressed }) => [styles.button, styles.keep, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.keepText}>Keep it</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            app.deleteThought(id);
            close();
          }}
          style={({ pressed }) => [styles.button, styles.cut, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.cutText}>Delete the branch</Text>
        </Pressable>
      </View>
      <Text style={styles.foot}>Undo will bring it back.</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingTop: 6 },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  keep: { backgroundColor: `rgba(${INK_RGB}, 0.06)` },
  keepText: {
    fontFamily: 'field-depth-3',
    fontSize: 15,
    color: `rgba(${INK_RGB}, 0.8)`,
  },
  cut: { backgroundColor: 'rgb(243, 97, 44)' },
  cutText: { fontFamily: 'field-depth-3', fontSize: 15, color: PAPER },
  foot: {
    fontFamily: 'field-depth-4',
    fontSize: 12,
    color: `rgba(${INK_RGB}, 0.4)`,
    paddingTop: 14,
  },
});
