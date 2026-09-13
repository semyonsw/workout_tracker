/**
 * Icon — the entire icon set. Ten glyphs, one drag handle, nothing else.
 *
 *   check · plus · minus · chevron ×3 · trending-up · trending-down · x
 *   play · pause                                     (+ the reorder handle)
 *
 * `trending-down` is `trending-up` reflected, at the same weight, for the same
 * reason `minus` is the middle bar of `plus`: they are one idea and its opposite,
 * and two marks that differ only by a reflection are two marks nobody has to learn.
 * It marks the ONE thing in the app that suggests doing less — a stalled lift's
 * back-off session (`lib/deload.ts`) — and it is drawn in `ink-muted` rather than
 * green, because green in this app means progressive overload and this is not that.
 *
 * `play` and `pause` are in the same weight class as `check` and `plus` (2.5)
 * because they are the same kind of mark: on a timed set — a plank, a hang — ▶ IS
 * the commit button, the thing you press to say "this set is happening now", and
 * ⏸ is what stops a rest without throwing it away.
 *
 * `minus` is drawn as the exact middle bar of `plus`, at the same weight, because
 * it is that glyph's opposite and nothing else: `+` adds an exercise to a muscle
 * group, `−` takes one out. Two marks that only differ by a stroke are two marks
 * nobody has to learn.
 *
 * `chevron-down` is the disclosure arrow for the library's clusters and muscle
 * groups; it rotates to `chevron-right` when a section is closed, which is why
 * both exist at the same weight rather than one being transformed at runtime.
 *
 * Why a hand-rolled set instead of an icon font: the design specifies stroke
 * weights per glyph — 2.5 for `check` and `plus` so they hold up as marks of
 * commitment, 2 for the quieter navigational glyphs. Icon fonts render one
 * fixed weight, and at 14–20px that difference is the difference between a
 * checkmark that looks pressed and one that looks drawn.
 *
 * Paths are copied verbatim from the design reference, on its 24×24 viewBox
 * (16×16 for the handle). Every icon here earns its place; there is no
 * decorative glyph in this app.
 */

import Svg, { Circle, Path } from 'react-native-svg';

export type IconName =
  | 'check'
  | 'plus'
  | 'minus'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'trending-up'
  | 'trending-down'
  | 'x'
  | 'play'
  | 'pause'
  | 'edit'
  | 'history'
  /*
   * The three that make the workout section's corner a row of destinations
   * rather than one glyph and two rows at the foot of a scroll. `history` was
   * already here; these two join it at the same size, because they answer the
   * same kind of question — where in this section do I go.
   */
  | 'routines'
  | 'library'
  /* The two the reminders needed: what a reminder IS, and what it is set to. */
  | 'bell'
  | 'clock'
  /**
   * THE ONE PLAYFUL GLYPH IN THE APP, and it earns the exception by being the
   * only control whose whole point is that you do not know what it will do.
   *
   * A die is the single mark that says "chance" without a word, in every
   * language this app speaks and every one it does not. Everything else here is
   * a verb; this is a promise of a surprise, and drawing it as anything else —
   * a shuffle arrow, a wand — would be describing the mechanism instead.
   */
  | 'dice';

interface IconProps {
  name: IconName;
  size: number;
  /** Stroke colour. Pass a token from `theme/tokens`, never a literal hex. */
  color: string;
}

/** Per-glyph stroke weight — heavier for the two glyphs that mean "I did it". */
const STROKE: Record<IconName, number> = {
  check: 2.5,
  plus: 2.5,
  minus: 2.5,
  'chevron-left': 2,
  'chevron-right': 2,
  'chevron-down': 2,
  'trending-up': 2,
  'trending-down': 2,
  x: 2,
  play: 2.5,
  pause: 2.5,
  edit: 2,
  history: 2,
  routines: 2,
  library: 2,
  bell: 2,
  clock: 2,
  dice: 2,
};

/**
 * Dots drawn as real circles rather than as round-capped zero-length strokes.
 *
 * One glyph needs them — the die's pips — and a pip is a FILL, not a stroke: at
 * 18px a capped stroke renders as a smudge that changes size with the weight,
 * which is exactly the thing that would make five of them look like four.
 */
