import { StyleSheet, Text, View } from 'react-native';
import { INK_RGB } from '@field/core';
import { AccountForm } from './AccountForm';
import { Sheet } from './Sheet';

/**
 * Making, or reaching, an account, from the ⌘ menu.
 *
 * The form itself is `AccountForm`, shared with the screen a first launch
 * shows. All this adds is the sheet around it and the reason for it.
 *
 * The account buys exactly one thing — somewhere for a map to live besides
 * this phone. Everything works without it, and losing the network loses
 * nothing.
 */

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Keep this map"
      hint="An email and a password. No round trip, no verification link to wait for."
    >
      {/* Unmounted while closed, so a typed password never outlives the sheet. */}
      {open ? (
        <>
          <AccountForm onDone={onClose} />
          <View style={styles.foot}>
            <Text style={styles.footText}>
              The map is already saved on this phone. An account is a shelf, not the floor.
            </Text>
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  foot: { paddingTop: 14 },
  footText: {
    fontFamily: 'field-depth-4',
    fontSize: 12,
    lineHeight: 18,
    color: `rgba(${INK_RGB}, 0.42)`,
  },
});
