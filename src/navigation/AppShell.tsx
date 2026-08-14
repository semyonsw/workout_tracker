/**
 * AppShell — three tabs and a stack, in about a hundred lines of state.
 *
 *   tab:  Today  |  Routines  |  Library          ← the roots
 *   stack: session · routineEditor · addExercise · createExercise · history
 *
 * Why not a router library: the app has three roots and five pushable screens,
 * none of them deep-linked, none of them needing URL state. `expo-router` would
 * add a dependency, a file-system convention and a navigator config to express a
 * `Route[]` and two functions. When deep links or a native back-stack are
 * actually needed, every screen below this file is already a plain component
 * taking props and callbacks — they port without edits.
 *
 * The one rule this shell enforces that a router wouldn't: THE TAB BAR DOES NOT
 * EXIST DURING A SESSION. A workout is not a tab.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { TabBar, type TabName } from '../components/TabBar';
import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import {
  CreateExerciseScreen,
  draftToExercise,
  emptyExerciseDraft,
  type ExerciseDraft,
} from '../screens/CreateExerciseScreen';
import { ExerciseHistoryScreen } from '../screens/ExerciseHistoryScreen';
import { ExerciseLibraryScreen } from '../screens/ExerciseLibraryScreen';
import { HomeScreen, type TodayPlan } from '../screens/HomeScreen';
import { RoutineEditorScreen } from '../screens/RoutineEditorScreen';
import { RoutineListScreen } from '../screens/RoutineListScreen';
import { evaluateOverloadBatch } from '../lib/progressiveOverload';
import { searchExercises } from '../lib/search';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import {
  seedExercises,
  seedHistoryByExerciseId,
  seedRecentSessions,
  seedRecentlyUsedExerciseIds,
  seedRoutines,
  seedSplit,
  seedUser,
} from '../data/seed';
import type { Exercise, ID, Routine } from '../types/models';

/** Screens pushed on top of a tab. `session` is pushed and owns the screen. */
type Route =
  | { name: 'session' }
  | { name: 'routineEditor'; routineId: ID }
  | { name: 'addExercise'; routineId: ID | null }
  | { name: 'createExercise'; draft: ExerciseDraft }
  | { name: 'exerciseHistory'; exerciseId: ID };

