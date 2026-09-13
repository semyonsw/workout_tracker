/**
 * TasksScreen — the day, the month, and the trend.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │        ╭ Day ╮╭ Month ╮╭ Trend ╮             │
 *   │        ‹   13 September 2026   ›             │
 *   │                  TODAY                       │
 *   │ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔             │
 *   │ 6 of 8 done                                  │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ ✓  Morning Bible/Narek reading         › │ │
 *   │ │    Every day · 12 in a row               │ │
 *   │ │ ○  Evening Bible reading               › │ │
 *   │ │ ✕  Book reading before sleep           › │ │
 *   │ │    Every day · missed on purpose · …     │ │
 *   │ │ +  Add task                              │ │
 *   │ └──────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE CIRCLE IS THE SCREEN ──────────────────────────────────────────────
 *
 * Everything else here is a label on it. It cycles unanswered → done → missed on
 * purpose → unanswered, and the third state is the one that makes the other two
 * mean anything: without a way to say "I chose not to", the only honest thing a
 * habit list can report is failure, so people stop answering it and it reports
 * nothing at all. `lib/tasks.ts` has the argument in full.
 *
 * The circle is 28px inside a 64-high row, so the TAP TARGET is the row's full
 * height and the glyph is just where it is drawn. Tapping the rest of the row
 * opens the month; only the left column toggles.
 *
 * ── LONG PRESS LIFTS A ROW, AND THE LIST IS THE DAY'S LIST ────────────────
 *
 * The same gesture, the same hook and the same `Drop` escape as the routine
 * editor and the logging screen: `hooks/useDragReorder.ts`. What is different
 * here is what is on screen — the day shows only the tasks that ASKED for
 * something, so a Mon/Wed/Fri row is genuinely absent on a Tuesday, and dragging
 * the third visible row to the top has to mean third VISIBLE row. That is
 * `reorderWithinVisible` in `lib/tasks.ts`, and the whole reason the store takes
 * the visible ids rather than a bare index.
 *
 * ── THREE VIEWS, ONE TAB ──────────────────────────────────────────────────
 *
 * `Day` answers what do I do now. `Month` answers which day do I want to open —
 * a grid of every day, filled by how much of it got done, and tapping one lands
 * the Day view on it. `Trend` answers is this getting better, over a range you
 * pick. They are one tab because they are one question at three zoom levels, and
 * because the tab bar's five labels are already the width of the screen.
 *
 * ── THE PAGER GOES BACKWARDS, AND ONLY BACKWARDS ──────────────────────────
 *
 * You can walk to any past day and answer it — a day you forgot to open the app
 * on is exactly the day worth answering late. You cannot walk into tomorrow:
 * there is nothing there to tick, and a screen offering to let you tick it would
 * be offering to lie. The `›` is simply absent on today.
 */

import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { TrendChart } from '../components/TrendChart';
import { pressedStyle } from '../components/motion';
import {
  AddRow,
  Kicker,
  ListCard,
  SelectChip,
  Segmented,
  Separator,
} from '../components/primitives';
import { TaskEditorSheet } from '../components/TaskEditorSheet';
import { useDragReorder, type CardLayout } from '../hooks/useDragReorder';
import {
  WEEKDAY_INITIALS,
  WEEKDAY_LABELS,
  dayKey,
  formatLongDay,
  formatShortDay,
  parseDay,
  shiftDay,
  weekdayIndex,
} from '../lib/days';
import { tap } from '../lib/feedback';
import {
  type DayCell,
  type Task,
  type TaskLog,
  type TaskMark,
  dayProgress,
  describeTaskRow,
  entryOf,
  summarizeTaskTrend,
  taskTrendSeries,
  tasksMonth,
  tasksOn,
} from '../lib/tasks';
import { TREND_RANGES, TREND_RANGE_LABELS, type TrendRange } from '../lib/trends';
import { useTasks } from '../state/tasksStore';
import { palette } from '../theme/tokens';
import type { ID } from '../types/models';

type View3 = 'day' | 'month' | 'trend';

const VIEWS = [
  { value: 'day' as const, label: 'Day' },
  { value: 'month' as const, label: 'Month' },
  { value: 'trend' as const, label: 'Trend' },
];

interface TasksScreenProps {
  onOpenTask: (taskId: ID) => void;
  /** Export or import the task log on its own. See `SectionDataScreen`. */
  onOpenData: () => void;
}

