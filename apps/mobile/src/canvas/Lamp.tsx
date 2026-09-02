import {
  Blur,
  Circle,
  FractalNoise,
  Group,
  Paint,
  RadialGradient,
  Rect,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { ACCENT_RGB, PAPER, prefersReducedMotion } from '@field/core';

/**
 * The lamp behind the map.
 *
 * Six columns of wax, rising and falling on their own clocks, never in step,
 * multiplying into each other where they cross — which is where the second
 * colours on the paper come from. Big and blurred enough that nothing here
 * ever reads as a shape you could touch.
 *
 * On the web this is six `<i>` elements with three shared `@keyframes` and a
 * 26px blur. Here it is six circles in one multiplied layer, with the motion
 * driven from Skia's own clock on the UI thread — nothing about it goes back
 * through React after mount, so the lamp runs whether or not the board is
 * doing anything and costs the board nothing.
 *
 * Two things are load-bearing and easy to get wrong. The paper is painted
 * *inside* this component, beneath the wax, because multiply against a
 * transparent canvas is not a blend, it is a disappearance. And each column's
 * gradient is declared in its own group's local space, because a shader
 * declared on a shape is otherwise positioned in canvas coordinates and would
 * sit still while its circle climbed away from it.
 */

interface Column {
  accent: keyof typeof ACCENT_RGB;
  /** where it sits, as a fraction of the viewport */
  x: number;
  y: number;
  /** diameter, as a fraction of the viewport *width* — the stylesheet sizes
   *  these in `vw`, and reading it as the long side makes them nearly three
   *  times too big on a portrait phone, which drowns the paper. */
  r: number;
  alpha: number;
  /** seconds for one full climb and sink */
  period: number;
  /** where in that cycle it starts, so no two are ever in step */
  phase: number;
  /** how far it climbs, as a fraction of the viewport height */
  rise: number;
  /** and how little it wanders sideways while doing it */
  drift: number;
}

/**
 * The same six the stylesheet places: the same corners, the same pigments, the
 * same weights, and the CSS durations as periods. Wax does not travel sideways
 * much — it climbs, stalls, swells and sinks — so `rise` is several times
 * `drift` throughout.
 */
const COLUMNS: Column[] = [
  { accent: 'ochre',   x: 0.14, y: 0.10, r: 0.58, alpha: 0.5,  period: 78,  phase: 0.0,  rise: 0.16, drift: 0.03 },
  { accent: 'fuchsia', x: 0.88, y: 0.14, r: 0.64, alpha: 0.36, period: 104, phase: 0.31, rise: 0.14, drift: -0.04 },
  { accent: 'teal',    x: 0.30, y: 0.92, r: 0.52, alpha: 0.42, period: 91,  phase: 0.62, rise: 0.18, drift: 0.04 },
  { accent: 'ember',   x: 0.92, y: 0.86, r: 0.46, alpha: 0.38, period: 67,  phase: 0.18, rise: 0.15, drift: -0.02 },
  { accent: 'grape',   x: 0.62, y: 0.06, r: 0.40, alpha: 0.34, period: 119, phase: 0.77, rise: 0.13, drift: 0.03 },
  { accent: 'avocado', x: 0.06, y: 0.74, r: 0.44, alpha: 0.4,  period: 96,  phase: 0.45, rise: 0.17, drift: -0.03 },
];

const TAU = Math.PI * 2;

export function Lamp({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  // Asked for no motion, the wax stands still. The colour stays — it is the
  // paper's colour, not an animation — and only the climbing stops.
  const still = prefersReducedMotion();

  if (!width || !height) return null;

  return (
    <Group>
      {/* The paper, and the thing the wax multiplies into. */}
      <Rect x={0} y={0} width={width} height={height} color={PAPER} />

      <Group layer={<Paint blendMode="multiply" />}>
        {/* One blurred layer for all six, so the blur is paid for once. */}
        <Group layer={<Paint><Blur blur={26} /></Paint>}>
          {COLUMNS.map((column, i) => (
            <Wax key={i} column={column} width={width} height={height} clock={clock} still={still} />
          ))}
        </Group>
      </Group>

      {/* The tooth of the paper, over everything the lamp does. The web lays a
          fractal-noise SVG on at 0.03 under multiply; Skia makes its own, so
          there is no asset to carry. */}
      <Group layer={<Paint blendMode="multiply" />} opacity={0.035}>
        <Rect x={0} y={0} width={width} height={height}>
          <FractalNoise freqX={0.85} freqY={0.85} octaves={2} seed={7} />
        </Rect>
      </Group>
    </Group>
  );
}

function Wax({
  column,
  width,
  height,
  clock,
  still,
}: {
  column: Column;
  width: number;
  height: number;
  clock: SharedValue<number>;
  still: boolean;
}) {
  const radius = (column.r * width) / 2;
  const originX = column.x * width;
  const originY = column.y * height;
  const { period, phase, rise, drift } = column;

  // The group is what moves; the circle and its gradient stay at the origin of
  // their own space, which is what keeps the two together.
  const transform = useDerivedValue(() => {
    'worklet';
    if (still) return [{ translateX: originX }, { translateY: originY }];
    const t = clock.value / 1000 / period + phase;
    return [
      { translateX: originX + Math.cos(t * TAU * 0.6) * drift * width },
      { translateY: originY - Math.sin(t * TAU) * rise * height },
    ];
  }, [still, originX, originY, width, height, period, phase, rise, drift]);

  const rgb = ACCENT_RGB[column.accent];

  return (
    <Group transform={transform}>
      <Circle cx={0} cy={0} r={radius}>
        <RadialGradient
          c={vec(0, 0)}
          r={radius}
          colors={[`rgba(${rgb}, ${column.alpha})`, `rgba(${rgb}, 0)`]}
          positions={[0, 0.74]}
        />
      </Circle>
    </Group>
  );
}
