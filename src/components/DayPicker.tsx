/**
 * DayPicker — a month of squares you tap one of.
 *
 *   ‹   September 2026   ›
 *    П  В  С  Ч  П  С  В
 *          1  2  3  4  5
 *    6  7  8  9 10 11 12
 *   13 14 15 16 17 18 19   ← 13 is today, 14 is picked
 *
 * ── WHY A GRID AND NOT ‹ TODAY › ──────────────────────────────────────────
 *
 * The two things this is used for are "a task for tomorrow" and "this habit
 * starts on the first of the month", and only the first of those is near today.
 * A pair of chevrons stepping one day at a time answers the first well and makes
 * the second twelve taps; a month answers both in one, and it is the same shape
 * the task detail screen and the training calendar already draw — so it is not a
 * new thing to learn, it is a familiar thing that is now tappable.
 *
 * ── IT GOES FORWARD, UNLIKE EVERY OTHER CALENDAR IN THIS APP ──────────────
 *
 * The day pager on the tasks screen refuses to walk into tomorrow, and that
 * refusal is right there: there is nothing to tick in the future and a screen
 * offering to let you tick it would be offering to lie. This is the opposite
 * kind of control. It picks a day for something that has not happened yet — a
 * one-day task for tomorrow is the whole reason that shape exists — so the
 * future is exactly what it is for, and `earliest` is how a caller that does
 * need a floor asks for one.
 *
 * Padded at the start only, like every other calendar here: a trailing pad draws
 * squares for days that are not in the month.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from './Icon';
import { BubblePressable } from './bubbles';
import { pressedStyle } from './motion';
import { dayKey, formatMonth, parseDay, weekdayIndex, weekdayInitials } from '../lib/days';
import { tap } from '../lib/feedback';
import { useLanguage } from '../hooks/useT';
import { palette } from '../theme/tokens';

interface DayPickerProps {
  /** The day currently chosen, `YYYY-MM-DD`. */
  value: string;
  onChange: (day: string) => void;
  /** Days before this are not tappable. Absent = any day, past or future. */
  earliest?: string;
}

export function DayPicker({ value, onChange, earliest }: DayPickerProps) {
  const lang = useLanguage();
  const today = dayKey(new Date());
  const anchor = parseDay(value) ?? new Date();
  const [cursor, setCursor] = useState({
    year: anchor.getFullYear(),
    month: anchor.getMonth(),
  });

  const step = (delta: number) => {
    tap();
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const lead = weekdayIndex(new Date(cursor.year, cursor.month, 1));

  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      dayKey(new Date(cursor.year, cursor.month, i + 1)),
    ),
  ];
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View>
      <View className="flex-row items-center justify-center">
        <Pressable
          onPress={() => step(-1)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="The month before"
          style={pressedStyle}
          className="h-hit w-[32px] items-center justify-center"
        >
          <Icon name="chevron-left" size={18} color={palette.inkMuted} />
        </Pressable>
        <Text className="mx-lg text-body font-medium tabular-nums text-ink">
          {formatMonth(cursor.year, cursor.month, lang)}
        </Text>
        <Pressable
          onPress={() => step(1)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="The month after"
          style={pressedStyle}
          className="h-hit w-[32px] items-center justify-center"
        >
          <Icon name="chevron-right" size={18} color={palette.inkMuted} />
        </Pressable>
      </View>

      <View className="mt-sm flex-row">
        {weekdayInitials(lang).map((initial, index) => (
          <Text
            key={`${initial}${index}`}
            className="flex-1 text-center text-micro font-semibold text-ink-faint"
          >
            {initial}
          </Text>
        ))}
      </View>

      <View className="mt-xs">
        {weeks.map((week, index) => (
          <View key={index} className="flex-row">
            {week.map((day, position) => (
              <Cell
                key={day ?? `pad${index}-${position}`}
                day={day}
                selected={day === value}
                isToday={day === today}
                disabled={day != null && earliest != null && day < earliest}
                onPress={() => {
                  if (!day) return;
                  tap();
                  onChange(day);
                }}
              />
            ))}
            {week.length < 7
              ? Array.from({ length: 7 - week.length }, (_, i) => (
                  <View key={`tail${i}`} className="flex-1" />
                ))
              : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function Cell({
  day,
  selected,
  isToday,
  disabled,
  onPress,
}: {
  day: string | null;
  selected: boolean;
  isToday: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  if (day === null) return <View className="flex-1 p-[3px]" />;
  const number = Number(day.slice(8));

  return (
    <BubblePressable
      onPress={onPress}
      disabled={disabled}
      radius={8}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={day}
      style={pressedStyle}
      className="flex-1 p-[3px]"
    >
      <View
        className={[
          'aspect-square items-center justify-center rounded-[8px]',
          selected ? 'bg-green' : isToday ? 'border border-green-dim' : '',
        ].join(' ')}
      >
        <Text
          className={[
            'text-label tabular-nums',
            selected
              ? 'font-semibold text-ink'
              : disabled
                ? 'text-ink-faint/40'
                : isToday
                  ? 'text-green-bright'
                  : 'text-ink-muted',
          ].join(' ')}
        >
          {number}
        </Text>
      </View>
    </BubblePressable>
  );
}
