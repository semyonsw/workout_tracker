/**
 * ExerciseCard — one exercise inside the active session.
 *
 * Collapsed (not the current exercise):
 *   ┌────────────────────────────────────────────┐
 *   │ Wide pull-ups machine               0/4  ● │  ← ● = a nudge is waiting
 *   │ 80 kg · 8 6 5 5                            │
 *   └────────────────────────────────────────────┘
 *
 * Expanded (current exercise): header + overload nudge + set rows + a footer of
 * `Add set` / `Remove set`, and `Rest` under them.
 *
 * Only one card is expanded at a time. That is the whole navigation model of the
 * logging screen — no tabs, no per-exercise route, no back button. The user
 * moves down the list as they move through the gym.
 *
 * The collapsed signal for a waiting overload suggestion is a single 6px dot.
 * Not a badge, not a chip, not a count: the suggestion is not urgent, it just
 * needs to be findable.
 *
 * ── SUPERSETS READ AS A BRACKET ─────────────────────────────────────────────
 *
 * A member of a superset carries a 2 dp `green-dim` rule down its left edge, and
 * the members of one group carry it continuously, so a pair reads as one block.
 * The same vocabulary the routine editor's drop target uses, for the same reason:
 * `green-dim` means "these belong together", never "something is wrong". No second
 * hue, no label, no badge — the behaviour speaks for itself the first time a ✓
 * moves the cursor sideways instead of starting a rest.
 *
 * A group of ONE renders no rule. `supersetPosition` decides that, not this
 * component: a bracket around a single exercise says nothing, and one is easy to
 * produce by removing a partner mid-session.
 *
 * ── `ADD SET` AND `REMOVE SET` ARE ONE CONTROL, SPLIT IN TWO ────────────────
 *
 * Sets are decided in the gym: four today, three when the fourth isn't there. The
 * two halves of the footer are the whole of that decision, they cost one tap each,
 * and `Remove set` always takes the BOTTOM row — the one that hasn't happened yet.
 * On an exercise down to its last row it relabels itself `Remove exercise`, because
 * that is what removing that row does (see `activeWorkoutStore.removeSet`); the
 * label changes so the outcome is never a surprise.
 *
 * A long press LIFTS the card for reordering. The gesture and the movement live in
 * the screen (it owns the geometry of the list); this component only reports the
 * press and renders the two states it puts a card into — `lifted`, which follows
 * the finger, and `dimmed`, which is every other card while one is in the air. Same
 * language as the routine editor's reorder, deliberately.
 */

import { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { DraftEntry, DraftSet } from '../lib/draft';
import { formatTarget, workingSetLabels } from '../lib/draft';
import { tap, undo } from '../lib/feedback';
import { isTimed as isTimedExercise } from '../lib/setTimer';
import { formatClock } from '../lib/units';
import type { ID, UnitSystem } from '../types/models';
import { palette } from '../theme/tokens';
import { Icon } from './Icon';
import { OverloadNudge } from './OverloadNudge';
import { QuickAdjust } from './QuickAdjust';
import { SetRow, type SetField } from './SetRow';

interface ExerciseCardProps {
  entry: DraftEntry;
  isActive: boolean;
  unitSystem: UnitSystem;
  /**
   * Where this card sits in a superset run. Computed by the screen, which is the
   * only place that can see the cards either side of this one.
   */
  superset?: 'none' | 'start' | 'continue';
  /** The set in this card whose clock is running, if any. */
  timingSetId?: ID | null;
  /** This card is being dragged: it follows the finger and marks itself. */
  isLifted?: boolean;
  /** Another card is being dragged, so this one is not the subject right now. */
  dimmed?: boolean;
  onActivate: () => void;
  /** Long press — the screen turns this into a drag. Absent = not reorderable. */
  onLift?: () => void;
  onToggleSet: (setId: ID) => void;
  onPatchSet: (setId: ID, patch: Partial<DraftSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: ID) => void;
  /** Drop the bottom row, or the whole exercise when that row is the last one. */
  onRemoveLastSet: () => void;
  onAcceptOverload: () => void;
  onDismissOverload: () => void;
  /** Start the clock for a set, or stop the one already running on it. */
  onPressTimer: (setId: ID) => void;
  /**
   * The user's between-sets rest, in seconds — what the `Rest` button will run.
   * Read live from Settings by the screen, so the button's label and the timer it
   * starts are the same number.
   */
  restSeconds?: number;
  /**
   * Start a rest by hand. Only the expanded card gets it, and it is the answer to
   * "auto-rest is off, so how do I run a rest at all" — plus the way back from a
   * `Skip` you didn't mean.
   */
  onStartRest?: () => void;
}

function ExerciseCardComponent({
  entry,
  isActive,
  unitSystem,
  superset = 'none',
  timingSetId = null,
  isLifted = false,
  dimmed = false,
  onActivate,
  onLift,
  onToggleSet,
  onPatchSet,
  onAddSet,
  onRemoveSet,
  onRemoveLastSet,
  onAcceptOverload,
  onDismissOverload,
  onPressTimer,
  restSeconds = 0,
  onStartRest,
}: ExerciseCardProps) {
  /** Which set row has the editor open, and on which field. Card-local state. */
  const [focus, setFocus] = useState<{ setId: ID; field: SetField } | null>(null);

  const completed = entry.sets.filter((s) => s.isCompleted).length;
  const total = entry.sets.length;
  const allDone = completed === total && total > 0;
  const nextSetId = entry.sets.find((s) => !s.isCompleted)?.localId ?? null;
  /*
   * W, 1, 2, 3 — warm-ups are not numbered as working sets, and the working sets
   * number around them. Derived in `lib/draft.ts`: it is arithmetic over the list,
   * and a component subtracting a running count from an index is a component with
   * a state machine in it.
   */
  const setLabels = workingSetLabels(entry.sets);
  const nudgeWaiting = entry.overload.shouldNudge && !entry.overloadAccepted;
  const isRounds = entry.exercise.countUnit === 'rounds';
  const isTimed = isTimedExercise(entry.exercise);
  const unit = isRounds ? 'round' : 'set';
  /* The last row cannot be removed without the exercise going with it. Say so. */
  const removeLabel = total <= 1 ? 'Remove exercise' : `Remove ${unit}`;

  /* ---------------------------------------------------------------- */
  /* Collapsed                                                         */
  /* ---------------------------------------------------------------- */
  if (!isActive) {
    return (
      <Pressable
        onPress={onActivate}
        onLongPress={onLift}
        delayLongPress={280}
        accessibilityRole="button"
        accessibilityLabel={`${entry.exercise.name}, ${completed} of ${total} sets done${
          nudgeWaiting ? ', suggestion waiting' : ''
        }${superset === 'none' ? '' : ', part of a superset'}`}
        accessibilityHint={onLift ? 'Long press, then slide to reorder' : undefined}
        style={dimmed ? { opacity: 0.4 } : undefined}
        className={[
          'mx-lg mb-sm rounded-surface border p-lg',
          isLifted ? 'border-green-dim bg-surface-alt' : 'border-hairline bg-surface',
          /*
           * The bracket, as a left border rather than an extra View: a collapsed
           * card is one Pressable and threading a sibling through it would mean
           * wrapping every card in a row just to draw 2 px. `border-l-2` reads as
           * the same rule the expanded card draws beside its set list.
           */
          superset === 'none' ? '' : 'border-l-2 border-l-green-dim',
        ].join(' ')}
      >
        <View className="flex-row items-center">
          <Text
            numberOfLines={1}
            className={`flex-1 text-body font-semibold ${allDone ? 'text-ink-faint' : 'text-ink'}`}
          >
            {entry.exercise.name}
          </Text>

          {/* Progress as text, not a bar: it reads faster and costs no colour.
              Shifted 14 left when a dot is present so the two never collide. */}
          <Text
            className={[
              'ml-md text-label font-medium tabular-nums text-ink-faint',
              nudgeWaiting ? 'mr-[14px]' : '',
            ].join(' ')}
          >
            {completed}/{total}
          </Text>
          {allDone ? (
            <View className="ml-sm">
              <Icon name="check" size={14} color={palette.inkFaint} />
            </View>
          ) : null}
        </View>

        {/* One line of context: what happened last time. */}
        {entry.lastSessionSummary ? (
          <Text className="mt-xs text-label tabular-nums text-ink-faint">
            {entry.lastSessionSummary}
          </Text>
        ) : null}

        {nudgeWaiting ? (
          <View className="absolute right-lg top-[19px] h-[6px] w-[6px] rounded-pill bg-green-bright" />
        ) : null}
      </Pressable>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Expanded                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <View className="mb-xl" style={dimmed ? { opacity: 0.4 } : undefined}>
      {/* Header — name, then the target, then what it was last time. The last
          clause drops to ink-faint: it's reference, not instruction. It is also
          the expanded card's grab handle: long-pressing a set row would fight the
          row's own controls, and this is the one part of the card that isn't one. */}
      <Pressable
        onLongPress={onLift}
        delayLongPress={280}
        accessibilityRole={onLift ? 'button' : 'header'}
        accessibilityLabel={entry.exercise.name}
        accessibilityHint={onLift ? 'Long press, then slide to reorder' : undefined}
        className="mx-lg mb-md"
      >
        <Text
          className={['text-title font-medium', isLifted ? 'text-green-bright' : 'text-ink'].join(
            ' ',
          )}
        >
          {entry.exercise.name}
        </Text>
        <Text className="mt-xs text-label tabular-nums text-ink-muted">
          {formatTarget(entry)}
          {entry.exercise.isUnilateral ? (
            <Text className="text-label text-ink-faint"> · each side</Text>
          ) : null}
          {entry.lastSessionShort ? (
            <Text className="text-label text-ink-faint"> · last: {entry.lastSessionShort}</Text>
          ) : null}
        </Text>
      </Pressable>

      <OverloadNudge
        verdict={entry.overload}
        unitSystem={unitSystem}
        loadMode={entry.exercise.loadMode}
        countUnit={entry.exercise.countUnit}
        resolved={entry.overloadAccepted}
        onAccept={onAcceptOverload}
        onDismiss={onDismissOverload}
      />

      <View
        className={[
          'mx-lg overflow-hidden rounded-surface border bg-surface',
          isLifted ? 'border-green-dim' : 'border-hairline',
          superset === 'none' ? '' : 'border-l-2 border-l-green-dim',
        ].join(' ')}
      >
        {entry.sets.map((set, index) => (
          <View key={set.localId}>
            {/* Separators inset 16 from the left, so the index column reads as
                one continuous ruler down the card. */}
            {index > 0 ? <View className="ml-lg h-hairline bg-hairline" /> : null}

            <SetRow
              set={set}
              workingNumber={setLabels[index]}
              exercise={entry.exercise}
              unitSystem={unitSystem}
              isNext={set.localId === nextSetId}
              focusedField={focus?.setId === set.localId ? focus.field : null}
              isTimed={isTimed}
              isTiming={timingSetId === set.localId}
              onPressTimer={() => {
                setFocus(null); // the clock and the editor never share the row
                onPressTimer(set.localId);
              }}
              onFocusField={(field) =>
                setFocus((current) =>
                  // Tapping the open field again closes the panel.
                  current?.setId === set.localId && current.field === field
                    ? null
                    : { setId: set.localId, field },
                )
              }
              onToggleComplete={() => {
                setFocus(null); // committing a set always closes the editor
                onToggleSet(set.localId);
              }}
            />

            {focus?.setId === set.localId ? (
              <QuickAdjust
                field={focus.field}
                set={set}
                exercise={entry.exercise}
                unitSystem={unitSystem}
                onChange={(patch) => onPatchSet(set.localId, patch)}
                onClose={() => setFocus(null)}
                onRemoveSet={() => {
                  setFocus(null);
                  onRemoveSet(set.localId);
                }}
              />
            ) : null}
          </View>
        ))}

        {/* Full-bleed hairline: the footer is not a set, so its rule isn't inset. */}
        <View className="h-hairline bg-hairline" />
        <View className="flex-row">
          <Pressable
            onPress={() => {
              tap();
              onAddSet();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Add ${unit}`}
            className="h-row flex-1 flex-row items-center justify-center"
          >
            <Icon name="plus" size={14} color={palette.inkFaint} />
            <Text className="ml-sm text-label text-ink-muted">Add {unit}</Text>
          </Pressable>

          {/* The opposite mark in the opposite half: `−` is `+` with its vertical
              stroke removed, the same pairing the library uses for add and delete.
              It always takes the BOTTOM row — the one that hasn't happened. */}
          <View className="w-hairline bg-hairline" />
          <Pressable
            onPress={() => {
              undo();
              onRemoveLastSet();
            }}
            accessibilityRole="button"
            accessibilityLabel={removeLabel}
            className="h-row flex-1 flex-row items-center justify-center"
          >
            <Icon name="minus" size={14} color={palette.inkFaint} />
            <Text className="ml-sm text-label text-ink-muted">{removeLabel}</Text>
          </Pressable>
        </View>

        {/* Rest, on demand — its own row under the two set controls rather than a
            third of the same one: it is not about the set count, and three targets
            in one 56 dp row is one mis-tap wide. Not on the pill either, because
            the pill does not exist when there is no rest to show. */}
        {onStartRest && restSeconds > 0 ? (
          <>
            <View className="h-hairline bg-hairline" />
            <Pressable
              onPress={onStartRest}
              accessibilityRole="button"
              accessibilityLabel={`Start a ${formatClock(restSeconds)} rest`}
              className="h-row flex-row items-center justify-center"
            >
              <Icon name="pause" size={13} color={palette.inkFaint} />
              <Text className="ml-sm text-label tabular-nums text-ink-muted">
                Rest {formatClock(restSeconds)}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

export const ExerciseCard = memo(ExerciseCardComponent);
