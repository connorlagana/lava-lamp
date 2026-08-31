import type { Board, ID, Rect } from '../model/types';
import { emptyAttrs } from '../model/types';
import { boardBounds, boxOf, recomputeDepths } from '../model/graph';
import { associationGeometry, branchGeometry } from '../canvas/geometry';
import { measure, padding, styleFor, EXPORT_FONT_STACK } from '../canvas/typography';
import { ACCENT_RGB, CONVICTION_ALPHA, CONVICTION_RGB, INK_RGB, PAPER } from '../canvas/palette';
import { uid } from '../lib/id';

/**
 * Import / export.
 *
 * The JSON is the storage format verbatim, so a file you export today can be
 * read by a sync service tomorrow without translation.
 *
 * Images are produced by re-drawing the board as SVG rather than by scraping
 * the DOM. It costs a second renderer, and it buys resolution independence,
 * off-screen nodes, and a real vector export.
 */

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

  // The soft field behind an accented thought is a gradient on the canvas, so
  // it is a gradient here too. A flat ellipse would read as a badge.
  const usedAccents = new Set(
    Object.values(board.nodes).filter((n) => include(n.id) && n.accent !== 'none').map((n) => n.accent),
  );
  if (usedAccents.size) {
    parts.push('<defs>');
    for (const accent of usedAccents) {
      const rgb = ACCENT_RGB[accent];
      parts.push(
        `<radialGradient id="wash-${accent}">` +
          `<stop offset="0" stop-color="rgb(${rgb})" stop-opacity="0.15"/>` +
          `<stop offset="0.58" stop-color="rgb(${rgb})" stop-opacity="0.05"/>` +
          `<stop offset="0.82" stop-color="rgb(${rgb})" stop-opacity="0"/>` +
          `</radialGradient>`,
      );
    }
    parts.push('</defs>');
  }
  parts.push(`<g fill="none" stroke-linecap="round">`);

  // branches
  for (const node of Object.values(board.nodes)) {
    if (!node.parentId || !board.nodes[node.parentId]) continue;
    if (!include(node.id) || !include(node.parentId)) continue;
    const g = branchGeometry(board, node.parentId, node.id);
    if (!g) continue;
    const alpha = 0.2 - Math.min(node.depth, 4) * 0.018;
    parts.push(`<path d="${g.d}" stroke="rgba(${INK_RGB}, ${alpha.toFixed(3)})" stroke-width="1.1"/>`);
  }
  // associations
  for (const link of Object.values(board.links)) {
    if (!include(link.source) || !include(link.target)) continue;
    const g = associationGeometry(board, link.source, link.target);
    if (!g) continue;
    parts.push(
      `<path d="${g.d}" stroke="rgba(${INK_RGB}, 0.22)" stroke-width="1" stroke-dasharray="1.5 4.5"/>`,
    );
    if (link.label) {
      parts.push(
        `<text x="${round(g.mid.x)}" y="${round(g.mid.y)}" font-family='${EXPORT_FONT_STACK}' font-size="9.5" ` +
          `letter-spacing="0.08em" text-anchor="middle" dominant-baseline="middle" ` +
          `fill="rgba(${INK_RGB}, 0.42)" stroke="${PAPER}" stroke-width="5" paint-order="stroke">${esc(link.label)}</text>`,
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
    const box = boxOf(node);

    if (node.accent !== 'none') {
      parts.push(
        `<ellipse cx="${round(node.x)}" cy="${round(node.y)}" rx="${round(box.w / 2)}" ry="${round(box.h / 2)}" ` +
          `fill="url(#wash-${node.accent})"/>`,
      );
    }

    const top = node.y - m.h / 2;
    const lineH = s.size * s.lineHeight;
    parts.push(
      `<text font-family='${EXPORT_FONT_STACK}' font-size="${s.size}" font-weight="${s.weight}" ` +
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
        `<circle cx="${round(node.x + m.w / 2 + p.x * 0.42)}" cy="${round(node.y - m.h / 2 - 1)}" r="2.6" ` +
          `fill="rgba(${CONVICTION_RGB[conviction]}, ${CONVICTION_ALPHA[conviction]})"/>`,
      );
    }
    if (node.note.trim()) {
      parts.push(
        `<rect x="${round(node.x - 6)}" y="${round(node.y + m.h / 2 + 5)}" width="12" height="1" ` +
          `fill="rgba(${INK_RGB}, 0.2)"/>`,
      );
    }
  }

  parts.push(`</svg>`);
  return parts.join('');
}

const round = (n: number) => Math.round(n * 10) / 10;

export function exportSVG(board: Board, opts?: SvgOptions) {
  const blob = new Blob([boardToSVG(board, opts)], { type: 'image/svg+xml' });
  downloadBlob(blob, `field-${stamp()}.svg`);
}

/** Rasterises the same SVG. `scale` 2 gives a retina-grade file. */
export async function exportPNG(board: Board, opts: SvgOptions = {}, scale = 2, name = 'field') {
  const svg = boardToSVG(board, opts);
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
