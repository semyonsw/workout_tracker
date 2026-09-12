/**
 * Muscle-hierarchy tests.
 *
 * Two things are worth a test here, and they are both about the hierarchy being
 * TRUSTWORTHY rather than about strings:
 *
 *  1. The map is total and consistent — every muscle files under exactly one
 *     cluster, and the inverted map cannot drift from the declared one. (The
 *     union's totality is proved at compile time in `muscles.ts`; this covers the
 *     runtime inverse.)
 *  2. `routineFocus` reads a routine and says what day it actually is. That claim
 *     appears on the home screen and in the routine list, so it has to survive a
 *     session with a swim bolted onto the end of it.
 *
 * Run: npx vitest run src/lib/muscles.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  CLUSTERS,
  CLUSTER_MUSCLES,
  MUSCLE_CLUSTER,
  MUSCLE_GROUPS,
  buildMuscleTree,
  clusterOf,
  describeRoutineFocus,
  primaryMuscle,
  routineFocus,
} from './muscles';
import { seedExercises, seedExercisesById, seedRoutine, seedRoutinePush } from '../data/seed';
import type { Exercise, MuscleGroup } from '../types/models';

const byId = (id: string) => seedExercisesById[id];
const routineExercises = (items: { exerciseId: string }[]) =>
  items.map((i) => byId(i.exerciseId)).filter(Boolean);

describe('the map', () => {
  it('files every muscle under exactly one cluster, both ways round', () => {
    for (const muscle of MUSCLE_GROUPS) {
      const cluster = MUSCLE_CLUSTER[muscle];
      expect(cluster).toBeDefined();
      expect(CLUSTER_MUSCLES[cluster]).toContain(muscle);
      // ...and under no other cluster.
      const homes = CLUSTERS.filter((c) =>
        (CLUSTER_MUSCLES[c] as readonly MuscleGroup[]).includes(muscle),
      );
      expect(homes).toEqual([cluster]);
    }
  });

  it('puts back under pull and chest under push — the whole point', () => {
    expect(MUSCLE_CLUSTER.back).toBe('pull');
    expect(MUSCLE_CLUSTER.biceps).toBe('pull');
    expect(MUSCLE_CLUSTER.chest).toBe('push');
    expect(MUSCLE_CLUSTER.triceps).toBe('push');
  });
});

describe('filing an exercise', () => {
  it('files on the PRIMARY muscle, which is the first one listed', () => {
    // Pull-ups: back, then biceps. Pull work.
    expect(primaryMuscle(byId('ex_pullup_90'))).toBe('back');
    expect(clusterOf(byId('ex_pullup_90'))).toBe('pull');
    // Face pulls: traps lead, so they file under pull rather than push, even
    // though they also work shoulders.
    expect(clusterOf(byId('ex_face_pull'))).toBe('pull');
    // Dips: chest first. Push work, and its triceps don't change that.
    expect(clusterOf(byId('ex_dips_weighted'))).toBe('push');
  });

  it('has no cluster for an exercise with no muscles set', () => {
    const unfiled = { ...byId('ex_pushups'), muscleGroups: [] } as Exercise;
    expect(clusterOf(unfiled)).toBeNull();
  });
});

describe('what day is this', () => {
  it('reads a pull session as pull, back first', () => {
    const focus = routineFocus(routineExercises(seedRoutine.items));
    expect(focus?.cluster).toBe('pull');
    // Three back movements, then the arms — the order a lifter would say it in.
    expect(focus?.muscles[0]).toBe('back');
    expect(focus?.muscles).toContain('biceps');
    expect(describeRoutineFocus(routineExercises(seedRoutine.items))).toBe(
      'Pull · back, biceps, forearms',
    );
  });

  it('is not fooled by the sit-ups and the swim on the end of it', () => {
    // The pull routine also contains core work and a 50-minute swim. Neither is
    // what the day is.
    expect(routineFocus(routineExercises(seedRoutine.items))?.cluster).not.toBe('core');
    expect(routineFocus(routineExercises(seedRoutine.items))?.cluster).not.toBe('cardio');
  });

  it('reads a push session as push', () => {
    expect(describeRoutineFocus(routineExercises(seedRoutinePush.items))).toBe(
      'Push · chest, triceps',
    );
  });

  it('caps the named muscles so the line stays scannable', () => {
    const everything = [
      byId('ex_deadlift'),
      byId('ex_row_barbell'),
      byId('ex_face_pull'),
      byId('ex_shrug'),
      byId('ex_hammer_curl'),
      byId('ex_dead_hang'),
    ];
    expect(describeRoutineFocus(everything)).toBe('Pull · back, traps, biceps +1');
  });

  it('says nothing rather than guessing when nothing is filed', () => {
    expect(routineFocus([])).toBeNull();
    expect(
      describeRoutineFocus([{ ...byId('ex_pushups'), muscleGroups: [] } as Exercise]),
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('buildMuscleTree', () => {
  /*
   * The library screen hangs an `+ Add exercise to chest` row off every muscle
   * group, so the tree's contract is different from `groupByCluster`'s: it must
   * return the EMPTY groups too. A `chest` that vanishes because you own no chest
   * exercises is a `chest` you cannot add one to.
   */
  it('returns every cluster and every muscle, empty ones included', () => {
    const { clusters } = buildMuscleTree([]);

    expect(clusters.map((c) => c.cluster)).toEqual(CLUSTERS);
    for (const node of clusters) {
      expect(node.groups.map((g) => g.muscle)).toEqual([...CLUSTER_MUSCLES[node.cluster]]);
      expect(node.total).toBe(0);
    }
  });

  it('files each exercise once, under its primary muscle', () => {
    const { clusters, unfiled } = buildMuscleTree(seedExercises);

    const filed = clusters.flatMap((c) => c.groups.flatMap((g) => g.exercises));
    expect(filed.length + unfiled.length).toBe(seedExercises.length);
    expect(new Set(filed.map((e) => e.id)).size).toBe(filed.length);

    for (const node of clusters) {
      for (const group of node.groups) {
        for (const exercise of group.exercises) {
          expect(primaryMuscle(exercise)).toBe(group.muscle);
          expect(MUSCLE_CLUSTER[group.muscle]).toBe(node.cluster);
        }
      }
    }
  });

  /*
   * The count is the whole value of a collapsed row: `TRICEPS 5` answers "have I
   * got triceps work" without opening anything, so it must count the cluster and
   * not just the group the eye happens to be on.
   */
  it('totals a cluster from its groups', () => {
    const { clusters } = buildMuscleTree(seedExercises);
    for (const node of clusters) {
      expect(node.total).toBe(node.groups.reduce((n, g) => n + g.exercises.length, 0));
    }
  });

  it('keeps unfiled exercises rather than dropping them', () => {
    const orphan = { ...seedExercises[0], id: 'ex_orphan', muscleGroups: [] } as Exercise;
    const { clusters, unfiled } = buildMuscleTree([orphan]);

    expect(unfiled.map((e) => e.id)).toEqual(['ex_orphan']);
    expect(clusters.every((c) => c.total === 0)).toBe(true);
  });

  it('treats a muscle that is not in the hierarchy as unfiled, not as a crash', () => {
    const bogus = { ...seedExercises[0], id: 'ex_bogus', muscleGroups: ['spleen'] } as never;
    const { unfiled } = buildMuscleTree([bogus]);
    expect(unfiled).toHaveLength(1);
  });
});

