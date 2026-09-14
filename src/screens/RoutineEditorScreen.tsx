/**
 * RoutineEditorScreen — the template, and the order you do it in.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  EDIT ROUTINE                      [ Save ]│
 *   │ ROUTINE NAME                                 │
 *   │ ╭ Pull + swimming|                         ╮ │
 *   │ EXERCISES · 6                                │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ ≡  Weighted 90° pull-ups           ⌄  ✕  │ │
 *   │ │    4 × 4–6 · rest 3:00                   │ │
 *   │ │      Sets                  4    ( − )( + )│ │  ← open
 *   │ │      Reps                  6    ( − )( + )│ │
 *   │ │      Down to                4   ( − )( + )│ │
 *   │ │      Rest                  3:00 ( − )( + )│ │
 *   │ │      This movement, in every routine      │ │
 *   │ │      Follow the setting instead           │ │
 *   │ │      Superset with the one above  [ ●━ ]  │ │
 *   │ │      Open its history                     │ │
 *   │ │ ≡  Wide pull-ups machine           ›  ✕  │ │
 *   │ │ +  Add exercise                          │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │            Delete routine                    │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE PLAN IS EDITABLE, AND IT EXPANDS IN PLACE ───────────────────────────
 *
 * For two releases it was not. `appendToRoutine` wrote `targetSets: 4`, this
 * screen rendered `4 × 8–10 · rest 2:00` as a summary line, and no control
 * anywhere changed any of it — so every plan in the app was four sets forever,
 * and `+ Add set` mid-session fixed it for one session and forgot. Tapping a row
 * now opens the four numbers under it.
 *
 * IN PLACE, not a pushed screen — the same decision `HistoryScreen` makes about a
 * workout, for the same reason. What you want from a routine row is one number
 * changed, and a route you have to come back from turns a nudge into navigation.
 * The chevron flips from › to ⌄ to say so. `Open its history` keeps the path that
 * tapping the row used to take, one level down where it belongs: it is the thing
 * you do occasionally, not the thing you came here for.
 *
 * ± CHIPS, NO KEYBOARD, same as `QuickAdjust` and Settings. Sets and reps step by
 * one, a hold or a round steps by fifteen seconds, and rest steps by fifteen —
 * every number here is nudged from one that was already close. `Down to` is the
 * optional low end of a rep range: nudging it to or past the target switches it
 * off, so one chip both opens and closes the range and there is no second control
 * for a thing that is either on or off.
 *
 * A LADDER TAKES THE REP ROWS' PLACE. An exercise running one (`lib/repLadder.ts`)
 * derives every set's reps from a single max, so `Reps` and `Down to` under it
 * would be controls that quietly do nothing — this screen's whole lesson. The panel
 * states the ladder instead — `16 + 10 + 8 + 8 + 6`, for this item's set count —
 * and `Sets` re-shapes it live, because how many sets a routine plans is still the
 * routine's business.
 *
 * SUPERSETS ARE ONE TOGGLE: "with the exercise above". `supersetGroup` is a
 * string, and a UI that let people NAME groups would need a group-name concept, a
 * picker, and an answer for two groups that share a name — for a feature whose
 * whole content is "these two are done back to back". A superset is a run of
 * adjacent exercises, which is also what it is in a gym, so adjacency is the
 * model. Members carry a `green-dim` rule down their left edge — the same
 * vocabulary the drop target uses, because both mean "these belong together"
 * rather than "something is wrong".
 *
 * REST NAMES ITS SOURCE, and that is the point of the row rather than a detail of
 * it. `rest · setting` and a rest this movement owns are two different facts, and
 * telling them apart is exactly what was impossible before: a bare "3:00" could
 * be the user's own setting or a number the shipped routine carried, and when it
 * was the latter the Settings control silently did nothing. An exercise that is
 * following the setting follows it LIVE — `completeSet` re-reads it every time it
 * starts a rest — so `Follow the setting instead` is not "copy the current value",
 * it is "stop overriding", and the row says which state it is in.
 *
 * THIS ROW EDITS THE EXERCISE, NOT THE ITEM, and it commits immediately. Rest used
 * to be stored per routine row, which meant the same pull-up could rest 3:00 in
 * one routine and 2:00 in another, neither of them a fact about pull-ups, and
 * editing the exercise afterwards changed neither. It is one number on the
 * movement now (`lib/rest.ts`), which is also why the hint says so: nudging it
 * here changes that exercise everywhere it appears. Everything else on this panel
 * belongs to the routine and waits for `Save`; this one has nothing in the draft
 * to wait for.
 *
 * ✕ ON EVERY ROW TAKES THE EXERCISE OUT OF THE ROUTINE. It asks first, and it is
 * committed immediately rather than on `Save`: everything else that changes this
 * list — adding an exercise from the picker — already writes straight to the
 * store, and a removal that could be lost by backing out would be the only edit
 * here that lies about what it did. Only the exercise's place in THIS routine
 * goes; the exercise itself stays in the library, with its whole history.
 *
 * Rows are 64 (not 56) to fit two lines and still clear the handle. Sets, rep
 * range and rest collapse to ONE summary line so six exercises stay scannable
 * in a glance; tapping the row is what opens them, and only one is open at a
 * time. A routine editor that shows every field inline is a form, and nobody
 * scrolls a form in a gym.
 *
 * ── REORDER IS LONG PRESS, THEN SLIDE ───────────────────────────────────────
 *
 * The same gesture as the session's exercise cards, and now literally the same
 * code: `hooks/useDragReorder.ts`. It was not, for two releases — this screen
 * lifted a row and then asked the user to TAP where it should go, while the logging
 * screen dragged. Two muscle memories for one job, decided by which screen you
 * happened to be on, and the tap version was the worse one: it made moving an
 * exercise two deliberate acts instead of one continuous motion.
 *
 * It is still a MODE rather than a gesture in flight. The long press lifts the row
 * and leaves it lifted, so a finger that slips does not drop the row somewhere
 * nobody chose, and `Drop` in the header is always a way out. While a row is up:
 * the list dims to half and loses its chevrons, because nothing in it is tappable;
 * the ScrollView stops scrolling, so the two gestures cannot fight; and the header
 * reads the position the row would land in, because the list does not shuffle
 * underneath the finger to show it.
 *
 * The lifted row has NO SHADOW: the app's one elevation belongs to the rest timer.
 * It is marked with the `green-dim` rule instead — the same vocabulary the superset
 * bracket uses, and for the same reason. What it DOES need is for the card around
 * it to stop clipping (`ListCard clip={false}`), or it is sliced off at the top and
 * bottom of the list the moment it moves.
 *
 * ── THE DRAFT IS COMMITTED BEFORE THIS SCREEN NAVIGATES AWAY ────────────────
 *
 * The name and the order live in local state and used to be written to the store
 * only on `Save`. That is a clean rule right up to the point where this screen
 * sends the user somewhere else and comes back: `+ Add exercise` pushes the
 * library, the library writes the picked exercise STRAIGHT to the store
 * (`appendToRoutine`), and this screen is unmounted and rebuilt from props in the
 * meantime. So a name you had just typed silently reverted to "New routine" while
 * the exercise you added survived — half the edit kept, half thrown away, which is
 * indistinguishable from a bug because it is one.
 *
 * Every callback that navigates therefore hands the working draft up
 * (`{ name, items }`) so it can be committed first. `Save` still exists and still
 * means "I'm done here"; it just is no longer the only thing standing between a
 * typed name and losing it.
 */

