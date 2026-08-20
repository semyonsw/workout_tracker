/**
 * RoutineEditorScreen — the template, and the order you do it in.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  EDIT ROUTINE                      [ Save ]│
 *   │ ROUTINE NAME                                 │
 *   │ ╭ Pull + swimming|                         ╮ │
 *   │ EXERCISES · 6                                │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ ≡  Weighted 90° pull-ups           ›  ✕  │ │
 *   │ │    4 × 4–6 · rest 3:00                   │ │
 *   │ │ ≡  Wide pull-ups machine           ›  ✕  │ │
 *   │ │ +  Add exercise                          │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │            Delete routine                    │
 *   └──────────────────────────────────────────────┘
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
 * in a glance; tapping the row is what opens them. A routine editor that shows
 * every field inline is a form, and nobody scrolls a form in a gym.
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
} from '../components/primitives';
import { commit, tap, undo } from '../lib/feedback';
import { formatClock, formatDuration } from '../lib/units';
import { palette } from '../theme/tokens';
import type { Exercise, ID, Routine, RoutineItem } from '../types/models';

interface RoutineEditorScreenProps {
  routine: Routine;
  exercisesById: Record<ID, Exercise>;
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
    setMoving({ id: item.id, targetIndex: index });
  };

  /** Release: splice the lifted row into the marked gap and renumber. */
  const drop = () => {
    if (!moving || movingIndex < 0) return setMoving(null);
    undo();

    const without = items.filter((i) => i.id !== moving.id);
    // The gap index counts the list WITHOUT the lifted row, which is what the
    // rendered drop band already represents — no off-by-one correction needed.
    const next = [
      ...without.slice(0, moving.targetIndex),
      items[movingIndex],
      ...without.slice(moving.targetIndex),
    ].map((item, order) => ({ ...item, order }));

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
                  item={item}
                  exercise={exercise}
                  dimmed={moving != null}
                  onPress={() =>
                    moving
                      ? setMoving({ ...moving, targetIndex: index })
                      : onOpenItem(item, draft())
                  }
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
  item,
  exercise,
  dimmed,
  onPress,
  onLongPress,
  onRemove,
}: {
  item: RoutineItem;
  exercise: Exercise;
  dimmed: boolean;
  onPress: () => void;
  onLongPress: () => void;
  /** Absent while reordering — nothing in the list is actionable then. */
  onRemove?: () => void;
}) {
  return (
    <View className="flex-row items-center" style={dimmed ? { opacity: 0.5 } : undefined}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={280}
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name}, ${summarizeItem(item, exercise)}`}
        accessibilityHint="Long press to reorder"
        className="h-row-lg flex-1 flex-row items-center pl-md"
      >
        <DragHandle color={palette.inkFaint} />

        <View className="ml-md flex-1">
          <Text numberOfLines={1} className="text-body font-medium text-ink">
            {exercise.name}
          </Text>
          <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
            {summarizeItem(item, exercise)}
          </Text>
        </View>

        {/* Chevrons vanish while reordering: nothing here opens right now. */}
        {dimmed ? null : (
          <View className="ml-md">
            <Icon name="chevron-right" size={18} color={palette.inkFaint} />
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
 * "4 × 4–6 · rest 3:00 · each side" — everything a routine row needs to say.
 *
 * One line, in the order you need it: how much work, then how long you wait,
 * then the one caveat that changes how you do it.
 */
function summarizeItem(item: RoutineItem, exercise: Exercise): string {
  const parts: string[] = [];

  if (exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds') {
    parts.push(`${item.targetSets} × ${formatDuration(item.targetRepsMax ?? 0)}`);
  } else {
    const { targetRepsMin: min, targetRepsMax: max } = item;
    const range = min && max && min !== max ? `${min}–${max}` : String(max ?? min ?? '');
    parts.push(`${item.targetSets} × ${range}`);
  }

  // Rest is a clock ("3:00") — it is a stopwatch value you watch tick down.
  // A target duration is prose ("3 min") — it is a plan, not a countdown.
  const restSeconds = item.restSeconds ?? exercise.defaultRestSeconds ?? 0;
  parts.push(restSeconds > 0 ? `rest ${formatClock(restSeconds)}` : 'no rest');

  if (exercise.isUnilateral) parts.push('each side');
  return parts.join(' · ');
}
