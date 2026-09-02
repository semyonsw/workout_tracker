/**
 * Bodyweight, as a record rather than a number.
 *
 *   [ { at: 2026-08-30, kg: 82.5 },     ← newest first
 *     { at: 2026-07-11, kg: 80.0 },
 *     { at: 2026-05-02, kg: 78.5 } ]
 *
 * ── WHY A LOG AND NOT A FIELD ──────────────────────────────────────────────
 *
 * `Settings.bodyweightKg` was one number, and `effectiveLoadKg` multiplies it into
 * every set of every bodyweight-loaded movement — a pull-up, a dip, an assisted
 * machine. Which means one scalar was answering a question that is different for
 * every session in the log: a set of `+20 kg × 8` done at 78 kg and the same set
 * done at 82 kg are not the same set, and the second one is 4 kg stronger.
 *
 * With one number, two things went wrong:
 *
 *  1. HISTORY GOT REPRICED. Volume is computed and stored when a workout is
 *     finished, so it is correct then — but `recomputeWorkout` re-derives it after
 *     any edit to an old set, and it had nothing to read but today's bodyweight.
 *     Editing one rep in a session from June silently re-costed that whole session
 *     at September's weight.
 *  2. PROGRESS WENT MISSING. A lifter who gained 4 kg and held `+20 × 8` has added
 *     4 kg to the bar. The overload engine, reading only the logged number, saw a
 *     flat line and called it a plateau — and nudged for weight the user had
 *     already added.
 *
 * So the weight is a series, and `bodyweightAt` is the one way anything asks what
 * the lifter weighed on a given day.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 *
 * Not body measurements, not photos, not composition. Bodyweight is here because
 * `effectiveLoadKg` NEEDS it to read a set correctly — it is load-bearing arithmetic,
 * not a second product bolted onto a training log. Nothing else about the body is
 * tracked, and a chest measurement would not make a single set easier to read.
 *
 * ONE ENTRY PER DAY. A second reading on the same date replaces the first rather
 * than appending: nobody wants a log of their morning and evening weight, and the
 * arithmetic downstream only ever asks "what did I weigh that day".
 */

import type { TrendPoint } from './trends';

export interface BodyweightEntry {
  /** ISO instant the reading was taken. */
  at: string;
  kg: number;
}

/**
 * The believable range for a human bodyweight, in kilograms.
 *
 * Wide on purpose — it is a guard against a typo and a corrupt blob, not an
 * opinion about anybody's body. 20 kg is a small child and 300 kg is past the
 * heaviest person who has ever trained; anything outside that reached the field by
 * accident.
 *
 * HERE rather than in `settingsStore`, where it used to live: the store re-exports
 * it, but the range and the rounding are a decision about a number, and this file
 * is what needs them for every entry in the series. A store importing a lib is the
 * direction that does not cycle.
 */
export const BODYWEIGHT_LIMITS = { min: 20, max: 300 } as const;

/**
 * A believable bodyweight in kilograms, or `undefined` for "not set".
 *
 * NOT `clampSetting`: that function's contract is that every setting has a
 * default, and this one deliberately has none. `undefined` here is a fact the app
 * acts on — `effectiveLoadKg` returns null for the three bodyweight-dependent
 * load modes, session volume leaves those sets out, and the history totals line
 * drops its volume clause rather than printing a figure that undercounts. Falling
 * back to a number would turn all of that into a silent wrong answer.
 *
 * One decimal place: a lifter knows their weight to the half-kilo and nothing
 * downstream needs more, while a raw float round-tripped through lb would print
 * 82.30000000000001 in a 40 px numeral.
 */
export function clampBodyweightKg(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const { min, max } = BODYWEIGHT_LIMITS;
  return Number(Math.min(max, Math.max(min, n)).toFixed(1));
}

/**
 * How many readings to keep.
 *
 * At one a week that is nine years, and the series is only ever read by date lookup
 * and by a chart — neither of which gets better past a few hundred points. The cap
 * exists so a corrupt or scripted blob cannot grow a settings key without bound.
 */
export const MAX_BODYWEIGHT_ENTRIES = 500;

