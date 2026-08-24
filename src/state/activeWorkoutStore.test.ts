import { describe, expect, it } from 'vitest';
import { shallow } from 'zustand/shallow';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  NO_REST,
  isResting,
  selectEntry,
  selectProgress,
  useActiveWorkout,
  useSessionProgress,
} from './activeWorkoutStore';
import { useSettings } from './settingsStore';
import { buildDraftEntry, type DraftEntry } from '../lib/draft';
import { DEFAULT_OVERLOAD_POLICY } from '../lib/progressiveOverload';
import { seedExercises, seedRoutines, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import type { Exercise, ID } from '../types/models';

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

function startRoutine(index = 0) {
  useActiveWorkout.getState().discardSession();
  useActiveWorkout.getState().startSession({
    routine: seedRoutines[index],
    exercisesById,
    historyByExerciseId: fixtureHistoryByExerciseId,
    policy: seedUser.overloadPolicy,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    defaultTransitionRestSeconds: 150,
  });
  const session = useActiveWorkout.getState().session;
  if (!session) throw new Error('fixture routine built no session');
  return session;
}

/* ------------------------------------------------------------------ */

describe('selector stability', () => {
  /*
   * The regression this suite exists for.
   *
   * `selectProgress` returns a fresh object. Zustand v5 compares selector results
   * with `Object.is`, so handing it straight to `useActiveWorkout` makes every
   * render report a changed snapshot; `useSyncExternalStore` re-renders to catch
   * up, reports changed again, and the loop ends in "Maximum update depth
   * exceeded" — which in a release build is the process dying the moment a workout
   * starts.
   */
  it('selectProgress is NOT reference-stable, which is why the hook exists', () => {
    startRoutine();
    const a = selectProgress(useActiveWorkout.getState());
    const b = selectProgress(useActiveWorkout.getState());

    expect(a).not.toBe(b); // the trap
    expect(shallow(a, b)).toBe(true); // and why `useShallow` closes it
  });

  it('counts every set in the session', () => {
    const session = startRoutine();
    const expected = session.entries.reduce((n, entry) => n + entry.sets.length, 0);

    expect(selectProgress(useActiveWorkout.getState())).toEqual({ done: 0, total: expected });

    const entry = session.entries[0];
    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
    expect(selectProgress(useActiveWorkout.getState()).done).toBe(1);
  });

  it('exports the safe hook rather than only the raw selector', () => {
    expect(typeof useSessionProgress).toBe('function');
  });

  /*
   * A source scan, not a render test: without a React renderer the only way to
   * prove no component reintroduces the bug is to look. Cheap, and it fails in the
   * same edit that would cause the crash.
   */
  it('no component passes an object-returning selector to useActiveWorkout', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(join(__dirname, '..'))) {
      // Comments are stripped first: several files explain this very bug by
      // quoting the broken call, and a guard that can't tell code from prose
      // fails on its own documentation.
      const text = stripComments(readFileSync(file, 'utf8'));
      if (file.endsWith('activeWorkoutStore.ts')) continue;

      if (/useActiveWorkout\(\s*selectProgress\s*\)/.test(text)) {
        offenders.push(`${file}: passes selectProgress directly`);
      }
      /*
       * `useActiveWorkout((s) => ({ ... }))` and its block-bodied twin,
       * `(s) => { ... return { ... } }`. Both build a fresh object or array per
       * call, which is the same failure mode as `selectProgress` with no
       * `useShallow` to close it. Selectors that return a field (`s.session`) or a
       * primitive are stable and correctly ignored.
       */
      const inlineObject = /useActiveWorkout\(\s*\([^)]*\)\s*=>\s*\(\s*[[{]/;
      const blockReturnsObject =
        /useActiveWorkout\(\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,400}?\breturn\s*[[{]/;
      if (inlineObject.test(text) || blockReturnsObject.test(text)) {
        offenders.push(`${file}: inline selector returns a new object or array`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

/** Block and line comments out, so only real call sites are scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

/* ------------------------------------------------------------------ */

describe('rest: pause, resume, skip', () => {
  /*
   * This asserted `entry.restSeconds`, the length the session was BUILT with, and
   * passed only because that number happened to equal the setting. It is now the
   * length the rule below actually resolves — see 'rest lengths: the item
   * override, then settings' for the rule itself; this test is about the pill
   * being started, running, and not paused.
   */
  it('completing a set starts a running rest of the resolved length', () => {
    const session = startRoutine();
    const entry = session.entries[0];
    const expected = entry.restSecondsOverride ?? useSettings.getState().restSecondsBetweenSets;
    const before = Date.now();

    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
    const { rest } = useActiveWorkout.getState();

    expect(rest.source).toBe('set');
    expect(rest.totalSeconds).toBe(expected);
    expect(rest.endsAt).toBeGreaterThanOrEqual(before + expected * 1000 - 50);
    expect(rest.pausedRemainingMs).toBeNull();
    expect(isResting(rest)).toBe(true);
  });

  it('the last set of an exercise gets the longer transition rest', () => {
    const session = startRoutine();
    const entry = session.entries[0];
    for (const s of entry.sets) useActiveWorkout.getState().completeSet(entry.localId, s.localId);

    const { rest, activeEntryId } = useActiveWorkout.getState();
    expect(rest.source).toBe('transition');
    expect(rest.totalSeconds).toBe(entry.transitionRestSeconds);
    // ...and the cursor has moved on to the next exercise.
    expect(activeEntryId).toBe(session.entries[1]?.localId ?? entry.localId);
  });

  it('pause freezes the remainder and clears the deadline', () => {
    useActiveWorkout.getState().startRest(90);
    useActiveWorkout.getState().pauseRest();

    const { rest } = useActiveWorkout.getState();
    expect(rest.endsAt).toBeNull();
    expect(rest.pausedRemainingMs).toBeGreaterThan(88_000);
    expect(rest.pausedRemainingMs).toBeLessThanOrEqual(90_000);
    // Still on screen: pausing is not skipping.
    expect(isResting(rest)).toBe(true);
  });

  it('resume restores a deadline from the frozen remainder', () => {
    useActiveWorkout.getState().startRest(90);
    useActiveWorkout.getState().pauseRest();
    const frozen = useActiveWorkout.getState().rest.pausedRemainingMs ?? 0;

    useActiveWorkout.getState().resumeRest();
    const { rest } = useActiveWorkout.getState();

    expect(rest.pausedRemainingMs).toBeNull();
    expect(rest.endsAt).toBeGreaterThanOrEqual(Date.now() + frozen - 50);
  });

  it('adjusting while paused moves the remainder, not a deadline', () => {
    useActiveWorkout.getState().startRest(60);
    useActiveWorkout.getState().pauseRest();
    const before = useActiveWorkout.getState().rest.pausedRemainingMs ?? 0;

    useActiveWorkout.getState().adjustRest(30);
    const after = useActiveWorkout.getState().rest;

    expect(after.endsAt).toBeNull();
    expect(after.pausedRemainingMs).toBeCloseTo(before + 30_000, -2);
    expect(after.totalSeconds).toBe(90);
  });

  it('a negative adjustment can never produce a negative total', () => {
    useActiveWorkout.getState().startRest(5);
    useActiveWorkout.getState().adjustRest(-60);
    const { rest } = useActiveWorkout.getState();

    expect(rest.totalSeconds).toBeGreaterThanOrEqual(1);
    expect(rest.endsAt).toBeGreaterThanOrEqual(Date.now() - 50);
  });

  it('resuming an expired pause is a skip', () => {
    useActiveWorkout.getState().startRest(60);
    useActiveWorkout.getState().pauseRest();
    useActiveWorkout.getState().adjustRest(-600);
    useActiveWorkout.getState().resumeRest();

    expect(isResting(useActiveWorkout.getState().rest)).toBe(false);
  });

  it('skip clears it outright', () => {
    useActiveWorkout.getState().startRest(60);
    useActiveWorkout.getState().skipRest();
    expect(useActiveWorkout.getState().rest).toEqual(NO_REST);
  });

  it('a rest of zero seconds is no rest at all', () => {
    useActiveWorkout.getState().startRest(0);
    expect(isResting(useActiveWorkout.getState().rest)).toBe(false);
  });

  it('autoStartRest off leaves the pill away after a set', () => {
    const session = startRoutine();
    const entry = session.entries[0];

    useSettings.getState().setFlag('autoStartRest', false);
    try {
      useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
      expect(isResting(useActiveWorkout.getState().rest)).toBe(false);
      // The set itself still logged — the setting is about the timer, not the log.
      expect(selectProgress(useActiveWorkout.getState()).done).toBe(1);
    } finally {
      useSettings.getState().setFlag('autoStartRest', true);
    }
  });

  it('completing a set that is not in the session leaves rest untouched', () => {
    startRoutine();
    useActiveWorkout.getState().startRest(60);
    const before = useActiveWorkout.getState().rest;

    useActiveWorkout.getState().completeSet('entry_nope', 'set_nope');
    expect(useActiveWorkout.getState().rest).toBe(before);
  });

  it('undoing the set that started rest cancels it', () => {
    const session = startRoutine();
    const entry = session.entries[0];
    const setId = entry.sets[0].localId;

    useActiveWorkout.getState().completeSet(entry.localId, setId);
    expect(isResting(useActiveWorkout.getState().rest)).toBe(true);

    useActiveWorkout.getState().uncompleteSet(entry.localId, setId);
    expect(isResting(useActiveWorkout.getState().rest)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

/**
 * Where the two rest lengths actually come from.
 *
 * The history matters, because both halves of it were bugs.
 *
 * FIRST, rest was resolved once at session start from a cascade that checked the
 * routine item and then `exercise.defaultRestSeconds` — and nearly every shipped
 * exercise carries one, so both Settings values were shadowed on almost every
 * exercise. Setting "Between sets" to 1:30 and watching a 3:00 countdown is a
 * setting that does nothing. The fix was to ignore the routine entirely.
 *
 * THAT WENT TOO FAR, and 0.11.0 walks it back one level. The routine editor can
 * now SET a per-item rest, show which of the two is in force on the row, and
 * clear it again — so an override is a choice the user made and can see, which
 * was the only thing missing. The rule is therefore:
 *
 *   between sets       item's override if it has one, else the live setting
 *   between exercises  always the live setting
 *
 * and the asymmetry is the same rule stated twice: nothing edits
 * `RoutineItem.transitionRestSeconds`, so honouring it would be the first bug
 * again on a number nobody can reach.
 */
describe('rest lengths: the item override, then settings', () => {
  function withSettings(values: Partial<Record<'sets' | 'exercises', number>>, run: () => void) {
    const settings = useSettings.getState();
    if (values.sets != null) settings.setNumber('restSecondsBetweenSets', values.sets);
    if (values.exercises != null) {
      settings.setNumber('restSecondsBetweenExercises', values.exercises);
    }
    try {
      run();
    } finally {
      useSettings.getState().resetToDefaults();
    }
  }

  /**
   * The first entry whose routine item did NOT set a rest, and the first that did.
   *
   * Picked by asking the built session rather than by index: the seed routine's
   * shape is not this suite's business, and an index would silently start testing
   * the wrong branch the day somebody adds a rest to an item.
   */
  function following(session: { entries: DraftEntry[] }): DraftEntry {
    const entry = session.entries.find((e) => e.restSecondsOverride == null);
    if (!entry) throw new Error('the seed routine has no item that follows Settings');
    return entry;
  }

  function overriding(session: { entries: DraftEntry[] }): DraftEntry {
    const entry = session.entries.find((e) => (e.restSecondsOverride ?? 0) > 0);
    if (!entry) throw new Error('the seed routine has no item with its own rest');
    return entry;
  }

  it('a set that is not the last uses "between sets"', () => {
    withSettings({ sets: 45 }, () => {
      const entry = following(startRoutine());
      useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);

      const { rest } = useActiveWorkout.getState();
      expect(rest.source).toBe('set');
      expect(rest.totalSeconds).toBe(45);
    });
  });

  it("uses the ITEM's own rest where the routine set one", () => {
    withSettings({ sets: 45 }, () => {
      const entry = overriding(startRoutine());
      useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);

      const { rest } = useActiveWorkout.getState();
      expect(rest.source).toBe('set');
      expect(rest.totalSeconds).toBe(entry.restSecondsOverride);
      expect(rest.totalSeconds).not.toBe(45);
    });
  });

  it('an override does NOT follow the setting as it changes', () => {
    // The other half of "no override means live": if both tracked Settings, the
    // override would be decoration. 45 then 300, and the item ignores both.
    withSettings({ sets: 45 }, () => {
      const entry = overriding(startRoutine());
      useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
      expect(useActiveWorkout.getState().rest.totalSeconds).toBe(entry.restSecondsOverride);

      useSettings.getState().setNumber('restSecondsBetweenSets', 300);
      useActiveWorkout.getState().completeSet(entry.localId, entry.sets[1].localId);
      expect(useActiveWorkout.getState().rest.totalSeconds).toBe(entry.restSecondsOverride);
    });
  });

  it('the last set of an exercise uses "between exercises"', () => {
    withSettings({ sets: 45, exercises: 300 }, () => {
      const session = startRoutine();
      const entry = session.entries[0];
      for (const s of entry.sets) useActiveWorkout.getState().completeSet(entry.localId, s.localId);

      const { rest } = useActiveWorkout.getState();
      expect(rest.source).toBe('transition');
      expect(rest.totalSeconds).toBe(300);
    });
  });

  it('changing a setting mid-session applies to the next set, not the next session', () => {
    const entry = following(startRoutine());

    withSettings({ sets: 30 }, () => {
      useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
      expect(useActiveWorkout.getState().rest.totalSeconds).toBe(30);

      useSettings.getState().setNumber('restSecondsBetweenSets', 90);
      useActiveWorkout.getState().completeSet(entry.localId, entry.sets[1].localId);
      expect(useActiveWorkout.getState().rest.totalSeconds).toBe(90);
    });
  });

  it('no rest starts after the last set of the LAST exercise', () => {
    withSettings({ sets: 60, exercises: 60 }, () => {
      const session = startRoutine();
      const entries = session.entries;
      const last = entries[entries.length - 1];
      const lastSet = last.sets[last.sets.length - 1];

      // Everything except the very last set of the very last exercise.
      for (const entry of entries) {
        for (const s of entry.sets) {
          if (entry.localId === last.localId && s.localId === lastSet.localId) continue;
          useActiveWorkout.getState().completeSet(entry.localId, s.localId);
        }
      }

      // Clear the board so the assertion is about THIS set and nothing else.
      useActiveWorkout.getState().skipRest();
      useActiveWorkout.getState().completeSet(last.localId, lastSet.localId);

      // "Rest between exercises" is the walk to the next machine, and there is no
      // next machine — the next action is Finish.
      expect(isResting(useActiveWorkout.getState().rest)).toBe(false);
      const progress = selectProgress(useActiveWorkout.getState());
      expect(progress.done).toBe(progress.total);
    });
  });

  it('still rests after the last exercise if an earlier one is unfinished', () => {
    withSettings({ exercises: 120 }, () => {
      const session = startRoutine();
      const last = session.entries[session.entries.length - 1];

      // Straight to the last exercise, skipping everything before it — which is
      // what people do when a machine is taken.
      useActiveWorkout.getState().skipRest();
      for (const s of last.sets) useActiveWorkout.getState().completeSet(last.localId, s.localId);

      // There is still work to walk back to, so this IS a transition.
      const { rest } = useActiveWorkout.getState();
      expect(rest.source).toBe('transition');
      expect(rest.totalSeconds).toBe(120);
    });
  });

  it('completing a set does not clear a rest it did not start', () => {
    const session = startRoutine();
    const entry = session.entries[0];

    useSettings.getState().setFlag('autoStartRest', false);
    try {
      // Auto-rest off is the whole reason `startRestNow` exists.
      useActiveWorkout.getState().startRestNow();
      const before = useActiveWorkout.getState().rest;
      expect(isResting(before)).toBe(true);

      useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
      expect(useActiveWorkout.getState().rest).toBe(before);
    } finally {
      useSettings.getState().setFlag('autoStartRest', true);
    }
  });

  it("startRestNow runs the user's between-sets length", () => {
    withSettings({ sets: 75 }, () => {
      startRoutine();
      useActiveWorkout.getState().startRestNow();

      const { rest } = useActiveWorkout.getState();
      expect(rest.totalSeconds).toBe(75);
      expect(rest.source).toBe('set');
      expect(rest.endsAt).toBeGreaterThan(Date.now());
    });
  });
});

/* ------------------------------------------------------------------ */

describe('set timer', () => {
  /** The first timed exercise in the fixtures, whatever routine it lives in. */
  function timedEntry() {
    for (let i = 0; i < seedRoutines.length; i += 1) {
      const session = startRoutine(i);
      const entry = session.entries.find((e) => e.exercise.timerMode === 'countdown');
      if (entry) return entry;
    }
    throw new Error('no countdown exercise in the fixtures');
  }

  it('takes its get-ready length from the exercise, then from settings', () => {
    const entry = timedEntry();
    useSettings.getState().setNumber('prepareSeconds', 9);
    try {
      useActiveWorkout.getState().startSetTimer(entry.localId, entry.sets[0].localId);
      const { setTimer } = useActiveWorkout.getState();
      expect(setTimer).not.toBeNull();
      expect(setTimer?.prepareSeconds).toBe(entry.exercise.prepareSeconds ?? 9);
      expect(setTimer?.workSeconds).toBe(Math.round(entry.sets[0].count));
    } finally {
      useSettings.getState().resetToDefaults();
    }
  });

  it('starting a set timer clears any rest', () => {
    const entry = timedEntry();
    useActiveWorkout.getState().startRest(120);
    useActiveWorkout.getState().startSetTimer(entry.localId, entry.sets[0].localId);

    expect(isResting(useActiveWorkout.getState().rest)).toBe(false);
  });

  it('removing the set a timer points at drops the timer', () => {
    const entry = timedEntry();
    const setId = entry.sets[0].localId;
    useActiveWorkout.getState().startSetTimer(entry.localId, setId);
    useActiveWorkout.getState().removeSet(entry.localId, setId);

    expect(useActiveWorkout.getState().setTimer).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('rehydration', () => {
  /*
   * Why this matters more than it looks: the session is PERSISTED, and `AppShell`
   * navigates straight to the logging screen for a rehydrated one. So a blob that
   * makes that screen throw doesn't crash once — it crashes on every launch,
   * forever, with no way back to a working app short of clearing app data. Every
   * case below is a blob that must be refused rather than rendered.
   */
  async function rehydrateWith(state: unknown, version = 2) {
    await AsyncStorage.setItem('active-workout', JSON.stringify({ state, version }));
    await useActiveWorkout.persist.rehydrate();
    return useActiveWorkout.getState();
  }

  it('restores a well-formed session', async () => {
    const session = startRoutine();
    const after = await rehydrateWith({
      session,
      activeEntryId: session.entries[0].localId,
      rest: NO_REST,
      setTimer: null,
    });

    expect(after.session?.localId).toBe(session.localId);
    expect(after.session?.entries).toHaveLength(session.entries.length);
    expect(after.activeEntryId).toBe(session.entries[0].localId);
  });

  it('drops a session whose entry lost its exercise', async () => {
    const session = startRoutine();
    const broken = {
      ...session,
      entries: session.entries.map((e, i) => (i === 1 ? { ...e, exercise: undefined } : e)),
    };

    const after = await rehydrateWith({ session: broken, activeEntryId: null, rest: NO_REST });
    // Dropped WHOLE: a session missing one of six exercises would silently plan
    // fewer sets than its own header claims.
    expect(after.session).toBeNull();
  });

  it('drops a session whose set has a NaN count', async () => {
    const session = startRoutine();
    const broken = {
      ...session,
      entries: session.entries.map((e, i) =>
        i === 0 ? { ...e, sets: e.sets.map((s) => ({ ...s, count: NaN })) } : e,
      ),
    };

    // JSON turns NaN into null on the way out, which is exactly what a real
    // corrupt write looks like.
    const after = await rehydrateWith({ session: broken, activeEntryId: null, rest: NO_REST });
    expect(after.session).toBeNull();
  });

  it.each([
    ['a string', 'not a session'],
    ['a number', 42],
    ['an array', []],
    ['an empty object', {}],
    ['entries that are not an array', { localId: 'a', title: 't', startedAt: 'x', entries: 'no' }],
  ])('refuses %s as a session', async (_label, session) => {
    const after = await rehydrateWith({ session, activeEntryId: null, rest: NO_REST });
    expect(after.session).toBeNull();
  });

  it('survives a blob that is not an object at all', async () => {
    for (const blob of [null, 'x', 7, []]) {
      const after = await rehydrateWith(blob);
      expect(after.session).toBeNull();
      expect(after.rest).toEqual(NO_REST);
    }
  });

  it('repairs an activeEntryId that points at nothing', async () => {
    const session = startRoutine();
    const after = await rehydrateWith({
      session,
      activeEntryId: 'entry_that_never_existed',
      rest: NO_REST,
    });

    expect(after.activeEntryId).toBe(session.entries[0].localId);
  });

  /*
   * A v1 blob has no `pausedRemainingMs`. The value it must NOT take is
   * `undefined`: `rest.pausedRemainingMs != null` is what the pill branches on, so
   * a missing key has to arrive as an explicit null.
   */
  it('fills the field v1 blobs never had', async () => {
    const session = startRoutine();
    const after = await rehydrateWith(
      {
        session,
        activeEntryId: session.entries[0].localId,
        rest: { endsAt: Date.now() + 60_000, totalSeconds: 60, source: 'set', originSetId: null },
        setTimer: null,
      },
      1,
    );

    expect(after.rest.pausedRemainingMs).toBeNull();
    expect(isResting(after.rest)).toBe(true);
  });

  it('turns a NaN deadline into no rest instead of a timer that never ends', async () => {
    const session = startRoutine();
    const after = await rehydrateWith({
      session,
      activeEntryId: session.entries[0].localId,
      // NaN survives the round trip as null, and a `totalSeconds` of 0 would make
      // the drain line divide by zero.
      rest: { endsAt: NaN, totalSeconds: NaN, source: 'bogus', originSetId: 5 },
    });

    expect(isResting(after.rest)).toEqual(false);
    expect(after.rest.totalSeconds).toBe(0);
  });

  it('repairs a rest claiming to be both running and paused', async () => {
    const session = startRoutine();
    const after = await rehydrateWith({
      session,
      activeEntryId: session.entries[0].localId,
      rest: {
        endsAt: Date.now() + 60_000,
        pausedRemainingMs: 30_000,
        totalSeconds: 60,
        source: 'set',
        originSetId: null,
      },
    });

    // The pause wins: it's the state the user chose.
    expect(after.rest.endsAt).toBeNull();
    expect(after.rest.pausedRemainingMs).toBe(30_000);
  });

  it('drops a set timer pointed at an entry that did not survive', async () => {
    const session = startRoutine();
    const after = await rehydrateWith({
      session,
      activeEntryId: session.entries[0].localId,
      rest: NO_REST,
      setTimer: {
        entryId: 'entry_gone',
        setId: 'set_gone',
        mode: 'countdown',
        startedAt: Date.now(),
        prepareSeconds: 5,
        workSeconds: 120,
      },
    });

    expect(after.setTimer).toBeNull();
  });

  it('drops a set timer with an unknown mode', async () => {
    const session = startRoutine();
    const after = await rehydrateWith({
      session,
      activeEntryId: session.entries[0].localId,
      rest: NO_REST,
      setTimer: {
        entryId: session.entries[0].localId,
        setId: session.entries[0].sets[0].localId,
        mode: 'sideways',
        startedAt: Date.now(),
        prepareSeconds: 5,
        workSeconds: 120,
      },
    });

    expect(after.setTimer).toBeNull();
  });

  it('keeps a valid set timer', async () => {
    const session = startRoutine();
    const entry = session.entries[0];
    const after = await rehydrateWith({
      session,
      activeEntryId: entry.localId,
      rest: NO_REST,
      setTimer: {
        entryId: entry.localId,
        setId: entry.sets[0].localId,
        mode: 'countdown',
        startedAt: 1_700_000_000_000,
        prepareSeconds: 5,
        workSeconds: 120,
      },
    });

    expect(after.setTimer?.entryId).toBe(entry.localId);
    expect(after.setTimer?.workSeconds).toBe(120);
  });

  it('leaves the actions callable after any rehydration', async () => {
    await rehydrateWith({ session: 'garbage' });
    const s = useActiveWorkout.getState();

    expect(typeof s.startSession).toBe('function');
    expect(typeof s.pauseRest).toBe('function');
    expect(() => s.skipRest()).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */

/**
 * The session's shape is decided in the gym.
 *
 * Sets get added and dropped, exercises get appended and abandoned, and the order
 * follows whichever machine is free. Everything below is a rule about not leaving
 * wreckage behind when that happens: a cursor pointing at an exercise that is gone
 * renders no expanded card at all, and a set timer counting into a removed row can
 * never be committed.
 */
describe('editing the session while it runs', () => {
  const extraEntry = (name = 'Neck curl') =>
    buildDraftEntry({
      exercise: { ...seedExercises[0], id: `ex_extra_${name}`, name },
      history: [],
      policy: DEFAULT_OVERLOAD_POLICY,
      unitSystem: 'metric',
      restSeconds: 120,
      transitionRestSeconds: 150,
      targetSets: 1,
      targetRepsMax: 12,
      plannedSetCount: 1,
    });

  it('appends an exercise at the bottom and makes it the active card', () => {
    const session = startRoutine();
    const entry = extraEntry();

    useActiveWorkout.getState().addEntry(entry);
    const after = useActiveWorkout.getState();

    expect(after.session?.entries.at(-1)?.localId).toBe(entry.localId);
    expect(after.session?.entries).toHaveLength(session.entries.length + 1);
    // It is the thing the user is about to do; they just said so.
    expect(after.activeEntryId).toBe(entry.localId);
  });

  it('ignores an append with no session to append to', () => {
    useActiveWorkout.getState().discardSession();
    expect(() => useActiveWorkout.getState().addEntry(extraEntry())).not.toThrow();
    expect(useActiveWorkout.getState().session).toBeNull();
  });

  /* --- removing sets --------------------------------------------------- */

  it('removeLastSet drops the BOTTOM row — four sets back to three', () => {
    const session = startRoutine();
    const entry = session.entries[0];
    const before = entry.sets.map((s) => s.localId);

    useActiveWorkout.getState().removeLastSet(entry.localId);
    const after = selectEntry(entry.localId)(useActiveWorkout.getState());

    expect(after?.sets.map((s) => s.localId)).toEqual(before.slice(0, -1));
  });

  it('removing the last remaining set removes the exercise', () => {
    const session = startRoutine();
    const entry = session.entries[0];

    // Down to one row...
    while ((selectEntry(entry.localId)(useActiveWorkout.getState())?.sets.length ?? 0) > 1) {
      useActiveWorkout.getState().removeLastSet(entry.localId);
    }
    expect(selectEntry(entry.localId)(useActiveWorkout.getState())?.sets).toHaveLength(1);

    // ...and one more press takes the exercise, because an entry with no rows is a
    // header with nothing to tap and no `Add set` that reaches it.
    useActiveWorkout.getState().removeLastSet(entry.localId);

    expect(selectEntry(entry.localId)(useActiveWorkout.getState())).toBeNull();
    expect(useActiveWorkout.getState().session?.entries).toHaveLength(session.entries.length - 1);
  });

  it('removeSet on a single-set exercise removes it too — same rule, either path', () => {
    const session = startRoutine();
    const entry = extraEntry();
    useActiveWorkout.getState().addEntry(entry);

    useActiveWorkout.getState().removeSet(entry.localId, entry.sets[0].localId);

    expect(useActiveWorkout.getState().session?.entries).toHaveLength(session.entries.length);
    expect(selectEntry(entry.localId)(useActiveWorkout.getState())).toBeNull();
  });

  it('ignores a set that is not in the entry', () => {
    const session = startRoutine();
    const entry = session.entries[0];

    useActiveWorkout.getState().removeSet(entry.localId, 'set_not_here');

    expect(selectEntry(entry.localId)(useActiveWorkout.getState())?.sets).toHaveLength(
      entry.sets.length,
    );
  });

  /* --- what has to move with a removed exercise ------------------------ */

  it('hands the cursor to the exercise below when the active one goes', () => {
    const session = startRoutine();
    const [first, second] = session.entries;
    useActiveWorkout.getState().setActiveEntry(first.localId);

    useActiveWorkout.getState().removeEntry(first.localId);

    expect(useActiveWorkout.getState().activeEntryId).toBe(second.localId);
  });

  it('falls back to the exercise above when the last one goes', () => {
    const session = startRoutine();
    const last = session.entries.at(-1)!;
    const above = session.entries.at(-2)!;
    useActiveWorkout.getState().setActiveEntry(last.localId);

    useActiveWorkout.getState().removeEntry(last.localId);

    expect(useActiveWorkout.getState().activeEntryId).toBe(above.localId);
  });

  it('leaves the cursor alone when some other exercise goes', () => {
    const session = startRoutine();
    const [first, second] = session.entries;
    useActiveWorkout.getState().setActiveEntry(first.localId);

    useActiveWorkout.getState().removeEntry(second.localId);

    expect(useActiveWorkout.getState().activeEntryId).toBe(first.localId);
  });

  it('kills a set timer that was counting into the removed exercise', () => {
    const session = startRoutine();
    const timed = session.entries.find((e) => e.exercise.timerMode === 'countdown');
    if (!timed) throw new Error('no timed exercise in the fixture routine');

    useActiveWorkout.getState().startSetTimer(timed.localId, timed.sets[0].localId);
    expect(useActiveWorkout.getState().setTimer).not.toBeNull();

    useActiveWorkout.getState().removeEntry(timed.localId);

    // A clock with nothing left to log into can never be committed.
    expect(useActiveWorkout.getState().setTimer).toBeNull();
  });

  it('ends a rest that the removed exercise started', () => {
    const session = startRoutine();
    const entry = session.entries[0];
    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
    expect(isResting(useActiveWorkout.getState().rest)).toBe(true);

    useActiveWorkout.getState().removeEntry(entry.localId);

    expect(useActiveWorkout.getState().rest).toEqual(NO_REST);
  });

  it('leaves a rest that some other exercise started', () => {
    const session = startRoutine();
    const [first, second] = session.entries;
    useActiveWorkout.getState().completeSet(first.localId, first.sets[0].localId);

    useActiveWorkout.getState().removeEntry(second.localId);

    expect(isResting(useActiveWorkout.getState().rest)).toBe(true);
  });

  /* --- reordering ------------------------------------------------------ */

  it('moves an exercise to a new position and closes the gap behind it', () => {
    const session = startRoutine();
    const ids = session.entries.map((e) => e.localId);

    useActiveWorkout.getState().moveEntry(ids[0], 2);

    // `toIndex` counts the list WITHOUT the moved row, which is what a drop
    // position on screen actually is.
    expect(useActiveWorkout.getState().session?.entries.map((e) => e.localId)).toEqual([
      ids[1],
      ids[2],
      ids[0],
      ...ids.slice(3),
    ]);
  });

  it('dropping a row back where it came from changes nothing', () => {
    const session = startRoutine();
    const ids = session.entries.map((e) => e.localId);

    useActiveWorkout.getState().moveEntry(ids[1], 1);

    expect(useActiveWorkout.getState().session?.entries.map((e) => e.localId)).toEqual(ids);
  });

  it('clamps a drop index past either end rather than losing the row', () => {
    const session = startRoutine();
    const ids = session.entries.map((e) => e.localId);

    useActiveWorkout.getState().moveEntry(ids[0], 99);
    expect(useActiveWorkout.getState().session?.entries.at(-1)?.localId).toBe(ids[0]);

    useActiveWorkout.getState().moveEntry(ids[0], -5);
    expect(useActiveWorkout.getState().session?.entries[0].localId).toBe(ids[0]);
    expect(useActiveWorkout.getState().session?.entries).toHaveLength(ids.length);
  });

  it('ignores a move of something that is not in the session', () => {
    const session = startRoutine();
    const ids = session.entries.map((e) => e.localId);

    useActiveWorkout.getState().moveEntry('entry_ghost', 0);

    expect(useActiveWorkout.getState().session?.entries.map((e) => e.localId)).toEqual(ids);
  });

  /* --- the clock ------------------------------------------------------- */

  it('startWorkout re-anchors the session to now, keeping every logged set', () => {
    const session = startRoutine();
    const entry = session.entries[0];
    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);

    // A session opened before the warm-up, or left running in a locker.
    useActiveWorkout.setState({
      session: { ...useActiveWorkout.getState().session!, startedAt: '2026-08-19T06:00:00.000Z' },
    });

    useActiveWorkout.getState().startWorkout();
    const after = useActiveWorkout.getState();

    const elapsedMs = Date.now() - new Date(after.session!.startedAt!).getTime();
    expect(elapsedMs).toBeLessThan(2_000);
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    // The ✓ stays: those sets were done, and a reset that deletes work is not a
    // reset, it is a bug with a friendly label.
    expect(selectEntry(entry.localId)(after)?.sets[0].isCompleted).toBe(true);
    // The rest that was running was timing a gap that is no longer in the session.
    expect(after.rest).toEqual(NO_REST);
  });

  it('startWorkout on no session does nothing at all', () => {
    useActiveWorkout.getState().discardSession();
    expect(() => useActiveWorkout.getState().startWorkout()).not.toThrow();
    expect(useActiveWorkout.getState().session).toBeNull();
  });

  /* --- opening is not starting ---------------------------------------- */

  it('a session starts with no start time at all', () => {
    // Opening a routine to read it must leave no date, no duration and no row in
    // history behind.
    expect(startRoutine().startedAt).toBeNull();
    expect(useActiveWorkout.getState().session?.startedAt).toBeNull();
  });

  it('startWorkout is what puts a clock on it', () => {
    startRoutine();
    useActiveWorkout.getState().startWorkout();

    const startedAt = useActiveWorkout.getState().session?.startedAt;
    expect(startedAt).toBeTypeOf('string');
    expect(Date.now() - new Date(startedAt!).getTime()).toBeLessThan(2_000);
  });

  it('logging a set starts an unstarted workout', () => {
    // A ✓ says "I am training" as clearly as the button does, and a set with no
    // date on it is a row history cannot place.
    const session = startRoutine();
    const entry = session.entries[0];
    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);

    const startedAt = useActiveWorkout.getState().session?.startedAt;
    expect(startedAt).toBeTypeOf('string');
    expect(Date.now() - new Date(startedAt!).getTime()).toBeLessThan(2_000);
  });

  it('logging a second set does not move the start time', () => {
    const session = startRoutine();
    const entry = session.entries[0];
    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
    const first = useActiveWorkout.getState().session?.startedAt;

    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[1].localId);

    expect(useActiveWorkout.getState().session?.startedAt).toBe(first);
  });
});
