import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  Canvas,
  Group,
  LinearGradient,
  Text as SkText,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import Animated, { FadeIn, FadeOut, useDerivedValue } from 'react-native-reanimated';
import { ACCENT_RGB, INK_RGB, prefersReducedMotion } from '@field/core';
import { scaledFont } from '../fonts';

/**
 * What the sheet says when there is nothing on it.
 *
 * One question, set in the display face, with the wax colours drifting through
 * the letters — the same six pigments the lamp behind it is made of, sliding
 * over twenty-two seconds. On the web that is `background-clip: text` with an
 * animated `background-position`; here the gradient is a shader on the glyphs
 * and the drift is a matrix translation on the UI thread, which is the same
 * idea said in the only way Skia says it.
 *
 * It goes the moment the first thought lands.
 */

const LINE = 'What will we be creating today?';
const SUB = 'tap anywhere to start';

/** The stops, in the stylesheet's order and at its offsets. */
const STOPS = ['ember', 'fuchsia', 'grape', 'teal', 'avocado', 'ochre'] as const;
const OFFSETS = [0, 0.26, 0.48, 0.7, 0.88, 1];

export function EmptyHint({ visible }: { visible: boolean }) {
  const { width, height } = useWindowDimensions();
  const clock = useClock();
  const still = prefersReducedMotion();

  // clamp(34px, 5.6vw, 62px), as the stylesheet asks — a phone lands near the
  // bottom of that range, which is the right size for a question this wide.
  const size = Math.max(30, Math.min(62, width * 0.108));
  const font = useMemo(() => scaledFont(0, size), [size]);

  const lines = useMemo(() => (font ? wrap(LINE, font, width - 56) : []), [font, width]);

  // The gradient is twice the width of the text and slides one full width and
  // back, which is what `background-size: 260%` plus the keyframes amount to.
  const span = width * 2.6;
  const transform = useDerivedValue(() => {
    'worklet';
    if (still) return [{ translateX: 0 }];
    // 22s there and back.
    const t = (clock.value / 1000 / 22) % 1;
    const phase = t < 0.5 ? t * 2 : (1 - t) * 2;
    return [{ translateX: -phase * (span - width) }];
  }, [still, span, width]);

  if (!visible || !font) return null;

  const lineHeight = size * 1.14;
  const top = height * 0.46 - (lines.length * lineHeight) / 2;

  return (
    <Animated.View
      entering={FadeIn.duration(1300).delay(450)}
      exiting={FadeOut.duration(300)}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Group>
          {lines.map((line, i) => (
            <SkText
              key={i}
              font={font}
              text={line}
              x={(width - font.getTextWidth(line)) / 2}
              y={top + i * lineHeight + size * 0.82}
            />
          ))}
          {/* The transform belongs to the shader, not to the letters: it is
              the colour that drifts through the words, and the words that
              stay where they were put. */}
          <LinearGradient
            start={vec(0, 0)}
            end={vec(span, span * 0.25)}
            colors={STOPS.map((s) => `rgb(${ACCENT_RGB[s]})`)}
            positions={OFFSETS}
            transform={transform}
          />
        </Group>
      </Canvas>

      <View style={[styles.subWrap, { top: top + lines.length * lineHeight + 20 }]}>
        <Text style={styles.sub}>{SUB}</Text>
      </View>
    </Animated.View>
  );
}

/** Greedy wrap against the measure, the same way the board wraps a thought. */
function wrap(text: string, font: { getTextWidth: (s: string) => number }, max: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${line} ${words[i]}`;
    if (font.getTextWidth(next) > max) {
      out.push(line);
      line = words[i];
    } else {
      line = next;
    }
  }
  out.push(line);
  return out;
}

const styles = StyleSheet.create({
  subWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  sub: {
    fontFamily: 'field-depth-4',
    fontSize: 13,
    fontStyle: 'italic',
    letterSpacing: 0.65,
    color: `rgba(${INK_RGB}, 0.34)`,
  },
});
