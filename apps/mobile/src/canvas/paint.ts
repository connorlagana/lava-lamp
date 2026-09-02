import {
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  type SkCanvas,
  type SkFont,
  type SkPaint,
} from '@shopify/react-native-skia';
import {
  ACCENT_PARTNER,
  ACCENT_RGB,
  BLOB_MAX,
  CONVICTION_ALPHA,
  CONVICTION_RGB,
  INK_RGB,
  PAPER,
  associationGeometry,
  boxOf,
  branchGeometry,
  fieldPad,
  hasAttrs,
  lavaFor,
  measure,
  padding,
  pigmentOf,
  rectsIntersect,
  styleFor,
  waxFor,
  type Board,
  type GraphIndex,
  type ID,
  type Rect,
  type Thought,
} from '@field/core';
import { fontFor, scaledFont } from '../fonts';
import { blobPath } from './skiaBlob';

/**
 * The board, drawn.
 *
 * The web app hands the DOM one element per thought and lets the compositor
 * own the rest. There is no compositor here, so this file draws the whole
 * board itself — which turns out to suit it, because the shapes were never
 * really DOM shapes: a rim is a curve, a branch is a curve, and the words are
 * glyphs on a baseline.
 *
 * Everything is drawn in world coordinates. The camera is a transform on the
 * group above it, so panning and zooming never come back through here.
 *
 * Work is split in two, along the same line the design already draws:
 *
 *   `paintStill`  everything that only changes when the board does — the words,
 *                 the marks, the settled branches and associations, and the
 *                 rims of every thought below a headline, which hold the shape
 *                 they were born with and so never need another frame.
 *
 *   `paintLive`   the headline rims, and the lines that land on them. Both are
 *                 re-recorded thirty times a second.
 *
 * The edges have to follow their rims into the live pass rather than staying
 * with the still one. A line ends *on* the rim rather than at the centre, so
 * drawing it once would pin it to an anchor the rim has since drifted away
 * from, and the join would visibly come apart.
 *
 * A board is mostly not headlines, so the per-frame cost is a handful of
 * curves rather than the whole map — and which handful is worked out by
 * `gatherEdges` when the board changes, never inside the frame loop.
 */

/** How far past the field box the rim can bulge. */
const SPILL = BLOB_MAX + 0.06;

const rgba = (rgb: string, alpha: number) => Skia.Color(`rgba(${rgb}, ${alpha})`);

function strokePaint(width: number, color: Float32Array): SkPaint {
  const p = Skia.Paint();
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(width);
  p.setStrokeJoin(StrokeJoin.Round);
  p.setAntiAlias(true);
  p.setColor(color);
  return p;
}

function fillPaint(color: Float32Array): SkPaint {
  const p = Skia.Paint();
  p.setStyle(PaintStyle.Fill);
  p.setAntiAlias(true);
  p.setColor(color);
  return p;
}

export interface PaintState {
  board: Board;
  index: GraphIndex;
  cull: Rect;
  /** Screen pixels per world unit. Strokes are divided by it so a line keeps
   *  one weight on screen at any zoom, as `non-scaling-stroke` does on the web. */
  zoom: number;
  selectedId: ID | null;
  editingId: ID | null;
  linkingFrom: ID | null;
  /** the thought under a finger, and how hard it is being thrown about */
  draggingId: ID | null;
  dragTension: number;
  /** an association whose label is being typed: its own label is hidden */
  editingLinkId: ID | null;
  focusSet: Set<ID> | null;
  clock: number;
}

/** A thought is dimmed to almost nothing when focus is on another branch. */
const dimOf = (s: PaintState, id: ID): number => (!s.focusSet || s.focusSet.has(id) ? 1 : 0.07);

/** Which thoughts are close enough to the view to be worth drawing. */
export function visibleNodes(s: PaintState): Thought[] {
  const out: Thought[] = [];
  for (const node of Object.values(s.board.nodes)) {
    if (rectsIntersect(boxOf(node), s.cull)) out.push(node);
  }
  return out;
}

// ------------------------------------------------------------------ the rim

