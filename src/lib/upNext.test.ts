import { describe, expect, it } from 'vitest';

import { buildDraftSession, type DraftSession } from './draft';
import { DEFAULT_OVERLOAD_POLICY } from './progressiveOverload';
import { upNextSet } from './upNext';
import type { Exercise, Routine } from '../types/models';

/**
 * The glow, over a draft rather than over a screen.
 *
 * Every case in here was a way of losing the mark on a real bench: opening a card
 * to read it moved the glow onto that card, reordering the list left it pointing
 * at the wrong exercise, and an exercise added mid-session and dragged up above the
 * work never got it at all. None of them need a renderer to ask about — which is
 * the reason the rule is a function and not four lines inside a card.
 */

function exercise(id: string, name: string): Exercise {
  return {
    id,
    ownerId: 'u1',
    name,
    muscleGroups: ['back'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const pullups = exercise('ex_pullups', 'Pull-ups');
const rows = exercise('ex_rows', 'Rows');
const curls = exercise('ex_curls', 'Curls');

/** A session of `[exercise, sets]`, through the real builder. */
function session(items: [Exercise, number][]): DraftSession {
  const routine: Routine = {
    id: 'r1',
    ownerId: 'u1',
    name: 'Pull',
    items: items.map(([ex, targetSets], order) => ({
      id: `ri${order}`,
      exerciseId: ex.id,
      order,
      targetSets,
      targetRepsMax: 8,
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
    now: new Date('2026-09-08T18:00:00.000Z'),
  });
}

/** Log one set, at a stated minute — the clock is what "last done" means. */
function log(s: DraftSession, entryIndex: number, setIndex: number, minute: number): DraftSession {
  return {
    ...s,
    entries: s.entries.map((entry, i) =>
      i === entryIndex
        ? {
            ...entry,
            sets: entry.sets.map((set, j) =>
              j === setIndex
                ? {
                    ...set,
                    isCompleted: true,
                    completedAt: `2026-09-08T18:${String(minute).padStart(2, '0')}:00.000Z`,
                  }
                : set,
            ),
          }
        : entry,
    ),
  };
}

/** Move an entry from one index to another — what a drag commits. */
function move(s: DraftSession, from: number, to: number): DraftSession {
  const entries = [...s.entries];
  entries.splice(to, 0, ...entries.splice(from, 1));
  return { ...s, entries };
}

const at = (s: DraftSession, entryIndex: number, setIndex: number) => ({
  entryId: s.entries[entryIndex].localId,
  setId: s.entries[entryIndex].sets[setIndex].localId,
});

/* ------------------------------------------------------------------ */

describe('upNextSet', () => {
  it('is the first set of the session before anything is logged', () => {
    const s = session([
      [pullups, 3],
      [rows, 3],
    ]);
    expect(upNextSet(s)).toEqual(at(s, 0, 0));
  });

  it('is the set after the one just logged', () => {
    let s = session([
      [pullups, 3],
      [rows, 3],
    ]);
    s = log(s, 0, 0, 0);
    expect(upNextSet(s)).toEqual(at(s, 0, 1));
  });

  it('crosses into the next exercise when an exercise is finished', () => {
    let s = session([
      [pullups, 2],
      [rows, 3],
    ]);
    s = log(s, 0, 0, 0);
    s = log(s, 0, 1, 3);
    expect(upNextSet(s)).toEqual(at(s, 1, 0));
  });

  it('follows the CLOCK, not the list, when a skipped set is filled in late', () => {
    let s = session([
      [pullups, 3],
      [rows, 3],
    ]);
    // Two on pull-ups, then off to rows, then back to finish pull-ups.
    s = log(s, 0, 0, 0);
    s = log(s, 0, 1, 3);
    s = log(s, 1, 0, 6);
    s = log(s, 0, 2, 9);
    // Pull-ups are done, so the set after the last ✓ is rows' second.
    expect(upNextSet(s)).toEqual(at(s, 1, 1));
  });

  it('wraps back to a skipped set when the last ✓ was the last row', () => {
    let s = session([
      [pullups, 2],
      [rows, 1],
    ]);
    s = log(s, 0, 0, 0);
    s = log(s, 1, 0, 3); // jumped ahead, leaving pull-ups set 2 undone
    expect(upNextSet(s)).toEqual(at(s, 0, 1));
  });

  it('moves with a reorder: an exercise dragged above the work takes the glow', () => {
    let s = session([
      [pullups, 2],
      [rows, 2],
    ]);
    s = log(s, 0, 0, 0);
    s = log(s, 0, 1, 3); // pull-ups done, glow is on rows
    expect(upNextSet(s)).toEqual(at(s, 1, 0));

    // Curls, added mid-session at the end, then dragged up to second.
    let withCurls = session([
      [pullups, 2],
      [rows, 2],
      [curls, 2],
    ]);
    withCurls = log(withCurls, 0, 0, 0);
    withCurls = log(withCurls, 0, 1, 3);
    const dragged = move(withCurls, 2, 1);
    expect(upNextSet(dragged)).toEqual({
      entryId: dragged.entries[1].localId,
      setId: dragged.entries[1].sets[0].localId,
    });
    expect(dragged.entries[1].exercise.id).toBe('ex_curls');
  });

  it('is null once every set is logged, and on no session at all', () => {
    let s = session([[pullups, 2]]);
    s = log(s, 0, 0, 0);
    s = log(s, 0, 1, 3);
    expect(upNextSet(s)).toBeNull();
    expect(upNextSet(null)).toBeNull();
  });

  it('falls back to position for rows logged without a timestamp', () => {
    // Sessions persisted before `completedAt` was written carry nulls, and the
    // glow still has to land somewhere sensible.
    let s = session([
      [pullups, 3],
      [rows, 2],
    ]);
    s = {
      ...s,
      entries: s.entries.map((entry, i) =>
        i === 0
          ? {
              ...entry,
              sets: entry.sets.map((set, j) =>
                j < 2 ? { ...set, isCompleted: true, completedAt: null } : set,
              ),
            }
          : entry,
      ),
    };
    expect(upNextSet(s)).toEqual(at(s, 0, 2));
  });
});
