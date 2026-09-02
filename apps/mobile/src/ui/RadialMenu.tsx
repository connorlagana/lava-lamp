import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ACCENT_RGB,
  INK_RGB,
  PAPER,
  boxOf,
  pigmentOf,
  worldToScreen,
  type Camera,
  type ID,
} from '@field/core';
import { useApp, useCamera } from '../store/app';

/**
 * What replaces the keyboard.
 *
 * The desktop app is driven from the keys — Tab for a child, Return to edit,
 * N for the note, L to link — and none of that exists under a thumb. The
 * temptation is a toolbar, but a toolbar is the one thing this app has never
 * had; the point of it is a sheet of paper with nothing on it.
 *
 * So the actions are put where the finger already is: a ring around the
 * thought that was just tapped, and nothing on screen at all until then. It is
 * the same bargain the web app makes with hover, kept with a different sense.
 *
 * The ring is deliberately small and always in the same order, because the
 * thing worth learning here is muscle memory: `+` is always up.
 *
 * Nothing of it lies over the thought. The middle is left clear for the board
 * underneath, because a selected thought is one you can drag with a finger, and
 * a button sitting on its words would take that finger first.
 */

export interface RingAction {
  id: string;
  label: string;
  glyph: string;
  /** degrees clockwise from twelve o'clock */
  angle: number;
  run: () => void;
}

const RADIUS = 62;
const BUTTON = 46;

export function RadialMenu({
  onNote,
  onMore,
}: {
  onNote: (id: ID) => void;
  onMore: (id: ID) => void;
}) {
  const app = useApp();
  const { camera } = useCamera();
  const id = app.ui.selectedId;
  const node = id ? app.board.nodes[id] : null;
  const showing = !!node && !app.ui.editingId && !app.ui.openId;

  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (showing) {
      scale.value = withSpring(1, { damping: 14, stiffness: 220 });
      opacity.value = withTiming(1, { duration: 120 });
      Haptics.selectionAsync().catch(() => undefined);
    } else {
      scale.value = withTiming(0.7, { duration: 120 });
      opacity.value = withTiming(0, { duration: 120 });
    }
  }, [showing, scale, opacity]);

  const actions = useMemo<RingAction[]>(() => {
    if (!node) return [];
    return [
      {
        id: 'child',
        label: 'Add beneath',
        glyph: '+',
        angle: 0,
        run: () => app.createChild(node.id),
      },
      {
        id: 'link',
        label: 'Connect',
        glyph: '⟋',
        angle: 90,
        run: () => app.setUI({ linkingFrom: node.id }),
      },
      {
        id: 'more',
        label: 'More',
        glyph: '···',
        angle: 180,
        run: () => onMore(node.id),
      },
      {
        id: 'note',
        label: 'Note',
        glyph: '¶',
        angle: 270,
        run: () => onNote(node.id),
      },
    ];
  }, [node, app, onMore, onNote]);

  const ring = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!node) return null;

  const at = worldToScreen(camera as Camera, { x: node.x, y: node.y });
  const box = boxOf(node);
  // Sit the ring just off the thought rather than on top of its words.
  const reach = Math.max(RADIUS, (box.h / 2) * camera.z + 26);
  const pigment = ACCENT_RGB[pigmentOf(app.board, node.id)];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents={showing ? 'box-none' : 'none'}
        style={[styles.anchor, ring, { left: at.x, top: at.y }]}
      >
        {actions.map((action) => {
          const radians = ((action.angle - 90) * Math.PI) / 180;
          const distance = action.angle % 180 === 0 ? reach : Math.max(RADIUS, (box.w / 2) * camera.z + 26);
          return (
            <Pressable
              key={action.id}
              accessibilityLabel={action.label}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                action.run();
              }}
              style={[
                styles.button,
                {
                  transform: [
                    { translateX: Math.cos(radians) * distance - BUTTON / 2 },
                    { translateY: Math.sin(radians) * distance - BUTTON / 2 },
                  ],
                  borderColor: `rgba(${pigment}, 0.5)`,
                },
              ]}
            >
              <Text style={[styles.glyph, { color: `rgb(${pigment})` }]}>{action.glyph}</Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  button: {
    position: 'absolute',
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PAPER,
    borderWidth: 1.5,
    // A ring floating over paper needs to sit above it, not in it.
    shadowColor: `rgb(${INK_RGB})`,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  glyph: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: '600',
  },
});
