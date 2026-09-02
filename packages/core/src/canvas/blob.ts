/**
 * The outline of a blob of wax.
 *
 * A thought is drawn as a closed curve around its text, and that curve is
 * never quite still. The shape is a circle whose radius varies with the angle
 * you look at it from:
 *
 *     r(θ, t) = base + Σ  aⱼ · swellⱼ(t) · sin( mⱼθ + phaseⱼ + driftⱼ(t) )
 *
 * Three terms, with m = 2, 3 and 4 lobes around the perimeter. Because m is a
 * whole number the function closes on itself exactly, so there is no seam where
 * the curve comes back round to where it started.
 *
 * Two very slow clocks act on each term. `swell` breathes its amplitude in and
 * out over twelve to twenty-two seconds, so a lobe swells, flattens and swells
 * again; `drift` turns its phase over one to two minutes, so wherever the
 * bulges are they are always sliding gently around the rim. The two clocks run
 * at unrelated speeds for each of the three terms, so the sum never comes back
 * to a state it has been in — there is no loop point, and nothing to catch the
 * eye as a repeat.
 *
 * Everything is kept deliberately small. `base` sits a little above 1 and the
 * amplitudes add up to under a fifth of it, which holds the silhouette around
 * 80% round at any instant: a circle under changing pressure, never a star or
 * a splat. Drawn as a line rather than a wash, the same deformation reads far
 * more strongly — an edge you can see is an edge you can measure — so the
 * amplitudes here are smaller than a filled blob would want.
 *
 * Nothing rotates, nothing scales, nothing is regenerated. The centre and the
 * overall size are fixed for the life of the node; only the curvature moves.
 */

import { hash01, lerp } from '../lib/rand';
import { prefersReducedMotion } from '../config';

const TAU = Math.PI * 2;

/**
 * A power of two, so the wrap-around in the path loop is a mask.
 *
 * Sixty-four, not sixteen, because the lumps that make a bubble read as a
 * cloud run eight to a turn: eight samples a lobe is what it takes for the
 * curve drawn through them to still have the depth of the waists between.
 */
const POINTS = 64;
const WRAP = POINTS - 1;

/** Where the samples sit on the unit circle. */
const RING_C = new Float64Array(POINTS);
const RING_S = new Float64Array(POINTS);
for (let i = 0; i < POINTS; i++) {
  RING_C[i] = Math.cos((i / POINTS) * TAU);
  RING_S[i] = Math.sin((i / POINTS) * TAU);
}

/**
 * sin(mθ) and cos(mθ) at every sample, for the three lobe counts in play.
 * With these, a term's contribution is sin(mθ+ψ) = sin(mθ)cosψ + cos(mθ)sinψ —
 * two trig calls per term per frame instead of one per point.
 *
 * Five, seven and eight lobes. Low counts — two or three — only ever lean a
 * circle into an egg or an ellipse, which is a shape, not a blob, and the lean
 * is the first thing the eye reads. Keeping every term high leaves the bubble
 * round at a glance and puts all of the incident on its edge, which is where a
 * cloud keeps it.
 *
 * Seven against eight is the useful pair: near enough to beat slowly, so some
 * bulges swell while their neighbours flatten and no two lobes around a rim
 * are the same size. Five underneath keeps that beat from ever settling into
 * a pattern.
 */
const LOBES = [5, 7, 8] as const;
const HARM_S = LOBES.map((m) => Float64Array.from(RING_S, (_, i) => Math.sin(m * (i / POINTS) * TAU)));
const HARM_C = LOBES.map((m) => Float64Array.from(RING_C, (_, i) => Math.cos(m * (i / POINTS) * TAU)));

interface Mode {
  /** index into LOBES */
  h: number;
  /** peak radial deviation, as a fraction of the base radius */
  a: number;
  /** where this term's lobes sit at t = 0 */
  phase: number;
  /** seconds for the amplitude to swell and subside once */
  swell: number;
  swellPhase: number;
  /** seconds for the lobes to travel once round the rim; sign is the direction */
  drift: number;
}

