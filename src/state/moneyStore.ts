/**
 * The money log, on disk.
 *
 * AsyncStorage, for the same reason as `tasksStore`: a few thousand amounts is a
 * small blob, every screen reads the whole thing to total it, and there is no
 * query here that an index would answer faster than a pass over an array.
 *
 * ── CATEGORIES ARE ARCHIVED, NEVER DELETED ────────────────────────────────
 *
 * An amount belongs to a category, and the month, the year and the balance are
 * sums over amounts. Deleting a category would either orphan its amounts or
 * quietly change every total that already included them — a log that rewrites
 * its own past is not a log. So `archivedAt` takes it out of the grid and out of
 * the chips on the editor, and leaves every figure it ever contributed to alone.
 * The category screen says so in as many words.
 *
 * ── THE SEED IS EIGHT EMPTY CATEGORIES ────────────────────────────────────
 *
 * No amounts ship, exactly as no training history ships. The categories do,
 * because an empty grid with a single dashed `+ Add` in it is a worse first
 * screen than eight named tiles reading `0 AMD` — and a zero here is a fact, in
 * `ink-faint` like every other zero in the app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dayKey } from '../lib/days';
import type { Amount, AmountWhen, Direction, MoneyCategory } from '../lib/money';
import type { ID } from '../types/models';
import { tickTaskSource } from './tasksStore';

export interface MoneyValue {
  categories: MoneyCategory[];
  amounts: Amount[];
}

export const seedCategories: MoneyCategory[] = [
  ['food', 'Food', '🧊'],
  ['me', 'me', '💡'],
  ['entertainment', 'Entertainment', '🎬'],
  ['transport', 'Transport', '🚌'],
  ['health', 'Health', '🩺'],
  ['charity', 'Charity', '🙂'],
  ['family', 'Family', '👪'],
  ['clothes', 'Clothes', '👕'],
].map(([id, name, glyph], order) => ({ id, name, glyph, order, archivedAt: null }));

function sanitizeCategory(raw: unknown, index: number): MoneyCategory | null {
  const value = raw as Partial<MoneyCategory> | undefined;
  if (!value || typeof value.id !== 'string' || value.id === '') return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (name === '') return null;
  return {
    id: value.id,
    name,
    glyph: typeof value.glyph === 'string' && value.glyph !== '' ? value.glyph : '•',
    order: Number.isFinite(value.order) ? Number(value.order) : index,
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
  };
}

function sanitizeWhen(raw: unknown): AmountWhen | null {
  const value = raw as
    Partial<{ kind: string; date: string; year: number; month: number }> | undefined;
  if (value?.kind === 'month') {
    const { year, month } = value;
    if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
    if ((month as number) < 0 || (month as number) > 11) return null;
    return { kind: 'month', year: year as number, month: month as number };
  }
  if (typeof value?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    return { kind: 'day', date: value.date };
  }
  return null;
}

function sanitizeAmount(raw: unknown, known: ReadonlySet<ID>): Amount | null {
  const value = raw as Partial<Amount> | undefined;
  if (!value || typeof value.id !== 'string' || value.id === '') return null;
  if (typeof value.categoryId !== 'string' || !known.has(value.categoryId)) return null;
  const when = sanitizeWhen(value.when);
  if (!when) return null;
  // Whole AMD, always positive. `direction` carries the sign, so a negative
  // expense restored from a bad backup would otherwise read as income.
  const amount = Math.round(Math.abs(Number(value.value)));
  if (!Number.isFinite(amount)) return null;
  return {
    id: value.id,
    categoryId: value.categoryId,
    direction: (value.direction === 'income' ? 'income' : 'expense') as Direction,
    value: amount,
    when,
    note: typeof value.note === 'string' ? value.note : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
  };
}

/** The one validator. Total: `unknown` in, a complete value out. */
export function sanitizeMoney(input: Partial<MoneyValue> | undefined | null): MoneyValue {
  const rawCategories = Array.isArray(input?.categories) ? input.categories : [];
  const categories = rawCategories
    .map(sanitizeCategory)
    .filter((category): category is MoneyCategory => category !== null)
    .sort((a, b) => a.order - b.order)
    .map((category, order) => ({ ...category, order }));

  const known = new Set(categories.map((category) => category.id));
  const rawAmounts = Array.isArray(input?.amounts) ? input.amounts : [];
  const amounts = rawAmounts
    .map((amount) => sanitizeAmount(amount, known))
    .filter((amount): amount is Amount => amount !== null);

  return { categories, amounts };
}

