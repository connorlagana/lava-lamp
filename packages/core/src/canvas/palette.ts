import type { Accent, Conviction } from '../model/types';

/**
 * Lava on white paper.
 *
 * The wax colours are saturated, because they are read through low alpha and
 * a multiply blend — a muted pigment at 0.4 opacity on white is not a colour,
 * it is a smudge. The ink stays nearly black so words never fight the wax.
 *
 * Accent ids are kept exactly as they were so boards saved before the colour
 * came in still open; only the pigment behind each name has been remixed.
 */

export const PAPER = '#FAF9F6';
/** The same paper, for the times something has to be laid over it at part opacity. */
export const PAPER_RGB = '250, 249, 246';
export const INK = '#221F1C';
export const INK_RGB = '34, 31, 28';

export const ACCENT_RGB: Record<Accent, string> = {
  none: INK_RGB,
  sage: '104, 168, 112',
  clay: '226, 118, 88',
  ember: '243, 97, 44',
  ochre: '246, 176, 44',
  avocado: '166, 194, 54',
  teal: '38, 182, 170',
  umber: '176, 108, 62',
  grape: '141, 88, 208',
  fuchsia: '229, 74, 154',
};

export const ACCENT_LABEL: Record<Accent, string> = {
  none: 'Let the map choose',
  sage: 'Sage',
  clay: 'Clay',
  ember: 'Ember',
  ochre: 'Marigold',
  avocado: 'Avocado',
  teal: 'Turquoise',
  umber: 'Cocoa',
  grape: 'Grape',
  fuchsia: 'Fuchsia',
};

/**
 * Every blob is lit by two pigments, the way wax in a lamp is never one flat
 * colour.
 *
 * The partner is always a hue *neighbour*. Two colours from opposite sides of
 * the wheel multiply to mud — teal under grape comes out a dead navy — and mud
 * is the one thing a lava lamp never is. Neighbours multiply into a deeper,
 * hotter version of the same family, which is exactly what wax does.
 */
export const ACCENT_PARTNER: Record<Accent, Accent> = {
  none: 'ochre',
  ember: 'ochre',
  ochre: 'avocado',
  avocado: 'sage',
  sage: 'teal',
  teal: 'sage',
  grape: 'fuchsia',
  fuchsia: 'clay',
  clay: 'ember',
  umber: 'ember',
};

/** The ring an unaccented thought draws its own colour from. */
export const LAVA_RING: Accent[] = ['ember', 'ochre', 'avocado', 'teal', 'grape', 'fuchsia', 'clay', 'sage', 'umber'];

export const CONVICTION_RGB: Record<Conviction, string> = {
  curious: INK_RGB,
  researching: ACCENT_RGB.teal,
  promising: ACCENT_RGB.ochre,
  high: ACCENT_RGB.ember,
  rejected: INK_RGB,
};

export const CONVICTION_ALPHA: Record<Conviction, number> = {
  curious: 0.2,
  researching: 0.85,
  promising: 0.9,
  high: 0.95,
  rejected: 0.12,
};
