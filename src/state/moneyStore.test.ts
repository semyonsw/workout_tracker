import { afterEach, describe, expect, it } from 'vitest';

import { balanceOf } from '../lib/money';
import { seedTasks, useTasks } from './tasksStore';
import { sanitizeMoney, seedCategories, useMoney } from './moneyStore';

/**
 * The money store.
 *
 * The suite exists for three things a restore from a bad backup can do to a
 * ledger: a negative expense (which would read as income and move the balance
 * the wrong way), an amount pointing at a category that is gone (which would be
 * counted in the totals and appear in no tile), and a `when` that is neither a
 * day nor a month. All three are dropped or corrected on the way in, because
 * every screen below this point treats the value as already true.
 */

afterEach(() => {
  useMoney.getState().importMoney({ categories: seedCategories, amounts: [] });
  useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
});

describe('sanitizing', () => {
  it('takes the sign off the value and leaves the direction to say it', () => {
    const [amount] = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          direction: 'expense',
          value: -400,
          when: { kind: 'day', date: '2026-09-12' },
        },
      ] as never,
    }).amounts;
    expect(amount.value).toBe(400);
    expect(balanceOf([amount])).toBe(-400);
  });

  it('drops an amount whose category no longer exists', () => {
    const value = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          direction: 'expense',
          value: 400,
          when: { kind: 'day', date: '2026-09-12' },
        },
        {
          id: 'b',
          categoryId: 'gone',
          direction: 'expense',
          value: 900,
          when: { kind: 'day', date: '2026-09-12' },
        },
      ] as never,
    });
    expect(value.amounts.map((amount) => amount.id)).toEqual(['a']);
  });

  it('drops an amount that is on neither a day nor a month', () => {
    const value = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          direction: 'expense',
          value: 400,
          when: { kind: 'day', date: 'soon' },
        },
        {
          id: 'b',
          categoryId: 'food',
          direction: 'expense',
          value: 400,
          when: { kind: 'month', year: 2026, month: 12 },
        },
      ] as never,
    });
    expect(value.amounts).toEqual([]);
  });

  it('keeps a whole-month amount as a whole-month amount', () => {
    const [amount] = sanitizeMoney({
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'transport',
          direction: 'expense',
          value: 6000,
          when: { kind: 'month', year: 2026, month: 8 },
        },
      ] as never,
    }).amounts;
    expect(amount.when).toEqual({ kind: 'month', year: 2026, month: 8 });
  });
});

describe('recording an amount', () => {
  const draft = {
    categoryId: 'transport',
    direction: 'expense' as const,
    value: 400,
    when: { kind: 'day' as const, date: '2026-09-12' },
    note: '  taxi to the gym  ',
  };

  it('refuses a zero — a nothing is not a record of anything', () => {
    expect(useMoney.getState().addAmount({ ...draft, value: 0 })).toBeNull();
    expect(useMoney.getState().amounts).toEqual([]);
  });

  it('trims the note and rounds to whole AMD', () => {
    useMoney.getState().addAmount({ ...draft, value: 400.6 });
    const [amount] = useMoney.getState().amounts;
    expect(amount.note).toBe('taxi to the gym');
    expect(amount.value).toBe(401);
  });

  it('answers the Track expenses task by itself', () => {
    const money = useTasks.getState().tasks.find((task) => task.auto === 'money');
    if (!money) throw new Error('the seed no longer ships an auto-ticked money task');

    useMoney.getState().addAmount(draft);
    const today = Object.keys(useTasks.getState().log[money.id] ?? {});
    expect(today).toHaveLength(1);
  });
});

describe('archiving a category', () => {
  it('leaves its amounts in the totals — that is the whole point of archiving', () => {
    useMoney.getState().addAmount({
      categoryId: 'transport',
      direction: 'expense',
      value: 6000,
      when: { kind: 'month', year: 2026, month: 8 },
      note: 'metro pass',
    });
    useMoney.getState().archiveCategory('transport');

    expect(useMoney.getState().amounts).toHaveLength(1);
    expect(balanceOf(useMoney.getState().amounts)).toBe(-6000);
    expect(useMoney.getState().categories.find((c) => c.id === 'transport')?.archivedAt).toBeTypeOf(
      'string',
    );
  });
});