import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { RandomRoutineSheet } from '../components/RandomRoutineSheet';
import { ReorderRow } from '../components/ReorderRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { ShuffleReel } from '../components/ShuffleReel';
import { DragHandle, Icon } from '../components/Icon';
import {
  AddRow,
  FieldWell,
  Kicker,
  ListCard,
  Separator,
  TextButton,
  Toggle,
} from '../components/primitives';
import { useDragReorder, type CardLayout } from '../hooks/useDragReorder';
import { useLanguage, useT, type Translate } from '../hooks/useT';
import { tap, undo } from '../lib/feedback';
import {
  DEFAULT_RANDOM_SPEC,
  drawablePool,
  rollRoutine,
  type RandomSpec,
  type RolledRoutine,
} from '../lib/randomRoutine';
import {
  bumpTargetCount,
  bumpTargetMin,
  bumpTargetSets,
  isSupersettedWithAbove,
  supersetRunPosition,
  targetCountStep,
  toggleSupersetWithAbove,
} from '../lib/routinePlan';
import { REST_LIMITS, bumpExerciseRest, clearExerciseRest, resolveRest } from '../lib/rest';
import { moveToIndex } from '../lib/reorder';
import { describeLadder, ladderOf, ladderTargets, ladderTotal } from '../lib/repLadder';
import { countUnitLabel, formatClock, formatDuration } from '../lib/units';
import { palette } from '../theme/tokens';
import type { Exercise, ID, Routine, RoutineItem } from '../types/models';

