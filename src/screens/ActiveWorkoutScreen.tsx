/**
 * ActiveWorkoutScreen — the screen the app exists for.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  PULL + SWIMMING                 [ Finish ]│   ← header, always visible
 *   │    11 of 18 sets · 42 min                    │
 *   │    ( Stop and exit )( Restart clock )        │   ← session controls
 *   ├──────────────────────────────────────────────┤
 *   │ ╭──────────────────────────────────────────╮ │
 *   │ │  1:28   BETWEEN SETS    +15  ⏸   Skip    │ │   ← the clock, up top
 *   │ ╰──────────────────────────────────────────╯ │
 *   │ Weighted 90° pull-ups                        │   ← expanded
 *   │ 4 × 4–6 reps · last: +40 kg · 4 4            │
 *   │  ↗ SAME +25 KG FOR 23 DAYS · 5 SESSIONS      │
 *   │  1   +40 KG   ×   4 REPS                 (✓) │
 *   │  3   +40 KG   ×   4 REPS                 ( ) │   ← primed, surface-alt
 *   │  + Add set              − Remove set          │
 *   │ Wide pull-ups machine                  0/4 ● │   ← collapsed
 *   │ Plank                                  0/3   │
 *   │  1      2:00 MIN                   ( ▶ )( ) │   ← timed: run the clock
 *   │ ( + Add an exercise )                        │   ← anything, mid-workout
 *   └──────────────────────────────────────────────┘
 *
 * NO TAB BAR. The session owns the screen: there is nothing else worth doing
 * mid-set, and a tab bar would put a navigation target a thumb-slip from the ✓.
 *
 * Everything here is composition and wiring: state lives in the store, decisions
 * live in `lib/`. The screen's only real job is to keep the thing the user is
 * doing right now under their thumb.
 *
 * ── OPENING A WORKOUT IS NOT STARTING ONE ───────────────────────────────────
 *
 * A routine can be opened just to read it — "what is on push day again?" — and
 * that must leave no trace: no date, no duration, no history row. So the session
 * arrives with `startedAt: null` and this screen offers three things instead of
 * two:
 *
 *   • `Start` anchors the clock to now. Until it is pressed the header says
 *     `not started` and nothing is timed. Logging a set starts it too, because a
 *     ✓ says "I am training" as clearly as the button does.
 *   • `Stop and exit` leaves WITHOUT SAVING. On a workout with sets logged it
 *     asks first; on one with nothing logged it just goes.
 *   • `Finish` saves, and is only offered once the workout has started.
 *
 * The back chevron — and Android's own back gesture, which goes through the same
 * path — is the fourth way out and the quiet one: it leaves a started workout
 * running (the store persists it, so the session is still there when you come
 * back) and throws away one that was only being looked at.
 *
 * `Restart the clock` is the same action as `Start`, offered again while a workout
 * runs: a session left open in a locker reads five hours, and one tap re-anchors it
 * without touching a single logged set.
 *
 * ── THE SESSION IS EDITABLE WHILE IT RUNS ───────────────────────────────────
 *
 * A plan survives contact with the gym for about ten minutes. Three things on this
 * screen are that admission:
 *
 *   • `+ Add an exercise` at the bottom — pick anything from the library, or create
 *     something that isn't in it yet, and it lands at the end of THIS session with
 *     one set. Neck work at the end of pull day is not a routine edit.
 *   • `− Remove set` beside `Add set` in every card, taking the bottom row; on an
 *     exercise down to one row it takes the exercise.
 *   • LONG PRESS, THEN SLIDE to reorder. The order you planned is not the order the
 *     machines are free in.
 *
 * ── ONE CARD OPEN, OR NONE ──────────────────────────────────────────────────
 *
 * Two different questions used to share one answer, and that is what made the list
 * feel stuck:
 *
 *   • WHICH EXERCISE AM I ON? — the cursor, `activeEntryId` in the store. It is
 *     what `completeSet` advances, what `Rest` belongs to, and what the auto-scroll
 *     follows. It always points somewhere while the session has exercises.
 *   • WHICH CARD IS OPEN? — a view state, and it is allowed to be NOTHING. Tapping
 *     the open card's header shuts it; tapping any other card opens that one and
 *     moves the cursor to it, because tapping an exercise is saying "I'm doing this
 *     now".
 *
 * So `collapsedId` below is not a second cursor. It records the one thing the
 * store has no business knowing: that the user has shut the card they are on. The
 * moment the cursor moves — a finished exercise, an exercise added mid-session —
 * the new card opens, which is the behaviour that made one-card-at-a-time worth
 * having in the first place.
 *
 * A SHUT CARD THAT IS THE CURRENT ONE GLOWS. It has to: with everything closed the
 * list is eight names and nothing else, and "where was I" is then a question the
 * user has to answer by remembering. `isCurrent` is that mark — the name goes
 * green-bright and the card takes a green ring, the same green the next set's row
 * outline uses inside the open card, because both mean THIS IS THE WORK.
 *
 * ── HOW THE DRAG WORKS ──────────────────────────────────────────────────────
 *
 * LONG PRESS, THEN SLIDE — `hooks/useDragReorder.ts`, shared with the routine
 * editor so the gesture is the same one in both lists. This screen supplies the
 * three things only it knows: the card ids in order, the layouts captured on each
 * card's `onLayout`, and `moveEntry` to commit. What it renders for the mode is
 * here — the lifted card following `dragY`, every other card dimmed, and the whole
 * list refusing touches so a finger sliding a card across a ✓ does not log a set.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { ExerciseCard } from '../components/ExerciseCard';
import { FinishSheet } from '../components/FinishSheet';
import { Icon } from '../components/Icon';
import { RestTimerPill } from '../components/RestTimerPill';
import { ScreenHeader } from '../components/ScreenHeader';
import { SetTimerPill } from '../components/SetTimerPill';
import type { DraftEntry, DraftSession, DraftSet } from '../lib/draft';
import { commit, tap, undo } from '../lib/feedback';
import { useDragReorder, type CardLayout } from '../hooks/useDragReorder';
import { resolveRest } from '../lib/rest';
import { describeLadderOutcomes, ladderOutcomes } from '../lib/repLadder';
import { describePlannedSetDiff, performedSetCounts, plannedSetDiff } from '../lib/routinePlan';
import { supersetPosition } from '../lib/superset';
import { describeWarmup, warmupSets, type WarmupSet } from '../lib/warmup';
import { beatSomething, recordsBeatenBy } from '../lib/records';
import { formatCount, formatWeight, unitLabel } from '../lib/units';
import { useActiveWorkout, useSessionProgress } from '../state/activeWorkoutStore';
import { platesInForce, useSettings } from '../state/settingsStore';
import { PrimaryButton } from '../components/primitives';
import { palette } from '../theme/tokens';
import type { ID, RoutineItem, UnitSystem } from '../types/models';

/**
 * The air left above the auto-scrolled card, in dp.
 *
 * Small on purpose: the top of the card lands ON the line the timer pill sits on,
 * so the exercise's name and its first sets are the first thing in the viewport
 * and nothing above them is wasted. Any more than a hair here and the list looks
 * like it stopped short.
 */
