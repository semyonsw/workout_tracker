/**
 * Icon — the entire icon set. Six glyphs, one drag handle, nothing else.
 *
 *   check · plus · chevron · trending-up · x · play  (+ the reorder handle)
 *
 * `play` is in the same weight class as `check` and `plus` (2.5) because it is
 * the same kind of mark: on a timed set — a plank, a hang — it IS the commit
 * button, the thing you press to say "this set is happening now".
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

import Svg, { Path } from 'react-native-svg';

export type IconName =
  | 'check'
  | 'plus'
  | 'chevron-left'
  | 'chevron-right'
  | 'trending-up'
  | 'x'
  | 'play';

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
  'chevron-left': 2,
  'chevron-right': 2,
  'trending-up': 2,
  x: 2,
  play: 2.5,
};

const PATHS: Record<IconName, string[]> = {
  check: ['M20 6L9 17l-5-5'],
  plus: ['M12 5v14M5 12h14'],
  'chevron-left': ['M15 18l-6-6 6-6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'trending-up': ['M22 7l-8.5 8.5-4-4L2 19', 'M16 7h6v6'],
  x: ['M18 6L6 18M6 6l12 12'],
  // Closed triangle: the round join at the apex matches the checkmark's corner.
  play: ['M8 5.5l11 6.5-11 6.5z'],
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
      <Path
        d="M2 4.5h12M2 8h12M2 11.5h12"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}
