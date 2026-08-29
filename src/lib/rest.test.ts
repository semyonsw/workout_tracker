import { describe, expect, it } from 'vitest';

import {
  REST_LIMITS,
  bumpExerciseRest,
  clearExerciseRest,
  ownRestSeconds,
  resolveRest,
} from './rest';
import type { Exercise } from '../types/models';

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex_dips',
    ownerId: null,
    name: 'Dips',
    muscleGroups: ['chest'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'added_bodyweight',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * THE BUG THIS FILE IS THE MEMORY OF: `Between sets` set to 1:30, and then a 3:00
 * countdown after the next ✓.
 *
 * Two overrides sat above the setting — one on the routine item, one on the
 * exercise — and both were populated by the app rather than by the user: the
 * shipped routines carried rests, `appendToRoutine` copied one in, and saving an
 * exercise for any reason stamped the setting's current value onto it forever.
 * So the setting was shadowed nearly everywhere, which reads exactly like a
 * setting that does not work.
 *
 * What the tests below pin is the shape that fixes it: ONE override, only where
 * somebody put one, and `clear` meaning "follow again" rather than "copy today's
 * value".
 */
describe('resolveRest', () => {
  it('follows the setting when the exercise has no rest of its own', () => {
    expect(resolveRest(exercise(), 90)).toEqual({ seconds: 90, source: 'settings' });
  });

  it('keeps following as the setting moves', () => {
    const following = exercise();
    expect(resolveRest(following, 90).seconds).toBe(90);
    expect(resolveRest(following, 150).seconds).toBe(150);
  });

  it('uses the exercise where it has one', () => {
    expect(resolveRest(exercise({ defaultRestSeconds: 180 }), 90)).toEqual({
      seconds: 180,
      source: 'exercise',
    });
  });

  it('treats an explicit zero as an override, not as missing', () => {
    // A swim rests for nothing on purpose, and `0 ?? x` is 0 — but `undefined ?? x`
    // is x, and the difference is the whole cascade.
    expect(resolveRest(exercise({ defaultRestSeconds: 0 }), 120)).toEqual({
      seconds: 0,
      source: 'exercise',
    });
  });

  it('ignores a nonsense override rather than resting for NaN seconds', () => {
    // A `NaN` here is a deadline of `NaN`: a countdown that never ends and a pill
    // that never leaves.
    expect(resolveRest(exercise({ defaultRestSeconds: NaN }), 120).source).toBe('settings');
    expect(resolveRest(exercise({ defaultRestSeconds: -5 }), 120).source).toBe('settings');
  });

  it('clamps a setting that arrived out of range', () => {
    expect(resolveRest(exercise(), 99999).seconds).toBe(REST_LIMITS.max);
    expect(resolveRest(exercise(), -10).seconds).toBe(0);
  });
});

describe('ownRestSeconds', () => {
  it('separates "no rest" from "no opinion"', () => {
    expect(ownRestSeconds(exercise({ defaultRestSeconds: 0 }))).toBe(0);
    expect(ownRestSeconds(exercise())).toBeNull();
  });
});

describe('bumpExerciseRest and clearExerciseRest', () => {
  it('creates the override from the value currently in force', () => {
    // The first tap moves the number the row is showing rather than jumping.
    expect(bumpExerciseRest(exercise(), REST_LIMITS.step, 120).defaultRestSeconds).toBe(135);
  });

  it('nudges an existing override from itself, not from the setting', () => {
    const own = exercise({ defaultRestSeconds: 180 });
    expect(bumpExerciseRest(own, -REST_LIMITS.step, 120).defaultRestSeconds).toBe(165);
  });

  it('can be nudged all the way to no rest, and no further', () => {
    expect(
      bumpExerciseRest(exercise({ defaultRestSeconds: 10 }), -15, 120).defaultRestSeconds,
    ).toBe(0);
    expect(bumpExerciseRest(exercise({ defaultRestSeconds: 0 }), -15, 120).defaultRestSeconds).toBe(
      0,
    );
  });

  it('cannot be pushed past what the setting itself allows', () => {
    // Otherwise "set the global rest" could not undo it.
    const wild = bumpExerciseRest(exercise({ defaultRestSeconds: 895 }), 60, 120);
    expect(wild.defaultRestSeconds).toBe(REST_LIMITS.max);
  });

  it('clears back to FOLLOWING the setting, not to a copy of it', () => {
    const cleared = clearExerciseRest(exercise({ defaultRestSeconds: 180 }));
    expect('defaultRestSeconds' in cleared).toBe(false);
    expect(resolveRest(cleared, 90)).toEqual({ seconds: 90, source: 'settings' });
    // ...and it keeps following as the setting moves.
    expect(resolveRest(cleared, 150).seconds).toBe(150);
  });

  it('deletes the key rather than storing undefined', () => {
    // It is persisted, and `{"defaultRestSeconds": null}` in a backup file is a
    // claim about the format that is not true.
    const cleared = clearExerciseRest(exercise({ defaultRestSeconds: 180 }));
    expect(JSON.stringify(cleared)).not.toContain('defaultRestSeconds');
  });

  it('hands back the same object when there was nothing to clear', () => {
    // The bulk clear leans on this to avoid marking the whole library dirty for a
    // change that isn't one.
    const following = exercise();
    expect(clearExerciseRest(following)).toBe(following);
  });
});
