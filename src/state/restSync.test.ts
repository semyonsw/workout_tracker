import { beforeEach, describe, expect, it } from 'vitest';

import { bumpRestBetweenSets, setRestBetweenSets } from './restSync';
import { stripInheritedRest, useLibrary } from './libraryStore';
import { useActiveWorkout } from './activeWorkoutStore';
import { useSettings } from './settingsStore';
import { seedRoutines } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import { DEFAULT_OVERLOAD_POLICY } from '../lib/progressiveOverload';
import type { Exercise, ID } from '../types/models';

/**
 * "Between sets" has to mean between every set.
 *
 * The bug it is answering: the setting was one of three places a rest could come
 * from, the other two were populated by the app rather than by the user, and they
 * won. So `Between sets 1:30` was followed by a 3:00 countdown — the setting
 * looked broken, because from the gym floor there is no difference between a
 * setting that does nothing and one that is being overridden by something you
 * cannot see.
 *
 * `setRestBetweenSets` is the fix's other half: one number, landing in all three
 * places that could disagree with it.
 */

beforeEach(() => {
  useLibrary.getState().restoreSeedLibrary();
  useSettings.getState().resetToDefaults();
  useActiveWorkout.getState().discardSession();
});

function startRoutineWithOwnRest(seconds: number) {
  const routine = seedRoutines[0];
  const firstId = [...routine.items].sort((a, b) => a.order - b.order)[0].exerciseId;
  const exercisesById = Object.fromEntries(
    useLibrary.getState().exercises.map((e) => [e.id, e]),
  ) as Record<ID, Exercise>;

  useActiveWorkout.getState().startSession({
    routine,
    exercisesById: {
      ...exercisesById,
      [firstId]: { ...exercisesById[firstId], defaultRestSeconds: seconds },
    },
    historyByExerciseId: fixtureHistoryByExerciseId,
    policy: DEFAULT_OVERLOAD_POLICY,
    unitSystem: 'metric',
    defaultRestSeconds: useSettings.getState().restSecondsBetweenSets,
  });

  const session = useActiveWorkout.getState().session;
  if (!session) throw new Error('fixture routine built no session');
  return session;
}

describe('setRestBetweenSets', () => {
  it('writes the setting', () => {
    setRestBetweenSets(90);
    expect(useSettings.getState().restSecondsBetweenSets).toBe(90);
  });

  it('clears every rest an exercise had of its own', () => {
    const [first] = useLibrary.getState().exercises;
    useLibrary.getState().updateExercise(first.id, { ...first, defaultRestSeconds: 300 });

    setRestBetweenSets(90);

    for (const exercise of useLibrary.getState().exercises) {
      expect(exercise.defaultRestSeconds).toBeUndefined();
    }
  });

  it('reaches a workout that is already running', () => {
    // The half that decides whether the change is felt on the NEXT set or only in
    // the next session — and "the next session" is indistinguishable from broken.
    const session = startRoutineWithOwnRest(300);
    const entry = session.entries[0];

    setRestBetweenSets(90);
    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);

    expect(useActiveWorkout.getState().rest.totalSeconds).toBe(90);
  });

  it('clamps to what the setting itself allows, everywhere', () => {
    // Otherwise the library could hold a rest the setting has already refused.
    setRestBetweenSets(99999);
    expect(useSettings.getState().restSecondsBetweenSets).toBe(900);
  });
});

describe('bumpRestBetweenSets', () => {
  it('nudges from the current value and still clears overrides', () => {
    const [first] = useLibrary.getState().exercises;
    useLibrary.getState().updateExercise(first.id, { ...first, defaultRestSeconds: 300 });
    useSettings.getState().setNumber('restSecondsBetweenSets', 120);

    bumpRestBetweenSets(-15);

    expect(useSettings.getState().restSecondsBetweenSets).toBe(105);
    expect(useLibrary.getState().exercises[0].defaultRestSeconds).toBeUndefined();
  });
});

/**
 * The migration is what makes the fix arrive on a phone that already has the app.
 * Without it, the overrides the old builds wrote are still there on launch and the
 * countdown is still wrong until the user goes and sets the rest a second time.
 */
describe('stripInheritedRest', () => {
  it('drops per-exercise and per-item rests from a persisted blob', () => {
    const migrated = stripInheritedRest({
      exercises: [{ id: 'ex1', defaultRestSeconds: 180 }, { id: 'ex2' }],
      routines: [
        { id: 'r1', items: [{ id: 'ri1', exerciseId: 'ex1', restSeconds: 180 }, { id: 'ri2' }] },
      ],
      sequence: { isActive: false, routineIds: [], cursor: 0 },
    }) as { exercises: unknown[]; routines: { items: unknown[] }[]; sequence: unknown };

    expect(JSON.stringify(migrated.exercises)).not.toContain('defaultRestSeconds');
    expect(JSON.stringify(migrated.routines)).not.toContain('restSeconds');
    // ...and nothing else is touched.
    expect(migrated.exercises).toHaveLength(2);
    expect(migrated.routines[0].items).toHaveLength(2);
    expect(migrated.sequence).toEqual({ isActive: false, routineIds: [], cursor: 0 });
  });

  it('survives a blob that is the wrong shape entirely', () => {
    // It runs before any validation, on whatever happens to be on disk.
    expect(stripInheritedRest(null)).toBeNull();
    expect(stripInheritedRest({ exercises: 'nonsense' })).toEqual({ exercises: 'nonsense' });
    expect(stripInheritedRest({ routines: [null, 7] })).toEqual({ routines: [null, 7] });
  });
});
