import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { INK_RGB, type ID } from '@field/core';
import { useApp } from '../store/app';
import { Sheet } from './Sheet';

/**
 * The long note.
 *
 * On the canvas a thought is only its words; everything else is one gesture
 * away, and this is where it lives. The web app puts the attributes beside the
 * note in a second column — there is no second column on a phone, so they sit
 * under it, and the note gets the space instead. That is the right way round:
 * the note is the part anyone actually comes back for.
 */

export function NoteSheet() {
  const app = useApp();
  const id: ID | null = app.ui.openId;
  const node = id ? app.board.nodes[id] : null;
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (node) setDraft(node.note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const close = () => {
    if (id && node && draft !== node.note) app.setNote(id, draft);
    app.setUI({ openId: null });
  };

  if (!node || !id) return null;

  return (
    <Sheet open onClose={close} title={node.text.trim() || 'A thought'} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={24}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={() => id && app.setNote(id, draft)}
          multiline
          placeholder="Everything that will not fit on the board."
          placeholderTextColor={`rgba(${INK_RGB}, 0.3)`}
          style={styles.note}
          textAlignVertical="top"
        />
        <View style={styles.footer}>
          <Text style={styles.count}>
            {draft.trim() ? `${draft.trim().split(/\s+/).length} words` : 'Empty'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  note: {
    minHeight: 220,
    maxHeight: 380,
    fontFamily: 'field-depth-3',
    fontSize: 16,
    lineHeight: 25,
    color: `rgba(${INK_RGB}, 0.86)`,
    paddingVertical: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: `rgba(${INK_RGB}, 0.08)`,
  },
  count: {
    fontFamily: 'field-depth-4',
    fontSize: 12,
    color: `rgba(${INK_RGB}, 0.4)`,
  },
});
