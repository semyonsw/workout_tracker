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

/* ══════════════════════════════════════════════════════════════════════════
   LIQUID GLASS — the layer the redesign added on top of everything above.

   Nothing below changes a colour. The palette, the hue rule and the type scale
   are untouched; what is new is DEPTH — the surfaces stopped being flat alpha
   over a flat page and became panes with light under them.

   The one thing the old glass was missing: the section glow sat BEHIND a
   surface with nothing to transmit, so a card over it read as a slightly
   lighter black. The lamps are layer 1, the glass is layer 2, and the glass is
   translucent enough to carry the lamp through it. That is the whole change,
   and every token below serves it.

   Six layers, bottom to top:
     0  page      #060807
     1  lamps     radial green, decorative, breathing            `LAMPS`
     2  content   cards, rows, tiles                             `glassTier`
     3  floating  one action per section, its own glow           `halo.floating`
     4  bars      top bar and nav pill, content scrolls under    `glassTier.bar`
     5  sheets    focus mode, keypad, confirmations
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A glass tier — one tint, one blur, one border, one specular edge. FOUR of
 * them, and there is deliberately no way to ask for a fifth: a surface that
 * needs its own alpha is a surface that has stopped belonging to the system.
 *
 * `blur` is an `expo-blur` INTENSITY. On Android that library divides it by
 * `blurReductionFactor`, and `components/glass.tsx` passes 1 — so these are the
 * design's own px blur radii, one for one, which is the most defensible mapping
 * available without a device to calibrate against. What must hold either way is
 * the ORDER: `well` < `card` < `lit` < `bar`.
 *
 * SATURATION HAS NO PROP. The design's `saturate(140–170%)` is what keeps the
 * glass dark and moody rather than milky, and `BlurView` cannot do it. The
 * compensation is to push the tint greener on the two tiers that carried the
 * most saturation — which is why `lit` is a green tint rather than an ink one,
 * and why `bar` is tinted with `surface` (#0E1211, the page's own green cast)
 * instead of with black.
 */
export interface GlassTier {
  /** Overlaid on the blur, as a plain `View`. */
  tint: string;
  /** `expo-blur` intensity, 0–100. */
  blur: number;
  /** The 1px edge that holds the pane. */
  border: string;
  /** The 1px lit line along the top edge, or null for a tier without one. */
  specular: string | null;
}

export const glassTier: Record<'well' | 'card' | 'lit' | 'bar', GlassTier> = {
  /** A well inside a card — present, but not a pane of its own. */
  well: {
    tint: 'rgba(236,241,238,0.028)',
    blur: 14,
    border: 'rgba(236,241,238,0.045)',
    specular: null,
  },
  /** The default raised pane: cards, rows, tiles, keypad keys. */
  card: {
    tint: 'rgba(236,241,238,0.055)',
    blur: 20,
    border: 'rgba(236,241,238,0.06)',
    specular: 'rgba(236,241,238,0.10)',
  },
  /** A pane that is currently the answer — the hero, a done task, a lit tile. */
  lit: {
    tint: 'rgba(63,169,108,0.13)',
    blur: 24,
    border: 'rgba(63,169,108,0.30)',
    specular: 'rgba(236,241,238,0.14)',
  },
  /** The two bars. The heaviest blur in the app, because content moves under it. */
  bar: {
    tint: 'rgba(14,18,17,0.58)',
    blur: 34,
    border: 'rgba(236,241,238,0.075)',
    specular: 'rgba(236,241,238,0.12)',
  },
} as const;

/** The floating action's own edge — the one element with a heavier specular. */
export const specularHeavy = 'rgba(236,241,238,0.22)';

/**
 * THREE GLOW STEPS, and the rule for choosing between them is a COUNT rather
 * than an importance: how many of these can be on one screen at once.
 *
 *   repeating   many — done tasks, lit chips, the sequence's active step
 *   single      EXACTLY ONE per screen — the up-next set's ring
 *   floating    the floating action, and nothing else
 *
 * All three are `boxShadow` and never `elevation`. Android's `elevation` draws
 * its own opaque, much wider shadow that ignores both the colour and the radius
 * asked for — which is how the old repeating glow got thick enough to need
 * fixing in the first place.
 */
export const halo = {
  repeating: [{ offsetX: 0, offsetY: 0, blurRadius: 16, color: 'rgba(63,169,108,0.28)' }],
  single: [{ offsetX: 0, offsetY: 0, blurRadius: 20, color: 'rgba(63,169,108,0.60)' }],
  floating: [{ offsetX: 0, offsetY: 0, blurRadius: 44, color: 'rgba(63,169,108,0.50)' }],
  /** The soft bloom a hero card carries under its shadow. Not a halo step. */
  hero: [{ offsetX: 0, offsetY: 0, blurRadius: 30, color: 'rgba(63,169,108,0.18)' }],
} as const;

/**
 * THE SHADOW UNDER THE GLASS — three steps, black only.
 *
 * The app used to have exactly one shadow, under the timer pill, and the
 * comment above `timerShadow` is still right about why that suited an app of
 * flat surfaces. Glass changes the argument: a pane is a pane because something
 * is behind it, and a shadow is the cheapest statement of how far behind.
 *
 * `boxShadow` again, for the same reason as the halos — and these are the only
 * three depths, so a card cannot invent a fourth distance from the page.
 */
export const elevation = {
  /** Cards, rows, tiles. */
  e1: [{ offsetX: 0, offsetY: 8, blurRadius: 20, color: 'rgba(0,0,0,0.35)' }],
  /** Hero cards and floating elements. */
  e2: [{ offsetX: 0, offsetY: 14, blurRadius: 34, color: 'rgba(0,0,0,0.50)' }],
  /** The rest clock, and nothing else. */
  e3: [{ offsetX: 0, offsetY: 18, blurRadius: 44, color: 'rgba(0,0,0,0.60)' }],
} as const;