/**
 * The wax outline of one thought.
 *
 * A rim is not one colour: it runs from the thought's own pigment into the one
 * it melts towards, top-left to bottom-right, the way a bead of wax catches
 * light on one shoulder and holds its own shadow on the other. On the web that
 * is a shared `<linearGradient>`; here it is a shader built per node, which is
 * cheap enough and saves carrying a definitions table around.
 */
function rimPaint(s: PaintState, node: Thought, box: { w: number; h: number }, x: number, y: number) {
  const pigment = pigmentOf(s.board, node.id);
  const lava = lavaFor(pigment, node.depth);
  const selected = s.selectedId === node.id;
  const target = s.linkingFrom !== null && s.linkingFrom !== node.id;
  const rejected = node.attrs.conviction === 'rejected';

  let alpha = selected ? 1 : target ? lava.ink * 0.6 : lava.ink;
  alpha *= dimOf(s, node.id);
  if (rejected) alpha *= 0.45;

  const width = (lava.rim * (selected ? 1.45 : 1)) / s.zoom;
  const paint = strokePaint(width, Skia.Color('black'));
  paint.setAlphaf(alpha);
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: x - box.w / 2 + box.w * 0.1, y: y - box.h / 2 },
      { x: x - box.w / 2 + box.w * 0.9, y: y + box.h / 2 },
      [
        Skia.Color(`rgb(${ACCENT_RGB[lava.primary]})`),
        Skia.Color(`rgb(${ACCENT_RGB[ACCENT_PARTNER[lava.primary]]})`),
      ],
      null,
      TileMode.Clamp,
    ),
  );
  return paint;
}

/** The rim's box: the field, grown by the room the widest bulge needs. */
function rimBox(node: Thought) {
  const m = measure(node.text, node.depth);
  const fp = fieldPad(m, padding(node.depth), node.depth);
  const rx = m.w / 2 + fp.x;
  const ry = m.h / 2 + fp.y;
  return { m, rx, ry, w: rx * 2 * SPILL, h: ry * 2 * SPILL };
}

function drawRim(canvas: SkCanvas, s: PaintState, node: Thought) {
  const { rx, ry, w, h } = rimBox(node);
  const wax = waxFor(node.id, node.depth);
  const path = blobPath(wax.a, wax.live ? s.clock : 0, node.x, node.y, rx, ry);
  canvas.drawPath(path, rimPaint(s, node, { w, h }, node.x, node.y));
}

// ----------------------------------------------------------------- the words

/**
 * One thought's text, centred on its own point.
 *
 * Drawn glyph by glyph rather than as a run, because the board's measure adds
 * the depth's tracking after every character and Skia has no letter-spacing of
 * its own. Placing each glyph is the only way the drawn line comes out the
 * width the layout was told it would be.
 */
function drawText(canvas: SkCanvas, s: PaintState, node: Thought) {
  if (s.editingId === node.id) return; // a real TextInput is over it
  const style = styleFor(node.depth);
  const font: SkFont | null = fontFor(node.depth);
  if (!font) return;

  const m = measure(node.text, node.depth);
  // An emptied thought keeps its place, quietly, until it is given words.
  const blank = !node.text.trim();
  let alpha = style.ink * dimOf(s, node.id);
  if (blank) alpha *= 0.3;
  if (node.attrs.conviction === 'rejected') alpha *= 0.5;

  // Fraunces has no italic axis and the browser synthesises the placeholder's
  // slant rather than loading one, so the same is done here: a shear on the
  // font, at the angle browsers have long used for a faux oblique.
  const face = blank ? scaledFont(node.depth, style.size) : font;
  if (!face) return;
  if (blank) face.setSkewX(-0.2125);

  const paint = fillPaint(rgba(INK_RGB, alpha));
  const lineHeight = style.size * style.lineHeight;
  const metrics = face.getMetrics();
  const top = node.y - m.h / 2;
  const track = style.tracking * style.size;

  m.lines.forEach((line, i) => {
    if (!line) return;
    const glyphs = face.getGlyphIDs(line);
    const widths = face.getGlyphWidths(glyphs);
    let run = 0;
    for (const w of widths) run += w;
    run += track * line.length;

    // Baseline: the line's box, less the descent, centred on the em.
    const baseline = top + i * lineHeight + (lineHeight - (metrics.descent - metrics.ascent)) / 2 - metrics.ascent;
    let pen = node.x - run / 2;
    const positions = glyphs.map((_, g) => {
      const at = { x: pen, y: baseline };
      pen += widths[g] + track;
      return at;
    });
    canvas.drawGlyphs(glyphs, positions, 0, 0, face, paint);
  });
}

