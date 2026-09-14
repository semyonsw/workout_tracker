/**
 * Seed data — the exercise library and three starting routines.
 *
 * A STARTING POINT, not a fake past: no history ships (that is exclusively what
 * the user logged — see `state/workoutHistoryStore`) and no training sequence
 * ships either (the sequence is off and empty until the user builds one — see
 * `TrainingSequence`). All of this is editable and persisted from the first
 * launch by `state/libraryStore`.
 *
 * The library carries movements no routine uses — squats, shrugs, a hollow hold —
 * because every movement cluster needs something in it for its filter chip and
 * its library section to be a real state rather than an empty one.
 *
 * NO EXERCISE SHIPS WITH ITS OWN REST, and none of the routines does either.
 * `Exercise.defaultRestSeconds` is an override the user sets by hand; a shipped
 * one would shadow the `Between sets` setting on almost every movement in the
 * app, which is precisely the bug `lib/rest.ts` exists to describe. Everything
 * here follows the setting until somebody says otherwise.
 *
 * The four `equipment: 'barbell'` rows carry `barWeightKg: 20`, which is what
 * turns on the `20 + 2×10 + 2×2.5` line under their weight cell. Only those four:
 * the flag is a fact about how a movement is loaded, and a machine or a dumbbell
 * showing a plate breakdown would be a lie about the equipment.
 */

import type { Exercise, Routine, User } from '../types/models';
import { DEFAULT_OVERLOAD_POLICY } from '../lib/progressiveOverload';

export const seedUser: User = {
  id: 'u1',
  overloadPolicy: DEFAULT_OVERLOAD_POLICY,
};

/* ------------------------------------------------------------------ */
/* Exercise library                                                    */
/* ------------------------------------------------------------------ */

const base = { ownerId: 'u1', isArchived: false, createdAt: '2026-01-01T00:00:00.000Z' };