/** The calendar day of an instant, as `YYYY-MM-DD` in local time. */
function dayKey(at: string): string {
  const ms = Date.parse(at);
  const date = Number.isFinite(ms) ? new Date(ms) : null;
  if (!date) return at;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A believable reading, or null.
 *
 * The same range `clampBodyweightKg` enforces on the scalar, and deliberately the
 * same function's limits rather than a second opinion about what a human weighs.
 */
function usableEntry(value: unknown): BodyweightEntry | null {
  if (typeof value !== 'object' || value == null) return null;
  const raw = value as { at?: unknown; kg?: unknown };
  if (typeof raw.at !== 'string' || !Number.isFinite(Date.parse(raw.at))) return null;
  if (typeof raw.kg !== 'number' || !Number.isFinite(raw.kg)) return null;
  const { min, max } = BODYWEIGHT_LIMITS;
  if (raw.kg < min || raw.kg > max) return null;
  return { at: raw.at, kg: Number(raw.kg.toFixed(1)) };
}

/**
 * A usable log from anything at all: newest first, one entry per day, capped.
 *
 * Total, like every other sanitizer in this app, because this comes off disk and out
 * of restored backups. A row that cannot be read is dropped rather than repaired —
 * an invented date would put a weight on a day the user never stepped on a scale.
 */
export function sanitizeBodyweightLog(value: unknown): BodyweightEntry[] {
  if (!Array.isArray(value)) return [];
  const byDay = new Map<string, BodyweightEntry>();
  for (const raw of value) {
    const entry = usableEntry(raw);
    if (!entry) continue;
    const key = dayKey(entry.at);
    const existing = byDay.get(key);
    // The later instant wins within a day, so a re-weigh replaces rather than races.
    if (!existing || Date.parse(entry.at) >= Date.parse(existing.at)) byDay.set(key, entry);
  }
  return [...byDay.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_BODYWEIGHT_ENTRIES);
}

/**
 * Record a reading, replacing the same day's if there is one.
 *
 * Returns the log unchanged when the value is unusable, so a text field mid-edit
 * cannot empty the series.
 */
export function recordBodyweight(
  log: readonly BodyweightEntry[],
  kg: number | undefined,
  at: Date = new Date(),
): BodyweightEntry[] {
  const entry = usableEntry({ at: at.toISOString(), kg });
  if (!entry) return [...log];
  return sanitizeBodyweightLog([entry, ...log]);
}

/** The most recent reading, or null for an empty log. */
export function latestBodyweightKg(log: readonly BodyweightEntry[]): number | null {
  return log.length > 0 ? log[0].kg : null;
}

/**
 * What the lifter weighed on a given day.
 *
 * THE MOST RECENT READING AT OR BEFORE THAT DATE, which is the only honest answer:
 * a weight taken after the session says nothing about the session. A session that
 * predates every reading gets the OLDEST one rather than null — the alternative is
 * that every set logged before the user first typed their weight becomes unreadable
 * and drops out of volume entirely, which is a worse answer than "you were roughly
 * this heavy back then". `null` is reserved for a log with nothing in it, and that
 * is the case the callers already handle (see `effectiveLoadKg`).
 */
export function bodyweightAt(
  log: readonly BodyweightEntry[],
  at: string | null | undefined,
): number | null {
  if (log.length === 0) return null;
  const when = typeof at === 'string' ? Date.parse(at) : NaN;
  if (!Number.isFinite(when)) return latestBodyweightKg(log);

  // Newest first, so the first entry at or before the date is the answer.
  for (const entry of log) {
    if (Date.parse(entry.at) <= when) return entry.kg;
  }
  return log[log.length - 1].kg;
}

/**
 * The series, oldest first, for the Progress screen's chart.
 *
 * The same `TrendPoint` shape the other four series use, so it renders in the same
 * `TrendChart` with no special case — and the same one-point-is-a-dot rule applies:
 * the screen drops a series with fewer than two points, because a dot has no
 * direction.
 */
export function bodyweightSeries(log: readonly BodyweightEntry[]): TrendPoint[] {
  return [...log]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((entry) => ({ at: entry.at, value: entry.kg }));
}
