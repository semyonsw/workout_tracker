/**
 * TasksScreen — the day, and nothing but the day.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ DAILY TASKS                          ⟲       │
 *   │              ╭───────╮                       │
 *   │          ‹   │  13   │   ›                   │   the day dial: the date
 *   │              │SEP 26 │                       │   inside the day's fraction
 *   │              ╰───────╯                       │
 *   │                  TODAY                       │
 *   │             6 of 8 done                      │
 *   │ ╭────────────────────────────────────────╮   │
 *   │ │ ✓  Morning Bible/Narek reading       › │   │  lit — this one is done
 *   │ │    Every day · 12 in a row             │   │
 *   │ ╰────────────────────────────────────────╯   │
 *   │ ╭────────────────────────────────────────╮   │
 *   │ │ ○  Evening Bible reading             › │   │
 *   │ ╰────────────────────────────────────────╯   │
 *   │ ┆ +  Add task                            ┆   │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE DIAL IS THE DAY ───────────────────────────────────────────────────
 *
 * The date used to be a line of text with a pager either side of it, a 6px
 * progress bar under that, and a count under THAT: three separate objects, in
 * reading order, none of them the thing the app is opened for. They are one
 * object now — `components/ProgressRing.tsx` — with the date drawn inside the
 * fraction, so a glance answers "what day, and how did it go" without reading a
 * word. The count stayed, as the line under it, because a ring cannot say
 * `6 of 8` and that is what you tell somebody when they ask.
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
import { SectionGlow } from '../components/SectionGlow';
import { SectionTopBar } from '../components/SectionTopBar';
import { pressedStyle } from '../components/motion';
import { DashedAdd, Kicker } from '../components/primitives';
import { ProgressRing } from '../components/ProgressRing';
import { TaskEditorSheet } from '../components/TaskEditorSheet';
import { useDragReorder, type CardLayout } from '../hooks/useDragReorder';
import { useLanguage, useT } from '../hooks/useT';
import {
  dayKey,
  formatLongDay,
  monthNames,
  parseDay,
  shiftDay,
  weekdayIndex,
  weekdayNames,
} from '../lib/days';
import {
  type Task,
  type TaskMark,
  dayProgress,
  describeTaskRow,
  entryOf,
  tasksOn,
  upcomingOnce,
} from '../lib/tasks';
import type { Language } from '../lib/i18n';
import { useTasks } from '../state/tasksStore';
import { glass, palette } from '../theme/tokens';
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
  const t = useT();
  const lang = useLanguage();
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
  /*
   * The one-day tasks that have not come round yet. Only on TODAY: on a past day
   * this would be a list of things that had not happened then either, which is
   * a sentence about nothing.
   */
  const upcoming = useMemo(
    () => (isToday ? upcomingOnce(tasks, today) : []),
    [isToday, tasks, today],
  );

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
      <SectionGlow />

      {/* The ⟲ goes while a row is in the air: leaving the screen mid-drag would
          unmount the row under the finger, and there is one thing to do. */}
      <SectionTopBar
        title={t('Daily tasks')}
        onOpenHistory={lifted ? undefined : onOpenHistory}
        historyLabel={t('Task history')}
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
                <Kicker tone="green">
                  {t('Moving')} · {liftedTask.name}
                </Kicker>
                <Text className="mt-xs text-label tabular-nums text-ink-muted">
                  {t('Slide to move it · position {at} of {of}', {
                    at: targetIndex + 1,
                    of: rows.length,
                  })}
                </Text>
                <Pressable
                  onPress={drop}
                  accessibilityRole="button"
                  accessibilityLabel={t('Drop it here')}
                  style={pressedStyle}
                  className="mt-sm h-hit justify-center px-lg"
                >
                  <Text className="text-label font-semibold text-green-bright">{t('Drop')}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {/* THE DAY DIAL. The date is inside the fraction rather than
                    above it: one object answering "what day, and how did it go"
                    instead of a pager, a bar and a sentence stacked in reading
                    order. The chevrons keep their own 44 either side of it. */}
                <View className="mt-sm flex-row items-center justify-center px-lg">
                  <Pressable
                    onPress={() => onChangeDay(shiftDay(day, -1))}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={t('The day before')}
                    style={pressedStyle}
                    className="h-hit w-[36px] items-center justify-center"
                  >
                    <Icon name="chevron-left" size={20} color={palette.inkMuted} />
                  </Pressable>

                  <View
                    accessibilityRole="progressbar"
                    accessibilityLabel={`${formatLongDay(day, lang)}. ${
                      progress.total === 0
                        ? t('Nothing asked for today')
                        : t('{done} of {total} done', {
                            done: progress.done,
                            total: progress.total,
                          })
                    }`}
                    className="mx-sm"
                  >
                    <ProgressRing fraction={progress.fraction} size={150} stroke={9}>
                      <View className="items-center">
                        <Text className="text-[44px] font-semibold leading-[44px] tracking-[-1.4px] tabular-nums text-ink">
                          {dayNumber(day)}
                        </Text>
                        <Kicker className="mt-[6px]">{monthLabel(day, lang)}</Kicker>
                      </View>
                    </ProgressRing>
                  </View>

                  <Pressable
                    onPress={() => onChangeDay(shiftDay(day, 1))}
                    disabled={isToday}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={t('The day after')}
                    style={pressedStyle}
                    className="h-hit w-[36px] items-center justify-center"
                  >
                    {isToday ? null : (
                      <Icon name="chevron-right" size={20} color={palette.inkMuted} />
                    )}
                  </Pressable>
                </View>

                <View className="mt-md items-center px-lg">
                  <Kicker tone={isToday ? 'green' : 'faint'}>
                    {isToday ? t('Today') : weekdayName(day, lang)}
                  </Kicker>
                  <Text className="mt-[6px] text-label tabular-nums text-ink-muted">
                    {progress.total === 0
                      ? t('Nothing asked for today')
                      : t('{done} of {total} done', { done: progress.done, total: progress.total })}
                  </Text>
                </View>
              </>
            )}

            {/* The drag surface — its own View around the rows rather than a row
                itself, because a `ReorderRow` takes props it understands and
                would drop these on the floor. It claims a touch only while a row
                is lifted.

                ONE CARD PER ROW, with 8px of air between them, rather than a
                single card with hairlines. A done task is a lit surface now, and
                a lit surface needs an edge of its own to be lit against. The gap
                is padding INSIDE each row's measured box, so the reorder's
                geometry still adds up. */}
            <View {...panHandlers} className="mx-lg mt-xl">
              {rows.map((task) => {
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
                    <View className="pb-sm">
                      <TaskRow
                        task={task}
                        mark={entryOf(log, task.id, day).mark}
                        detail={describeTaskRow(task, log, day, lang)}
                        dimmed={lifted != null && !isLifted}
                        onToggle={() => cycleMark(task.id, day)}
                        onOpen={() => onOpenTask(task.id)}
                        // One row cannot be reordered, and the gesture would only
                        // ever end where it started.
                        onLongPress={rows.length > 1 ? () => lift(task.id) : undefined}
                      />
                    </View>
                  </ReorderRow>
                );
              })}
              {lifted ? null : <DashedAdd label={t('Add task')} onPress={() => setAdding(true)} />}
            </View>

            {rows.length === 0 ? (
              <Text className="mx-lg mt-lg text-label text-ink-faint">
                {t('Nothing is scheduled for this day.')}
              </Text>
            ) : null}

            {/* Stated, not listed as rows: there is no circle, because a day that
                has not arrived cannot be answered. See `upcomingOnce`. */}
            {!lifted && upcoming.length > 0 ? (
              <View className="mx-lg mt-xl">
                <Kicker>{t('Coming up')}</Kicker>
                {upcoming.map((task) => (
                  <Text
                    key={task.id}
                    numberOfLines={1}
                    className="mt-sm text-label tabular-nums text-ink-muted"
                  >
                    {task.name}
                    <Text className="text-ink-faint">
                      {'  ·  '}
                      {task.schedule.kind === 'once' ? formatLongDay(task.schedule.day, lang) : ''}
                    </Text>
                  </Text>
                ))}
              </View>
            ) : null}

            {lifted ? null : (
              <Text className="mx-lg mt-md text-label text-ink-faint">
                {t('Long press a row, then slide. The others open a gap where it will land.')}
              </Text>
            )}
          </>
        </>
      </ScrollView>

      {adding ? (
        <TaskEditorSheet
          title={t('New task')}
          onSave={(draft) => {
            addTask(draft);
            setAdding(false);
          }}
          onDismiss={() => setAdding(false)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function weekdayName(day: string, lang: Language): string {
  const date = parseDay(day);
  return date ? weekdayNames(lang)[weekdayIndex(date)] : '';
}

/** The number in the middle of the dial. Bare — the month is the line under it. */
function dayNumber(day: string): string {
  const date = parseDay(day);
  return date ? String(date.getDate()) : '';
}

/** `SEP 2026`, uppercased by the kicker it is drawn in. */
function monthLabel(day: string, lang: Language): string {
  const date = parseDay(day);
  if (!date) return '';
  return `${monthNames(lang)[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
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
  const t = useT();
  const done = mark === 'done';
  const missed = mark === 'missed';
  return (
    <View
      style={{
        backgroundColor: done ? glass.green : glass.raised,
        borderColor: done ? glass.greenEdge : palette.hairline,
        // A done row is the one lit surface in the list. The glow is the app's
        // one glow at a third of its strength: enough that a finished day reads
        // as a block of light while scrolling, never enough to be a fill.
        ...(done
          ? {
              shadowColor: palette.greenBright,
              shadowOpacity: 0.18,
              shadowRadius: 12,
              elevation: 3,
            }
          : {}),
        opacity: dimmed ? 0.4 : missed ? 0.62 : 1,
      }}
      className="h-row-lg flex-row items-center overflow-hidden rounded-card border"
    >
      <Pressable
        onPress={onToggle}
        onLongPress={onLongPress}
        delayLongPress={280}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${task.name}. ${t(answerOf(mark))}. ${t('Tap to change.')}`}
        accessibilityHint={onLongPress ? t('Long press, then slide to reorder') : undefined}
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
        accessibilityLabel={`${task.name}. ${detail}. ${t('Open the month.')}`}
        accessibilityHint={onLongPress ? t('Long press, then slide to reorder') : undefined}
        style={pressedStyle}
        className="h-row-lg flex-1 flex-row items-center pr-lg"
      >
        <View className="flex-1 pr-md">
          <Text
            numberOfLines={1}
            className={['text-body', missed ? 'text-ink-muted' : 'text-ink'].join(' ')}
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

/**
 * The three answers, as three marks. Green fill is the only one that is filled,
 * and it is the only one that carries the glow — the ring around a done task is
 * what you are looking for when you scan the list.
 */
function Mark({ mark }: { mark: TaskMark | null }) {
  if (mark === 'done') {
    return (
      <View
        style={{
          backgroundColor: palette.green,
          borderColor: palette.greenBright,
          shadowColor: palette.greenBright,
          shadowOpacity: 0.55,
          shadowRadius: 8,
          elevation: 4,
        }}
        className="h-[30px] w-[30px] items-center justify-center rounded-pill border"
      >
        <Icon name="check" size={15} color={palette.ink} />
      </View>
    );
  }
  if (mark === 'missed') {
    return (
      <View className="h-[30px] w-[30px] items-center justify-center rounded-pill border border-hairline bg-surface-alt">
        <Icon name="x" size={12} color={palette.inkFaint} />
      </View>
    );
  }
  return <View className="h-[30px] w-[30px] rounded-pill border-[1.5px] border-hairline" />;
}

function answerOf(mark: TaskMark | null): string {
  if (mark === 'done') return 'Done';
  if (mark === 'missed') return 'Missed on purpose';
  return 'Not answered';
}