export interface Shape {
  modes: Mode[];
  /** index into the precomputed superellipse tables */
  box: number;
  /** mean radius, in half-widths of the field box */
  base: number;
  /** a fixed lean off the centre of the words, so a map is not a grid of dots */
  cx: number;
  cy: number;
  /** seconds added to the clock, so no two blobs are ever at the same moment */
  offset: number;
  /** multiplies the clock; 0 holds the shape still for good */
  rate: number;
}

/**
 * Enough deformation to be unmistakable after a few seconds, little enough
 * that a glance reads the node as a circle.
 *
 * Measured over four hundred ids and two hundred seconds each: the thinnest
 * radius over the widest — how round the silhouette is — sits in the low
 * eighties, and on a headline rim 200px across the line travels a couple of
 * pixels in a second and something like twenty over ten.
 */
const AMPLITUDE = [0.052, 0.049, 0.043];
const BASE = 1.06;

/** The most any one term can lean on the radius, id to id. */
const JITTER = 1.22;

/** How far a bubble sits off the centre of its own words, either way. */
const LEAN = 0.05;

/**
 * How square the underlying shape is, before any lobes are laid over it.
 *
 * A superellipse: |x|ⁿ + |y|ⁿ = 1. At n = 2 it is exactly a circle, and as n
 * climbs it fills out toward a rounded rectangle. Headline ranks stay round,
 * because a cloud of lobes wants a circle underneath it; the lower ranks
 * straighten into the rounded box that short labels actually belong in, and
 * which stacks tidily beside its siblings.
 */
const SQUARENESS = [2, 2.1, 3, 3.2, 3.4];

const squircle = (n: number, theta: number) =>
  (Math.abs(Math.cos(theta)) ** n + Math.abs(Math.sin(theta)) ** n) ** (-1 / n);

/** That radius at every sample, one row per rank, so a frame does no powers. */
const SQUIRCLE = SQUARENESS.map((n) =>
  Float64Array.from({ length: POINTS }, (_, i) => squircle(n, (i / POINTS) * TAU)),
);

/**
 * How far the drawn curve may sit outside the radii it was sampled from.
 *
 * The path is a Catmull–Rom through the samples, and between two of them it
 * leans a little past both — inward through a waist, outward over a bulge. At
 * eight samples to a lobe that measured under two per cent; three is taken so
 * the bound is a bound and not an average.
 */
const SLACK = 0.03;

/**
 * The thinnest the rim can ever be drawn, as a fraction of the field box.
 *
 * `fieldPad` sizes the box against this so the line, at its narrowest moment
 * on its narrowest axis, still passes outside the words. It is derived rather
 * than written down: tune the amplitudes and the padding follows.
 */
export const BLOB_MIN = (BASE - AMPLITUDE.reduce((a, b) => a + b, 0) * JITTER) * (1 - SLACK);

/**
 * The most it can ever bulge, which is how much room the <svg> has to leave.
 * A squarer rank reaches further at its corners than at its axes, so the
 * roundest-cornered box in play sets the ceiling for all of them.
 */
export const BLOB_MAX =
  (BASE + AMPLITUDE.reduce((a, b) => a + b, 0) * JITTER) *
  (1 + SLACK) *
  Math.max(...SQUARENESS.map((n) => squircle(n, Math.PI / 4)));

/**
 * How far out to treat the rim as reaching, for anything that has to keep
 * clear of it — the space a neighbour is laid out at, the crop an export takes.
 *
 * Not the mean, which would let bubbles cut into each other whenever one
 * bulged, and not the absolute maximum either, which every lobe would have to
 * peak at once to reach and which would push the whole map apart to buy room
 * that is almost never used. Six tenths of the way out: neighbours touch now
 * and then, which for two blobs of wax is not a collision.
 */
export const BLOB_SPAN = BASE + (BLOB_MAX - BASE) * 0.6;

/**
 * How much lobe each rank carries, against the headline's share.
 *
 * The top two ranks are clouds. Below them the rim keeps only a trace — enough
 * that no two are quite the same outline, not enough to read as anything but a
 * smooth, still shape. The hierarchy is in how *disturbed* a bubble looks, and
 * that survives being still, which the deeper ranks are.
 */
