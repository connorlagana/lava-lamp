import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { INK_RGB, PAPER } from '@field/core';
import { Lamp } from '../canvas/Lamp';
import { AccountForm } from './AccountForm';

/**
 * The first thing, and the only thing this app asks for.
 *
 * It offers three ways out and no fourth: sign in, make an account, or go
 * straight to the paper. The third is not hidden and not made to feel like a
 * loss, because it is the truth of the app — the map is saved on this phone
 * either way, and an account is a shelf, not the floor.
 *
 * Signing in and signing up are one field pair rather than two doors. An email
 * either has an account behind it or it does not, and asking someone to declare
 * which before they have typed anything is a question the app can answer for
 * itself. `AccountForm` tries to sign in and makes the account if there is
 * none, so the copy names both and the screen only has one path.
 *
 * Behind the words is the lamp, and only the lamp. It was a wash over the board
 * at first, on the theory that a first launch has an empty board behind it and
 * the app would be seen to have begun before it asked for anything — but a
 * phone that already has a map on it turns that into a mess of branches running
 * through the copy, and a landing page has no business being legible only
 * sometimes. So it paints its own paper and burns its own lamp: the same six
 * columns of wax, and nothing else to read through.
 *
 * It is shown once. Whichever way it is answered, it does not come back — the ⌘
 * menu is where an account lives from then on.
 */

export function Welcome({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  if (!open) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(420)}
      exiting={FadeOut.duration(260)}
      style={styles.ground}
    >
      <Canvas style={styles.lamp} pointerEvents="none">
        <Lamp width={width} height={height} />
      </Canvas>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.fill}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[
            styles.body,
            { paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 20) + 24 },
          ]}
        >
          <Text style={styles.name}>Field</Text>
          <Text style={styles.line}>
            A map of what you are thinking, on a sheet of paper that is yours.
          </Text>

          <View style={styles.form}>
            <AccountForm onDone={onDismiss} cta="Continue" />
          </View>

          <Text style={styles.note}>
            One email, one password. If you have been here before we will sign you in; if you
            have not, this makes the account.
          </Text>

          <View style={styles.rule} />

          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            style={({ pressed }) => [styles.later, pressed && { opacity: 0.5 }]}
          >
            <Text style={styles.laterText}>Not now — take me to the paper</Text>
          </Pressable>
          <Text style={styles.laterNote}>
            Everything works without one. The map is saved on this phone from the first thought,
            and you can sign in whenever you want it somewhere else as well.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Opaque, and paper-coloured before Skia has painted a frame, so the board
  // behind never shows through even for one.
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: PAPER,
  },
  lamp: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  fill: { flex: 1 },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  name: {
    fontFamily: 'field-depth-0',
    fontSize: 46,
    lineHeight: 54,
    color: `rgba(${INK_RGB}, 0.95)`,
  },
  line: {
    fontFamily: 'field-depth-2',
    fontSize: 17.5,
    lineHeight: 25,
    color: `rgba(${INK_RGB}, 0.62)`,
    marginTop: 10,
    maxWidth: 320,
  },
  form: { marginTop: 34 },
  note: {
    fontFamily: 'field-depth-4',
    fontSize: 12.5,
    lineHeight: 19,
    color: `rgba(${INK_RGB}, 0.44)`,
    marginTop: 14,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: `rgba(${INK_RGB}, 0.12)`,
    marginTop: 30,
    marginBottom: 22,
  },
  later: { paddingVertical: 4 },
  laterText: {
    fontFamily: 'field-depth-3',
    fontSize: 16,
    color: `rgba(${INK_RGB}, 0.82)`,
  },
  laterNote: {
    fontFamily: 'field-depth-4',
    fontSize: 12.5,
    lineHeight: 19,
    color: `rgba(${INK_RGB}, 0.42)`,
    marginTop: 6,
  },
});