/**
 * THE SKILL CLUSTER. A front lever is not back work, and filing it under `back`
 * put it in a section that said nothing about it. These are the two claims the
 * new cluster has to keep: it is a real destination in the tree, and it does not
 * quietly capture a routine that merely contains one hold.
 */
describe('calisthenics', () => {
  const skill = (name: string, muscles: MuscleGroup[]): Exercise => ({
    id: `ex_${name}`,
    ownerId: 'u1',
    name,
    muscleGroups: muscles,
    requiresWeight: false,
    countUnit: 'seconds',
    loadMode: 'none',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('files under its own cluster', () => {
    expect(MUSCLE_CLUSTER.calisthenics).toBe('skill');
    expect(clusterOf(skill('front lever', ['calisthenics', 'back']))).toBe('skill');
  });

  it('is a section of the library tree even when it is empty', () => {
    const { clusters } = buildMuscleTree([]);
    const node = clusters.find((c) => c.cluster === 'skill');

    expect(node?.groups.map((g) => g.muscle)).toEqual(['calisthenics']);
    expect(node?.total).toBe(0);
  });

  it('holds the exercises filed under it, and only those', () => {
    const lever = skill('front lever', ['calisthenics', 'back']);
    // Secondary, so this one is back work that happens to be hard.
    const rows = skill('inverted rows', ['back', 'calisthenics']);
    const { clusters } = buildMuscleTree([lever, rows]);

    const node = clusters.find((c) => c.cluster === 'skill');
    expect(node?.groups[0].exercises.map((e) => e.name)).toEqual(['front lever']);
    expect(node?.total).toBe(1);
  });

  it('names the day when the day is skills', () => {
    const focus = routineFocus([
      skill('handstand', ['calisthenics', 'shoulders']),
      skill('planche', ['calisthenics', 'chest']),
    ]);

    expect(focus?.cluster).toBe('skill');
    expect(describeRoutineFocus([skill('handstand', ['calisthenics'])])).toBe(
      'Skill · calisthenics',
    );
  });

  it('does not steal a pull day that happens to end with one hold', () => {
    const back = (name: string): Exercise => ({ ...skill(name, ['back']), countUnit: 'reps' });
    const focus = routineFocus([
      back('pull-ups'),
      back('rows'),
      back('pulldowns'),
      skill('front lever', ['calisthenics']),
    ]);

    expect(focus?.cluster).toBe('pull');
  });
});
