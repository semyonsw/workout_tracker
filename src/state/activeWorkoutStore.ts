/**
 * Active workout store (Zustand).
 *
 * Deliberately the ONLY global state in the app. Everything else — library,
 * routines, history — is server/DB state read through TanStack Query, because
 * it is cached, not mutated in place. The live session is different: it is
 * edited dozens of times a minute and must survive navigation and app restarts.
 *
 * Two design decisions worth keeping:
 *
 *  1. THE REST TIMER IS A DEADLINE, NOT A COUNTDOWN. We store `restEndsAt`
 *     (epoch ms) and derive the remaining seconds at render time. Timers that
 *     decrement a counter drift, freeze when iOS suspends the JS thread, and
 *     lie after a phone call. A deadline is correct on resume, always. The set
 *     timer (`setTimer`) follows the same rule with one stored fact — when start
 *     was pressed — and derives its phase; see `lib/setTimer.ts`.
 *
 *  2. `completeSet` is the only action the finger needs in the happy path: it
 *     marks the set, starts the right rest period, and advances the cursor.
 *     `commitSetTimer` routes through it rather than reimplementing it, so a
 *     plank logged by the clock and a set logged by the ✓ take the same path.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DraftEntry, DraftSession, DraftSet } from '../lib/draft';
import { buildDraftSession, uid, type BuildDraftParams } from '../lib/draft';
import {
  DEFAULT_PREPARE_SECONDS,
  MIN_WORK_SECONDS,
  readSetTimer,
  resolveTimerMode,
  withPrepareSkipped,
  withWorkAdjusted,
  type SetTimerSpec,
} from '../lib/setTimer';
import type { ID } from '../types/models';

export type RestSource = 'set' | 'transition' | 'manual';

interface RestState {
  /** Epoch ms when rest ends. null = no timer running. */
  endsAt: number | null;
  /** What the timer was started with, for the progress ring. */
  totalSeconds: number;
  source: RestSource | null;
  /** Which set triggered it — lets the UI dim the row that's resting. */
  originSetId: ID | null;
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
  skipRest: () => void;

  /* --- set timer (planks, hangs, rounds) --- */
  /** Get-ready countdown, then the work clock. No-op on a non-timed exercise. */
  startSetTimer: (entryId: ID, setId: ID) => void;
  /** ±15 s on the prescribed hold. Count-ups have no target to extend. */
  adjustSetTimer: (deltaSeconds: number) => void;
  /** "I'm already on the bar" — spend the get-ready count now. */
  skipSetTimerPrepare: () => void;
  /** Abandon without logging. */
  cancelSetTimer: () => void;
  /** Log what the clock read into the set, then complete it as usual. */
  commitSetTimer: () => void;
}

const NO_REST: RestState = { endsAt: null, totalSeconds: 0, source: null, originSetId: null };

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
       * the longer transition rest if this was the last set of the exercise,
       * the normal inter-set rest otherwise.
       */
      completeSet: (entryId, setId) => {
        const { session } = get();
        if (!session) return;

        let restSeconds = 0;
        let advanceTo: ID | null = null;

        const entries = session.entries.map((entry) => {
          if (entry.localId !== entryId) return entry;

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

        set({
          session: { ...session, entries },
          activeEntryId: advanceTo ?? get().activeEntryId,
          rest: {
            endsAt: Date.now() + restSeconds * 1000,
            totalSeconds: restSeconds,
            source: advanceTo ? 'transition' : 'set',
            originSetId: setId,
          },
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

      startRest: (seconds, source = 'manual', originSetId = null) =>
        set({
          rest: { endsAt: Date.now() + seconds * 1000, totalSeconds: seconds, source, originSetId },
        }),

      /** ±15 s. Clamped so "−15" on a 5 s timer just ends it rather than going negative. */
      adjustRest: (deltaSeconds) => {
        const { rest } = get();
        if (!rest.endsAt) return;
        const endsAt = Math.max(Date.now(), rest.endsAt + deltaSeconds * 1000);
        set({
          rest: { ...rest, endsAt, totalSeconds: Math.max(1, rest.totalSeconds + deltaSeconds) },
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
       */
      startSetTimer: (entryId, setId) => {
        const { session } = get();
        const entry = session?.entries.find((e) => e.localId === entryId);
        const target = entry?.sets.find((s) => s.localId === setId);
        if (!entry || !target) return;

        const mode = resolveTimerMode(entry.exercise);
        if (mode === 'manual') return;

        set({
          setTimer: {
            entryId,
            setId,
            mode,
            startedAt: Date.now(),
            prepareSeconds: entry.exercise.prepareSeconds ?? DEFAULT_PREPARE_SECONDS,
            workSeconds:
              mode === 'countdown' ? Math.max(MIN_WORK_SECONDS, Math.round(target.count)) : 0,
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
       * Write the clock into the set, then complete it through `completeSet` —
       * so the bell starts rest and advances the cursor exactly as the ✓ does.
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
      storage: createJSONStorage(() => AsyncStorage),
      /*
       * Persisting the session means a crash, a phone call or a swipe-to-close
       * mid-workout costs the user nothing. `rest` and `setTimer` persist too —
       * both are anchored to absolute epoch times, so they are still correct
       * after a relaunch: a plank that ran while the app was killed reads as the
       * plank that actually happened.
       */
      partialize: (state) => ({
        session: state.session,
        activeEntryId: state.activeEntryId,
        rest: state.rest,
        setTimer: state.setTimer,
      }),
    },
  ),
);

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

export const selectProgress = (state: ActiveWorkoutState) => {
  const entries = state.session?.entries ?? [];
  const all = entries.flatMap((e) => e.sets);
  return { done: all.filter((s) => s.isCompleted).length, total: all.length };
};
