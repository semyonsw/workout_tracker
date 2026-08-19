/**
 * ActiveWorkoutScreen — the screen the app exists for.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  PULL + SWIMMING                 [ Finish ]│   ← header, always visible
 *   │    11 of 18 sets · 42 min                    │
 *   │    ( ▶ START THE CLOCK NOW )                 │   ← re-anchor the session
 *   ├──────────────────────────────────────────────┤
 *   │ Weighted 90° pull-ups                        │   ← expanded
 *   │ 4 × 4–6 reps · last: +40 kg · 4 4            │
 *   │  ↗ SAME +25 KG FOR 23 DAYS · 5 SESSIONS      │
 *   │  1   +40 KG   ×   4 REPS                 (✓) │
 *   │  3   +40 KG   ×   4 REPS                 ( ) │   ← primed, surface-alt
 *   │  + Add set              − Remove set          │
 *   │  Rest 2:00                                    │
 *   │ Wide pull-ups machine                  0/4 ● │   ← collapsed
 *   │ Plank                                  0/3   │
 *   │  1      2:00 MIN                   ( ▶ )( ) │   ← timed: run the clock
 *   │ ( + Add an exercise )                        │   ← anything, mid-workout
 *   └──────────────────────────────────────────────┘
 *              ╭──────────────────────╮
 *              │ 1:28      +15   Skip │                 ← rest, or the set clock
 *              ╰──────────────────────╯
 *
 * NO TAB BAR. The session owns the screen: there is nothing else worth doing
 * mid-set, and a tab bar would put a navigation target a thumb-slip from the ✓.
 *
 * Everything here is composition and wiring: state lives in the store, decisions
 * live in `lib/`. The screen's only real job is to keep the thing the user is
 * doing right now under their thumb.
 *
 * ── THE SESSION IS EDITABLE WHILE IT RUNS ───────────────────────────────────
 *
 * A plan survives contact with the gym for about ten minutes. Three of the four
 * things this screen grew are that admission:
 *
 *   • `+ Add an exercise` at the bottom — pick anything from the library, or create
 *     something that isn't in it yet, and it lands at the end of THIS session with
 *     one set. Neck work at the end of pull day is not a routine edit.
 *   • `− Remove set` beside `Add set` in every card, taking the bottom row; on an
 *     exercise down to one row it takes the exercise.
 *   • LONG PRESS, THEN SLIDE to reorder. The order you planned is not the order the
 *     machines are free in.
 *
 * The fourth is `START THE CLOCK NOW`, and it is a different kind of fix: the
 * header's minutes and every set's `performedAt` are read off one stored instant,
 * so a session opened before the warm-up — or left running while the phone sat in a
 * locker — writes a workout claiming to have taken five hours. One tap re-anchors
 * that instant to now without touching a single logged set.
 *
 * ── HOW THE DRAG WORKS, AND WHY IT IS BUILT THIS WAY ────────────────────────
 *
 * `react-native-gesture-handler` is not a dependency and this is not worth adding
 * one for, so the reorder is plain `PanResponder`, arranged around the one thing
 * that is genuinely awkward without a gesture library: a long press and the slide
 * that follows it are ONE touch, and the press is owned by the card while the slide
 * has to be owned by the list.
 *
 *   1. The long press sets `lifted`. That is a MODE, not a gesture in flight — the
 *      same model the routine editor's reorder uses. So releasing the finger
 *      without moving leaves the card in the air rather than dropping it somewhere
 *      the user never chose, and `Drop` in the header is always a way out.
 *   2. One `PanResponder` wraps the whole list and claims the touch on MOVE, but
 *      only while something is lifted. Before that it claims nothing, so every ✓,
 *      every value cell and the scroll itself behave exactly as they always did.
 *   3. While lifted the cards stop accepting touches entirely (`pointerEvents`),
 *      because a finger sliding a card over a ✓ must not log a set, and the
 *      ScrollView stops scrolling so the two gestures can't fight.
 *   4. The lifted card follows the finger through an `Animated.Value` driven
 *      natively — a `useState` per touch-move would re-render eighteen set rows at
 *      60 Hz to move one card.
 *
 * The drop index is computed from the CARD MIDPOINTS captured on layout, not from
 * a row height: the expanded card is four times the height of a collapsed one, so
 * anything that divides a distance by a constant lands on the wrong exercise.
 *
 * One honest limitation of doing it this way: the list does not scroll while a card
 * is in the air, so a single slide can only reach as far as the finger can. Moving
 * an exercise past the edge of the screen is two moves — drop, scroll, lift again —
 * which is what the mode makes natural, and is the reason `Drop` is always in the
 * header rather than only under the finger.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { ExerciseCard } from '../components/ExerciseCard';
import { FinishSheet } from '../components/FinishSheet';
import { Icon } from '../components/Icon';
import { RestTimerPill } from '../components/RestTimerPill';
import { ScreenHeader } from '../components/ScreenHeader';
import { SetTimerPill } from '../components/SetTimerPill';
import type { DraftSession, DraftSet } from '../lib/draft';
import { commit, tap, undo } from '../lib/feedback';
import { useActiveWorkout, useSessionProgress } from '../state/activeWorkoutStore';
import { useSettings } from '../state/settingsStore';
import { PrimaryButton } from '../components/primitives';
import { palette } from '../theme/tokens';
import type { ID, UnitSystem } from '../types/models';

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
  onFinish: (session: DraftSession) => Promise<void> | void;
  onExit: () => void;
  /**
   * Open the library as a picker for THIS session. Absent = no add button, which
   * is what a caller with nowhere to navigate should get rather than a dead row.
   */
  onAddExercise?: () => void;
}

