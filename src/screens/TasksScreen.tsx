/**
 * TasksScreen — the day, and nothing but the day.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ DAILY TASKS                              ⟲   │
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
 * opens that one task's own screen; only the left column toggles.
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
 * ── THE MONTH AND THE TREND LEFT ──────────────────────────────────────────
 *
 * It was `Day | Month | Trend` across the top, which meant two thirds of a
 * control the user passes through every time to reach the one thing they open the
 * app for. The other two are behind the ⟲ in the corner now
 * (`TasksHistoryScreen`), the same glyph in the same place as the training log's
 * and the expenses'. `Day` stopped being a view and became this screen.
 *
 * The day itself is a PROP. The month grid is a pushed screen, and a day picked
 * in it has to outlive the screen that picked it — so `AppShell` holds it. See
 * `navigation/AppShell.tsx`.
 *
 * ── THE PAGER GOES BACKWARDS, AND ONLY BACKWARDS ──────────────────────────
 *
 * You can walk to any past day and answer it — a day you forgot to open the app
 * on is exactly the day worth answering late. You cannot walk into tomorrow:
 * there is nothing there to tick, and a screen offering to let you tick it would
 * be offering to lie. The `›` is simply absent on today.
 */

import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { ReorderRow } from '../components/ReorderRow';
import { SectionTopBar } from '../components/SectionTopBar';
import { pressedStyle } from '../components/motion';
import { AddRow, Kicker, ListCard, Separator } from '../components/primitives';
import { TaskEditorSheet } from '../components/TaskEditorSheet';
import { useDragReorder, type CardLayout } from '../hooks/useDragReorder';
import {
  WEEKDAY_LABELS,
  dayKey,
  formatLongDay,
  parseDay,
  shiftDay,
  weekdayIndex,
} from '../lib/days';
import {
  type Task,
  type TaskMark,
  dayProgress,
  describeTaskRow,
  entryOf,
  tasksOn,
} from '../lib/tasks';
import { useTasks } from '../state/tasksStore';
import { palette } from '../theme/tokens';
import type { ID } from '../types/models';

interface TasksScreenProps {
  onOpenTask: (taskId: ID) => void;
  /** The ⟲ in the corner: the month grid and the habit line. */
  onOpenHistory: () => void;
  /** The day the grid last sent back, so opening a square lands here. */
  day: string;
  onChangeDay: (day: string) => void;
}

export function TasksScreen({ onOpenTask, onOpenHistory, day, onChangeDay }: TasksScreenProps) {
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const cycleMark = useTasks((s) => s.cycleMark);
  const addTask = useTasks((s) => s.addTask);
  const reorderTasks = useTasks((s) => s.reorderTasks);

  const today = dayKey(new Date());
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => tasksOn(tasks, day), [tasks, day]);
  const progress = dayProgress(tasks, log, day);
  const isToday = day === today;

  /* The drag: the same hook and the same geometry as every other reorder here. */
  const rowLayouts = useRef<Record<ID, CardLayout>>({});
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { lifted, dragY, targetIndex, panHandlers, lift, drop, shiftFor } = useDragReorder(
    rowIds,
    rowLayouts,
    (id, toIndex) => reorderTasks(rowIds, id, toIndex),
  );
  const liftedTask = lifted ? (rows.find((row) => row.id === lifted) ?? null) : null;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      {/* The ⟲ goes while a row is in the air: leaving the screen mid-drag would
          unmount the row under the finger, and there is one thing to do. */}
      <SectionTopBar
        title="Daily tasks"
        onOpenHistory={lifted ? undefined : onOpenHistory}
        historyLabel="Task history"
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        // The list must not scroll under a row that is in the air.
        scrollEnabled={lifted == null}
      >
        <>
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
                    onPress={() => onChangeDay(shiftDay(day, -1))}
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
                    onPress={() => onChangeDay(shiftDay(day, 1))}
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
                    <ReorderRow
                      key={task.id}
                      lifted={isLifted}
                      dragging={lifted != null}
                      dragY={dragY}
                      // The row slides out of the way while the finger is still
                      // over the gap, so the drop is something you can see coming.
                      shift={shiftFor(task.id)}
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
                    </ReorderRow>
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
                Long press a row, then slide. The others open a gap where it will land.
              </Text>
            )}
          </>
        </>
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
