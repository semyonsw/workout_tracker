/**
 * TasksHistoryScreen — the month and the line, behind the ⟲.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ TASK HISTORY            ╭ Month ╮╭ Trend ╮ │
 *   │        ‹   September 2026   ›                │
 *   │  M  T  W  T  F  S  S                         │
 *   │  ▢  ▣  ▤  ▥  ▦  ▢  ▢                         │
 *   │  …                                           │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY THIS IS A SCREEN AND NOT TWO MORE SEGMENTS ─────────────────────────
 *
 * It was `Day | Month | Trend` at the top of the tasks tab, which made the grid
 * and the line two thirds of a control the user passes through on the way to the
 * thing they open the app for. Worse, the same three-way switch existed in three
 * different shapes across the app — a segmented control here, a segmented control
 * in History, and a scroll to the bottom of the money.
 *
 * The past of a section now lives behind one glyph in that section's corner, the
 * same glyph in the same place in all three. `Day` is not a view any more: it is
 * the tasks screen. What is left in here is genuinely one question — how has this
 * been going — at two zoom levels, which is what the segmented control is for.
 *
 * Picking a day in the grid still opens it, which is the one thing the grid is
 * for: walking back three weeks with the `‹` pager is twenty-one taps. It closes
 * this screen on the way, because the day it selected is on the one underneath.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { TrendChart } from '../components/TrendChart';
import { pressedStyle } from '../components/motion';
import { Kicker, Segmented, SelectChip } from '../components/primitives';
import { useT } from '../hooks/useT';
import { WEEKDAY_INITIALS, dayKey, formatShortDay, parseDay } from '../lib/days';
import { tap } from '../lib/feedback';
import {
  type DayCell,
  type Task,
  type TaskLog,
  summarizeTaskTrend,
  taskTrendSeries,
  tasksMonth,
} from '../lib/tasks';
import { TREND_RANGES, TREND_RANGE_LABELS, type TrendRange } from '../lib/trends';
import { useSettings } from '../state/settingsStore';
import { useTasks } from '../state/tasksStore';
import { palette } from '../theme/tokens';

const VIEWS = [
  { value: 'month' as const, label: 'Month' },
  { value: 'trend' as const, label: 'Trend' },
];

interface TasksHistoryScreenProps {
  /** The day the tasks screen is showing, so the grid opens on its month. */
  selected: string;
  onBack: () => void;
  /** A square tapped: show that day on the screen underneath, and close. */
  onPickDay: (day: string) => void;
}

