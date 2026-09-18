/**
 * TasksScreen — the day, and nothing but the day.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ DAILY TASKS                              ⟲   │
 *   │             ╭─────────╮                      │
 *   │         ‹   │   13    │   ›                  │   the day dial: the date
 *   │             │ SEP 26  │                      │   inside the day's fraction
 *   │             ╰─────────╯                      │
 *   │      (6 done) (2 left) ┆1 on purpose┆        │
 *   │ ╭────────────────────────────────────────╮   │
 *   │ │ ✓  Morning Bible reading      (🜂 12) › │   │  lit — this one is done
 *   │ │    Every day                           │   │
 *   │ ╰────────────────────────────────────────╯   │
 *   │ ╭────────────────────────────────────────╮   │
 *   │ │ ○  Evening Bible reading             › │   │
 *   │ ╰────────────────────────────────────────╯   │
 *   │                            ╭ + Add task ╮    │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE DIAL IS THE DAY ───────────────────────────────────────────────────
 *
 * The date used to be a line of text with a pager either side of it, a 6px
 * progress bar under that, and a count under THAT: three separate objects, in
 * reading order, none of them the thing the app is opened for. They are one
 * object now — `components/DayDial.tsx` — with the date drawn inside the
 * fraction, at 196 dp with a halo that brightens as the day fills. The counts
 * stayed, as three pills under it, because a ring cannot say `6 of 8` and that
 * is what you tell somebody when they ask.
 *
 * ── THE CIRCLE IS THE SCREEN ──────────────────────────────────────────────
 *
 * Everything else here is a label on it. It cycles unanswered → done → missed on
 * purpose → unanswered, and the third state is the one that makes the other two
 * mean anything: without a way to say "I chose not to", the only honest thing a
 * habit list can report is failure, so people stop answering it and it reports
 * nothing at all. `lib/tasks.ts` has the argument in full. `on purpose` leaves
 * the denominator entirely, so the ring reads `done / (asked − excused)`.
 *
 * The mark's tap target is 60 × 72 inside a 72-high card; tapping the rest of
 * the row opens that one task's own screen. Only the left column toggles.
 *
 * ── THE THREE STATES ARE THREE SURFACES ───────────────────────────────────
 *
 * Unanswered is `card` glass, done is a LIT pane with a repeating halo, and `on
 * purpose` is a DASHED outline at 72% — the same dashed vocabulary the app uses
 * for "a slot rather than a thing", because a day excused on purpose is exactly
 * that. None of the three needs colour to be told apart from the others, which
 * is what makes the list readable at arm's length.
 *
 * ── AND NONE OF THEM IS BLURRED ───────────────────────────────────────────
 *
 * `BlurView` is not free and this is the one screen that can ask for ten of
 * them at once, in a list, on the screen opened every single day. The design's
 * own fallback was "blur the done rows only"; this goes one step further and
 * flattens all of them, because a pane already 94% opaque has nothing left
 * behind it to see. The tint, the border and the halo are what say `done`. The
 * blur budget is spent on the two bars, which is where the glass does its
 * actual work — see `components/glass.tsx`.
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
 * ── THE DAY CLOSING IS THE ONE CELEBRATION ────────────────────────────────
 *
 * When the last unanswered task is answered and at least one of them was done,
 * fourteen sparks leave the dial (`components/SparkBurst.tsx`). Once per day,
 * never on a ✓ that still leaves something open, and never on a day closed
 * entirely by `on purpose`.
 *
 * ── THE MONTH AND THE TREND LEFT ──────────────────────────────────────────
 *
 * It was `Day | Month | Trend` across the top, which meant two thirds of a
 * control the user passes through every time to reach the one thing they open the
 * app for. The other two are behind the ⟲ in the corner now
 * (`TasksHistoryScreen`). `Day` stopped being a view and became this screen.
 *
 * The day itself is a PROP. The month grid is a pushed screen, and a day picked
 * in it has to outlive the screen that picked it — so `AppShell` holds it.
 *
 * ── THE PAGER GOES BACKWARDS, AND ONLY BACKWARDS ──────────────────────────
 *
 * You can walk to any past day and answer it — a day you forgot to open the app
 * on is exactly the day worth answering late. You cannot walk into tomorrow:
 * there is nothing there to tick, and a screen offering to let you tick it would
 * be offering to lie. The `›` is at 25% on today rather than absent, so the dial
 * does not shift sideways when you step back to yesterday.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { DayDial } from '../components/DayDial';
import { Icon } from '../components/Icon';
import { ReorderRow } from '../components/ReorderRow';
import { SectionTopBar } from '../components/SectionTopBar';
import { SparkBurst, SPARK_MS } from '../components/SparkBurst';
import { StreakFlame } from '../components/StreakFlame';
import { CommitMark, FloatingAction, GlassSurface, Lamps, useBarInsets } from '../components/glass';
import { pressedStyle } from '../components/motion';
import { Kicker } from '../components/primitives';
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
  asksOn,
  dayProgress,
  describeTaskRow,
  entryOf,
  streakOf,
  tasksOn,
  upcomingOnce,
} from '../lib/tasks';
import type { Language } from '../lib/i18n';
import { useTasks } from '../state/tasksStore';
import { focalType, palette, radius, textGlow } from '../theme/tokens';
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

  const bars = useBarInsets();
  const today = dayKey(new Date());
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => tasksOn(tasks, day), [tasks, day]);
  const progress = dayProgress(tasks, log, day);
  const isToday = day === today;

  /*
   * How many of the day's rows are still unanswered, and how many were excused.
   * Both are derived rather than stored — the same rule `dayProgress` follows,
   * and the counts row would otherwise be a second opinion about the ring.
   */
  const excused = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.archivedAt === null &&
          asksOn(task, day) &&
          entryOf(log, task.id, day).mark === 'missed',
      ).length,
    [tasks, log, day],
  );
  const open = progress.total - progress.done;

  /*
   * THE DAY CLOSING, and why it is a ref and not a piece of state.
   *
   * The burst has to fire on the TRANSITION into a closed day, not on every
   * render of one — otherwise walking back to a finished Tuesday would throw
   * confetti at somebody reading their own history. So the last value is
   * remembered per day, and the effect only fires when a day that was open
   * becomes closed while you are looking at it.
   */
  const closed = progress.total > 0 && open === 0 && progress.done > 0;
  const wasClosed = useRef<{ day: string; closed: boolean }>({ day, closed });
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    const previous = wasClosed.current;
    wasClosed.current = { day, closed };
    if (previous.day !== day) return;
    if (closed && !previous.closed) setCelebrating(true);
  }, [closed, day]);
  useEffect(() => {
    if (!celebrating) return;
    const timer = setTimeout(() => setCelebrating(false), SPARK_MS);
    return () => clearTimeout(timer);
  }, [celebrating]);

  /*
   * The one-day tasks that have not come round yet. Only on TODAY: on a past day
   * this would be a list of things that had not happened then either, which is
   * a sentence about nothing.
   */
  const upcoming = useMemo(
    () => (isToday ? upcomingOnce(tasks, today) : []),
    [isToday, tasks, today],
  );

  /*
   * Everything each row draws, computed once per change rather than once per
   * render.
   *
   * `streakOf` walks backwards a day at a time to the start of the run, so on a
   * task answered every day since January it is by some distance the most
   * expensive thing on this screen — and the screen re-renders on every mark, on
   * every frame of a drag, and whenever the day changes under it. Ten rows
   * recomputing a year of history each time is what makes a list feel heavy for
   * no reason anybody can point at.
   */
  const rowViews = useMemo(
    () =>
      rows.map((task) => ({
        task,
        mark: entryOf(log, task.id, day).mark,
        streak: streakOf(task, log, day),
        // `false`: the flame beside the row already says the number, and saying
        // it twice in one 72 dp card makes both copies read as decoration.
        detail: describeTaskRow(task, log, day, lang, false),
      })),
    [rows, log, day, lang],
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
      <Lamps section="Tasks" />

      {/* The ⟲ goes while a row is in the air: leaving the screen mid-drag would
          unmount the row under the finger, and there is one thing to do. */}
      <SectionTopBar
        title={t('Daily tasks')}
        onOpenHistory={lifted ? undefined : onOpenHistory}
        historyLabel={t('Task history')}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: bars.top, paddingBottom: bars.bottom }}
        showsVerticalScrollIndicator={false}
        // The list must not scroll under a row that is in the air.
        scrollEnabled={lifted == null}
      >
        {lifted && liftedTask ? (
          <View className="mx-lg mt-lg items-center">
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
            {/* THE DAY DIAL. The date is inside the fraction rather than above
                it: one object answering "what day, and how did it go" instead of
                a pager, a bar and a sentence stacked in reading order. */}
            <View className="mt-md flex-row items-center justify-center px-lg">
              <Pressable
                onPress={() => onChangeDay(shiftDay(day, -1))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('The day before')}
                style={pressedStyle}
                className="h-[34px] w-[44px] items-center justify-center"
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
              >
                <DayDial fraction={progress.fraction}>
                  <View className="items-center">
                    <Text
                      allowFontScaling={false}
                      style={[focalType.dayDial, textGlow.hero]}
                      className="font-semibold tabular-nums text-ink"
                    >
                      {dayNumber(day)}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={{ fontSize: 11, letterSpacing: 1.4 }}
                      className="mt-[6px] font-semibold uppercase tabular-nums text-ink-faint"
                    >
                      {monthLabel(day, lang)}
                    </Text>
                  </View>
                </DayDial>
              </View>

              <Pressable
                onPress={() => onChangeDay(shiftDay(day, 1))}
                disabled={isToday}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('The day after')}
                accessibilityState={{ disabled: isToday }}
                // 25% rather than absent: a chevron that vanishes on today would
                // shift the dial sideways every time you step back a day.
                //
                // A plain object and not the `pressedStyle` callback — see
                // `components/bubbles.tsx` on why a function in this prop never
                // reaches the native view.
                style={isToday ? { opacity: 0.25 } : undefined}
                className="h-[34px] w-[44px] items-center justify-center"
              >
                <Icon name="chevron-right" size={20} color={palette.inkMuted} />
              </Pressable>
            </View>

            <View className="mt-md flex-row items-center justify-center px-lg">
              <Kicker tone={isToday ? 'green' : 'faint'}>
                {isToday ? t('Today') : weekdayName(day, lang)}
              </Kicker>
            </View>

            {/* Three pills, and the third is dashed for the same reason the card
                below it is: an excused day is a slot the user deliberately left
                empty, not a thing that happened. */}
            <View className="mt-md flex-row items-center justify-center px-lg">
              {progress.total === 0 && excused === 0 ? (
                <Text className="text-label text-ink-muted">{t('Nothing asked for today')}</Text>
              ) : (
                <>
                  <CountPill label={t('{count} done', { count: progress.done })} tone="done" />
                  {open > 0 ? (
                    <CountPill label={t('{count} left', { count: open })} tone="left" />
                  ) : null}
                  {excused > 0 ? (
                    <CountPill label={t('{count} on purpose', { count: excused })} tone="excused" />
                  ) : null}
                </>
              )}
            </View>
          </>
        )}

        {/* The drag surface — its own View around the rows rather than a row
            itself, because a `ReorderRow` takes props it understands and would
            drop these on the floor. It claims a touch only while a row is
            lifted.

            ONE CARD PER ROW, with 8px of air between them. A done task is a lit
            pane, and a lit pane needs an edge of its own to be lit against. The
            gap is padding INSIDE each row's measured box, so the reorder's
            geometry still adds up. */}
        <View {...panHandlers} className="mx-lg mt-xl">
          {rowViews.map(({ task, mark, streak, detail }) => {
            const isLifted = task.id === lifted;
            return (
              <ReorderRow
                key={task.id}
                lifted={isLifted}
                dragging={lifted != null}
                dragY={dragY}
                // The row slides out of the way while the finger is still over
                // the gap, so the drop is something you can see coming.
                shift={shiftFor(task.id)}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  rowLayouts.current[task.id] = { y, height };
                }}
              >
                <View className="pb-sm">
                  <TaskRow
                    task={task}
                    mark={mark}
                    streak={streak}
                    detail={detail}
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
      </ScrollView>

      {/* The day closed. Fired from the dial's own band, which is where the eye
          already is when the last mark lands. */}
      {celebrating ? <SparkBurst y={bars.top + 100} /> : null}

      {/* `Add task` — the same slot, in the same place, as every other section's
          one commit action. It was a dashed row at the foot of the list, which
          is a target that moves as the day fills. */}
      {lifted ? null : (
        <FloatingAction label={t('Add task')} icon="plus" onPress={() => setAdding(true)} />
      )}

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

/** `SEP 2026`. Uppercased by the style it is drawn in. */
function monthLabel(day: string, lang: Language): string {
  const date = parseDay(day);
  if (!date) return '';
  return `${monthNames(lang)[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

/** One of the three counts under the dial. 30 tall, and the third one dashed. */
function CountPill({ label, tone }: { label: string; tone: 'done' | 'left' | 'excused' }) {
  const done = tone === 'done';
  const excused = tone === 'excused';
  return (
    <View
      style={{
        height: 30,
        justifyContent: 'center',
        paddingHorizontal: 12,
        marginHorizontal: 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderStyle: excused ? 'dashed' : 'solid',
        borderColor: done
          ? 'rgba(63,169,108,0.30)'
          : excused
            ? 'rgba(138,150,143,0.30)'
            : 'rgba(236,241,238,0.06)',
        backgroundColor: done
          ? 'rgba(63,169,108,0.14)'
          : excused
            ? 'transparent'
            : 'rgba(236,241,238,0.04)',
      }}
    >
      <Text
        allowFontScaling={false}
        className={[
          'text-label font-medium tabular-nums',
          done ? 'text-green-bright' : excused ? 'text-ink-faint' : 'text-ink-muted',
        ].join(' ')}
      >
        {label}
      </Text>
    </View>
  );
}

function TaskRow({
  task,
  mark,
  streak,
  detail,
  dimmed,
  onToggle,
  onOpen,
  onLongPress,
}: {
  task: Task;
  mark: TaskMark | null;
  streak: number;
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
    <GlassSurface
      tier={done ? 'lit' : 'card'}
      radius={radius.card}
      shadow="e1"
      glow={done ? 'repeating' : 'none'}
      // FLAT, all of them. The design's fallback was "blur the done rows only",
      // and this list is the case that fallback was written for — eight rows,
      // scrolling, on the one screen opened every day. On Android a blurred pane
      // re-draws what is behind it as the list moves, so the honest budget here
      // is zero: the tint, the border and the halo are what say "done", and the
      // blur behind a 94%-opaque card was never what anybody was reading.
      flat
      dashed={missed}
      tint={done ? 'rgba(63,169,108,0.115)' : missed ? 'transparent' : 'rgba(236,241,238,0.055)'}
      borderColor={
        done
          ? 'rgba(63,169,108,0.30)'
          : missed
            ? 'rgba(138,150,143,0.26)'
            : 'rgba(236,241,238,0.06)'
      }
      style={{ opacity: dimmed ? 0.4 : missed ? 0.72 : 1 }}
    >
      <View style={{ height: 72, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={onToggle}
          onLongPress={onLongPress}
          delayLongPress={280}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`${task.name}. ${t(answerOf(mark))}. ${t('Tap to change.')}`}
          accessibilityHint={onLongPress ? t('Long press, then slide to reorder') : undefined}
          style={pressedStyle}
          // 60 × 72, which is the design's own hit area for the one control on
          // this screen that is pressed without being looked at.
          className="h-[72px] w-[60px] items-center justify-center"
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
          className="h-[72px] flex-1 flex-row items-center pr-lg"
        >
          <View className="flex-1 pr-md">
            <Text
              numberOfLines={1}
              allowFontScaling={false}
              style={{ fontSize: 15, lineHeight: 20 }}
              className={missed ? 'text-ink-muted' : 'text-ink'}
            >
              {task.name}
            </Text>
            <Text
              numberOfLines={1}
              allowFontScaling={false}
              style={{ fontSize: 12, lineHeight: 16 }}
              className="mt-[2px] tabular-nums text-ink-faint"
            >
              {missed ? `${detail} · ${t('streak kept')}` : detail}
            </Text>
          </View>
          {/* Hidden while excused: the run is kept, but that day's row is not
              about the run. */}
          {missed ? null : <StreakFlame streak={streak} />}
          <View className="ml-sm">
            <Icon name="chevron-right" size={14} color={palette.inkFaint} />
          </View>
        </Pressable>
      </View>
    </GlassSurface>
  );
}

/**
 * The three answers, as three marks. The filled one is the app's shared commit
 * mark — the same gradient, edge and specular as a logged set's ✓ and focus
 * mode's DONE, so "I did that" is one object at three sizes.
 */
function Mark({ mark }: { mark: TaskMark | null }) {
  if (mark === 'done') {
    // `glow` off: `halo`'s rule is a count, and a column of nine done tasks is
    // exactly the case a per-mark halo turns into a green wall. The ROW carries
    // the repeating halo instead, once.
    return (
      <CheckPop>
        <CommitMark size={34} glyph={16} glow={false} />
      </CheckPop>
    );
  }
  if (mark === 'missed') {
    return (
      <View
        style={{ backgroundColor: 'rgba(236,241,238,0.05)' }}
        className="h-[34px] w-[34px] items-center justify-center rounded-pill"
      >
        <Icon name="x" size={12} color={palette.inkFaint} />
      </View>
    );
  }
  return (
    <View
      style={{ borderColor: palette.hairline }}
      className="h-[34px] w-[34px] rounded-pill border-[1.5px]"
    />
  );
}

/**
 * The ✓ arriving: scale 0 → 1.18 → 1 over 320 ms, on the overshoot curve.
 *
 * It runs on MOUNT and nothing else, which is the whole trick: the ✓ only
 * exists while the answer is `done`, so the component mounting IS the moment the
 * mark was made. No previous-value ref, no comparison, and no way for it to
 * replay because the row above it re-rendered — walking back to a day that was
 * finished last Tuesday shows a still ✓, because that one never mounts fresh
 * under your finger.
 *
 * `.34,1.56,.64,1` is the app's second curve and its only use here: a thing that
 * should feel CAUGHT overshoots. Everything else in the redesign is the base
 * `.2,.8,.2,1`, and keeping the exception to the two moments that earn it — this
 * and a logged set — is what stops the overshoot reading as a bounce.
 */
function CheckPop({ children }: { children: React.ReactNode }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pop, {
      toValue: 1,
      duration: 320,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    }).start();
  }, [pop]);

  return (
    <Animated.View
      style={{
        transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function answerOf(mark: TaskMark | null): string {
  if (mark === 'done') return 'Done';
  if (mark === 'missed') return 'Missed on purpose';
  return 'Not answered';
}
