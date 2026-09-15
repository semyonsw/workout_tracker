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

/**
 * GLASS — the raised translucent surfaces the sections are built from.
 *
 * The redesign stopped drawing cards as opaque `surface` steps and started
 * drawing them as light lying ON the page: a few percent of ink over the
 * near-black, with the same hairline holding the edge. A card is then legible
 * over the two green glows the sections carry without punching a black hole in
 * them.
 *
 * FLAT ALPHA, NOT A GRADIENT. The design draws each surface as a 180° ramp from
 * 5% to 1.2%; React Native has no gradient without a native module, and adding
 * a third one (`expo-linear-gradient`) to a build whose whole risk budget is two
 * config plugins buys about four percent of alpha. These are the ramps' midpoints,
 * and every surface is one value — which also means `bg-ink/5` in a className is
 * the same decision as `glass.raised` here.
 */
export const glass = {
  /** Cards, rows, tiles — the default raised surface. */
  raised: 'rgba(236,241,238,0.05)',
  /** Chips, wells and the second step down: present, but not a card. */
  sunken: 'rgba(236,241,238,0.03)',
  /** A dashed "add one" target — barely there until you look for it. */
  ghost: 'rgba(236,241,238,0.015)',
  /** The lit version: a surface that is currently the answer. */
  green: 'rgba(63,169,108,0.12)',
  /** Its edge. The hairline is invisible against a green fill. */
  greenEdge: 'rgba(63,169,108,0.32)',
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
   * 132, and it has grown twice for the same reason: the numerals inside it are the
   * thing you read from across the room while the phone lies on a bench. It was 54
   * in the spec, then 92, and it is now the height a clock at 84 pt needs with its
   * label and its controls stacked under it.
   *
   * A MINIMUM rather than a fixed height now (see `TimerPill`), because the pill
   * stopped being one row: the clock owns the top of it and the controls sit
   * underneath, so the content decides the height and this is the floor that keeps
   * a short pill from looking like a different instrument.
   */
  timer: 132,
  /**
   * Bottom tab bar — exists only outside a session. 56 of row inside a 6/4
   * frame: the tab that is active is a pane now rather than a word, and a pane
   * needs the padding around it to read as one.
   */
  tabBar: 56,
} as const;

/**
 * THE FOUR STEPS OF FILL a month grid is drawn in, lightest first.
 *
 * `green-bright` at four alphas rather than four colours: it is one hue at four
 * distances, which is what makes a grid of them read as a scale instead of as a
 * legend you have to learn. They live here rather than in the screen because the
 * legend under that grid draws the same four, and a scale whose key disagrees
 * with the squares is worse than no key at all.
 */
export const greenSteps = [
  'rgba(63,169,108,0.24)',
  'rgba(63,169,108,0.42)',
  'rgba(63,169,108,0.60)',
  'rgba(63,169,108,0.82)',
] as const;

/**
 * The one GLOW, and the only thing in the app that is not a hairline or a surface
 * step doing the job of elevation.
 *
 * `green-bright` spread behind two marks and no others: the current exercise's card
 * while it is shut, and the row of the set that should happen next. Both marks are
 * complete without it — a `green-bright` border and `green-bright` numerals carry
 * the meaning — so a renderer that drops `boxShadow` loses gloss and not
 * information. That is the condition on which it is allowed to exist.
 *
 * IT USED TO BE 0.34 AND IT WAS TOO POLITE. At a third alpha the halo is something
 * you notice on a desk and not on a bench: the phone is a metre away, face-up,
 * under gym lighting, and the whole job of this value is to make one row findable
 * without reading it. 0.6 is still translucent — it never becomes a fill, and the
 * numerals under it stay legible — but it reads as a lit row rather than a slightly
 * softer edge.
 *
 * Still ONE value. The ring, the card and the numerals all use it; only the blur
 * radius differs, because a 2 dp outline and a 30 dp numeral need different spreads
 * to bloom by the same amount.
 */
export const glow = 'rgba(63,169,108,0.6)';

/**
 * THE SAME GLOW, FOR A MARK THAT REPEATS.
 *
 * `glow` is sized for exactly one card on a screen: at 0.6 and 18 dp of blur it
 * is findable from a metre away, which is the whole point on a bench. Nine done
 * tasks in a column at that value is nine halos overlapping into a green wall —
 * a row's own edge stops being a line you can see, and the list reads as lit
 * rather than as a list of which rows are lit.
 *
 * So a repeating mark gets this instead: half the alpha and half the spread, a
 * thin line of light along the border rather than a bloom around the whole row.
 * The rule for choosing is not "how important is this" but "how MANY of these
 * can be on screen at once" — one, `glow`; a column of them, this.
 *
 * Both are `boxShadow` and never `elevation`. Android's elevation draws its own
 * opaque, much wider shadow that ignores the radius asked for, which is exactly
 * how this got thick enough to need fixing.
 */
export const glowRepeating = 'rgba(63,169,108,0.3)';

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

/**
 * The halo behind a focus-mode numeral.
 *
 * The app's one glow, at a wider radius than `SetRow`'s 16: these numerals are
 * twice the size and more, and a bloom that does not grow with the glyph reads as
 * a sharper edge rather than a lit one. A token rather than a constant in a
 * component because two of them now draw glowing numerals — the clock's get-ready
 * count and the working numbers — and a glow that drifted apart between them
 * would be two different lights on one screen.
 */
export const focusGlow = {
  textShadowColor: glow,
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 26,
} as const;
