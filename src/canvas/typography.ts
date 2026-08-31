/**
 * Typography is the only device this app uses to express hierarchy.
 * Every size, weight and measure lives here, and text is measured with the
 * same metrics the canvas and the SVG export both use, so what you see on the
 * board is exactly what lands in an exported file.
 */

export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif';

/** Concrete family names only: SVG rasterised through an <img> cannot see -apple-system. */
export const EXPORT_FONT_STACK =
  '"SF Pro Text", "Helvetica Neue", Helvetica, "Inter", Arial, sans-serif';

export interface DepthStyle {
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
 * Five steps. Past the fifth we stop shrinking: a thought you cannot read is
 * not a thought you can think with.
 */
export const DEPTH_STYLES: DepthStyle[] = [
  { size: 30,    weight: 560, tracking: -0.022, lineHeight: 1.24, maxWidth: 300, ink: 0.93 },
  { size: 21,    weight: 500, tracking: -0.016, lineHeight: 1.3,  maxWidth: 264, ink: 0.84 },
  { size: 16.5,  weight: 470, tracking: -0.009, lineHeight: 1.36, maxWidth: 236, ink: 0.75 },
  { size: 14,    weight: 450, tracking: -0.002, lineHeight: 1.42, maxWidth: 212, ink: 0.66 },
  { size: 12.75, weight: 440, tracking: 0.004,  lineHeight: 1.46, maxWidth: 196, ink: 0.58 },
];

export const styleFor = (depth: number): DepthStyle =>
  DEPTH_STYLES[Math.min(Math.max(depth, 0), DEPTH_STYLES.length - 1)];

export const fontString = (s: DepthStyle) => `${s.weight} ${s.size}px ${FONT_STACK}`;

let ctx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!ctx) {
    const c = document.createElement('canvas');
    ctx = c.getContext('2d')!;
  }
  return ctx;
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
  const c = measureCtx();
  c.font = fontString(s);
  // Chromium / Safari 17+; harmless where unsupported.
  try { (c as unknown as { letterSpacing: string }).letterSpacing = `${s.tracking}em`; } catch { /* ignore */ }

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
      if (c.measureText(next).width > s.maxWidth) {
        lines.push(line);
        line = words[i];
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  for (const l of lines) widest = Math.max(widest, c.measureText(l).width);

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
