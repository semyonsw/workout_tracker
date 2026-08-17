/**
 * A real training log, as a TEST FIXTURE.
 *
 * These are workouts #78–#87 (11 Jun – 8 Aug 2026), transcribed from a paper log.
 * They used to ship inside `src/data/seed.ts`, which meant a fresh install opened
 * on four sessions the user had never done, an exercise-history chart of someone
 * else's pull-downs, and overload nudges about weights they had never lifted. The
 * app now starts empty and everything in it is something the user logged; the
 * fixture stays here, where it is still exactly what the pure history, shorthand,
 * overload and draft-building code needs to be tested against.
 *
 * Fixture notes worth keeping:
 *
 *  • The plateau runs are tuned to fire. `plateauDays` is measured from the first
 *    session at a weight to NOW, so these numbers drift as the calendar moves —
 *    correct behaviour for a staleness measure, and a known quirk of a fixture
 *    with fixed dates.
 *  • `ex_pulldown_wide` carries three sessions at 80 kg rather than two, so a
 *    nudge is a reachable state rather than dead code.
 *  • Timed holds are logged in seconds, exactly like a swim: the count IS the time.
 */

import { seedExercisesById } from '../../src/data/seed';
import { estimate1RM } from '../../src/lib/units';
import type { RecentSessionSummary, SetHistory } from '../../src/types/models';

/** Terse fixture helper: one call per (session, exercise, weight) group. */
function log(
  sessionId: string,
  date: string,
  exerciseId: string,
  weightKg: number | null,
  counts: number[],
  startIndex = 0,
): SetHistory[] {
  const exercise = seedExercisesById[exerciseId];
  return counts.map((count, i) => ({
    id: `${sessionId}_${exerciseId}_${weightKg}_${startIndex + i}`,
    sessionId,
    exerciseId,
    performedAt: `${date}T18:00:00.000Z`,
    setIndex: startIndex + i,
    weightKg,
    count,
    countUnit: exercise.countUnit,
    loadMode: exercise.loadMode,
    isWarmup: false,
    isCompleted: true,
    estimated1RM: estimate1RM(weightKg, count),
  }));
}

/** Twelve identical rounds, without twelve lines of fixture. */
function rounds(sessionId: string, date: string, count: number, seconds: number): SetHistory[] {
  return log(sessionId, date, 'ex_boxing_bag', null, Array.from({ length: count }, () => seconds));
}

export const fixtureHistory: SetHistory[] = [
  // #78 — 11 Jun · the bottom of the wide-pulldown ramp
  ...log('s78', '2026-06-11', 'ex_pulldown_wide', 60, [10, 9, 8, 8]),

  // #79 — 25 Jun
  ...log('s79', '2026-06-25', 'ex_pulldown_wide', 70, [8, 8, 7, 6]),

  // #80 — 9 Jul
  ...log('s80', '2026-07-09', 'ex_pulldown_wide', 75, [8, 7, 6, 6]),

  // #81 — 22 Jul · sit-ups settle at +25, and stay there
  ...log('s81', '2026-07-22', 'ex_situp_weighted', 25, [12, 12, 12]),

  // #82 — 23 Jul · a top single at 80, then a drop to 75
  ...log('s82', '2026-07-23', 'ex_pullup_90', 40, [4]),
  ...log('s82', '2026-07-23', 'ex_pullup_90', 30, [5, 7], 1),
  ...log('s82', '2026-07-23', 'ex_pulldown_wide', 80, [7]),
  ...log('s82', '2026-07-23', 'ex_pulldown_wide', 75, [7, 7, 6], 1),
  ...log('s82', '2026-07-23', 'ex_row_stomach', 55, [11, 11, 10]),
  ...log('s82', '2026-07-23', 'ex_situp_weighted', 25, [12, 12, 12]),

  // #83 — 26 Jul
  ...log('s83', '2026-07-26', 'ex_pulldown_wide', 80, [7, 6, 5, 5]),
  ...log('s83', '2026-07-26', 'ex_situp_weighted', 25, [12, 12, 12]),

  // #84 — 30 Jul
  ...log('s84', '2026-07-30', 'ex_row_stomach', 60, [10, 11, 10, 10]),
  ...log('s84', '2026-07-30', 'ex_brachialis', 15, [16, 12, 12]),
  ...log('s84', '2026-07-30', 'ex_situp_weighted', 25, [12, 12, 12]),
  ...log('s84', '2026-07-30', 'ex_plank', null, [120, 105, 90]),
  ...log('s84', '2026-07-30', 'ex_dead_hang', null, [42, 35]),

  // #85 — 4 Aug · Push
  ...log('s85', '2026-08-04', 'ex_dips_weighted', 30, [12, 8, 6, 5]),
  ...log('s85', '2026-08-04', 'ex_pushups', null, [14, 13, 10, 10]),

  // #86 — 6 Aug · Boxing
  ...rounds('s86', '2026-08-06', 12, 180),
  ...log('s86', '2026-08-06', 'ex_pushups', null, [14, 13, 10, 10]),

  // #87 — 8 Aug · the session the fixtures were built around
  ...log('s87', '2026-08-08', 'ex_pullup_90', 40, [4, 4]),
  ...log('s87', '2026-08-08', 'ex_pullup_90', 30, [6, 6], 2),
  ...log('s87', '2026-08-08', 'ex_pulldown_wide', 80, [8, 6, 5, 5]),
  ...log('s87', '2026-08-08', 'ex_row_stomach', 55, [10, 10, 10, 10]),
  ...log('s87', '2026-08-08', 'ex_brachialis', 15, [16, 16, 14, 14]),
  ...log('s87', '2026-08-08', 'ex_situp_weighted', 25, [12, 12, 12]),
  // The plank held to the bell all three sets; the hang went up by 3 s.
  ...log('s87', '2026-08-08', 'ex_plank', null, [120, 120, 120]),
  ...log('s87', '2026-08-08', 'ex_dead_hang', null, [45, 38]),
  ...log('s87', '2026-08-08', 'ex_swim', null, [3000]),
];

/** History grouped the way `buildDraftSession` wants it. */
export const fixtureHistoryByExerciseId: Record<string, SetHistory[]> = fixtureHistory.reduce(
  (acc, row) => {
    (acc[row.exerciseId] ??= []).push(row);
    return acc;
  },
  {} as Record<string, SetHistory[]>,
);

/** Rolled-up session summaries — a session's duration is not in its sets. */
export const fixtureRecentSessions: RecentSessionSummary[] = [
  { id: 's87', title: 'Pull + swimming', performedAt: '2026-08-08T18:00:00.000Z', durationMinutes: 74 },
  { id: 's86', title: 'Boxing (cardio)', performedAt: '2026-08-06T18:00:00.000Z', durationMinutes: 53 },
  { id: 's85', title: 'Push', performedAt: '2026-08-04T18:00:00.000Z', durationMinutes: 51 },
  { id: 's84', title: 'Pull + swimming', performedAt: '2026-07-30T18:00:00.000Z', durationMinutes: 69 },
];
