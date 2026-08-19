/**
 * AppShell — five tabs and a stack, in about a hundred lines of state.
 *
 *   tab:  Today | History | Routines | Library | Settings   ← the roots
 *   stack: session · routineEditor · addExercise · createExercise · editExercise
 *          · exerciseHistory · backup
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
import { BackHandler, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { PrimaryButton } from '../components/primitives';
import { TabBar, type TabName } from '../components/TabBar';
import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import { CreateExerciseScreen } from '../screens/CreateExerciseScreen';
import { ExerciseHistoryScreen } from '../screens/ExerciseHistoryScreen';
import { ExerciseLibraryScreen, clusterKey, muscleKey } from '../screens/ExerciseLibraryScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen, type RoutineChoice, type TodayPlan } from '../screens/HomeScreen';
import { RoutineEditorScreen } from '../screens/RoutineEditorScreen';
import { RoutineListScreen } from '../screens/RoutineListScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { BackupScreen } from '../screens/BackupScreen';
import { historyByExerciseId, recentlyUsedExerciseIds } from '../lib/completedWorkout';
import { buildDraftEntry, defaultTargetCount } from '../lib/draft';
import {
  applyDraftToExercise,
  draftToExercise,
  emptyExerciseDraft,
  exerciseToDraft,
  type ExerciseDraft,
} from '../lib/exerciseDraft';
import { MUSCLE_CLUSTER, describeItemsFocus } from '../lib/muscles';
import { evaluateOverloadBatch } from '../lib/progressiveOverload';
import { searchExercises } from '../lib/search';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { routineUsageCount, useLibrary } from '../state/libraryStore';
import { useSettings } from '../state/settingsStore';
import { recentSummaries, useWorkoutHistory } from '../state/workoutHistoryStore';
import { seedSplit, seedUser } from '../data/seed';
import type { Exercise, ID, MuscleGroup, SplitDay } from '../types/models';

/** Screens pushed on top of a tab. `session` is pushed and owns the screen. */
type Route =
  | { name: 'session' }
  | {
      name: 'routineEditor';
      routineId: ID;
      /**
       * This routine was created by opening this screen, so backing out without
       * putting anything in it should not leave it behind. See `handleLeaveEditor`.
       */
      isNew?: boolean;
    }
  | {
      name: 'addExercise';
      routineId: ID | null;
      /**
       * Where the picked exercise goes. `session` appends it to the WORKOUT IN
       * FLIGHT with one set — the neck work decided on halfway through pull day —
       * rather than editing any routine. Same picker, same create flow underneath;
       * only the destination differs, which is why this is a field and not a
       * second screen.
       */
      target?: 'routine' | 'session';
    }
  | {
      name: 'createExercise';
      draft: ExerciseDraft;
      /** Created FROM the session picker: add it to the library, then to the workout. */
      addToSession?: boolean;
    }
  | { name: 'editExercise'; exerciseId: ID }
  | { name: 'exerciseHistory'; exerciseId: ID }
  | { name: 'backup' };

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
  const updateExercise = useLibrary((s) => s.updateExercise);
  const deleteExercise = useLibrary((s) => s.deleteExercise);
  const createRoutine = useLibrary((s) => s.createRoutine);
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

  /** The library's `RECENTLY USED` card — from what was actually trained. */
  const recentlyUsed = useMemo(
    () =>
      recentlyUsedExerciseIds(workouts)
        .map((id) => exercisesById[id])
        .filter((e): e is Exercise => e != null),
    [exercisesById, workouts],
  );

  const top = stack[stack.length - 1] ?? null;
  const push = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  /**
   * Back to the logging screen, however many screens deep the detour went.
   *
   * Adding an exercise mid-workout can be one screen (pick it) or two (pick a
   * muscle group, create it), and both end the same way: the user is holding a
   * barbell and wants the set rows back. Popping a fixed number of screens would
   * be right for exactly one of the two paths.
   */
  const popToSession = useCallback(
    () =>
      setStack((s) => {
        const index = s.findIndex((route) => route.name === 'session');
        return index === -1 ? [] : s.slice(0, index + 1);
      }),
    [],
  );
  /** Filled in below, once the editor's exit rule exists. See `leaveTop`. */
  const leaveRoutineEditor = useRef<(route: { routineId: ID; isNew?: boolean }) => void>(pop);

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /**
   * Leaving the top screen, by either route out of it.
   *
   * Declared before the back handler so hardware back and the `‹` chevron go
   * through the SAME path — otherwise the two gestures leave different state
   * behind, which is the kind of difference nobody finds until it has already lost
   * something.
   */
  const leaveTop = useRef<() => void>(pop);
  leaveTop.current = () => {
    const route = stack[stack.length - 1];
    if (route?.name === 'routineEditor') {
      leaveRoutineEditor.current(route);
      return;
    }
    pop();
  };

  /* Android hardware back pops the stack before it leaves the app. */
  useEffect(() => {
    if (stack.length === 0) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveTop.current();
      return true;
    });
    return () => sub.remove();
  }, [stack.length]);

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

  /* --- derived: history, the choices, the nudge count ------------------- */
  /*
   * Everything that reads history reads THIS — and history is now ONLY what the
   * user logged. The shipped fixture sessions are gone (see `src/data/seed.ts`):
   * a fresh install used to open on four workouts nobody did, a chart of someone
   * else's pull-downs, and nudges about weights never lifted, none of it
   * distinguishable from real data. What remains is a `CompletedWorkout[]` on
   * disk, flattened to the shape the prefills, the overload engine and the
   * exercise chart all want.
   */
  const historyById = useMemo(() => historyByExerciseId(workouts), [workouts]);

  const recent = useMemo(() => recentSummaries(workouts), [workouts]);

  const verdicts = useMemo(
    () =>
      evaluateOverloadBatch(exercises, historyById, {
        policy: seedUser.overloadPolicy,
        unitSystem,
      }),
    [exercises, historyById, unitSystem],
  );

  /** Every routine, described well enough to pick one without opening it. */
  const choices = useMemo<RoutineChoice[]>(
    () =>
      routines.map((routine) => {
        const items = routine.items.filter((item) => exercisesById[item.exerciseId]);
        return {
          routineId: routine.id,
          name: routine.name,
          focus: describeItemsFocus(items, exercisesById),
          exerciseCount: items.length,
          setCount: items.reduce((total, item) => total + item.targetSets, 0),
        };
      }),
    [exercisesById, routines],
  );

  /**
   * What the split SUGGESTS today. A suggestion, not an assignment: the home
   * screen lists `choices` underneath it, and either can be started.
   */
  const today = useMemo<TodayPlan | null>(() => {
    const day = seedSplit.days.find((d) => d.order === seedSplit.cursor);
    const routine = day?.routineId ? routinesById[day.routineId] : undefined;
    if (!routine) return null;

    const choice = choices.find((c) => c.routineId === routine.id);
    if (!choice) return null;

    const items = routine.items.filter((item) => exercisesById[item.exerciseId]);
    return {
      ...choice,
      // Only counts what the engine would actually surface — an exercise with no
      // load can never contribute a nudge.
      nudgeCount: items.filter((item) => verdicts[item.exerciseId]?.shouldNudge).length,
    };
  }, [choices, exercisesById, routinesById, verdicts]);

  /**
   * Split days whose routine has been deleted.
   *
   * The split stores a `routineId` and the label lives beside it, so deleting a
   * routine leaves a day still labelled `Pull` that resolves to nothing. Tapping
   * one used to push the routine editor, which immediately popped itself — the
   * screen "blinked" and nothing happened. The timeline now shows these days as
   * empty, and `onSelectDay` sends them somewhere real.
   */
  const emptyDayIds = useMemo(
    () =>
      new Set(
        seedSplit.days
          .filter((day) => day.kind === 'routine' && !(day.routineId && routinesById[day.routineId]))
          .map((day) => day.id),
      ),
    [routinesById],
  );

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
   * Tapping a day on the split strip.
   *
   * Never pushes a route whose subject is missing. A day whose routine was deleted
   * used to push the editor, which mounted, found nothing, and popped itself in an
   * effect — a screen that blinked and left the user where they started, with no
   * explanation. It goes to the Routines tab instead, which is where the routine
   * would be if it existed and where a replacement gets made.
   */
  const handleSelectDay = useCallback(
    (day: SplitDay) => {
      const routine = day.routineId ? routinesById[day.routineId] : undefined;
      if (routine) {
        push({ name: 'routineEditor', routineId: routine.id });
        return;
      }
      // A rest day has nothing to show; a deleted one has somewhere to send you.
      if (day.kind === 'routine') setTab('Routines');
    },
    [push, routinesById],
  );

  /**
   * `+ Add routine`.
   *
   * This button did nothing at all — it was wired to an empty handler with a TODO
   * in it, so tapping it was indistinguishable from a dead app. There is no
   * separate create-routine screen and there does not need to be: the editor
   * already owns the name, the exercise list and the order, so creating one is
   * "make an empty routine, then open the thing that edits routines".
   *
   * The routine is created BEFORE the editor opens rather than on Save, because
   * adding an exercise writes straight to the store (`appendToRoutine`), which
   * needs a routine to write into. `handleLeaveEditor` is what keeps that from
   * littering the list.
   */
  const handleAddRoutine = useCallback(() => {
    const routine = createRoutine();
    push({ name: 'routineEditor', routineId: routine.id, isNew: true });
  }, [createRoutine, push]);

  /**
   * Leaving the routine editor.
   *
   * A routine that was just created and still has nothing in it is a cancelled
   * create, not a routine — so it is removed on the way out. One with exercises in
   * it survives: those were already committed to the store when they were added,
   * and silently discarding them would be worse than an unsaved name.
   */
  const handleLeaveEditor = useCallback(
    (route: { routineId: ID; isNew?: boolean }) => {
      const routine = routinesById[route.routineId];
      if (route.isNew && routine && routine.items.length === 0) deleteRoutine(route.routineId);
      pop();
    },
    [deleteRoutine, pop, routinesById],
  );
  // Held in a ref so the back handler above — which is set up before this exists —
  // always calls the current one rather than a stale closure.
  leaveRoutineEditor.current = handleLeaveEditor;

  /**
   * Open the create flow, optionally pre-filed under a muscle group.
   *
   * Also opens that group's disclosure, so the new exercise is visible the moment
   * the user is dropped back on the library rather than hidden behind a chevron
   * they have to remember to tap.
   */
  const handleCreate = useCallback((name: string, muscle?: MuscleGroup) => {
    if (muscle) {
      const cluster = MUSCLE_CLUSTER[muscle];
      setExpanded((current) => new Set(current).add(muscleKey(muscle)).add(clusterKey(cluster)));
    }
    /*
     * Pushed through the updater rather than through `push`, so the route can read
     * what it is being pushed ON TOP OF. Creating an exercise from the session's
     * picker has to end up in the session — "add exercise, push, neck, add
     * exercise, name it, and start doing it" is one gesture from the user's side,
     * and the destination is carried rather than remembered in separate state.
     */
    setStack((s) => {
      const current = s[s.length - 1];
      return [
        ...s,
        {
          name: 'createExercise',
          draft: emptyExerciseDraft(name, muscle, useSettings.getState().restSecondsBetweenSets),
          addToSession: current?.name === 'addExercise' && current.target === 'session',
        },
      ];
    });
  }, []);

  /**
   * Append an exercise to the session in flight, with ONE set.
   *
   * Takes the row rather than an id because it is also called for an exercise
   * created a moment ago, which is not in `exercisesById` until the next render.
   *
   * One set, deliberately: an exercise added mid-workout has no plan behind it —
   * the user is deciding set by set, and `Add set` in the card is one tap. The rest
   * of the entry is built by the SAME function the routine path uses, so the
   * prefills, the overload verdict and the last-session lines are identical to what
   * a planned exercise would have shown.
   */
  const addExerciseToSession = useCallback(
    (exercise: Exercise) => {
      const workout = useActiveWorkout.getState();
      if (!workout.session) return;
      const settings = useSettings.getState();

      workout.addEntry(
        buildDraftEntry({
          exercise,
          history: historyById[exercise.id] ?? [],
          policy: seedUser.overloadPolicy,
          unitSystem: settings.unitSystem,
          restSeconds: settings.restSecondsBetweenSets,
          transitionRestSeconds: settings.restSecondsBetweenExercises,
          targetSets: 1,
          targetRepsMax: defaultTargetCount(exercise),
          plannedSetCount: 1,
        }),
      );
    },
    [historyById],
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
          onAddExercise={() => push({ name: 'addExercise', routineId: null, target: 'session' })}
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
    const route = top;
    const routine = routinesById[route.routineId];
    if (!routine) return <Fallback onBack={pop} />;
    return (
      <RoutineEditorScreen
        routine={routine}
        exercisesById={exercisesById}
        isNew={route.isNew}
        onBack={() => handleLeaveEditor(route)}
        onSave={(draft) => {
          updateRoutine(routine.id, draft);
          pop();
        }}
        /*
         * Both of these navigate, and this screen is rebuilt from the store when it
         * comes back — so the working draft is committed on the way out. Without
         * it, adding an exercise threw away a name that had just been typed while
         * keeping the exercise, because `appendToRoutine` writes to the store and
         * the name only lived in the screen. See the editor's file header.
         */
        onOpenItem={(item, draft) => {
          updateRoutine(routine.id, draft);
          push({ name: 'exerciseHistory', exerciseId: item.exerciseId });
        }}
        onAddExercise={(draft) => {
          updateRoutine(routine.id, draft);
          push({ name: 'addExercise', routineId: routine.id });
        }}
        onDelete={() => {
          deleteRoutine(routine.id);
          pop();
        }}
      />
    );
  }

  if (top?.name === 'addExercise') {
    const { routineId, target } = top;
    return (
      <LibraryTab
        query={query}
        kicker={target === 'session' ? 'Add to workout' : 'Add exercise'}
        exercises={exercises}
        matches={matches}
        recentlyUsed={recentlyUsed}
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        onBack={pop}
        onChangeQuery={setQuery}
        onPick={(exerciseId) => {
          if (target === 'session') {
            const exercise = exercisesById[exerciseId];
            if (exercise) addExerciseToSession(exercise);
            return popToSession();
          }
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
    const addToSession = top.addToSession === true;
    return (
      <CreateExerciseScreen
        initial={top.draft}
        onBack={pop}
        onSubmit={(draft) => {
          const exercise = draftToExercise(draft, `ex_${Date.now().toString(36)}`, seedUser.id);
          addExercise(exercise);
          /*
           * Created from the session's picker: it goes into the library AND into the
           * workout, and the user lands back on the set rows rather than on the
           * picker they no longer need. Both writes happen here so a new exercise
           * cannot end up in one place and not the other.
           */
          if (addToSession) {
            addExerciseToSession(exercise);
            popToSession();
            return;
          }
          pop();
        }}
      />
    );
  }

  if (top?.name === 'editExercise') {
    const exercise = exercisesById[top.exerciseId];
    if (!exercise) return <Fallback onBack={pop} />;
    return (
      <CreateExerciseScreen
        // Rebuilt from the row every time the screen opens, so what you see is what
        // is stored — including anything changed from somewhere else since.
        initial={exerciseToDraft(exercise, useSettings.getState().restSecondsBetweenSets)}
        mode="edit"
        onBack={pop}
        onSubmit={(draft) => {
          // In place, keeping the id: every set ever logged points at it, so the
          // history follows the rename instead of being orphaned by it.
          updateExercise(exercise.id, applyDraftToExercise(draft, exercise));
          pop();
        }}
      />
    );
  }

  if (top?.name === 'backup') {
    return <BackupScreen onBack={pop} />;
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
        onEdit={() => push({ name: 'editExercise', exerciseId: exercise.id })}
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
            choices={choices}
            emptyDayIds={emptyDayIds}
            recent={recent}
            onStart={handleStart}
            onSelectDay={handleSelectDay}
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
            onStart={handleStart}
            onCreate={handleAddRoutine}
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

        {tab === 'Settings' ? (
          <SettingsScreen onOpenBackup={() => push({ name: 'backup' })} />
        ) : null}
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

/**
 * A pushed route whose subject was deleted underneath it.
 *
 * It used to pop itself in an effect, which is the right instinct and the wrong
 * mechanism: mount, unmount, one frame of an empty screen — indistinguishable from
 * a tap that did nothing, and a real "blink" bug when a route was pushed for a
 * routine that had already been deleted. Callers now refuse to push such a route in
 * the first place (see `handleSelectDay`), so reaching this screen means the
 * subject vanished WHILE it was open — deleted from another tab. That deserves a
 * sentence and a button, not a flicker.
 */
function Fallback({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-1 items-center justify-center bg-bg px-xl">
      <Text className="text-title font-medium text-ink">It's gone</Text>
      <Text className="mt-sm text-center text-body text-ink-muted">
        This was deleted while you were looking at it.
      </Text>
      <View className="mt-xl w-full">
        <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
      </View>
    </View>
  );
}