const RELIEF = [1, 0.85, 0.3, 0.24, 0.2];

/**
 * How fast each rank of thought moves.
 *
 * A headline is the lamp. Beneath it the movement slows to a third, and from
 * the third rank down the outline simply holds the organic shape it was born
 * with. The hierarchy is in the motion, so it costs no extra chrome — and it
 * means the great majority of nodes on a large map never take a frame.
 */
const RATE = [1, 0.34, 0, 0, 0];

function shape(id: string, salt: number, rate: number, depth: number): Shape {
  const d = Math.min(Math.max(depth, 0), SQUARENESS.length - 1);
  return {
    base: BASE,
    box: d,
    // an unbounded head start: a blob that scrolls into view is already mid-life
    offset: hash01(id, salt + 1) * 900,
    rate,
    cx: (hash01(id, salt + 2) * 2 - 1) * LEAN,
    cy: (hash01(id, salt + 3) * 2 - 1) * LEAN,
    modes: LOBES.map((_, h) => ({
      h,
      a: AMPLITUDE[h] * RELIEF[d] * lerp(2 - JITTER, JITTER, hash01(id, salt + 10 + h)),
      phase: hash01(id, salt + 20 + h) * TAU,
      swell: lerp(12, 22, hash01(id, salt + 30 + h)),
      swellPhase: hash01(id, salt + 40 + h) * TAU,
      drift: (hash01(id, salt + 50 + h) < 0.5 ? -1 : 1) * lerp(48, 130, hash01(id, salt + 60 + h)),
    })),
  };
}

export interface Wax {
  /**
   * The one curve there is.
   *
   * A second, inner ring was tried and cut: on its own clock it crossed the
   * outer one, and two lines that touch read as a mistake rather than as the
   * wall of a bubble. The melt lives in the gradient along the rim instead —
   * one line, two pigments.
   */
  a: Shape;
  /** false when both outlines are fixed and the node needs no frames */
  live: boolean;
}

const cache = new Map<string, Wax>();