interface RoutineEditorScreenProps {
  routine: Routine;
  exercisesById: Record<ID, Exercise>;
  /**
   * THE WHOLE LIBRARY, for the die.
   *
   * `exercisesById` resolves the rows this routine already has; the die needs
   * everything it could draw instead, which is a different question and not one
   * a lookup keyed by the current items can answer.
   */
  library: readonly Exercise[];
  /**
   * The between-sets rest from Settings, for the rows that are following it.
   *
   * Passed in rather than read here: this screen is composition, and the two rest
   * settings are already the only rest controls the app exposes. What it needs is
   * the CURRENT value so a row can say `rest · setting 2:00` and mean it.
   */
  defaultRestSeconds: number;
  /**
   * This routine was created by opening this screen. It renames the header and
   * opens the keyboard on the name, because the placeholder name is the first
   * thing anyone wants to change.
   */
  isNew?: boolean;
  onBack: () => void;
  /** Commits the working name and order together — this screen is one draft. */
  onSave: (patch: RoutineDraft) => void;
  /**
   * Open one item. Handed the working draft because it navigates away, and
   * anything not committed first is lost — see the file header.
   */
  onOpenItem: (item: RoutineItem, draft: RoutineDraft) => void;
  /** Same contract as `onOpenItem`: commit the draft, then push the picker. */
  onAddExercise: (draft: RoutineDraft) => void;
  /**
   * Write the draft to the store WITHOUT leaving the screen. Removing an exercise
   * goes through this, so the removal survives backing out — see the file header.
   */
  onCommit: (draft: RoutineDraft) => void;
  /**
   * Edit an exercise in the LIBRARY, from a row of this routine. Rest is the only
   * thing that uses it, and it is committed on the spot rather than held in the
   * draft — see the file header.
   */
  onPatchExercise: (exerciseId: ID, fn: (exercise: Exercise) => Exercise) => void;
  onDelete: () => void;
  /**
   * COPY this routine, and open the copy.
   *
   * The routine editor is where it belongs rather than the list, because copying is
   * never the end of the intention: you copy `Back` in order to make a second back
   * day with two exercises swapped, and the next thing you need is this screen,
   * pointed at the copy. The current draft is committed on the way — copying a
   * routine and getting a copy of what it looked like before your last three edits
   * is the kind of thing you only notice a week later.
   *
   * Absent = no row, which is what a brand-new empty routine should get: there is
   * nothing in it to copy.
   */
  onDuplicate?: (draft: RoutineDraft) => void;
}

/** The two things this screen edits. */
export interface RoutineDraft {
  name: string;
  items: RoutineItem[];
}

/**
 * `display: none` rather than unmounting the list while the die spins.
 *
 * Unmounting would throw away every row's measured offset in `rowLayouts`, and
 * those are what the drag-reorder reads — so the first long press after a roll
 * would drag against stale geometry. Hidden, the rows keep their layout, take no
 * space and receive no touches, which is all three things this needs.
 */
const HIDDEN_WHILE_ROLLING = { display: 'none' } as const;

