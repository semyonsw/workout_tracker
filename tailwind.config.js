/**
 * Tailwind / NativeWind configuration.
 *
 * The scale is deliberately amputated: no default colour palette, four radii,
 * five spacing steps, five type sizes. A design system you cannot deviate from
 * is what keeps a minimal app minimal six months in.
 *
 * Colour is near-black + one green scale. There is no second hue: no red for
 * destructive, no amber for warnings, no category chips. Green-on-black TEXT
 * is always `green-bright` (`green` fails contrast at small sizes); text on a
 * `green` fill is always `ink` at 600.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    // `colors` (not `extend.colors`) — the default Tailwind palette is removed
    // on purpose so `text-blue-500` simply doesn't exist.
    colors: {
      transparent: 'transparent',
      bg: 'rgb(var(--bg) / <alpha-value>)',
      surface: 'rgb(var(--surface) / <alpha-value>)',
      'surface-alt': 'rgb(var(--surface-alt) / <alpha-value>)',
      hairline: 'rgb(var(--hairline) / <alpha-value>)',
      ink: 'rgb(var(--ink) / <alpha-value>)',
      'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
      'ink-faint': 'rgb(var(--ink-faint) / <alpha-value>)',
      'green-wash': 'rgb(var(--green-wash) / <alpha-value>)',
      'green-dim': 'rgb(var(--green-dim) / <alpha-value>)',
      green: 'rgb(var(--green) / <alpha-value>)',
      'green-bright': 'rgb(var(--green-bright) / <alpha-value>)',
    },
    // FOUR radii, 10 / 14 / 18 / 22, and each one names what it is for rather
    // than how big it is. `surface` was the only one for a long time; the
    // redesign draws a card that holds other cards (a section's glass panel) and
    // a sheet that holds a whole screen, and those cannot be the same corner as
    // the row inside them or the nesting stops reading.
    // The first four are the flat design's corners and every screen that has not
    // been re-cut still reads them. The last three are the GLASS steps, one
    // notch softer apiece: a blurred pane with a tight corner reads as a hole
    // punched in the page rather than as something lying on it. They are the
    // same numbers as `radius` in `theme/tokens.ts`, which is where a
    // `BlurView` has to be told its corner — NativeWind's transform does not
    // reach a native component, so the two spellings have to agree by hand.
    borderRadius: {
      none: '0',
      cell: '10px', // a calendar square, a keypad key
      surface: '14px', // rows, wells, the standard card
      card: '18px', // a tile with its own contents — category tiles, task rows
      sheet: '22px', // a bottom sheet, the balance panel
      row: '18px', // GLASS: a row, a chip container
      tile: '20px', // GLASS: a card with contents of its own
      hero: '24px', // GLASS: a hero, a sheet, an instrument
      nav: '26px', // GLASS: the nav pill, and only it
      pill: '9999px',
    },
    fontSize: {
      micro: ['11px', { lineHeight: '14px', letterSpacing: '1.1px' }],
      label: ['13px', { lineHeight: '18px' }],
      body: ['16px', { lineHeight: '22px' }],
      title: ['22px', { lineHeight: '28px', letterSpacing: '-0.4px' }],
      // The SIXTH size, and it exists for exactly one thing: the numbers of the
      // set that is up next (`SetRow`). Title is what every other set row reads,
      // and Display is the timer pill — 40 px of numeral does not fit beside a
      // ✓ and a ▶. This is the one step between them, so "bigger" is a real
      // step in the scale rather than a transform nobody else can reuse.
      'title-lg': ['26px', { lineHeight: '32px', letterSpacing: '-0.6px' }],
      // The SEVENTH, and the up-next row's numbers moved onto it: 26 read as
      // "slightly larger" and the point of that row is that it is findable
      // without being read. 30 is the largest numeral that still leaves the ✓ and
      // the ▶ their thumb targets on a 360 dp phone with a five-character weight
      // in the cell — past it the row starts clipping instead of shouting.
      'title-xl': ['30px', { lineHeight: '36px', letterSpacing: '-0.8px' }],
      display: ['40px', { lineHeight: '44px', letterSpacing: '-1.2px' }],
      // The EIGHTH, NINTH and TENTH, and all three exist only inside focus mode
      // (`components/FocusMode.tsx`) — the full-screen sheet where one fact owns
      // the screen and there is no list, no pill and no header competing with it.
      //
      // `focus-work` was the set you are about to do, on ONE line, and 56 was the
      // largest size its worst line could take: `+120 kg × 12 reps` with its units
      // at `title` lands at 314 of the 328 dp a 360 dp phone has inside its
      // gutter. Those numbers are two lines now and their size is measured per
      // screen (`lib/focusType.ts`), which is what let them grow to the clock's
      // own 120. This step survives for the one thing left at a fixed 56: the
      // `Session complete` headline, which is words rather than a number.
      'focus-work': ['56px', { lineHeight: '60px', letterSpacing: '-1.6px' }],
      // `focus-clock` is the countdown. `PillClock` keeps 84 on the session
      // screen, where four controls share the row with it; this is the largest
      // step that still keeps `10:00` inside the same 328 dp at weight 600.
      'focus-clock': ['120px', { lineHeight: '118px', letterSpacing: '-4px' }],
      // `focus-count` is the get-ready count — one digit, nothing beside it, read
      // off the floor while you get into position under a bar. The pill's own
      // `count` variant is 104 for exactly that job; this is the same idea with a
      // whole screen instead of a pill.
      'focus-count': ['160px', { lineHeight: '150px', letterSpacing: '-6px' }],
      // ── THE FOUR FOCAL STEPS THE GLASS REDESIGN ADDED ──────────────────
      //
      // One per screen, and nothing else on that screen comes near its size.
      // That rule is the whole reason they are separate steps rather than a
      // range: `title-xl` at 30 is a large row, and these are the fact the
      // screen exists for. They mirror `focalType` in `theme/tokens.ts`, which
      // is the copy a screen reads when it has to MEASURE one — the amount
      // shrinks to fit its own width, and a className cannot be measured.
      'hero-name': ['30px', { lineHeight: '34px', letterSpacing: '-0.9px' }],
      balance: ['52px', { lineHeight: '54px', letterSpacing: '-2px' }],
      amount: ['60px', { lineHeight: '62px', letterSpacing: '-2.4px' }],
      'day-dial': ['64px', { lineHeight: '64px', letterSpacing: '-2.4px' }],
    },
    spacing: {
      0: '0px',
      // A separator drawn as a View rather than a border needs a height, and
      // `h-hairline` should mean the same 1px everywhere `border-hairline` does.
      hairline: '1px',
      xs: '4px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      xxl: '40px',
      hit: '44px', // minimum tap target
      // THE THREE FOCUS-MODE TARGETS. Sized for a thumb that is not aiming: the
      // phone is flat on a bench, the hand is coming from above, and the screen is
      // read from two metres. `focus-done` is the widest circle that leaves the
      // 16 dp gutter and still clears Android's swipe-up strip by 24 — 4× the area
      // of `hit` and the only control on the screen while it is there.
      'focus-done': '176px',
      // `Finish workout` takes DONE's slot and deliberately not its geometry: the
      // thumb finds it by position, the eye sees it has changed, and finishing is
      // the one commit in this app that is not one tap to undo.
      'focus-finish': '112px',
      // `Start` / `Stop` / `✕` on a timed set: the floor for a control that is
      // pressed mid-hold, and half of `focus-finish` so the two read as one family.
      'focus-action': '96px',
      row: '56px', // set rows, list rows
      'row-lg': '64px', // editor / library rows (two lines of text)
      timer: '132px', // the timer pill's minimum height — keep in sync with `size.timer`
      well: '96px', // numeric wells
    },
    extend: {
      borderWidth: {
        hairline: '1px',
      },
    },
  },
  plugins: [],
};
