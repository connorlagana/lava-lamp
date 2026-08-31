import type { Accent, Conviction } from '../model/types';

/**
 * Materials, not brand colours. Everything here is meant to read as a wash on
 * paper rather than as a fill.
 */

export const PAPER = '#FAF9F6';
export const INK = '#1B1A17';
export const INK_RGB = '27, 26, 23';

export const ACCENT_RGB: Record<Accent, string> = {
  none: INK_RGB,
  sage: '124, 138, 110',
  clay: '176, 130, 104',
  ember: '194, 102, 47',
  ochre: '194, 166, 90',
  avocado: '138, 139, 74',
  teal: '110, 148, 144',
  umber: '122, 95, 75',
};

export const ACCENT_LABEL: Record<Accent, string> = {
  none: 'None',
  sage: 'Sage',
  clay: 'Clay',
  ember: 'Burnt orange',
  ochre: 'Dusty yellow',
  avocado: 'Muted avocado',
  teal: 'Soft teal',
  umber: 'Warm brown',
};

export const CONVICTION_RGB: Record<Conviction, string> = {
  curious: '27, 26, 23',
  researching: '110, 148, 144',
  promising: '194, 166, 90',
  high: '194, 102, 47',
  rejected: '27, 26, 23',
};

export const CONVICTION_ALPHA: Record<Conviction, number> = {
  curious: 0.18,
  researching: 0.55,
  promising: 0.68,
  high: 0.82,
  rejected: 0.12,
};
