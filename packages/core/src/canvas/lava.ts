import type { Accent } from '../model/types';
import { ACCENT_PARTNER, ACCENT_RGB, LAVA_RING } from './palette';
import { hash01 } from '../lib/rand';
import { BLOB_MIN } from './blob';

/**
 * What a bubble is drawn in, and how far off its words it stands.
 *
 * Two pigments and a weight, all derived from the thought's id, so a lamp is
 * lit the same colour every time it is opened. How the bubble *moves* is not
 * here — that is `blob.ts`, which owns the outline and its clock. This file
 * answers only what the line is made of and where there is room for it.
 */

export interface Lava {
  /** the wax */
  primary: Accent;
  /** the pigment its rim sweeps into */
  partner: Accent;
  rgb: string;
  /** how heavy the line is, in px at rest */
  rim: number;
  /** how dark it sits on the paper, 0..1 */
  ink: number;
}

/**
 * A branch nobody has coloured is not colourless — it takes a pigment off the
 * ring by id, so a map is in colour the moment it is made and stays that way
 * without anyone opening a picker. Which id gets asked is `pigmentOf`'s
 * business, in graph.ts, because only the board knows what a branch is.
 */
export function ringPigment(seed: string): Accent {
  return LAVA_RING[Math.floor(hash01(seed, 91) * LAVA_RING.length) % LAVA_RING.length];
}

/**
 * How far the rim stands off the words.
 *
 * A one-line thought measures wide and short, and a ring drawn to that box is
 * a highlighter smear. So the vertical reach is not a margin at all — it is
 * whatever it takes to bring the box to the proportion its rank wants.
 */
/**
 * What proportion of its own width each rank wants to stand tall, before the
 * cap. A headline aims square, because a ring of lobes only reads as a cloud
 * when it has a circle underneath it. Lower ranks aim well under square: they
 * carry almost no lobe, and a short label belongs in a rounded box.
 */
const AIM = [1, 0.94, 0.62, 0.58, 0.55];

/** However round it aims to be, it may not tower over the words this far. */
const CAP = [118, 88, 48, 42, 36];

/** Clear air between the letters and the line at its very closest. */
const BREATH = 10;

/**
 * The line dips inward as it morphs, and the box has to be wide enough that
 * its thinnest moment still passes outside the words — on both axes, for the
 * widest thing the measure allows. Deriving that floor from `BLOB_MIN` rather
 * than trusting the padding to be generous enough means the amplitudes in
 * blob.ts can be retuned without the rim quietly starting to cross a letter.
 */
const clear = (half: number) => (half + BREATH) / BLOB_MIN - half;

export function fieldPad(
  m: { w: number; h: number },
  p: { x: number; y: number },
  depth: number,
): { x: number; y: number } {
  const d = Math.min(Math.max(depth, 0), 4);
  const x = Math.max(p.x, clear(m.w / 2));
  const width = m.w + x * 2;
  // Reach for the height that would make the box the shape this rank wants,
  // then refuse to go past the cap, then refuse to go inside the words.
  const aim = (width * AIM[d] - m.h) / 2;
  const y = Math.max(Math.min(Math.max(p.y, aim), CAP[d]), clear(m.h / 2));
  return { x, y };
}

const cache = new Map<string, Lava>();

export function lavaFor(pigment: Accent, depth: number): Lava {
  const key = `${pigment}|${depth}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const primary = pigment === 'none' ? LAVA_RING[0] : pigment;
  const partner = ACCENT_PARTNER[primary];
  const out: Lava = {
    primary,
    partner,
    rgb: ACCENT_RGB[primary],
    // The rim is now the whole of the node, so hierarchy has to live in the
    // line itself: a headline is drawn heavier than the branch that feeds it,
    // a leaf no heavier than the thread it hangs from. Full strength at the
    // top — a pale outline reads as a draft, and none of these are drafts.
    rim: [4.6, 3.6, 2.5, 2.2, 2][Math.min(depth, 4)],
    ink: [1, 1, 0.95, 0.9, 0.86][Math.min(depth, 4)],
  };

  cache.set(key, out);
  return out;
}
