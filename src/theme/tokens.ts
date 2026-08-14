/**
 * Design tokens — the single source of truth for the visual system.
 *
 * These mirror the CSS variables in `global.css`. Tailwind/NativeWind classes
 * are the primary styling API; this file exists for the places className can't
 * reach: SVG fills and strokes, Reanimated interpolations, StatusBar, native
 * haptics, and the app's one shadow.
 *
 * Rules encoded here:
 *  - ONE hue. Near-black page, one green scale, nothing else. No red for
 *    destructive, no amber for warnings, no colour-coded categories.
 *  - Green-on-black TEXT is `greenBright` only; `green` fails contrast at small
 *    sizes and is for fills. Text on a `green` fill is `ink` at 600.
 *  - TWO radii (14 for surfaces, 999 for pills). No third option.
 *  - Elevation is hairlines + surface steps. Exactly ONE real shadow exists,
 *    under the floating rest timer.
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

export const radius = {
  surface: 14,
  pill: 999,
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
  /** The inner row of the floating rest timer. */
  timer: 54,
  /** Bottom tab bar — exists only outside a session. */
  tabBar: 64,
} as const;

export const typography = {
  /** The value being edited; big numeric wells. */
  display: { fontSize: 40, lineHeight: 44, letterSpacing: -1.2, fontWeight: '600' as const },
  /** Exercise names; set weights and reps. */
  title: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4, fontWeight: '500' as const },
  /** Collapsed headers, list rows, sheet copy. */
  body: { fontSize: 16, lineHeight: 22, letterSpacing: 0, fontWeight: '400' as const },
  /** Secondary lines, chip labels, dates. */
  label: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontWeight: '400' as const },
  /** Uppercase micro-labels: "SET", "KG", "REPS", section kickers. */
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 1.1, fontWeight: '600' as const },
  /**
   * On dark, drop one weight step versus a light UI: 500 / 600 only, never 700+.
   * A 700 on near-black blooms and reads heavier than it measures.
   */
  numeric: { fontVariant: ['tabular-nums' as const] },
} as const;

/** Timings tuned so the UI feels immediate but not twitchy. Nothing else moves. */
export const motion = {
  /** Row state changes: background, ink colour, circle fill. */
  fast: 140,
  /** Cards and sheets. */
  base: 240,
  easing: [0.22, 1, 0.36, 1] as const,
} as const;

/**
 * The app's ONLY shadow. It belongs to the floating rest timer and nothing else
 * — the pill has to read as hovering over the list it deliberately doesn't push.
 * Spec: `0 14px 36px rgba(0,0,0,0.65)`.
 */
export const timerShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 14 },
  shadowOpacity: 0.65,
  shadowRadius: 18,
  elevation: 16,
} as const;

/** Backwards-compatible alias — several components read the raw number. */
export const HIT_SIZE = size.hit;
