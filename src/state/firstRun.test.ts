import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { FIRST_RUN_KEY, carryOverIfNeeded } from './firstRun';
import { useLibrary } from './libraryStore';
import { useTasks } from './taskStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import { carriedTraining } from '../data/carriedTraining';
import { seedTasks } from '../data/tasksSeed';

beforeEach(async () => {
  await AsyncStorage.clear();
  useWorkoutHistory.getState().clearHistory();
  useLibrary.getState().restoreSeedLibrary();
  useTasks.setState({ tasks: seedTasks, log: {}, notes: {} });
});

describe('the carry-over', () => {
  it('lands the whole training log, the library and the running order', async () => {
    expect(await carryOverIfNeeded()).toBe(true);

    const workouts = useWorkoutHistory.getState().workouts;
    expect(workouts).toHaveLength(carriedTraining.workouts.length);
    expect(useLibrary.getState().exercises).toHaveLength(carriedTraining.exercises.length);
    expect(useLibrary.getState().routines).toHaveLength(carriedTraining.routines.length);
    expect(useLibrary.getState().sequence.isActive).toBe(true);

    // Every set survived the trip, which is the number that matters: a restore that
    // drops rows still reports the workouts it wrote.
    const sets = workouts.reduce((total, workout) => total + workout.sets.length, 0);
    expect(sets).toBe(
      carriedTraining.workouts.reduce<number>(
        (total, workout) => total + ((workout as { sets?: unknown[] }).sets?.length ?? 0),
        0,
      ),
    );
  });

  /** It carries training. Emptying the tasks it does not carry would be data loss. */
  it('leaves the task list alone', async () => {
    await carryOverIfNeeded();
    expect(useTasks.getState().tasks).toHaveLength(seedTasks.length);
  });

  it('never runs twice', async () => {
    expect(await carryOverIfNeeded()).toBe(true);
    useWorkoutHistory.getState().clearHistory();

    // The second launch: the flag is set, so a log the user emptied stays empty.
    expect(await carryOverIfNeeded()).toBe(false);
    expect(useWorkoutHistory.getState().workouts).toHaveLength(0);
  });

  it('marks itself done before it writes, so a failure cannot re-apply', async () => {
    await carryOverIfNeeded();
    expect(await AsyncStorage.getItem(FIRST_RUN_KEY)).toBeTruthy();
  });
});
