/**
 * THE SMOKE TEST — one workout, start to finish, through the same store actions a
 * thumb reaches.
 *
 * Every other suite in this project tests one decision in isolation, which is
 * right: the decisions are where the bugs are. What none of them can catch is a
 * feature that works perfectly on its own and breaks the one beside it — a weight
 * carry that fights a ladder, an exercise edited mid-session that the finish sheet
 * then can't file, a round chain that leaves a flag pointing at a session that has
 * already been saved.
 *
 * So this walks the ACTUAL PATH: open a routine, start it, log sets the way the ✓
 * logs them, change the plan halfway through the way the gym makes you, finish,
 * and then check that what reached the log is what happened — and that a backup
 * taken afterwards restores all of it.
 *
 * WHAT IT CANNOT DO, stated plainly rather than implied: there is no renderer
 * here. `vitest.config.ts` includes `src/**‍/*.test.ts` and nothing mocks
 * `react-native`, deliberately — "a test that needs it is a test of a component,
 * and components are verified by running the app". So a tap is modelled as the
 * store action the component's `onPress` calls, one line below the button. That is
 * the whole of a press in this codebase: every screen in here is composition over
 * these actions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useActiveWorkout } from './activeWorkoutStore';
import { applyBackup, currentSnapshot, exportBackupText } from './dataTransfer';
import { useLibrary } from './libraryStore';
import { useSettings } from './settingsStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import { parseBackup } from '../lib/backup';
import { autoRoundToStart } from '../lib/rounds';
import { upNextSet } from '../lib/upNext';
import { seedRoutines, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import type { Exercise, ID } from '../types/models';

/** Open a routine the way `HomeScreen`'s ▶ does. */
function open(routineIndex: number) {
  useActiveWorkout.getState().startSession({
    routine: seedRoutines[routineIndex],
    exercisesById: Object.fromEntries(
      useLibrary.getState().exercises.map((e) => [e.id, e]),
    ) as Record<ID, Exercise>,
    historyByExerciseId: fixtureHistoryByExerciseId,
    policy: seedUser.overloadPolicy,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    defaultTransitionRestSeconds: 150,
  });
  const session = useActiveWorkout.getState().session;
  if (!session) throw new Error('no session');
  return session;
}

const live = () => useActiveWorkout.getState().session;

/* One test moves the clock. Everything after it needs the real one back. */
afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  useActiveWorkout.getState().discardSession();
  useLibrary.getState().restoreSeedLibrary();
  useWorkoutHistory.getState().clearHistory();
  useSettings.getState().resetToDefaults();
});

/* ------------------------------------------------------------------ */

