/**
 * AppShell — five tabs and a stack, in about a hundred lines of state.
 *
 *   tab:  Today | History | Routines | Library | Settings   ← the roots
 *   stack: session · routineEditor · addExercise · createExercise · exerciseHistory
 *
 * Why not a router library: the app has five roots and five pushable screens, none
 * of them deep-linked, none of them needing URL state. `expo-router` would add a
 * dependency, a file-system convention and a navigator config to express a
 * `Route[]` and two functions. When deep links or a native back-stack are actually
 * needed, every screen below this file is already a plain component taking props
 * and callbacks — they port without edits.
 *
 * The one rule this shell enforces that a router wouldn't: THE TAB BAR DOES NOT
 * EXIST DURING A SESSION. A workout is not a tab.
 *
 * What lives here and what doesn't: the library and the routines moved out to
 * `libraryStore` the moment they became editable — component state that vanishes
 * on a cold launch is not where a user's exercises belong. What is left in this
 * file is navigation, plus the two derived things navigation needs: today's plan
 * and the overload verdicts behind its nudge count.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { TabBar, type TabName } from '../components/TabBar';
import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import {
  CreateExerciseScreen,
  draftToExercise,
  emptyExerciseDraft,
  type ExerciseDraft,
} from '../screens/CreateExerciseScreen';
import { ExerciseHistoryScreen } from '../screens/ExerciseHistoryScreen';
import { ExerciseLibraryScreen, clusterKey, muscleKey } from '../screens/ExerciseLibraryScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen, type TodayPlan } from '../screens/HomeScreen';
import { RoutineEditorScreen } from '../screens/RoutineEditorScreen';
import { RoutineListScreen } from '../screens/RoutineListScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { historyByExerciseId } from '../lib/completedWorkout';
import { MUSCLE_CLUSTER, describeItemsFocus } from '../lib/muscles';
import { evaluateOverloadBatch } from '../lib/progressiveOverload';
import { searchExercises } from '../lib/search';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { routineUsageCount, useLibrary } from '../state/libraryStore';
import { useSettings } from '../state/settingsStore';
import { recentSummaries, useWorkoutHistory } from '../state/workoutHistoryStore';
import {
  seedHistoryByExerciseId,
  seedRecentSessions,
  seedRecentlyUsedExerciseIds,
  seedSplit,
  seedUser,
} from '../data/seed';
import type { Exercise, ID, MuscleGroup } from '../types/models';

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
  const [query, setQuery] = useState('');
  /*
   * Which library sections are open. Held here rather than in the screen so a trip
   * out to `createExercise` and back lands the user in the group they were looking
   * at — the whole flow of "open chest, add an exercise, see it appear" depends on
   * chest still being open when they get back.
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  /** The exercise the user asked to delete, held while the sheet asks. */
  const [deleting, setDeleting] = useState<Exercise | null>(null);

  const exercises = useLibrary((s) => s.exercises);
  const routines = useLibrary((s) => s.routines);
  const addExercise = useLibrary((s) => s.addExercise);
  const deleteExercise = useLibrary((s) => s.deleteExercise);
  const updateRoutine = useLibrary((s) => s.updateRoutine);
  const deleteRoutine = useLibrary((s) => s.deleteRoutine);
  const appendToRoutine = useLibrary((s) => s.appendToRoutine);

  const unitSystem = useSettings((s) => s.unitSystem);

  const session = useActiveWorkout((s) => s.session);
  const startSession = useActiveWorkout((s) => s.startSession);

  const workouts = useWorkoutHistory((s) => s.workouts);
  const saveSession = useWorkoutHistory((s) => s.saveSession);
  const deleteWorkout = useWorkoutHistory((s) => s.deleteWorkout);

  const exercisesById = useMemo<Record<ID, Exercise>>(
    () => Object.fromEntries(exercises.map((e) => [e.id, e])),
    [exercises],
  );
  const routinesById = useMemo(
    () => Object.fromEntries(routines.map((r) => [r.id, r])),
    [routines],
  );

  /** Search results. Browse mode builds its own tree from `exercises`. */
  const matches = useMemo(() => searchExercises(exercises, query), [exercises, query]);

  const recentlyUsed = useMemo(
    () =>
      seedRecentlyUsedExerciseIds
        .map((id) => exercisesById[id])
        .filter((e): e is Exercise => e != null),
    [exercisesById],
  );

  const top = stack[stack.length - 1] ?? null;
  const push = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
   * A session claims the screen exactly ONCE per session — on the render after it
   * is started, and on the render after `persist` rehydrates one from a crash or a
   * force-quit mid-workout.
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

  /* --- derived: history, today's plan, the nudge count ----------------- */
  /*
   * Everything that reads history reads THIS, not the seed fixture.
   *
   * The sets the user has actually logged are merged on top of the shipped
   * fixture, so a workout finished five minutes ago is what the next session
   * prefills from, what the overload engine judges, and what the exercise-history
   * chart plots. Before this, finishing a workout changed nothing anywhere: the
   * next session offered the same prefills and the same nudges, which made the
   * app's one job — noticing that a weight has gone stale — impossible.
   */
  const historyById = useMemo(
    () => historyByExerciseId(workouts, seedHistoryByExerciseId),
    [workouts],
  );

  /** Real workouts if there are any; the shipped examples until then. */
  const recent = useMemo(
    () => (workouts.length > 0 ? recentSummaries(workouts) : seedRecentSessions),
    [workouts],
  );

  const verdicts = useMemo(
    () =>
      evaluateOverloadBatch(exercises, historyById, {
        policy: seedUser.overloadPolicy,
        unitSystem,
      }),
    [exercises, historyById, unitSystem],
  );

  const today = useMemo<TodayPlan | null>(() => {
    const day = seedSplit.days.find((d) => d.order === seedSplit.cursor);
    const routine = day?.routineId ? routinesById[day.routineId] : undefined;
    if (!routine) return null;

    const items = routine.items.filter((item) => exercisesById[item.exerciseId]);
    return {
      routineId: routine.id,
      name: routine.name,
      focus: describeItemsFocus(items, exercisesById),
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
       * A live session is never clobbered. If one exists — the user backed out of
       * it and hit Start again — this returns to it rather than rebuilding the
       * draft, which would silently discard everything already logged.
       */
      if (session) {
        push({ name: 'session' });
        return;
      }

      const routine = routinesById[routineId];
      if (!routine) return;

      /*
       * A routine whose every exercise has been deleted builds a session with no
       * entries: a logging screen with nothing to log and a Finish button that
       * saves nothing. Refuse it and send the user to the editor instead, which is
       * where the problem actually is.
       */
      const hasWork = routine.items.some((item) => exercisesById[item.exerciseId]);
      if (!hasWork) {
        push({ name: 'routineEditor', routineId });
        return;
      }

      const settings = useSettings.getState();
      // The push is left to the resume effect above, which fires for the new
      // session's localId — one code path for "started" and "rehydrated".
      startSession({
        routine,
        exercisesById,
        historyByExerciseId: historyById,
        policy: seedUser.overloadPolicy,
        unitSystem: settings.unitSystem,
        defaultRestSeconds: settings.restSecondsBetweenSets,
        defaultTransitionRestSeconds: settings.restSecondsBetweenExercises,
      });
    },
    [exercisesById, historyById, push, routinesById, session, startSession],
  );

  /**
   * Open the create flow, optionally pre-filed under a muscle group.
   *
   * Also opens that group's disclosure, so the new exercise is visible the moment
   * the user is dropped back on the library rather than hidden behind a chevron
   * they have to remember to tap.
   */
  const handleCreate = useCallback(
    (name: string, muscle?: MuscleGroup) => {
      if (muscle) {
        const cluster = MUSCLE_CLUSTER[muscle];
        setExpanded((current) => new Set(current).add(muscleKey(muscle)).add(clusterKey(cluster)));
      }
      push({ name: 'createExercise', draft: emptyExerciseDraft(name, muscle) });
    },
    [push],
  );

  /* ------------------------------------------------------------------ */
  /* Pushed screens                                                      */
  /* ------------------------------------------------------------------ */

  if (top?.name === 'session') {
    return (
      <View className="flex-1 bg-bg">
        {/* No TabBar. See the file header. */}
        <ActiveWorkoutScreen
          unitSystem={unitSystem}
          policy={seedUser.overloadPolicy}
          onFinish={(finished) => {
            /*
             * The one write to permanent history. Everything downstream —
             * the History tab, the prefills, the overload verdicts — reads what
             * this stores; nothing else in the app writes a logged set.
             *
             * A session with nothing logged stores nothing (`saveSession` returns
             * null), so "start a workout, change your mind, finish" leaves no row
             * claiming a workout happened.
             */
            saveSession(finished);
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
          updateRoutine(routine.id, { name, items });
          pop();
        }}
        onOpenItem={(item) => push({ name: 'exerciseHistory', exerciseId: item.exerciseId })}
        onAddExercise={() => push({ name: 'addExercise', routineId: routine.id })}
        onDelete={() => {
          deleteRoutine(routine.id);
          pop();
        }}
      />
    );
  }

  if (top?.name === 'addExercise') {
    const routineId = top.routineId;
    return (
      <LibraryTab
        query={query}
        exercises={exercises}
        matches={matches}
        recentlyUsed={recentlyUsed}
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        onBack={pop}
        onChangeQuery={setQuery}
        onPick={(exerciseId) => {
          if (!routineId) return push({ name: 'exerciseHistory', exerciseId });
          appendToRoutine(routineId, exerciseId);
          return pop();
        }}
        onCreate={handleCreate}
        onDelete={setDeleting}
        deleting={deleting}
        onCancelDelete={() => setDeleting(null)}
        onConfirmDelete={deleteExercise}
        routineUses={(id) => routineUsageCount(routines, id)}
      />
    );
  }

  if (top?.name === 'createExercise') {
    return (
      <CreateExerciseScreen
        initial={top.draft}
        onBack={pop}
        onCreate={(draft) => {
          addExercise(draftToExercise(draft, `ex_${Date.now().toString(36)}`, seedUser.id));
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
        history={historyById[exercise.id] ?? []}
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
            recent={recent}
            onStart={handleStart}
            onSelectDay={(day) => {
              if (day.routineId) push({ name: 'routineEditor', routineId: day.routineId });
            }}
            // A past session opens where past sessions live. The History row is
            // the detail view — it expands in place — so there is nothing to push.
            onOpenSession={() => setTab('History')}
          />
        ) : null}

        {tab === 'History' ? (
          <HistoryScreen workouts={workouts} onDelete={deleteWorkout} />
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
          <LibraryTab
            query={query}
            exercises={exercises}
            matches={matches}
            recentlyUsed={recentlyUsed}
            expanded={expanded}
            onToggleExpanded={toggleExpanded}
            onChangeQuery={setQuery}
            onPick={(exerciseId) => push({ name: 'exerciseHistory', exerciseId })}
            onCreate={handleCreate}
            onDelete={setDeleting}
            deleting={deleting}
            onCancelDelete={() => setDeleting(null)}
            onConfirmDelete={deleteExercise}
            routineUses={(id) => routineUsageCount(routines, id)}
          />
        ) : null}

        {tab === 'Settings' ? <SettingsScreen /> : null}
      </View>

      <TabBar active={tab} onSelect={setTab} />
    </View>
  );
}

/* ------------------------------------------------------------------ */

type LibraryProps = React.ComponentProps<typeof ExerciseLibraryScreen>;

/**
 * The library plus its delete confirmation.
 *
 * Wrapped rather than inlined because the library appears in two places — the tab
 * root and the picker pushed from a routine editor — and the confirmation has to
 * behave identically in both. Deleting an exercise edits every routine that holds
 * it, so the sheet's copy is written HERE, where the routine count is known,
 * rather than in a screen whose job is to render a list.
 */
function LibraryTab({
  deleting,
  onCancelDelete,
  onConfirmDelete,
  routineUses,
  ...libraryProps
}: LibraryProps & {
  deleting: Exercise | null;
  onCancelDelete: () => void;
  onConfirmDelete: (exerciseId: ID) => void;
  routineUses: (exerciseId: ID) => number;
}) {
  const uses = deleting ? routineUses(deleting.id) : 0;

  return (
    <View className="flex-1">
      <View className="flex-1" style={deleting ? { opacity: 0.28 } : undefined}>
        <ExerciseLibraryScreen {...libraryProps} />
      </View>

      {deleting ? (
        <ConfirmSheet
          title={`Delete “${deleting.name}”?`}
          body={[
            uses > 0
              ? `It's in ${uses} ${uses === 1 ? 'routine' : 'routines'}, and will be removed from ${uses === 1 ? 'it' : 'them'}.`
              : "It isn't in any routine.",
            'Sets you already logged stay in your history.',
          ].join(' ')}
          confirmLabel="Delete it"
          cancelLabel="Keep it"
          onConfirm={() => {
            onConfirmDelete(deleting.id);
            onCancelDelete();
          }}
          onCancel={onCancelDelete}
        />
      ) : null}
    </View>
  );
}

/** A pushed route whose subject was deleted underneath it. */
function Fallback({ onBack }: { onBack: () => void }) {
  useEffect(() => onBack(), [onBack]);
  return <View className="flex-1 bg-bg" />;
}
