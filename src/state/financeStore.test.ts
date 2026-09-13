import { beforeEach, describe, expect, it } from 'vitest';

import { categoriesById, useFinance, visibleCategories } from './financeStore';
import { useTasks } from './taskStore';
import { seedCategories } from '../data/financeSeed';
import { overallBalance, totalFor } from '../lib/money';

beforeEach(() => {
  useFinance.setState({ categories: seedCategories, transactions: [], currency: 'AMD' });
  useTasks.setState({ tasks: [], log: {}, notes: {} });
});

describe('categories', () => {
  it('adds one at the end of the list', () => {
    const created = useFinance.getState().addCategory({
      name: 'Books',
      kind: 'expense',
      glyph: '📚',
    });
    expect(useFinance.getState().categories.at(-1)?.id).toBe(created.id);
    expect(created.order).toBeGreaterThan(seedCategories.at(-1)!.order);
  });

  it('deletes one nothing is filed under', () => {
    const created = useFinance
      .getState()
      .addCategory({ name: 'Books', kind: 'expense', glyph: 'B' });
    useFinance.getState().deleteCategory(created.id);
    expect(useFinance.getState().categories.some((c) => c.id === created.id)).toBe(false);
  });

  /**
   * The rule the whole store is built around: a category is the only thing that says
   * what a past amount was FOR, so one with history is hidden rather than destroyed.
   */
  it('archives one that has amounts against it, and history still resolves', () => {
    useFinance.getState().addTransaction({
      categoryId: 'cat_food',
      kind: 'expense',
      amount: 900,
      date: '2026-09-12',
    });
    useFinance.getState().deleteCategory('cat_food');

    const food = categoriesById(useFinance.getState().categories).cat_food;
    expect(food.isArchived).toBe(true);
    expect(food.name).toBe('Food');
    expect(visibleCategories(useFinance.getState().categories, 'expense')).not.toContainEqual(food);
    expect(useFinance.getState().transactions).toHaveLength(1);
  });

  it('offers only the direction being asked for', () => {
    const shown = visibleCategories(useFinance.getState().categories, 'income');
    expect(shown.every((category) => category.kind === 'income')).toBe(true);
    expect(shown.length).toBeGreaterThan(0);
  });
});

describe('transactions', () => {
  it('stores a positive amount and the kind carries the sign', () => {
    useFinance.getState().addTransaction({
      categoryId: 'cat_food',
      kind: 'expense',
      amount: -400,
      date: '2026-09-12',
    });
    const [txn] = useFinance.getState().transactions;
    expect(txn.amount).toBe(400);
    expect(overallBalance(useFinance.getState().transactions)).toBe(-400);
  });

  it('edits one in place', () => {
    const created = useFinance.getState().addTransaction({
      categoryId: 'cat_food',
      kind: 'expense',
      amount: 400,
      date: '2026-09-12',
    });
    useFinance.getState().updateTransaction(created.id, {
      categoryId: 'cat_transport',
      kind: 'expense',
      amount: 500,
      date: '2026-09-11',
    });
    const [txn] = useFinance.getState().transactions;
    expect(txn.id).toBe(created.id);
    expect(txn).toMatchObject({ categoryId: 'cat_transport', amount: 500, date: '2026-09-11' });
  });

  it('takes a whole month as a date', () => {
    useFinance.getState().addTransaction({
      categoryId: 'cat_food',
      kind: 'expense',
      amount: 30000,
      date: '2026-04',
    });
    expect(
      totalFor(
        useFinance.getState().transactions,
        { kind: 'month', anchor: '2026-04-15' },
        'expense',
      ),
    ).toBe(30000);
  });
});

/** The seam: recording an amount is what says the expense task happened that day. */
describe('the expense task', () => {
  it('is created and ticked by a dated amount, on the amount own date', () => {
    useFinance.getState().addTransaction({
      categoryId: 'cat_food',
      kind: 'expense',
      amount: 400,
      date: '2026-09-11',
    });

    const task = useTasks.getState().tasks.find((t) => t.auto === 'expense');
    expect(task).toBeTruthy();
    expect(useTasks.getState().log[task!.id]['2026-09-11']).toBe(true);
    // Not today's, not the created-at date: the day the money moved.
    expect(Object.keys(useTasks.getState().log[task!.id])).toEqual(['2026-09-11']);
  });

  /**
   * A month lump is a figure typed in from memory about a month that is over.
   * Ticking "I tracked my spending" on a day it never happened would be the app
   * lying to make a grid green.
   */
  it('is not ticked by a month lump', () => {
    useFinance.getState().addTransaction({
      categoryId: 'cat_food',
      kind: 'expense',
      amount: 30000,
      date: '2026-04',
    });
    expect(useTasks.getState().tasks.some((t) => t.auto === 'expense')).toBe(false);
  });
});

describe('rehydration', () => {
  it('drops amounts whose category is gone, and malformed dates', () => {
    const result = useFinance.getState().importFinance(
      [
        {
          id: 'c1',
          name: 'Food',
          kind: 'expense',
          glyph: 'F',
          order: 0,
          isArchived: false,
          createdAt: '',
        },
      ],
      [
        { id: 't1', categoryId: 'c1', kind: 'expense', amount: 10, date: '2026-09-12' },
        { id: 't2', categoryId: 'gone', kind: 'expense', amount: 10, date: '2026-09-12' },
        { id: 't3', categoryId: 'c1', kind: 'expense', amount: 10, date: 'yesterday' },
        { id: 't4', categoryId: 'c1', kind: 'expense', amount: 10, date: '2026-09' },
      ],
      'AMD',
    );

    expect(result).toEqual({ categories: 1, transactions: 2 });
    expect(useFinance.getState().transactions.map((t) => t.id)).toEqual(['t1', 't4']);
  });
});
