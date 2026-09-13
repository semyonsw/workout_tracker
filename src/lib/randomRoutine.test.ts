import { describe, expect, it } from 'vitest';

import { drawableCount, rollRoutine, rolledName, shuffled } from './randomRoutine';
import type { Exercise, MuscleGroup } from '../types/models';

/**
 * The die.
 *
 * The one property worth defending is the SPREAD. A uniform draw from a pool
 * where one cluster has sixty exercises and another has three produces "pull +
 * core" routines that are five pull movements about half the time — and the name
 * the app derives from the draw would then be a lie about what it drew. So every
 * cluster that was asked for and can be supplied appears before any of them gets
 * a second slot, and that is what most of these pin.
 *
 * The randomness is injected so this is arithmetic rather than something somebody
 * eyeballs by pressing a button a few times.
 */

function exercise(id: string, muscle: MuscleGroup, over: Partial<Exercise> = {}): Exercise {
  return {
    id,
    ownerId: null,
    name: `${id} ${muscle}`,
    muscleGroups: [muscle],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/** Always the first of whatever is offered — a deterministic "random". */
const first = () => 0;

const LIBRARY: Exercise[] = [
  exercise('p1', 'chest'),
  exercise('p2', 'shoulders'),
  exercise('p3', 'triceps'),
  exercise('l1', 'back'),
  exercise('l2', 'biceps'),
  exercise('l3', 'traps'),
  exercise('c1', 'core'),
];

describe('what it draws from', () => {
  it('draws from the whole library when no cluster is named', () => {
    expect(drawableCount(LIBRARY, [])).toBe(LIBRARY.length);
  });

  it('draws only from the clusters that were named', () => {
    expect(drawableCount(LIBRARY, ['core'])).toBe(1);
    expect(drawableCount(LIBRARY, ['pull', 'core'])).toBe(4);
  });

  it('never draws an archived exercise', () => {
    const withArchived = [...LIBRARY, exercise('gone', 'core', { isArchived: true })];
    expect(drawableCount(withArchived, ['core'])).toBe(1);
  });

  it('never draws an exercise filed under nothing', () => {
    const unfiled = [...LIBRARY, exercise('x', 'core', { muscleGroups: [] })];
    expect(drawableCount(unfiled, [])).toBe(LIBRARY.length);
  });
});

describe('the draw', () => {
  it('is nothing at all when there is nothing to draw', () => {
    expect(rollRoutine([], { clusters: [], exerciseCount: 5, sets: null }, first)).toBeNull();
    expect(
      rollRoutine(LIBRARY, { clusters: ['cardio'], exerciseCount: 5, sets: null }, first),
    ).toBeNull();
  });

  it('deals one slot per cluster before any cluster gets a second', () => {
    const rolled = rollRoutine(
      LIBRARY,
      { clusters: ['push', 'pull', 'core'], exerciseCount: 3, sets: null },
      first,
    );
    // One from each, in canonical cluster order — not three from the biggest pool.
    expect(rolled?.exercises.map((e) => e.id)).toEqual(['p1', 'l1', 'c1']);
  });

  it('never draws the same exercise twice', () => {
    const rolled = rollRoutine(LIBRARY, { clusters: [], exerciseCount: 7, sets: null }, first);
    const ids = rolled?.exercises.map((e) => e.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stops at what the library can supply rather than repeating to fill', () => {
    const rolled = rollRoutine(
      LIBRARY,
      { clusters: ['core'], exerciseCount: 5, sets: null },
      first,
    );
    expect(rolled?.exercises).toHaveLength(1);
  });

  it('clamps a nonsense count instead of building a hundred-row routine', () => {
    const rolled = rollRoutine(LIBRARY, { clusters: [], exerciseCount: 999, sets: null }, first);
    expect(rolled?.exercises.length).toBeLessThanOrEqual(LIBRARY.length);
  });
});

describe('the plan it builds', () => {
  it('uses each exercise’s own set count when none was asked for', () => {
    const rolled = rollRoutine(
      [exercise('a', 'core', { defaultSets: 3 })],
      { clusters: ['core'], exerciseCount: 1, sets: null },
      first,
    );
    expect(rolled?.items[0].targetSets).toBe(3);
  });

  it('uses the number that was asked for, over the exercise’s own', () => {
    const rolled = rollRoutine(
      [exercise('a', 'core', { defaultSets: 3 })],
      { clusters: ['core'], exerciseCount: 1, sets: 5 },
      first,
    );
    expect(rolled?.items[0].targetSets).toBe(5);
  });

  /*
   * Rest BETWEEN sets belongs to the movement and is resolved live
   * (`lib/rest.ts`), so a dice roll must not write one — it would change that
   * exercise in every other routine containing it. What a routine owns is the
   * rest AFTER its last set, and that is what gets a value.
   */
  it('gives every item a transition rest and no per-set rest', () => {
    const rolled = rollRoutine(LIBRARY, { clusters: [], exerciseCount: 3, sets: null }, first);
    for (const item of rolled?.items ?? []) {
      expect(item.transitionRestSeconds).toBeGreaterThan(0);
      expect('restSeconds' in item).toBe(false);
    }
  });

  it('numbers the items densely from zero', () => {
    const rolled = rollRoutine(LIBRARY, { clusters: [], exerciseCount: 4, sets: null }, first);
    expect(rolled?.items.map((i) => i.order)).toEqual([0, 1, 2, 3]);
  });
});

describe('the name', () => {
  it('joins the clusters that were actually drawn, in canonical order', () => {
    expect(rolledName([exercise('c', 'core'), exercise('p', 'back')])).toBe('Pull + Core');
  });

  it('names only what came out, not what was asked for', () => {
    // Asked for three clusters, the library only supplies core.
    const rolled = rollRoutine(
      [exercise('c1', 'core')],
      { clusters: ['push', 'pull', 'core'], exerciseCount: 3, sets: null },
      first,
    );
    expect(rolled?.name).toBe('Core');
  });

  it('caps at three and counts the rest', () => {
    const name = rolledName([
      exercise('a', 'chest'),
      exercise('b', 'back'),
      exercise('c', 'quads'),
      exercise('d', 'core'),
      exercise('e', 'cardio'),
    ]);
    expect(name).toBe('Push + Pull + Legs +2');
  });
});

describe('the reel’s shuffle', () => {
  it('keeps every value and changes nothing else', () => {
    const values = [1, 2, 3, 4, 5];
    const out = shuffled(values, () => 0.5);
    expect([...out].sort()).toEqual(values);
    expect(values).toEqual([1, 2, 3, 4, 5]);
  });
});