const DOTS: Partial<Record<IconName, readonly [number, number][]>> = {
  dice: [
    [8.4, 8.4],
    [15.6, 8.4],
    [12, 12],
    [8.4, 15.6],
    [15.6, 15.6],
  ],
};

const PATHS: Record<IconName, string[]> = {
  check: ['M20 6L9 17l-5-5'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  'chevron-left': ['M15 18l-6-6 6-6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'trending-up': ['M22 7l-8.5 8.5-4-4L2 19', 'M16 7h6v6'],
  // The same two strokes, reflected through the horizontal: the arrowhead ends up
  // bottom-right, and the elbow points the other way.
  'trending-down': ['M22 17l-8.5-8.5-4 4L2 5', 'M16 17h6v-6'],
  x: ['M18 6L6 18M6 6l12 12'],
  // Closed triangle: the round join at the apex matches the checkmark's corner.
  play: ['M8 5.5l11 6.5-11 6.5z'],
  // Two bars on the same 6.5→17.5 vertical as the triangle, so ▶ and ⏸ swapping
  // in the same slot doesn't shift the optical centre.
  pause: ['M9.5 6.5v11M14.5 6.5v11'],
  // A pencil: the nib on the same diagonal the checkmark's long stroke runs on,
  // so `Edit` and `✓` in one card read as the same hand.
  edit: ['M4 20h4L19.5 8.5a2.1 2.1 0 10-3-3L5 17v3z', 'M14 7l3 3'],
  // A clock that has been wound BACK: the dial's gap and the tick beside it are
  // the rewind arrow, which is what separates "history" from "a timer is running".
  // The hands sit at the same 12-and-4 the rest timer draws, so the two glyphs
  // read as the same clock.
  history: [
    'M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 006 6.2',
    'M3.2 3.4v3.4h3.4',
    'M12 7.6V12l3.2 1.9',
  ],
  // A list with its bullets: a routine is an ORDER of exercises, and the marks
  // down the left are what separate it from the book beside it.
  routines: ['M4.5 7h.01M4.5 12h.01M4.5 17h.01', 'M9 7h10.5M9 12h10.5M9 17h10.5'],
  // An open book. The library is the only place in the app that is a reference
  // rather than a log, and this is the one mark that says so.
  library: [
    'M12 6.6C10.4 5.1 8.4 4.6 4.6 4.6v12.8c3.8 0 5.8.5 7.4 2',
    'M12 6.6c1.6-1.5 3.6-2 7.4-2v12.8c-3.8 0-5.8.5-7.4 2',
    'M12 6.6v12.8',
  ],
  // A bell, with the clapper as its own stroke so the shape still reads at 14px.
  bell: ['M18 15.6V10a6 6 0 00-12 0v5.6L4.4 18.2h15.2z', 'M9.9 21a2.3 2.3 0 004.2 0'],
  // The same dial and the same 12-and-4 hands as `history`, WITHOUT the rewind
  // notch — which is the entire difference between "when" and "when it was".
  clock: ['M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', 'M12 7.6V12l3.2 1.9'],
  // A die on its five face: a rounded square, and the pips come from `DOTS`.
  dice: [
    'M7.6 4h8.8A3.6 3.6 0 0120 7.6v8.8a3.6 3.6 0 01-3.6 3.6H7.6A3.6 3.6 0 014 16.4V7.6A3.6 3.6 0 017.6 4z',
  ],
};

export function Icon({ name, size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {PATHS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={STROKE[name]}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {DOTS[name]?.map(([cx, cy]) => (
        <Circle key={`${cx},${cy}`} cx={cx} cy={cy} r={1.55} fill={color} />
      ))}
    </Svg>
  );
}

/**
 * DragHandle — three 1.5px lines in a 16×16 box.
 *
 * Not in the five-glyph set because it isn't an icon: it's an affordance that
 * exists only while a list is reorderable, and it is the grab target itself.
 */
export function DragHandle({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M2 4.5h12M2 8h12M2 11.5h12" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