const CARD_TOP_GAP = 8;

/**
 * How long the auto-scroll keeps correcting itself against fresh layouts, in ms.
 *
 * Long enough for the collapse-and-expand pass that follows a cursor move, short
 * enough that the next `Add set` is the user's business and not the scroll's. See
 * `pendingScroll`.
 */
const LAYOUT_SETTLE_MS = 350;

interface ActiveWorkoutScreenProps {
  unitSystem: UnitSystem;
  /**
   * Persist the finished session; navigation happens after it resolves.
   *
   * Handed the whole draft rather than pre-flattened rows: history keeps a record
   * of the WORKOUT — its title, how long it took, which exercises were in it — and
   * a screen whose job is logging sets should not be the thing that decides what
   * that record looks like. `lib/completedWorkout.ts` owns that shape.
   */
  onFinish: (session: DraftSession, updatePlan?: boolean) => Promise<void> | void;
  /**
   * The routine items this session was built from, for the `Finish` sheet's one
   * extra offer: "Dips did 5 sets, not 4 — update the routine?"
   *
   * Absent when the session did not come from a routine, which is also the answer
   * to whether there is a plan to update. The DIFF is not computed here — this
   * screen hands the items to `plannedSetDiff` and renders the sentence it gets
   * back, because "which exercise's item learns from which entry" is a decision
   * and decisions live in `lib/`.
   */
  routineItems?: readonly RoutineItem[];
  /**
   * Leave the logging screen. The CALLER decides what that means for the session
   * itself — a started workout keeps running, an unstarted one is thrown away
   * (see `AppShell.leaveSession`), and both `Finish` and `Stop and exit` have
   * already ended it by the time they call this.
   */
  onExit: () => void;
  /**
   * Open the library as a picker for THIS session. Absent = no add button, which
   * is what a caller with nowhere to navigate should get rather than a dead row.
   */
  onAddExercise?: () => void;
}

