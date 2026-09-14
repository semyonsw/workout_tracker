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
 * which are all tabular and all unambiguous.
 *
 * ── WHY THIS IS A PanResponder AND NOT A SNAPPING ScrollView ──────────────
 *
 * It was a `ScrollView` with `snapToInterval`, which is the obvious way to build
 * a wheel and was BROKEN EVERYWHERE IT WAS USED. Both places this appears — the
 * workout settings screen and the task editor's sheet — are themselves vertical
 * scrollers, and on Android a parent `ScrollView` wins the vertical drag from a
 * nested one. So the finger scrolled the SCREEN, the wheel never moved, and the
 * reminder time was stuck on whatever it defaulted to. No amount of
 * `snapToInterval` tuning fixes that; the gesture never reached the wheel.
 *
 * A `PanResponder` claims the gesture through responder negotiation instead,
 * which children win — the same mechanism `hooks/useDragReorder.ts` already uses
 * to drag a row inside a scrolling list. The parent never sees the drag.
 *
 * ── AND EVERY ROW IS TAPPABLE ─────────────────────────────────────────────
 *
 * Tapping `19` selects 19. That is not a fallback for a broken drag, it is the
 * faster gesture for the common correction — the value you want is usually on
 * screen already, one or two rows from the middle, and a tap is more accurate
 * than dragging to a stop. It also means the control still works if a gesture is
 * ever stolen again, which is the failure this file has already had once.
 *
 * The drag carries momentum from the release velocity, so a flick travels
 * further than the finger did; without it, crossing sixty minutes is a dozen
 * separate drags.
 */

import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';

import { pad } from '../lib/days';
import { landing } from '../lib/wheel';
import { tap } from '../lib/feedback';
import { useT } from '../hooks/useT';
import { palette } from '../theme/tokens';

/** One value's height. 44 is the app's tap target, and a comfortable row. */
const ROW = 44;
/** Rows visible either side of the selection. Two is enough to read as a wheel. */
const WINGS = 2;
const HEIGHT = ROW * (WINGS * 2 + 1);
/** Column width. Wide enough for two tabular digits at Title-LG. */
const COLUMN = 76;

/**
 * How far a flick coasts, in rows per unit of release velocity.
 *
 * Six is tuned so an ordinary flick crosses about a quarter of the minutes
 * column — far enough that sixty values are reachable, short enough that the
 * wheel still stops where you expect rather than spinning off.
 */
const FLICK_ROWS = 6;

/** A drag has to travel this far before it is a drag rather than a tap. */
const CLAIM_SLOP = 4;

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

        <Column
          values={HOURS}
          value={hour}
          label={t('Hours')}
          onSelect={(next) => onChange(next, minute)}
        />
        <Text
          allowFontScaling={false}
          className="mx-sm text-title-lg font-semibold text-ink-muted"
          style={{ lineHeight: ROW }}
        >
          :
        </Text>
        <Column
          values={MINUTES}
          value={minute}
          label={t('Minutes')}
          onSelect={(next) => onChange(hour, next)}
        />
      </View>

      <View className="mt-sm flex-row items-center justify-center">
        <Text
          style={{ width: COLUMN }}
          className="text-center text-micro font-semibold uppercase text-ink-faint"
        >
          {t('Hours')}
        </Text>
        <View className="mx-sm w-[10px]" />
        <Text
          style={{ width: COLUMN }}
          className="text-center text-micro font-semibold uppercase text-ink-faint"
        >
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
  label,
  onSelect,
}: {
  values: readonly number[];
  value: number;
  /** Spoken name of the column, for the row labels. */
  label: string;
  onSelect: (value: number) => void;
}) {
  const index = Math.max(
    0,
    values.findIndex((v) => v === value),
  );

  /** Pixels the finger has moved this drag. Zero whenever nothing is in flight. */
  const drag = useRef(new Animated.Value(0)).current;
  /**
   * Whether a drag is happening, for the rows' own styling.
   *
   * State rather than a ref because it is rendered: the lit row loses its
   * emphasis while the column is moving, so the band reads as a window over a
   * moving strip rather than as a value that is somehow both moving and chosen.
   */
  const [dragging, setDragging] = useState(false);

  /*
   * Read through refs inside the responder, because `PanResponder.create` runs
   * once and would otherwise close over the first render's index forever — the
   * classic version of this bug is a wheel that always jumps back to where it
   * started on the second drag.
   */
  const indexRef = useRef(index);
  indexRef.current = index;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Not on START: a touch that never moves is a TAP on a row, and the
        // rows handle those themselves.
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        /*
         * Claimed on a vertical move, which is what takes the gesture off the
         * parent ScrollView — see the file header. Horizontal movement is left
         * alone so a sideways swipe still changes section.
         *
         * CAPTURE, and that matters: by the time the finger moves, the row
         * underneath is already the responder (that is how its tap works), and a
         * bubbling handler is never asked to take a gesture off a descendant.
         * The capture phase runs ancestors-first, so this is what actually wins
         * the drag — and only after the slop, so a tap still reaches the row.
         */
        onMoveShouldSetPanResponderCapture: (_event, gesture) => claims(gesture),
        onMoveShouldSetPanResponder: (_event, gesture) => claims(gesture),
        onPanResponderGrant: () => {
          setDragging(true);
          drag.setValue(0);
        },
        onPanResponderMove: (_event, gesture) => drag.setValue(gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_event, gesture) => {
          setDragging(false);
          drag.setValue(0);

          const next = landing({
            index: indexRef.current,
            dy: gesture.dy,
            vy: gesture.vy,
            rowHeight: ROW,
            flickRows: FLICK_ROWS,
            length: valuesRef.current.length,
          });
          if (next === indexRef.current) return;
          tap();
          onSelectRef.current(valuesRef.current[next]);
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          drag.setValue(0);
        },
      }),
    [drag],
  );

  /**
   * Where the strip sits: the selected row pulled up to the band, plus whatever
   * the finger has moved since.
   *
   * `useNativeDriver` cannot be used here because the base offset is a plain
   * number that changes with the value — but a translate of one small strip is
   * the cheapest thing the JS driver can be asked to do, and it only runs while
   * a finger is down.
   */
  const translateY = Animated.add(drag, ROW * WINGS - index * ROW);

  return (
    <View style={{ width: COLUMN, height: HEIGHT, overflow: 'hidden' }} {...responder.panHandlers}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {values.map((v) => {
          const selected = v === value;
          return (
            <Pressable
              key={v}
              // Tapping a visible row picks it — the faster gesture for the
              // one- or two-row correction. See the file header.
              onPress={() => {
                if (selected) return;
                tap();
                onSelect(v);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label} ${pad(v)}`}
              style={{ height: ROW }}
              className="items-center justify-center"
            >
              <Text
                allowFontScaling={false}
                className={[
                  'text-title-lg tabular-nums',
                  selected && !dragging ? 'font-semibold text-ink' : 'font-medium text-ink-faint',
                ].join(' ')}
              >
                {pad(v)}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

/** A vertical move past the slop, rather than a sideways one or a tap. */
function claims(gesture: { dx: number; dy: number }): boolean {
  return Math.abs(gesture.dy) > CLAIM_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx);
}
