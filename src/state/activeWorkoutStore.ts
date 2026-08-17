/**
 * Active workout store (Zustand).
 *
 * Deliberately the ONLY global state about the live session. Library and
 * routines live in `libraryStore`, preferences in `settingsStore`; this file owns
 * the thing that is edited dozens of times a minute and must survive navigation,
 * a phone call, and a force-quit mid-set.
 *
 * Four design decisions worth keeping:
 *
 *  1. THE REST TIMER IS A DEADLINE, NOT A COUNTDOWN. We store `endsAt` (epoch ms)
 *     and derive the remaining seconds at render time. Timers that decrement a
 *     counter drift, freeze when the OS suspends the JS thread, and lie after a
 *     phone call. A deadline is correct on resume, always. The set timer follows
 *     the same rule with one stored fact — when start was pressed — and derives
 *     its phase; see `lib/setTimer.ts`.
 *
 *  2. PAUSE IS A SECOND STORED FACT, NOT A STOPPED CLOCK. `pausedRemainingMs`
 *     holds what was left at the moment of the pause, and `endsAt` goes null.
 *     Rest is therefore always in exactly one of three states — idle, running,
 *     frozen — and a paused rest cannot expire in the user's pocket.
 *
 *  3. `completeSet` is the only action the finger needs in the happy path: it
 *     marks the set, starts the right rest period, and advances the cursor.
 *     `commitSetTimer` routes through it rather than reimplementing it, so a
 *     plank logged by the clock and a set logged by the ✓ take the same path.
 *
 *  4. NOTHING REHYDRATES UNCHECKED. `sanitizeState` runs on everything coming
 *     back from disk. A half-written blob, a session from an older build, or a
 *     `NaN` that reached a deadline used to be a crash on the logging screen and
 *     — because the session is persisted — a crash that repeated on every launch.
 *     A dropped session costs one workout's prefills; a crash loop costs the app.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DraftEntry, DraftSession, DraftSet } from '../lib/draft';
import { buildDraftSession, uid, type BuildDraftParams } from '../lib/draft';
import {
  MIN_WORK_SECONDS,
  readSetTimer,
  resolveTimerMode,
  withPrepareSkipped,
  withWorkAdjusted,
  type SetTimerSpec,
} from '../lib/setTimer';
import { currentSettings } from './settingsStore';
import type { ID } from '../types/models';

export type RestSource = 'set' | 'transition' | 'manual';

export interface RestState {
  /** Epoch ms when rest ends. null = idle, or paused (see `pausedRemainingMs`). */
  endsAt: number | null;
  /** What the timer was started with, for the drain line. */
  totalSeconds: number;
  source: RestSource | null;
  /** Which set triggered it — lets the UI dim the row that's resting. */
  originSetId: ID | null;
  /** Milliseconds left, frozen. Non-null ⟺ paused. */
  pausedRemainingMs: number | null;
}

/** A running set timer, plus which set it will log into. */
export interface SetTimerState extends SetTimerSpec {
  entryId: ID;
  setId: ID;
}

interface ActiveWorkoutState {
  session: DraftSession | null;
  /** The exercise card currently expanded. */
  activeEntryId: ID | null;
  rest: RestState;
  /** The plank / hang / round currently being timed. Only ever one. */
  setTimer: SetTimerState | null;

  /* --- lifecycle --- */
  startSession: (params: BuildDraftParams) => void;
  discardSession: () => void;
  /** Returns the finished draft so the caller can persist it, then clears state. */
  finishSession: () => DraftSession | null;

  /* --- navigation --- */
  setActiveEntry: (entryId: ID) => void;

  /* --- set editing --- */
  completeSet: (entryId: ID, setId: ID) => void;
  uncompleteSet: (entryId: ID, setId: ID) => void;
  patchSet: (entryId: ID, setId: ID, patch: Partial<DraftSet>) => void;
  addSet: (entryId: ID) => void;
  removeSet: (entryId: ID, setId: ID) => void;
  /** Applies the overload suggestion to every not-yet-completed set. */
  acceptOverload: (entryId: ID) => void;
  dismissOverload: (entryId: ID) => void;

