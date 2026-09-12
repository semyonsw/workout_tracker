/**
 * SequenceScreen — the order you train in, if you train in one.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  TRAINING SEQUENCE                         │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Use this sequence                  [ o ] │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ THE ORDER · 4 STEPS                          │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ 1  Push                     ⌃ ⌄  ✕      │ │
 *   │ │ 2  Pull + swimming   NEXT   ⌃ ⌄  ✕      │ │
 *   │ │ 3  Push                     ⌃ ⌄  ✕      │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ ADD A STEP                                   │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ +  Push                                  │ │
 *   │ │ +  Pull + swimming                       │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │            Start the sequence over           │
 *   └──────────────────────────────────────────────┘
 *
 * OFF AND EMPTY BY DEFAULT. This screen exists for the person who does follow a
 * fixed order — push, pull, push, boxing — and it stays out of the way of the
 * person who decides in the changing room. Nothing here is required to use the
 * app: with the toggle off, the home screen simply lists every routine.
 *
 * Three decisions worth keeping:
 *
 *  • A STEP IS A ROUTINE, AND REPEATS ARE THE POINT. `push → pull → push` is
 *    three steps, two of them the same routine. So steps are added from a list of
 *    routines and identified by position, never deduplicated.
 *  • THE ORDER IS A QUEUE, NOT A CALENDAR. `NEXT` marks the step whose turn it is,
 *    and it advances when a workout from that step is finished — never when the
 *    week does. Tapping any row moves the mark there by hand, which is what
 *    "actually, I did pull yesterday" needs.
 *  • A REPEATED ROUTINE IS STILL ONE ROUTINE, until you say otherwise. That is
 *    right for `push → pull → push` and wrong for a twelve-step loop with three
 *    back days in it, which is the whole reason somebody builds a long loop: the
 *    three back days are variations on a theme, not the same six exercises three
 *    times. `Make it different` gives THIS step its own copy of the routine and
 *    leaves every other step pointing at the original, so the next thing the user
 *    does — swapping two exercises in the editor it opens — changes one step of
 *    the loop and not three. It only appears on a step whose routine is repeated,
 *    because a step that is already unique has nothing to be separated from.
 *  • ⌃ / ⌄ RATHER THAN DRAG. A sequence is four or five rows and this screen is
 *    opened rarely; two arrows are one tap each, obvious, and cost nothing to
 *    learn. The routine editor's long-press-and-slide is worth its complexity for
 *    a list of eighteen exercises, not for this.
 */

import { ScrollView, Pressable, Text, View } from 'react-native';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, ListCard, Separator, TextButton, Toggle } from '../components/primitives';
import { commit, tap, undo } from '../lib/feedback';
import { palette } from '../theme/tokens';
import type { ID, Routine, TrainingSequence } from '../types/models';

interface SequenceScreenProps {
  sequence: TrainingSequence;
  /** Every routine, for the add-a-step list. */
  routines: Routine[];
  onBack: () => void;
  onSetActive: (isActive: boolean) => void;
  onAddStep: (routineId: ID) => void;
  onRemoveStep: (index: number) => void;
  onMoveStep: (index: number, direction: -1 | 1) => void;
  onSetCursor: (index: number) => void;
  /** Open a step's routine in the editor — the way to change what it contains. */
  onEditStep: (routineId: ID) => void;
  /**
   * Give this step its own copy of its routine, and open it.
   *
   * By INDEX, not by routine id, because that is what makes it one step: the same
   * routine at steps 2 and 7 is two steps, and varying the first must leave the
   * second exactly where it was.
   */
  onVaryStep: (index: number) => void;
}

