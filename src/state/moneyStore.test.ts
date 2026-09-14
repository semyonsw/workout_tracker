import { afterEach, describe, expect, it } from 'vitest';

import { balanceOf, balanceOfAccount } from '../lib/money';
import { seedTasks, useTasks } from './tasksStore';
import { sanitizeMoney, seedAccounts, seedCategories, useMoney } from './moneyStore';

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
  useMoney
    .getState()
    .importMoney({ accounts: seedAccounts, categories: seedCategories, amounts: [] });
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
    accountId: 'cash',
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
      accountId: 'cash',
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

/**
 * The subsections, in the store.
 *
 * The migration is the one that matters: a ledger written before accounts
 * existed names none, and dropping those amounts would empty a log somebody has
 * been keeping for months.
 */
describe('subsections', () => {
  it('seeds Cash and Online when a stored value has none', () => {
    const value = sanitizeMoney({ categories: seedCategories, amounts: [] });
    expect(value.accounts.map((account) => account.id)).toEqual(['cash', 'online']);
  });

  it('files an amount from before subsections existed under the first one', () => {
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
      ] as never,
    });
    expect(value.amounts).toHaveLength(1);
    expect(value.amounts[0].accountId).toBe('cash');
  });

  it('sends an amount pointing at a subsection that is gone to the first one too', () => {
    const value = sanitizeMoney({
      accounts: seedAccounts,
      categories: seedCategories,
      amounts: [
        {
          id: 'a',
          categoryId: 'food',
          accountId: 'wallet-that-left',
          direction: 'expense',
          value: 400,
          when: { kind: 'day', date: '2026-09-12' },
        },
      ] as never,
    });
    expect(value.amounts[0].accountId).toBe('cash');
  });

  it('moves the opening and nothing else when a balance is set', () => {
    useMoney.getState().addAmount({
      categoryId: 'food',
      accountId: 'cash',
      direction: 'expense',
      value: 1000,
      when: { kind: 'day', date: '2026-09-12' },
      note: '',
    });
    useMoney.getState().setAccountBalance('cash', 40000);

    const account = useMoney.getState().accounts.find((row) => row.id === 'cash');
    if (!account) throw new Error('the seed no longer ships a cash account');
    expect(account.opening).toBe(41000);
    expect(balanceOfAccount(account, useMoney.getState().amounts)).toBe(40000);
    // The expense is untouched, and it is still an expense.
    expect(useMoney.getState().amounts).toHaveLength(1);
    expect(useMoney.getState().amounts[0].value).toBe(1000);
  });

  it('refuses to archive the last live subsection — nothing could be recorded', () => {
    useMoney.getState().archiveAccount('online');
    useMoney.getState().archiveAccount('cash');
    const live = useMoney.getState().accounts.filter((row) => row.archivedAt === null);
    expect(live.map((row) => row.id)).toEqual(['cash']);
  });
});
