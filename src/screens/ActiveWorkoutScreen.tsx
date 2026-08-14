/**
 * ActiveWorkoutScreen — the screen the app exists for.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  PULL + SWIMMING                 [ Finish ]│   ← header, always visible
 *   │    11 of 18 sets · 42 min                    │
 *   ├──────────────────────────────────────────────┤
 *   │ Weighted 90° pull-ups                        │   ← expanded
 *   │ 4 × 4–6 reps · last: +40 kg · 4 4            │
 *   │  ↗ SAME +25 KG FOR 23 DAYS · 5 SESSIONS      │
 *   │  1   +40 KG   ×   4 REPS                 (✓) │
 *   │  3   +40 KG   ×   4 REPS                 ( ) │   ← primed, surface-alt
 *   │  + Add set                                   │
 *   │ Wide pull-ups machine                  0/4 ● │   ← collapsed
 *   │ Plank                                  0/3   │
 *   │  1      2:00 MIN                   ( ▶ )( ) │   ← timed: run the clock
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
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ExerciseCard } from '../components/ExerciseCard';
import { FinishSheet } from '../components/FinishSheet';
import { RestTimerPill } from '../components/RestTimerPill';
import { ScreenHeader } from '../components/ScreenHeader';
import { SetTimerPill } from '../components/SetTimerPill';
import { draftToSetHistory, totalVolumeKg, type DraftSet } from '../lib/draft';
import { useActiveWorkout, selectProgress } from '../state/activeWorkoutStore';
import type { ID, OverloadPolicy, UnitSystem } from '../types/models';

interface ActiveWorkoutScreenProps {
  unitSystem: UnitSystem;
  policy: OverloadPolicy;
  /** Persist the finished session; navigation happens after it resolves. */
  onFinish: (payload: {
    setHistory: ReturnType<typeof draftToSetHistory>;
    totalVolumeKg: number;
  }) => Promise<void> | void;
  onExit: () => void;
}

export function ActiveWorkoutScreen({
  unitSystem,
  policy,
  onFinish,
  onExit,
}: ActiveWorkoutScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  /** y offset of each card, captured on layout, for auto-scroll. */
  const cardOffsets = useRef<Record<ID, number>>({});
  const [confirmingFinish, setConfirmingFinish] = useState(false);

  /* --- store bindings: one selector per slice, never the whole store --- */
  const session = useActiveWorkout((s) => s.session);
  const activeEntryId = useActiveWorkout((s) => s.activeEntryId);
  const progress = useActiveWorkout(selectProgress);
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
  const acceptOverload = useActiveWorkout((s) => s.acceptOverload);
  const dismissOverload = useActiveWorkout((s) => s.dismissOverload);
  const finishSession = useActiveWorkout((s) => s.finishSession);
  const startSetTimer = useActiveWorkout((s) => s.startSetTimer);
  const commitSetTimer = useActiveWorkout((s) => s.commitSetTimer);

  const elapsedMinutes = useElapsedMinutes(session?.startedAt);

  /* --- keep the active card in view ---------------------------------- */
  useEffect(() => {
    if (!activeEntryId) return;
    const y = cardOffsets.current[activeEntryId];
    if (y == null) return;
    // -8 so the card header isn't flush against the header hairline.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, [activeEntryId]);

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
    setConfirmingFinish(false);
    const finished = finishSession();
    if (!finished) return;
    await onFinish({
      setHistory: draftToSetHistory(finished),
      totalVolumeKg: totalVolumeKg(finished),
    });
    onExit();
  }, [finishSession, onExit, onFinish]);

  const handleFinish = useCallback(() => {
    if (!session) return;
    // Unlogged sets are an intention, not history. Say so, then let them go.
    if (progress.total - progress.done > 0) {
      setConfirmingFinish(true);
      return;
    }
    void commitFinish();
  }, [commitFinish, progress.done, progress.total, session]);

  /* --- empty state ---------------------------------------------------- */
  if (!session) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-xl">
        <Text className="text-body text-ink-muted">No workout in progress</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      {/* The list dims behind the finish sheet rather than being replaced — the
          user is confirming something about THIS list, and should still see it. */}
      <View className="flex-1" style={confirmingFinish ? { opacity: 0.28 } : undefined}>
        <ScreenHeader
          kicker={session.title}
          subtitle={`${progress.done} of ${progress.total} sets · ${elapsedMinutes} min`}
          onBack={onExit}
          action={{ label: 'Finish', onPress: handleFinish }}
        />

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
          scrollEnabled={!confirmingFinish}
        >
          {session.entries.map((entry) => (
            <View
              key={entry.localId}
              onLayout={(e) => {
                cardOffsets.current[entry.localId] = e.nativeEvent.layout.y;
              }}
            >
              <ExerciseCard
                entry={entry}
                isActive={entry.localId === activeEntryId}
                unitSystem={unitSystem}
                policyIncrementKg={policy.incrementKg}
                timingSetId={setTimer?.entryId === entry.localId ? setTimer.setId : null}
                onActivate={() => setActiveEntry(entry.localId)}
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
                onAcceptOverload={() => acceptOverload(entry.localId)}
                onDismissOverload={() => dismissOverload(entry.localId)}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      {/*
        One pill, two instruments. A set timer outranks rest — you cannot be
        holding and resting, and `startSetTimer` clears rest for that reason.
        Both hide behind the finish sheet: neither is what's being decided there.
      */}
      {confirmingFinish ? null : setTimer ? <SetTimerPill /> : <RestTimerPill />}

      {confirmingFinish ? (
        <FinishSheet
          unloggedCount={progress.total - progress.done}
          loggedCount={progress.done}
          onConfirm={() => void commitFinish()}
          onDismiss={() => setConfirmingFinish(false)}
        />
      ) : null}
    </View>
  );
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