export function TasksHistoryScreen({ selected, onBack, onPickDay }: TasksHistoryScreenProps) {
  const t = useT();
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const today = dayKey(new Date());
  const [view, setView] = useState<'month' | 'trend'>('month');

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Task history')} onBack={onBack} bordered={false}>
        <View className="mt-md">
          <Segmented
            options={VIEWS}
            value={view}
            onChange={setView}
            accessibilityLabel="The month or the trend"
          />
        </View>
      </ScreenHeader>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {view === 'month' ? (
          <MonthView tasks={tasks} log={log} today={today} selected={selected} onPick={onPickDay} />
        ) : (
          <TrendView tasks={tasks} log={log} today={today} />
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * THE WHOLE MONTH, every task at once.
 *
 * One square per day, filled by the share of that day that got done — five steps
 * of green rather than a number, because the point of a grid is a shape and a
 * grid of fractions is a spreadsheet. Tapping a square is how you get to that
 * day, which is the one thing the `‹ ›` pager makes slow: walking back three
 * weeks is twenty-one taps.
 */
function MonthView({
  tasks,
  log,
  today,
  selected,
  onPick,
}: {
  tasks: readonly Task[];
  log: TaskLog;
  today: string;
  selected: string;
  onPick: (day: string) => void;
}) {
  const start = parseDay(today) ?? new Date();
  const [cursor, setCursor] = useState(() => {
    const at = parseDay(selected) ?? start;
    return { year: at.getFullYear(), month: at.getMonth() };
  });

  const month = useMemo(
    () => tasksMonth(tasks, log, cursor.year, cursor.month, today),
    [tasks, log, cursor, today],
  );
  const atLatest = cursor.year === start.getFullYear() && cursor.month === start.getMonth();

  const step = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <>
      <View className="mx-lg flex-row items-center justify-center">
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
        <Text className="mx-lg text-title font-semibold tabular-nums text-ink">{month.label}</Text>
        <Pressable
          onPress={() => step(1)}
          disabled={atLatest}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="The month after"
          style={pressedStyle}
          className="h-hit w-[32px] items-center justify-center"
        >
          {atLatest ? null : <Icon name="chevron-right" size={18} color={palette.inkMuted} />}
        </Pressable>
      </View>

      <Text className="mx-lg mt-xs text-center text-label tabular-nums text-ink-muted">
        {month.asked === 0
          ? 'Nothing recorded this month'
          : `${month.done} of ${month.asked} done · ${month.days} ${month.days === 1 ? 'day' : 'days'}`}
      </Text>

      <View className="mx-lg mt-lg flex-row">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <Text
            key={`${initial}${index}`}
            className="flex-1 text-center text-micro font-semibold text-ink-faint"
          >
            {initial}
          </Text>
        ))}
      </View>

      <View className="mx-lg mt-sm">
        {month.weeks.map((week, index) => (
          <View key={index} className="flex-row">
            {week.map((cell, position) => (
              <MonthCell
                key={cell.date ?? `pad${position}`}
                cell={cell}
                selected={cell.date !== null && cell.date === selected}
                onPress={cell.date ? () => onPick(cell.date as string) : undefined}
              />
            ))}
            {/* The last week is short rather than padded — a trailing blank would
                draw squares for days that have not happened. */}
            {week.length < 7
              ? Array.from({ length: 7 - week.length }, (_, i) => (
                  <View key={`tail${i}`} className="flex-1" />
                ))
              : null}
          </View>
        ))}
      </View>

      <Text className="mx-lg mt-md text-label text-ink-faint">
        The fuller the square, the more of that day was done. Tap one to open it and answer its
        tasks.
      </Text>
    </>
  );
}

/**
 * Five steps of fill, because a continuous opacity is a value nobody can read
 * back off a screen — and four states plus empty is what the eye can actually
 * count in a grid.
 */
function fillFor(fraction: number): { className: string; opacity?: number } {
  if (fraction >= 1) return { className: 'bg-green' };
  if (fraction >= 0.75) return { className: 'bg-green', opacity: 0.72 };
  if (fraction >= 0.5) return { className: 'bg-green', opacity: 0.5 };
  if (fraction > 0) return { className: 'bg-green', opacity: 0.3 };
  return { className: 'border border-ink-faint/40' };
}

