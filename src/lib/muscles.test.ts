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
  clusterOf,
  describeRoutineFocus,
  groupByCluster,
  primaryMuscle,
  routineFocus,
  sectionLabel,
  touchesCluster,
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
      const homes = CLUSTERS.filter((c) => (CLUSTER_MUSCLES[c] as readonly MuscleGroup[]).includes(muscle));
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

  it('is generous when FILTERING: any muscle counts, not just the primary', () => {
    const dips = byId('ex_dips_weighted');
    expect(clusterOf(dips)).toBe('push');
    // Filed under push, but a pull-day filter would still be wrong to hide
    // something that works a pull muscle — brachialis curls list forearms too.
    const curls = byId('ex_brachialis');
    expect(touchesCluster(curls, 'pull')).toBe(true);
    expect(touchesCluster(dips, 'pull')).toBe(false);
  });
});

describe('grouping the library', () => {
  const { sections, unfiled } = groupByCluster(seedExercises);

  it('lists every exercise exactly once', () => {
    const listed = [...sections.flatMap((s) => s.exercises), ...unfiled];
    expect(listed).toHaveLength(seedExercises.length);
    expect(new Set(listed.map((e) => e.id)).size).toBe(seedExercises.length);
  });

  it('orders sections cluster by cluster, muscle by muscle', () => {
    const order = sections.map((s) => s.cluster);
    const expected = CLUSTERS.filter((c) => order.includes(c));
    // Never interleaved: all the push sections, then all the pull sections, …
    expect([...new Set(order)]).toEqual(expected);
  });

  it('labels a section by both levels, unless they are the same word', () => {
    expect(sectionLabel({ cluster: 'pull', muscle: 'back' })).toBe('Pull · back');
    expect(sectionLabel({ cluster: 'core', muscle: 'core' })).toBe('Core');
  });

  it('files within the filtered cluster, so no header contradicts the filter', () => {
    // Face pulls are ['traps', 'shoulders'] — filed under pull, but the push
    // filter is generous enough to include them. Under that filter they must
    // appear as SHOULDERS, never as a stray PULL · TRAPS header.
    const pushed = groupByCluster([byId('ex_face_pull'), byId('ex_dips_weighted')], 'push');
    expect(pushed.sections.every((s) => s.cluster === 'push')).toBe(true);
    expect(pushed.sections.find((s) => s.muscle === 'shoulders')?.exercises).toEqual([
      byId('ex_face_pull'),
    ]);

    // Unfiltered, the same exercise files under its primary.
    const browsed = groupByCluster([byId('ex_face_pull')]);
    expect(browsed.sections[0]).toMatchObject({ cluster: 'pull', muscle: 'traps' });
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
    expect(describeRoutineFocus([{ ...byId('ex_pushups'), muscleGroups: [] } as Exercise])).toBeNull();
  });
});
