/**
 * The library's two-level hierarchy: MUSCLE GROUP under MOVEMENT CLUSTER.
 *
 *   pull   → back · traps · biceps · forearms · neck
 *   push   → chest · shoulders · triceps
 *   legs   → quads · hamstrings · glutes · calves
 *   core   → core
 *   cardio → cardio
 *
 * Two rules make this worth having rather than being decoration:
 *
 *  1. EVERY MUSCLE GROUP BELONGS TO EXACTLY ONE CLUSTER. The map below is the
 *     single declaration of that, and `_everyMuscleHasACluster` proves it at
 *     COMPILE time — adding a `MuscleGroup` without filing it is a type error,
 *     not a section that silently renders empty.
 *
 *  2. THE FIRST MUSCLE IN `Exercise.muscleGroups` IS THE PRIMARY, and the
 *     primary alone decides the cluster. Pull-ups are `['back', 'biceps']` and
 *     file under pull; a face pull is `['traps', 'shoulders']` and files under
 *     pull; a lateral raise is `['shoulders', 'traps']` and files under push.
 *     Anything else needs an exercise to be in two places at once, and a library
 *     where one row appears twice is a library you stop trusting.
 *
 * The payoff is that "pull day" stops being a name someone typed. `routineFocus`
 * reads a routine's exercises and answers "Pull · back, biceps" from the
 * exercises themselves, so a routine cannot claim to be a pull day while being
 * three quad movements.
 *
 * Clusters are DERIVED, never stored on the exercise: a total function of data
 * that is already there earns no column, and a denormalized copy is one more
 * thing that can disagree with itself.
 */

import type { Exercise, ID, MuscleCluster, MuscleGroup, RoutineItem } from '../types/models';

/**
 * Cluster → its muscles, in display order. The ONE place the hierarchy is
 * declared; everything else in this file is derived from it.
 */
export const CLUSTER_MUSCLES = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'traps', 'biceps', 'forearms', 'neck'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  core: ['core'],
  cardio: ['cardio'],
} as const satisfies Record<MuscleCluster, readonly MuscleGroup[]>;

/** Display order for the library tree and for the create screen's cluster chips. */
export const CLUSTERS = Object.keys(CLUSTER_MUSCLES) as MuscleCluster[];

/**
 * Compile-time totality proof. If a `MuscleGroup` is added to the union without
 * being filed under a cluster above, `Missing` stops being `never` and this line
 * fails to typecheck. That is deliberately louder than a runtime test: the
 * mistake is caught in the same edit that causes it.
 */
type FiledMuscles = (typeof CLUSTER_MUSCLES)[MuscleCluster][number];
type Missing = Exclude<MuscleGroup, FiledMuscles>;
const _everyMuscleHasACluster: Missing extends never ? true : Missing = true;
void _everyMuscleHasACluster;

/** Muscle → cluster. Inverted from the map above so the two cannot drift. */
export const MUSCLE_CLUSTER: Record<MuscleGroup, MuscleCluster> = Object.fromEntries(
  CLUSTERS.flatMap((cluster) => CLUSTER_MUSCLES[cluster].map((muscle) => [muscle, cluster])),
) as Record<MuscleGroup, MuscleCluster>;

/** Every muscle group, in cluster order. */
export const MUSCLE_GROUPS: MuscleGroup[] = CLUSTERS.flatMap((c) => [...CLUSTER_MUSCLES[c]]);

/* ------------------------------------------------------------------ */
/* Reading one exercise                                                */
/* ------------------------------------------------------------------ */

type MuscleSubject = Pick<Exercise, 'muscleGroups'>;

/** The primary muscle — the first one listed. Null for an unfiled exercise. */
export function primaryMuscle(exercise: MuscleSubject): MuscleGroup | null {
  return exercise.muscleGroups[0] ?? null;
}