export interface AmountDraft {
  categoryId: ID;
  direction: Direction;
  value: number;
  when: AmountWhen;
  note: string;
}

interface MoneyState extends MoneyValue {
  addAmount: (draft: AmountDraft) => ID | null;
  updateAmount: (id: ID, draft: AmountDraft) => void;
  deleteAmount: (id: ID) => void;
  addCategory: (name: string, glyph: string) => ID | null;
  updateCategory: (id: ID, patch: { name?: string; glyph?: string }) => void;
  archiveCategory: (id: ID) => void;
  importMoney: (raw: unknown) => void;
}

export const useMoney = create<MoneyState>()(
  persist(
    (set) => ({
      categories: seedCategories,
      amounts: [],

      addAmount: (draft) => {
        const value = Math.round(Math.abs(draft.value));
        if (!Number.isFinite(value) || value <= 0) return null;
        const id = `amt_${Date.now().toString(36)}`;
        set((state) => ({
          amounts: [
            ...state.amounts,
            { ...draft, id, value, note: draft.note.trim(), createdAt: new Date().toISOString() },
          ],
        }));
        /*
         * Recording an amount is what the `Track expenses` task is asking about,
         * so it answers itself — ON THE DAY THE AMOUNT IS FOR, not on the day it
         * was typed. Writing up yesterday's taxi at breakfast should tick
         * yesterday: the task asks whether the money got written down, and it did.
         *
         * A FUTURE day is clamped to today, because a task cannot be answered
         * before it has been asked, and a whole-month amount has no day at all
         * (see `lib/money.ts`) so it ticks the day you recorded it.
         */
        const today = dayKey(new Date());
        const on = draft.when.kind === 'day' && draft.when.date <= today ? draft.when.date : today;
        tickTaskSource('money', on);
        return id;
      },

      updateAmount: (id, draft) =>
        set((state) => ({
          amounts: state.amounts.map((amount) =>
            amount.id === id
              ? {
                  ...amount,
                  ...draft,
                  value: Math.round(Math.abs(draft.value)),
                  note: draft.note.trim(),
                }
              : amount,
          ),
        })),

      deleteAmount: (id) =>
        set((state) => ({ amounts: state.amounts.filter((amount) => amount.id !== id) })),

      addCategory: (name, glyph) => {
        const trimmed = name.trim();
        if (trimmed === '') return null;
        const id = `cat_${Date.now().toString(36)}`;
        set((state) => ({
          categories: [
            ...state.categories,
            {
              id,
              name: trimmed,
              glyph: glyph || '•',
              order: state.categories.length,
              archivedAt: null,
            },
          ],
        }));
        return id;
      },

      updateCategory: (id, patch) =>
        set((state) => ({
          categories: state.categories.map((category) => {
            if (category.id !== id) return category;
            const name = patch.name?.trim();
            return {
              ...category,
              name: name !== undefined && name !== '' ? name : category.name,
              glyph: patch.glyph !== undefined && patch.glyph !== '' ? patch.glyph : category.glyph,
            };
          }),
        })),

      archiveCategory: (id) =>
        set((state) => ({
          categories: state.categories.map((category) =>
            category.id === id ? { ...category, archivedAt: new Date().toISOString() } : category,
          ),
        })),

      importMoney: (raw) =>
        set({ ...sanitizeMoney(raw as Partial<MoneyValue> | undefined | null) }),
    }),
    {
      name: 'money',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ categories: state.categories, amounts: state.amounts }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeMoney(persisted as Partial<MoneyValue> | undefined),
      }),
    },
  ),
);
