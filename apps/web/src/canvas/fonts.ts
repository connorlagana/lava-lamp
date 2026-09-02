import {
  DISPLAY_FAMILY,
  TEXT_FAMILY,
  clearMeasureCache,
  fontString,
  setTextMeasurer,
} from '@field/core';

/**
 * The browser's half of the typography contract.
 *
 * The core owns the wrap; this owns the ruler. One canvas context measures
 * every string on the board, which is the same context the SVG exporter is
 * measured against, so the board, the file and the picture always agree.
 */

let ctx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')!;
  return ctx;
}

setTextMeasurer((text, style) => {
  const c = measureCtx();
  c.font = fontString(style);
  // Chromium / Safari 17+; harmless where unsupported.
  try {
    (c as unknown as { letterSpacing: string }).letterSpacing = `${style.tracking}em`;
  } catch {
    /* ignore */
  }
  return c.measureText(text).width;
});

/**
 * Web fonts arrive after the first frame, and a measurement taken against the
 * fallback would pin every node at the wrong width forever. Wait for the real
 * faces, then throw away anything measured before they landed.
 *
 * `document.fonts.ready` only waits for faces already in use, so ask for both
 * explicitly. It resolves on failure too, and a wedged network gets a ceiling,
 * because a board that never appears is worse than one set in Georgia.
 */
let fontsPromise: Promise<void> | null = null;
export function ensureFonts(): Promise<void> {
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const wanted = [
      `400 33px '${DISPLAY_FAMILY}'`,
      `500 15px '${TEXT_FAMILY}'`,
      `620 22px '${TEXT_FAMILY}'`,
    ];
    const load = Promise.all(wanted.map((f) => document.fonts.load(f).catch(() => undefined)))
      .then(() => document.fonts.ready)
      .then(() => undefined);
    const ceiling = new Promise<void>((r) => window.setTimeout(r, 2500));
    await Promise.race([load, ceiling]);
    clearMeasureCache();
  })();
  return fontsPromise;
}