// ----------------------------------------------------------------- the marks

/**
 * The two marks allowed onto the canvas, both tiny: a dot for conviction, and
 * a short rule under the words when there is a note to read.
 *
 * They sit side by side under the thought — a 6px dot, a 5px gap, a 14x2 bar —
 * and the pair is centred as a whole, so a thought carrying only one of them
 * still has it under the middle of its words. The web gets this from a flex
 * row; here the row is measured out by hand.
 */
const DOT = 6;
const BAR_W = 14;
const BAR_H = 2;
const MARK_GAP = 5;

function drawMarks(canvas: SkCanvas, s: PaintState, node: Thought) {
  const m = measure(node.text, node.depth);
  const dim = dimOf(s, node.id);
  const conviction = node.attrs.conviction ?? null;
  const noted = node.note.trim().length > 0 || hasAttrs(node.attrs);
  if (!conviction && !noted) return;

  const y = node.y + m.h / 2 + 5 + DOT / 2;
  const width =
    (conviction ? DOT : 0) + (noted ? BAR_W : 0) + (conviction && noted ? MARK_GAP : 0);
  let x = node.x - width / 2;

  if (conviction) {
    const colour = rgba(CONVICTION_RGB[conviction], CONVICTION_ALPHA[conviction] * dim);
    if (conviction === 'curious') {
      // Curious is the one that is not yet anything, so it is a ring rather
      // than a dot: an outline waiting to be filled in.
      const ring = strokePaint(1.5, colour);
      canvas.drawCircle(x + DOT / 2, y, DOT / 2 - 0.75, ring);
    } else {
      canvas.drawCircle(x + DOT / 2, y, DOT / 2, fillPaint(colour));
    }
    x += DOT + MARK_GAP;
  }

  if (noted) {
    // The bar takes the thought's own pigment, so a note reads as belonging to
    // the branch rather than as an annotation laid over it.
    const pigment = lavaFor(pigmentOf(s.board, node.id), node.depth).rgb;
    const bar = Skia.XYWHRect(x, y - BAR_H / 2, BAR_W, BAR_H);
    canvas.drawRRect(Skia.RRectXY(bar, BAR_H / 2, BAR_H / 2), fillPaint(rgba(pigment, 0.7 * dim)));
  }
}

/**
 * The type label — INDUSTRY, PROBLEM, CAREER — above the thought.
 *
 * On the web it appears under the cursor or on selection and is invisible the
 * rest of the time. There is no cursor here, so it follows the selection
 * alone: it is the same bargain, kept with the only sense a phone has.
 */
function drawKind(canvas: SkCanvas, s: PaintState, node: Thought) {
  if (!node.type || s.selectedId !== node.id) return;
  const font = fontFor(4);
  if (!font) return;

  const m = measure(node.text, node.depth);
  const text = node.type.replace('-', ' ').toUpperCase();
  const glyphs = font.getGlyphIDs(text);
  const widths = font.getGlyphWidths(glyphs);
  // 0.16em of tracking at 9.5px, which is what the stylesheet asks for.
  const track = 0.16 * 9.5;
  const scale = 9.5 / font.getSize();

  let run = 0;
  for (const w of widths) run += w * scale;
  run += track * text.length;

  let pen = node.x - run / 2;
  const y = node.y - m.h / 2 - 12;
  const positions = glyphs.map((_, i) => {
    const at = { x: pen, y };
    pen += widths[i] * scale + track;
    return at;
  });

  const pigment = lavaFor(pigmentOf(s.board, node.id), node.depth).rgb;
  const small = scaledFont(4, 9.5);
  if (!small) return;
  canvas.drawGlyphs(glyphs, positions, 0, 0, small, fillPaint(rgba(pigment, 0.75 * dimOf(s, node.id))));
}

