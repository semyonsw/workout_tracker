/**
 * Seed data — a real "Pull + swimming" session and the history behind it.
 *
 * Transcribed from workouts #78–#87 (11 Jun – 8 Aug 2026) so the app can be run
 * and felt before any database exists, and so the overload nudges that appear on
 * first launch are ones a real training log would actually produce.
 *
 * Two fixture notes:
 *
 *  • The plateau runs are tuned to fire. `plateauDays` is measured from the first
 *    session at a weight to NOW, so these numbers drift as the calendar moves —
 *    which is correct behaviour for a staleness measure and a known quirk of a
 *    fixture with fixed dates.
 *  • `ex_pulldown_wide` carries three sessions at 80 kg rather than two, so the
 *    collapsed-card nudge dot and the home screen's "nudges waiting" count are
 *    reachable states rather than dead code.
 *
 * The library also carries movements that were never logged — squats, shrugs, a
 * hollow hold — because the library is a hierarchy now: every movement cluster
 * has to have something in it for its filter chip and its section to be a real
 * state rather than an empty one.
 *
 * Replace with SQLite reads; the shapes are identical.
 */

import type {
  Exercise,
  RecentSessionSummary,
  Routine,
  SetHistory,
  User,
  WorkoutSplit,
} from '../types/models';
import { DEFAULT_OVERLOAD_POLICY } from '../lib/progressiveOverload';
import { estimate1RM } from '../lib/units';