describe('a whole workout', () => {
  it('opens, starts, logs, finishes, and lands in history', () => {
    const session = open(0);
    expect(session.startedAt).toBeNull(); // opening is not starting

    useActiveWorkout.getState().startWorkout();
    expect(live()?.startedAt).not.toBeNull();

    // Log every set of the first two exercises, always through the ✓'s action.
    for (const entry of (live()?.entries ?? []).slice(0, 2)) {
      for (const set of entry.sets) {
        useActiveWorkout.getState().completeSet(entry.localId, set.localId);
      }
    }

    const logged = (live()?.entries ?? [])
      .flatMap((e) => e.sets)
      .filter((s) => s.isCompleted).length;
    expect(logged).toBeGreaterThan(0);

    const finished = useActiveWorkout.getState().finishSession();
    expect(finished).not.toBeNull();
    if (!finished) return;

    const saved = useWorkoutHistory.getState().saveSession(finished);
    expect(saved).not.toBeNull();
    expect(saved?.sets.filter((s) => s.isCompleted)).toHaveLength(logged);

    // ...and the live session is gone, so the app is not still in a workout.
    expect(live()).toBeNull();
  });

  it('survives the session being re-planned halfway through', () => {
    open(0);
    useActiveWorkout.getState().startWorkout();
    const store = useActiveWorkout.getState();
    const [first, second] = live()?.entries ?? [];

    store.completeSet(first.localId, first.sets[0].localId);
    store.addSet(first.localId); // a fifth set, decided at the rack
    store.removeEntry(second.localId); // the machine was taken
    store.moveEntry(first.localId, 1); // do it after the next one instead

    // The cursor, the glow and the progress count all still resolve.
    expect(upNextSet(live() ?? null)).not.toBeNull();
    expect(live()?.entries.some((e) => e.localId === second.localId)).toBe(false);

    const finished = useActiveWorkout.getState().finishSession();
    expect(useWorkoutHistory.getState().saveSession(finished!)).not.toBeNull();
  });

  it('logs nothing when nothing was done', () => {
    open(0);
    useActiveWorkout.getState().startWorkout();
    const finished = useActiveWorkout.getState().finishSession();

    // A workout started and abandoned must not leave a row claiming it happened.
    expect(useWorkoutHistory.getState().saveSession(finished!)).toBeNull();
    expect(useWorkoutHistory.getState().workouts).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */

describe('the day the weight comes down', () => {
  it('one correction reaches every set, the library, and the log', () => {
    open(0);
    useActiveWorkout.getState().startWorkout();
    const entry = (live()?.entries ?? []).find((e) => e.exercise.requiresWeight);
    if (!entry) throw new Error('no weighted exercise');

    // Tap the weight cell, tap −, tap ✓ — which is `patchSet` then `completeSet`.
    useActiveWorkout.getState().patchSet(entry.localId, entry.sets[0].localId, { weightKg: 60 });
    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);

    const after = live()?.entries.find((e) => e.localId === entry.localId);
    expect(after?.sets.every((s) => s.weightKg === 60)).toBe(true);
    expect(
      useLibrary.getState().exercises.find((e) => e.id === entry.exercise.id)?.defaultWeightKg,
    ).toBe(60);

    // The remaining sets go in at the carried weight without another edit.
    for (const set of after?.sets.slice(1) ?? []) {
      useActiveWorkout.getState().completeSet(entry.localId, set.localId);
    }
    const finished = useActiveWorkout.getState().finishSession();
    const saved = useWorkoutHistory.getState().saveSession(finished!);

    const rows = (saved?.sets ?? []).filter((s) => s.exerciseId === entry.exercise.id);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((s) => s.weightKg === 60)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe('editing an exercise from inside the workout', () => {
  it('the library write and the session sync land together', () => {
    open(0);
    useActiveWorkout.getState().startWorkout();
    const entry = (live()?.entries ?? [])[0];

    // `Edit exercise` → the editor's Save → `updateExercise` + `syncExercise`,
    // exactly as `AppShell` wires it.
    const next: Exercise = {
      ...entry.exercise,
      name: 'Weighted pull-ups (neutral)',
      defaultRestSeconds: 90,
    };
    useLibrary.getState().updateExercise(entry.exercise.id, next);
    useActiveWorkout.getState().syncExercise(entry.exercise.id, next);

    expect(live()?.entries[0].exercise.name).toBe('Weighted pull-ups (neutral)');
    expect(
      useLibrary.getState().exercises.find((e) => e.id === entry.exercise.id)?.defaultRestSeconds,
    ).toBe(90);

    // And the next rest this exercise starts is the edited one.
    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
    expect(useActiveWorkout.getState().rest.totalSeconds).toBe(90);
  });
});

/* ------------------------------------------------------------------ */

describe('a boxing session', () => {
  it('runs its rounds off one press', () => {
    open(2);
    useActiveWorkout.getState().startWorkout();
    const bag = (live()?.entries ?? []).find((e) => e.exercise.countUnit === 'rounds');
    if (!bag) throw new Error('no bag');

    // ▶ on round 1: the lead-in is the exercise's own, and the chain is armed.
    useActiveWorkout.getState().startSetTimer(bag.localId, bag.sets[0].localId);
    expect(useActiveWorkout.getState().setTimer?.prepareSeconds).toBe(bag.exercise.prepareSeconds);
    expect(useActiveWorkout.getState().roundsAuto).toBe(bag.localId);

    /*
     * THE ROUND ITSELF. Real time is the one input this store cannot be handed, so
     * the clock is moved instead of waited on: `readSetTimer` derives everything
     * from `Date.now()`, which is exactly what makes it testable without a phone.
     * Past the lead-in and past the round, `commitSetTimer` is what
     * `useSetTimer` calls when the bell rings.
     */
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + ((bag.exercise.prepareSeconds ?? 0) + bag.sets[0].count) * 1000);

    // The bell: `useSetTimer` commits at zero, which is `commitSetTimer`.
    useActiveWorkout.getState().commitSetTimer();
    expect(useActiveWorkout.getState().setTimer).toBeNull();
    expect(useActiveWorkout.getState().rest.endsAt).not.toBeNull();

    // Mid-rest, nothing starts.
    const mid = {
      session: live(),
      roundsAuto: useActiveWorkout.getState().roundsAuto,
      rest: useActiveWorkout.getState().rest,
      setTimer: useActiveWorkout.getState().setTimer,
      nowMs: Date.now(),
    };
    expect(autoRoundToStart(mid)).toBeNull();

    // Rest over: the chain names round 2, and it starts with no lead-in at all.
    const due = autoRoundToStart({
      ...mid,
      nowMs: (useActiveWorkout.getState().rest.endsAt ?? 0) + 1,
    });
    expect(due?.setId).toBe(bag.sets[1].localId);

    useActiveWorkout.getState().skipRest();
    useActiveWorkout.getState().startSetTimer(due!.entryId, due!.setId, { skipPrepare: true });
    expect(useActiveWorkout.getState().setTimer?.prepareSeconds).toBe(0);
    expect(useActiveWorkout.getState().setTimer?.setId).toBe(bag.sets[1].localId);
    // Round 1 is logged, and it was logged by the clock rather than by a thumb.
    expect(live()?.entries[0].sets[0].isCompleted).toBe(true);
  });

  it('and a hold in the same session still waits for a thumb', () => {
    open(3); // the calisthenics routine
    useActiveWorkout.getState().startWorkout();
    const hold = (live()?.entries ?? [])[0];

    expect(hold.exercise.countUnit).toBe('seconds');
    expect(hold.exercise.timerMode).toBe('countup');

    useActiveWorkout.getState().startSetTimer(hold.localId, hold.sets[0].localId);
    // A count-up has no bell, so no chain is armed and nothing logs itself.
    expect(useActiveWorkout.getState().roundsAuto).toBeNull();
    expect(useActiveWorkout.getState().setTimer?.mode).toBe('countup');
    expect(live()?.entries[0].sets[0].isCompleted).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe('the loop, and copies of a routine in it', () => {
  it('a varied step is trained separately from the one it came from', () => {
    const library = useLibrary.getState();
    const back = library.routines[0].id;
    const push = library.routines[1].id;
    library.addSequenceStep(back);
    library.addSequenceStep(push);
    library.addSequenceStep(back);
    library.setSequenceActive(true);

    const copy = useLibrary.getState().varySequenceStep(2);
    expect(copy).not.toBeNull();

    // Swap an exercise out of the copy only.
    useLibrary.getState().updateRoutine(copy!.id, {
      name: copy!.name,
      items: copy!.items.slice(1).map((item, order) => ({ ...item, order })),
    });

    const original = useLibrary.getState().routines.find((r) => r.id === back);
    expect(original?.items).toHaveLength(seedRoutines[0].items.length);
    expect(useLibrary.getState().sequence.routineIds).toEqual([back, push, copy!.id]);

    // ...and the queue still advances through it.
    useLibrary.getState().setSequenceCursor(2);
    useLibrary.getState().advanceSequence(copy!.id);
    expect(useLibrary.getState().sequence.cursor).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe('everything, exported and restored', () => {
  it('a phone wiped after all of the above comes back identical', () => {
    // Build a state that touches every new surface at once.
    const library = useLibrary.getState();
    const copy = library.duplicateRoutine(library.routines[0].id);
    library.addSequenceStep(copy!.id);
    library.setSequenceActive(true);
    library.setExerciseDefaultWeight('ex_pulldown_wide', 62.5);

    open(0);
    useActiveWorkout.getState().startWorkout();
    const entry = (live()?.entries ?? [])[0];
    useActiveWorkout.getState().completeSet(entry.localId, entry.sets[0].localId);
    useWorkoutHistory.getState().saveSession(useActiveWorkout.getState().finishSession()!);

    const text = exportBackupText();
    const before = currentSnapshot();

    useLibrary.getState().importLibrary({ exercises: [], routines: [] });
    useWorkoutHistory.getState().clearHistory();
    useSettings.getState().resetToDefaults();

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    applyBackup(parsed.envelope);

    expect(currentSnapshot()).toEqual(before);
    // Named explicitly, because these are the two new things a generic deep-equal
    // would still pass on if they silently stopped being exported.
    expect(useLibrary.getState().routines.some((r) => r.id === copy!.id)).toBe(true);
    expect(
      useLibrary.getState().exercises.find((e) => e.id === 'ex_pulldown_wide')?.defaultWeightKg,
    ).toBe(62.5);
  });

  it('restores a calisthenics exercise with its skill filing intact', () => {
    const handstand = useLibrary.getState().exercises.find((e) => e.id === 'ex_handstand');
    expect(handstand?.muscleGroups[0]).toBe('calisthenics');

    const parsed = parseBackup(exportBackupText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    useLibrary.getState().importLibrary({ exercises: [], routines: [] });
    applyBackup(parsed.envelope);

    expect(
      useLibrary.getState().exercises.find((e) => e.id === 'ex_handstand')?.muscleGroups,
    ).toEqual(handstand?.muscleGroups);
  });
});
