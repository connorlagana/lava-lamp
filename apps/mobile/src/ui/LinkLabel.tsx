import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { INK_RGB, PAPER, anchorOn, associationMid, worldToScreen, type Camera } from '@field/core';
import { useApp, useCamera } from '../store/app';
import { useKeepAboveKeyboard } from './keyboard';

/**
 * Naming a connection.
 *
 * A dotted line between two thoughts says only that they have something to do
 * with each other. The word on it — *requires*, *enables*, *competes with* — is
 * the whole of what makes it worth drawing, so tapping a line opens a field
 * sitting on the line itself rather than a sheet somewhere else. The three
 * suggestions underneath are the ones the desktop's placeholder offers, made
 * tappable because typing on a phone is the expensive part.
 */

const SUGGESTIONS = ['requires', 'enables', 'competes with'];

/** How far below the line the card reaches — `styles.card`'s offset plus its
 *  height with the chips wrapped onto a second row. */
const CARD_REACH = 88;

export function LinkLabel() {
  const app = useApp();
  const { camera } = useCamera();
  const id = app.ui.editingLinkId;
  const link = id ? app.board.links[id] : null;
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (link) setDraft(link.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const from = link ? app.board.nodes[link.source] : null;
  const to = link ? app.board.nodes[link.target] : null;
  const at =
    from && to
      ? worldToScreen(camera as Camera, associationMid(anchorOn(from, to), anchorOn(to, from)))
      : null;

  // The card sits on the line it names and cannot move off it, so the board
  // comes up to meet the keyboard instead.
  useKeepAboveKeyboard(at ? at.y + CARD_REACH : null);

  if (!link || !id || !from || !to || !at) return null;

  const commit = (value: string) => {
    app.setLinkLabel(id, value.trim());
    app.setUI({ editingLinkId: null });
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Anywhere else puts it away, the way tapping off it does on the web. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => commit(draft)}
        accessibilityLabel="Done"
      />

      <View style={[styles.at, { left: at.x, top: at.y }]}>
        <View style={styles.card}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => commit(draft)}
            placeholder="requires, enables, competes with"
            placeholderTextColor={`rgba(${INK_RGB}, 0.32)`}
            autoFocus
            autoCorrect={false}
            returnKeyType="done"
            style={styles.field}
          />
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((word) => (
              <Pressable
                key={word}
                onPress={() => commit(word)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.5 }]}
              >
                <Text style={styles.chipText}>{word}</Text>
              </Pressable>
            ))}
            {link.label ? (
              <Pressable
                onPress={() => {
                  app.removeLink(id);
                  app.setUI({ editingLinkId: null });
                }}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.5 }]}
              >
                <Text style={[styles.chipText, styles.cut]}>unlink</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  at: { position: 'absolute', width: 0, height: 0 },
  card: {
    position: 'absolute',
    width: 260,
    left: -130,
    top: -34,
    backgroundColor: PAPER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: `rgba(${INK_RGB}, 0.1)`,
    shadowColor: `rgb(${INK_RGB})`,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  field: {
    fontFamily: 'field-depth-4',
    fontSize: 14,
    color: `rgba(${INK_RGB}, 0.9)`,
    paddingVertical: 4,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 8,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `rgba(${INK_RGB}, 0.05)`,
  },
  chipText: {
    fontFamily: 'field-depth-4',
    fontSize: 12,
    color: `rgba(${INK_RGB}, 0.62)`,
  },
  cut: { color: 'rgb(243, 97, 44)' },
});