export const seedUser: User = {
  id: 'u1',
  displayName: 'Semyon',
  unitSystem: 'metric',
  defaultRestSeconds: 120,
  overloadPolicy: DEFAULT_OVERLOAD_POLICY,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/* ------------------------------------------------------------------ */
/* Exercise library                                                    */
/* ------------------------------------------------------------------ */

const base = { ownerId: 'u1', isArchived: false, createdAt: '2026-01-01T00:00:00.000Z' };

export const seedExercises: Exercise[] = [
  {
    ...base,
    id: 'ex_pullup_90',
    name: 'Weighted 90° pull-ups',
    muscleGroups: ['back', 'biceps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'added_bodyweight', // the belt weight, not total load
    isUnilateral: false,
    incrementKg: 2.5,
    defaultRestSeconds: 180,
    equipment: 'bar + belt',
  },
  {
    ...base,
    id: 'ex_pulldown_wide',
    name: 'Wide pull-ups machine',
    muscleGroups: ['back'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5, // pin stack: 5 kg is the smallest real jump
    defaultRestSeconds: 120,
    equipment: 'lat machine',
  },
  {
    ...base,
    id: 'ex_row_stomach',
    name: 'Pull to stomach',
    aliases: ['pull to փոր', 'seated row'],
    muscleGroups: ['back'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5,
    defaultRestSeconds: 120,
  },
  {
    ...base,
    id: 'ex_brachialis',
    name: 'Brachialis curls',
    aliases: ['brachialis curls, close to body'],
    muscleGroups: ['biceps', 'forearms'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: true,
    incrementKg: 2.5,
    defaultRestSeconds: 90,
    equipment: 'dumbbells',
  },
  {
    ...base,
    id: 'ex_situp_weighted',
    name: 'Weighted sit-ups',
    muscleGroups: ['core'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'added_bodyweight',
    isUnilateral: false,
    incrementKg: 2.5,
    defaultRestSeconds: 90,
  },
  {
    ...base,
    id: 'ex_dips_weighted',
    name: 'Weighted dips',
    muscleGroups: ['chest', 'triceps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'added_bodyweight',
    isUnilateral: false,
    incrementKg: 2.5,
    defaultRestSeconds: 120,
    equipment: 'dip bars + belt',
  },
  {
    ...base,
    id: 'ex_pullup_bodyweight',
    name: 'Pull-ups, bodyweight',
    muscleGroups: ['back', 'biceps'],
    requiresWeight: false, // → no weight input renders at all
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
    defaultRestSeconds: 120,
  },
  {
    ...base,
    id: 'ex_pushups',
    name: 'Push-ups',
    aliases: ['wide knuckle push-ups'],
    muscleGroups: ['chest', 'triceps'],
    requiresWeight: false,
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
    defaultRestSeconds: 60,
  },
  {
    ...base,
    id: 'ex_boxing_bag',
    name: 'Boxing bag',
    muscleGroups: ['cardio'],
    requiresWeight: false,
    // One row per round; `count` holds the round LENGTH in seconds.
    countUnit: 'rounds',
    loadMode: 'none',
    // A round has a bell. The app rings it, and there is no get-ready count —
    // the round starts when you say go.
    timerMode: 'countdown',
    prepareSeconds: 0,
    isUnilateral: false,
    defaultRestSeconds: 60,
  },
  {
    ...base,
    id: 'ex_swim',
    name: 'Swimming',
    muscleGroups: ['cardio'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    // Deliberately manual: the phone is in a locker for fifty minutes.
    timerMode: 'manual',
    isUnilateral: false,
    defaultRestSeconds: 0,
  },

  /* --- timed holds: the reason the set timer exists ------------------- */
  {
    ...base,
    id: 'ex_plank',
    name: 'Plank',
    aliases: ['abs plank', 'front hold'],
    muscleGroups: ['core'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    // A prescribed hold: the clock runs down to the target and logs it.
    timerMode: 'countdown',
    prepareSeconds: 5,
    isUnilateral: false,
    defaultRestSeconds: 60,
  },
  {
    ...base,
    id: 'ex_dead_hang',
    name: 'Dead hang',
    aliases: ['hanging', 'bar hang', 'grip hang'],
    // Grip work first: a dead hang files under pull, where it is trained.
    muscleGroups: ['forearms', 'back'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    // An open hold — you cannot prescribe the moment your hands give out, so the
    // clock runs UP and logs whatever you managed.
    timerMode: 'countup',
    prepareSeconds: 5,
    isUnilateral: false,
    defaultRestSeconds: 90,
  },
  {
    ...base,
    id: 'ex_hollow_hold',
    name: 'Hollow hold',
    muscleGroups: ['core'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    timerMode: 'countdown',
    prepareSeconds: 5,
    isUnilateral: false,
    defaultRestSeconds: 60,
  },
  {
    ...base,
    id: 'ex_hanging_leg_raise',
    name: 'Hanging leg raises',
    muscleGroups: ['core'],
    requiresWeight: false,
    // Counted in reps, so no clock — `resolveTimerMode` would refuse one anyway.
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
    defaultRestSeconds: 90,
  },

  /* --- more back and arm work, so the pull cluster has a shape -------- */
  {
    ...base,
    id: 'ex_deadlift',
    name: 'Deadlift',
    muscleGroups: ['back', 'hamstrings', 'glutes'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5,
    defaultRestSeconds: 180,
    equipment: 'barbell',
  },
  {
    ...base,
    id: 'ex_row_barbell',
    name: 'Barbell row',
    aliases: ['bent-over row'],
    muscleGroups: ['back', 'biceps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 2.5,
    defaultRestSeconds: 120,
    equipment: 'barbell',
  },
  {
    ...base,
    id: 'ex_face_pull',
    name: 'Face pulls',
    // Traps lead, so this files under pull. The same two muscles listed the other
    // way round would be a lateral raise on push day — see `lib/muscles.ts`.
    muscleGroups: ['traps', 'shoulders'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 2.5,
    defaultRestSeconds: 90,
    equipment: 'cable',
  },
  {
    ...base,
    id: 'ex_shrug',
    name: 'Shrugs',
    muscleGroups: ['traps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 2.5,
    defaultRestSeconds: 90,
    equipment: 'dumbbells',
  },
  {
    ...base,
    id: 'ex_hammer_curl',
    name: 'Hammer curls',
    muscleGroups: ['biceps', 'forearms'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: true,
    incrementKg: 2.5,
    defaultRestSeconds: 90,
    equipment: 'dumbbells',
  },
  {
    ...base,
    id: 'ex_ohp',
    name: 'Overhead press',
    muscleGroups: ['shoulders', 'triceps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 2.5,
    defaultRestSeconds: 150,
    equipment: 'barbell',
  },
  {
    ...base,
    id: 'ex_squat',
    name: 'Back squat',
    muscleGroups: ['quads', 'glutes'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5,
    defaultRestSeconds: 180,
    equipment: 'barbell',
  },
  {
    ...base,
    id: 'ex_calf_raise',
    name: 'Calf raises',
    muscleGroups: ['calves'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5,
    defaultRestSeconds: 60,
  },
];

export const seedExercisesById: Record<string, Exercise> = Object.fromEntries(
  seedExercises.map((e) => [e.id, e]),
);

/** Most-recently-logged first — the library's `RECENTLY USED` card. */
export const seedRecentlyUsedExerciseIds = ['ex_plank', 'ex_dips_weighted', 'ex_boxing_bag'];

/* ------------------------------------------------------------------ */
/* Routines + split                                                    */
/* ------------------------------------------------------------------ */

export const seedRoutine: Routine = {
  id: 'r_pull',
  ownerId: 'u1',
  name: 'Pull + swimming',
  splitTag: 'pull',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  items: [
    {
      id: 'ri1',
      exerciseId: 'ex_pullup_90',
      order: 0,
      targetSets: 4,
      targetRepsMin: 4,
      targetRepsMax: 6,
      restSeconds: 180,
    },
    {
      id: 'ri2',
      exerciseId: 'ex_pulldown_wide',
      order: 1,
      targetSets: 4,
      targetRepsMin: 5,
      targetRepsMax: 8,
      restSeconds: 120,
    },
    { id: 'ri3', exerciseId: 'ex_row_stomach', order: 2, targetSets: 4, targetRepsMax: 10 },
    { id: 'ri4', exerciseId: 'ex_brachialis', order: 3, targetSets: 4, targetRepsMax: 16, restSeconds: 90 },
    { id: 'ri5', exerciseId: 'ex_situp_weighted', order: 4, targetSets: 3, targetRepsMax: 12, restSeconds: 90 },
    /*
     * The two shapes of a timed set, back to back: a 2:00 plank the clock counts
     * DOWN to a prescribed target, and a dead hang the clock counts UP until the
     * hands give out. `targetRepsMax` is seconds for time-counted work, so it is
     * also what the countdown starts from.
     */
    { id: 'ri7', exerciseId: 'ex_plank', order: 5, targetSets: 3, targetRepsMax: 120, restSeconds: 60 },
    { id: 'ri8', exerciseId: 'ex_dead_hang', order: 6, targetSets: 2, targetRepsMax: 45, restSeconds: 90 },
    // 50 min in the pool.
    { id: 'ri6', exerciseId: 'ex_swim', order: 7, targetSets: 1, targetRepsMax: 3000, restSeconds: 0 },
  ],
};

export const seedRoutinePush: Routine = {
  id: 'r_push',
  ownerId: 'u1',
  name: 'Push',
  splitTag: 'push',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
  items: [
    {
      id: 'rp1',
      exerciseId: 'ex_dips_weighted',
      order: 0,
      targetSets: 4,
      targetRepsMin: 5,
      targetRepsMax: 12,
      restSeconds: 120,
    },
    {
      id: 'rp2',
      exerciseId: 'ex_pushups',
      order: 1,
      targetSets: 4,
      targetRepsMin: 12,
      targetRepsMax: 15,
      restSeconds: 60,
    },
  ],
};

export const seedRoutineBoxing: Routine = {
  id: 'r_boxing',
  ownerId: 'u1',
  name: 'Boxing (cardio)',
  splitTag: 'boxing',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
  items: [
    // 12 rounds of 3:00, 1:00 between them.
    { id: 'rb1', exerciseId: 'ex_boxing_bag', order: 0, targetSets: 12, targetRepsMax: 180, restSeconds: 60 },
    {
      id: 'rb2',
      exerciseId: 'ex_pushups',
      order: 1,
      targetSets: 4,
      targetRepsMin: 12,
      targetRepsMax: 15,
      restSeconds: 60,
    },
  ],
};

export const seedRoutines: Routine[] = [seedRoutine, seedRoutinePush, seedRoutineBoxing];

export const seedRoutinesById: Record<string, Routine> = Object.fromEntries(
  seedRoutines.map((r) => [r.id, r]),
);

export const seedSplit: WorkoutSplit = {
  id: 'sp1',
  ownerId: 'u1',
  name: 'Push / Pull / Boxing',
  cycleMode: 'rolling', // advances on completion, not on weekday
  cursor: 2,
  startedOn: '2026-06-01T00:00:00.000Z',
  isActive: true,
  days: [
    { id: 'sd1', order: 0, label: 'Push', kind: 'routine', routineId: 'r_push' },
    { id: 'sd2', order: 1, label: 'Boxing', kind: 'routine', routineId: 'r_boxing' },
    { id: 'sd3', order: 2, label: 'Pull', kind: 'routine', routineId: 'r_pull' },
    { id: 'sd4', order: 3, label: 'Push', kind: 'routine', routineId: 'r_push' },
    { id: 'sd5', order: 4, label: 'Rest', kind: 'rest' },
  ],
};

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

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

export const seedHistory: SetHistory[] = [
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
  // Timed holds are logged in seconds, exactly like a swim: the count IS the time.
  ...log('s84', '2026-07-30', 'ex_plank', null, [120, 105, 90]),
  ...log('s84', '2026-07-30', 'ex_dead_hang', null, [42, 35]),

  // #85 — 4 Aug · Push
  ...log('s85', '2026-08-04', 'ex_dips_weighted', 30, [12, 8, 6, 5]),
  ...log('s85', '2026-08-04', 'ex_pushups', null, [14, 13, 10, 10]),

  // #86 — 6 Aug · Boxing
  ...rounds('s86', '2026-08-06', 12, 180),
  ...log('s86', '2026-08-06', 'ex_pushups', null, [14, 13, 10, 10]),

  // #87 — 8 Aug · the session the app opens on top of
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
export const seedHistoryByExerciseId: Record<string, SetHistory[]> = seedHistory.reduce(
  (acc, row) => {
    (acc[row.exerciseId] ??= []).push(row);
    return acc;
  },
  {} as Record<string, SetHistory[]>,
);

/**
 * The home screen's `RECENT` list.
 *
 * Rolled up on completion rather than derived from `seedHistory`: a session's
 * duration is not recoverable from its sets, and reading every set to render
 * four rows is the query this type exists to avoid.
 */
export const seedRecentSessions: RecentSessionSummary[] = [
  { id: 's87', title: 'Pull + swimming', performedAt: '2026-08-08T18:00:00.000Z', durationMinutes: 74 },
  { id: 's86', title: 'Boxing (cardio)', performedAt: '2026-08-06T18:00:00.000Z', durationMinutes: 53 },
  { id: 's85', title: 'Push', performedAt: '2026-08-04T18:00:00.000Z', durationMinutes: 51 },
  { id: 's84', title: 'Pull + swimming', performedAt: '2026-07-30T18:00:00.000Z', durationMinutes: 69 },
];
