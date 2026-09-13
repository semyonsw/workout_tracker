/**
 * A routine, rolled.
 *
 *   dice  →  Pull + Core
 *            Weighted 90° pull-ups      4 × 8
 *            Wide pull-ups machine      4 × 8
 *            Hammer curls               4 × 10
 *            Hanging leg raises         4 × 12
 *            Plank                      3 × 60s
 *
 * ── WHY THIS IS WORTH HAVING AT ALL ───────────────────────────────────────
 *
 * A library of eighty exercises is a library where the same nine get trained,
 * because building a routine means deciding, and deciding is what you have no
 * appetite for at 06:40. The dice removes the decision without removing the
 * choice: what comes out is an ordinary routine, in the ordinary editor, and
 * every row of it can be changed or thrown away.
 *
 * ── THE NAME IS DERIVED, NOT TYPED ────────────────────────────────────────
 *
 * `Pull + Core`, from the clusters the picks actually landed in — the same
 * `describeRoutineFocus` logic that makes "pull day" a fact about a routine
 * rather than a name somebody typed (`lib/muscles.ts`). Two consequences worth
 * stating: asking for pull and core and getting `Pull + Core` is the name
 * agreeing with the roll, and asking for four clusters and only having exercises
 * for two names it after the two, because that is what the routine IS.
 *
 * Clusters appear in `CLUSTERS` order rather than in the order the user ticked
 * them, so the same roll always produces the same name.
 *
 * ── THE RANDOMNESS IS INJECTED ────────────────────────────────────────────
 *
 * `rand` is a parameter, defaulting to `Math.random`. That is the whole reason
 * this file is testable: a seeded sequence makes "five exercises, no repeats,
 * spread across the clusters that were asked for" an assertion rather than a
 * thing somebody eyeballs by pressing the button a few times.
 *
 * ── SPREAD ACROSS CLUSTERS, NOT UNIFORM OVER EXERCISES ────────────────────
 *
 * A uniform draw from the pool gives the cluster with the most exercises most of
 * the slots — ask for pull and core with sixty pull movements and four core ones,
 * and "pull + core" is five pull exercises about half the time. So the slots are
 * dealt round-robin across the clusters that have anything in them, and only
 * then filled at random from within the cluster. Every cluster you asked for
 * appears if it possibly can, which is what makes the name true.
 *
 * ── WHAT IT DOES NOT TOUCH ────────────────────────────────────────────────
 *
 * Rest between sets belongs to the MOVEMENT and is resolved live (`lib/rest.ts`
 * has the argument), so a dice roll does not write one — a random number landing
 * on an exercise's own rest would change that exercise in every other routine
 * that contains it, which is precisely the bug that file exists to have fixed.
 * What a routine legitimately owns is the rest AFTER its last set, and that is
 * what gets a value here: longer after a compound family, shorter after core.
 */

import { defaultTargetCount, defaultTargetSets } from './draft';
import { clusterLabel, clusterOf, CLUSTERS } from './muscles';
import type { Exercise, ID, MuscleCluster, RoutineItem } from '../types/models';

/** What the user asked the dice for. */
export interface RandomSpec {
  /** Which movement families may be drawn from. Empty = every one of them. */
  clusters: readonly MuscleCluster[];
  /** How many exercises to deal. Clamped to what the library can actually supply. */
  exerciseCount: number;
  /**
   * Sets per exercise, or null to let each exercise say what it wants.
   *
   * Null is the default and the honest one: three planks and twelve rounds on a
   * bag are facts about those movements (`defaultTargetSets`), and forcing four
   * onto both is the dice overriding the library. A number is somebody saying
   * "today, everything is three", which is a real thing to want.
   */
  sets: number | null;
}

export const DEFAULT_RANDOM_SPEC: RandomSpec = {
  clusters: [],
  exerciseCount: 5,
  sets: null,
};

/** Sensible bounds for the sheet's steppers, and for the clamp below. */
export const RANDOM_LIMITS = {
  exerciseCount: { min: 1, max: 12 },
  sets: { min: 1, max: 10 },
} as const;

export interface RolledRoutine {
  /** "Pull + Core", derived from what was actually drawn. */
  name: string;
  /** Ready for `Routine.items` once the caller has given them ids. */
  items: Omit<RoutineItem, 'id'>[];
  /** The exercises, in the drawn order — for the animation and for a preview. */
  exercises: Exercise[];
}

/**
 * Extra rest after the LAST set of an exercise, by cluster, in seconds.
 *
 * The one number a routine is allowed to have an opinion about (see the file
 * header). Compound families get the walk to the next station; core and skill
 * work get less, because you are already on the floor.
 */
const TRANSITION_REST: Record<MuscleCluster, number> = {
  push: 150,
  pull: 150,
  legs: 180,
  core: 90,
  cardio: 120,
  skill: 120,
};

/** A live, filed exercise the dice is allowed to draw. */
function drawable(exercise: Exercise): boolean {
  return !exercise.isArchived && clusterOf(exercise) !== null;
}

