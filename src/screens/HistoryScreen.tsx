/**
 * HistoryScreen — every workout you have actually finished.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ HISTORY                                      │
 *   │ 12 workouts · 214 sets · 41 200 kg           │
 *   │ SETS PER CLUSTER          [4w][12w][ All ]   │
 *   │ pull    42  ██████████████████████           │
 *   │ push    31  ████████████████                 │
 *   │ core    18  █████████                        │
 *   │ legs     8  ████                             │
 *   │ cardio   0                                   │
 *   │ AUGUST                                       │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Pull + swimming          17 Aug · 74 min │ │
 *   │ │ 6 exercises · 18 sets · 4 720 kg       ⌄ │ │
 *   │ │  Weighted 90° pull-ups   +40 kg · 4 4 4  │ │  ← open
 *   │ │                             12 REPS TOTAL │ │
 *   │ │    1   40 kg    4 reps               ⌄   │ │
 *   │ │        −2  −0.5   40 KG   +0.5  +2       │ │  ← one row, correcting
 *   │ │        Reps    Remove set        Done    │ │
 *   │ │  Plank                   2:00 · 2:00     │ │
 *   │ │                                4:00 TOTAL │ │
 *   │ │  Delete this workout                     │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Push                      15 Aug · 51 min│ │
 *   │ └──────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────┘
 *
 * Design decisions worth keeping:
 *
 *  • A ROW OPENS IN PLACE. Tapping a workout expands it rather than pushing a
 *    detail screen. What you want from history is almost always one line — "what
 *    did I do last Tuesday" — and a route you have to come back from turns a
 *    glance into navigation. The exercise lines use the SAME shorthand as the
 *    exercise cards and the exercise-history screen, so a session reads the same
 *    everywhere it appears.
 *  • GROUPED BY MONTH, NOT PAGINATED. A training log is read backwards from today
 *    and the interesting unit is "this month". The month kicker is what carries the
 *    year, and only when it isn't the current one — a log full of "2026" is noise.
 *  • A TYPO IS NOT A WORKOUT. Tapping an exercise line inside an open workout
 *    lists its logged sets, and one of them at a time can be corrected with the
 *    same ± chips the session uses. 40 kg typed where 4 was meant used to cost the
 *    whole session — delete the workout and re-enter it was the only route, and it
 *    also took those sets out of what the prefills and the suggestions read.
 *
 *    Every number around the corrected row is REGENERATED, never patched: the
 *    store hands the new row list to `recomputeWorkout`, which reruns
 *    `summarizeSessionSets` and the volume maths that built the record in the first
 *    place. So the shorthand, the set count, the exercise total and the volume
 *    cannot drift from the rows they claim to describe.
 *
 *    ONE ROW AT A TIME, AND VISIBLY. The set being corrected is the only one with
 *    an editor under it, and it stays on screen while it changes — this is the one
 *    place in the app where a number the user is looking at is already history, so
 *    it has to be obvious which row is being touched.
 *  • DELETE IS INSIDE THE OPEN ROW, AND IT ASKS. History is the one thing in this
 *    app that must be true, so removing a piece of it is never a swipe away: you
 *    open the workout, read what it was, and then confirm.
 *  • EVERY EXERCISE STATES ITS TOTAL. Under the per-set line — "+40 kg · 4 4 4"
 *    — sits the sum of those counts: 12 reps, or 4:00 of plank. It is the number
 *    you actually compare between sessions, and reading a row of per-set counts is
 *    the one piece of mental arithmetic this screen used to make you do. Only when
 *    there was more than one set, because the total of one set is the set.
 *  • THE TOTALS LINE IS A FACT, NOT A GOAL. No streaks, no badges, no weekly
 *    target. Three numbers that say how much training is in here.
 *  • SETS PER CLUSTER IS A COUNT, NOT A SCORE. `lib/muscles.ts` files every
 *    exercise under exactly one cluster and every set row carries its
 *    `exerciseId`; nothing had ever joined the two across history, so the one
 *    thing a lifter could not see was the one thing the data answers for free.
 *    It states counts and stops: no target, no ratio to hit, no cluster
 *    coloured as neglected, no "you should train legs". A cluster with zero sets
 *    shows zero, and that IS the feature — "legs 0" over twelve weeks is a fact,
 *    and what to do about it belongs to the person who did the training.
 *    The bar is `green-dim`, scaled to the largest cluster, and it is a
 *    comparison between the user's own numbers rather than against a goal.
 *  • AND WHEN A NUMBER CANNOT BE STOOD BEHIND, IT IS NOT SHOWN. Session volume
 *    needs a bodyweight to weigh a push-up or a −20 kg assisted pull-up, and the
 *    app is only told one if the user types it in `Settings → Body`. A workout
 *    logged without it carries `volumeIsPartial`, and both the header total and
 *    the row's own line drop their volume clause rather than print a figure that
 *    silently omits half the session. A missing clause is a gap somebody can ask
 *    about; a wrong total is one nobody can spot.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, ListCard, Segmented, Separator } from '../components/primitives';
import {
  BALANCE_WINDOWS,
  balanceWindowDays,
  clusterBalance,
  describeClusterTotals,
  type BalanceWindow,
  type ClusterCount,
} from '../lib/balance';
import { tap, undo } from '../lib/feedback';
import { monthKey, type CompletedExercise, type CompletedWorkout } from '../lib/completedWorkout';
import { clusterLabel } from '../lib/muscles';
import {
  countStep,
  countUnitLabel,
  formatCount,
  formatDuration,
  formatShortDate,
  formatWeight,
  kgToLb,
  lbToKg,
  unitLabel,
  weightSteps,
} from '../lib/units';
import { historyTotals } from '../state/workoutHistoryStore';
import { palette } from '../theme/tokens';
import type { Exercise, ID, SetHistory, UnitSystem } from '../types/models';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface HistoryScreenProps {
  workouts: CompletedWorkout[];
  /** The library, for the muscles behind the cluster counts. */
  exercisesById: Record<ID, Exercise>;
  /**
   * A workout to open and scroll to, from a tap somewhere else in the app.
   *
   * Home's `RECENT` rows and the exercise-history session rows both hand over a
   * workout id, and both used to have it thrown away — you landed at the top of
   * this screen and hunted for the row you had just tapped. An id that no longer
   * resolves opens nothing and is not an error: the workout may have been deleted
   * between the tap and the render.
   */
  focusWorkoutId?: ID | null;
  /** Called once the id above has been acted on, so it fires once and not again. */
  onFocusHandled?: () => void;
  unitSystem: UnitSystem;
  onDelete: (id: ID) => void;
  /**
   * Correct one logged set. The store recomputes every derived number from the
   * rows — see `recomputeWorkout` — so this screen never patches a summary string.
   */
  onEditSet: (
    workoutId: ID,
    setId: ID,
    patch: { weightKg?: number | null; count?: number },
  ) => void;
  /** Remove one logged set. False when it was refused — the last row of a workout. */
  onDeleteSet: (workoutId: ID, setId: ID) => boolean;
}