export function RoutineEditorScreen({
  routine,
  exercisesById,
  library,
  defaultRestSeconds,
  isNew = false,
  onBack,
  onSave,
  onOpenItem,
  onAddExercise,
  onCommit,
  onPatchExercise,
  onDelete,
  onDuplicate,
}: RoutineEditorScreenProps) {
  /** Working name and order. Committed only on Save — this screen is a draft. */
  const [name, setName] = useState(routine.name);
  const [items, setItems] = useState<RoutineItem[]>(() =>
    [...routine.items].sort((a, b) => a.order - b.order),
  );
  /**
   * The one open row. One at a time, like `HistoryScreen`: two open editors is a
   * form, and the point of expanding in place is that the list stays readable.
   */
  const [openId, setOpenId] = useState<ID | null>(null);
  /** The item the user asked to remove, held while the sheet asks. */
  const [removing, setRemoving] = useState<RoutineItem | null>(null);
  const t = useT();

  /*
   * ── THE DIE ──────────────────────────────────────────────────────────
   *
   * Three pieces of state and they are three different things. `randomSpec` is
   * what the die will draw from NEXT — it survives a roll, so re-rolling the same
   * request is one tap. `rolling` is the answer the reel is currently spinning
   * towards, and it is what the screen shows INSTEAD of the exercise list while
   * it spins. `asking` is the long-press sheet.
   *
   * The roll is computed BEFORE the animation rather than after it: the reel's
   * last frame has to be the real answer (see `ShuffleReel`), and an animation
   * that decides at the end is an animation that can disagree with what it just
   * showed you.
   */
  const [randomSpec, setRandomSpec] = useState<RandomSpec>(DEFAULT_RANDOM_SPEC);
  const [rolling, setRolling] = useState<RolledRoutine | null>(null);
  const [asking, setAsking] = useState(false);
  /** Nothing to roll from: the die is present but inert, and says so. */
  const [rollFailed, setRollFailed] = useState(false);

  /**
   * Where each row sits and how tall it is, captured on layout. Offsets are
   * relative to the list wrapper, which is all the drag maths compares them to.
   */
  const rowLayouts = useRef<Record<ID, CardLayout>>({});
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);

  /**
   * Splice the lifted row into the gap the finger stopped over, and renumber.
   *
   * The splice is `lib/reorder.ts`, shared with the session's drag-reorder — and
   * `toIndex` is a position in the list WITHOUT the moved row, which is exactly what
   * a drop position on screen is, so there is no off-by-one correction and dropping
   * a row back where it came from is a no-op.
   *
   * The renumber is this screen's own: `order` is a persisted field and the list
   * sorts by it, so it has to stay a dense 0..n. A gap in it turns the next reorder
   * into a drag that jumps.
   */
  const commitMove = (itemId: ID, toIndex: number) => {
    setItems((current) =>
      moveToIndex(current, (i) => i.id === itemId, toIndex).map((item, order) => ({
        ...item,
        order,
      })),
    );
  };

  const { lifted, dragY, targetIndex, panHandlers, lift, drop, shiftFor } = useDragReorder(
    itemIds,
    rowLayouts,
    commitMove,
  );
  const liftedExercise = lifted
    ? (exercisesById[items.find((i) => i.id === lifted)?.exerciseId ?? ''] ?? null)
    : null;

  /** What this screen would save right now. Handed to anything that navigates. */
  const draft = (): RoutineDraft => ({ name, items });

  const handleLift = (item: RoutineItem) => {
    // A row cannot be open and in the air at once: the editor's chips would be
    // under a finger that is dragging.
    setOpenId(null);
    lift(item.id);
  };

  /**
   * Rewrite one item through a pure function from `lib/routinePlan`.
   *
   * The numbers stay in this screen's draft rather than going straight to the
   * store, exactly like the name and the order — and for the same reason `Save`
   * exists. What is NOT in this screen is any decision about what the numbers may
   * be: every clamp, every "a floor at the target is not a range", lives in
   * `routinePlan` where it is testable without a renderer.
   */
  const patchItem = (itemId: ID, fn: (item: RoutineItem) => RoutineItem) => {
    tap();
    setItems((current) => current.map((item) => (item.id === itemId ? fn(item) : item)));
  };

  /**
   * Take one exercise out of the routine, and renumber what is left so `order`
   * stays a dense 0..n — the field the list sorts by, and a gap in it turns the
   * reorder into a drag that jumps.
   */
  const removeItem = (itemId: ID) => {
    undo();
    const next = items.filter((i) => i.id !== itemId).map((item, order) => ({ ...item, order }));
    setItems(next);
    setRemoving(null);
    onCommit({ name, items: next });
  };

  /**
   * Roll, and REPLACE what is in the editor.
   *
   * Replace and not append, because "random routine" is what the die promises
   * and a die that adds five exercises to the six you have is a die that built
   * an eleven-exercise routine nobody asked for. The name goes with it — that is
   * the derived `Pull + Core` — and both land in the DRAFT rather than the store,
   * so backing out without saving leaves the routine exactly as it was. The die
   * is an edit like any other on this screen.
   */
  const roll = (spec: RandomSpec) => {
    const rolled = rollRoutine(library, spec);
    setRandomSpec(spec);
    setAsking(false);
    if (!rolled) {
      setRollFailed(true);
      return;
    }
    setRollFailed(false);
    // The row is open on an item the roll is about to delete.
    setOpenId(null);
    setRolling(rolled);
  };

  /** The reel has stopped on the answer: commit it to the draft. */
  const settle = (rolled: RolledRoutine) => {
    const stamp = Date.now().toString(36);
    setName(rolled.name);
    setItems(rolled.items.map((item, order) => ({ ...item, id: `ri_${stamp}_${order}`, order })));
  };

  const dimmed = removing != null;

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={dimmed ? { opacity: 0.28 } : undefined}>
        <ScreenHeader
          kicker={
            lifted && liftedExercise
              ? `${t('Moving')} · ${liftedExercise.name}`
              : isNew
                ? t('New routine')
                : t('Edit routine')
          }
          kickerTone={lifted ? 'green' : 'faint'}
          /* Where it would land, because the list does not shuffle under the
             finger to show it. Same readout as the logging screen's. */
          subtitle={
            lifted
              ? t('Slide to move it · position {at} of {of}', {
                  at: targetIndex + 1,
                  of: items.length,
                })
              : undefined
          }
          onBack={lifted ? undefined : onBack}
          /* The die goes while a row is in the air: rebuilding the list under a
             finger that is dragging one of its rows is the one state this screen
             cannot be in. */
          iconAction={
            lifted
              ? undefined
              : {
                  icon: 'dice',
                  label: t('Roll a random routine. Long press to choose what goes in it.'),
                  active: rolling != null,
                  onPress: () => roll(randomSpec),
                  onLongPress: () => {
                    tap();
                    setAsking(true);
                  },
                }
          }
          action={
            lifted
              ? { label: t('Drop'), onPress: drop }
              : { label: t('Save'), onPress: () => onSave(draft()) }
          }
        />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!lifted && !dimmed}
        >
          {/* The name field hides while reordering: one thing at a time. */}
          {lifted ? null : (
            <>
              <Kicker className="mx-lg mb-sm">{t('Routine name')}</Kicker>
              <View className="mx-lg">
                <FieldWell
                  value={name}
                  placeholder={t('Routine name')}
                  onChangeText={setName}
                  selectAllOnFocus={isNew}
                  /* Not while the die is spinning: a keyboard arriving over the
                     reel hides the thing the user is watching. */
                  autoFocus={isNew && rolling == null}
                  accessibilityLabel={t('Routine name')}
                />
              </View>
            </>
          )}

          {rollFailed ? (
            <Text className="mx-lg mt-md text-label text-ink-faint">
              {t('Nothing to roll — the library is empty.')}
            </Text>
          ) : null}

          {/* While the reel spins it stands IN PLACE OF the list, and everything
              under it goes with it.

              Both halves matter. Leaving the old list on screen under a spinning
              reel states two routines at once, one of which is a second away from
              being untrue. And leaving `+ Add exercise` and `Delete routine`
              reachable means a tap can commit the PRE-ROLL draft and navigate
              away while the reel is still counting down to overwrite it — the
              roll then lands on a screen that has gone. */}
          {rolling ? (
            <View className="mx-lg mt-xl">
              <ShuffleReel
                key={rolling.exercises.map((e) => e.id).join('-')}
                pool={drawablePool(library, randomSpec.clusters).map((e) => e.name)}
                result={rolling.exercises.map((e) => e.name)}
                onSettled={() => {
                  settle(rolling);
                  setRolling(null);
                }}
              />
            </View>
          ) : null}

          {rolling ? null : (
            <Kicker className={`mx-lg mb-sm ${lifted ? '' : 'mt-xl'}`}>
              {t('Exercises')} · {items.length}
            </Kicker>
          )}

          {/* The drag surface — its own View around the card rather than the card
              itself, because `ListCard` takes props it understands and would drop
              these on the floor. It claims a touch only while a row is lifted, so
              every tap, every chip and the scroll itself are untouched until then.
              `clip={false}` only while one is up: see the file header. */}
          <View {...panHandlers} style={rolling ? HIDDEN_WHILE_ROLLING : undefined}>
            <ListCard className="mx-lg" clip={!lifted}>
              {items.map((item, index) => {
                const exercise = exercisesById[item.exerciseId];
                if (!exercise) return null;
                const isLifted = item.id === lifted;

                return (
                  <ReorderRow
                    key={item.id}
                    lifted={isLifted}
                    dragging={lifted != null}
                    dragY={dragY}
                    // The rows above and below open the gap while the finger is
                    // still over it, so you can see which two exercises you are
                    // dropping between before you let go.
                    shift={shiftFor(item.id)}
                    onLayout={(e) => {
                      const { y, height } = e.nativeEvent.layout;
                      rowLayouts.current[item.id] = { y, height };
                    }}
                  >
                    {/* Hairlines inset 40 — past the handle, so the rule starts
                    where the text does. */}
                    {index > 0 ? <Separator inset={40} /> : null}
                    <RoutineRow
                      exercise={exercise}
                      dimmed={lifted != null && !isLifted}
                      isLifted={isLifted}
                      isOpen={openId === item.id}
                      superset={supersetRunPosition(items, index)}
                      summary={summarizeItem(item, exercise, defaultRestSeconds, t)}
                      onPress={() => {
                        tap();
                        setOpenId((current) => (current === item.id ? null : item.id));
                      }}
                      // One exercise cannot be reordered, and the gesture would only
                      // ever end where it started.
                      onLongPress={items.length > 1 ? () => handleLift(item) : undefined}
                      onRemove={() => {
                        tap();
                        setRemoving(item);
                      }}
                    />

                    {openId === item.id && !lifted ? (
                      <ItemEditor
                        item={item}
                        exercise={exercise}
                        settingsRestSeconds={defaultRestSeconds}
                        /* The first row has nothing above it to pair with. */
                        supersetWithAbove={
                          index === 0 ? null : isSupersettedWithAbove(items, index)
                        }
                        onPatch={(fn) => patchItem(item.id, fn)}
                        onPatchExercise={(fn) => onPatchExercise(exercise.id, fn)}
                        onToggleSuperset={() => {
                          tap();
                          setItems((current) => {
                            const at = current.findIndex((i) => i.id === item.id);
                            return at <= 0 ? current : toggleSupersetWithAbove(current, at);
                          });
                        }}
                        onOpenHistory={() => onOpenItem(item, draft())}
                      />
                    ) : null}
                  </ReorderRow>
                );
              })}

              {lifted ? null : (
                <>
                  <Separator inset={0} />
                  <AddRow label={t('Add exercise')} onPress={() => onAddExercise(draft())} />
                </>
              )}
            </ListCard>
          </View>

          {lifted || rolling ? null : (
            <View className="mx-lg mt-xl">
              {/* Above `Delete`, and separated from it by its own row: the two are
                  opposite in every way except that they both live at the bottom of
                  the screen, and a mis-tap between them is not symmetrical. */}
              {onDuplicate && items.length > 0 ? (
                <View className="mb-lg">
                  <TextButton
                    label={t('Duplicate this routine')}
                    onPress={() => onDuplicate(draft())}
                  />
                </View>
              ) : null}
              <TextButton label={t('Delete routine')} onPress={onDelete} />
            </View>
          )}
        </ScrollView>
      </View>

      {asking ? (
        <RandomRoutineSheet
          exercises={library}
          spec={randomSpec}
          onRoll={roll}
          onDismiss={() => setAsking(false)}
        />
      ) : null}

      {removing ? (
        <ConfirmSheet
          title={t('Remove “{name}”?', {
            name: exercisesById[removing.exerciseId]?.name ?? t('this exercise'),
          })}
          body={t(
            'It comes out of this routine only. The exercise stays in your library with every set you have ever logged against it.',
          )}
          confirmLabel="Remove it"
          cancelLabel="Keep it"
          onConfirm={() => removeItem(removing.id)}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function RoutineRow({
  exercise,
  dimmed,
  isLifted,
  isOpen,
  superset,
  summary,
  onPress,
  onLongPress,
  onRemove,
}: {
  exercise: Exercise;
  /** Another row is in the air, so this one is not the subject right now. */
  dimmed: boolean;
  /** THIS row is in the air: it follows the finger and marks itself. */
  isLifted: boolean;
  isOpen: boolean;
  /** Where this row sits in a superset run — drives the rule down its left edge. */
  superset: 'none' | 'start' | 'continue';
  /** Built by the screen, which is the only place that knows the live setting. */
  summary: string;
  onPress: () => void;
  /** Absent on a one-row list — there is nowhere for a drag to end. */
  onLongPress?: () => void;
  onRemove?: () => void;
}) {
  const t = useT();

  return (
    <View
      className={[
        'flex-row items-center',
        // `surface-alt` on a `green-dim` hairline while it is up — the same
        // treatment the session's lifted card gets, and no shadow.
        isLifted ? 'rounded-surface border border-green-dim bg-surface-alt' : '',
      ].join(' ')}
      style={dimmed ? { opacity: 0.5 } : undefined}
    >
      {/* The bracket. A 2 dp `green-dim` rule down the left edge of every member,
          so a run reads as one block without a second hue or a label. */}
      <View
        className={[
          'h-row-lg w-[2px]',
          superset === 'none' ? 'bg-transparent' : 'bg-green-dim',
        ].join(' ')}
      />
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={280}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={[
          exercise.name,
          summary,
          superset === 'continue' ? t('supersetted with the exercise above') : '',
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint={onLongPress ? t('Long press, then slide to reorder') : undefined}
        className="h-row-lg flex-1 flex-row items-center pl-md"
      >
        <DragHandle color={isLifted ? palette.greenBright : palette.inkFaint} />

        <View className="ml-md flex-1">
          <Text
            numberOfLines={1}
            className={['text-body font-medium', isLifted ? 'text-green-bright' : 'text-ink'].join(
              ' ',
            )}
          >
            {exercise.name}
          </Text>
          <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
            {summary}
          </Text>
        </View>

        {/* Chevrons vanish while reordering: nothing here opens right now. */}
        {dimmed ? null : (
          <View className="ml-md">
            <Icon
              name={isOpen ? 'chevron-down' : 'chevron-right'}
              size={18}
              color={palette.inkFaint}
            />
          </View>
        )}
      </Pressable>

      {/* Its own hit area, 44 wide: removing an exercise must not be reachable by
          a thumb aiming at the row. */}
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('Remove {name} from this routine', { name: exercise.name })}
          className="h-row-lg w-[44px] items-center justify-center"
        >
          <Icon name="x" size={15} color={palette.inkMuted} />
        </Pressable>
      ) : (
        <View className="w-lg" />
      )}
    </View>
  );
}

/**
 * The four numbers, open under the row.
 *
 * `surface-alt` on a hairline, the same treatment `HistoryScreen` gives an
 * expanded workout and `QuickAdjust` gives an open set row — an inline editor is
 * always the layer just above the list it belongs to, never a card of its own.
 *
 * Every chip goes through a pure function in `lib/routinePlan`. This component
 * knows how to draw a stepper and nothing about what a legal target is.
 */
function ItemEditor({
  item,
  exercise,
  settingsRestSeconds,
  supersetWithAbove,
  onPatch,
  onPatchExercise,
  onToggleSuperset,
  onOpenHistory,
}: {
  item: RoutineItem;
  exercise: Exercise;
  settingsRestSeconds: number;
  /** On / off, or null on the first row — which has nothing above it to pair with. */
  supersetWithAbove: boolean | null;
  onPatch: (fn: (item: RoutineItem) => RoutineItem) => void;
  /**
   * Edit the EXERCISE this row points at. Only rest uses it, and it lands in the
   * library immediately rather than in the routine draft — see the file header.
   */
  onPatchExercise: (fn: (exercise: Exercise) => Exercise) => void;
  onToggleSuperset: () => void;
  onOpenHistory: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const { countUnit } = exercise;
  const timed = countUnit === 'seconds' || countUnit === 'rounds';
  const countDelta = targetCountStep(countUnit);
  const rest = resolveRest(exercise, settingsRestSeconds);
  const target = item.targetRepsMax ?? item.targetRepsMin ?? 0;
  /*
   * A ladder replaces the rep controls rather than sitting beside them: it decides
   * every set's reps from one max, so a `Reps` stepper under it would be a control
   * that quietly does nothing — the exact failure this screen's rest row exists to
   * undo. What the routine still owns is `Sets`, and the ladder re-shapes itself
   * around whatever that says, live, one row below.
   */
  const ladder = ladderOf(exercise);
  const ladderPlan = ladder ? ladderTargets(ladder, item.targetSets) : null;

  /*
   * A hold or a round reads as a clock, a distance as metres, reps as a number.
   * `formatDuration` rather than `formatClock`: this is a PLAN ("3 min"), not a
   * countdown somebody is watching ("3:00") — the same distinction the rest row
   * below makes in the other direction.
   */
  const showCount = timed ? formatDuration(target) : `${target} ${countUnitLabel(countUnit, lang)}`;

  return (
    <View className="border-t border-t-hairline bg-surface-alt">
      <ItemStepper
        label={timed ? (countUnit === 'rounds' ? t('Rounds') : t('Holds')) : t('Sets')}
        value={String(item.targetSets)}
        onDecrease={() => onPatch((i) => bumpTargetSets(i, -1))}
        onIncrease={() => onPatch((i) => bumpTargetSets(i, 1))}
      />
      {ladderPlan ? (
        <>
          <Separator inset={40} />
          {/* Stated, not offered. The max is a fact about the lifter and lives on
              the EXERCISE — one pull-up max, not one per routine that contains
              pull-ups — so it is set in the exercise editor, which `Open its
              history` at the bottom of this panel leads to. */}
          <View className="min-h-[56px] py-sm pl-xxl pr-lg">
            <View className="flex-row items-center">
              <Text className="flex-1 pr-md text-label font-medium text-ink">Ladder</Text>
              <Text className="text-body font-semibold tabular-nums text-ink">
                {describeLadder(ladderPlan)}
              </Text>
            </View>
            <Text className="mt-[2px] text-micro text-ink-faint">
              Max {ladderPlan[0]} · {ladderTotal(ladderPlan)} reps · one rep is added every session
              you meet it
            </Text>
          </View>
        </>
      ) : (
        <>
          <Separator inset={40} />
          <ItemStepper
            label={timed ? t('Each one') : t('Reps')}
            value={showCount}
            onDecrease={() => onPatch((i) => bumpTargetCount(i, countUnit, -countDelta))}
            onIncrease={() => onPatch((i) => bumpTargetCount(i, countUnit, countDelta))}
          />

          {/* The low end of the rep range, and only where a range means something: a
              plan of "3 × 1:45–2:00 plank" is a number nobody holds to. */}
          {timed ? null : (
            <>
              <Separator inset={40} />
              <ItemStepper
                label={t('Down to')}
                hint={item.targetRepsMin == null ? t('Off — the plan is one number') : undefined}
                value={item.targetRepsMin == null ? '—' : String(item.targetRepsMin)}
                onDecrease={() => onPatch((i) => bumpTargetMin(i, countUnit, -1))}
                onIncrease={() => onPatch((i) => bumpTargetMin(i, countUnit, 1))}
              />
            </>
          )}
        </>
      )}

      <Separator inset={40} />
      {/*
        Rest names its source, and it writes to the EXERCISE — see the file header
        for both. `3:00` alone cannot tell the user's own setting from a number the
        routine carried, and that ambiguity is what made the Settings control look
        broken.
      */}
      <ItemStepper
        label={t('Rest')}
        hint={
          rest.source === 'exercise'
            ? t('This movement, in every routine that has it')
            : t('Following your setting — it moves when you change it')
        }
        value={rest.seconds > 0 ? formatClock(rest.seconds) : t('None')}
        tone={rest.source === 'exercise' ? 'own' : 'inherited'}
        onDecrease={() =>
          onPatchExercise((e) => bumpExerciseRest(e, -REST_LIMITS.step, rest.seconds))
        }
        onIncrease={() =>
          onPatchExercise((e) => bumpExerciseRest(e, REST_LIMITS.step, rest.seconds))
        }
      />

      {rest.source === 'exercise' ? (
        <>
          <Separator inset={40} />
          <Pressable
            onPress={() => onPatchExercise(clearExerciseRest)}
            accessibilityRole="button"
            accessibilityLabel={t("Follow the rest setting instead of this exercise's own")}
            className="h-hit justify-center pl-xxl pr-lg"
          >
            <Text className="text-label font-medium text-ink-muted">
              Follow the setting instead
            </Text>
          </Pressable>
        </>
      ) : null}

      {/* One toggle, and only where there is an exercise above to pair with. See
          the file header for why there is no group-name concept. */}
      {supersetWithAbove == null ? null : (
        <>
          <Separator inset={40} />
          <View className="min-h-[56px] flex-row items-center py-sm pl-xxl pr-lg">
            <View className="flex-1 pr-md">
              <Text className="text-label font-medium text-ink">Superset with the one above</Text>
              <Text className="mt-[2px] text-micro text-ink-faint">
                {supersetWithAbove
                  ? t('No rest between them — rest comes after the pair')
                  : t('Rest after every set, as normal')}
              </Text>
            </View>
            <Toggle
              value={supersetWithAbove}
              onChange={onToggleSuperset}
              accessibilityLabel={t('Superset with the exercise above')}
            />
          </View>
        </>
      )}

      <Separator inset={40} />
      {/* Where tapping the row used to go, one level down: it is what you do
          occasionally, not what you came here for. */}
      <Pressable
        onPress={onOpenHistory}
        accessibilityRole="button"
        accessibilityLabel={t('Open the history for {name}', { name: exercise.name })}
        className="h-hit flex-row items-center pl-xxl pr-lg"
      >
        <Text className="flex-1 text-label font-medium text-ink-muted">Open its history</Text>
        <Icon name="chevron-right" size={16} color={palette.inkFaint} />
      </Pressable>
    </View>
  );
}

/**
 * One number with a `−` and a `+`, indented past the drag handle.
 *
 * Deliberately the same shape as `SettingsScreen`'s `StepperRow` — label, then the
 * value in one vertical line, then two 36 dp chips inside 44 dp of hit area. Not
 * shared with it, because that one is bound to `NumericSetting` and this one is
 * bound to a `RoutineItem`; the two would meet in a component taking six props to
 * describe which store it is editing.
 *
 * `tone` is the one thing this row has that Settings' does not: a value the user
 * set for THIS exercise reads in full ink, a value inherited from Settings reads
 * muted. Same green scale, no second hue — inherited is quieter, not coloured.
 */
function ItemStepper({
  label,
  hint,
  value,
  tone = 'own',
  onDecrease,
  onIncrease,
}: {
  label: string;
  hint?: string;
  value: string;
  tone?: 'own' | 'inherited';
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const t = useT();

  return (
    <View className="min-h-[56px] flex-row items-center py-sm pl-xxl pr-sm">
      <View className="flex-1 pr-md">
        <Text className="text-label font-medium text-ink">{label}</Text>
        {hint ? <Text className="mt-[2px] text-micro text-ink-faint">{hint}</Text> : null}
      </View>

      <Text
        className={[
          'mr-sm text-body font-semibold tabular-nums',
          tone === 'own' ? 'text-ink' : 'text-ink-faint',
        ].join(' ')}
      >
        {value}
      </Text>

      <StepChip icon="minus" label={t('Decrease {label}', { label })} onPress={onDecrease} />
      <View className="w-xs" />
      <StepChip icon="plus" label={t('Increase {label}', { label })} onPress={onIncrease} />
    </View>
  );
}

function StepChip({
  icon,
  label,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-[36px] w-[36px] items-center justify-center rounded-pill border border-hairline bg-surface"
    >
      <Icon name={icon} size={14} color={palette.ink} />
    </Pressable>
  );
}

/**
 * "4 × 4–6 · rest 3:00 · each side" — everything a routine row needs to say.
 *
 * One line, in the order you need it: how much work, then how long you wait,
 * then the one caveat that changes how you do it.
 *
 * Rest goes through `resolveRest`, the same function the session calls when it
 * starts one, so the summary and the countdown agree by construction — and it
 * reads the EXERCISE, because that is where a rest lives now (`lib/rest.ts`).
 */
function summarizeItem(
  item: RoutineItem,
  exercise: Exercise,
  settingsRestSeconds: number,
  t: Translate,
): string {
  const parts: string[] = [];

  const ladder = ladderOf(exercise);
  if (ladder) {
    // A ladder states every set, because that is what it is: five numbers, not a
    // count times a target. Same line the session's card shows.
    parts.push(describeLadder(ladderTargets(ladder, item.targetSets)));
  } else if (exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds') {
    parts.push(`${item.targetSets} × ${formatDuration(item.targetRepsMax ?? 0)}`);
  } else {
    const { targetRepsMin: min, targetRepsMax: max } = item;
    const range = min && max && min !== max ? `${min}–${max}` : String(max ?? min ?? '');
    parts.push(`${item.targetSets} × ${range}`);
  }

  // Rest is a clock ("3:00") — it is a stopwatch value you watch tick down.
  // A target duration is prose ("3 min") — it is a plan, not a countdown.
  const rest = resolveRest(exercise, settingsRestSeconds);
  parts.push(
    rest.seconds > 0 ? t('rest {clock}', { clock: formatClock(rest.seconds) }) : t('no rest'),
  );
  // Which of the two it is, in one word, so the collapsed line carries the same
  // fact the open editor states in a sentence.
  if (rest.source === 'settings' && rest.seconds > 0) parts.push(t('setting'));

  if (exercise.isUnilateral) parts.push(t('each side'));
  return parts.join(' · ');
}
