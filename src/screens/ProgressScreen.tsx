/**
 * ProgressScreen — is it going up.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ HISTORY                    [ Log | Graphs ]  │
 *   │ ( All workouts )( Weighted 90° pull-ups )… │  ← what the graphs are about
 *   │ REPS PER WORKOUT · UP 34 SINCE 11 JUN        │
 *   │   ╱╲ chart ╱╲                                │
 *   │ WEIGHT PER WORKOUT · UP 1 240 KG             │
 *   │   ╱╲ chart ╱╲                                │
 *   └──────────────────────────────────────────────┘
 *
 * TWO GRAPHS, ONE QUESTION. "Am I doing more than I was" has exactly two honest
 * answers — how many reps you did, and how much weight was on them — and they can
 * disagree: heavier sets mean fewer reps, and that is the trade being made, not a
 * regression. So they are two lines, never one combined score.
 *
 * ── THE SCOPE PICKER ───────────────────────────────────────────────────────
 *
 * `All workouts` is the whole log: every rep of every rep-counted exercise in a
 * session, and every kilogram moved in it. It answers "is my training growing".
 * Picking one exercise answers the different and sharper question — "is THIS lift
 * going up" — as reps in the session and top working weight of the session.
 *
 * Only exercises with at least two logged sessions appear: a chart of one point is
 * a dot, and a dot has no direction.
 *
 * ── WHY THE DELTA IS SPELLED OUT ───────────────────────────────────────────
 *
 * The shape is visible; the arithmetic is not. `UP 34 SINCE 11 JUN` is the one
 * thing you would otherwise do in your head, and it is stated as first-to-last
 * fact rather than a fitted trend, because a fitted slope is a claim about the
 * future and this screen only reports the past.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, SelectChip } from '../components/primitives';
import { TrendChart } from '../components/TrendChart';
import type { CompletedWorkout } from '../lib/completedWorkout';
import { tap } from '../lib/feedback';
import {
  exerciseCountSeries,
  exerciseTopWeightSeries,
  summarizeTrend,
  workoutRepsSeries,
  workoutVolumeSeries,
  type TrendPoint,
} from '../lib/trends';
import { bodyweightSeries } from '../lib/bodyweightLog';
import { useSettings } from '../state/settingsStore';
import { formatClock, formatShortDate } from '../lib/units';
import type { Exercise, ID, SetHistory } from '../types/models';
import type { ReactNode } from 'react';

/** `null` scope = the whole log; an id = that one exercise. */
type Scope = ID | null;

interface ProgressScreenProps {
  workouts: CompletedWorkout[];
  /** Every logged set, keyed by exercise — the same map the nudges read. */
  historyByExerciseId: Record<ID, SetHistory[]>;
  exercisesById: Record<ID, Exercise>;
  /** The `Log | Graphs` switch, rendered under the header by whoever owns it. */
  toolbar?: ReactNode;
}

