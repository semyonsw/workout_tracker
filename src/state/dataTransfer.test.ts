import { beforeEach, describe, expect, it } from 'vitest';

import { applyBackup, currentSnapshot, exportBackupText } from './dataTransfer';
import { useLibrary } from './libraryStore';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import { parseBackup } from '../lib/backup';
import { buildDraftSession, type DraftSession } from '../lib/draft';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import type { Exercise, ID } from '../types/models';

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

/** A finished session with real logged sets, so history has something in it. */
function loggedDraft(startedAt: string): DraftSession {
  const session = buildDraftSession({
    routine: seedRoutine,
    exercisesById,
    historyByExerciseId: fixtureHistoryByExerciseId,
    policy: seedUser.overloadPolicy,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    defaultTransitionRestSeconds: 150,
    startedAt,
    now: new Date(startedAt),
  });
  const [first, ...rest] = session.entries;
  return {
    ...session,
    entries: [
      { ...first, sets: first.sets.map((s) => ({ ...s, isCompleted: true, isPrefilled: false })) },
      ...rest,
    ],
  };
}

beforeEach(() => {
  useLibrary.getState().restoreSeedLibrary();
  useWorkoutHistory.getState().clearHistory();
  useSettings.getState().resetToDefaults();
});

/* ------------------------------------------------------------------ */

describe('the round trip', () => {
  it('exports what is on the phone and restores it byte for byte', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    useSettings.getState().setNumber('restSecondsBetweenSets', 75);
    const created = useLibrary.getState().createRoutine('Neck day');

    const text = exportBackupText();
    const before = currentSnapshot();

    // Wipe the phone as thoroughly as the app can from inside itself.
    useLibrary.getState().importLibrary({ exercises: [], routines: [] });
    useWorkoutHistory.getState().clearHistory();
    useSettings.getState().resetToDefaults();
    expect(useLibrary.getState().exercises).toEqual([]);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = applyBackup(parsed.envelope);

    expect(currentSnapshot()).toEqual(before);
    expect(applied.workouts).toBe(1);
    expect(applied.exercises).toBe(seedExercises.length);
    expect(useLibrary.getState().routines.some((r) => r.id === created.id)).toBe(true);
    // Settings ride along: the rest lengths are what every timer in the app reads.
    expect(useSettings.getState().restSecondsBetweenSets).toBe(75);
    expect(applied.settingsApplied).toBe(true);
  });

  it('carries the raw set rows, not just the summary lines', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    const parsed = parseBackup(exportBackupText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    useWorkoutHistory.getState().clearHistory();
    applyBackup(parsed.envelope);

    // These rows are what every prefill and every overload verdict reads. A
    // backup that kept only the pretty summary would restore a history that looks
    // right and teaches the app nothing.
    const [workout] = useWorkoutHistory.getState().workouts;
    expect(workout.sets.length).toBeGreaterThan(0);
    expect(workout.sets[0].exerciseId).toBeTruthy();
    expect(workout.sets[0].countUnit).toBeTruthy();
  });

  it('never writes the store actions into the file', () => {
    const file = JSON.parse(exportBackupText()) as { settings: Record<string, unknown> };

    // `settings` is sanitized rather than spread: the live store carries its
    // actions alongside its values, and functions do not survive JSON.
    //
    // Asserted as a SUBSET rather than an exact key match, because one setting is
    // legitimately absent from the file: `bodyweightKg` is `undefined` until the
    // user types one, and `JSON.stringify` drops an undefined value. What must
    // hold is that nothing in the file is a key `Settings` does not declare — an
    // action leaking through would be exactly that.
    const declared = new Set(Object.keys(DEFAULT_SETTINGS));
    for (const key of Object.keys(file.settings)) expect(declared.has(key)).toBe(true);
    expect(Object.keys(file.settings).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */

describe('importing is validated, not trusted', () => {
  it('drops malformed rows and reports what actually landed', () => {
    const applied = applyBackup({
      settings: null,
      exercises: [
        // The one good row.
        {
          id: 'ex_ok',
          name: 'Neck curl',
          muscleGroups: ['neck'],
          requiresWeight: true,
          countUnit: 'reps',
          loadMode: 'external',
          isUnilateral: false,
          isArchived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        { id: 'ex_bad' }, // no shape at all
        'not even an object',
      ],
      routines: [{ id: 'r_bad' }],
      workouts: [{ id: 'w_bad' }],
    });

    expect(applied.exercises).toBe(1);
    expect(applied.routines).toBe(0);
    expect(applied.workouts).toBe(0);
    expect(applied.settingsApplied).toBe(false);
    expect(useLibrary.getState().exercises.map((e) => e.id)).toEqual(['ex_ok']);
  });

  it('drops routine items pointing at exercises the file did not carry', () => {
    applyBackup({
      settings: null,
      exercises: [],
      routines: [
        {
          id: 'r_1',
          name: 'Pull',
          items: [{ id: 'ri_1', exerciseId: 'ex_missing', order: 0, targetSets: 4 }],
        },
      ],
      workouts: [],
    });

    // A routine holding an unresolvable id plans fewer sets than it says it does.
    expect(useLibrary.getState().routines[0].items).toEqual([]);
  });

  it('replaces rather than merges — a restore is not a union', () => {
    const kept = useLibrary.getState().createRoutine('Made after the backup');
    applyBackup({ settings: null, exercises: [], routines: [], workouts: [] });

    expect(useLibrary.getState().routines.some((r) => r.id === kept.id)).toBe(false);
    expect(useLibrary.getState().routines).toEqual([]);
  });

  it('leaves settings alone when the file has none', () => {
    useSettings.getState().setNumber('restSecondsBetweenSets', 45);
    applyBackup({ settings: null, exercises: [], routines: [], workouts: [] });

    expect(useSettings.getState().restSecondsBetweenSets).toBe(45);
  });

  it('clamps a settings block that would otherwise reach a timer as NaN', () => {
    applyBackup({
      settings: { restSecondsBetweenSets: 'nonsense', beepSeconds: 9999 },
      exercises: [],
      routines: [],
      workouts: [],
    });

    expect(useSettings.getState().restSecondsBetweenSets).toBe(
      DEFAULT_SETTINGS.restSecondsBetweenSets,
    );
    expect(useSettings.getState().beepSeconds).toBe(30); // the setting's ceiling
  });
});

describe('the training sequence rides along', () => {
  it('is exported and restored with the routines it points at', () => {
    const routine = useLibrary.getState().routines[0];
    useLibrary.getState().addSequenceStep(routine.id);
    useLibrary.getState().setSequenceActive(true);

    const text = exportBackupText(new Date('2026-08-19T09:00:00.000Z'));

    // Wreck it, then restore.
    useLibrary.getState().restoreSeedLibrary();
    expect(useLibrary.getState().sequence.routineIds).toEqual([]);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    applyBackup(parsed.envelope);

    expect(useLibrary.getState().sequence).toEqual({
      isActive: true,
      routineIds: [routine.id],
      cursor: 0,
    });
  });

  it('restores as off from a file written before sequences existed', () => {
    useLibrary.getState().addSequenceStep(useLibrary.getState().routines[0].id);
    useLibrary.getState().setSequenceActive(true);

    // A restore is "make this phone look like that backup", so a file with no
    // sequence in it must not leave the local one standing.
    applyBackup({
      settings: null,
      exercises: useLibrary.getState().exercises,
      routines: useLibrary.getState().routines,
      workouts: [],
    });

    expect(useLibrary.getState().sequence).toEqual({
      isActive: false,
      routineIds: [],
      cursor: 0,
    });
  });
});