/** The cluster an exercise files under: the cluster of its primary muscle. */
export function clusterOf(exercise: MuscleSubject): MuscleCluster | null {
  const primary = primaryMuscle(exercise);
  return primary ? MUSCLE_CLUSTER[primary] : null;
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/** "Pull". Rendered uppercase by the caller's style where that's the design. */
export function clusterLabel(cluster: MuscleCluster): string {
  return cluster.charAt(0).toUpperCase() + cluster.slice(1);
}

/* ------------------------------------------------------------------ */
/* Grouping the library                                                */
/* ------------------------------------------------------------------ */

export interface MuscleNode {
  muscle: MuscleGroup;
  /** Exercises filed here, by primary muscle. May be empty. */
  exercises: Exercise[];
}

export interface ClusterNode {
  cluster: MuscleCluster;
  /** Every muscle in the cluster, in display order — empty groups included. */
  groups: MuscleNode[];
  /** Exercises across the whole cluster, for the collapsed row's count. */
  total: number;
}

/**
 * The full hierarchy as a two-level tree: `push → chest → [dips, pec flies]`.
 *
 * EVERY cluster and EVERY muscle comes back, including the empty ones, because an
 * empty group is a destination rather than dead space: the library screen hangs an
 * `+ Add exercise to chest` row off each one, and a `chest` that vanishes because
 * you own no chest exercises is a `chest` you cannot add one to. That is the one
 * way this differs from listing only what is populated, and it is the whole reason
 * the library is a tree you open instead of a filter you apply.
 *
 * Filing follows the primary-muscle rule (see the file header): an exercise
 * appears exactly once, under `muscleGroups[0]`. Exercises with no muscles at all
 * come back separately in `unfiled` rather than being dropped.
 */
export function buildMuscleTree(exercises: Exercise[]): {
  clusters: ClusterNode[];
  unfiled: Exercise[];
} {
  const byMuscle = new Map<MuscleGroup, Exercise[]>();
  const unfiled: Exercise[] = [];

  for (const exercise of exercises) {
    const primary = primaryMuscle(exercise);
    if (!primary || !(primary in MUSCLE_CLUSTER)) {
      unfiled.push(exercise);
      continue;
    }
    const bucket = byMuscle.get(primary);
    if (bucket) bucket.push(exercise);
    else byMuscle.set(primary, [exercise]);
  }

  const clusters = CLUSTERS.map((cluster) => {
    const groups = CLUSTER_MUSCLES[cluster].map((muscle) => ({
      muscle,
      exercises: byMuscle.get(muscle) ?? [],
    }));
    return {
      cluster,
      groups,
      total: groups.reduce((sum, group) => sum + group.exercises.length, 0),
    };
  });

  return { clusters, unfiled };
}

/* ------------------------------------------------------------------ */
/* Reading a routine                                                   */
/* ------------------------------------------------------------------ */

export interface RoutineFocus {
  /** The cluster most of the work belongs to. Null for an unfiled routine. */
  cluster: MuscleCluster;
  /** Muscles worked inside that cluster, most-worked first. */
  muscles: MuscleGroup[];
}

/** How many muscles a focus line names before it stops being scannable. */
const MAX_NAMED_MUSCLES = 3;

/**
 * What day this actually is.
 *
 * The dominant cluster is the one with the most exercises — sit-ups and a swim
 * at the end of a pull session don't make it a core day or a cardio day. Ties go
 * to `CLUSTERS` order, which puts the compound families first.
 *
 * Muscles are ranked by how many exercises hit them (primary or secondary), so a
 * session with three back movements and one curl reads "back, biceps" in that
 * order — the way a lifter would say it.
 */
export function routineFocus(exercises: Exercise[]): RoutineFocus | null {
  const perCluster = new Map<MuscleCluster, number>();

  for (const exercise of exercises) {
    const cluster = clusterOf(exercise);
    if (!cluster) continue;
    perCluster.set(cluster, (perCluster.get(cluster) ?? 0) + 1);
  }
  if (perCluster.size === 0) return null;

  const dominant = CLUSTERS.filter((c) => perCluster.has(c)).reduce((best, c) =>
    (perCluster.get(c) ?? 0) > (perCluster.get(best) ?? 0) ? c : best,
  );

  const perMuscle = new Map<MuscleGroup, number>();
  for (const exercise of exercises) {
    for (const muscle of exercise.muscleGroups) {
      if (MUSCLE_CLUSTER[muscle] !== dominant) continue;
      perMuscle.set(muscle, (perMuscle.get(muscle) ?? 0) + 1);
    }
  }

  const muscles = [...perMuscle.keys()].sort((a, b) => {
    const byCount = (perMuscle.get(b) ?? 0) - (perMuscle.get(a) ?? 0);
    // Canonical order breaks ties, so the same routine always reads the same.
    return byCount !== 0 ? byCount : MUSCLE_GROUPS.indexOf(a) - MUSCLE_GROUPS.indexOf(b);
  });

  return { cluster: dominant, muscles };
}

/**
 * "Pull · back, biceps, forearms" — the one line under a routine's name.
 *
 * Capped at three muscles with a `+n`: past three the line has stopped telling
 * you what day it is and started listing the routine back to you.
 */
export function describeRoutineFocus(exercises: Exercise[]): string | null {
  const focus = routineFocus(exercises);
  if (!focus) return null;

  const named = focus.muscles.slice(0, MAX_NAMED_MUSCLES);
  const extra = focus.muscles.length - named.length;
  const tail = named.length > 0 ? ` · ${named.join(', ')}${extra > 0 ? ` +${extra}` : ''}` : '';
  return `${clusterLabel(focus.cluster)}${tail}`;
}

/** The same line for a routine's items, resolving the library as it goes. */
export function describeItemsFocus(
  items: RoutineItem[],
  exercisesById: Record<ID, Exercise>,
): string | null {
  return describeRoutineFocus(
    items.map((item) => exercisesById[item.exerciseId]).filter((e): e is Exercise => e != null),
  );
}
