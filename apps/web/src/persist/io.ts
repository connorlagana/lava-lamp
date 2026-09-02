import { type Accent, ACCENT_PARTNER, ACCENT_RGB, associationGeometry, blobPath, type Board, boardBounds, branchGeometry, CONVICTION_ALPHA, CONVICTION_RGB, emptyAttrs, EXPORT_DISPLAY_STACK, EXPORT_TEXT_STACK, fieldPad, type ID, INK_RGB, lampClock, lavaFor, measure, padding, PAPER, pigmentOf, recomputeDepths, type Rect, styleFor, uid, waxFor } from '@field/core';

import bagelUrl from '../fonts/bagel-fat-one-latin.woff2?url';
import frauncesUrl from '../fonts/fraunces-latin-var.woff2?url';

/**
 * Import / export.
 *
 * The JSON is the storage format verbatim, so a file you export today can be
 * read by a sync service tomorrow without translation.
 *
 * Images are produced by re-drawing the board as SVG rather than by scraping
 * the DOM. It costs a second renderer, and it buys resolution independence,
 * off-screen nodes, and a real vector export.
 *
 * The two faces are inlined as base64 woff2 in the file's own <style>. A
 * linked font would not survive either trip: an SVG opened on its own has no
 * page to inherit from, and one rasterised through an <img> is not allowed to
 * fetch anything at all. Carrying ~137KB of font is the price of a headline
 * that still looks like the board it came from.
 */

const FONT_URLS = [
  { family: 'Bagel Fat One', url: bagelUrl, weight: '400' },
  { family: 'Fraunces', url: frauncesUrl, weight: '300 900' },
];

let fontFaceCss: Promise<string> | null = null;

