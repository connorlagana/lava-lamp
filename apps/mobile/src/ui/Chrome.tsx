import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { INK_RGB, PAPER } from '@field/core';
import { useApp, useCamera } from '../store/app';

/**
 * The little that is allowed to sit on top of the paper.
 *
 * Three things, none of them a toolbar: a dot in the corner that blinks when
 * the board reaches the disk, whatever the app last had to say, and — only
 * while a branch is focused — the way back out. Everything else in this app is
 * summoned and then goes away again.
 */

export function Chrome({ onOpenMenu }: { onOpenMenu: () => void }) {
  const app = useApp();
  const cam = useCamera();
  const insets = useSafeAreaInsets();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {app.ui.toast ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(240)}
          style={[styles.toast, { top: insets.top + 14 }]}
          pointerEvents="none"
        >
          <Text style={styles.toastText}>{app.ui.toast}</Text>
        </Animated.View>
      ) : null}

      {app.ui.focusId ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.focus, { top: insets.top + 14 }]}>
          <Pressable onPress={() => app.focus(null)} accessibilityRole="button">
            <Text style={styles.focusText}>Focused · show all</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      <View style={[styles.corner, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
        <SavedDot at={app.savedAt} />
        <Pressable onPress={onOpenMenu} style={styles.menu} accessibilityLabel="Search and commands">
          <Text style={styles.menuGlyph}>⌘</Text>
        </Pressable>
        <Pressable onPress={() => cam.fitAll()} style={styles.menu} accessibilityLabel="Zoom to fit">
          <Text style={styles.menuGlyph}>⊹</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Blinks once, each time the board lands on the disk. */
function SavedDot({ at }: { at: number }) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!at) return;
    setLit(true);
    const t = setTimeout(() => setLit(false), 900);
    return () => clearTimeout(t);
  }, [at]);
  return <View style={[styles.dot, lit && styles.dotLit]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: `rgba(${INK_RGB}, 0.88)`,
  },
  toastText: {
    fontFamily: 'field-depth-4',
    fontSize: 13,
    color: PAPER,
  },
  focus: {
    position: 'absolute',
    left: 18,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: `rgba(${INK_RGB}, 0.06)`,
  },
  focusText: {
    fontFamily: 'field-depth-4',
    fontSize: 12,
    color: `rgba(${INK_RGB}, 0.65)`,
  },
  corner: {
    position: 'absolute',
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: `rgba(${INK_RGB}, 0.12)`,
  },
  dotLit: { backgroundColor: 'rgb(104, 168, 112)' },
  menu: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: `rgba(${INK_RGB}, 0.1)`,
  },
  menuGlyph: {
    fontSize: 16,
    color: `rgba(${INK_RGB}, 0.6)`,
  },
});
