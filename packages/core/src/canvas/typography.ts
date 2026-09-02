/**
 * Typography is the only device this app uses to express hierarchy.
 * Every size, weight and measure lives here, and text is measured with the
 * same metrics the canvas and the SVG export both use, so what you see on the
 * board is exactly what lands in an exported file.
 *
 * Two voices: a fat round display face for the headline of a branch, and a
 * warm serif for everything growing beneath it.
 */

export const DISPLAY_FAMILY = 'Bagel Fat One';
export const TEXT_FAMILY = 'Fraunces';

export const DISPLAY_FONT_STACK = `'${DISPLAY_FAMILY}', 'Trebuchet MS', 'Avenir Next', system-ui, sans-serif`;
export const TEXT_FONT_STACK = `'${TEXT_FAMILY}', Georgia, 'Iowan Old Style', 'Times New Roman', serif`;

/** Both faces are vendored as woff2 and embedded into exports, so the same
 *  names work in the SVG file as on the board. */
export const EXPORT_DISPLAY_STACK = DISPLAY_FONT_STACK;
export const EXPORT_TEXT_STACK = TEXT_FONT_STACK;

export type Family = 'display' | 'text';

export interface DepthStyle {
  family: Family;
  size: number;
  weight: number;
  /** em */
  tracking: number;
  lineHeight: number;
  maxWidth: number;
  /** ink opacity */
  ink: number;
}

/**
 * Five steps. The first is the headline — set in the fat face, which is why it
 * carries no weight axis and a wider measure. Past the fifth we stop shrinking:
 * a thought you cannot read is not a thought you can think with.
 */
export const DEPTH_STYLES: DepthStyle[] = [
  { family: 'display', size: 33,   weight: 400, tracking: -0.004, lineHeight: 1.18, maxWidth: 350, ink: 0.95 },
  { family: 'text',    size: 22,   weight: 620, tracking: -0.006, lineHeight: 1.3,  maxWidth: 276, ink: 0.88 },
  { family: 'text',    size: 17.5, weight: 570, tracking: -0.001, lineHeight: 1.36, maxWidth: 248, ink: 0.8 },
  { family: 'text',    size: 15,   weight: 530, tracking: 0.004,  lineHeight: 1.42, maxWidth: 224, ink: 0.72 },
  { family: 'text',    size: 13.5, weight: 500, tracking: 0.009,  lineHeight: 1.46, maxWidth: 206, ink: 0.64 },
];

export const styleFor = (depth: number): DepthStyle =>
  DEPTH_STYLES[Math.min(Math.max(depth, 0), DEPTH_STYLES.length - 1)];

export const stackFor = (family: Family) => (family === 'display' ? DISPLAY_FONT_STACK : TEXT_FONT_STACK);

export const fontString = (s: DepthStyle) => `${s.weight} ${s.size}px ${stackFor(s.family)}`;

/**
 * How wide one run of text is, in the given style.
 *
 * This is the one measurement the core cannot make for itself: the browser
 * asks a canvas context, the phone asks Skia, and the two do not agree to the
 * pixel. Everything built on top of it — the greedy wrap below, the node box
 * in `graph.boxOf`, the whole layout engine — is shared, so a board wraps its
 * lines the same way everywhere it is opened once the widths agree.
 */
export type TextMeasurer = (text: string, style: DepthStyle) => number;

/**
 * Until a platform registers a real one, approximate. A board measured this
 * way is wrong, but it is wrong in a way that still lays out and still draws,
 * which beats throwing during the first frame.
 */
const approximate: TextMeasurer = (text, s) =>
  text.length * s.size * (s.family === 'display' ? 0.58 : 0.5);

let widthOf: TextMeasurer = approximate;

/** Register the platform's measurer. Anything measured before is discarded. */
export function setTextMeasurer(fn: TextMeasurer): void {
  widthOf = fn;
  cache.clear();
}

/** Drop every cached measurement — call when a real font face lands. */
export function clearMeasureCache(): void {
  cache.clear();
}

export interface Measured {
  lines: string[];
  w: number;
  h: number;
}

const cache = new Map<string, Measured>();
export const PLACEHOLDER = 'a thought';

/**
 * Greedy word wrap against the depth's measure. Returns the exact line breaks
 * so the DOM and the exporter render identically.
 */
export function measure(text: string, depth: number): Measured {
  const key = `${depth} ${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const s = styleFor(depth);
  const source = text.trim().length ? text.trim() : PLACEHOLDER;
  const paragraphs = source.split(String.fromCharCode(10));
  const lines: string[] = [];
  let widest = 0;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = `${line} ${words[i]}`;
      if (widthOf(next, s) > s.maxWidth) {
        lines.push(line);
        line = words[i];
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  for (const l of lines) widest = Math.max(widest, widthOf(l, s));

  const out: Measured = {
    lines,
    // a hair of slack so the browser never rewraps differently than we did
    w: Math.min(s.maxWidth, Math.ceil(widest) + 2),
    h: Math.round(lines.length * s.size * s.lineHeight),
  };
  if (cache.size > 4000) cache.clear();
  cache.set(key, out);
  return out;
}

/** Breathing room around the text, used for hit areas, fields and edge anchors. */
export function padding(depth: number): { x: number; y: number } {
  const s = styleFor(depth);
  return { x: s.size * 0.72 + 8, y: s.size * 0.5 + 6 };
}
