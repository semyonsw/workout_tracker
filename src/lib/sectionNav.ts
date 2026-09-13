/**
 * The four sections, and what a swipe does to them.
 *
 *   ‹ Workout · Tasks · Expenses · Settings ›
 *
 * ── WHY THE ORDER IS A CONSTANT AND NOT A TAB BAR DETAIL ───────────────────
 *
 * A horizontal swipe moves one section left or right, which means the bar's
 * left-to-right order is now a GESTURE, not a layout. Two places deciding what
 * comes after `Tasks` — the bar's array and the pager's — is two places for them
 * to disagree, and a swipe that lands somewhere the bar does not highlight is the
 * kind of bug nobody can describe. So the order lives here, both read it, and the
 * step is a pure function over it.
 *
 * ── IT CLAMPS, IT DOES NOT WRAP ────────────────────────────────────────────
 *
 * Swiping left on the first section stays on the first section. Wrapping would
 * make the ends of the app adjacent, so a flick past `Workout` would land on
 * `Settings` — the two screens with the least to do with each other — and the
 * gesture would stop meaning "the next one along".
 */

export const SECTIONS = ['Workout', 'Tasks', 'Expenses', 'Settings'] as const;

export type SectionTab = (typeof SECTIONS)[number];

/** What each section calls its own history, in the label under the icon. */
export const SECTION_HISTORY_LABELS: Record<SectionTab, string> = {
  Workout: 'Training history',
  Tasks: 'Task history',
  Expenses: 'Expense history',
  Settings: '',
};

/**
 * One section along, or the same one at the end of the row.
 *
 * `delta` is +1 for a swipe that pulls the content leftwards (the NEXT section,
 * the way a page turns) and −1 for the other direction. An unknown current tab
 * answers with the first section rather than throwing: a persisted tab name from
 * an older build is a thing that happens, and landing on `Workout` is right.
 */
export function stepSection(current: SectionTab, delta: 1 | -1): SectionTab {
  const at = SECTIONS.indexOf(current);
  if (at === -1) return SECTIONS[0];
  const next = Math.min(Math.max(at + delta, 0), SECTIONS.length - 1);
  return SECTIONS[next];
}