export function HistoryScreen({
  workouts,
  exercisesById,
  focusWorkoutId,
  onFocusHandled,
  unitSystem,
  onDelete,
  onEditSet,
  onDeleteSet,
}: HistoryScreenProps) {
  /** The open workout, and the one being deleted. Both are screen-local. */
  const [openId, setOpenId] = useState<ID | null>(null);
  const [deleting, setDeleting] = useState<CompletedWorkout | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  /**
   * Where each workout row sits in the SCROLL CONTENT, captured on layout.
   *
   * `onLayout` reports a y relative to the immediate parent, so a row's position
   * in the scroll is the sum of three: the month group's offset in the content,
   * the card's offset inside that group (a Kicker sits above it), and the row's
   * offset inside the card. Each level records its own, which is why there are
   * three refs instead of one — and why none of them guesses a Kicker's height.
   *
   * Refs rather than state: written during layout, read by an effect. In state,
   * every row measuring itself would re-render the list.
   */
  const monthOffsets = useRef<Record<string, number>>({});
  const cardOffsets = useRef<Record<string, number>>({});
  const rowOffsets = useRef<Record<ID, { monthKey: string; y: number }>>({});
  /**
   * The balance window. Four weeks by default: long enough that one missed
   * session does not swing it, short enough that it is about now.
   */
  const [window, setWindow] = useState<BalanceWindow>('4w');

  const totals = useMemo(() => historyTotals(workouts), [workouts]);
  const months = useMemo(() => groupByMonth(workouts), [workouts]);
  const balance = useMemo(
    () => clusterBalance({ workouts, exercisesById, windowDays: balanceWindowDays(window) }),
    [workouts, exercisesById, window],
  );

  /*
   * OPEN THE WORKOUT SOMEBODY TAPPED, and scroll it into view.
   *
   * Two steps rather than one, because the row cannot be scrolled to until it has
   * been measured and it is only measured once it is rendered. So the effect opens
   * it immediately and asks for the scroll on the next frame, by which time the
   * expanded row's `onLayout` has run and `rowOffsets` knows where it is.
   *
   * `onFocusHandled` IS CALLED FROM INSIDE THE FRAME, and that is not a detail.
   * Calling it beside `setOpenId` clears the parent's id, which changes this
   * effect's deps, which runs its CLEANUP — and the cleanup cancels the frame that
   * has not fired yet. The row opened and never scrolled, which is the half of this
   * feature that is hard to notice in a list short enough to fit on screen.
   * Deferring the callback keeps the deps stable until the scroll has happened.
   *
   * An id that does not resolve is handled and forgotten rather than treated as an
   * error: the workout may have been deleted between the tap and this render, and
   * landing at the top of History is the right outcome for that.
   */
  useEffect(() => {
    if (!focusWorkoutId) return;

    if (!workouts.some((w) => w.id === focusWorkoutId)) {
      onFocusHandled?.();
      return;
    }
    setOpenId(focusWorkoutId);

    const frame = requestAnimationFrame(() => {
      const row = rowOffsets.current[focusWorkoutId];
      if (row != null) {
        const y =
          (monthOffsets.current[row.monthKey] ?? 0) +
          (cardOffsets.current[row.monthKey] ?? 0) +
          row.y;
        // −8 so the row is not flush against the header's hairline.
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }
      // Only now: see above.
      onFocusHandled?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusWorkoutId, onFocusHandled, workouts]);

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={deleting ? { opacity: 0.28 } : undefined}>
        <ScreenHeader
          kicker="History"
          subtitle={
            totals.workouts > 0
              ? `${totals.workouts} ${totals.workouts === 1 ? 'workout' : 'workouts'} · ${totals.sets} sets${
                  totals.volumeKg > 0 && !totals.volumeIsPartial
                    ? ` · ${formatKg(totals.volumeKg)}`
                    : ''
                }`
              : undefined
          }
          bordered={false}
        />

        {workouts.length === 0 ? (
          <Empty />
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!deleting}
          >
            {/* ----------------------------------------------------------
                SETS PER CLUSTER — above the months, because it is about the
                shape of recent training rather than about one session. */}
            {balance.totalSets > 0 ? (
              <View className="mb-lg">
                <View className="mx-lg mb-sm flex-row items-center">
                  <Kicker className="flex-1">Sets per cluster</Kicker>
                </View>
                <View className="mx-lg mb-md">
                  <Segmented
                    options={BALANCE_WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
                    value={window}
                    onChange={(next) => {
                      tap();
                      setWindow(next);
                    }}
                    accessibilityLabel="How far back the cluster counts reach"
                  />
                </View>
                <ListCard className="mx-lg">
                  {balance.clusters.map((row, index) => (
                    <View key={row.cluster}>
                      {index > 0 ? <Separator /> : null}
                      <ClusterRow row={row} maxSets={balance.maxSets} />
                    </View>
                  ))}
                  {/* Only when there is something to say. Sets whose exercise has
                      been deleted still happened, and a total that quietly omitted
                      them would be worse than one that admits it cannot place
                      them. */}
                  {balance.unfiled > 0 ? (
                    <>
                      <Separator />
                      <View className="min-h-[44px] flex-row items-center px-lg py-sm">
                        <Text className="flex-1 text-label text-ink-faint">
                          Exercise since deleted
                        </Text>
                        <Text className="text-label font-semibold tabular-nums text-ink-faint">
                          {balance.unfiled}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </ListCard>
              </View>
            ) : null}

            {months.map((month) => (
              <View
                key={month.key}
                onLayout={(e) => {
                  monthOffsets.current[month.key] = e.nativeEvent.layout.y;
                }}
              >
                <Kicker className="mx-lg mb-sm mt-xl">{month.label}</Kicker>
                <View
                  onLayout={(e) => {
                    cardOffsets.current[month.key] = e.nativeEvent.layout.y;
                  }}
                >
                  <ListCard className="mx-lg">
                    {month.workouts.map((workout, index) => (
                      <View
                        key={workout.id}
                        onLayout={(e) => {
                          rowOffsets.current[workout.id] = {
                            monthKey: month.key,
                            y: e.nativeEvent.layout.y,
                          };
                        }}
                      >
                        {index > 0 ? <Separator /> : null}
                        <WorkoutRow
                          workout={workout}
                          isOpen={openId === workout.id}
                          unitSystem={unitSystem}
                          onEditSet={(setId, patch) => onEditSet(workout.id, setId, patch)}
                          onDeleteSet={(setId) => onDeleteSet(workout.id, setId)}
                          onPress={() => {
                            tap();
                            setOpenId((current) => (current === workout.id ? null : workout.id));
                          }}
                          onDelete={() => {
                            undo();
                            setDeleting(workout);
                          }}
                        />
                      </View>
                    ))}
                  </ListCard>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {deleting ? (
        <ConfirmSheet
          title={`Delete “${deleting.title}”?`}
          body={`${formatShortDate(deleting.startedAt)} · ${deleting.setCount} ${
            deleting.setCount === 1 ? 'set' : 'sets'
          }. This is the record of a workout you did — deleting it also removes those sets from what the overload suggestions read.`}
          confirmLabel="Delete it"
          cancelLabel="Keep it"
          onConfirm={() => {
            onDelete(deleting.id);
            setDeleting(null);
            setOpenId(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function WorkoutRow({
  workout,
  isOpen,
  unitSystem,
  onPress,
  onDelete,
  onEditSet,
  onDeleteSet,
}: {
  workout: CompletedWorkout;
  isOpen: boolean;
  unitSystem: UnitSystem;
  onPress: () => void;
  onDelete: () => void;
  onEditSet: (setId: ID, patch: { weightKg?: number | null; count?: number }) => void;
  onDeleteSet: (setId: ID) => boolean;
}) {
  const exerciseCount = workout.exercises.length;
  /** The exercise whose logged sets are listed, and the set being corrected. */
  const [openExerciseId, setOpenExerciseId] = useState<ID | null>(null);
  const [editing, setEditing] = useState<{ setId: ID; field: 'weight' | 'count' } | null>(null);

  return (
    <View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${workout.title}, ${formatShortDate(workout.startedAt)}, ${workout.setCount} sets, ${workout.durationMinutes} minutes`}
        className="min-h-[64px] flex-row items-center px-lg py-md"
      >
        <View className="flex-1 pr-md">
          <Text numberOfLines={1} className="text-body font-medium text-ink">
            {workout.title}
          </Text>
          <Text className="mt-[2px] text-label tabular-nums text-ink-faint">
            {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'} · {workout.setCount}{' '}
            {workout.setCount === 1 ? 'set' : 'sets'}
            {workout.totalVolumeKg > 0 && !workout.volumeIsPartial
              ? ` · ${formatKg(workout.totalVolumeKg)}`
              : ''}
          </Text>
        </View>

        <Text className="mr-sm text-label tabular-nums text-ink-muted">
          {formatShortDate(workout.startedAt)} · {workout.durationMinutes} min
        </Text>
        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={18} color={palette.inkFaint} />
      </Pressable>

      {isOpen ? (
        <View className="bg-surface-alt pb-sm">
          {workout.exercises.map((exercise) => {
            const total = describeTotal(exercise);
            const listing = openExerciseId === exercise.exerciseId;
            const rows = listing
              ? workout.sets
                  .filter((row) => row.exerciseId === exercise.exerciseId)
                  .sort((a, b) => a.setIndex - b.setIndex)
              : [];

            return (
              <View key={`${exercise.exerciseId}-${exercise.name}`}>
                <Pressable
                  onPress={() => {
                    tap();
                    setEditing(null);
                    setOpenExerciseId((current) =>
                      current === exercise.exerciseId ? null : exercise.exerciseId,
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: listing }}
                  accessibilityLabel={`${exercise.name}, ${exercise.summary}. Correct a set.`}
                  className="flex-row items-start px-lg py-sm"
                >
                  <Text numberOfLines={1} className="flex-1 pr-md text-label font-medium text-ink">
                    {exercise.name}
                  </Text>
                  <View className="items-end">
                    <Text className="text-label tabular-nums text-ink-muted">
                      {exercise.summary}
                    </Text>
                    {total ? (
                      <Text className="mt-[2px] text-micro font-semibold uppercase tabular-nums text-green-bright">
                        {total}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>

                {/* The logged rows, one correctable at a time. See the header. */}
                {listing
                  ? rows.map((row, index) => (
                      <LoggedSetRow
                        key={row.id}
                        row={row}
                        number={index + 1}
                        unitSystem={unitSystem}
                        editing={editing?.setId === row.id ? editing.field : null}
                        onFocusField={(field) =>
                          setEditing((current) =>
                            current?.setId === row.id && current.field === field
                              ? null
                              : { setId: row.id, field },
                          )
                        }
                        onChange={(patch) => onEditSet(row.id, patch)}
                        onRemove={() => {
                          if (onDeleteSet(row.id)) setEditing(null);
                        }}
                        onDone={() => setEditing(null)}
                        canRemove={workout.sets.length > 1}
                      />
                    ))
                  : null}
              </View>
            );
          })}

          {/* No red, and not a swipe: see the file header. */}
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={`Delete the ${workout.title} workout`}
            className="h-hit justify-center px-lg"
          >
            <Text className="text-label font-medium text-ink-faint">Delete this workout</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One cluster: name, count, bar.
 *
 * The bar is `green-dim` and scaled to the LARGEST cluster, not to a target — it
 * compares the user's own numbers to each other, which is the only comparison
 * this screen is willing to draw. A cluster with no sets gets no bar and a plain
 * `0`, because a zero-width bar reads as a rendering failure and the zero is the
 * information.
 *
 * The count is `ink` even at zero: it is a fact, not a warning, and dimming it
 * would be the screen having an opinion.
 */
function ClusterRow({ row, maxSets }: { row: ClusterCount; maxSets: number }) {
  const fraction = maxSets > 0 ? row.sets / maxSets : 0;
  const totals = describeClusterTotals(row.totals, formatDuration);

  return (
    <View
      className="min-h-[44px] flex-row items-center px-lg py-sm"
      accessibilityLabel={`${clusterLabel(row.cluster)}, ${row.sets} ${
        row.sets === 1 ? 'set' : 'sets'
      }${totals ? `, ${totals}` : ''}`}
    >
      <Text className="w-[64px] text-label font-medium text-ink">{clusterLabel(row.cluster)}</Text>
      <Text className="w-[36px] text-body font-semibold tabular-nums text-ink">{row.sets}</Text>

      {/* The bar, and what those sets added up to, on one line. */}
      <View className="ml-sm flex-1">
        <View className="h-[6px] flex-row overflow-hidden rounded-pill">
          <View className="bg-green-dim" style={{ flex: fraction }} />
          <View style={{ flex: Math.max(0, 1 - fraction) }} />
        </View>
        {totals ? (
          <Text className="mt-[3px] text-micro tabular-nums text-ink-faint">{totals}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * One logged set, correctable.
 *
 * ── WHY THIS IS NOT `SetRow` + `QuickAdjust` ────────────────────────────────
 *
 * They are the right shape and the wrong contract. `SetRow` is 56 dp built around
 * a ✓ that logs, a ▶ that runs a clock, and a prefill-ghost state — none of which
 * means anything about a set that happened three weeks ago, and the ✓ in
 * particular would be a control that either does nothing or un-logs history.
 * `QuickAdjust` edits a `DraftSet` and offers `Remove set` against a live session.
 *
 * So this is deliberately quieter and smaller than both: a number, a chip row, and
 * two words. It reuses the app's own weight and count steps (`weightSteps`,
 * `countStep`) so a correction nudges by exactly what a set row nudges by, and it
 * snaps nothing — `QuickAdjust`'s rule about not rounding to a grid the app has
 * never seen applies at least as strongly to a number that is already a record.
 *
 * NO CONFIRMATION on a nudge, because a nudge is reversible by the opposite nudge
 * and the number is on screen while it changes. `Remove set` is not offered at all
 * on the last row of a workout: that is deleting the workout, which exists two rows
 * below and asks first.
 */
function LoggedSetRow({
  row,
  number,
  unitSystem,
  editing,
  canRemove,
  onFocusField,
  onChange,
  onRemove,
  onDone,
}: {
  row: SetHistory;
  /** 1-based position among this exercise's logged sets. `W` for a warm-up. */
  number: number;
  unitSystem: UnitSystem;
  editing: 'weight' | 'count' | null;
  canRemove: boolean;
  onFocusField: (field: 'weight' | 'count') => void;
  onChange: (patch: { weightKg?: number | null; count?: number }) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const weighted = row.weightKg != null;
  const steps = weightSteps(unitSystem);
  const countDelta = countStep(row.countUnit);

  const bumpWeight = (delta: number) => {
    tap();
    const current = unitSystem === 'imperial' ? kgToLb(row.weightKg ?? 0) : (row.weightKg ?? 0);
    const next = Math.max(0, Number((current + delta).toFixed(2)));
    onChange({ weightKg: unitSystem === 'imperial' ? lbToKg(next) : next });
  };

  const bumpCount = (delta: number) => {
    tap();
    onChange({ count: Math.max(0, row.count + delta) });
  };

  return (
    <View>
      <View className="flex-row items-center px-lg py-xs">
        <Text className="w-[20px] text-micro font-semibold uppercase tabular-nums text-ink-faint">
          {row.isWarmup ? 'W' : number}
        </Text>

        {weighted ? (
          <Pressable
            onPress={() => onFocusField('weight')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Correct the weight, ${formatWeight(row.weightKg, unitSystem, row.loadMode)} ${unitLabel(unitSystem)}`}
            className={[
              'min-w-[76px] flex-row items-baseline',
              editing === 'weight' ? 'rounded-surface bg-surface px-xs' : '',
            ].join(' ')}
          >
            <Text className="text-label font-semibold tabular-nums text-ink">
              {formatWeight(row.weightKg, unitSystem, row.loadMode)}
            </Text>
            <Text className="ml-xs text-micro uppercase text-ink-faint">
              {unitLabel(unitSystem)}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => onFocusField('count')}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Correct the count, ${formatCount(row.count, row.countUnit)} ${countUnitLabel(row.countUnit)}`}
          className={[
            'ml-md min-w-[76px] flex-row items-baseline',
            editing === 'count' ? 'rounded-surface bg-surface px-xs' : '',
          ].join(' ')}
        >
          <Text className="text-label font-semibold tabular-nums text-ink">
            {formatCount(row.count, row.countUnit)}
          </Text>
          <Text className="ml-xs text-micro uppercase text-ink-faint">
            {countUnitLabel(row.countUnit)}
          </Text>
        </Pressable>

        <View className="flex-1" />
        <Icon
          name={editing ? 'chevron-down' : 'chevron-right'}
          size={14}
          color={palette.inkFaint}
        />
      </View>

      {editing ? (
        <View className="mx-lg mb-sm rounded-surface bg-surface px-md py-sm">
          <View className="flex-row items-center justify-between">
            {(editing === 'weight'
              ? [-steps.coarse, -steps.fine, steps.fine, steps.coarse]
              : [-countDelta * 2, -countDelta, countDelta, countDelta * 2]
            ).map((delta) => (
              <Pressable
                key={delta}
                onPress={() => (editing === 'weight' ? bumpWeight(delta) : bumpCount(delta))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${delta > 0 ? 'Add' : 'Subtract'} ${Math.abs(delta)}`}
                className="h-hit min-w-[52px] items-center justify-center rounded-pill border border-hairline bg-surface-alt"
              >
                <Text className="text-label font-medium tabular-nums text-ink">
                  {delta < 0 ? '−' : '+'}
                  {Math.abs(Number(delta.toFixed(2)))}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-sm flex-row items-center justify-between">
            {/* Only where it is not the last row of the workout. See the note above. */}
            {canRemove ? (
              <Pressable
                onPress={onRemove}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove this set from the workout"
                className="h-hit justify-center"
              >
                <Text className="text-label font-medium text-ink-muted">Remove set</Text>
              </Pressable>
            ) : (
              <Text className="text-label text-ink-faint">The only set — delete the workout</Text>
            )}

            <Pressable
              onPress={onDone}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Done correcting"
              className="h-hit justify-center"
            >
              <Text className="text-label font-semibold text-green-bright">Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Empty() {
  return (
    <View className="flex-1 items-center justify-center px-xl">
      <Text className="text-title font-medium text-ink">Nothing finished yet</Text>
      <Text className="mt-sm text-center text-body text-ink-muted">
        Finish a workout and it lands here — every set, with what you lifted and how long it took.
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */

interface MonthGroup {
  key: string;
  label: string;
  workouts: CompletedWorkout[];
}

/**
 * Workouts bucketed by month, newest month first.
 *
 * The input is already newest-first (the store keeps it that way), so insertion
 * order is the right order and nothing is re-sorted here.
 */
function groupByMonth(workouts: readonly CompletedWorkout[], now: Date = new Date()): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  for (const workout of workouts) {
    const key = monthKey(workout.startedAt);
    const existing = groups.get(key);
    if (existing) {
      existing.workouts.push(workout);
      continue;
    }
    groups.set(key, {
      key,
      label: monthLabel(workout.startedAt, now),
      workouts: [workout],
    });
  }

  return [...groups.values()];
}

/** "August", or "August 2025" once the year stops being obvious. */
function monthLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const name = MONTHS[date.getMonth()] ?? '';
  return date.getFullYear() === now.getFullYear() ? name : `${name} ${date.getFullYear()}`;
}

/**
 * "12 reps total" / "4:00 total" — every set of one exercise added up.
 *
 * Null for a single set, where the total is just the set restated, and for work
 * whose counts don't add to anything meaningful. Rounds state both numbers,
 * because "12 rounds" and "36:00" are two different facts about the same session.
 */
function describeTotal(exercise: CompletedExercise): string | null {
  const { totalCount, setCount, countUnit } = exercise;
  if (setCount <= 1 || totalCount <= 0) return null;

  if (countUnit === 'seconds') return `${formatDuration(totalCount)} total`;
  if (countUnit === 'rounds') return `${setCount} rounds · ${formatDuration(totalCount)}`;
  if (countUnit === 'meters') return `${totalCount} m total`;
  return `${totalCount} reps total`;
}

/**
 * "4 720 kg" — space-grouped thousands, because five digits of session volume is
 * normal and `47200` is unreadable at Label size.
 *
 * Grouped by hand rather than with `toLocaleString`: number formatting through
 * Intl depends on which ICU the engine shipped with, and a volume figure that
 * silently loses its grouping on one build and not another is not worth the
 * dependency for one regex.
 */
function formatKg(kg: number): string {
  const digits = String(Math.max(0, Math.round(kg)));
  let grouped = '';
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    if (i > 0 && fromEnd % 3 === 0) grouped += ' ';
    grouped += digits[i];
  }
  return `${grouped} kg`;
}
