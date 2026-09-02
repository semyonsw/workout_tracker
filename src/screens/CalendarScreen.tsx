/**
 * CalendarScreen — which days you trained.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ HISTORY               [ Log | Graphs | Cal ] │
 *   │ SEPTEMBER 2026 · 8 WORKOUTS · 7 DAYS         │
 *   │  M  T  W  T  F  S  S                         │
 *   │     1  2 ▓3▓ 4 ▓5▓ 6                         │
 *   │ ▓7▓ 8 ▓9▓10 11 12 13                         │
 *   │ 14 15 16 17 18 19 20                         │
 *   │ AUGUST 2026 · 12 WORKOUTS                    │
 *   │  …                                           │
 *   └──────────────────────────────────────────────┘
 *
 * The third view on the History tab, and the one that answers a question the other
 * two cannot: not "what did I lift" and not "is it going up", but "how often am I
 * actually going". Sixteen rows of dates is not a shape; a grid with holes in it is.
 *
 * ── A FILLED SQUARE, AND THAT IS THE WHOLE VOCABULARY ──────────────────────
 *
 * A day either has training in it or it does not. No intensity scale, no colour
 * ramp by volume, no ring to close, and no streak counter anywhere — `lib/calendar.ts`
 * has the argument for why a calendar is a fact and a streak is not.
 *
 * Two workouts in one day fill the same square as one. That is deliberate: the
 * question is whether you trained, and a "2" in the corner of a square is a second
 * number nobody is asking for. The count is in the month's header line, where it is
 * a total rather than a grade.
 *
 * ── EMPTY MONTHS ARE THE POINT ─────────────────────────────────────────────
 *
 * Every month between the first workout and this one is rendered, including the ones
 * with nothing in them. A calendar that skipped those would have no gaps in it, and
 * the gaps are the only thing on this screen that tells you something you did not
 * already know.
 */

import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker } from '../components/primitives';
import {
  describeMonth,
  trainingMonths,
  WEEKDAY_INITIALS,
  type CalendarCell,
  type CalendarMonth,
} from '../lib/calendar';
import type { CompletedWorkout } from '../lib/completedWorkout';

interface CalendarScreenProps {
  workouts: CompletedWorkout[];
  /** The `Log | Graphs | Calendar` switch, owned by the tab. */
  toolbar?: ReactNode;
}

export function CalendarScreen({ workouts, toolbar }: CalendarScreenProps) {
  /*
   * One pass over the log, then one grid per month. Memoized on the log itself:
   * the index is a few thousand rows and the grids are pure arithmetic over it, so
   * neither needs rebuilding until a workout is added or deleted.
   */
  const months = useMemo(() => trainingMonths(workouts), [workouts]);
  const totalDays = useMemo(
    () => months.reduce((sum, month) => sum + month.daysTrained, 0),
    [months],
  );

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker="History"
        subtitle={
          workouts.length === 0
            ? 'Nothing finished yet'
            : `${totalDays} ${totalDays === 1 ? 'day' : 'days'} trained`
        }
        bordered={false}
      >
        {toolbar}
      </ScreenHeader>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {months.length === 0 ? (
          <Text className="mx-lg mt-xl text-label text-ink-faint">
            Finish a workout and the days you trained appear here.
          </Text>
        ) : (
          months.map((month) => <Month key={`${month.year}-${month.month}`} month={month} />)
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function Month({ month }: { month: CalendarMonth }) {
  const summary = describeMonth(month);

  return (
    <View className="mt-xl">
      {/* Green only when there is something in the month — the same rule the
          create screen's kickers follow: the accent means "this has content". */}
      <Kicker tone={month.total > 0 ? 'green' : 'faint'} className="mx-lg mb-sm">
        {month.label}
        {summary ? ` · ${summary}` : ''}
      </Kicker>

      <View className="mx-lg">
        {/* The column headings. `ink-faint` and micro, because they are a ruler
            rather than data — the same treatment the set index column gets. */}
        <View className="flex-row">
          {WEEKDAY_INITIALS.map((initial, index) => (
            <View key={`${initial}-${index}`} className="flex-1 items-center py-xs">
              <Text className="text-micro font-semibold uppercase text-ink-faint">{initial}</Text>
            </View>
          ))}
        </View>

        {month.weeks.map((week, weekIndex) => (
          <View key={weekIndex} className="flex-row">
            {week.map((cell, dayIndex) => (
              <Day key={`${weekIndex}-${dayIndex}`} cell={cell} />
            ))}
            {/*
              The last week is SHORT rather than padded. A trailing pad would draw
              empty squares for days that have not happened yet, which reads as
              untrained instead of as future — so the row is filled with spacers
              that carry no square at all.
            */}
            {week.length < 7
              ? Array.from({ length: 7 - week.length }, (_, i) => (
                  <View key={`pad-${i}`} className="flex-1" />
                ))
              : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * One square.
 *
 * A trained day is a `green` fill with `ink` numerals — the same pairing a completed
 * set's ✓ uses, and for the same reason: it is the mark that says the work happened.
 * An untrained day is the bare page with a faint numeral, which is what "nothing
 * here" should look like when most of a month is nothing.
 */
function Day({ cell }: { cell: CalendarCell }) {
  if (cell.day == null) return <View className="flex-1 py-xs" />;

  const trained = cell.workouts > 0;

  return (
    <View className="flex-1 items-center py-xs">
      <View
        accessible
        accessibilityLabel={
          trained
            ? `${cell.date}: ${cell.workouts} ${cell.workouts === 1 ? 'workout' : 'workouts'}`
            : `${cell.date}: no workout`
        }
        className={[
          // Square-ish and pill-rounded rather than a circle: a 36 dp circle in a
          // seven-column row on a 360 dp phone leaves no gutter between days.
          'h-[34px] w-[34px] items-center justify-center rounded-surface',
          trained ? 'bg-green' : 'bg-transparent',
        ].join(' ')}
      >
        <Text
          className={[
            'text-label tabular-nums',
            trained ? 'font-semibold text-ink' : 'text-ink-faint',
          ].join(' ')}
        >
          {cell.day}
        </Text>
      </View>
    </View>
  );
}
