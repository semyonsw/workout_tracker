/**
 * HistoryScreen — every workout you have actually finished.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ HISTORY                                      │
 *   │ 12 workouts · 214 sets · 41 200 kg           │
 *   │ AUGUST                                       │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ #92  Pull + swimming     17 Aug · 74 min │ │
 *   │ │      6 exercises · 18 sets · 4 720 kg  ⌄ │ │
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
 *  • EVERY WORKOUT IS NUMBERED, AND THE NUMBERING IS YOURS. `Workout 92` is an
 *    ordinal, not an id: one workout is pinned to a number you type and every other
 *    one counts from it, forwards and backwards. That is what makes a log that
 *    starts at session 91 — because ninety of them happened before this app
 *    existed — say so. See `workoutNumbers`.
 *  • THE TOTALS LINE IS A FACT, NOT A GOAL. No streaks, no badges, no weekly
 *    target. Three numbers that say how much training is in here.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { NumberSheet } from '../components/NumberSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, ListCard, Separator } from '../components/primitives';
import { tap, undo } from '../lib/feedback';
import { monthKey, type CompletedExercise, type CompletedWorkout } from '../lib/completedWorkout';
import { formatDuration, formatShortDate } from '../lib/units';
import { historyTotals } from '../state/workoutHistoryStore';
import { palette } from '../theme/tokens';
import type { ID } from '../types/models';

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
  /** Every workout's ordinal, keyed by id — see `workoutNumbers`. */
  numbers: Record<ID, number>;
  onDelete: (id: ID) => void;
  /** Pin this workout's number; everything else renumbers from it. */
  onSetNumber: (id: ID, number: number) => void;
  /** The `Log | Graphs` switch, rendered under the header by whoever owns it. */
  toolbar?: ReactNode;
}

export function HistoryScreen({
  workouts,
  numbers,
  onDelete,
  onSetNumber,
  toolbar,
}: HistoryScreenProps) {
  /** The open workout, the one being deleted, the one being renumbered. */
  const [openId, setOpenId] = useState<ID | null>(null);
  const [deleting, setDeleting] = useState<CompletedWorkout | null>(null);
  const [numbering, setNumbering] = useState<CompletedWorkout | null>(null);

  const totals = useMemo(() => historyTotals(workouts), [workouts]);
  const months = useMemo(() => groupByMonth(workouts), [workouts]);
  const dimmed = deleting != null || numbering != null;

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={dimmed ? { opacity: 0.28 } : undefined}>
        <ScreenHeader
          kicker="History"
          subtitle={
            totals.workouts > 0
              ? `${totals.workouts} ${totals.workouts === 1 ? 'workout' : 'workouts'} · ${totals.sets} sets${
                  totals.volumeKg > 0 ? ` · ${formatKg(totals.volumeKg)}` : ''
                }`
              : undefined
          }
          bordered={false}
        >
          {toolbar}
        </ScreenHeader>

        {workouts.length === 0 ? (
          <Empty />
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!dimmed}
          >
            {months.map((month) => (
              <View key={month.key}>
                <Kicker className="mx-lg mb-sm mt-xl">{month.label}</Kicker>
                <ListCard className="mx-lg">
                  {month.workouts.map((workout, index) => (
                    <View key={workout.id}>
                      {index > 0 ? <Separator /> : null}
                      <WorkoutRow
                        workout={workout}
                        number={numbers[workout.id]}
                        isOpen={openId === workout.id}
                        onPress={() => {
                          tap();
                          setOpenId((current) => (current === workout.id ? null : workout.id));
                        }}
                        onDelete={() => {
                          undo();
                          setDeleting(workout);
                        }}
                        onEditNumber={() => {
                          tap();
                          setNumbering(workout);
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

      {numbering ? (
        <NumberSheet
          title="Which workout was this?"
          body="Every other workout renumbers from this one — the ones before it count down, the ones after it count up. Set it once on any session and the whole log lines up, including the sessions you did before this app existed."
          initial={numbers[numbering.id] ?? null}
          onConfirm={(value) => {
            onSetNumber(numbering.id, value);
            setNumbering(null);
          }}
          onCancel={() => setNumbering(null)}
        />
      ) : null}

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
  number,
  isOpen,
  onPress,
  onDelete,
  onEditNumber,
}: {
  workout: CompletedWorkout;
  /** Its ordinal, or undefined / below 1 when the pinning leaves it without one. */
  number?: number;
  isOpen: boolean;
  onPress: () => void;
  onDelete: () => void;
  onEditNumber: () => void;
}) {
  const exerciseCount = workout.exercises.length;
  const numbered = number != null && number >= 1;

  return (
    <View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={[
          numbered ? `Workout ${number},` : '',
          workout.title,
          formatShortDate(workout.startedAt),
          `${workout.setCount} sets`,
          `${workout.durationMinutes} minutes`,
        ]
          .filter(Boolean)
          .join(' ')}
        className="min-h-[64px] flex-row items-center px-lg py-md"
      >
        {/* The ordinal is its own left column so the numbers line up down the
            list like a ledger, and so a long title can never push it off. The
            gutter is reserved even when a workout has no number, because a row
            that shifts left is harder to scan than one with a gap. */}
        <Text className="w-[38px] text-label font-semibold tabular-nums text-green-bright">
          {numbered ? `#${number}` : ''}
        </Text>

        <View className="flex-1 pr-md">
          <Text numberOfLines={1} className="text-body font-medium text-ink">
            {workout.title}
          </Text>
          <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
            {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'} · {workout.setCount}{' '}
            {workout.setCount === 1 ? 'set' : 'sets'}
            {workout.totalVolumeKg > 0 ? ` · ${formatKg(workout.totalVolumeKg)}` : ''}
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

          {/* Renumbering sits above delete because it is the one you actually
              reach for, and both are inside the open row for the same reason:
              you read what the workout was before you touch it. */}
          <Pressable
            onPress={onEditNumber}
            accessibilityRole="button"
            accessibilityLabel={
              numbered ? `Change the number of workout ${number}` : 'Set this workout\'s number'
            }
            className="h-hit justify-center px-lg"
          >
            <Text className="text-label font-medium text-green-bright">
              {numbered ? `Workout number: ${number}` : 'Set the workout number'}
            </Text>
          </Pressable>

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
function groupByMonth(
  workouts: readonly CompletedWorkout[],
  now: Date = new Date(),
): MonthGroup[] {
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
