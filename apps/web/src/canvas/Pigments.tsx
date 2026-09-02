import { memo } from 'react';
import { type Accent, ACCENT_PARTNER, ACCENT_RGB } from '@field/core';

/**
 * Every pigment on the board, once.
 *
 * A rim is not one colour. It runs from the thought's own pigment into the one
 * it melts towards, top-left to bottom-right, the way a bead of wax catches
 * light on one shoulder and holds its own shadow on the other. Two hues in a
 * single unbroken line is what keeps the outline from reading as clip art.
 *
 * The pairs are hue neighbours (see ACCENT_PARTNER), so the sweep is a
 * deepening rather than a change of subject.
 *
 * One gradient per pigment, shared by every node wearing it — a hundred nodes
 * in the same colour reference one definition rather than carrying their own.
 */
function PigmentsImpl() {
  return (
    <svg className="pigments" aria-hidden focusable="false">
      <defs>
        {(Object.keys(ACCENT_RGB) as Accent[]).map((accent) => (
          <linearGradient key={accent} id={`rim-${accent}`} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor={`rgb(${ACCENT_RGB[accent]})`} />
            <stop offset="1" stopColor={`rgb(${ACCENT_RGB[ACCENT_PARTNER[accent]]})`} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

export const Pigments = memo(PigmentsImpl);
