/**
 * What focus mode is looking at — the whole of it, as one value.
 *
 *   ┌ focus mode ─────────────────┐
 *   │ SET 2 OF 4                  │  ← current.workingNumber / workingTotal
 *   │ Weighted 90° pull-ups       │  ← current.entry.exercise.name
 *   │ +32 kg × 5 reps             │  ← current.set
 *   │ last: +32 kg · 5 4          │  ← current.entry.lastSessionShort
 *   │            ( DONE )         │
 *   └─────────────────────────────┘
 *
 * Focus mode has six states and every one of them is a rendering of this object
 * plus a clock. Deriving it here rather than inside the sheet is what makes the
 * awkward cases answerable without a phone: a warm-up at the front of an exercise,
 * a set skipped and come back to, an exercise dragged above the work mid-session,
 * the last set of the session.
 *
 * ── IT IS THE GLOW, AND THAT IS THE POINT ───────────────────────────────────
 *
 * `current` is `upNextSet` (`lib/upNext.ts`) — the same set the session list rings
 * in green — resolved to the entry and row it names. Focus mode is a re-priority
 * of the session screen, not a second opinion about where you are: if the two
 * could disagree, entering focus mode would move the work.
 *
 * So the rule lives in one file, and this one only adds what a screen needs and a
 * mark does not: which working set it is out of how many, the exercise you are
 * walking away from, and the set that `undo last set` takes back.
 *
 * ── WHY "NEW EXERCISE" IS COMPUTED HERE AND NOT READ OFF THE REST SOURCE ────
 *
 * The rest timer already knows whether it is a `set` or a `transition` rest, and
 * that is what the countdown's LABEL says: which of the two rest settings is
 * running, which is a fact about the length that was chosen when the ✓ landed.
 *
 * The up-next block asks a different question — is the set I am about to do on a
 * different machine than the one I just left — and the two come apart in two
 * reachable ways. `startRestNow` (the `Rest 2:00` row) always says `set`, whatever
 * it is resting before. And the session is EDITABLE while rest runs: a set removed,
 * an exercise dragged above the work, an undo, all change where you are going
 * without touching the countdown that is already ticking. `walk to a new machine`
 * has to be true whenever it is on screen, so it is derived from the two sets
 * themselves.
 */

import { t, type Language } from './i18n';
import type { DraftEntry, DraftSession, DraftSet } from './draft';
import { workingSetLabels } from './draft';
import { lastLoggedSet, upNextSet } from './upNext';
import type { ID } from '../types/models';

/** One set of the session, with everything a screen needs to render it. */
export interface FocusTarget {
  entryId: ID;
  setId: ID;
  entry: DraftEntry;
  set: DraftSet;
  /**
   * "SET 2 OF 4" — the working-set position, 1-based. Null on a warm-up, which
   * reads `WARM-UP` instead: a warm-up is a set that does not count, and
   * numbering it as one would make "set 2 of 4" mean two different things in one
   * session. Same rule as `SetRow`'s `W`.
   */
  workingNumber: number | null;
  /** How many working sets this exercise has — the `of 4`. */
  workingTotal: number;
}

export interface FocusPlan {
  /**
   * The set to do now, or null when every set in the session is logged — which is
   * the one thing that puts focus mode into its "session complete" state.
   */
  current: FocusTarget | null;
  /** The set logged most recently. What `undo last set` gives back. */
  lastLogged: FocusTarget | null;
  /**
   * `current` belongs to a different exercise than `lastLogged` — you are about to
   * walk somewhere. False before the first set of the session is logged: there is
   * nowhere to have walked from.
   */
  isNewExercise: boolean;
}

const EMPTY: FocusPlan = { current: null, lastLogged: null, isNewExercise: false };

/**
 * Resolve an `{entryId, setId}` into the row it names, with its labels.
 *
 * Exported because a running set timer carries exactly that pair and focus mode
 * has to render the set the CLOCK is on, which is not always the set the cursor
 * would pick: ▶ on any row of the session screen starts a hold, and while it runs
 * the hold is the subject.
 */
export function focusTarget(
  session: DraftSession,
  ref: { entryId: ID; setId: ID } | null,
): FocusTarget | null {
  if (!ref) return null;
  const entry = session.entries.find((e) => e.localId === ref.entryId);
  if (!entry) return null;
  const index = entry.sets.findIndex((s) => s.localId === ref.setId);
  if (index === -1) return null;

  /*
   * W, 1, 2, 3 — through `workingSetLabels` rather than by counting here, for the
   * same reason `ExerciseCard` goes through it: it is arithmetic over the whole
   * list, and two files doing it separately is two answers waiting to disagree.
   */
  const labels = workingSetLabels(entry.sets);

  return {
    entryId: entry.localId,
    setId: ref.setId,
    entry,
    set: entry.sets[index],
    workingNumber: labels[index],
    workingTotal: entry.sets.filter((s) => !s.isWarmup).length,
  };
}

/**
 * "SET 2 OF 4", or "WARM-UP" — the line above the exercise's name.
 *
 * Rendered uppercase by the screen, lower case here: the app's micro labels are
 * uppercased in CSS everywhere, and a string that arrives shouting cannot be put
 * in a sentence.
 */
export function describeSetPosition(target: FocusTarget, lang: Language = 'en'): string {
  if (target.workingNumber == null) return t('warm-up', lang);
  return t('set {n} of {total}', lang, { n: target.workingNumber, total: target.workingTotal });
}

/** Everything focus mode renders, for the session as it now stands. */
export function focusPlan(session: DraftSession | null): FocusPlan {
  if (!session) return EMPTY;

  const current = focusTarget(session, upNextSet(session));
  const lastLogged = focusTarget(session, lastLoggedSet(session));

  return {
    current,
    lastLogged,
    isNewExercise: current != null && lastLogged != null && current.entryId !== lastLogged.entryId,
  };
}
