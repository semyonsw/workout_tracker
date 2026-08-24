import { describe, expect, it } from 'vitest';

import { buildDraftSession, type DraftEntry, type DraftSession } from './draft';
import { DEFAULT_OVERLOAD_POLICY } from './progressiveOverload';
import { nextInSupersetRound, supersetMembers, supersetPosition } from './superset';
import type { Exercise, Routine } from '../types/models';

/**
 * Supersets, over a draft rather than over a store.
 *
 * `RoutineItem.supersetGroup` sat in the model for two releases with its
 * behaviour written down beside it and the identifier appearing in exactly one
 * file: the model that declared it. Every awkward case lives here — unequal set
 * counts, a member removed mid-session, a member already finished, sets logged out
 * of order — because all of them are one function call and none of them should
 * need a phone.
 */

function exercise(id: string, name: string): Exercise {
  return {
    id,
    ownerId: 'u1',
    name,
    muscleGroups: ['chest'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const dips = exercise('ex_dips', 'Dips');
const rows = exercise('ex_rows', 'Rows');
const curls = exercise('ex_curls', 'Curls');

/**
 * A session from a routine whose items are `[exerciseId, targetSets, group]`.
 * Built through `buildDraftSession` on purpose: the point is that the group
 * arrives on the entry, not that a test can construct one.
 */
function session(items: [Exercise, number, string | undefined][]): DraftSession {
  const routine: Routine = {
    id: 'r1',
    ownerId: 'u1',
    name: 'Test',
    items: items.map(([ex, targetSets, supersetGroup], order) => ({
      id: `ri${order}`,
      exerciseId: ex.id,
      order,
      targetSets,
      targetRepsMax: 8,
      ...(supersetGroup ? { supersetGroup } : {}),
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return buildDraftSession({
    routine,
    exercisesById: Object.fromEntries(items.map(([ex]) => [ex.id, ex])),
    historyByExerciseId: {},
    policy: DEFAULT_OVERLOAD_POLICY,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    now: new Date('2026-08-17T18:00:00.000Z'),
  });
}

/** Mark the first `n` sets of an entry as logged. */
function logged(s: DraftSession, entryIndex: number, n: number): DraftSession {
  return {
    ...s,
    entries: s.entries.map((entry, i) =>
      i === entryIndex
        ? {
            ...entry,
            sets: entry.sets.map((set, j) => (j < n ? { ...set, isCompleted: true } : set)),
          }
        : entry,
    ),
  };
}

const id = (s: DraftSession, i: number) => s.entries[i].localId;

/* ------------------------------------------------------------------ */

describe('the group arrives on the entry', () => {
  it('is carried off the routine item by buildDraftSession', () => {
    const s = session([
      [dips, 3, 'sg_a'],
      [rows, 3, 'sg_a'],
      [curls, 3, undefined],
    ]);

    expect(s.entries.map((e) => e.supersetGroup)).toEqual(['sg_a', 'sg_a', undefined]);
  });

  it('lists the members of a group in session order', () => {
    const s = session([
      [dips, 3, 'sg_a'],
      [curls, 3, undefined],
      [rows, 3, 'sg_a'],
    ]);

    expect(supersetMembers(s.entries, id(s, 0)).map((e) => e.exercise.id)).toEqual([
      'ex_dips',
      'ex_rows',
    ]);
  });

  it('says an exercise with no group is its own only member', () => {
    const s = session([[dips, 3, undefined]]);
    expect(supersetMembers(s.entries, id(s, 0))).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */

describe('nextInSupersetRound', () => {
  it('alternates two exercises, round by round', () => {
    let s = session([
      [dips, 3, 'sg_a'],
      [rows, 3, 'sg_a'],
    ]);

    // Dips set 1 → rows owes round 1.
    s = logged(s, 0, 1);
    expect(nextInSupersetRound(s, id(s, 0))).toEqual({
      entryId: id(s, 1),
      setId: s.entries[1].sets[0].localId,
    });

    // Rows set 1 → round 1 is complete, so rest. Back to dips is the cursor's
    // job, not this function's.
    s = logged(s, 1, 1);
    expect(nextInSupersetRound(s, id(s, 1))).toBeNull();

    // Dips set 2 → rows owes round 2.
    s = logged(s, 0, 2);
    expect(nextInSupersetRound(s, id(s, 0))).toEqual({
      entryId: id(s, 1),
      setId: s.entries[1].sets[1].localId,
    });
  });

  it('goes round a three-way superset in order', () => {
    let s = session([
      [dips, 2, 'sg_a'],
      [rows, 2, 'sg_a'],
      [curls, 2, 'sg_a'],
    ]);

    s = logged(s, 0, 1);
    expect(nextInSupersetRound(s, id(s, 0))?.entryId).toBe(id(s, 1));
    s = logged(s, 1, 1);
    expect(nextInSupersetRound(s, id(s, 1))?.entryId).toBe(id(s, 2));
    // Third member done → the round is over.
    s = logged(s, 2, 1);
    expect(nextInSupersetRound(s, id(s, 2))).toBeNull();
  });

  it('finds a partner ABOVE the one just logged when the ones below are done', () => {
    // Sets logged out of order: rows raced ahead. The wrap is what stops the group
    // deadlocking with work still in it.
    let s = session([
      [dips, 3, 'sg_a'],
      [rows, 3, 'sg_a'],
    ]);
    s = logged(s, 1, 1);

    expect(nextInSupersetRound(s, id(s, 1))).toEqual({
      entryId: id(s, 0),
      setId: s.entries[0].sets[0].localId,
    });
  });

  it('returns null for an exercise with no group at all', () => {
    let s = session([
      [dips, 3, undefined],
      [rows, 3, undefined],
    ]);
    s = logged(s, 0, 1);
    expect(nextInSupersetRound(s, id(s, 0))).toBeNull();
  });

  it('returns null for a group of one — which is not a superset', () => {
    let s = session([
      [dips, 3, 'sg_a'],
      [rows, 3, 'sg_b'],
    ]);
    s = logged(s, 0, 1);
    expect(nextInSupersetRound(s, id(s, 0))).toBeNull();
  });

  it('rests immediately on the unequal tail', () => {
    // Dips × 4 supersetted with rows × 2. Rounds 3 and 4 have one member in them,
    // so the third and fourth ✓ on dips must not go looking for a partner that has
    // nothing left to do.
    let s = session([
      [dips, 4, 'sg_a'],
      [rows, 2, 'sg_a'],
    ]);

    s = logged(s, 0, 1);
    expect(nextInSupersetRound(s, id(s, 0))?.entryId).toBe(id(s, 1));
    s = logged(s, 1, 1);
    s = logged(s, 0, 2);
    expect(nextInSupersetRound(s, id(s, 0))?.entryId).toBe(id(s, 1));
    s = logged(s, 1, 2);

    // Rows is finished. Dips 3 and 4 are ordinary sets now.
    s = logged(s, 0, 3);
    expect(nextInSupersetRound(s, id(s, 0))).toBeNull();
    s = logged(s, 0, 4);
    expect(nextInSupersetRound(s, id(s, 0))).toBeNull();
  });

  it('leaves no orphan when a member is removed mid-session', () => {
    let s = session([
      [dips, 3, 'sg_a'],
      [rows, 3, 'sg_a'],
    ]);
    s = logged(s, 0, 1);

    // Rows comes off the workout: the machine is taken. The group is now one
    // exercise, and one exercise behaves like no group at all.
    const withoutRows: DraftSession = { ...s, entries: [s.entries[0]] };
    expect(nextInSupersetRound(withoutRows, withoutRows.entries[0].localId)).toBeNull();
  });

  it('returns null for an entry that is not in the session', () => {
    const s = session([[dips, 3, 'sg_a']]);
    expect(nextInSupersetRound(s, 'entry_that_never_existed')).toBeNull();
  });

  it('returns null for no session at all', () => {
    expect(nextInSupersetRound(null, 'anything')).toBeNull();
  });

  it('counts a warm-up as a trip to the bar', () => {
    // The two exercises alternate physically whether or not the set counts
    // towards volume, so a logged warm-up moves the round on like any other set.
    let s = session([
      [dips, 3, 'sg_a'],
      [rows, 3, 'sg_a'],
    ]);
    s = {
      ...s,
      entries: s.entries.map((entry, i) =>
        i === 0
          ? {
              ...entry,
              sets: entry.sets.map((set, j) =>
                j === 0 ? { ...set, isWarmup: true, isCompleted: true } : set,
              ),
            }
          : entry,
      ),
    };

    expect(nextInSupersetRound(s, id(s, 0))?.entryId).toBe(id(s, 1));
  });
});

/* ------------------------------------------------------------------ */

describe('supersetPosition', () => {
  const entries = (groups: (string | undefined)[]): DraftEntry[] =>
    groups.map((supersetGroup, i) => ({
      localId: `e${i}`,
      exercise: dips,
      targetSets: 3,
      restSeconds: 120,
      transitionRestSeconds: 150,
      sets: [],
      overload: { shouldNudge: false } as DraftEntry['overload'],
      overloadAccepted: false,
      lastSessionSummary: null,
      lastSessionShort: null,
      ...(supersetGroup ? { supersetGroup } : {}),
    }));

  it('opens the bracket on the first member and continues it on the rest', () => {
    const list = entries(['sg_a', 'sg_a', 'sg_a', undefined]);
    expect(list.map((_, i) => supersetPosition(list, i))).toEqual([
      'start',
      'continue',
      'continue',
      'none',
    ]);
  });

  it('draws nothing around a group of one', () => {
    // Easy to produce by removing a partner mid-session, and a bracket around a
    // single exercise says nothing.
    const list = entries(['sg_a', undefined]);
    expect(supersetPosition(list, 0)).toBe('none');
  });

  it('opens a second bracket for a second group', () => {
    const list = entries(['sg_a', 'sg_a', 'sg_b', 'sg_b']);
    expect(list.map((_, i) => supersetPosition(list, i))).toEqual([
      'start',
      'continue',
      'start',
      'continue',
    ]);
  });

  it('is `none` past the end of the list', () => {
    expect(supersetPosition(entries([]), 0)).toBe('none');
  });
});