/** Base64 @font-face rules for the two vendored faces. Fetched once, then held. */
export function embeddedFontCss(): Promise<string> {
  if (fontFaceCss) return fontFaceCss;
  fontFaceCss = (async () => {
    try {
      const faces = await Promise.all(
        FONT_URLS.map(async ({ family, url, weight }) => {
          const buf = await (await fetch(url)).arrayBuffer();
          const bytes = new Uint8Array(buf);
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          }
          return (
            `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
            `src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`
          );
        }),
      );
      return faces.join('');
    } catch {
      // No fonts is a worse picture than no picture is not — fall back quietly.
      return '';
    }
  })();
  return fontFaceCss;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportJSON(board: Board) {
  const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `field-${stamp()}.json`);
}

/** Tolerant reader: fills in anything an older or hand-edited file is missing. */
export function parseBoard(raw: string): Board {
  const data = JSON.parse(raw) as Partial<Board>;
  if (!data || typeof data !== 'object' || !data.nodes) throw new Error('Not a Field map');
  const now = Date.now();
  const board: Board = {
    version: 1,
    id: data.id ?? uid('board'),
    title: data.title ?? 'Field',
    // Never carried across: the row belongs to whoever exported the file, and
    // row-level security would reject a write to it anyway. Better to arrive
    // as an unsaved map than as one that fails the first time it is saved.
    remoteId: null,
    nodes: {},
    links: {},
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  };
  for (const [id, n] of Object.entries(data.nodes)) {
    if (!n) continue;
    board.nodes[id] = {
      id,
      text: String(n.text ?? ''),
      note: String(n.note ?? ''),
      parentId: n.parentId ?? null,
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      accent: n.accent ?? 'none',
      type: n.type ?? null,
      attrs: { ...emptyAttrs(), ...(n.attrs ?? {}) },
      depth: Number(n.depth) || 0,
      pinned: !!n.pinned,
      createdAt: n.createdAt ?? now,
      updatedAt: n.updatedAt ?? now,
    };
  }
  for (const [id, l] of Object.entries(data.links ?? {})) {
    if (!l || !board.nodes[l.source] || !board.nodes[l.target]) continue;
    board.links[id] = {
      id,
      source: l.source,
      target: l.target,
      label: String(l.label ?? ''),
      createdAt: l.createdAt ?? now,
      updatedAt: l.updatedAt ?? now,
    };
  }
  // parents that did not survive the trip become roots
  for (const n of Object.values(board.nodes)) {
    if (n.parentId && !board.nodes[n.parentId]) board.nodes[n.id] = { ...n, parentId: null };
  }
  recomputeDepths(board);
  return board;
}

export function pickJSONFile(): Promise<Board> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.className = 'file-picker';
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return reject(new Error('No file'));
      try {
        resolve(parseBoard(await file.text()));
      } catch (err) {
        reject(err);
      }
    };
    // Some browsers ignore a click on an input that is not in the document.
    document.body.appendChild(input);
    input.click();
  });
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SvgOptions {
  /** World rect to draw. Defaults to everything, padded. */
  rect?: Rect;
  /** Restrict to these ids (focus mode export). */
  only?: Set<ID>;
  transparent?: boolean;
  /** @font-face rules to inline. `exportSVG` / `exportPNG` supply these. */
  fontCss?: string;
}

/** Redraws the board as standalone SVG using the same metrics as the canvas. */
export function boardToSVG(board: Board, opts: SvgOptions = {}): string {
  const pad = 90;
  const base = opts.rect ?? boardBounds(board);
  const rect = opts.rect ? base : { x: base.x - pad, y: base.y - pad, w: base.w + pad * 2, h: base.h + pad * 2 };
  const include = (id: ID) => !opts.only || opts.only.has(id);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(rect.w)}" height="${Math.round(rect.h)}" ` +
      `viewBox="${round(rect.x)} ${round(rect.y)} ${round(rect.w)} ${round(rect.h)}">`,
  );
  if (!opts.transparent) {
    parts.push(`<rect x="${round(rect.x)}" y="${round(rect.y)}" width="${round(rect.w)}" height="${round(rect.h)}" fill="${PAPER}"/>`);
  }

  // The rim is a two-pigment sweep on the canvas, so it is one here too. A
  // flat outline in a single colour would read as clip art.
  const pigments = new Set<Accent>();
  for (const n of Object.values(board.nodes)) {
    if (!include(n.id)) continue;
    pigments.add(pigmentOf(board, n.id));
  }

  parts.push('<defs>');
  parts.push(`<style>${opts.fontCss ?? ''}</style>`);
  for (const accent of pigments) {
    parts.push(
      `<linearGradient id="rim-${accent}" x1="0.1" y1="0" x2="0.9" y2="1">` +
        `<stop offset="0" stop-color="rgb(${ACCENT_RGB[accent]})"/>` +
        `<stop offset="1" stop-color="rgb(${ACCENT_RGB[ACCENT_PARTNER[accent]]})"/>` +
        `</linearGradient>`,
    );
  }
  parts.push('</defs>');

  // Bubbles first, under every line and every word on the board. The outlines
  // are taken at the moment of export, so the file is the board as it was seen
  // — and for a reader who has asked for no motion the clock reads zero, which
  // is the shape their screen was holding anyway.
  const clock = lampClock();
  for (const node of Object.values(board.nodes)) {
    if (!include(node.id)) continue;
    const lava = lavaFor(pigmentOf(board, node.id), node.depth);
    const wax = waxFor(node.id, node.depth);
    const m = measure(node.text, node.depth);
    const fp = fieldPad(m, padding(node.depth), node.depth);
    const rx = m.w / 2 + fp.x;
    const ry = m.h / 2 + fp.y;
    const dim = node.attrs.conviction === 'rejected';
    const ink = lava.ink * (dim ? 0.45 : 1);

    parts.push(
      `<path d="${blobPath(wax.a, clock, node.x, node.y, rx, ry)}" fill="none" ` +
        `stroke="url(#rim-${lava.primary})" stroke-width="${lava.rim}" ` +
        `stroke-linejoin="round" opacity="${ink.toFixed(3)}"/>`,
    );
  }

  parts.push(`<g fill="none" stroke-linecap="round">`);

  // branches
  for (const node of Object.values(board.nodes)) {
    if (!node.parentId || !board.nodes[node.parentId]) continue;
    if (!include(node.id) || !include(node.parentId)) continue;
    const g = branchGeometry(board, node.parentId, node.id);
    if (!g) continue;
    const d = Math.min(node.depth, 4);
    const alpha = 0.85 - d * 0.062;
    const width = 1.8 - d * 0.15;
    const rgb = lavaFor(pigmentOf(board, node.id), node.depth).rgb;
    parts.push(
      `<path d="${g.d}" stroke="rgba(${rgb}, ${alpha.toFixed(3)})" stroke-width="${width.toFixed(2)}"/>`,
    );
  }
  // associations
  for (const link of Object.values(board.links)) {
    if (!include(link.source) || !include(link.target)) continue;
    const g = associationGeometry(board, link.source, link.target);
    if (!g) continue;
    const from = board.nodes[link.source];
    const rgb = lavaFor(pigmentOf(board, from.id), from.depth).rgb;
    parts.push(
      `<path d="${g.d}" stroke="rgba(${rgb}, 0.8)" stroke-width="1.6" stroke-dasharray="1.5 5.5"/>`,
    );
    if (link.label) {
      parts.push(
        `<text x="${round(g.mid.x)}" y="${round(g.mid.y)}" font-family="${EXPORT_TEXT_STACK}" font-size="10" ` +
          `font-weight="600" letter-spacing="0.08em" text-anchor="middle" dominant-baseline="middle" ` +
          `fill="rgba(${INK_RGB}, 0.5)" stroke="${PAPER}" stroke-width="5" paint-order="stroke">${esc(link.label)}</text>`,
      );
    }
  }
  parts.push(`</g>`);

  // nodes
  for (const node of Object.values(board.nodes)) {
    if (!include(node.id)) continue;
    const s = styleFor(node.depth);
    const m = measure(node.text, node.depth);
    const p = padding(node.depth);
    const stack = s.family === 'display' ? EXPORT_DISPLAY_STACK : EXPORT_TEXT_STACK;

    const top = node.y - m.h / 2;
    const lineH = s.size * s.lineHeight;
    parts.push(
      `<text font-family="${stack}" font-size="${s.size}" font-weight="${s.weight}" ` +
        `letter-spacing="${(s.tracking * s.size).toFixed(2)}" text-anchor="middle" fill="rgba(${INK_RGB}, ${s.ink})">`,
    );
    m.lines.forEach((line, i) => {
      parts.push(
        `<tspan x="${round(node.x)}" y="${round(top + lineH * i + s.size * 0.78)}">${esc(line)}</tspan>`,
      );
    });
    parts.push(`</text>`);

    const conviction = node.attrs.conviction;
    if (conviction) {
      parts.push(
        `<circle cx="${round(node.x + m.w / 2 + p.x * 0.42)}" cy="${round(node.y - m.h / 2 - 1)}" r="3" ` +
          `fill="rgba(${CONVICTION_RGB[conviction]}, ${CONVICTION_ALPHA[conviction]})"/>`,
      );
    }
    if (node.note.trim()) {
      parts.push(
        `<rect x="${round(node.x - 7)}" y="${round(node.y + m.h / 2 + 5)}" width="14" height="2" rx="1" ` +
          `fill="rgba(${lavaFor(pigmentOf(board, node.id), node.depth).rgb}, 0.7)"/>`,
      );
    }
  }

  parts.push(`</svg>`);
  return parts.join('');
}

const round = (n: number) => Math.round(n * 10) / 10;

export async function exportSVG(board: Board, opts: SvgOptions = {}) {
  const fontCss = await embeddedFontCss();
  const blob = new Blob([boardToSVG(board, { ...opts, fontCss })], { type: 'image/svg+xml' });
  downloadBlob(blob, `field-${stamp()}.svg`);
}

/** Rasterises the same SVG. `scale` 2 gives a retina-grade file. */
export async function exportPNG(board: Board, opts: SvgOptions = {}, scale = 2, name = 'field') {
  const svg = boardToSVG(board, { ...opts, fontCss: await embeddedFontCss() });
  const rect = opts.rect ?? (() => {
    const b = boardBounds(board);
    return { x: b.x - 90, y: b.y - 90, w: b.w + 180, h: b.h + 180 };
  })();

  const maxSide = 12000;
  const safeScale = Math.min(scale, maxSide / Math.max(rect.w, rect.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.w * safeScale);
  canvas.height = Math.round(rect.h * safeScale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = new Image();
  img.decoding = 'sync';
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not rasterise the map'));
    img.src = url;
  });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob) downloadBlob(blob, `${name}-${stamp()}.png`);
}