// ----------------------------------------------------------------- the edges

/**
 * A branch is drawn in the wax of the thought it feeds, so a family reads as
 * one colour running down the page. It thickens near the top of the map and
 * thins as it runs out into the leaves — but never much lighter than the rim
 * it lands on, or the bubbles look pinned to threads.
 */
const BRANCH_WIDTH = [2.4, 2.2, 2, 1.8, 1.65];
const BRANCH_ALPHA = [0.95, 0.92, 0.88, 0.84, 0.8];

/**
 * Is this edge attached to something that is still moving?
 *
 * A line ends *on* the rim of the thought it touches, and the rims of the top
 * ranks are never still, so an edge with a live end has to be re-cut on the
 * same clock the bubble uses. Drawing it once and leaving it would pin the
 * line to an anchor the rim has since drifted away from, and the join would
 * visibly come apart.
 */
const edgeIsLive = (s: PaintState, a: ID, b: ID): boolean => {
  const na = s.board.nodes[a];
  const nb = s.board.nodes[b];
  return (
    (!!na && waxFor(na.id, na.depth).live) || (!!nb && waxFor(nb.id, nb.depth).live)
  );
};

/**
 * Which edges are worth drawing, and which of them are still moving.
 *
 * Gathered once when the board changes rather than once a frame. The live pass
 * runs thirty times a second, and walking every node and every link of a
 * thousand-thought map that often — to find the four that are breathing — is
 * the kind of work that does not show up until somebody's map gets big.
 */
export interface Edges {
  branches: { child: ID; parent: ID }[];
  links: ID[];
}

export function gatherEdges(s: PaintState, live: boolean): Edges {
  const branches: { child: ID; parent: ID }[] = [];
  const links: ID[] = [];

  for (const node of Object.values(s.board.nodes)) {
    if (!node.parentId) continue;
    const parent = s.board.nodes[node.parentId];
    if (!parent) continue;
    if (edgeIsLive(s, node.id, parent.id) !== live) continue;
    // An edge is worth drawing if either end is near the view.
    if (!rectsIntersect(boxOf(node), s.cull) && !rectsIntersect(boxOf(parent), s.cull)) continue;
    branches.push({ child: node.id, parent: node.parentId });
  }

  for (const link of Object.values(s.board.links)) {
    const a = s.board.nodes[link.source];
    const b = s.board.nodes[link.target];
    if (!a || !b) continue;
    if (edgeIsLive(s, link.source, link.target) !== live) continue;
    if (!rectsIntersect(boxOf(a), s.cull) && !rectsIntersect(boxOf(b), s.cull)) continue;
    links.push(link.id);
  }

  return { branches, links };
}

/** Every branch and association in `edges`, drawn once. */
function drawEdges(canvas: SkCanvas, s: PaintState, edges: Edges) {
  for (const { child, parent: parentId } of edges.branches) {
    const node = s.board.nodes[child];
    const parent = s.board.nodes[parentId];
    if (!node || !parent) continue;

    // A branch bows as the thought on its end is thrown about.
    const tension = s.draggingId === node.id || s.draggingId === parent.id ? s.dragTension : 0;
    const g = branchGeometry(s.board, parentId, node.id, tension, s.clock);
    if (!g) continue;
    const path = Skia.Path.MakeFromSVGString(g.d);
    if (!path) continue;

    const rank = Math.min(node.depth, 4);
    const alpha =
      BRANCH_ALPHA[rank] * Math.min(dimOf(s, node.id), dimOf(s, parentId));
    const pigment = lavaFor(pigmentOf(s.board, node.id), node.depth).rgb;
    const paint = strokePaint(BRANCH_WIDTH[rank] / s.zoom, rgba(pigment, alpha));
    paint.setStrokeCap(StrokeCap.Round);
    canvas.drawPath(path, paint);
  }

  for (const id of edges.links) {
    const link = s.board.links[id];
    if (!link) continue;
    const a = s.board.nodes[link.source];
    if (!a) continue;

    const g = associationGeometry(s.board, link.source, link.target, s.clock);
    if (!g) continue;
    const path = Skia.Path.MakeFromSVGString(g.d);
    if (!path) continue;

    const dim = Math.min(dimOf(s, link.source), dimOf(s, link.target));
    // An association takes its colour from where it starts.
    const pigment = lavaFor(pigmentOf(s.board, a.id), a.depth).rgb;
    const paint = strokePaint(1.9 / s.zoom, rgba(pigment, 0.85 * dim));
    paint.setStrokeCap(StrokeCap.Round);
    // Dotted, so it never reads as parentage.
    paint.setPathEffect(Skia.PathEffect.MakeDash([1.6 / s.zoom, 6 / s.zoom], 0));
    canvas.drawPath(path, paint);

    if (link.label && link.id !== s.editingLinkId) drawLinkLabel(canvas, s, link.label, g.mid, dim);
  }
}