function MonthCell({
  cell,
  selected,
  onPress,
}: {
  cell: DayCell;
  selected: boolean;
  onPress?: () => void;
}) {
  if (cell.day === null) return <View className="flex-1 p-[3px]" />;

  const fill = cell.isBlank ? { className: '' } : fillFor(cell.fraction);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={
        cell.isBlank ? `${cell.day}, nothing asked` : `${cell.day}, ${cell.done} of ${cell.asked}`
      }
      accessibilityState={{ selected }}
      style={pressedStyle}
      className="flex-1 p-[3px]"
    >
      <View
        className={['aspect-square items-center justify-center rounded-[6px]', fill.className].join(
          ' ',
        )}
        style={{
          opacity: fill.opacity,
          // The app's one glow, spent here on the single square that is today.
          ...(cell.isToday
            ? {
                borderWidth: 1,
                borderColor: palette.greenBright,
                shadowColor: palette.greenBright,
                shadowOpacity: 0.45,
                shadowRadius: 8,
                elevation: 6,
              }
            : selected
              ? { borderWidth: 1, borderColor: palette.inkMuted }
              : {}),
        }}
      >
        <Text
          className={[
            'text-label tabular-nums',
            !cell.isBlank && cell.fraction >= 0.5 ? 'font-medium text-ink' : 'text-ink-faint',
          ].join(' ')}
        >
          {cell.day}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * THE HABIT LINE — percent of each day's tasks done, over a range you pick.
 *
 * Percent rather than a count, because the denominator moves: a Monday asks for
 * nine things and a Sunday for six, and a line of raw counts would draw a weekly
 * sawtooth that is about the schedule rather than about the person.
 * `taskTrendSeries` owns that and every other rule the chart obeys.
 */
function TrendView({ tasks, log, today }: { tasks: readonly Task[]; log: TaskLog; today: string }) {
  const t = useT();
  /*
   * Seeded from the setting, and then the chips own it. A range that wrote itself
   * back to settings on every tap would make "which range does this open on" and
   * "which range am I looking at" the same fact, and then there would be no way to
   * glance at the year without changing what tomorrow opens on.
   */
  const opensOn = useSettings((s) => s.tasksTrendRange);
  const [range, setRange] = useState<TrendRange>(opensOn);
  const points = useMemo(
    () => taskTrendSeries(tasks, log, range, today),
    [tasks, log, range, today],
  );
  const summary = useMemo(() => summarizeTaskTrend(points), [points]);

  return (
    <>
      <View className="mx-lg flex-row flex-wrap">
        {TREND_RANGES.map((option) => (
          <SelectChip
            key={option}
            label={t(TREND_RANGE_LABELS[option])}
            selected={option === range}
            onPress={() => {
              tap();
              setRange(option);
            }}
          />
        ))}
      </View>

      <View className="mx-lg mt-md flex-row gap-md">
        <Well
          label={t('Done')}
          value={`${summary.percent}%`}
          unit={t('of {asked}', { asked: summary.asked })}
          green
        />
        <Well
          label={t('Full days')}
          value={String(summary.perfectDays)}
          unit={t('of {asked}', { asked: summary.days })}
        />
      </View>

      {points.length >= 2 ? (
        <>
          <Kicker className="mx-lg mt-xl">Percent done, day by day</Kicker>
          <View className="mx-lg mt-md">
            <TrendChart points={points} formatValue={(value) => `${Math.round(value)}%`} />
          </View>
          <Text className="mx-lg mt-sm text-label tabular-nums text-ink-faint">
            {formatShortDay(points[0].day)} to {formatShortDay(points[points.length - 1].day)} ·{' '}
            {summary.done} of {summary.asked} answered done
          </Text>
        </>
      ) : (
        <View className="mx-lg mt-xl rounded-surface border border-hairline bg-surface p-lg">
          <Kicker>Not enough yet</Kicker>
          <Text className="mt-sm text-body text-ink-muted">
            A line needs two days to have a direction. Answer today and tomorrow and it draws
            itself.
          </Text>
        </View>
      )}

      <Text className="mx-lg mt-md text-label text-ink-faint">
        Days that asked for nothing are left out rather than plotted as zero — a day off is not a
        day you failed. A task you marked missed on purpose leaves the denominator.
      </Text>
    </>
  );
}

/** A 96-high well. The same fact-shaped box the task detail screen uses. */
function Well({
  label,
  value,
  unit,
  green = false,
}: {
  label: string;
  value: string;
  unit: string;
  green?: boolean;
}) {
  return (
    <View className="h-well flex-1 justify-between rounded-surface bg-surface-alt p-lg">
      <Kicker>{label}</Kicker>
      <View className="flex-row items-baseline">
        <Text
          className={[
            'text-title-lg font-semibold tabular-nums',
            green ? 'text-green-bright' : 'text-ink',
          ].join(' ')}
        >
          {value}
        </Text>
        <Text className="ml-xs text-label text-ink-muted">{unit}</Text>
      </View>
    </View>
  );
}
