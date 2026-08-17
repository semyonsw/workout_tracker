/**
 * RoutineEditorScreen — the template, and the order you do it in.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  EDIT ROUTINE                      [ Save ]│
 *   │ ROUTINE NAME                                 │
 *   │ ╭ Pull + swimming|                         ╮ │
 *   │ EXERCISES · 6                                │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ ≡  Weighted 90° pull-ups              ›  │ │
 *   │ │    4 × 4–6 · rest 3:00                   │ │
 *   │ │ ≡  Wide pull-ups machine              ›  │ │
 *   │ │ +  Add exercise                          │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │            Delete routine                    │
 *   └──────────────────────────────────────────────┘
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
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
import { commit, undo } from '../lib/feedback';
import { formatClock, formatDuration } from '../lib/units';
import { palette } from '../theme/tokens';
import type { Exercise, ID, Routine, RoutineItem } from '../types/models';

interface RoutineEditorScreenProps {
  routine: Routine;
  exercisesById: Record<ID, Exercise>;
  onBack: () => void;
  /** Commits the working name and order together — this screen is one draft. */
  onSave: (patch: { name: string; items: RoutineItem[] }) => void;
  onOpenItem: (item: RoutineItem) => void;
  onAddExercise: () => void;
  onDelete: () => void;
}

export function RoutineEditorScreen({
  routine,
  exercisesById,
  onBack,
  onSave,
  onOpenItem,
  onAddExercise,
  onDelete,
}: RoutineEditorScreenProps) {
  /** Working name and order. Committed only on Save — this screen is a draft. */
  const [name, setName] = useState(routine.name);
  const [items, setItems] = useState<RoutineItem[]>(() =>
    [...routine.items].sort((a, b) => a.order - b.order),
  );
  /** The row in the air, and where it would land. null = not reordering. */
  const [moving, setMoving] = useState<{ id: ID; targetIndex: number } | null>(null);

  const movingIndex = moving ? items.findIndex((i) => i.id === moving.id) : -1;
  const movingItem = movingIndex >= 0 ? items[movingIndex] : null;
  const movingExercise = movingItem ? exercisesById[movingItem.exerciseId] : null;

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

  const rest = items.filter((i) => (moving ? i.id !== moving.id : true));

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker={
          moving && movingExercise
            ? `Moving · ${movingExercise.name}`
            : 'Edit routine'
        }
        kickerTone={moving ? 'green' : 'faint'}
        onBack={moving ? undefined : onBack}
        action={{
          label: 'Save',
          // Demoted mid-move: saving is not the thing to do with a row in the air.
          tone: moving ? 'muted' : 'primary',
          onPress: moving ? drop : () => onSave({ name, items }),
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!moving}
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
                  onPress={() => (moving ? setMoving({ ...moving, targetIndex: index }) : onOpenItem(item))}
                  onLongPress={() => (moving ? undefined : lift(item, index))}
                />
              </View>
            );
          })}

          {/* The gap can also be the very end of the list. */}
          {moving?.targetIndex === rest.length ? <DropGap /> : null}

          {moving ? null : (
            <>
              <Separator inset={0} />
              <AddRow label="Add exercise" onPress={onAddExercise} />
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
  );
}

/* ------------------------------------------------------------------ */

function RoutineRow({
  item,
  exercise,
  dimmed,
  onPress,
  onLongPress,
}: {
  item: RoutineItem;
  exercise: Exercise;
  dimmed: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${summarizeItem(item, exercise)}`}
      accessibilityHint="Long press to reorder"
      style={dimmed ? { opacity: 0.5 } : undefined}
      className="h-row-lg flex-row items-center pl-md pr-lg"
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