export function ProgressScreen({
  workouts,
  historyByExerciseId,
  exercisesById,
  toolbar,
}: ProgressScreenProps) {
  const [scope, setScope] = useState<Scope>(null);
  /*
   * Read here rather than passed in, unlike the log and the library: it is a
   * SETTING, this screen is the only place that charts it, and threading it through
   * `AppShell` would make the shell responsible for a number it has no opinion
   * about. A stable reference out of the store, so the memo below is honest.
   */
  const bodyweightLog = useSettings((s) => s.bodyweightLog);

  /**
   * Exercises worth offering: trained at least twice, most recently trained
   * first. Ordered by the log rather than alphabetically, because the thing you
   * want to look at is almost always the thing you just did.
   */
  const options = useMemo(() => {
    const seen: ID[] = [];
    const sessions = new Map<ID, Set<ID>>();
    for (const workout of workouts) {
      for (const row of workout.sets) {
        if (!seen.includes(row.exerciseId)) seen.push(row.exerciseId);
        const bucket = sessions.get(row.exerciseId) ?? new Set<ID>();
        bucket.add(row.sessionId);
        sessions.set(row.exerciseId, bucket);
      }
    }
    return seen
      .filter((id) => (sessions.get(id)?.size ?? 0) >= 2 && exercisesById[id])
      .map((id) => exercisesById[id]);
  }, [exercisesById, workouts]);

  /* A scope whose exercise was deleted falls back to the whole log. */
  const exercise = scope ? exercisesById[scope] : undefined;
  const active: Scope = exercise ? scope : null;

  const graphs = useMemo<Graph[]>(() => {
    if (exercise) {
      const history = historyByExerciseId[exercise.id] ?? [];
      /*
       * Time-counted work — a plank, a boxing round — sums to a DURATION, and a
       * clock is how a duration reads. `count` on a round holds the round's length,
       * so twelve rounds of 3:00 correctly totals 36:00.
       */
      const isTime = exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds';
      const isDistance = exercise.countUnit === 'meters';
      return [
        {
          key: 'count',
          title: isTime
            ? 'Time per session'
            : isDistance
              ? 'Distance per session'
              : 'Reps per session',
          points: exerciseCountSeries(history, exercise.id),
          // A clock, not "2 min" / "90 sec": one form all the way up an axis.
          format: isTime ? formatClock : undefined,
          unit: isTime ? '' : isDistance ? 'm' : 'reps',
        },
        {
          key: 'weight',
          title: 'Top weight per session',
          points: exerciseTopWeightSeries(history, exercise.id),
          unit: 'kg',
        },
      ];
    }

    return [
      { key: 'reps', title: 'Reps per workout', points: workoutRepsSeries(workouts), unit: 'reps' },
      {
        key: 'volume',
        title: 'Weight per workout',
        points: workoutVolumeSeries(workouts),
        unit: 'kg',
      },
      /*
       * BODYWEIGHT — the third line, and the only one that is not about a session.
       *
       * It belongs on this screen because it is load-bearing rather than
       * decorative: `effectiveLoadKg` adds it to every pull-up and dip in the log,
       * so a lifter who gained 4 kg while holding `+20 × 8` added 4 kg to the bar,
       * and the two lines above cannot show that on their own. The rule that drops
       * a series with fewer than two points does the rest — a user who has never
       * typed a weight sees no chart at all, not an empty one.
       */
      {
        key: 'bodyweight',
        title: 'Bodyweight',
        points: bodyweightSeries(bodyweightLog),
        unit: 'kg',
      },
    ];
  }, [bodyweightLog, exercise, historyByExerciseId, workouts]);

  const drawable = graphs.filter((graph) => graph.points.length >= 2);

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker="History"
        subtitle={exercise ? exercise.name : 'Every workout you have logged'}
        bordered={false}
      >
        {toolbar}
      </ScreenHeader>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {options.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
            className="mt-md"
          >
            <SelectChip
              label="All workouts"
              selected={active == null}
              onPress={() => {
                tap();
                setScope(null);
              }}
            />
            {options.map((option) => (
              <SelectChip
                key={option.id}
                label={option.name}
                selected={active === option.id}
                onPress={() => {
                  tap();
                  setScope(option.id);
                }}
              />
            ))}
          </ScrollView>
        ) : null}

        {drawable.length > 0 ? (
          drawable.map((graph) => <GraphBlock key={graph.key} graph={graph} />)
        ) : (
          <Empty hasWorkouts={workouts.length > 0} />
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

interface Graph {
  key: string;
  title: string;
  points: TrendPoint[];
  /** How a value reads on the axis. Absent = a rounded number. */
  format?: (value: number) => string;
  /** Appended to the delta line: "kg", "reps", or nothing for a clock. */
  unit: string;
}

function GraphBlock({ graph }: { graph: Graph }) {
  const summary = summarizeTrend(graph.points);
  const format = graph.format ?? ((value: number) => String(Math.round(value)));

  /*
   * "UP 34 REPS SINCE 11 JUN" / "DOWN 5 KG SINCE 2 AUG" / "LEVEL SINCE 11 JUN".
   * `level` gets its own word rather than "up 0": a plateau is the finding the
   * whole app is built to surface, and it should read as one.
   */
  const delta = summary
    ? summary.delta === 0
      ? 'level'
      : `${summary.delta > 0 ? 'up' : 'down'} ${format(Math.abs(summary.delta))}${graph.unit ? ` ${graph.unit}` : ''}`
    : null;

  return (
    <View className="mt-xl">
      <Kicker className="mx-lg">
        {graph.title}
        {delta ? ` · ${delta} since ${formatShortDate(graph.points[0].at)}` : ''}
      </Kicker>
      <View className="mx-lg mt-md">
        <TrendChart points={graph.points} formatValue={format} />
      </View>
      <Text className="mx-lg mt-sm text-label tabular-nums text-ink-faint">
        {format(graph.points[graph.points.length - 1].value)}
        {graph.unit ? ` ${graph.unit}` : ''} last session · {graph.points.length} sessions plotted
      </Text>
    </View>
  );
}

function Empty({ hasWorkouts }: { hasWorkouts: boolean }) {
  return (
    <View className="mx-lg mt-xxl rounded-surface border border-hairline bg-surface p-lg">
      <Kicker>Not enough yet</Kicker>
      <Text className="mt-sm text-body text-ink-muted">
        {hasWorkouts
          ? 'A line needs two sessions to have a direction. Log this exercise once more and it appears here.'
          : 'Finish two workouts and both graphs draw themselves — reps and weight, session by session.'}
      </Text>
    </View>
  );
}
