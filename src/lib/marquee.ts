/**
 * RUNNING TEXT — when a one-line label moves, and how far, and for how long.
 *
 * The rule the whole component exists to keep: A LABEL INSIDE A FIXED-SIZE
 * CONTROL NEVER RESIZES THE CONTROL. `Open Pull + swimming (tension on back)` is
 * wider than a 360 dp phone at 16/600, and the two answers the app had were both
 * wrong — an ellipsis hides the part of the name that tells two routines apart,
 * and a button that grows to fit is a button that moves under the thumb. So the
 * label keeps its box and SLIDES: it holds, eases left until its end is showing,
 * holds again, and eases back.
 *
 *   0%   ─ hold at 0 ─ 18% ─ ease to −d ─ 50% ─ hold ─ 66% ─ ease back ─ 96% ─ 100%
 *
 * The timings are the design's, and they are here rather than in the component
 * because they are numbers a test can hold still: a cycle that gets shorter as
 * the overflow grows would be a label that races on exactly the names that are
 * hardest to read.
 */

/** The right-edge fade, and the padding that lets the last glyph clear it. */
export const MARQUEE_FADE = 18;

/** Reading speed while the label is moving. */
export const MARQUEE_PX_PER_SECOND = 28;

/** Stillness before the first slide, so a screen arriving does not arrive moving. */
export const MARQUEE_DELAY_MS = 1200;

/** Never shorter than this — a four-pixel overflow still gets a readable pause. */
export const MARQUEE_MIN_CYCLE_MS = 5000;

/**
 * How far the text has to travel, in dp, or 0 for a label that fits.
 *
 * The fade is ADDED to the overflow: at the far end of the slide the last glyph
 * has to sit clear of the 18 dp fade, or the end of the name is exactly the part
 * that is faded out. The one-pixel slack is rounding — a label that measures
 * 200.4 in a 200 box is a label that fits.
 */
export function marqueeTravel(textWidth: number, boxWidth: number): number {
  if (!(boxWidth > 0) || !(textWidth > 0)) return 0;
  if (textWidth <= boxWidth + 1) return 0;
  return textWidth - boxWidth + MARQUEE_FADE;
}

export interface MarqueePhases {
  /** The whole loop. */
  cycleMs: number;
  /** Still at 0 before sliding left. */
  holdStartMs: number;
  /** Easing from 0 to −travel. */
  outMs: number;
  /** Still at −travel, the end of the name showing. */
  holdEndMs: number;
  /** Easing back to 0. */
  backMs: number;
  /** Still at 0 before the loop repeats. */
  restMs: number;
}

/**
 * The loop for a given travel: `max(5 s, travel / 28 px/s + 4 s)`, split at the
 * design's 18 / 50 / 66 / 96 percent marks.
 */
export function marqueePhases(travel: number, pxPerSecond = MARQUEE_PX_PER_SECOND): MarqueePhases {
  const cycleMs = Math.max(MARQUEE_MIN_CYCLE_MS, (travel / pxPerSecond) * 1000 + 4000);
  return {
    cycleMs,
    holdStartMs: cycleMs * 0.18,
    outMs: cycleMs * 0.32,
    holdEndMs: cycleMs * 0.16,
    backMs: cycleMs * 0.3,
    restMs: cycleMs * 0.04,
  };
}
