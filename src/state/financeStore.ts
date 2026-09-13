/**
 * Finance store — the categories, the transactions, and the currency they are in.
 *
 * AsyncStorage, for the same reason as `libraryStore`: a few thousand amounts is a
 * blob small enough to read whole on every launch, and nothing here is queried by
 * range — every screen filters an in-memory array through `lib/money.ts`.
 *
 * ── A CATEGORY IS NEVER SILENTLY DESTROYED ─────────────────────────────────
 *
 * `deleteCategory` removes a category nobody has filed anything under, and ARCHIVES
 * one that has amounts against it. A category is the only thing that says what a
 * past amount was for; deleting it would leave a column of numbers and no answer to
 * "what was that 9,080 in March". Archived categories vanish from the pickers and
 * from the grid, and still resolve everywhere history is read.
 *
 * ── ADDING AN AMOUNT TICKS THE DAY'S TASK ──────────────────────────────────
 *
 * The one place this store reaches outside itself, and the point of the app being
 * one app: recording a transaction marks the expense-tracking task done ON THE DATE
 * OF THE TRANSACTION (see `lib/taskSync.ts`). A MONTH LUMP does not — it is a figure
 * typed in from memory about a month that is already over, and ticking "I tracked my
 * spending" on a day it never happened would be the app lying to make a grid green.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { uid } from '../lib/draft';
import { isMonthLump } from '../types/finance';
import { seedCategories } from '../data/financeSeed';
import { markAutoTask } from './taskStore';
import type { MoneyCategory, MoneyKind, Transaction } from '../types/finance';
import type { ID } from '../types/models';

/** What the add/edit sheet collects. */
export interface TransactionDraft {
  categoryId: ID;
  kind: MoneyKind;
  amount: number;
  /** `YYYY-MM-DD` for a day, `YYYY-MM` for a month typed in from memory. */
  date: string;
  note?: string;
}

interface FinanceState {
  categories: MoneyCategory[];
  transactions: Transaction[];
  /** `AMD`. One currency, because a second one needs rates and this app has none. */
  currency: string;

  addCategory: (input: { name: string; kind: MoneyKind; glyph: string }) => MoneyCategory;
  updateCategory: (categoryId: ID, patch: { name: string; glyph: string }) => void;
  /** Removes an unused category, archives one with history. See the header. */
  deleteCategory: (categoryId: ID) => void;
  restoreCategory: (categoryId: ID) => void;

  addTransaction: (draft: TransactionDraft) => Transaction;
  updateTransaction: (txnId: ID, draft: TransactionDraft) => void;
  deleteTransaction: (txnId: ID) => void;

  setCurrency: (currency: string) => void;

  /** Replace everything. The restore path. */
  importFinance: (
    categories: unknown,
    transactions: unknown,
    currency: unknown,
  ) => {
    categories: number;
    transactions: number;
  };
}

