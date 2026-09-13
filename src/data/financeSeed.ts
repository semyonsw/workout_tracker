/**
 * The categories the money side starts with — the ones already in use, carried over
 * by name from the spending app this section replaces.
 *
 * A STARTING POINT, not a fixed set: every one of these can be renamed, re-glyphed,
 * archived or deleted, and a new one is two taps away. They ship at all because an
 * empty grid on first launch makes the user do setup work before they can record the
 * thing they opened the app to record.
 *
 * NO AMOUNTS SHIP. The screenshots of the old app are totals, not transactions, and
 * seeding a month from a screenshot would be inventing history — which is exactly
 * the thing `isMonthLump` exists to let the USER do, deliberately and with their own
 * numbers. See `types/finance.ts`.
 *
 * The glyph is one or two characters of text. It is the only place in this app where
 * colour-by-category would have been the obvious move and is not taken: the tiles are
 * the same surface as every other card, and the glyph does the telling apart.
 */

import type { MoneyCategory } from '../types/finance';

const CREATED = '2026-09-13T00:00:00.000Z';

function category(
  id: string,
  name: string,
  kind: MoneyCategory['kind'],
  glyph: string,
  order: number,
): MoneyCategory {
  return { id, name, kind, glyph, order, isArchived: false, createdAt: CREATED };
}

export const seedCategories: MoneyCategory[] = [
  category('cat_food', 'Food', 'expense', '🍲', 0),
  category('cat_me', 'me', 'expense', '💡', 1),
  category('cat_entertainment', 'Entertainment', 'expense', '🎬', 2),
  category('cat_transport', 'Transport', 'expense', '🚌', 3),
  category('cat_health', 'Health', 'expense', '🛡', 4),
  category('cat_charity', 'Charity', 'expense', '🙂', 5),
  category('cat_family', 'Family', 'expense', '👨‍👩‍👧', 6),
  category('cat_clothes', 'Clothes', 'expense', '👕', 7),
  category('cat_salary', 'Salary', 'income', '💼', 8),
  category('cat_gift', 'Ողորմություն', 'income', '💲', 9),
];
