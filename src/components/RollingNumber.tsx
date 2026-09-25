/**
 * RollingNumber — each digit is a column of 0–9 that slides to its value.
 *
 *     ┌─┐┌─┐ ┌─┐┌─┐
 *     │9││,│ │0││2│ …     one clipped column per digit, translated to
 *     └─┘└─┘ └─┘└─┘       −digit × lineHeight; separators are plain text
 *
 * A number that changes by rolling is a number you can SEE change: `+15` on the
 * rest pill, a set count in the header, the balance after an amount is saved.
 * Snapping reads as the screen redrawing; rolling reads as the value moving, and
 * the direction it rolls is itself information — up is more.
 *
 * ── THE FOUR RULES ────────────────────────────────────────────────────────
 *
 *  • `lineHeight` IS REQUIRED and must equal the text's own line height at the
 *    call site. It is the height of one cell in the column and of the clip box, so
 *    a mismatch shows half of the digit above.
 *  • COLUMNS ARE KEYED FROM THE RIGHT (`lib/rollingDigits.ts`), so 9 → 10 rolls
 *    the ones column in place and the new tens digit appears on the left.
 *  • ALWAYS TABULAR. A column is as wide as its widest digit, so the number can
 *    never shift sideways by a pixel as a digit changes — the difference between
 *    an app and an instrument, as `theme/tokens.ts` puts it.
 *  • NATIVE DRIVER, translate only. A clock rolling four columns every second is
 *    four native animations and no JS work per frame.
 *
 * The first render lands on the value without rolling: a number is not news the
 * moment it appears. A caller that WANTS a roll-up from zero (the Finish sheet)
 * renders `0` first and the real value a beat later.
 */

import { memo, useEffect, useRef } from 'react';
import { Animated, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useMotionScale } from '../hooks/useMotionScale';
import { digitCells } from '../lib/rollingDigits';
import { curve, motion } from '../theme/tokens';

const EASE = curve(motion.ease);
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

function RollingNumberComponent({
  value,
  lineHeight,
  style,
  className,
  duration = motion.roll,
  containerStyle,
  accessibilityLabel,
  allowFontScaling = false,
}: {
  value: string;
  lineHeight: number;
  style?: StyleProp<TextStyle>;
  className?: string;
  /** `motion.roll` by default; 320 on the clocks, 700–900 on money. */
  duration?: number;
  containerStyle?: StyleProp<ViewStyle>;
  /** Defaults to the value itself. */
  accessibilityLabel?: string;
  /**
   * Off by default: the column height is `lineHeight` in dp, and an OS font scale
   * on top of it would draw digits taller than the box that clips them.
   */
  allowFontScaling?: boolean;
}) {
  const cells = digitCells(value);
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? value}
      style={[{ flexDirection: 'row', height: lineHeight, overflow: 'hidden' }, containerStyle]}
    >
      {cells.map((cell) =>
        cell.kind === 'glyph' ? (
          <Text
            key={cell.key}
            style={[style, TABULAR, { lineHeight, height: lineHeight }]}
            className={className}
            allowFontScaling={allowFontScaling}
          >
            {cell.char}
          </Text>
        ) : (
          <DigitColumn
            key={cell.key}
            digit={cell.digit}
            lineHeight={lineHeight}
            style={style}
            className={className}
            duration={duration}
            allowFontScaling={allowFontScaling}
          />
        ),
      )}
    </View>
  );
}

function DigitColumn({
  digit,
  lineHeight,
  style,
  className,
  duration,
  allowFontScaling,
}: {
  digit: number;
  lineHeight: number;
  style?: StyleProp<TextStyle>;
  className?: string;
  duration: number;
  allowFontScaling: boolean;
}) {
  const scale = useMotionScale();
  const y = useRef(new Animated.Value(-digit * lineHeight)).current;

  useEffect(() => {
    Animated.timing(y, {
      toValue: -digit * lineHeight,
      duration: duration * scale,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  }, [digit, duration, lineHeight, scale, y]);

  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {DIGITS.map((d) => (
          <Text
            key={d}
            style={[style, TABULAR, { lineHeight, height: lineHeight }]}
            className={className}
            allowFontScaling={allowFontScaling}
          >
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * Memoized: the session header and the rest pill re-render four times a second,
 * and a number whose value did not change must not rebuild forty `Text` nodes.
 */
export const RollingNumber = memo(RollingNumberComponent);

/**
 * A translated sentence with ROLLING numbers in it: `3 of 17 sets`, `подходов:
 * 3 из 17`.
 *
 * The sentence is translated WITH its holes still in it — `t()` leaves a
 * placeholder it was not given — and split on them here, so the number rolls in
 * whatever position the language puts it. Gluing `<Roll/> + ' of 17 sets'` at the
 * call site would freeze English word order into the layout, which is exactly the
 * mistake `lib/i18n.ts` exists to prevent.
 */
export function RollingPhrase({
  template,
  values,
  lineHeight,
  style,
  className,
  duration,
  containerStyle,
}: {
  /** Already translated, e.g. `t('{done} of {total} sets', { total: 17 })`. */
  template: string;
  /** The holes that roll, by name. Any other hole was filled by `t()`. */
  values: Record<string, string | number>;
  lineHeight: number;
  style?: StyleProp<TextStyle>;
  className?: string;
  duration?: number;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const parts = template.split(/(\{\w+\})/);
  const spoken = template.replace(/\{(\w+)\}/g, (hole, name: string) =>
    name in values ? String(values[name]) : hole,
  );
  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={[{ flexDirection: 'row', alignItems: 'center', height: lineHeight }, containerStyle]}
    >
      {parts.map((part, index) => {
        const hole = /^\{(\w+)\}$/.exec(part);
        if (hole && hole[1] in values) {
          return (
            <RollingNumber
              key={`${index}-${hole[1]}`}
              value={String(values[hole[1]])}
              lineHeight={lineHeight}
              style={style}
              className={className}
              duration={duration}
            />
          );
        }
        if (part === '') return null;
        return (
          <Text
            key={index}
            allowFontScaling={false}
            numberOfLines={1}
            style={[style, TABULAR, { lineHeight }]}
            className={className}
          >
            {part}
          </Text>
        );
      })}
    </View>
  );
}