/**
 * Deal `exerciseCount` exercises from the asked-for clusters, and build a plan.
 *
 * Returns null when there is nothing to draw at all — an empty library, or a set
 * of clusters the library has nothing filed under. The caller says so rather
 * than producing an empty routine, because a dice that quietly does nothing is
 * indistinguishable from a dice that is broken.
 */
export function rollRoutine(
  exercises: readonly Exercise[],
  spec: RandomSpec = DEFAULT_RANDOM_SPEC,
  rand: () => number = Math.random,
): RolledRoutine | null {
  const wanted = spec.clusters.length > 0 ? new Set(spec.clusters) : new Set(CLUSTERS);

  /** Cluster → its drawable exercises, in canonical cluster order. */
  const pools = new Map<MuscleCluster, Exercise[]>();
  for (const exercise of exercises) {
    if (!drawable(exercise)) continue;
    const cluster = clusterOf(exercise);
    if (!cluster || !wanted.has(cluster)) continue;
    const pool = pools.get(cluster);
    if (pool) pool.push(exercise);
    else pools.set(cluster, [exercise]);
  }

  const available = CLUSTERS.filter((cluster) => (pools.get(cluster)?.length ?? 0) > 0);
  if (available.length === 0) return null;

  const total = Math.min(
    clamp(spec.exerciseCount, RANDOM_LIMITS.exerciseCount),
    available.reduce((sum, cluster) => sum + (pools.get(cluster)?.length ?? 0), 0),
  );

  /*
   * Round-robin over the clusters that have anything left, so every family the
   * user asked for is represented before any of them gets a second slot — see
   * the file header on why a uniform draw is the wrong shape.
   */
  const picked: Exercise[] = [];
  let turn = 0;
  while (picked.length < total) {
    const cluster = available[turn % available.length];
    turn += 1;
    const pool = pools.get(cluster);
    if (!pool || pool.length === 0) {
      // Exhausted. If every pool is, the loop would spin — so stop.
      if (available.every((c) => (pools.get(c)?.length ?? 0) === 0)) break;
      continue;
    }
    const at = Math.min(pool.length - 1, Math.max(0, Math.floor(rand() * pool.length)));
    // Removed rather than skipped, so one exercise cannot be drawn twice.
    picked.push(pool.splice(at, 1)[0]);
  }

  const items = picked.map((exercise, order) => {
    const cluster = clusterOf(exercise);
    return {
      exerciseId: exercise.id,
      order,
      targetSets:
        spec.sets == null ? defaultTargetSets(exercise) : clamp(spec.sets, RANDOM_LIMITS.sets),
      targetRepsMax: defaultTargetCount(exercise),
      transitionRestSeconds: cluster ? TRANSITION_REST[cluster] : 120,
    } satisfies Omit<RoutineItem, 'id'>;
  });

  return { name: rolledName(picked), items, exercises: picked };
}

/**
 * "Pull + Core" — every cluster that was actually drawn, in canonical order.
 *
 * Capped at three names with a `+n`, on the same reasoning `describeRoutineFocus`
 * gives for its own cap: past three the line has stopped saying what day it is
 * and started listing the routine back to you.
 */
export function rolledName(picked: readonly Exercise[]): string {
  const present = CLUSTERS.filter((cluster) =>
    picked.some((exercise) => clusterOf(exercise) === cluster),
  );
  if (present.length === 0) return 'Random';
  const named = present.slice(0, 3).map((cluster) => clusterLabel(cluster));
  const extra = present.length - named.length;
  return named.join(' + ') + (extra > 0 ? ` +${extra}` : '');
}

/**
 * One frame of the shuffle: the same exercises, in a different order.
 *
 * The animation needs something plausible to show between the tap and the
 * answer, and "names the user owns, reordered" is the only honest thing it can
 * be — inventing names, or showing exercises from clusters the roll excluded,
 * would be the app lying for 1.2 seconds about what it is doing.
 */
export function shuffled<T>(values: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every drawable exercise, for a reel that needs something to spin. */
export function drawablePool(
  exercises: readonly Exercise[],
  clusters: readonly MuscleCluster[],
): Exercise[] {
  const wanted = clusters.length > 0 ? new Set(clusters) : new Set(CLUSTERS);
  return exercises.filter((exercise) => {
    if (!drawable(exercise)) return false;
    const cluster = clusterOf(exercise);
    return cluster != null && wanted.has(cluster);
  });
}

/** How many exercises the library could supply for a set of clusters. */
export function drawableCount(
  exercises: readonly Exercise[],
  clusters: readonly MuscleCluster[],
): number {
  return drawablePool(exercises, clusters).length;
}

function clamp(value: number, limits: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return limits.min;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}

/** Item ids, once the store has a stamp to hang them off. */
export function withItemIds(items: Omit<RoutineItem, 'id'>[], stamp: string): RoutineItem[] {
  return items.map((item, order) => ({ ...item, id: `ri_${stamp}_${order}` as ID, order }));
}
