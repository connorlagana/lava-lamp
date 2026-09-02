import { Skia, loadData, type SkFont, type SkTypeface } from '@shopify/react-native-skia';
import { DEPTH_STYLES, clearMeasureCache, setTextMeasurer, styleFor } from '@field/core';

/**
 * The phone's half of the typography contract.
 *
 * The core owns the wrap; this owns the ruler — the same division as on the
 * web, and for the same reason: the board's layout is derived from measured
 * text, so if the two rulers disagree the two platforms lay out differently.
 *
 * There is one face per depth rather than one variable face with a weight set
 * on it. `scripts/instance-fonts.py` bakes each one at exactly the weight and
 * optical size the browser resolves for that depth, so asking the right file
 * is the whole of getting the right answer. See that script for why.
 */

/** Metro needs a literal `require` per asset, so these cannot be built in a loop. */
const FILES = [
  require('../assets/fonts/depth-0.ttf'),
  require('../assets/fonts/depth-1.ttf'),
  require('../assets/fonts/depth-2.ttf'),
  require('../assets/fonts/depth-3.ttf'),
  require('../assets/fonts/depth-4.ttf'),
];

const typefaces: (SkTypeface | null)[] = [];
/** One SkFont per depth, held at that depth's own size. */
const fonts: (SkFont | null)[] = [];

export const fontFor = (depth: number): SkFont | null =>
  fonts[Math.min(Math.max(depth, 0), fonts.length - 1)] ?? null;

/**
 * Load every face, then teach the core to measure with them.
 *
 * Nothing may draw before this resolves. A board measured against a missing
 * face would be laid out at the fallback's widths and those positions would be
 * written straight back to the database — the same trap the web app avoids by
 * waiting on `document.fonts.ready`.
 */
let loading: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    await Promise.all(
      FILES.map(async (file, depth) => {
        const tf = await loadData(file, (data) => Skia.Typeface.MakeFreeTypeFaceFromData(data));
        typefaces[depth] = tf;
        fonts[depth] = tf ? Skia.Font(tf, DEPTH_STYLES[depth].size) : null;
      }),
    );

    setTextMeasurer((text, style) => {
      const depth = DEPTH_STYLES.indexOf(style);
      const font = fontFor(depth < 0 ? 0 : depth);
      if (!font) return text.length * style.size * 0.5;
      // Advance widths, not the ink bounding box: this has to match what the
      // browser's TextMetrics.width reports, and that is the advance.
      const widths = font.getGlyphWidths(font.getGlyphIDs(text));
      let sum = 0;
      for (const w of widths) sum += w;
      // Skia has no letter-spacing. CSS adds the tracking after every
      // character, the last one included, and the web ruler measures with it
      // applied, so it has to be added back here by hand.
      return sum + style.tracking * style.size * text.length;
    });

    clearMeasureCache();
  })();
  return loading;
}

/** The face a depth is drawn in, sized for a particular zoom. */
export function scaledFont(depth: number, size: number): SkFont | null {
  const tf = typefaces[Math.min(Math.max(depth, 0), typefaces.length - 1)];
  return tf ? Skia.Font(tf, size) : null;
}

export { styleFor };
