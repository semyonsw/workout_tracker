/**
 * TimeWheel — two columns of numbers you roll to a time.
 *
 *   ┌─────────────────┐
 *   │   06      28    │  ← faint, above the line
 *   │ ╭─────────────╮ │
 *   │ │ 07   :   30 │ │  ← the selection, on a lit band
 *   │ ╰─────────────╯ │
 *   │   08      32    │
 *   │ HOURS  MINUTES  │
 *   └─────────────────┘
 *
 * ── WHY A WHEEL AND NOT A KEYBOARD ────────────────────────────────────────
 *
 * The rest of this app types numbers into wells, and that is right for a weight
 * — 82.5 is a value with digits in it. A time is not: it is a POSITION in a day,
 * and the thing you actually want is "a bit later than that". A wheel answers
 * that with a flick and costs nothing to correct, while a keypad makes you
 * commit to four digits and dismiss a keyboard to see what you chose.
 *
 * ── 24 HOURS, AND NO AM/PM ANYWHERE ───────────────────────────────────────
 *
 * `00` through `23`. There is no second control to get wrong, no 12:00 that
 * could be either end of the day, and it matches every other number in this app,
 * which are all tabular and all unambiguous. It is also what the rest of the
 * world's phones do.
 *
 * ── THE MECHANISM: A SNAPPING SCROLLVIEW, NOT A GESTURE HANDLER ───────────
 *
 * Each column is a `ScrollView` with `snapToInterval` set to the row height, so
 * the platform's own fling physics and snapping do the work — momentum, the
 * deceleration curve, the rubber band at the ends, all of it native and all of
 * it correct without being written. The padding above and below is exactly
 * enough to bring the first and last value to the centre line, which is what
 * makes `00` and `23` reachable at all.
 *
 * The value is read on `momentumScrollEnd` AND on `scrollEndDrag`, and it needs
 * both: a slow drag that is released without a flick never produces a momentum
 * event, so a wheel that listened only for momentum would silently ignore
 * exactly the careful, one-row adjustment somebody makes at the end.
 *
 * A write is suppressed when it would be a no-op, so setting the scroll position
 * from the outside — which is what mounting at the current value does — cannot
 * echo back as a change the user did not make.
 */

import { useEffect, useRef } from 'react';
import {
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { pad } from '../lib/days';
import { tap } from '../lib/feedback';
import { useT } from '../hooks/useT';
import { palette } from '../theme/tokens';

/** One value's height. 44 is the app's tap target, and it is a comfortable row. */
const ROW = 44;
/** Rows visible either side of the selection. Two is enough to read as a wheel. */
const WINGS = 2;
const HEIGHT = ROW * (WINGS * 2 + 1);

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);

interface TimeWheelProps {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}

export function TimeWheel({ hour, minute, onChange }: TimeWheelProps) {
  const t = useT();

  return (
    <View className="items-center">
      <View className="flex-row items-center justify-center" style={{ height: HEIGHT }}>
        {/* The lit band sits BEHIND both columns rather than being drawn inside
            each one, so the colon between them lands on the same line and the
            band reads as one selection rather than two. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: ROW * WINGS,
            height: ROW,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.greenDim,
            backgroundColor: palette.surfaceAlt,
          }}
        />

        <Column values={HOURS} value={hour} onSelect={(next) => onChange(next, minute)} />
        <Text
          allowFontScaling={false}
          className="mx-sm text-title-lg font-semibold text-ink-muted"
          style={{ lineHeight: ROW }}
        >
          :
        </Text>
        <Column values={MINUTES} value={minute} onSelect={(next) => onChange(hour, next)} />
      </View>

      <View className="mt-sm flex-row items-center justify-center">
        <Text className="w-[76px] text-center text-micro font-semibold uppercase text-ink-faint">
          {t('Hours')}
        </Text>
        <View className="mx-sm w-[10px]" />
        <Text className="w-[76px] text-center text-micro font-semibold uppercase text-ink-faint">
          {t('Minutes')}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function Column({
  values,
  value,
  onSelect,
}: {
  values: readonly number[];
  value: number;
  onSelect: (value: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  /**
   * The value this column is scrolled to, as far as it knows.
   *
   * Compared against before reporting a change, so scrolling the wheel TO the
   * current value — which is what mount and any outside write do — does not
   * come back out as a change. Without it the sheet's state and the wheel feed
   * each other and the column fights the finger.
   */
  const settled = useRef(value);

  const index = Math.max(
    0,
    values.findIndex((v) => v === value),
  );

  useEffect(() => {
    settled.current = value;
    // `animated: false` on mount is deliberate: a wheel that spins to 18:00
    // while the sheet is still arriving is two animations for one act.
    ref.current?.scrollTo({ y: index * ROW, animated: false });
  }, [index, value]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const at = Math.round(event.nativeEvent.contentOffset.y / ROW);
    const next = values[Math.min(values.length - 1, Math.max(0, at))];
    if (next === undefined || next === settled.current) return;
    settled.current = next;
    // The same tick every other committing control in the app gives.
    tap();
    onSelect(next);
  };

  return (
    <ScrollView
      ref={ref}
      style={{ width: 76, height: HEIGHT }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW}
      decelerationRate="fast"
      // Exactly enough to bring the first and last value onto the centre line.
      contentContainerStyle={{ paddingVertical: ROW * WINGS }}
      onMomentumScrollEnd={settle}
      // A slow drag released without a flick fires no momentum event — see the
      // file header. This is the half that catches the careful adjustment.
      onScrollEndDrag={settle}
    >
      {values.map((v) => {
        const selected = v === value;
        return (
          <View key={v} style={{ height: ROW }} className="items-center justify-center">
            <Text
              allowFontScaling={false}
              className={[
                'text-title-lg tabular-nums',
                selected ? 'font-semibold text-ink' : 'font-medium text-ink-faint',
              ].join(' ')}
            >
              {pad(v)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