/**
 * An association's label, sitting on the line it belongs to.
 *
 * Drawn twice: once thickly in the paper's own colour, then again in ink. The
 * first pass is what lets a label read over the dotted line running underneath
 * it without a box around it — the web does the same thing with `paint-order:
 * stroke`, which has no equivalent here beyond drawing it twice.
 */
function drawLinkLabel(
  canvas: SkCanvas,
  s: PaintState,
  label: string,
  mid: { x: number; y: number },
  dim: number,
) {
  // 10px, the size the stylesheet sets — not depth four's 13.5px, which would
  // draw the label half again too large and put the tracking on the wrong em.
  const font = scaledFont(4, 10);
  if (!font) return;
  const text = label.toUpperCase();
  const glyphs = font.getGlyphIDs(text);
  const widths = font.getGlyphWidths(glyphs);
  const track = 0.08 * 10;
  let run = 0;
  for (const w of widths) run += w;
  run += track * text.length;

  let pen = mid.x - run / 2;
  const positions = glyphs.map((_, i) => {
    const at = { x: pen, y: mid.y + 3.5 };
    pen += widths[i] + track;
    return at;
  });

  const halo = Skia.Paint();
  halo.setAntiAlias(true);
  halo.setStyle(PaintStyle.Stroke);
  halo.setStrokeWidth(5 / s.zoom);
  halo.setStrokeJoin(StrokeJoin.Round);
  halo.setColor(Skia.Color(PAPER));
  halo.setAlphaf(dim);
  canvas.drawGlyphs(glyphs, positions, 0, 0, font, halo);
  canvas.drawGlyphs(glyphs, positions, 0, 0, font, fillPaint(rgba(INK_RGB, 0.62 * dim)));
}

// --------------------------------------------------------------- the passes

/**
 * Everything that only changes when the board does: the settled edges, every
 * word, every mark, and the rims of thoughts below a headline — which hold the
 * shape they were born with, and so never need another frame.
 */
export function paintStill(canvas: SkCanvas, s: PaintState, nodes: Thought[], edges: Edges) {
  drawEdges(canvas, s, edges);
  for (const node of nodes) {
    if (!waxFor(node.id, node.depth).live) drawRim(canvas, s, node);
    drawText(canvas, s, node);
    drawMarks(canvas, s, node);
    drawKind(canvas, s, node);
  }
}

/**
 * The parts that are never still: the headline rims, and the edges that land
 * on them. Re-recorded on the lamp clock.
 *
 * The edges have to be here rather than above. A branch ends on the rim rather
 * than at the centre, so leaving it in the still pass would pin it to an
 * anchor the rim has since drifted away from and the join would come apart.
 */
export function paintLive(canvas: SkCanvas, s: PaintState, nodes: Thought[], edges: Edges) {
  drawEdges(canvas, s, edges);
  for (const node of nodes) {
    if (waxFor(node.id, node.depth).live) drawRim(canvas, s, node);
  }
}

/** Whether anything in view morphs at all — if not, the clock can stop. */
export const anyLive = (nodes: Thought[], edges: Edges): boolean =>
  edges.branches.length > 0 ||
  edges.links.length > 0 ||
  nodes.some((n) => waxFor(n.id, n.depth).live);
