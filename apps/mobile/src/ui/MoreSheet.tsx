import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ACCENTS,
  ACCENT_LABEL,
  ACCENT_RGB,
  CONVICTIONS,
  INK_RGB,
  THOUGHT_TYPES,
  descendants,
  type Accent,
  type Conviction,
  type ID,
  type ThoughtType,
} from '@field/core';
import { useApp, useCamera } from '../store/app';
import { Row, Sheet } from './Sheet';

/**
 * Everything the ring has no room for.
 *
 * The four actions on the ring are the ones worth a thumb: add, connect, note,
 * and this. What is behind `···` is the rest of the desktop keyboard map —
 * tidy, focus, sibling, delete — plus the three attributes that are worth
 * setting without opening the whole note: type, colour and conviction.
 */

export function MoreSheet({ id, onClose }: { id: ID | null; onClose: () => void }) {
  const app = useApp();
  const cam = useCamera();
  const [pane, setPane] = useState<'root' | 'type' | 'accent' | 'conviction'>('root');
  const node = id ? app.board.nodes[id] : null;
  const open = !!node;

  const close = () => {
    setPane('root');
    onClose();
  };

  const act = (fn: () => void) => () => {
    fn();
    close();
  };

  if (!node || !id) return <Sheet open={false} onClose={close} children={null} />;

  const children = app.index.children.get(id)?.length ?? 0;
  const focused = app.ui.focusId === id;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={pane === 'root' ? node.text.trim() || 'A thought' : titleOf(pane)}
      hint={pane === 'root' ? undefined : 'Tap to set'}
    >
      {pane === 'root' ? (
        <>
          <Row label="Add beside" hint="A sibling at the same rank" onPress={act(() => app.createSibling(id))} />
          <Row
            label="Tidy branch"
            hint="Lay this thought and everything under it out again"
            onPress={act(() => app.tidy(id))}
          />
          <Row
            label={focused ? 'Show the whole map' : 'Focus this branch'}
            hint={focused ? undefined : 'The rest of the world fades'}
            onPress={act(() => {
              if (focused) {
                app.focus(null);
                cam.fitAll();
                return;
              }
              app.focus(id);
              // Frame the branch that is now the whole of the world.
              cam.fitNodes([id, ...descendants(app.index, id)], 1.1);
            })}
          />
          <Row label="Type" hint={node.type ?? 'Not set'} onPress={() => setPane('type')} />
          <Row label="Colour" hint={ACCENT_LABEL[node.accent]} onPress={() => setPane('accent')} />
          <Row
            label="Conviction"
            hint={CONVICTIONS.find((c) => c.id === node.attrs.conviction)?.label ?? 'Not set'}
            onPress={() => setPane('conviction')}
          />
          <Row
            label={children ? `Delete this and ${children} beneath it` : 'Delete'}
            tone="warn"
            // A branch is counted out loud before it goes; a leaf just goes.
            onPress={act(() =>
              children ? app.setUI({ confirmDeleteId: id }) : app.deleteThought(id),
            )}
          />
        </>
      ) : null}

      {pane === 'type' ? (
        <View style={styles.chips}>
          <Chip label="none" active={!node.type} onPress={() => { app.setType(id, null); close(); }} />
          {THOUGHT_TYPES.map((t: ThoughtType) => (
            <Chip
              key={t}
              label={t.replace('-', ' ')}
              active={node.type === t}
              onPress={() => { app.setType(id, t); close(); }}
            />
          ))}
        </View>
      ) : null}

      {pane === 'accent' ? (
        <View style={styles.chips}>
          {ACCENTS.map((a: Accent) => (
            <Chip
              key={a}
              label={ACCENT_LABEL[a]}
              swatch={a === 'none' ? undefined : `rgb(${ACCENT_RGB[a]})`}
              active={node.accent === a}
              onPress={() => { app.setAccent(id, a); close(); }}
            />
          ))}
        </View>
      ) : null}

      {pane === 'conviction' ? (
        <View style={styles.chips}>
          <Chip
            label="Not set"
            active={!node.attrs.conviction}
            onPress={() => { app.setAttrs(id, { conviction: null }); close(); }}
          />
          {CONVICTIONS.map((c: { id: Conviction; label: string }) => (
            <Chip
              key={c.id}
              label={c.label}
              active={node.attrs.conviction === c.id}
              onPress={() => { app.setAttrs(id, { conviction: c.id }); close(); }}
            />
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

const titleOf = (pane: string) =>
  pane === 'type' ? 'Type' : pane === 'accent' ? 'Colour' : 'Conviction';

function Chip({
  label,
  active,
  swatch,
  onPress,
}: {
  label: string;
  active: boolean;
  swatch?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.5 }]}
    >
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `rgba(${INK_RGB}, 0.14)`,
  },
  chipActive: {
    borderColor: `rgba(${INK_RGB}, 0.62)`,
    backgroundColor: `rgba(${INK_RGB}, 0.05)`,
  },
  chipText: {
    fontFamily: 'field-depth-4',
    fontSize: 14,
    color: `rgba(${INK_RGB}, 0.7)`,
  },
  chipTextActive: { color: `rgba(${INK_RGB}, 0.95)` },
  swatch: { width: 11, height: 11, borderRadius: 6 },
});
