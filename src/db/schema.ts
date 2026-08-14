/**
 * SQLite schema (Drizzle ORM, running on expo-sqlite).
 *
 * The TypeScript interfaces in `types/models.ts` are the app's language; this
 * is the same model expressed for storage. Two things matter here:
 *
 *  1. THE INDEX ON `set_history (exercise_id, performed_at DESC)`.
 *     Every overload verdict is that one range scan. Without it the feature
 *     degrades from instant to "why is the workout screen janky at 400 sessions".
 *
 *  2. NULLABILITY IS MEANINGFUL. `weight_kg` is NULL — not 0 — for bodyweight
 *     and cardio work. Zero is a weight; NULL is the absence of the concept,
 *     and the overload engine relies on the difference.
 */

import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  unitSystem: text('unit_system', { enum: ['metric', 'imperial'] })
    .notNull()
    .default('metric'),
  bodyweightKg: real('bodyweight_kg'),
  defaultRestSeconds: integer('default_rest_seconds').notNull().default(120),
  /** OverloadPolicy as JSON — read whole, never queried by field. */
  overloadPolicy: text('overload_policy', { mode: 'json' }).notNull(),
  createdAt: text('created_at').notNull(),
});

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').references(() => users.id),
    name: text('name').notNull(),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>(),
    muscleGroups: text('muscle_groups', { mode: 'json' }).$type<string[]>().notNull(),

    requiresWeight: integer('requires_weight', { mode: 'boolean' }).notNull(),
    countUnit: text('count_unit', { enum: ['reps', 'seconds', 'meters', 'rounds'] })
      .notNull()
      .default('reps'),
    loadMode: text('load_mode', {
      enum: ['external', 'added_bodyweight', 'assisted', 'none'],
    })
      .notNull()
      .default('external'),

    isUnilateral: integer('is_unilateral', { mode: 'boolean' }).notNull().default(false),
    incrementKg: real('increment_kg'),
    defaultRestSeconds: integer('default_rest_seconds'),
    equipment: text('equipment'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_exercise_name').on(table.name)],
);

export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  splitTag: text('split_tag'),
  estimatedMinutes: integer('estimated_minutes'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const routineItems = sqliteTable(
  'routine_items',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    order: integer('order').notNull(),
    targetSets: integer('target_sets').notNull().default(3),
    targetRepsMin: integer('target_reps_min'),
    targetRepsMax: integer('target_reps_max'),
    restSeconds: integer('rest_seconds'),
    transitionRestSeconds: integer('transition_rest_seconds'),
    supersetGroup: text('superset_group'),
    notes: text('notes'),
  },
  (table) => [index('idx_routine_items_routine').on(table.routineId, table.order)],
);

export const splits = sqliteTable('splits', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  cycleMode: text('cycle_mode', { enum: ['weekly', 'rolling'] })
    .notNull()
    .default('rolling'),
  cursor: integer('cursor').notNull().default(0),
  startedOn: text('started_on').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const splitDays = sqliteTable('split_days', {
  id: text('id').primaryKey(),
  splitId: text('split_id')
    .notNull()
    .references(() => splits.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  label: text('label').notNull(),
  kind: text('kind', { enum: ['routine', 'rest', 'freeform'] })
    .notNull()
    .default('routine'),
  routineId: text('routine_id').references(() => routines.id),
  weekday: integer('weekday'),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    routineId: text('routine_id').references(() => routines.id),
    splitDayId: text('split_day_id').references(() => splitDays.id),
    title: text('title').notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    status: text('status', { enum: ['active', 'completed', 'abandoned'] })
      .notNull()
      .default('active'),
    totalVolumeKg: real('total_volume_kg'),
    bodyweightKg: real('bodyweight_kg'),
    notes: text('notes'),
  },
  (table) => [index('idx_sessions_started').on(table.startedAt)],
);

export const setHistory = sqliteTable(
  'set_history',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    /** Denormalized from the session — this is what makes the index below work. */
    performedAt: text('performed_at').notNull(),

    setIndex: integer('set_index').notNull(),
    /** NULL for bodyweight / cardio. Never 0-as-absent. */
    weightKg: real('weight_kg'),
    count: real('count').notNull(),
    countUnit: text('count_unit', { enum: ['reps', 'seconds', 'meters', 'rounds'] }).notNull(),
    loadMode: text('load_mode', {
      enum: ['external', 'added_bodyweight', 'assisted', 'none'],
    }).notNull(),

    partials: integer('partials'),
    side: text('side', { enum: ['both', 'left', 'right'] }).default('both'),
    rpe: real('rpe'),
    isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
    isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(true),
    restTakenSeconds: integer('rest_taken_seconds'),
    estimated1RM: real('estimated_1rm'),
    notes: text('notes'),
  },
  (table) => [
    /**
     * THE overload index. Backs:
     *   SELECT * FROM set_history
     *   WHERE exercise_id = ?1 AND is_warmup = 0 AND is_completed = 1
     *   ORDER BY performed_at DESC
     *   LIMIT 200;
     * ~200 rows covers a year of any single exercise — more than the engine
     * needs, and bounded so the query cost never grows with training age.
     */
    index('idx_set_history_exercise_time').on(table.exerciseId, table.performedAt),
    index('idx_set_history_session').on(table.sessionId),
  ],
);

/**
 * Rollup cache. Pure derivation of `set_history`, recomputed on session
 * completion, safe to drop and rebuild. Lets list screens show overload badges
 * without loading history for every exercise on the routine.
 */
export const exerciseStats = sqliteTable('exercise_stats', {
  exerciseId: text('exercise_id')
    .primaryKey()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  lastPerformedAt: text('last_performed_at').notNull(),
  lastTopWeightKg: real('last_top_weight_kg'),
  topWeightSince: text('top_weight_since'),
  sessionsAtTopWeight: integer('sessions_at_top_weight').notNull().default(0),
  bestE1RM: real('best_e1rm'),
  updatedAt: text('updated_at').notNull(),
});
