/**
 * Design tokens — the single source of truth for the visual system.
 *
 * These mirror the CSS variables in `global.css`. Tailwind/NativeWind classes
 * are the primary styling API (type scale, spacing and colours all live in
 * `tailwind.config.js`); this file exists for the places className can't reach:
 * SVG fills and strokes, the timer's numerals, and the app's one shadow.
 *
 * Rules encoded here:
 *  - ONE hue. Near-black page, one green scale, nothing else. No red for
 *    destructive, no amber for warnings, no colour-coded categories.
 *  - Green-on-black TEXT is `greenBright` only; `green` fails contrast at small
 *    sizes and is for fills. Text on a `green` fill is `ink` at 600.
 *  - TWO radii (14 for surfaces, pill for the rest), both in `tailwind.config.js`.
 *  - Elevation is hairlines + surface steps. Exactly ONE real shadow exists,
 *    under the timer pill, and exactly ONE glow (`glow`), behind the two marks
 *    that say "this is the work". Neither carries meaning on its own.
 *  - Numbers are always tabular. A weight that shifts by a pixel when it goes
 *    from 9 to 10 reps is the difference between "app" and "instrument".
 */

export const palette = {
  bg: '#060807', // page — near-black with a faint green cast (OLED off-pixels)
  surface: '#0E1211', // cards, set rows
  surfaceAlt: '#141A18', // wells, the primed next set, inline editors, timer pill
  hairline: '#1E2523', // 1px separators — the only "border" in the app
  ink: '#ECF1EE', // primary text. never pure white
  inkMuted: '#8A968F', // secondary text
  inkFaint: '#57615C', // micro-labels, ghosted prefilled values
  greenWash: '#0C1A12', // tinted card background — overload nudge only
  greenDim: '#15452C', // progress tracks, timeline connectors, drop-target rules
  green: '#1E7A4C', // primary fills — completed set marks, primary buttons
  greenBright: '#3FA96C', // green text/icons on black, active timer, the nudge
  /** Scrim behind a bottom sheet. */
  scrim: 'rgba(6,8,7,0.78)',
} as const;

/** 4pt grid. Layout only ever uses these. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
} as const;

/** Fixed heights that carry meaning, not just measurement. */
export const size = {
  /** Minimum tap target. Nothing interactive in the logging flow goes below it. */
  hit: 44,
  /** Set rows and single-line list rows. */
  row: 56,
  /** Editor / library rows — two lines of text and still clear of the handle. */
  rowLarge: 64,
  /** Big numeric wells on the create-exercise screen. */
  well: 96,
  /**
   * The inner row of the timer pill.
   *
   * 92, not the spec's 54: the numerals inside it are the thing you read from
   * across the room while the phone lies on a bench, and at anything smaller the
   * row clips them.
   */
  timer: 92,
  /** Bottom tab bar — exists only outside a session. */
  tabBar: 64,
} as const;

/**
 * The one GLOW, and the only thing in the app that is not a hairline or a surface
 * step doing the job of elevation.
 *
 * `green-bright` at a third, spread behind two marks and no others: the current
 * exercise's card while it is shut, and the row of the set that should happen next.
 * Both marks are complete without it — a `green-bright` border and a `green-bright`
 * name carry the meaning — so a renderer that drops `boxShadow` loses gloss and not
 * information. That is the condition on which it is allowed to exist.
 */
export const glow = 'rgba(63,169,108,0.34)';

/**
 * The app's ONLY shadow. It belongs to the timer pill and nothing else — the
 * clock has to read as the layer above the list. Spec: `0 14px 36px rgba(0,0,0,0.65)`.
 */
export const timerShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 14 },
  shadowOpacity: 0.65,
  shadowRadius: 18,
  elevation: 16,
} as const;
