import { describe, expect, it } from 'vitest';
import { shallow } from 'zustand/shallow';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  NO_REST,
  isResting,
  selectProgress,
  useActiveWorkout,
  useSessionProgress,
} from './activeWorkoutStore';
import { useSettings } from './settingsStore';
import { seedExercises, seedHistoryByExerciseId, seedRoutines, seedUser } from '../data/seed';
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
    historyByExerciseId: seedHistoryByExerciseId,
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
  it('completing a set starts rest of the entry\'s own length', () => {
    const session = startRoutine();
    const entry = session.entries[0];
    const before = Date.now();

    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
    const { rest } = useActiveWorkout.getState();

    expect(rest.source).toBe('set');
    expect(rest.totalSeconds).toBe(entry.restSeconds);
    expect(rest.endsAt).toBeGreaterThanOrEqual(before + entry.restSeconds * 1000 - 50);
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
 * The two rest lengths in Settings, and whether they are actually the numbers the
 * timer uses.
 *
 * They were not. Rest was resolved once, at session start, from a cascade that
 * checked the routine item and the exercise first — and nearly every shipped
 * routine item carries its own rest, so both settings were shadowed on almost
 * every exercise. Setting "Between sets" to 1:30 and then watching a 3:00
 * countdown is a setting that does nothing.
 */
describe('rest lengths come from settings, live', () => {
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

  it('a set that is not the last uses "between sets"', () => {
    withSettings({ sets: 45 }, () => {
      const session = startRoutine();
      const entry = session.entries[0];
      useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);

      const { rest } = useActiveWorkout.getState();
      expect(rest.source).toBe('set');
      expect(rest.totalSeconds).toBe(45);
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
    const session = startRoutine();
    const entry = session.entries[0];

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

  it('startRestNow runs the user\'s between-sets length', () => {
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