export function AppShell() {
  const [tab, setTab] = useState<TabName>('Today');
  const [stack, setStack] = useState<Route[]>([]);
  const [query, setQuery] = useState('pull');

  /*
   * Library and routines are local state here only because there is no database
   * yet. Each of these becomes a query the day `src/db` is wired up, and nothing
   * below this file changes.
   */
  const [exercises, setExercises] = useState<Exercise[]>(seedExercises);
  const [routines, setRoutines] = useState<Routine[]>(seedRoutines);

  const session = useActiveWorkout((s) => s.session);
  const startSession = useActiveWorkout((s) => s.startSession);

  const exercisesById = useMemo<Record<ID, Exercise>>(
    () => Object.fromEntries(exercises.map((e) => [e.id, e])),
    [exercises],
  );
  const routinesById = useMemo<Record<ID, Routine>>(
    () => Object.fromEntries(routines.map((r) => [r.id, r])),
    [routines],
  );

  const top = stack[stack.length - 1] ?? null;
  const push = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  /* Android hardware back pops the stack before it leaves the app. */
  useEffect(() => {
    if (stack.length === 0) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      pop();
      return true;
    });
    return () => sub.remove();
  }, [pop, stack.length]);

  /*
   * A session claims the screen exactly ONCE per session — on the render after
   * it is started, and on the render after `persist` rehydrates one from a crash
   * or a force-quit mid-workout.
   *
   * Keyed on `localId` rather than on truthiness, because "a session exists" is
   * also true after the user has deliberately backed out of it, and re-pushing
   * there would trap them on the logging screen.
   */
  const claimedSessionId = useRef<string | null>(null);
  useEffect(() => {
    if (!session) {
      claimedSessionId.current = null;
      return;
    }
    if (claimedSessionId.current === session.localId) return;
    claimedSessionId.current = session.localId;
    push({ name: 'session' });
  }, [push, session]);

  /* --- derived: today's plan and the nudge count ---------------------- */
  const verdicts = useMemo(
    () =>
      evaluateOverloadBatch(exercises, seedHistoryByExerciseId, {
        policy: seedUser.overloadPolicy,
        unitSystem: seedUser.unitSystem,
      }),
    [exercises],
  );

  const today = useMemo<TodayPlan | null>(() => {
    const day = seedSplit.days.find((d) => d.order === seedSplit.cursor);
    const routine = day?.routineId ? routinesById[day.routineId] : undefined;
    if (!routine) return null;

    const items = routine.items.filter((item) => exercisesById[item.exerciseId]);
    return {
      routineId: routine.id,
      name: routine.name,
      exerciseCount: items.length,
      setCount: items.reduce((total, item) => total + item.targetSets, 0),
      // Only counts what the engine would actually surface — an exercise with no
      // load can never contribute a nudge.
      nudgeCount: items.filter((item) => verdicts[item.exerciseId]?.shouldNudge).length,
    };
  }, [exercisesById, routinesById, verdicts]);

  const handleStart = useCallback(
    (routineId: ID) => {
      /*
       * A live session is never clobbered. If one exists — the user backed out
       * of it and hit Start again — this returns to it rather than rebuilding
       * the draft, which would silently discard everything already logged.
       */
      if (session) {
        push({ name: 'session' });
        return;
      }

      const routine = routinesById[routineId];
      if (!routine) return;
      // The push is left to the resume effect above, which fires for the new
      // session's localId — one code path for "started" and "rehydrated".
      startSession({
        routine,
        exercisesById,
        historyByExerciseId: seedHistoryByExerciseId,
        policy: seedUser.overloadPolicy,
        unitSystem: seedUser.unitSystem,
        defaultRestSeconds: seedUser.defaultRestSeconds,
      });
    },
    [exercisesById, push, routinesById, session, startSession],
  );

  /* ------------------------------------------------------------------ */
  /* Pushed screens                                                      */
  /* ------------------------------------------------------------------ */

  if (top?.name === 'session') {
    return (
      <View className="flex-1 bg-bg">
        {/* No TabBar. See the file header. */}
        <ActiveWorkoutScreen
          unitSystem={seedUser.unitSystem}
          policy={seedUser.overloadPolicy}
          onFinish={async ({ setHistory, totalVolumeKg }) => {
            // TODO: persist via Drizzle, then advance the split cursor.
            console.log(`Saved ${setHistory.length} sets · ${totalVolumeKg} kg volume`);
          }}
          onExit={pop}
        />
      </View>
    );
  }

  if (top?.name === 'routineEditor') {
    const routine = routinesById[top.routineId];
    if (!routine) return <Fallback onBack={pop} />;
    return (
      <RoutineEditorScreen
        routine={routine}
        exercisesById={exercisesById}
        onBack={pop}
        onSave={({ name, items }) => {
          setRoutines((all) =>
            all.map((r) => (r.id === routine.id ? { ...r, name, items, updatedAt: nowIso() } : r)),
          );
          pop();
        }}
        onOpenItem={(item) => push({ name: 'exerciseHistory', exerciseId: item.exerciseId })}
        onAddExercise={() => push({ name: 'addExercise', routineId: routine.id })}
        onDelete={() => {
          setRoutines((all) => all.filter((r) => r.id !== routine.id));
          pop();
        }}
      />
    );
  }

  if (top?.name === 'addExercise') {
    const routineId = top.routineId;
    return (
      <ExerciseLibraryScreen
        query={query}
        matches={searchExercises(exercises, query)}
        recentlyUsed={seedRecentlyUsedExerciseIds
          .map((id) => exercisesById[id])
          .filter((e): e is Exercise => e != null)}
        onBack={pop}
        onChangeQuery={setQuery}
        onPick={(exerciseId) => {
          if (!routineId) return push({ name: 'exerciseHistory', exerciseId });
          appendToRoutine(setRoutines, routineId, exerciseId);
          return pop();
        }}
        onCreate={(name) => push({ name: 'createExercise', draft: emptyExerciseDraft(name) })}
      />
    );
  }

  if (top?.name === 'createExercise') {
    return (
      <CreateExerciseScreen
        initial={top.draft}
        onBack={pop}
        onCreate={(draft) => {
          const created = draftToExercise(draft, `ex_${Date.now().toString(36)}`, seedUser.id);
          setExercises((all) => [...all, created]);
          pop();
        }}
      />
    );
  }

  if (top?.name === 'exerciseHistory') {
    const exercise = exercisesById[top.exerciseId];
    if (!exercise) return <Fallback onBack={pop} />;
    return (
      <ExerciseHistoryScreen
        exercise={exercise}
        history={seedHistoryByExerciseId[exercise.id] ?? []}
        verdict={verdicts[exercise.id]}
        onBack={pop}
      />
    );
  }

  /* ------------------------------------------------------------------ */
  /* Tab roots                                                           */
  /* ------------------------------------------------------------------ */

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      <View className="flex-1">
        {tab === 'Today' ? (
          <HomeScreen
            split={seedSplit}
            today={today}
            recent={seedRecentSessions}
            onStart={handleStart}
            onSelectDay={(day) => {
              if (day.routineId) push({ name: 'routineEditor', routineId: day.routineId });
            }}
            onOpenSession={() => {
              // TODO: a past-session detail screen; not one of the 14 frames.
            }}
          />
        ) : null}

        {tab === 'Routines' ? (
          <RoutineListScreen
            routines={routines}
            exercisesById={exercisesById}
            onOpen={(routineId) => push({ name: 'routineEditor', routineId })}
            onCreate={() => {
              // TODO: create-routine flow; not one of the 14 frames.
            }}
          />
        ) : null}

        {tab === 'Library' ? (
          <ExerciseLibraryScreen
            query={query}
            matches={searchExercises(exercises, query)}
            recentlyUsed={seedRecentlyUsedExerciseIds
              .map((id) => exercisesById[id])
              .filter((e): e is Exercise => e != null)}
            onChangeQuery={setQuery}
            onPick={(exerciseId) => push({ name: 'exerciseHistory', exerciseId })}
            onCreate={(name) => push({ name: 'createExercise', draft: emptyExerciseDraft(name) })}
          />
        ) : null}
      </View>

      <TabBar active={tab} onSelect={setTab} />
    </View>
  );
}

/* ------------------------------------------------------------------ */

/** Appends an exercise to a routine with sane defaults from the exercise itself. */
function appendToRoutine(
  setRoutines: React.Dispatch<React.SetStateAction<Routine[]>>,
  routineId: ID,
  exerciseId: ID,
) {
  setRoutines((all) =>
    all.map((routine) =>
      routine.id === routineId
        ? {
            ...routine,
            items: [
              ...routine.items,
              {
                id: `ri_${Date.now().toString(36)}`,
                exerciseId,
                order: routine.items.length,
                targetSets: 4,
                targetRepsMax: 10,
              },
            ],
          }
        : routine,
    ),
  );
}

/** Isolated so the rest of this file stays free of ambient clock reads. */
function nowIso(): string {
  return new Date().toISOString();
}

/** A pushed route whose subject was deleted underneath it. */
function Fallback({ onBack }: { onBack: () => void }) {
  useEffect(() => onBack(), [onBack]);
  return <View className="flex-1 bg-bg" />;
}
