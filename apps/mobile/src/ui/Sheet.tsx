import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INK_RGB, PAPER } from '@field/core';

/**
 * The one sheet every panel in this app is made of.
 *
 * The web app has five of these — the note, the palette, the account, the
 * library, the delete gate — and they are five variations on one idea: the
 * board dims, something rises from the bottom, and it goes away when you look
 * away from it. On a phone that idea is already the native shape of things, so
 * there is one component and the panels are its contents.
 *
 * The one thing a phone adds is the keyboard. A sheet with a field in it has to
 * get out of the way when the keyboard arrives, and it has to get *smaller*
 * rather than merely higher — a sheet that only rises takes its top off the
 * screen and the title with it. So the sheet is laid out in flow at the bottom
 * of a full-height dock, capped at a share of whatever height is left over, and
 * its body scrolls. All three parts are needed: without the cap it grows past
 * the keyboard, and without the scroll the cap clips.
 */

export function Sheet({
  open,
  onClose,
  title,
  hint,
  children,
  scroll = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  hint?: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.dock}
          pointerEvents="box-none"
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.grip} />
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}
            {scroll ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={styles.body}>{children}</View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** A row in a sheet. The only button shape this app has. */
export function Row({
  label,
  hint,
  onPress,
  tone,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  tone?: 'plain' | 'warn';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      <Text style={[styles.rowLabel, tone === 'warn' && styles.warn]}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: `rgba(${INK_RGB}, 0.28)`,
  },
  // Full height so the sheet's share is measured against the room the keyboard
  // has left, and `box-none` so the scrim behind it still takes a tap.
  dock: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '82%',
    backgroundColor: PAPER,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grip: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: `rgba(${INK_RGB}, 0.16)`,
    marginBottom: 14,
  },
  title: {
    fontFamily: 'field-depth-1',
    fontSize: 20,
    color: `rgba(${INK_RGB}, 0.9)`,
    marginBottom: 2,
  },
  hint: {
    fontFamily: 'field-depth-4',
    fontSize: 13,
    color: `rgba(${INK_RGB}, 0.5)`,
    marginBottom: 8,
  },
  // Shrinkable, or the cap above has nothing to cap.
  body: { marginTop: 6, flexShrink: 1 },
  bodyContent: { paddingBottom: 8 },
  row: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `rgba(${INK_RGB}, 0.08)`,
  },
  rowPressed: { opacity: 0.45 },
  rowLabel: {
    fontFamily: 'field-depth-3',
    fontSize: 16,
    color: `rgba(${INK_RGB}, 0.88)`,
  },
  rowHint: {
    fontFamily: 'field-depth-4',
    fontSize: 12,
    color: `rgba(${INK_RGB}, 0.45)`,
    marginTop: 2,
  },
  warn: { color: 'rgb(243, 97, 44)' },
});

export const sheetStyles = styles;
