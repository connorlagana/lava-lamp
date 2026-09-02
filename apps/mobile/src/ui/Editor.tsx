import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import {
  DEPTH_STYLES,
  INK_RGB,
  measure,
  styleFor,
  worldToScreen,
  type Camera,
} from '@field/core';
import { useApp, useCamera } from '../store/app';
import { useKeepAboveKeyboard } from './keyboard';

/**
 * Editing the words of a thought.
 *
 * Skia draws text; it does not accept it. So while a thought is being edited
 * the painter skips it and a real `TextInput` is placed exactly where the
 * words were, at the same size, weight and measure — the illusion being that
 * you have simply started typing into the board.
 *
 * The font is asked for by family name here rather than by file, because a
 * TextInput is a platform view and cannot be handed a Skia typeface. The five
 * per-depth faces are registered with the system at startup under names this
 * file can build (see `App.tsx`), so the words under the caret are set in the
 * very same outlines Skia draws the rest of the board with — no weight to
 * approximate, and no jump when editing ends.
 */

/** One registered family per depth, so the caret's text is set in exactly the
 *  face Skia is drawing the rest of the board in. See `App.tsx`. */
const familyFor = (depth: number) => `field-depth-${Math.min(Math.max(depth, 0), 4)}`;

export function Editor() {
  const app = useApp();
  const { camera } = useCamera();
  const id = app.ui.editingId;
  const node = id ? app.board.nodes[id] : null;
  const input = useRef<TextInput>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!node) return;
    setDraft(node.text);
    // A frame's grace, so the field exists before the keyboard reaches for it.
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Measured before the early return, because the hook below cannot be.
  const depth = node?.depth ?? 0;
  const style = styleFor(depth);
  const m = measure(draft, depth);
  const z = camera.z;
  const at = node
    ? worldToScreen(camera as Camera, { x: node.x, y: node.y })
    : { x: 0, y: 0 };

  // The field cannot move off the thought, so the board comes up to meet it.
  useKeepAboveKeyboard(node ? at.y + (m.h * z) / 2 : null);

  if (!node || !id) return null;

  // Empty words are not a thought: a blank leaf removes itself on commit.
  const commit = () => {
    const trimmed = draft.trim();
    const leaf = !app.index.children.get(id)?.length;
    if (!trimmed && !node.note.trim() && leaf) {
      app.deleteThought(id);
      return;
    }
    app.setText(id, trimmed);
    app.setUI({ editingId: null, selectedId: id });
  };

  const width = Math.max(m.w, DEPTH_STYLES[Math.min(node.depth, 4)].maxWidth * 0.4);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TextInput
        ref={input}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          // Live, so the rim grows with the words exactly as it does on the web.
          app.setText(id, text);
        }}
        onBlur={commit}
        onSubmitEditing={commit}
        blurOnSubmit
        multiline
        scrollEnabled={false}
        selectTextOnFocus
        autoCorrect={false}
        spellCheck={false}
        style={[
          styles.field,
          {
            left: at.x - (width * z) / 2,
            top: at.y - (m.h * z) / 2,
            width: width * z,
            fontFamily: familyFor(node.depth),
            fontSize: style.size * z,
            lineHeight: style.size * style.lineHeight * z,
            letterSpacing: style.tracking * style.size * z,
            color: `rgba(${INK_RGB}, ${style.ink})`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    position: 'absolute',
    textAlign: 'center',
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
  },
});