/**
 * RADIUS — one step softer than the flat design, because a blurred pane with a
 * tight corner reads as a cut-out rather than as glass.
 *
 * These live here as NUMBERS as well as in `tailwind.config.js` because a
 * `BlurView` has to be told its corner in `style` — NativeWind's transform does
 * not reach a native component — and a radius that disagreed between the
 * clipper and the blur inside it is a hairline of unblurred page along the edge.
 */
export const radius = {
  cell: 10, // a calendar square
  row: 18, // a row, a chip container, a keypad key
  card: 20, // a card with contents of its own
  hero: 24, // a hero, a sheet, an instrument
  navPill: 26, // the nav pill, and only it
  pill: 9999,
} as const;

/**
 * FOUR FOCAL TYPE STEPS, and the rule that makes them work: ONE HERO PER
 * SCREEN, and nothing else on that screen comes near its size.
 *
 * They are here rather than in `tailwind.config.js` because every one of them
 * is a NUMBER a screen has to reason about — the day dial measures itself
 * against the ring it sits in, the amount shrinks to fit its own width. A
 * className cannot be measured.
 *
 * The fifth step the design names — focus mode's 112 — is not here on purpose:
 * `lib/focusType.ts` already measures that one per screen, and a fixed value
 * beside it would be a second opinion about the same numerals.
 */
export const focalType = {
  /** Today's routine name on the workout hero. */
  heroName: { fontSize: 30, lineHeight: 34, letterSpacing: -0.9 },
  /** The all-time balance. */
  balance: { fontSize: 52, lineHeight: 54, letterSpacing: -2 },
  /** The keypad's amount. */
  amount: { fontSize: 60, lineHeight: 62, letterSpacing: -2.4 },
  /** The day number inside the tasks dial. Was 44. */
  dayDial: { fontSize: 64, lineHeight: 64, letterSpacing: -2.4 },
} as const;

/**
 * THE TEXT GLOWS. `textShadow` is native on both platforms, so unlike the box
 * halos these need no workaround — but they still belong here, because the
 * numerals that carry them live in three different screens and a bloom that
 * drifted apart between them would read as two different lights.
 */
export const textGlow = {
  /** The day number, the balance. */
  hero: {
    textShadowColor: 'rgba(63,169,108,0.32)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  /** The up-next set's numbers. */
  live: {
    textShadowColor: 'rgba(63,169,108,0.60)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
} as const;

/**
 * THE LAMPS — layer 1, per section.
 *
 * Two or three radial greens on the page, one of them anchored behind whatever
 * that section's hero is. They carry NO information: a build that dropped this
 * table entirely would lose atmosphere and not one fact, which is the condition
 * on which decoration is allowed to exist in this app at all.
 *
 * `x` is a fraction of the width and `y` is in dp from the top, because a lamp
 * behind the tasks dial has to stay behind the dial on a tall phone rather than
 * sliding down with a percentage.
 */
export interface LampSpec {
  /** 0–1 across the width. */
  x: number;
  /** dp from the top. */
  y: number;
  /** Radius in dp. */
  r: number;
  /** Peak opacity at the centre. */
  a: number;
  /** `dim` is the darker green, for the lamps furthest from the hero. */
  hue?: 'bright' | 'dim';
}

export const LAMPS: Record<string, readonly LampSpec[]> = {
  Workout: [
    { x: 0.4, y: 250, r: 200, a: 0.17 },
    { x: 0.98, y: 560, r: 170, a: 0.11, hue: 'dim' },
  ],
  Tasks: [
    { x: 0.5, y: 240, r: 210, a: 0.2 },
    { x: 0.08, y: 90, r: 150, a: 0.12 },
    { x: 0.96, y: 620, r: 180, a: 0.11, hue: 'dim' },
  ],
  Expenses: [
    { x: 0.46, y: 210, r: 200, a: 0.18 },
    { x: 0.04, y: 420, r: 160, a: 0.1, hue: 'dim' },
  ],
  Settings: [
    { x: 0.12, y: 120, r: 180, a: 0.12 },
    { x: 0.92, y: 500, r: 180, a: 0.09, hue: 'dim' },
  ],
  /** Focus mode's single lamp, behind the numbers. */
  Focus: [{ x: 0.3, y: 370, r: 260, a: 0.16 }],
  /** The session screen: one behind the rest clock, one low on the right. */
  Session: [
    { x: 0.5, y: 200, r: 200, a: 0.14 },
    { x: 0.95, y: 600, r: 170, a: 0.1, hue: 'dim' },
  ],
};

/**
 * THE FLOATING SLOT — identical coordinates in every section, which is the
 * whole of placement rule 2 and half the reason the redesign exists.
 *
 * `right: 16, bottom: 92` puts one commit action in the thumb's arc on every
 * screen that has one, and the top-right corner keeps navigation only. On an
 * 800 dp phone a `Save` in that corner is ~620 dp of diagonal travel from a
 * right thumb, and the app was asking for that trip forty times a session.
 *
 * `bottom` clears the nav pill (64 tall at inset 12) with 16 of air.
 */
export const floatingSlot = { right: 16, bottom: 92, height: 60, paddingH: 24 } as const;

/**
 * What a scroll must clear so the two translucent bars never hide a row.
 *
 * Content scrolls visibly UNDER both bars — that is the single clearest read on
 * whether the glass is working — so this padding is the only thing keeping the
 * first and last rows reachable. `bottom` is the nav pill (64), its inset (12),
 * and the floating action's clearance.
 */
export const barInset = { top: 64, bottom: 178 } as const;