export function SequenceScreen({
  sequence,
  routines,
  onBack,
  onSetActive,
  onAddStep,
  onRemoveStep,
  onMoveStep,
  onSetCursor,
  onEditStep,
  onVaryStep,
}: SequenceScreenProps) {
  const byId = new Map(routines.map((r) => [r.id, r]));
  const steps = sequence.routineIds;
  /** How many steps point at each routine — what decides `Make it different`. */
  const uses = steps.reduce<Record<ID, number>>((count, id) => {
    count[id] = (count[id] ?? 0) + 1;
    return count;
  }, {});

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker="Training sequence"
        subtitle={
          steps.length === 0
            ? 'Off · no steps yet'
            : sequence.isActive
              ? `On · ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`
              : `Off · ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`
        }
        onBack={onBack}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <ListCard className="mx-lg">
          <View className="h-row flex-row items-center px-lg">
            <View className="flex-1 pr-md">
              <Text className="text-body font-medium text-ink">Use this sequence</Text>
              <Text className="mt-[2px] text-label text-ink-faint">
                {steps.length === 0
                  ? 'Add at least one step to turn it on'
                  : 'Suggests the next routine on the home screen'}
              </Text>
            </View>
            <Toggle
              value={sequence.isActive}
              onChange={(value) => {
                tap();
                onSetActive(value);
              }}
              accessibilityLabel="Use this sequence"
            />
          </View>
        </ListCard>

        {steps.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-sm mt-xl">
              The order · {steps.length} {steps.length === 1 ? 'step' : 'steps'}
            </Kicker>
            <ListCard className="mx-lg">
              {steps.map((routineId, index) => (
                <View key={`${routineId}-${index}`}>
                  {index > 0 ? <Separator /> : null}
                  <StepRow
                    position={index + 1}
                    name={byId.get(routineId)?.name ?? 'Deleted routine'}
                    isNext={index === sequence.cursor}
                    /* Both actions need a routine that still exists: a step whose
                       routine was deleted has nothing to open and nothing to copy. */
                    onEdit={byId.has(routineId) ? () => onEditStep(routineId) : undefined}
                    onVary={
                      byId.has(routineId) && (uses[routineId] ?? 0) > 1
                        ? () => onVaryStep(index)
                        : undefined
                    }
                    canMoveUp={index > 0}
                    canMoveDown={index < steps.length - 1}
                    onPressNext={() => {
                      tap();
                      onSetCursor(index);
                    }}
                    onMove={(direction) => {
                      commit();
                      onMoveStep(index, direction);
                    }}
                    onRemove={() => {
                      undo();
                      onRemoveStep(index);
                    }}
                  />
                </View>
              ))}
            </ListCard>
          </>
        ) : null}

        {routines.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-sm mt-xl">Add a step</Kicker>
            <ListCard className="mx-lg">
              {routines.map((routine, index) => (
                <View key={routine.id}>
                  {index > 0 ? <Separator inset={40} /> : null}
                  <Pressable
                    onPress={() => {
                      commit();
                      onAddStep(routine.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${routine.name} to the sequence`}
                    className="h-row flex-row items-center px-lg"
                  >
                    <Icon name="plus" size={14} color={palette.greenBright} />
                    <Text numberOfLines={1} className="ml-md flex-1 text-body font-medium text-ink">
                      {routine.name}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </ListCard>
          </>
        ) : (
          <Text className="mx-lg mt-xl text-body text-ink-muted">
            There are no routines to put in a sequence yet. Make one in the Routines tab first.
          </Text>
        )}

        {steps.length > 1 && sequence.cursor > 0 ? (
          <View className="mx-lg mt-xl">
            <TextButton
              label="Start the sequence over"
              onPress={() => {
                undo();
                onSetCursor(0);
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/** One step: its position, its routine, and the three things you do to it. */
function StepRow({
  position,
  name,
  isNext,
  canMoveUp,
  canMoveDown,
  onPressNext,
  onMove,
  onRemove,
  onEdit,
  onVary,
}: {
  position: number;
  name: string;
  isNext: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPressNext: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  /** Open this step's routine. Absent when the routine is gone. */
  onEdit?: () => void;
  /** Split this step off onto its own copy. Absent unless the routine repeats. */
  onVary?: () => void;
}) {
  return (
    <View className="py-sm">
      <View className="h-row-lg flex-row items-center pl-lg pr-sm">
        <Pressable
          onPress={onPressNext}
          accessibilityRole="button"
          accessibilityLabel={
            isNext ? `${name}, next up` : `${name}, step ${position}. Make it the next one up.`
          }
          className="h-row-lg flex-1 flex-row items-center pr-md"
        >
          <Text className="w-[20px] text-label tabular-nums text-ink-faint">{position}</Text>
          <Text numberOfLines={1} className="ml-sm flex-1 text-body font-medium text-ink">
            {name}
          </Text>
          {isNext ? <Kicker tone="green">next</Kicker> : null}
        </Pressable>

        {/* ⌃ and ⌄ are the chevron rotated by the same 90° the disclosure uses. */}
        <ArrowButton
          direction={-1}
          disabled={!canMoveUp}
          label={`Move ${name} up`}
          onPress={() => onMove(-1)}
        />
        <ArrowButton
          direction={1}
          disabled={!canMoveDown}
          label={`Move ${name} down`}
          onPress={() => onMove(1)}
        />

        <Pressable
          onPress={onRemove}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name} from the sequence`}
          className="h-hit w-[36px] items-center justify-center"
        >
          <Icon name="x" size={15} color={palette.inkMuted} />
        </Pressable>
      </View>

      {/* THE SECOND LINE, and it is text rather than two more icon buttons: the
          row above already carries four targets, and a fifth and sixth at 36 dp
          would push the routine's name down to a word and a half. Indented to the
          name's column so it reads as belonging to this step. */}
      {onEdit || onVary ? (
        <View className="flex-row items-center pl-lg pr-sm">
          <View className="w-[28px]" />
          {onEdit ? (
            <Pressable
              onPress={() => {
                tap();
                onEdit();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Edit the exercises in ${name}`}
              className="h-hit justify-center pr-lg"
            >
              <Text className="text-label font-medium text-ink-muted">edit exercises</Text>
            </Pressable>
          ) : null}
          {onVary ? (
            <Pressable
              onPress={() => {
                commit();
                onVary();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Give this step its own copy of ${name}, so it can hold different exercises`}
              className="h-hit justify-center"
            >
              <Text className="text-label font-medium text-green-bright">make it different</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ArrowButton({
  direction,
  disabled,
  label,
  onPress,
}: {
  direction: -1 | 1;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="h-hit w-[30px] items-center justify-center"
      style={{ transform: [{ rotate: direction === -1 ? '180deg' : '0deg' }] }}
    >
      <Icon name="chevron-down" size={18} color={disabled ? palette.hairline : palette.inkMuted} />
    </Pressable>
  );
}
