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
 *   │ │      Rest · this exercise 3:00  ( − )( + )│ │
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
 * it. `rest · setting` and `rest · this exercise` are two different facts, and
 * telling them apart is exactly what was impossible before: a bare "3:00" could
 * be the user's own setting or a number the shipped routine carried, and when it
 * was the latter the Settings control silently did nothing. An item that is
 * following the setting follows it LIVE — `completeSet` re-reads Settings every
 * time it starts a rest — so `Follow the setting instead` is not "copy the current
 * value", it is "stop overriding", and the row says which state it is in.
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
 * Reorder (state 10) is a mode, not a screen. Long-press lifts a row out of the
 * list to follow the finger; the list dims to half and loses its chevrons,
 * because nothing in it is tappable while a row is in the air. The gap the row
 * will fall into is drawn as a `green-dim` rule — the only place in the app
 * green marks a target rather than a fact. And the lifted row has NO SHADOW:
 * the app's one elevation belongs to the rest timer.
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

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { ScreenHeader } from '../components/ScreenHeader';
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
import { commit, tap, undo } from '../lib/feedback';
import {
  ITEM_REST_LIMITS,
  bumpItemRest,
  bumpTargetCount,
  bumpTargetMin,
  bumpTargetSets,
  clearItemRest,
  isSupersettedWithAbove,
  resolveItemRest,
  supersetRunPosition,
  targetCountStep,
  toggleSupersetWithAbove,
} from '../lib/routinePlan';
import { moveToIndex } from '../lib/reorder';
import { describeLadder, ladderOf, ladderTargets, ladderTotal } from '../lib/repLadder';
import { countUnitLabel, formatClock, formatDuration } from '../lib/units';
import { palette } from '../theme/tokens';
import type { Exercise, ID, Routine, RoutineItem } from '../types/models';

interface RoutineEditorScreenProps {
  routine: Routine;
  exercisesById: Record<ID, Exercise>;
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
  onDelete: () => void;
}

/** The two things this screen edits. */
export interface RoutineDraft {
  name: string;
  items: RoutineItem[];
}