export function TasksScreen({ onOpenTask, onOpenData }: TasksScreenProps) {
  const insets = useSafeAreaInsets();
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const cycleMark = useTasks((s) => s.cycleMark);
  const addTask = useTasks((s) => s.addTask);
  const reorderTasks = useTasks((s) => s.reorderTasks);

  const today = dayKey(new Date());
  const [view, setView] = useState<View3>('day');
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => tasksOn(tasks, day), [tasks, day]);
  const progress = dayProgress(tasks, log, day);
  const isToday = day === today;

  /* The drag: the same hook and the same geometry as every other reorder here. */
  const rowLayouts = useRef<Record<ID, CardLayout>>({});
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { lifted, dragY, targetIndex, panHandlers, lift, drop } = useDragReorder(
    rowIds,
    rowLayouts,
    (id, toIndex) => reorderTasks(rowIds, id, toIndex),
  );
  const liftedTask = lifted ? (rows.find((row) => row.id === lifted) ?? null) : null;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        // The list must not scroll under a row that is in the air.
        scrollEnabled={lifted == null}
      >
        {/* The view switch hides while a row is lifted: one thing at a time, and
            switching views mid-drag would unmount the row under the finger. */}
        {lifted ? null : (
          <View className="mx-lg mb-lg">
            <Segmented
              options={VIEWS}
              value={view}
              onChange={(next) => {
                tap();
                setView(next);
              }}
              accessibilityLabel="The day, the month, or the trend"
            />
          </View>
        )}

        {view === 'day' ? (
          <>
            {lifted && liftedTask ? (
              <View className="mx-lg items-center">
                <Kicker tone="green">Moving · {liftedTask.name}</Kicker>
                <Text className="mt-xs text-label tabular-nums text-ink-muted">
                  Slide to move it · position {targetIndex + 1} of {rows.length}
                </Text>
                <Pressable
                  onPress={drop}
                  accessibilityRole="button"
                  accessibilityLabel="Drop it here"
                  style={pressedStyle}
                  className="mt-sm h-hit justify-center px-lg"
                >
                  <Text className="text-label font-semibold text-green-bright">Drop</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View className="mx-lg flex-row items-center justify-center">
                  <Pressable
                    onPress={() => setDay(shiftDay(day, -1))}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="The day before"
                    style={pressedStyle}
                    className="h-hit w-[32px] items-center justify-center"
                  >
                    <Icon name="chevron-left" size={20} color={palette.inkMuted} />
                  </Pressable>

                  <Text className="mx-lg text-title font-semibold tabular-nums text-ink">
                    {formatLongDay(day)}
                  </Text>

                  <Pressable
                    onPress={() => setDay(shiftDay(day, 1))}
                    disabled={isToday}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="The day after"
                    style={pressedStyle}
                    className="h-hit w-[32px] items-center justify-center"
                  >
                    {isToday ? null : (
                      <Icon name="chevron-right" size={20} color={palette.inkMuted} />
                    )}
                  </Pressable>
                </View>

                <View className="mx-lg items-center">
                  <Kicker tone={isToday ? 'green' : 'faint'}>
                    {isToday ? 'Today' : weekdayName(day)}
                  </Kicker>
                </View>

                {/* 6px of track, and the app's one progress bar. It is a ratio, not a
                    target: a day that asked for nothing reads full rather than empty. */}
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel={`${progress.done} of ${progress.total} done`}
                  className="mx-lg mt-lg h-[6px] overflow-hidden rounded-pill bg-green-dim"
                >
                  <View
                    className="h-[6px] rounded-pill bg-green-bright"
                    style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                  />
                </View>
                <Text className="mx-lg mt-sm text-label tabular-nums text-ink-muted">
                  {progress.total === 0
                    ? 'Nothing asked for today'
                    : `${progress.done} of ${progress.total} done`}
                </Text>
              </>
            )}

            {/* The drag surface — its own View around the card rather than the card
                itself, because `ListCard` takes props it understands and would drop
                these on the floor. It claims a touch only while a row is lifted. */}
            <View {...panHandlers}>
              <ListCard className="mx-lg mt-lg" clip={lifted == null}>
                {rows.map((task, index) => {
                  const isLifted = task.id === lifted;
                  return (
                    <Animated.View
                      key={task.id}
                      // While a row is in the air NOTHING in the list is tappable: a
                      // finger sliding a row across a circle must not answer a task.
                      pointerEvents={lifted ? 'none' : 'auto'}
                      style={
                        isLifted
                          ? { transform: [{ translateY: dragY }], zIndex: 2, elevation: 2 }
                          : undefined
                      }
                      onLayout={(e) => {
                        const { y, height } = e.nativeEvent.layout;
                        rowLayouts.current[task.id] = { y, height };
                      }}
                    >
                      {index > 0 ? <Separator /> : null}
                      <TaskRow
                        task={task}
                        mark={entryOf(log, task.id, day).mark}
                        detail={describeTaskRow(task, log, day)}
                        dimmed={lifted != null && !isLifted}
                        onToggle={() => cycleMark(task.id, day)}
                        onOpen={() => onOpenTask(task.id)}
                        // One row cannot be reordered, and the gesture would only
                        // ever end where it started.
                        onLongPress={rows.length > 1 ? () => lift(task.id) : undefined}
                      />
                    </Animated.View>
                  );
                })}
                {lifted ? null : (
                  <>
                    {rows.length > 0 ? <Separator inset={0} /> : null}
                    <AddRow label="Add task" tone="faint" onPress={() => setAdding(true)} />
                  </>
                )}
              </ListCard>
            </View>

            {rows.length === 0 ? (
              <Text className="mx-lg mt-lg text-label text-ink-faint">
                Nothing is scheduled for this day.
              </Text>
            ) : null}

            {lifted ? null : (
              <Text className="mx-lg mt-md text-label text-ink-faint">
                Long press a row, then slide to reorder it.
              </Text>
            )}
          </>
        ) : null}

        {view === 'month' ? (
          <MonthView
            tasks={tasks}
            log={log}
            today={today}
            selected={day}
            onPick={(picked) => {
              tap();
              setDay(picked);
              setView('day');
            }}
          />
        ) : null}

        {view === 'trend' ? <TrendView tasks={tasks} log={log} today={today} /> : null}

        {lifted ? null : (
          <View className="mx-lg mt-xxl">
            <Pressable
              onPress={onOpenData}
              accessibilityRole="button"
              accessibilityLabel="Export or import the daily tasks"
              style={pressedStyle}
              className="h-row flex-row items-center rounded-surface border border-hairline bg-surface px-lg"
            >
              <Text className="flex-1 text-body font-medium text-ink">
                Export or import daily tasks
              </Text>
              <Icon name="chevron-right" size={16} color={palette.inkFaint} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      {adding ? (
        <TaskEditorSheet
          title="New task"
          onSave={(name, schedule) => {
            addTask(name, schedule);
            setAdding(false);
          }}
          onDismiss={() => setAdding(false)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function weekdayName(day: string): string {
  const date = parseDay(day);
  return date ? WEEKDAY_LABELS[weekdayIndex(date)] : '';
}

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
  const [range, setRange] = useState<TrendRange>('month');
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
            label={TREND_RANGE_LABELS[option]}
            selected={option === range}
            onPress={() => {
              tap();
              setRange(option);
            }}
          />
        ))}
      </View>

      <View className="mx-lg mt-md flex-row gap-md">
        <Well label="Done" value={`${summary.percent}%`} unit={`of ${summary.asked}`} green />
        <Well label="Full days" value={String(summary.perfectDays)} unit={`of ${summary.days}`} />
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

function TaskRow({
  task,
  mark,
  detail,
  dimmed,
  onToggle,
  onOpen,
  onLongPress,
}: {
  task: Task;
  mark: TaskMark | null;
  detail: string;
  dimmed: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onLongPress?: () => void;
}) {
  return (
    <View className="h-row-lg flex-row items-center" style={dimmed ? { opacity: 0.4 } : undefined}>
      <Pressable
        onPress={onToggle}
        onLongPress={onLongPress}
        delayLongPress={280}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: mark === 'done' }}
        accessibilityLabel={`${task.name}. ${answerOf(mark)}. Tap to change.`}
        accessibilityHint={onLongPress ? 'Long press, then slide to reorder' : undefined}
        style={pressedStyle}
        className="h-row-lg w-[56px] items-center justify-center"
      >
        <Mark mark={mark} />
      </Pressable>

      <Pressable
        onPress={onOpen}
        onLongPress={onLongPress}
        delayLongPress={280}
        accessibilityRole="button"
        accessibilityLabel={`${task.name}. ${detail}. Open the month.`}
        accessibilityHint={onLongPress ? 'Long press, then slide to reorder' : undefined}
        style={pressedStyle}
        className="h-row-lg flex-1 flex-row items-center pr-lg"
      >
        <View className="flex-1 pr-md">
          <Text
            numberOfLines={1}
            className={['text-body', mark === 'missed' ? 'text-ink-muted' : 'text-ink'].join(' ')}
          >
            {task.name}
          </Text>
          <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
            {detail}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={palette.inkFaint} />
      </Pressable>
    </View>
  );
}

/** The three answers, as three marks. Green fill is the only one that is filled. */
function Mark({ mark }: { mark: TaskMark | null }) {
  if (mark === 'done') {
    return (
      <View className="h-[28px] w-[28px] items-center justify-center rounded-pill bg-green">
        <Icon name="check" size={14} color={palette.ink} />
      </View>
    );
  }
  if (mark === 'missed') {
    return (
      <View className="h-[28px] w-[28px] items-center justify-center rounded-pill bg-surface-alt">
        <Icon name="x" size={12} color={palette.inkFaint} />
      </View>
    );
  }
  return <View className="h-[28px] w-[28px] rounded-pill border border-hairline" />;
}

function answerOf(mark: TaskMark | null): string {
  if (mark === 'done') return 'Done';
  if (mark === 'missed') return 'Missed on purpose';
  return 'Not answered';
}