export const useFinance = create<FinanceState>()(
  persist(
    (set, get) => ({
      categories: seedCategories,
      transactions: [],
      currency: 'AMD',

      addCategory: (input) => {
        const category: MoneyCategory = {
          id: uid('cat'),
          name: input.name.trim() || 'Category',
          kind: input.kind,
          glyph: input.glyph.trim().slice(0, 2) || '•',
          order: get().categories.reduce((max, c) => Math.max(max, c.order + 1), 0),
          isArchived: false,
          createdAt: new Date().toISOString(),
        };
        set({ categories: [...get().categories, category] });
        return category;
      },

      updateCategory: (categoryId, patch) =>
        set({
          categories: get().categories.map((category) =>
            category.id === categoryId
              ? {
                  ...category,
                  name: patch.name.trim() || category.name,
                  glyph: patch.glyph.trim().slice(0, 2) || category.glyph,
                }
              : category,
          ),
        }),

      deleteCategory: (categoryId) => {
        const used = get().transactions.some((txn) => txn.categoryId === categoryId);
        if (!used) {
          set({ categories: get().categories.filter((c) => c.id !== categoryId) });
          return;
        }
        set({
          categories: get().categories.map((c) =>
            c.id === categoryId ? { ...c, isArchived: true } : c,
          ),
        });
      },

      restoreCategory: (categoryId) =>
        set({
          categories: get().categories.map((c) =>
            c.id === categoryId ? { ...c, isArchived: false } : c,
          ),
        }),

      addTransaction: (draft) => {
        const txn: Transaction = {
          id: uid('txn'),
          categoryId: draft.categoryId,
          kind: draft.kind,
          amount: Math.abs(Math.round(draft.amount)),
          date: draft.date,
          note: draft.note?.trim() || undefined,
          createdAt: new Date().toISOString(),
        };
        set({ transactions: [...get().transactions, txn] });
        if (!isMonthLump(txn.date)) markAutoTask('expense', txn.date);
        return txn;
      },

      updateTransaction: (txnId, draft) =>
        set({
          transactions: get().transactions.map((txn) =>
            txn.id === txnId
              ? {
                  ...txn,
                  categoryId: draft.categoryId,
                  kind: draft.kind,
                  amount: Math.abs(Math.round(draft.amount)),
                  date: draft.date,
                  note: draft.note?.trim() || undefined,
                }
              : txn,
          ),
        }),

      deleteTransaction: (txnId) =>
        set({ transactions: get().transactions.filter((txn) => txn.id !== txnId) }),

      setCurrency: (currency) => set({ currency: currency.trim().slice(0, 5) || 'AMD' }),

      importFinance: (categories, transactions, currency) => {
        const clean = sanitizeCategories(categories, []);
        const known = new Set(clean.map((c) => c.id));
        const txns = sanitizeTransactions(transactions, known);
        set({
          categories: clean,
          transactions: txns,
          currency: typeof currency === 'string' && currency ? currency : get().currency,
        });
        return { categories: clean.length, transactions: txns.length };
      },
    }),
    {
      name: 'finance',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        categories: state.categories,
        transactions: state.transactions,
        currency: state.currency,
      }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<FinanceState>;
        // No `categories` key at all is a first launch: the seed stands. An empty
        // array is somebody who deleted every category, and that is their answer.
        const categories = sanitizeCategories(raw.categories, current.categories);
        const known = new Set(categories.map((c) => c.id));
        return {
          ...current,
          categories,
          transactions: sanitizeTransactions(raw.transactions, known),
          currency:
            typeof raw.currency === 'string' && raw.currency ? raw.currency : current.currency,
        };
      },
    },
  ),
);

/** The categories a picker offers: everything not archived, in order. */
export function visibleCategories(
  categories: readonly MoneyCategory[],
  kind: MoneyKind,
): MoneyCategory[] {
  return categories
    .filter((category) => !category.isArchived && category.kind === kind)
    .sort((a, b) => a.order - b.order);
}

/** Every category by id — archived ones included, because history refers to them. */
export function categoriesById(categories: readonly MoneyCategory[]): Record<ID, MoneyCategory> {
  return Object.fromEntries(categories.map((category) => [category.id, category]));
}

/* ------------------------------------------------------------------ */
/* Rehydration guards                                                  */
/* ------------------------------------------------------------------ */

const KINDS = new Set<MoneyKind>(['expense', 'income']);

function sanitizeCategories(value: unknown, fallback: MoneyCategory[]): MoneyCategory[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter(isRenderableCategory).map((category, index) => ({
    ...category,
    glyph: typeof category.glyph === 'string' && category.glyph ? category.glyph : '•',
    order: Number.isFinite(category.order) ? category.order : index,
    isArchived: category.isArchived === true,
  }));
}

function isRenderableCategory(value: unknown): value is MoneyCategory {
  if (typeof value !== 'object' || value === null) return false;
  const category = value as Partial<MoneyCategory>;
  return (
    typeof category.id === 'string' &&
    typeof category.name === 'string' &&
    typeof category.kind === 'string' &&
    KINDS.has(category.kind)
  );
}

/**
 * Amounts, with the two things that would break a total dropped: a row whose
 * category no longer exists (unrenderable, and it would sit in a grid tile nobody
 * can open) and a date that is neither a day nor a month (every comparison in
 * `lib/money.ts` is lexicographic, and a malformed key lands in a random window).
 */
function sanitizeTransactions(value: unknown, known: ReadonlySet<ID>): Transaction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((txn): txn is Transaction => {
    if (typeof txn !== 'object' || txn === null) return false;
    const row = txn as Partial<Transaction>;
    return (
      typeof row.id === 'string' &&
      typeof row.categoryId === 'string' &&
      known.has(row.categoryId) &&
      typeof row.kind === 'string' &&
      KINDS.has(row.kind) &&
      typeof row.amount === 'number' &&
      Number.isFinite(row.amount) &&
      typeof row.date === 'string' &&
      (/^\d{4}-\d{2}-\d{2}$/.test(row.date) || /^\d{4}-\d{2}$/.test(row.date))
    );
  });
}