/** Where a card sits in the scroll, captured on layout. Drives the drop index. */
interface CardLayout {
  y: number;
  height: number;
}

export function ActiveWorkoutScreen({
  unitSystem,
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
  const [confirming, setConfirming] = useState<'finish' | 'clock' | null>(null);

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
  const removeSet = useActiveWorkout((s) => s.removeSet);
  const removeLastSet = useActiveWorkout((s) => s.removeLastSet);
  const moveEntry = useActiveWorkout((s) => s.moveEntry);
  const restartClock = useActiveWorkout((s) => s.restartClock);
  const acceptOverload = useActiveWorkout((s) => s.acceptOverload);
  const dismissOverload = useActiveWorkout((s) => s.dismissOverload);
  const finishSession = useActiveWorkout((s) => s.finishSession);
  const startSetTimer = useActiveWorkout((s) => s.startSetTimer);
  const commitSetTimer = useActiveWorkout((s) => s.commitSetTimer);
  const startRestNow = useActiveWorkout((s) => s.startRestNow);

  /*
   * The live between-sets length, for the card's `Rest` button. Read here rather
   * than from the entry so the label always matches what Settings says right now —
   * which is also what `completeSet` will use.
   */
  const restSeconds = useSettings((s) => s.restSecondsBetweenSets);

  const elapsedMinutes = useElapsedMinutes(session?.startedAt);

  /* --- reorder ------------------------------------------------------- */
  const entryIds = useMemo(
    () => (session?.entries ?? []).map((e) => e.localId),
    [session?.entries],
  );
  const reorder = useCardReorder(entryIds, cardLayouts, moveEntry);
  const { lifted, dragY, panHandlers, lift, drop } = reorder;
  const liftedName = lifted
    ? (session?.entries.find((e) => e.localId === lifted)?.exercise.name ?? '')
    : '';

  /* --- keep the active card in view ---------------------------------- */
  useEffect(() => {
    if (!activeEntryId || lifted) return;
    const layout = cardLayouts.current[activeEntryId];
    if (layout == null) return;
    // -8 so the card header isn't flush against the header hairline.
    scrollRef.current?.scrollTo({ y: Math.max(0, listTop.current + layout.y - 8), animated: true });
  }, [activeEntryId, lifted]);

  /* --- handlers ------------------------------------------------------ */
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

  const commitFinish = useCallback(async () => {
    setConfirming(null);
    const finished = finishSession();
    if (!finished) return;
    await onFinish(finished);
    onExit();
  }, [finishSession, onExit, onFinish]);

  const handleFinish = useCallback(() => {
    if (!session) return;
    // Unlogged sets are an intention, not history. Say so, then let them go.
    if (progress.total - progress.done > 0) {
      setConfirming('finish');
      return;
    }
    void commitFinish();
  }, [commitFinish, progress.done, progress.total, session]);

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

  const dimmed = confirming != null;

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
              : `${progress.done} of ${progress.total} sets · ${elapsedMinutes} min`
          }
          onBack={lifted ? undefined : onExit}
          action={
            lifted
              ? { label: 'Drop', onPress: drop }
              : { label: 'Finish', onPress: handleFinish }
          }
        >
          {/* Re-anchor the clock. A chip rather than a row: it is a correction, so
              it should be reachable without being the second thing on the screen.
              Hidden mid-move — nothing here is about the clock while a card is up. */}
          {lifted ? null : (
            <Pressable
              onPress={() => {
                tap();
                setConfirming('clock');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Start the workout clock now"
              className="mt-sm h-[32px] flex-row items-center self-start rounded-pill border border-hairline bg-surface-alt px-md"
            >
              <Icon name="play" size={11} color={palette.greenBright} />
              <Text className="ml-sm text-micro font-semibold uppercase text-ink-muted">
                Start the clock now
              </Text>
            </Pressable>
          )}
        </ScreenHeader>

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{
            paddingTop: 16,
            // Room for the floating timer pill so it never covers the last row.
            paddingBottom: insets.bottom + 120,
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
            {session.entries.map((entry) => {
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
                  }}
                >
                  <ExerciseCard
                    entry={entry}
                    isActive={entry.localId === activeEntryId}
                    unitSystem={unitSystem}
                    timingSetId={setTimer?.entryId === entry.localId ? setTimer.setId : null}
                    isLifted={isLifted}
                    dimmed={lifted != null && !isLifted}
                    restSeconds={restSeconds}
                    onStartRest={entry.localId === activeEntryId ? startRestNow : undefined}
                    onActivate={() => setActiveEntry(entry.localId)}
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

      {/*
        One pill, two instruments. A set timer outranks rest — you cannot be
        holding and resting, and `startSetTimer` clears rest for that reason.
        Both hide behind a sheet: neither is what's being decided there. They hide
        mid-move too, because the pill sits exactly where a card is being dragged.
      */}
      {dimmed || lifted ? null : setTimer ? <SetTimerPill /> : <RestTimerPill />}

      {confirming === 'finish' ? (
        <FinishSheet
          unloggedCount={progress.total - progress.done}
          loggedCount={progress.done}
          onConfirm={() => void commitFinish()}
          onDismiss={() => setConfirming(null)}
        />
      ) : null}

      {confirming === 'clock' ? (
        <ConfirmSheet
          title="Start the clock now?"
          body={`This workout reads ${elapsedMinutes} min. Starting the clock now makes it 0, and history will record it from this moment — the sets you already logged stay exactly as they are.`}
          confirmLabel="Start now"
          cancelLabel={`Keep ${elapsedMinutes} min`}
          onConfirm={() => {
            commit();
            restartClock();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

interface Reorder {
  /** The card in the air, or null. */
  lifted: ID | null;
  /** Native-driven offset for the lifted card. */
  dragY: Animated.Value;
  /** Where it would land, as an index into the list without it. */
  targetIndex: number;
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
  lift: (entryId: ID) => void;
  drop: () => void;
}

/**
 * Long-press-then-slide reordering, in `PanResponder` and one `Animated.Value`.
 *
 * The refs are not an optimisation: `PanResponder.create` is called once (its
 * handlers close over whatever was in scope then), so every handler reads the
 * CURRENT lift, target and geometry out of a ref rather than a captured value.
 * Rebuilding the responder on each state change instead would drop the gesture
 * mid-drag, because the responder that was granted the touch is the one that no
 * longer exists.
 *
 * `targetIndex` is state as well as a ref because the header reads it. It only
 * changes when the finger crosses a card's midpoint — a handful of renders per
 * drag rather than one per pixel.
 */
function useCardReorder(
  entryIds: readonly ID[],
  layouts: React.MutableRefObject<Record<ID, CardLayout>>,
  moveEntry: (entryId: ID, toIndex: number) => void,
): Reorder {
  const [lifted, setLifted] = useState<ID | null>(null);
  const [targetIndex, setTargetIndex] = useState(0);

  const liftedRef = useRef<ID | null>(null);
  const targetRef = useRef(0);
  const idsRef = useRef(entryIds);
  idsRef.current = entryIds;
  const moveRef = useRef(moveEntry);
  moveRef.current = moveEntry;

  const dragY = useRef(new Animated.Value(0)).current;

  const lift = useCallback(
    (entryId: ID) => {
      commit();
      const index = Math.max(0, idsRef.current.indexOf(entryId));
      liftedRef.current = entryId;
      // The card starts where it already is, so its own index is the first target.
      targetRef.current = index;
      setTargetIndex(index);
      setLifted(entryId);
      dragY.setValue(0);
    },
    [dragY],
  );

  const drop = useCallback(() => {
    const entryId = liftedRef.current;
    liftedRef.current = null;
    dragY.setValue(0);
    setLifted(null);
    if (!entryId) return;
    undo();
    moveRef.current(entryId, targetRef.current);
  }, [dragY]);

  /**
   * Which gap the lifted card is over, counted in cards it has passed.
   *
   * Midpoint comparison rather than distance ÷ row height, because the expanded
   * card is several times taller than a collapsed one. A card whose layout hasn't
   * been measured yet is skipped instead of being treated as being at y = 0, which
   * would drag every drop target to the top of the list.
   */
  const targetFor = useCallback(
    (dy: number): number => {
      const entryId = liftedRef.current;
      if (!entryId) return 0;
      const own = layouts.current[entryId];
      if (!own) return targetRef.current;

      const center = own.y + own.height / 2 + dy;
      let index = 0;
      for (const id of idsRef.current) {
        if (id === entryId) continue;
        const layout = layouts.current[id];
        if (!layout) continue;
        if (layout.y + layout.height / 2 < center) index += 1;
      }
      return index;
    },
    [layouts],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Nothing is claimed until a card is lifted: taps, scrolls and the ✓ all
        // behave exactly as they do when this hook isn't doing anything.
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: () => liftedRef.current != null,
        // Capture, so the list wins the slide even though the card under the finger
        // is what the touch started on.
        onMoveShouldSetPanResponderCapture: () => liftedRef.current != null,
        onPanResponderMove: (_event, gesture) => {
          if (!liftedRef.current) return;
          dragY.setValue(gesture.dy);
          const next = targetFor(gesture.dy);
          if (next !== targetRef.current) {
            targetRef.current = next;
            setTargetIndex(next);
          }
        },
        onPanResponderRelease: () => drop(),
        // A drag cut short by the OS (a call, a notification shade) still has to
        // put the card down somewhere, and where the finger left it is the only
        // honest answer.
        onPanResponderTerminate: () => drop(),
        onPanResponderTerminationRequest: () => false,
      }),
    [dragY, drop, targetFor],
  );

  /* A card that left the session (removed, or the session ended) is not liftable. */
  useEffect(() => {
    if (lifted && !entryIds.includes(lifted)) {
      liftedRef.current = null;
      dragY.setValue(0);
      setLifted(null);
    }
  }, [dragY, entryIds, lifted]);

  return { lifted, dragY, targetIndex, panHandlers: responder.panHandlers, lift, drop };
}

/**
 * Session clock in whole minutes.
 * Ticks every 15 s rather than every second: the header shows minutes, so a
 * 1 Hz interval would re-render the screen 900 times an hour to change nothing.
 */
function useElapsedMinutes(startedAt: string | undefined): number {
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