export const seedExercises: Exercise[] = [
  {
    ...base,
    id: 'ex_pullup_90',
    name: 'Подтягивания 90° с весом',
    aliases: ['Weighted 90° pull-ups'],
    muscleGroups: ['back', 'biceps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'added_bodyweight', // the belt weight, not total load
    isUnilateral: false,
    incrementKg: 2.5,
    equipment: 'bar + belt',
  },
  {
    ...base,
    id: 'ex_pulldown_wide',
    name: 'Тяга верхнего блока широким хватом',
    aliases: ['Wide pull-ups machine'],
    muscleGroups: ['back'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5, // pin stack: 5 kg is the smallest real jump
    equipment: 'lat machine',
  },
  {
    ...base,
    id: 'ex_row_stomach',
    name: 'Тяга к животу',
    aliases: ['Pull to stomach', 'pull to փոր', 'seated row'],
    muscleGroups: ['back'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5,
  },
  {
    ...base,
    id: 'ex_brachialis',
    name: 'Сгибания на брахиалис',
    aliases: ['Brachialis curls', 'brachialis curls, close to body'],
    muscleGroups: ['biceps', 'forearms'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: true,
    incrementKg: 2.5,
    equipment: 'dumbbells',
  },
  {
    ...base,
    id: 'ex_situp_weighted',
    name: 'Скручивания с весом',
    aliases: ['Weighted sit-ups'],
    muscleGroups: ['core'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'added_bodyweight',
    isUnilateral: false,
    incrementKg: 2.5,
  },
  {
    ...base,
    id: 'ex_dips_weighted',
    name: 'Отжимания на брусьях с весом',
    aliases: ['Weighted dips'],
    muscleGroups: ['chest', 'triceps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'added_bodyweight',
    isUnilateral: false,
    incrementKg: 2.5,
    equipment: 'dip bars + belt',
  },
  {
    ...base,
    id: 'ex_pullup_bodyweight',
    name: 'Подтягивания, свой вес',
    aliases: ['Pull-ups, bodyweight'],
    muscleGroups: ['back', 'biceps'],
    requiresWeight: false, // → no weight input renders at all
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
  },
  {
    ...base,
    id: 'ex_pushups',
    name: 'Отжимания',
    aliases: ['Push-ups', 'wide knuckle push-ups'],
    muscleGroups: ['chest', 'triceps'],
    requiresWeight: false,
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
  },
  {
    ...base,
    id: 'ex_boxing_bag',
    name: 'Боксёрский мешок',
    aliases: ['Boxing bag'],
    muscleGroups: ['cardio'],
    requiresWeight: false,
    // One row per round; `count` holds the round LENGTH in seconds.
    countUnit: 'rounds',
    loadMode: 'none',
    // A round has a bell. The app rings it, and there is no get-ready count —
    // the round starts when you say go.
    timerMode: 'countdown',
    /*
     * THE LEAD-IN TO THE FIRST ROUND, and the reason it is not zero any more.
     *
     * A round exercise runs itself (`lib/rounds.ts`): the bell logs the round, the
     * rest starts, and the next round starts when the rest runs out — nobody in
     * gloves is pressing anything. The one moment that CANNOT be automatic is the
     * very first round, because the phone has no way to know when you have finished
     * wrapping your hands. So ▶ buys fifteen seconds to get to the bag, and every
     * round after it begins with no count at all.
     *
     * Editable per exercise on the exercise editor's `Get ready` row, and in
     * Settings for everything that does not set its own.
     */
    prepareSeconds: 15,
    isUnilateral: false,
  },
  {
    ...base,
    id: 'ex_swim',
    name: 'Плавание',
    aliases: ['Swimming'],
    muscleGroups: ['cardio'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    // Deliberately manual: the phone is in a locker for fifty minutes.
    timerMode: 'manual',
    isUnilateral: false,
  },

  /* --- timed holds: the reason the set timer exists ------------------- */
  {
    ...base,
    id: 'ex_plank',
    name: 'Планка',
    aliases: ['Plank', 'abs plank', 'front hold'],
    muscleGroups: ['core'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    // A prescribed hold: the clock runs down to the target and logs it.
    timerMode: 'countdown',
    prepareSeconds: 5,
    isUnilateral: false,
  },
  {
    ...base,
    id: 'ex_dead_hang',
    name: 'Вис на перекладине',
    aliases: ['Dead hang', 'hanging', 'bar hang', 'grip hang'],
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
  },
  {
    ...base,
    id: 'ex_hollow_hold',
    name: 'Лодочка',
    aliases: ['Hollow hold'],
    muscleGroups: ['core'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    timerMode: 'countdown',
    prepareSeconds: 5,
    isUnilateral: false,
  },
  {
    ...base,
    id: 'ex_hanging_leg_raise',
    name: 'Подъёмы ног в висе',
    aliases: ['Hanging leg raises'],
    muscleGroups: ['core'],
    requiresWeight: false,
    // Counted in reps, so no clock — `resolveTimerMode` would refuse one anyway.
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
  },

  /* --- calisthenics: a skill is not a muscle -------------------------- */
  /*
   * Every one of these is `countUnit: 'seconds'` + `timerMode: 'countup'`, and both
   * halves are the same decision. A hold is measured in seconds because the
   * question is how long you owned the position; the clock runs UP because nobody
   * can prescribe the moment their form breaks — and because a count-up has no
   * bell, so the set is logged when the USER says it is, with DONE. That is exactly
   * the opposite of a boxing round, which ends on a bell and needs no thumb, and
   * the two live side by side in the library to prove the axes are independent.
   */
  {
    ...base,
    id: 'ex_handstand',
    name: 'Стойка на руках',
    aliases: ['Handstand hold', 'handstand', 'wall handstand'],
    muscleGroups: ['calisthenics', 'shoulders', 'core'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    timerMode: 'countup',
    prepareSeconds: 5,
    isUnilateral: false,
    defaultCount: 30,
    defaultSets: 3,
  },
  {
    ...base,
    id: 'ex_front_lever',
    name: 'Передний вис',
    aliases: ['Front lever hold', 'front lever', 'lever'],
    muscleGroups: ['calisthenics', 'back', 'core'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    timerMode: 'countup',
    prepareSeconds: 5,
    isUnilateral: false,
    defaultCount: 10,
    defaultSets: 4,
  },
  {
    ...base,
    id: 'ex_planche',
    name: 'Планш',
    aliases: ['Planche hold', 'planche', 'plunge'],
    muscleGroups: ['calisthenics', 'shoulders', 'chest'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    timerMode: 'countup',
    prepareSeconds: 5,
    isUnilateral: false,
    defaultCount: 10,
    defaultSets: 4,
  },
  {
    ...base,
    id: 'ex_l_sit',
    name: 'Уголок',
    aliases: ['L-sit'],
    muscleGroups: ['calisthenics', 'core'],
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    timerMode: 'countup',
    prepareSeconds: 5,
    isUnilateral: false,
    defaultCount: 20,
    defaultSets: 3,
  },
  {
    ...base,
    id: 'ex_muscle_up',
    name: 'Выход силой',
    aliases: ['Muscle-up'],
    muscleGroups: ['calisthenics', 'back', 'triceps'],
    requiresWeight: false,
    // The one rep-counted skill: a muscle-up is a repetition, not a hold.
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
    defaultCount: 3,
    defaultSets: 4,
  },

  /* --- more back and arm work, so the pull cluster has a shape -------- */
  {
    ...base,
    id: 'ex_deadlift',
    name: 'Становая тяга',
    aliases: ['Deadlift'],
    muscleGroups: ['back', 'hamstrings', 'glutes'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5,
    equipment: 'barbell',
    barWeightKg: 20,
  },
  {
    ...base,
    id: 'ex_row_barbell',
    name: 'Тяга штанги в наклоне',
    aliases: ['Barbell row', 'bent-over row'],
    muscleGroups: ['back', 'biceps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 2.5,
    equipment: 'barbell',
    barWeightKg: 20,
  },
  {
    ...base,
    id: 'ex_face_pull',
    name: 'Тяга к лицу',
    aliases: ['Face pulls'],
    // Traps lead, so this files under pull. The same two muscles listed the other
    // way round would be a lateral raise on push day — see `lib/muscles.ts`.
    muscleGroups: ['traps', 'shoulders'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 2.5,
    equipment: 'cable',
  },
  {
    ...base,
    id: 'ex_shrug',
    name: 'Шраги',
    aliases: ['Shrugs'],
    muscleGroups: ['traps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 2.5,
    equipment: 'dumbbells',
  },
  {
    ...base,
    id: 'ex_hammer_curl',
    name: 'Сгибания «молот»',
    aliases: ['Hammer curls'],
    muscleGroups: ['biceps', 'forearms'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: true,
    incrementKg: 2.5,
    equipment: 'dumbbells',
  },
  {
    ...base,
    id: 'ex_ohp',
    name: 'Жим стоя',
    aliases: ['Overhead press'],
    muscleGroups: ['shoulders', 'triceps'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 2.5,
    equipment: 'barbell',
    barWeightKg: 20,
  },
  {
    ...base,
    id: 'ex_squat',
    name: 'Приседания со штангой',
    aliases: ['Back squat'],
    muscleGroups: ['quads', 'glutes'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5,
    equipment: 'barbell',
    barWeightKg: 20,
  },
  {
    ...base,
    id: 'ex_calf_raise',
    name: 'Подъёмы на носки',
    aliases: ['Calf raises'],
    muscleGroups: ['calves'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    incrementKg: 5,
  },
];

export const seedExercisesById: Record<string, Exercise> = Object.fromEntries(
  seedExercises.map((e) => [e.id, e]),
);

/* ------------------------------------------------------------------ */
/* Routines                                                            */
/* ------------------------------------------------------------------ */

export const seedRoutine: Routine = {
  id: 'r_pull',
  ownerId: 'u1',
  name: 'Тяга + плавание',
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
    },
    {
      id: 'ri2',
      exerciseId: 'ex_pulldown_wide',
      order: 1,
      targetSets: 4,
      targetRepsMin: 5,
      targetRepsMax: 8,
    },
    { id: 'ri3', exerciseId: 'ex_row_stomach', order: 2, targetSets: 4, targetRepsMax: 10 },
    { id: 'ri4', exerciseId: 'ex_brachialis', order: 3, targetSets: 4, targetRepsMax: 16 },
    { id: 'ri5', exerciseId: 'ex_situp_weighted', order: 4, targetSets: 3, targetRepsMax: 12 },
    /*
     * The two shapes of a timed set, back to back: a 2:00 plank the clock counts
     * DOWN to a prescribed target, and a dead hang the clock counts UP until the
     * hands give out. `targetRepsMax` is seconds for time-counted work, so it is
     * also what the countdown starts from.
     */
    { id: 'ri7', exerciseId: 'ex_plank', order: 5, targetSets: 3, targetRepsMax: 120 },
    { id: 'ri8', exerciseId: 'ex_dead_hang', order: 6, targetSets: 2, targetRepsMax: 45 },
    // 50 min in the pool.
    { id: 'ri6', exerciseId: 'ex_swim', order: 7, targetSets: 1, targetRepsMax: 3000 },
  ],
};

export const seedRoutinePush: Routine = {
  id: 'r_push',
  ownerId: 'u1',
  name: 'Жим',
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
    },
    {
      id: 'rp2',
      exerciseId: 'ex_pushups',
      order: 1,
      targetSets: 4,
      targetRepsMin: 12,
      targetRepsMax: 15,
    },
  ],
};

export const seedRoutineBoxing: Routine = {
  id: 'r_boxing',
  ownerId: 'u1',
  name: 'Бокс (кардио)',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
  items: [
    // 12 rounds of 3:00, 1:00 between them.
    { id: 'rb1', exerciseId: 'ex_boxing_bag', order: 0, targetSets: 12, targetRepsMax: 180 },
    {
      id: 'rb2',
      exerciseId: 'ex_pushups',
      order: 1,
      targetSets: 4,
      targetRepsMin: 12,
      targetRepsMax: 15,
    },
  ],
};

/**
 * The skill day. Holds first, while the shoulders are fresh, then the one
 * rep-counted skill.
 *
 * `targetRepsMax` is SECONDS for time-counted work, so these numbers are the hold
 * each set starts prefilled with — and on a count-up they are a prefill and not a
 * prescription: the clock runs until DONE and logs what it read.
 */
export const seedRoutineCalisthenics: Routine = {
  id: 'r_calisthenics',
  ownerId: 'u1',
  name: 'Навыки калистеники',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
  items: [
    { id: 'rc1', exerciseId: 'ex_handstand', order: 0, targetSets: 3, targetRepsMax: 30 },
    { id: 'rc2', exerciseId: 'ex_front_lever', order: 1, targetSets: 4, targetRepsMax: 10 },
    { id: 'rc3', exerciseId: 'ex_planche', order: 2, targetSets: 4, targetRepsMax: 10 },
    { id: 'rc4', exerciseId: 'ex_l_sit', order: 3, targetSets: 3, targetRepsMax: 20 },
    { id: 'rc5', exerciseId: 'ex_muscle_up', order: 4, targetSets: 4, targetRepsMax: 3 },
  ],
};

export const seedRoutines: Routine[] = [
  seedRoutine,
  seedRoutinePush,
  seedRoutineBoxing,
  seedRoutineCalisthenics,
];

/* ------------------------------------------------------------------ */
/* The names this library used to ship under                           */
/* ------------------------------------------------------------------ */

/**
 * Seeded id → the ENGLISH name that id shipped with before 1.9.0.
 *
 * The library is Russian now because the app is, but a phone that installed an
 * earlier build has the English rows on disk and a migration is the only thing
 * that can reach them — the seeds are replaced wholesale on every launch after
 * the first, so nothing else ever looks at a persisted name again.
 *
 * Matched EXACTLY, so a row the user has renamed themselves is left alone: the
 * rename is only ever "this is still the name we gave it".
 */
export const SEEDED_ENGLISH_NAMES: Record<string, string> = {
  ex_pullup_90: 'Weighted 90° pull-ups',
  ex_pulldown_wide: 'Wide pull-ups machine',
  ex_row_stomach: 'Pull to stomach',
  ex_brachialis: 'Brachialis curls',
  ex_situp_weighted: 'Weighted sit-ups',
  ex_dips_weighted: 'Weighted dips',
  ex_pullup_bodyweight: 'Pull-ups, bodyweight',
  ex_pushups: 'Push-ups',
  ex_boxing_bag: 'Boxing bag',
  ex_swim: 'Swimming',
  ex_plank: 'Plank',
  ex_dead_hang: 'Dead hang',
  ex_hollow_hold: 'Hollow hold',
  ex_hanging_leg_raise: 'Hanging leg raises',
  ex_handstand: 'Handstand hold',
  ex_front_lever: 'Front lever hold',
  ex_planche: 'Planche hold',
  ex_l_sit: 'L-sit',
  ex_muscle_up: 'Muscle-up',
  ex_deadlift: 'Deadlift',
  ex_row_barbell: 'Barbell row',
  ex_face_pull: 'Face pulls',
  ex_shrug: 'Shrugs',
  ex_hammer_curl: 'Hammer curls',
  ex_ohp: 'Overhead press',
  ex_squat: 'Back squat',
  ex_calf_raise: 'Calf raises',
};

/** The same, for the four shipped routines. */
export const SEEDED_ENGLISH_ROUTINE_NAMES: Record<string, string> = {
  r_pull: 'Pull + swimming',
  r_push: 'Push',
  r_boxing: 'Boxing (cardio)',
  r_calisthenics: 'Calisthenics skills',
};