export function ActiveWorkoutScreen({
  unitSystem,
  routineItems,
  onFinish,
  onExit,
  onAddExercise,
}: ActiveWorkoutScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  /**
   * y offset + height of each card, captured on layout: auto-scroll and dragging.
   *
   * The offsets are relative to the list wrapper, not to the scroll content — the
   * drag only ever compares them to each other, and `listTop` is what turns one
   * into a scroll position.
   */
  const cardLayouts = useRef<Record<ID, CardLayout>>({});
  /** Where the list wrapper starts inside the scroll content. */
  const listTop = useRef(0);
  const [confirming, setConfirming] = useState<'finish' | 'clock' | 'discard' | null>(null);
  /**
   * The exercise the user asked to remove, held while the sheet asks — and only
   * ever set when there is something to lose. Removing an exercise nobody has
   * logged a set into is not a question, and a sheet in front of it would be
   * ceremony charged for the common case.
   */
  const [removingEntry, setRemovingEntry] = useState<DraftEntry | null>(null);
  /**
   * The card the user has SHUT, when it is the one the cursor is on.
   *
   * Screen-local and deliberately not persisted: reopening the app should show you
   * the exercise you are on, not the fact that you closed it at some point. It is
   * compared against the live cursor rather than cleared when the cursor moves, so
   * a finished exercise opens the next one without a second piece of bookkeeping —
   * see the file header.
   */
  const [collapsedId, setCollapsedId] = useState<ID | null>(null);

  /* --- store bindings: one selector per slice, never the whole store --- */
  const session = useActiveWorkout((s) => s.session);
  const activeEntryId = useActiveWorkout((s) => s.activeEntryId);
  /*
   * Set counts, through a hook rather than `useActiveWorkout(selectProgress)`.
   *
   * That selector builds a `{done, total}` object, and Zustand v5 compares
   * selector results by reference: a fresh object every call means every render
   * reports a changed snapshot, `useSyncExternalStore` re-renders to catch up, and
   * the render after that reports changed again — an unbounded loop ending in
   * "Maximum update depth exceeded". This screen was the only place it happened,
   * which made it a crash the instant a workout started. `useSessionProgress`
   * wraps the same selector in `useShallow`. See the note on `selectProgress`.
   */
  const progress = useSessionProgress();
  /*
   * The timer object, not its ticking clock: this identity changes only when a
   * timer starts, is adjusted, or ends. The 4 Hz tick lives inside the pill, so
   * a running plank does not re-render eighteen set rows four times a second.
   */
  const setTimer = useActiveWorkout((s) => s.setTimer);

  const setActiveEntry = useActiveWorkout((s) => s.setActiveEntry);
  const completeSet = useActiveWorkout((s) => s.completeSet);
  const uncompleteSet = useActiveWorkout((s) => s.uncompleteSet);
  const patchSet = useActiveWorkout((s) => s.patchSet);
  const addSet = useActiveWorkout((s) => s.addSet);
  const addWarmupSets = useActiveWorkout((s) => s.addWarmupSets);
  const removeSet = useActiveWorkout((s) => s.removeSet);
  const removeLastSet = useActiveWorkout((s) => s.removeLastSet);
  const removeEntry = useActiveWorkout((s) => s.removeEntry);
  const moveEntry = useActiveWorkout((s) => s.moveEntry);
  const startWorkout = useActiveWorkout((s) => s.startWorkout);
  const discardSession = useActiveWorkout((s) => s.discardSession);
  const acceptOverload = useActiveWorkout((s) => s.acceptOverload);
  const dismissOverload = useActiveWorkout((s) => s.dismissOverload);
  const finishSession = useActiveWorkout((s) => s.finishSession);
  const startSetTimer = useActiveWorkout((s) => s.startSetTimer);
  const commitSetTimer = useActiveWorkout((s) => s.commitSetTimer);
  const startRestNow = useActiveWorkout((s) => s.startRestNow);
  const setSessionEffort = useActiveWorkout((s) => s.setSessionEffort);

  /*
   * The live between-sets setting. Each card resolves its OWN rest from it
   * (`resolveRest`, below) rather than showing it flat: an exercise with a rest of
   * its own runs that, and a `Rest 2:00` button that then started a 3:00 countdown
   * is the same lie this rework exists to remove. Read here rather than off the
   * entry so an exercise that is following the setting follows it live — which is
   * also what `completeSet` will do.
   */
  const restSeconds = useSettings((s) => s.restSecondsBetweenSets);
  /*
   * The plates of whichever gym the user says they are in, for the `20 + 2×10`
   * line under a barbell lift. Memoized on the two stable references it derives
   * from, because `platesInForce` builds a fresh array and `SetRow` is memoized:
   * a new array identity every render would repaint eighteen rows on every tick
   * of the rest timer.
   */
  /*
   * Today's bodyweight, for reading a bodyweight-loaded set against its own record.
   * The scalar rather than the log, because every set being compared here happened
   * in this session — today is the only day involved.
   */
  const bodyweightKg = useSettings((s) => s.bodyweightKg);
  const gyms = useSettings((s) => s.gyms);
  const activeGymId = useSettings((s) => s.activeGymId);
  const availablePlatesKg = useMemo(
    () => platesInForce({ gyms, activeGymId }),
    [gyms, activeGymId],
  );

  /**
   * The warm-up rows each exercise would get, keyed by entry.
   *
   * ONE PASS FOR THE WHOLE SESSION, memoized, because the alternative is running
   * `loadableAtOrBelow`'s plate walk inside a render that happens four times a
   * second while a rest timer ticks. Keyed by entry rather than by exercise, since
   * two entries can be the same movement at different weights.
   *
   * An exercise is absent from the map when there is nothing to offer — see
   * `warmupSets` for the four cases — and the card reads that as "no row".
   */
  const warmupPlans = useMemo(() => {
    const plans: Record<ID, { sets: WarmupSet[]; summary: string }> = {};
    for (const entry of session?.entries ?? []) {
      // Nothing to warm up for once the exercise is under way.
      if (entry.sets.some((set) => set.isCompleted)) continue;
      // The first working set's weight is what the rungs are a fraction of.
      const working = entry.sets.find((set) => !set.isWarmup)?.weightKg ?? null;
      const sets = warmupSets({
        workingWeightKg: working,
        exercise: entry.exercise,
        availablePlatesKg,
      });
      const summary = describeWarmup(sets);
      if (summary) plans[entry.localId] = { sets, summary };
    }
    return plans;
  }, [availablePlatesKg, session?.entries]);

  /**
   * The best each exercise has broken in this session, keyed by entry.
   *
   * Read off LOGGED rows only, and compared against the bests copied onto the entry
   * when the session was built — so the second good set of a day does not stop
   * reading as a best because the first one already moved the bar. Memoized on the
   * entries, because it walks every logged set and this screen re-renders on every
   * tick of the rest timer.
   */
  const bestLines = useMemo(() => {
    const lines: Record<ID, string> = {};
    for (const entry of session?.entries ?? []) {
      const bests = entry.bests;
      if (!bests) continue;

      let best: { weightKg: number | null; count: number } | null = null;
      for (const set of entry.sets) {
        if (!set.isCompleted || set.isWarmup) continue;
        const beaten = recordsBeatenBy(set, bests, entry.exercise, bodyweightKg ?? null);
        if (!beatSomething(beaten)) continue;
        // The last one that beat something — a session that keeps climbing should
        // report where it got to, not where it started.
        best = set;
      }
      if (!best) continue;

      lines[entry.localId] = entry.exercise.requiresWeight
        ? `${formatWeight(best.weightKg, unitSystem, entry.exercise.loadMode)} ${unitLabel(unitSystem)} × ${formatCount(best.count, entry.exercise.countUnit)}`
        : formatCount(best.count, entry.exercise.countUnit);
    }
    return lines;
  }, [bodyweightKg, session?.entries, unitSystem]);

  /**
   * Stalled lifts, keyed by entry.
   *
   * Suppressed wherever the overload nudge is already speaking: "add a rep" and
   * "take some weight off" on one card is one of them wrong, and the deload wins
   * because three failed sessions is newer information than a stale weight.
   *
   * Memoized for the same reason the warm-up plan is — it walks history and this
   * screen re-renders four times a second while a rest timer runs.
   */
  const deloadMessages = useMemo(() => {
    const out: Record<ID, string> = {};
    for (const entry of session?.entries ?? []) {
      if (entry.overload.shouldNudge && !entry.overloadAccepted) continue;
      if (entry.deload?.shouldSuggest) out[entry.localId] = entry.deload.message;
    }
    return out;
  }, [session?.entries]);

  /** The one open card, or null when the user has shut the one they are on. */
  const expandedEntryId =
    activeEntryId != null && activeEntryId === collapsedId ? null : activeEntryId;

  const isStarted = session?.startedAt != null;
  const elapsedMinutes = useElapsedMinutes(session?.startedAt ?? null);

  /* --- reorder ------------------------------------------------------- */
  const entryIds = useMemo(
    () => (session?.entries ?? []).map((e) => e.localId),
    [session?.entries],
  );
  const reorder = useDragReorder(entryIds, cardLayouts, moveEntry);
  const { lifted, dragY, panHandlers, lift, drop } = reorder;
  const liftedName = lifted
    ? (session?.entries.find((e) => e.localId === lifted)?.exercise.name ?? '')
    : '';

  /* --- keep the active card in view ---------------------------------- */
  /**
   * Scroll so THE TOP OF THE CARD sits just under the timer pill.
   *
   * That is the whole rule, and it is the one that makes the auto-scroll useful:
   * the exercise's name and its first sets are what you need to see when the
   * cursor lands on it, so the card starts where the list starts. `CARD_TOP_GAP`
   * is the hair of air that keeps the name off the pill's edge — the card is
   * under the pill, not tucked behind it.
   */
  const scrollToCard = useCallback((entryId: ID) => {
    const layout = cardLayouts.current[entryId];
    if (layout == null) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, listTop.current + layout.y - CARD_TOP_GAP),
      animated: true,
    });
  }, []);

  /**
   * The card the scroll is chasing, and the moment it stops chasing it.
   *
   * THE LAYOUTS ARE ONE FRAME BEHIND, and that is what made this scroll wrong.
   * Moving the cursor shuts the card above and opens this one, so every `y` below
   * the change is stale at the instant the effect runs — by the height of a whole
   * expanded card, which is what "it scrolls too far" was. `onLayout` is where the
   * true number arrives, so the scroll is re-issued there.
   *
   * Time-boxed rather than one-shot, because several layout passes can land (the
   * card above collapsing, this one expanding), and NOT left armed, because the
   * card re-lays out for ordinary reasons too — `Add set`, a plate line appearing —
   * and yanking the list to the top on those would be the app fighting the thumb.
   */
  const pendingScroll = useRef<{ id: ID; until: number } | null>(null);

  useEffect(() => {
    if (!expandedEntryId || lifted) return;
    pendingScroll.current = { id: expandedEntryId, until: Date.now() + LAYOUT_SETTLE_MS };
    // Immediately as well, off whatever is known: a card whose layout does not
    // change at all still has to be scrolled to.
    scrollToCard(expandedEntryId);
  }, [expandedEntryId, lifted, scrollToCard]);

  /* --- handlers ------------------------------------------------------ */
  /**
   * Tapping a card: open it, or — if it is already the open one — shut it.
   *
   * Opening one also moves the CURSOR to it. That is not an extra: the cursor is
   * "which exercise am I on", and reaching past three cards to open the fourth is
   * how a user says they are on the fourth.
   */
  const handleToggleCard = useCallback(
    (entryId: ID) => {
      tap();
      if (entryId === expandedEntryId) {
        setCollapsedId(entryId);
        return;
      }
      setCollapsedId(null);
      if (entryId !== activeEntryId) setActiveEntry(entryId);
    },
    [activeEntryId, expandedEntryId, setActiveEntry],
  );

  const handleToggleSet = useCallback(
    (entryId: ID, setId: ID, isCompleted: boolean) => {
      if (isCompleted) uncompleteSet(entryId, setId);
      else completeSet(entryId, setId); // also starts rest + advances the cursor
    },
    [completeSet, uncompleteSet],
  );

  /** ▶ starts the clock; ▶ again on the running set stops it and logs the time. */
  const handlePressTimer = useCallback(
    (entryId: ID, setId: ID) => {
      if (setTimer?.setId === setId) commitSetTimer();
      else startSetTimer(entryId, setId);
    },
    [commitSetTimer, setTimer?.setId, startSetTimer],
  );

  /**
   * Where the finished session's set counts disagree with the routine's plan.
   *
   * Computed while the sheet is open, from the LIVE session — the draft is gone by
   * the time `commitFinish` has run, so this cannot be derived afterwards.
   * `null`/empty means there is nothing to offer, and the sheet renders no offer.
   */
  const planChanges = useMemo(
    () =>
      session?.routineId && routineItems
        ? plannedSetDiff(routineItems, performedSetCounts(session.entries))
        : [],
    [routineItems, session?.entries, session?.routineId],
  );

  /**
   * What the ladders in this session earned, computed from the LIVE session for
   * the same reason `planChanges` is: the draft is gone by the time the finish has
   * run, so this cannot be derived afterwards.
   *
   * Read-only here. The sheet states it and `AppShell` is what writes the new max
   * back to the library — a screen whose job is logging sets does not get to edit
   * the exercise library, and recomputing it there means the write lands on the
   * row as the STORE has it rather than on the snapshot this line rendered.
   */
  const ladderChange = useMemo(
    () => describeLadderOutcomes(ladderOutcomes(session?.entries ?? [])),
    [session?.entries],
  );

  const commitFinish = useCallback(
    async (updatePlan = false) => {
      setConfirming(null);
      const finished = finishSession();
      if (!finished) return;
      await onFinish(finished, updatePlan);
      onExit();
    },
    [finishSession, onExit, onFinish],
  );

  /** ▶ Start — the workout is happening as of now. */
  const handleStart = useCallback(() => {
    commit();
    startWorkout();
  }, [startWorkout]);

  /**
   * Leave without saving. Confirms only when there is something to lose: a
   * workout nobody logged a set in has nothing to throw away, and asking about it
   * is a dialog that only ever has one answer.
   */
  const handleStopAndExit = useCallback(() => {
    if (progress.done > 0) {
      setConfirming('discard');
      return;
    }
    undo();
    discardSession();
    onExit();
  }, [discardSession, onExit, progress.done]);

  const handleFinish = useCallback(() => {
    if (!session) return;
    /*
     * The sheet appears for either of two reasons.
     *
     *  1. UNLOGGED SETS are an intention, not history. Say so, then let them go.
     *  2. A LADDER MOVED. Nothing is being asked — the rep is earned either way —
     *     but the number that just changed is the reason the user turned the
     *     ladder on, and a new max that only shows up next Tuesday when the card
     *     is opened is a progression the app forgot to mention. One tap, on the
     *     button the thumb is already going for.
     *
     * Neither is a nag: with nothing unlogged and no ladder in the session, Finish
     * still finishes in one tap, exactly as it always did.
     */
    if (progress.total - progress.done > 0 || ladderChange) {
      setConfirming('finish');
      return;
    }
    void commitFinish();
  }, [commitFinish, ladderChange, progress.done, progress.total, session]);

  /* --- empty states --------------------------------------------------- */
  /*
   * Both of these used to be a bare centred line with no way off the screen —
   * which on Android meant hardware-back or nothing. They get a button now,
   * because a screen you cannot leave is indistinguishable from a hang.
   */
  if (!session) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-xl">
        <Text className="text-body text-ink-muted">No workout in progress</Text>
        <View className="mt-xl w-full">
          <PrimaryButton label="Back" variant="ghost" onPress={onExit} />
        </View>
      </View>
    );
  }

  /*
   * A session with nothing in it. Reachable two ways: a routine whose exercises
   * were all deleted after it was started, and a session the user emptied out from
   * here one `Remove exercise` at a time. The second is why this screen offers the
   * picker rather than only a way out — the fix for "I removed them all" is adding
   * one back, not abandoning the workout.
   */
  if (session.entries.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-xl">
        <Text className="text-title font-medium text-ink">Nothing to log</Text>
        <Text className="mt-sm text-center text-body text-ink-muted">
          This workout has no exercises in it right now.
        </Text>
        <View className="mt-xl w-full">
          {onAddExercise ? (
            <View className="mb-sm">
              <PrimaryButton label="Add an exercise" onPress={onAddExercise} />
            </View>
          ) : null}
          <PrimaryButton label="Back" variant="ghost" onPress={onExit} />
        </View>
      </View>
    );
  }

  /**
   * Remove an exercise: straight away when nothing has been logged into it, and
   * behind the sheet when something has. The sheet's job is not to slow the user
   * down, it is to make sure a workout's record is never lost to one tap.
   */
  const handleRemoveEntry = (entry: DraftEntry) => {
    if (entry.sets.some((set) => set.isCompleted)) {
      setRemovingEntry(entry);
      return;
    }
    undo();
    removeEntry(entry.localId);
  };

  const dimmed = confirming != null || removingEntry != null;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      {/* The list dims behind a sheet rather than being replaced — the user is
          confirming something about THIS list, and should still see it. */}
      <View className="flex-1" style={dimmed ? { opacity: 0.28 } : undefined}>
        <ScreenHeader
          kicker={lifted ? `Moving · ${liftedName}` : session.title}
          kickerTone={lifted ? 'green' : 'faint'}
          subtitle={
            lifted
              ? `Slide to move it · position ${reorder.targetIndex + 1} of ${entryIds.length}`
              : isStarted
                ? `${progress.done} of ${progress.total} sets · ${elapsedMinutes} min`
                : `${progress.total} sets planned · not started`
          }
          onBack={lifted ? undefined : onExit}
          action={
            lifted
              ? { label: 'Drop', onPress: drop }
              : isStarted
                ? { label: 'Finish', onPress: handleFinish }
                : { label: 'Start', onPress: handleStart }
          }
        >
          {/* The session's own controls. Hidden mid-move — none of them is about
              a card in the air. `Start` is repeated as a chip before the workout
              begins because it is the thing to do, and the header pill alone is
              easy to read as a page title. */}
          {lifted ? null : (
            <View className="mt-sm flex-row items-center">
              {isStarted ? null : (
                <SessionChip label="Start workout" icon="play" tone="green" onPress={handleStart} />
              )}
              <SessionChip label="Stop and exit" icon="x" onPress={handleStopAndExit} />
              {isStarted ? (
                <SessionChip
                  label="Restart clock"
                  icon="play"
                  onPress={() => {
                    tap();
                    setConfirming('clock');
                  }}
                />
              ) : null}
            </View>
          )}
        </ScreenHeader>

        {/*
          One pill, two instruments, directly under the header: a rest countdown
          and the clock on a plank. A set timer outranks rest — you cannot be
          holding and resting, and `startSetTimer` clears rest for that reason.
          Each renders null when it isn't running, so this is either one pill or
          nothing at all.
        */}
        {setTimer ? <SetTimerPill /> : <RestTimerPill />}

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: insets.bottom + 32,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={!dimmed && !lifted}
        >
          {/* The drag surface. Claims a touch only while something is lifted. */}
          <View
            {...panHandlers}
            onLayout={(e) => {
              listTop.current = e.nativeEvent.layout.y;
            }}
          >
            {session.entries.map((entry, index) => {
              const isLifted = entry.localId === lifted;
              return (
                <Animated.View
                  key={entry.localId}
                  // While a card is in the air NOTHING in the list is tappable: a
                  // finger sliding a card across a ✓ must not log a set.
                  pointerEvents={lifted ? 'none' : 'auto'}
                  style={
                    isLifted
                      ? { transform: [{ translateY: dragY }], zIndex: 2, elevation: 2 }
                      : undefined
                  }
                  onLayout={(e) => {
                    const { y, height } = e.nativeEvent.layout;
                    cardLayouts.current[entry.localId] = { y, height };
                    // The real offset, one frame after the effect wanted it.
                    const pending = pendingScroll.current;
                    if (pending?.id === entry.localId && Date.now() < pending.until) {
                      scrollToCard(entry.localId);
                    }
                  }}
                >
                  <ExerciseCard
                    entry={entry}
                    isExpanded={entry.localId === expandedEntryId}
                    /* The cursor, which is not the same question as "is it open" —
                       a shut card that is the current one is what glows. */
                    isCurrent={entry.localId === activeEntryId}
                    unitSystem={unitSystem}
                    /* The bracket down a superset's left edge. Computed here
                       because only the screen can see the cards either side. */
                    superset={supersetPosition(session.entries, index)}
                    availablePlatesKg={availablePlatesKg}
                    timingSetId={setTimer?.entryId === entry.localId ? setTimer.setId : null}
                    isLifted={isLifted}
                    dimmed={lifted != null && !isLifted}
                    restSeconds={resolveRest(entry.exercise, restSeconds).seconds}
                    onStartRest={entry.localId === activeEntryId ? startRestNow : undefined}
                    onRemoveExercise={() => handleRemoveEntry(entry)}
                    onToggleExpanded={() => handleToggleCard(entry.localId)}
                    // One exercise cannot be reordered, and the gesture would only
                    // ever end where it started.
                    onLift={entryIds.length > 1 ? () => lift(entry.localId) : undefined}
                    onPressTimer={(setId) => handlePressTimer(entry.localId, setId)}
                    onToggleSet={(setId) => {
                      const target = entry.sets.find((s) => s.localId === setId);
                      handleToggleSet(entry.localId, setId, target?.isCompleted ?? false);
                    }}
                    onPatchSet={(setId: ID, patch: Partial<DraftSet>) =>
                      patchSet(entry.localId, setId, patch)
                    }
                    /*
                      WARM-UP. Decided here rather than in the card because it
                      needs the gym's plates and `lib/warmup.ts` — the card renders
                      the offer and nothing else. Both props go undefined together
                      when there is nothing to add, so the row disappears rather
                      than becoming a control that does nothing.
                    */
                    bestLine={bestLines[entry.localId] ?? null}
                    deloadMessage={deloadMessages[entry.localId] ?? null}
                    warmupSummary={warmupPlans[entry.localId]?.summary ?? null}
                    onAddWarmup={
                      warmupPlans[entry.localId]
                        ? () => addWarmupSets(entry.localId, warmupPlans[entry.localId].sets)
                        : undefined
                    }
                    onAddSet={() => addSet(entry.localId)}
                    onRemoveSet={(setId) => removeSet(entry.localId, setId)}
                    onRemoveLastSet={() => removeLastSet(entry.localId)}
                    onAcceptOverload={() => acceptOverload(entry.localId)}
                    onDismissOverload={() => dismissOverload(entry.localId)}
                  />
                </Animated.View>
              );
            })}

            {/* Anything at all, appended to the workout in flight. Last in the
                list because that is where it lands. */}
            {onAddExercise && !lifted ? (
              <Pressable
                onPress={() => {
                  tap();
                  onAddExercise();
                }}
                accessibilityRole="button"
                accessibilityLabel="Add an exercise to this workout"
                className="mx-lg mt-sm h-row flex-row items-center justify-center rounded-surface border border-hairline bg-surface-alt"
              >
                <Icon name="plus" size={14} color={palette.greenBright} />
                <Text className="ml-sm text-label font-medium text-green-bright">
                  Add an exercise
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </View>

      {confirming === 'finish' ? (
        <FinishSheet
          unloggedCount={progress.total - progress.done}
          loggedCount={progress.done}
          planChange={describePlannedSetDiff(planChanges)}
          ladderChange={ladderChange}
          effort={session.effort}
          onSetEffort={(effort) => {
            tap();
            setSessionEffort(effort);
          }}
          onConfirm={() => void commitFinish()}
          onConfirmAndUpdatePlan={() => void commitFinish(true)}
          onDismiss={() => setConfirming(null)}
        />
      ) : null}

      {confirming === 'clock' ? (
        <ConfirmSheet
          title="Restart the clock?"
          body={`This workout reads ${elapsedMinutes} min. Restarting the clock makes it 0, and history will record it from this moment — the sets you already logged stay exactly as they are.`}
          confirmLabel="Restart it"
          cancelLabel={`Keep ${elapsedMinutes} min`}
          onConfirm={() => {
            commit();
            startWorkout();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {removingEntry ? (
        <ConfirmSheet
          title={`Remove ${removingEntry.exercise.name}?`}
          body={`${removingEntry.sets.filter((set) => set.isCompleted).length} logged ${
            removingEntry.sets.filter((set) => set.isCompleted).length === 1 ? 'set' : 'sets'
          } will go with it, and nothing about them reaches your history. The exercise itself stays in your library.`}
          confirmLabel="Remove it"
          cancelLabel="Keep it"
          onConfirm={() => {
            undo();
            removeEntry(removingEntry.localId);
            setRemovingEntry(null);
          }}
          onCancel={() => setRemovingEntry(null)}
        />
      ) : null}

      {confirming === 'discard' ? (
        <ConfirmSheet
          title="Stop and exit without saving?"
          body={`${progress.done} ${progress.done === 1 ? 'set' : 'sets'} logged in this workout will be thrown away, and nothing will reach your history. Use Finish instead if you want to keep ${progress.done === 1 ? 'it' : 'them'}.`}
          confirmLabel="Throw it away"
          cancelLabel="Keep logging"
          onConfirm={() => {
            undo();
            discardSession();
            setConfirming(null);
            onExit();
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One session control: `Start the workout`, `Stop and exit`, `Restart the clock`.
 *
 * Chips rather than full-width buttons because they sit in the header, above the
 * work: they have to be reachable without being the second thing on the screen.
 * `green` marks the one that is the obvious next move.
 */
function SessionChip({
  label,
  icon,
  tone = 'quiet',
  onPress,
}: {
  label: string;
  icon: 'play' | 'x';
  tone?: 'green' | 'quiet';
  onPress: () => void;
}) {
  const green = tone === 'green';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={[
        'mr-sm h-[34px] flex-row items-center rounded-pill px-md',
        green ? 'bg-green' : 'border border-hairline bg-surface-alt',
      ].join(' ')}
    >
      <Icon name={icon} size={11} color={green ? palette.ink : palette.inkMuted} />
      <Text
        numberOfLines={1}
        className={[
          'ml-sm text-micro font-semibold uppercase',
          green ? 'text-ink' : 'text-ink-muted',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Session clock in whole minutes.
 * Ticks every 15 s rather than every second: the header shows minutes, so a
 * 1 Hz interval would re-render the screen 900 times an hour to change nothing.
 */
function useElapsedMinutes(startedAt: string | null): number {
  const startMs = useMemo(() => (startedAt ? new Date(startedAt).getTime() : null), [startedAt]);
  const [minutes, setMinutes] = useState(() =>
    startMs ? Math.floor((Date.now() - startMs) / 60_000) : 0,
  );

  useEffect(() => {
    if (!startMs) return undefined;
    const tick = () => setMinutes(Math.floor((Date.now() - startMs) / 60_000));
    tick();
    const interval = setInterval(tick, 15_000);
    return () => clearInterval(interval);
  }, [startMs]);

  return minutes;
}
