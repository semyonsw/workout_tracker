/**
 * History shorthand — turning raw `SetHistory` rows into the one line a lifter
 * actually reads.
 *
 *   80 kg · 8 6 5 5              a clean session
 *   80 kg · 7 · 75 kg · 7 7 6    a top set, then a drop
 *   12 rounds · 3 min            nothing to weigh
 *
 * The split between `lead` and `drops` is the whole point: the LEAD is the top
 * working weight, which is the number the chart plots and the overload engine
 * judges. The drops stay on the same line — they happened, and hiding them would
 * make the session look lighter than it was — but they render `ink-faint` and
 * stay out of the chart, because a drop set is not a regression.
 */

import type { Exercise, ID, SetHistory } from '../types/models';
import { formatDuration } from './units';

export interface SessionRow {
  sessionId: ID;
  performedAt: string;
  /** Top working weight of the session. null for unweighted work. */
  topWeightKg: number | null;
  /** "80 kg · 8 6 5 5" — the top weight and its reps. Rendered in full ink. */
  lead: string;
  /** " · 75 kg · 7 7 6" — drop sets. Rendered ink-faint, or null if there were none. */
  drops: string | null;
}

/** One group of consecutive sets at the same weight, in set order. */
interface WeightGroup {
  weightKg: number | null;
  counts: number[];
}

/**
 * Newest-first session rows for one exercise.
 *
 * Warm-ups and incomplete sets are dropped here, exactly as the overload engine
 * drops them, so the list and the nudge are reading the same history.
 */
export function sessionRows(history: SetHistory[], exercise: Exercise): SessionRow[] {
  const bySession = new Map<ID, SetHistory[]>();

  for (const set of history) {
    if (set.exerciseId !== exercise.id) continue;
    if (set.isWarmup || !set.isCompleted || set.count <= 0) continue;
    const bucket = bySession.get(set.sessionId);
    if (bucket) bucket.push(set);
    else bySession.set(set.sessionId, [set]);
  }

  const rows: SessionRow[] = [];

  for (const [sessionId, sets] of bySession) {
    const ordered = [...sets].sort((a, b) => a.setIndex - b.setIndex);
    const { lead, drops, topWeightKg } = summarizeSessionSets(ordered, exercise);
    rows.push({ sessionId, performedAt: ordered[0].performedAt, topWeightKg, lead, drops });
  }

  return rows.sort(
    (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime(),
  );
}

/**
 * One session's sets as `lead` + `drops`.
 *
 * The shared shorthand formatter: the history list, the collapsed exercise card
 * and the expanded header all render from this, which is why "+40 kg · 4 4"
 * means the same thing in all three places.
 *
 * `sets` must already be in set order.
 */
export function summarizeSessionSets(
  sets: SetHistory[],
  exercise: Exercise,
): { lead: string; drops: string | null; topWeightKg: number | null } {
  const groups = groupByWeight(sets);
  const weights = sets.map((s) => s.weightKg).filter((w): w is number => w != null);
  const topWeightKg = weights.length > 0 ? Math.max(...weights) : null;

  // The lead group is the one at the TOP weight, not simply the first — a
  // session that ramps up still leads with what it topped out at, and a session
  // that drops down leads with what it worked at rather than what it finished on.
  const leadIndex = groups.findIndex((g) => g.weightKg === topWeightKg);
  const lead = groups[leadIndex === -1 ? 0 : leadIndex];
  const dropGroups = groups.filter((g) => g !== lead);

  return {
    topWeightKg,
    lead: formatGroup(lead, exercise, sets.length),
    drops:
      dropGroups.length > 0
        ? ` · ${dropGroups.map((g) => formatGroup(g, exercise, sets.length)).join(' · ')}`
        : null,
  };
}

/** Oldest-first series for the chart. Unweighted exercises have no line to draw. */
export function topWeightSeries(rows: SessionRow[]) {
  return rows
    .filter((r): r is SessionRow & { topWeightKg: number } => r.topWeightKg != null)
    .map((r) => ({ performedAt: r.performedAt, topWeightKg: r.topWeightKg }))
    .reverse();
}

/**
 * "8 sessions · top 80 kg · same weight for 16 days" — the one line under the
 * exercise name. The staleness clause appears only when there IS a plateau to
 * report; on an exercise that is still climbing it would be noise.
 */
export function describeHistory(
  rows: SessionRow[],
  plateauDays: number | null,
  loadPrefix = '',
): string {
  const parts = [`${rows.length} ${rows.length === 1 ? 'session' : 'sessions'}`];

  const top = rows.map((r) => r.topWeightKg).filter((w): w is number => w != null);
  if (top.length > 0) parts.push(`top ${loadPrefix}${Math.max(...top)} kg`);
  if (plateauDays != null && plateauDays > 0) parts.push(`same weight for ${plateauDays} days`);

  return parts.join(' · ');
}

/* ------------------------------------------------------------------ */

function groupByWeight(ordered: SetHistory[]): WeightGroup[] {
  const groups: WeightGroup[] = [];
  for (const set of ordered) {
    const last = groups[groups.length - 1];
    if (last && last.weightKg === set.weightKg) last.counts.push(set.count);
    else groups.push({ weightKg: set.weightKg, counts: [set.count] });
  }
  return groups;
}

/**
 * One weight group as text. Time-based work collapses to a count and a length
 * ("12 rounds · 3 min") because twelve identical clock values in a row is not a
 * record of anything.
 */
function formatGroup(group: WeightGroup, exercise: Exercise, totalSets: number): string {
  if (exercise.countUnit === 'rounds') {
    return `${totalSets} rounds · ${formatDuration(group.counts[0])}`;
  }
  if (exercise.countUnit === 'seconds') {
    return group.counts.map((c) => formatDuration(c)).join(' · ');
  }
  if (exercise.countUnit === 'meters') {
    return `${group.counts.reduce((sum, c) => sum + c, 0)} m`;
  }

  const counts = group.counts.join(' ');
  if (group.weightKg == null) return counts;
  const prefix = exercise.loadMode === 'added_bodyweight' ? '+' : '';
  return `${prefix}${group.weightKg} kg · ${counts}`;
}
