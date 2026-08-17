/**
 * Seed data — the exercise library, the routines, and the split.
 *
 * WHAT IS NOT IN HERE ANY MORE: history. This file used to ship ten logged
 * sessions (#78–#87, transcribed from a paper log) plus four rolled-up `RECENT`
 * rows, so that the app could be felt before a database existed. The cost, once
 * the app could actually record a workout, was that a fresh install opened on four
 * sessions the user never did, an exercise-history chart of someone else's
 * pull-downs, and overload nudges about weights they had never lifted — none of it
 * distinguishable from their own data. History is now exclusively what the user
 * logged (`state/workoutHistoryStore`), and the fixture moved to
 * `test/fixtures/history.ts`, which is where the pure history, shorthand and
 * overload code is tested against it.
 *
 * What remains is a STARTING POINT rather than a fake past: exercises to pick
 * from, three routines, and a split to sit them in. All three are editable and
 * persisted from the first launch (`state/libraryStore`), and `Restore the shipped
 * exercise library` in Settings puts these back.
 *
 * The library carries movements no routine uses — squats, shrugs, a hollow hold —
 * because the library is a hierarchy: every movement cluster has to have something
 * in it for its filter chip and its section to be a real state rather than an
 * empty one.
 *
 * Replace with SQLite reads; the shapes are identical.
 */

import type { Exercise, Routine, User, WorkoutSplit } from '../types/models';
import { DEFAULT_OVERLOAD_POLICY } from '../lib/progressiveOverload';

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
