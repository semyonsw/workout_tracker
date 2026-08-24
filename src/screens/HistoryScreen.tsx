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

import { useMemo, useState } from 'react';
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
import { formatDuration, formatShortDate } from '../lib/units';
import { historyTotals } from '../state/workoutHistoryStore';
import { palette } from '../theme/tokens';
import type { Exercise, ID } from '../types/models';

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
  onDelete: (id: ID) => void;
}

export function HistoryScreen({ workouts, exercisesById, onDelete }: HistoryScreenProps) {
  /** The open workout, and the one being deleted. Both are screen-local. */
  const [openId, setOpenId] = useState<ID | null>(null);
  const [deleting, setDeleting] = useState<CompletedWorkout | null>(null);
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
              <View key={month.key}>
                <Kicker className="mx-lg mb-sm mt-xl">{month.label}</Kicker>
                <ListCard className="mx-lg">
                  {month.workouts.map((workout, index) => (
                    <View key={workout.id}>
                      {index > 0 ? <Separator /> : null}
                      <WorkoutRow
                        workout={workout}
                        isOpen={openId === workout.id}
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
  onPress,
  onDelete,
}: {
  workout: CompletedWorkout;
  isOpen: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const exerciseCount = workout.exercises.length;

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
            return (
              <View
                key={`${exercise.exerciseId}-${exercise.name}`}
                className="flex-row items-start px-lg py-sm"
              >
                <Text numberOfLines={1} className="flex-1 pr-md text-label font-medium text-ink">
                  {exercise.name}
                </Text>
                <View className="items-end">
                  <Text className="text-label tabular-nums text-ink-muted">{exercise.summary}</Text>
                  {total ? (
                    <Text className="mt-[2px] text-micro font-semibold uppercase tabular-nums text-green-bright">
                      {total}
                    </Text>
                  ) : null}
                </View>
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