  /* --- rest timer --- */
  startRest: (seconds: number, source?: RestSource, originSetId?: ID | null) => void;
  adjustRest: (deltaSeconds: number) => void;
  /** Freeze the countdown where it stands. The pill stays; the clock doesn't move. */
  pauseRest: () => void;
  resumeRest: () => void;
  /** End rest now and get on with it. */
  skipRest: () => void;

  /* --- set timer (planks, hangs, rounds) --- */
  /** Get-ready countdown, then the work clock. No-op on a non-timed exercise. */
  startSetTimer: (entryId: ID, setId: ID) => void;
  /** ± on the prescribed hold. Count-ups have no target to extend. */
  adjustSetTimer: (deltaSeconds: number) => void;
  /** "I'm already on the bar" — spend the get-ready count now. */
  skipSetTimerPrepare: () => void;
  /** Abandon without logging. */
  cancelSetTimer: () => void;
  /** Log what the clock read into the set, then complete it as usual. */
  commitSetTimer: () => void;
}

export const NO_REST: RestState = {
  endsAt: null,
  totalSeconds: 0,
  source: null,
  originSetId: null,
  pausedRemainingMs: null,
};

export const useActiveWorkout = create<ActiveWorkoutState>()(
  persist(
    (set, get) => ({
      session: null,
      activeEntryId: null,
      rest: NO_REST,
      setTimer: null,

      /* ---------------------------------------------------------- */

      startSession: (params) => {
        const session = buildDraftSession(params);
        set({
          session,
          activeEntryId: session.entries[0]?.localId ?? null,
          rest: NO_REST,
          setTimer: null,
        });
      },

      discardSession: () =>
        set({ session: null, activeEntryId: null, rest: NO_REST, setTimer: null }),

      finishSession: () => {
        const { session } = get();
        set({ session: null, activeEntryId: null, rest: NO_REST, setTimer: null });
        return session;
      },

      setActiveEntry: (entryId) => set({ activeEntryId: entryId }),

      /* ---------------------------------------------------------- */

      /**
       * The one-tap path. Marks the set done, then starts the appropriate rest:
       * the longer transition rest if this was the last set of the exercise, the
       * normal inter-set rest otherwise.
       *
       * `autoStartRest` off makes rest entirely manual — some people superset,
       * and a pill that appears over the next exercise's rows is in the way.
       */
      completeSet: (entryId, setId) => {
        const { session } = get();
        if (!session) return;

        let restSeconds = 0;
        let advanceTo: ID | null = null;
        let matched = false;

        const entries = session.entries.map((entry) => {
          if (entry.localId !== entryId) return entry;
          matched = true;

          const sets = entry.sets.map((s) =>
            s.localId === setId
              ? { ...s, isCompleted: true, completedAt: new Date().toISOString(), isPrefilled: false }
              : s,
          );

          const allDone = sets.every((s) => s.isCompleted);
          restSeconds = allDone ? entry.transitionRestSeconds : entry.restSeconds;

          if (allDone) {
            const i = session.entries.findIndex((e) => e.localId === entryId);
            advanceTo = session.entries[i + 1]?.localId ?? null;
          }

          return { ...entry, sets };
        });

        // A set that isn't in the session can't be completed, and must not clear
        // a rest the user is currently watching.
        if (!matched) return;

        const autoRest = currentSettings().autoStartRest && restSeconds > 0;

        set({
          session: { ...session, entries },
          activeEntryId: advanceTo ?? get().activeEntryId,
          rest: autoRest
            ? {
                endsAt: Date.now() + restSeconds * 1000,
                totalSeconds: restSeconds,
                source: advanceTo ? 'transition' : 'set',
                originSetId: setId,
                pausedRemainingMs: null,
              }
            : NO_REST,
        });
      },

      /** Undo — also kills the rest timer, since the reason for it is gone. */
      uncompleteSet: (entryId, setId) => {
        const { session, rest } = get();
        if (!session) return;
        set({
          session: mapSet(session, entryId, setId, (s) => ({
            ...s,
            isCompleted: false,
            completedAt: null,
          })),
          rest: rest.originSetId === setId ? NO_REST : rest,
        });
      },

      patchSet: (entryId, setId, patch) => {
        const { session } = get();
        if (!session) return;
        set({
          session: mapSet(session, entryId, setId, (s) => ({ ...s, ...patch, isPrefilled: false })),
        });
      },

      addSet: (entryId) => {
        const { session } = get();
        if (!session) return;

        set({
          session: mapEntry(session, entryId, (entry) => {
            // A new set inherits the last one — the near-universal intent.
            const last = entry.sets[entry.sets.length - 1];
            const next: DraftSet = {
              localId: uid('set'),
              weightKg: last?.weightKg ?? null,
              count: last?.count ?? entry.targetRepsMax ?? 10,
              isWarmup: false,
              isCompleted: false,
              completedAt: null,
              isPrefilled: true,
            };
            return { ...entry, sets: [...entry.sets, next] };
          }),
        });
      },

      removeSet: (entryId, setId) => {
        const { session, setTimer } = get();
        if (!session) return;
        set({
          session: mapEntry(session, entryId, (entry) => ({
            ...entry,
            sets: entry.sets.filter((s) => s.localId !== setId),
          })),
          // A timer with nothing left to log into is a timer that can't be
          // committed. Drop it rather than leaving an orphan running.
          setTimer: setTimer?.setId === setId ? null : setTimer,
        });
      },

      /* ---------------------------------------------------------- */

      acceptOverload: (entryId) => {
        const { session } = get();
        if (!session) return;

        set({
          session: mapEntry(session, entryId, (entry) => {
            const { suggestedWeightKg, suggestedReps } = entry.overload;
            const sets = entry.sets.map((s) =>
              s.isCompleted
                ? s
                : {
                    ...s,
                    weightKg: suggestedWeightKg ?? s.weightKg,
                    count: suggestedReps ?? s.count,
                    isPrefilled: false,
                  },
            );
            return { ...entry, sets, overloadAccepted: true };
          }),
        });
      },

      dismissOverload: (entryId) => {
        const { session } = get();
        if (!session) return;
        set({
          session: mapEntry(session, entryId, (entry) => ({ ...entry, overloadAccepted: true })),
        });
      },

      /* ---------------------------------------------------------- */

      /** A rest of zero seconds is not a rest. Asking for one clears the pill. */
      startRest: (seconds, source = 'manual', originSetId = null) => {
        const total = Math.round(seconds);
        if (!Number.isFinite(total) || total <= 0) {
          set({ rest: NO_REST });
          return;
        }
        set({
          rest: {
            endsAt: Date.now() + total * 1000,
            totalSeconds: total,
            source,
            originSetId,
            pausedRemainingMs: null,
          },
        });
      },

      /**
       * ± on the rest. Clamped so a `−15` on a 5 s timer just ends it rather than
       * going negative, and so `totalSeconds` — which the drain line divides by —
       * can never reach zero.
       *
       * Works while paused too: the frozen remainder moves instead of the
       * deadline, so "pause, add a minute, resume" does what it says.
       */
      adjustRest: (deltaSeconds) => {
        const { rest } = get();
        const deltaMs = deltaSeconds * 1000;
        const nextTotal = Math.max(1, rest.totalSeconds + deltaSeconds);

        if (rest.pausedRemainingMs != null) {
          set({
            rest: {
              ...rest,
              pausedRemainingMs: Math.max(0, rest.pausedRemainingMs + deltaMs),
              totalSeconds: nextTotal,
            },
          });
          return;
        }

        if (!rest.endsAt) return;
        set({
          rest: {
            ...rest,
            endsAt: Math.max(Date.now(), rest.endsAt + deltaMs),
            totalSeconds: nextTotal,
          },
        });
      },

      pauseRest: () => {
        const { rest } = get();
        if (rest.endsAt == null || rest.pausedRemainingMs != null) return;
        set({
          rest: {
            ...rest,
            endsAt: null,
            pausedRemainingMs: Math.max(0, rest.endsAt - Date.now()),
          },
        });
      },

      resumeRest: () => {
        const { rest } = get();
        if (rest.pausedRemainingMs == null) return;
        // Resuming with nothing left is "skip" wearing a different label.
        if (rest.pausedRemainingMs <= 0) {
          set({ rest: NO_REST });
          return;
        }
        set({
          rest: {
            ...rest,
            endsAt: Date.now() + rest.pausedRemainingMs,
            pausedRemainingMs: null,
          },
        });
      },

      skipRest: () => set({ rest: NO_REST }),

      /* ---------------------------------------------------------- */

      /**
       * The prescribed hold comes from the SET, not the exercise: the row is
       * already prefilled with what was held last session (or the routine's
       * target on a first attempt), and `+15` before starting edits that number
       * through the normal quick-adjust. So the clock always counts down the
       * thing the row says it will.
       *
       * The get-ready length is the exercise's if it sets one — a boxing round
       * starts when you say go — and the user's setting otherwise.
       *
       * Starting a timer while another one runs REPLACES it. Pressing ▶ on a
       * second row while the first is still counting can only mean "time this one
       * instead", and nothing is lost: an uncommitted timer has written nothing to
       * the set it was pointed at.
       */
      startSetTimer: (entryId, setId) => {
        const { session } = get();
        const entry = session?.entries.find((e) => e.localId === entryId);
        const target = entry?.sets.find((s) => s.localId === setId);
        if (!entry || !target) return;

        const mode = resolveTimerMode(entry.exercise);
        if (mode === 'manual') return;

        const prepareSeconds = entry.exercise.prepareSeconds ?? currentSettings().prepareSeconds;
        const count = Number.isFinite(target.count) ? Math.round(target.count) : MIN_WORK_SECONDS;

        set({
          setTimer: {
            entryId,
            setId,
            mode,
            startedAt: Date.now(),
            prepareSeconds: Math.max(0, prepareSeconds),
            workSeconds: mode === 'countdown' ? Math.max(MIN_WORK_SECONDS, count) : 0,
          },
          // You cannot be resting and holding. The set timer takes the pill.
          rest: NO_REST,
        });
      },

      adjustSetTimer: (deltaSeconds) => {
        const { setTimer } = get();
        if (!setTimer) return;
        set({ setTimer: { ...setTimer, ...withWorkAdjusted(setTimer, deltaSeconds) } });
      },

      skipSetTimerPrepare: () => {
        const { setTimer } = get();
        if (!setTimer) return;
        set({ setTimer: { ...setTimer, ...withPrepareSkipped(setTimer, Date.now()) } });
      },

      cancelSetTimer: () => set({ setTimer: null }),

      /**
       * Write the clock into the set, then complete it through `completeSet` — so
       * the bell starts rest and advances the cursor exactly as the ✓ does.
       *
       * A timer stopped during the get-ready count has nothing to log, and a
       * zero-second plank is not a set. That case cancels instead.
       */
      commitSetTimer: () => {
        const { session, setTimer } = get();
        if (!session || !setTimer) return;

        const { workedSeconds } = readSetTimer(setTimer, Date.now());
        if (workedSeconds <= 0) {
          set({ setTimer: null });
          return;
        }

        set({
          session: mapSet(session, setTimer.entryId, setTimer.setId, (s) => ({
            ...s,
            count: workedSeconds,
            isPrefilled: false,
          })),
          setTimer: null,
        });
        get().completeSet(setTimer.entryId, setTimer.setId);
      },
    }),
    {
      name: 'active-workout',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      /*
       * Persisting the session means a crash, a phone call or a swipe-to-close
       * mid-workout costs the user nothing. `rest` and `setTimer` persist too —
       * both are anchored to absolute epoch times, so they are still correct after
       * a relaunch: a plank that ran while the app was killed reads as the plank
       * that actually happened.
       */
      partialize: (state) => ({
        session: state.session,
        activeEntryId: state.activeEntryId,
        rest: state.rest,
        setTimer: state.setTimer,
      }),
      /*
       * v1 had no `pausedRemainingMs`. Rather than patch field by field, hand the
       * whole blob to the same validator every launch uses — a migration and a
       * corrupt-state guard are the same job.
       */
      migrate: (persisted) => sanitizeState(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeState(persisted) }),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Rehydration guards                                                  */
/* ------------------------------------------------------------------ */

type PersistedSlice = Pick<
  ActiveWorkoutState,
  'session' | 'activeEntryId' | 'rest' | 'setTimer'
>;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Is this really a session the logging screen can render?
 *
 * Checked structurally rather than trusted, because the screen indexes into
 * `entry.exercise.countUnit` and `set.count` without asking. One missing
 * `exercise` on one entry used to be a crash on mount — and a persisted one, so
 * it came back on every launch. Anything short of complete is dropped whole: a
 * session with two of its six exercises silently missing is worse than none.
 */
function isRenderableSession(value: unknown): value is DraftSession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Partial<DraftSession>;
  if (typeof session.localId !== 'string' || typeof session.startedAt !== 'string') return false;
  if (typeof session.title !== 'string' || !Array.isArray(session.entries)) return false;

  return session.entries.every((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as Partial<DraftEntry>;
    if (typeof e.localId !== 'string' || !Array.isArray(e.sets)) return false;
    if (typeof e.exercise !== 'object' || e.exercise === null) return false;
    if (typeof e.exercise.countUnit !== 'string' || typeof e.exercise.name !== 'string') return false;
    if (!Array.isArray(e.exercise.muscleGroups)) return false;
    if (typeof e.overload !== 'object' || e.overload === null) return false;
    if (!Number.isFinite(e.restSeconds) || !Number.isFinite(e.transitionRestSeconds)) return false;

    return e.sets.every((s: unknown) => {
      if (typeof s !== 'object' || s === null) return false;
      const draftSet = s as Partial<DraftSet>;
      return typeof draftSet.localId === 'string' && Number.isFinite(draftSet.count);
    });
  });
}

/** A complete, renderable persisted slice from anything at all. */
function sanitizeState(persisted: unknown): PersistedSlice {
  const empty: PersistedSlice = {
    session: null,
    activeEntryId: null,
    rest: NO_REST,
    setTimer: null,
  };
  if (typeof persisted !== 'object' || persisted === null) return empty;

  const raw = persisted as Partial<PersistedSlice>;
  const session = isRenderableSession(raw.session) ? raw.session : null;
  if (!session) return empty;

  const entryIds = new Set(session.entries.map((e) => e.localId));
  const activeEntryId =
    typeof raw.activeEntryId === 'string' && entryIds.has(raw.activeEntryId)
      ? raw.activeEntryId
      : (session.entries[0]?.localId ?? null);

  return { session, activeEntryId, rest: sanitizeRest(raw.rest), setTimer: sanitizeTimer(raw.setTimer, entryIds) };
}

function sanitizeRest(value: unknown): RestState {
  if (typeof value !== 'object' || value === null) return NO_REST;
  const rest = value as Partial<RestState>;

  const paused =
    typeof rest.pausedRemainingMs === 'number' && Number.isFinite(rest.pausedRemainingMs)
      ? Math.max(0, rest.pausedRemainingMs)
      : null;
  const endsAt =
    typeof rest.endsAt === 'number' && Number.isFinite(rest.endsAt) ? rest.endsAt : null;

  // Neither running nor frozen means idle, whatever else the blob claimed.
  if (endsAt == null && paused == null) return NO_REST;

  return {
    // A paused rest owns the state exclusively; a blob claiming both is repaired
    // in favour of the pause, which is the one the user chose.
    endsAt: paused != null ? null : endsAt,
    pausedRemainingMs: paused,
    totalSeconds: Math.max(1, Math.round(finiteOr(rest.totalSeconds, 1))),
    source:
      rest.source === 'set' || rest.source === 'transition' || rest.source === 'manual'
        ? rest.source
        : 'manual',
    originSetId: typeof rest.originSetId === 'string' ? rest.originSetId : null,
  };
}

function sanitizeTimer(value: unknown, entryIds: Set<string>): SetTimerState | null {
  if (typeof value !== 'object' || value === null) return null;
  const timer = value as Partial<SetTimerState>;
  if (timer.mode !== 'countdown' && timer.mode !== 'countup') return null;
  if (typeof timer.entryId !== 'string' || typeof timer.setId !== 'string') return null;
  // A clock pointed at an entry that didn't survive can never be committed.
  if (!entryIds.has(timer.entryId)) return null;
  if (typeof timer.startedAt !== 'number' || !Number.isFinite(timer.startedAt)) return null;

  return {
    entryId: timer.entryId,
    setId: timer.setId,
    mode: timer.mode,
    startedAt: timer.startedAt,
    prepareSeconds: Math.max(0, Math.round(finiteOr(timer.prepareSeconds, 0))),
    workSeconds: Math.max(0, Math.round(finiteOr(timer.workSeconds, 0))),
  };
}

/* ------------------------------------------------------------------ */
/* Immutable helpers                                                   */
/* ------------------------------------------------------------------ */

function mapEntry(
  session: DraftSession,
  entryId: ID,
  fn: (entry: DraftEntry) => DraftEntry,
): DraftSession {
  return {
    ...session,
    entries: session.entries.map((e) => (e.localId === entryId ? fn(e) : e)),
  };
}

function mapSet(
  session: DraftSession,
  entryId: ID,
  setId: ID,
  fn: (set: DraftSet) => DraftSet,
): DraftSession {
  return mapEntry(session, entryId, (entry) => ({
    ...entry,
    sets: entry.sets.map((s) => (s.localId === setId ? fn(s) : s)),
  }));
}

/* ------------------------------------------------------------------ */
/* Selectors — keep components subscribed to the narrowest slice        */
/* ------------------------------------------------------------------ */

export const selectEntry = (entryId: ID) => (state: ActiveWorkoutState) =>
  state.session?.entries.find((e) => e.localId === entryId) ?? null;

/** The next set the user is expected to log — drives the "primed" row styling. */
export const selectNextSetId = (entryId: ID) => (state: ActiveWorkoutState) =>
  state.session?.entries.find((e) => e.localId === entryId)?.sets.find((s) => !s.isCompleted)
    ?.localId ?? null;

export interface SessionProgress {
  done: number;
  total: number;
}

/**
 * Set counts for the header.
 *
 * ⚠️ This builds a NEW OBJECT on every call, so it must never be handed to
 * `useActiveWorkout` directly — use `useSessionProgress` below.
 *
 * Zustand v5 compares selector results with `Object.is` (v4's automatic shallow
 * compare is gone). A selector that returns a fresh object therefore reports a
 * changed snapshot on every render, `useSyncExternalStore` re-renders to catch
 * up, and the next render reports changed again: an unbounded render loop that
 * ends in "Maximum update depth exceeded". In a release build that is not a
 * warning, it is the process dying — and since the session is persisted, the
 * relaunch lands straight back on the same screen and does it again.
 *
 * Kept exported because it is genuinely useful outside React (tests, actions),
 * where there is no snapshot to keep stable.
 */
export const selectProgress = (state: ActiveWorkoutState): SessionProgress => {
  const entries = state.session?.entries ?? [];
  let done = 0;
  let total = 0;
  for (const entry of entries) {
    for (const s of entry.sets) {
      total += 1;
      if (s.isCompleted) done += 1;
    }
  }
  return { done, total };
};

/**
 * `selectProgress` with the shallow comparison that makes it safe to render
 * with: two objects holding the same two numbers count as the same snapshot, so
 * the store only re-renders the header when a count actually moves.
 */
export function useSessionProgress(): SessionProgress {
  return useActiveWorkout(useShallow(selectProgress));
}

/** True while a rest is on screen — running or frozen. */
export function isResting(rest: RestState): boolean {
  return rest.endsAt != null || rest.pausedRemainingMs != null;
}
