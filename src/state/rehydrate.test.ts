import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { seedCategories, useMoney } from './moneyStore';
import { seedTasks, useTasks } from './tasksStore';

/**
 * REHYDRATION, run for real against the storage stub — the two ways a launch
 * could come up with less than it should have.
 *
 * Both were comments that said the right thing about a library that does not
 * behave that way. zustand's `persist` calls `merge` on a FIRST launch too, with
 * `undefined`, so "nothing stored, the seeds stand" was false and a fresh
 * install opened on no categories and no tasks. And a version bump without a
 * `migrate` does not reach `merge` with the old blob at all: the money log a
 * v1 phone had on disk was replaced by an empty one on the next write.
 */

beforeEach(async () => {
  useMoney.setState({ categories: seedCategories.map((c) => ({ ...c })), amounts: [] });
  useTasks.setState({ tasks: seedTasks('2026-01-01'), log: {} });
  // AFTER the resets: a `setState` on a persisted store writes it straight back
  // to storage, and "nothing stored" is the case under test.
  await AsyncStorage.clear();
});

describe('a first launch', () => {
  it('keeps the seed categories when nothing is stored', async () => {
    await useMoney.persist.rehydrate();
    expect(useMoney.getState().categories).toHaveLength(seedCategories.length);
  });

  it('keeps the seed tasks when nothing is stored', async () => {
    await useTasks.persist.rehydrate();
    expect(useTasks.getState().tasks.length).toBeGreaterThan(0);
  });
});

describe('a money log written by version 1', () => {
  it('survives the bump to subsections', async () => {
    const category = seedCategories[0];
    await AsyncStorage.setItem(
      'money',
      JSON.stringify({
        version: 1,
        state: {
          categories: [category],
          amounts: [
            {
              id: 'a1',
              categoryId: category.id,
              direction: 'expense',
              value: 2600,
              when: { kind: 'day', date: '2026-09-01' },
              note: '',
              createdAt: '2026-09-01T10:00:00.000Z',
            },
          ],
        },
      }),
    );

    await useMoney.persist.rehydrate();

    const { amounts, accounts } = useMoney.getState();
    expect(amounts.map((amount) => amount.value)).toEqual([2600]);
    // Filed under the first subsection, which is what `sanitizeMoney` promises.
    expect(amounts[0].accountId).toBe(accounts[0].id);
  });
});