export function waxFor(id: string, depth: number): Wax {
  const key = `${id}|${depth}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rate = RATE[Math.min(Math.max(depth, 0), RATE.length - 1)];
  const out: Wax = { a: shape(id, 100, rate, depth), live: rate > 0 };
  if (cache.size > 3000) cache.clear();
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- the curve

const R = new Float64Array(POINTS);
const PX = new Float64Array(POINTS);
const PY = new Float64Array(POINTS);

function radii(s: Shape, t: number) {
  R.fill(s.base);
  for (const mo of s.modes) {
    const amp = mo.a * (0.55 + 0.45 * Math.sin((TAU * t) / mo.swell + mo.swellPhase));
    const psi = mo.phase + (TAU * t) / mo.drift;
    const kc = Math.cos(psi) * amp;
    const ks = Math.sin(psi) * amp;
    const hs = HARM_S[mo.h];
    const hc = HARM_C[mo.h];
    for (let i = 0; i < POINTS; i++) R[i] += hs[i] * kc + hc[i] * ks;
  }
  // The lobes ride on the underlying box rather than being added to it, so a
  // bulge stays the same fraction of the rim wherever it sits on the outline.
  const sq = SQUIRCLE[s.box];
  for (let i = 0; i < POINTS; i++) R[i] *= sq[i];
}

/**
 * The radius at one arbitrary angle, rather than at the sixteen samples.
 *
 * The drawn curve passes exactly through those samples and, being built from
 * three low harmonics, barely leaves the analytic function between them — so
 * this is where the rim is, to well under a pixel. It is what lets a branch
 * end on the line instead of somewhere near it.
 */
export function radiusAt(s: Shape, theta: number, clock: number): number {
  const t = s.offset + clock * s.rate;
  let r = s.base;
  for (const mo of s.modes) {
    const amp = mo.a * (0.55 + 0.45 * Math.sin((TAU * t) / mo.swell + mo.swellPhase));
    r += amp * Math.sin(LOBES[mo.h] * theta + mo.phase + (TAU * t) / mo.drift);
  }
  return r * squircle(SQUARENESS[s.box], theta);
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The sixteen samples, smoothed into one closed cubic path.
 *
 * Catmull–Rom through every point, converted segment by segment to a Bézier:
 * the curve passes through each sample and leaves it with the same tangent it
 * arrives with, so the outline is continuous in slope the whole way round. No
 * sample can become a corner, however the radii move.
 *
 * `clock` is seconds on the shared lamp clock; a shape whose rate is 0 ignores
 * it and always draws the same outline.
 */
/** How many samples `blobPoints` writes. */
export const BLOB_POINTS = POINTS;

/**
 * The outline as bare samples, for a renderer that builds its own curves.
 *
 * The browser wants a path string and Skia wants to be handed the points, but
 * neither wants a second copy of the maths. This does the work; `blobPath`
 * below is the string on top of it, and the phone reads the arrays directly.
 *
 * The returned arrays are reused between calls — copy them if you need to keep
 * them past the next call, which at thirty frames a second nobody does.
 */
export function blobPoints(
  s: Shape,
  clock: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { x: Float64Array; y: Float64Array; n: number } {
  radii(s, s.offset + clock * s.rate);
  const ox = cx + s.cx * rx;
  const oy = cy + s.cy * ry;
  for (let i = 0; i < POINTS; i++) {
    PX[i] = ox + rx * R[i] * RING_C[i];
    PY[i] = oy + ry * R[i] * RING_S[i];
  }
  return { x: PX, y: PY, n: POINTS };
}

export function blobPath(s: Shape, clock: number, cx: number, cy: number, rx: number, ry: number): string {
  blobPoints(s, clock, cx, cy, rx, ry);

  let d = `M${round(PX[0])} ${round(PY[0])}`;
  for (let i = 0; i < POINTS; i++) {
    const back = (i - 1) & WRAP;
    const next = (i + 1) & WRAP;
    const over = (i + 2) & WRAP;
    d +=
      `C${round(PX[i] + (PX[next] - PX[back]) / 6)} ${round(PY[i] + (PY[next] - PY[back]) / 6)} ` +
      `${round(PX[next] - (PX[over] - PX[i]) / 6)} ${round(PY[next] - (PY[over] - PY[i]) / 6)} ` +
      `${round(PX[next])} ${round(PY[next])}`;
  }
  return `${d}Z`;
}

// ----------------------------------------------------------------- the lamp

/**
 * One clock and one loop for every blob on the board.
 *
 * The clock is the page's own, never reset, so a node that scrolls off and
 * back returns to the shape it would have had if it had stayed. Frames are
 * spent at 30 a second: the rim moves a fraction of a pixel between them, and
 * halving the work matters more than resolution nobody can see.
 */
type Tick = (clock: number) => void;

const live = new Set<Tick>();
const FRAME = 1000 / 30;
let frame = 0;
let last = 0;

/**
 * Asked for no motion, the lamp does not merely stop — its clock reads zero for
 * good. Every blob then sits at its own offset and stays there, so a thought
 * scrolled off and back is the shape it was, and an exported file is the board
 * that was on screen. A stopped clock that still ticked once at mount would
 * quietly redraw every node at a different shape each time it appeared.
 */
const still = (): boolean => prefersReducedMotion();

function pulse(now: number) {
  frame = requestAnimationFrame(pulse);
  if (now - last < FRAME) return;
  last = now;
  const clock = now / 1000;
  for (const tick of live) tick(clock);
}

/** Seconds on the lamp clock, for a first paint that lands mid-motion. */
export const lampClock = () =>
  still() || typeof performance === 'undefined' ? 0 : performance.now() / 1000;

export function joinLamp(tick: Tick): () => void {
  if (still()) return () => undefined;
  live.add(tick);
  if (!frame) frame = requestAnimationFrame(pulse);
  return () => {
    live.delete(tick);
    if (!live.size && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}