export function RoutineEditorScreen({
  routine,
  exercisesById,
  defaultRestSeconds,
  isNew = false,
  onBack,
  onSave,
  onOpenItem,
  onAddExercise,
  onCommit,
  onDelete,
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
  /** The row in the air, and where it would land. null = not reordering. */
  const [moving, setMoving] = useState<{ id: ID; targetIndex: number } | null>(null);
  /** The item the user asked to remove, held while the sheet asks. */
  const [removing, setRemoving] = useState<RoutineItem | null>(null);

  const movingIndex = moving ? items.findIndex((i) => i.id === moving.id) : -1;
  const movingItem = movingIndex >= 0 ? items[movingIndex] : null;
  const movingExercise = movingItem ? exercisesById[movingItem.exerciseId] : null;

  /** What this screen would save right now. Handed to anything that navigates. */
  const draft = (): RoutineDraft => ({ name, items });

  const lift = (item: RoutineItem, index: number) => {
    commit();
    // A row cannot be open and in the air at once: the editor's chips would be
    // under a finger that is dragging.
    setOpenId(null);
    setMoving({ id: item.id, targetIndex: index });
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
   * Release: splice the lifted row into the marked gap and renumber.
   *
   * The splice is `lib/reorder.ts`, shared with the session's drag-reorder. The two
   * screens choose a drop position completely differently — a finger dragging over
   * card midpoints there, a tap on a row here — and then do exactly the same thing
   * with the index, which was written out twice.
   *
   * The renumber is this screen's own: `order` is a persisted field and the list
   * sorts by it, so it has to stay a dense 0..n. A gap in it turns the next reorder
   * into a drag that jumps.
   */
  const drop = () => {
    if (!moving || movingIndex < 0) return setMoving(null);
    undo();

    // The gap index counts the list WITHOUT the lifted row, which is what the
    // rendered drop band already represents — no off-by-one correction needed.
    const next = moveToIndex(items, (i) => i.id === moving.id, moving.targetIndex).map(
      (item, order) => ({ ...item, order }),
    );

    setItems(next);
    return setMoving(null);
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

  const rest = items.filter((i) => (moving ? i.id !== moving.id : true));
  const dimmed = removing != null;

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={dimmed ? { opacity: 0.28 } : undefined}>
        <ScreenHeader
          kicker={
            moving && movingExercise
              ? `Moving · ${movingExercise.name}`
              : isNew
                ? 'New routine'
                : 'Edit routine'
          }
          kickerTone={moving ? 'green' : 'faint'}
          onBack={moving ? undefined : onBack}
          action={{
            label: 'Save',
            // Demoted mid-move: saving is not the thing to do with a row in the air.
            tone: moving ? 'muted' : 'primary',
            onPress: moving ? drop : () => onSave(draft()),
          }}
        />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!moving && !dimmed}
        >
          {/* The name field hides while reordering: one thing at a time. */}
          {moving ? null : (
            <>
              <Kicker className="mx-lg mb-sm">Routine name</Kicker>
              <View className="mx-lg">
                <FieldWell
                  value={name}
                  placeholder="Routine name"
                  onChangeText={setName}
                  selectAllOnFocus={isNew}
                  autoFocus={isNew}
                  accessibilityLabel="Routine name"
                />
              </View>
            </>
          )}

          <Kicker className={`mx-lg mb-sm ${moving ? '' : 'mt-xl'}`}>
            Exercises · {items.length}
          </Kicker>

          <ListCard className="mx-lg">
            {rest.map((item, index) => {
              const exercise = exercisesById[item.exerciseId];
              if (!exercise) return null;
              const showGapBefore = moving?.targetIndex === index;

              return (
                <View key={item.id}>
                  {showGapBefore ? <DropGap /> : null}
                  {/* Hairlines inset 40 — past the handle, so the rule starts
                    where the text does. */}
                  {index > 0 && !showGapBefore ? <Separator inset={40} /> : null}
                  <RoutineRow
                    exercise={exercise}
                    dimmed={moving != null}
                    isOpen={openId === item.id}
                    superset={supersetRunPosition(rest, index)}
                    summary={summarizeItem(item, exercise, defaultRestSeconds)}
                    onPress={() => {
                      if (moving) return setMoving({ ...moving, targetIndex: index });
                      tap();
                      return setOpenId((current) => (current === item.id ? null : item.id));
                    }}
                    onLongPress={() => (moving ? undefined : lift(item, index))}
                    onRemove={
                      moving
                        ? undefined
                        : () => {
                            tap();
                            setRemoving(item);
                          }
                    }
                  />

                  {openId === item.id && !moving ? (
                    <ItemEditor
                      item={item}
                      exercise={exercise}
                      settingsRestSeconds={defaultRestSeconds}
                      /* The first row has nothing above it to pair with. */
                      supersetWithAbove={index === 0 ? null : isSupersettedWithAbove(rest, index)}
                      onPatch={(fn) => patchItem(item.id, fn)}
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
                </View>
              );
            })}

            {/* The gap can also be the very end of the list. */}
            {moving?.targetIndex === rest.length ? <DropGap /> : null}

            {moving ? null : (
              <>
                <Separator inset={0} />
                <AddRow label="Add exercise" onPress={() => onAddExercise(draft())} />
              </>
            )}
          </ListCard>

          {moving && movingItem && movingExercise ? (
            <LiftedRow
              exercise={movingExercise}
              position={moving.targetIndex + 1}
              total={items.length}
              onPress={drop}
            />
          ) : (
            <View className="mx-lg mt-xl">
              <TextButton label="Delete routine" onPress={onDelete} />
            </View>
          )}
        </ScrollView>
      </View>

      {removing ? (
        <ConfirmSheet
          title={`Remove “${exercisesById[removing.exerciseId]?.name ?? 'this exercise'}”?`}
          body="It comes out of this routine only. The exercise stays in your library with every set you have ever logged against it."
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
  isOpen,
  superset,
  summary,
  onPress,
  onLongPress,
  onRemove,
}: {
  exercise: Exercise;
  dimmed: boolean;
  isOpen: boolean;
  /** Where this row sits in a superset run — drives the rule down its left edge. */
  superset: 'none' | 'start' | 'continue';
  /** Built by the screen, which is the only place that knows the live setting. */
  summary: string;
  onPress: () => void;
  onLongPress: () => void;
  /** Absent while reordering — nothing in the list is actionable then. */
  onRemove?: () => void;
}) {
  return (
    <View className="flex-row items-center" style={dimmed ? { opacity: 0.5 } : undefined}>
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
          superset === 'continue' ? 'supersetted with the exercise above' : '',
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="Long press to reorder"
        className="h-row-lg flex-1 flex-row items-center pl-md"
      >
        <DragHandle color={palette.inkFaint} />

        <View className="ml-md flex-1">
          <Text numberOfLines={1} className="text-body font-medium text-ink">
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
          accessibilityLabel={`Remove ${exercise.name} from this routine`}
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

/** The gap the lifted row will fall into. `bg` + two green-dim rules, 64 high. */
function DropGap() {
  return (
    <View className="h-row-lg items-center justify-center border-y border-green-dim bg-bg">
      <Kicker tone="dim">drop here</Kicker>
    </View>
  );
}

/**
 * The row in the air. `surface-alt` on a `green-dim` hairline, handle and
 * position line in `green-bright`, and no shadow — see the file header.
 */
function LiftedRow({
  exercise,
  position,
  total,
  onPress,
}: {
  exercise: Exercise;
  position: number;
  total: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, position ${position} of ${total}. Tap to drop.`}
      className="mx-lg mt-lg h-row-lg flex-row items-center rounded-surface border border-green-dim bg-surface-alt pl-md pr-lg"
    >
      <DragHandle color={palette.greenBright} />
      <View className="ml-md flex-1">
        <Text numberOfLines={1} className="text-body font-semibold text-ink">
          {exercise.name}
        </Text>
        <Text className="mt-[2px] text-label tabular-nums text-green-bright">
          position {position} of {total}
        </Text>
      </View>
    </Pressable>
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
  onToggleSuperset,
  onOpenHistory,
}: {
  item: RoutineItem;
  exercise: Exercise;
  settingsRestSeconds: number;
  /** On / off, or null on the first row — which has nothing above it to pair with. */
  supersetWithAbove: boolean | null;
  onPatch: (fn: (item: RoutineItem) => RoutineItem) => void;
  onToggleSuperset: () => void;
  onOpenHistory: () => void;
}) {
  const { countUnit } = exercise;
  const timed = countUnit === 'seconds' || countUnit === 'rounds';
  const countDelta = targetCountStep(countUnit);
  const rest = resolveItemRest(item, settingsRestSeconds);
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
  const showCount = timed ? formatDuration(target) : `${target} ${countUnitLabel(countUnit)}`;

  return (
    <View className="border-t border-t-hairline bg-surface-alt">
      <ItemStepper
        label={timed ? (countUnit === 'rounds' ? 'Rounds' : 'Holds') : 'Sets'}
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
            label={timed ? 'Each one' : 'Reps'}
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
                label="Down to"
                hint={item.targetRepsMin == null ? 'Off — the plan is one number' : undefined}
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
        Rest names its source. See the file header: `3:00` alone cannot tell the
        user's own setting from a number the routine carried, and that ambiguity
        is what made the Settings control look broken.
      */}
      <ItemStepper
        label="Rest"
        hint={
          rest.source === 'item'
            ? 'This exercise only'
            : 'Following your setting — it moves when you change it'
        }
        value={rest.seconds > 0 ? formatClock(rest.seconds) : 'None'}
        tone={rest.source === 'item' ? 'own' : 'inherited'}
        onDecrease={() => onPatch((i) => bumpItemRest(i, -ITEM_REST_LIMITS.step, rest.seconds))}
        onIncrease={() => onPatch((i) => bumpItemRest(i, ITEM_REST_LIMITS.step, rest.seconds))}
      />

      {rest.source === 'item' ? (
        <>
          <Separator inset={40} />
          <Pressable
            onPress={() => onPatch(clearItemRest)}
            accessibilityRole="button"
            accessibilityLabel="Follow the rest setting instead of this exercise's own"
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
                  ? 'No rest between them — rest comes after the pair'
                  : 'Rest after every set, as normal'}
              </Text>
            </View>
            <Toggle
              value={supersetWithAbove}
              onChange={onToggleSuperset}
              accessibilityLabel="Superset with the exercise above"
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
        accessibilityLabel={`Open the history for ${exercise.name}`}
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

      <StepChip icon="minus" label={`Decrease ${label}`} onPress={onDecrease} />
      <View className="w-xs" />
      <StepChip icon="plus" label={`Increase ${label}`} onPress={onIncrease} />
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
 * Rest goes through `resolveItemRest`, so the summary and the session agree by
 * construction. It used to cascade through `exercise.defaultRestSeconds`, which
 * is a number the user could neither see nor change — so the line could report a
 * rest the session would not actually run.
 */
function summarizeItem(item: RoutineItem, exercise: Exercise, settingsRestSeconds: number): string {
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
  const rest = resolveItemRest(item, settingsRestSeconds);
  parts.push(rest.seconds > 0 ? `rest ${formatClock(rest.seconds)}` : 'no rest');
  // Which of the two it is, in one word, so the collapsed line carries the same
  // fact the open editor states in a sentence.
  if (rest.source === 'settings' && rest.seconds > 0) parts.push('setting');

  if (exercise.isUnilateral) parts.push('each side');
  return parts.join(' · ');
}
