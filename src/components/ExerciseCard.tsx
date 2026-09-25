/**
 * ExerciseCard — one exercise inside the active session.
 *
 * Collapsed (not the current exercise):
 *   ┌────────────────────────────────────────────┐
 *   │ Wide pull-ups machine               0/4  ● │  ← ● = a nudge is waiting
 *   │ 80 kg · 8 6 5 5                            │
 *   └────────────────────────────────────────────┘
 *
 * Expanded: header + overload nudge + set rows + a footer of `Add set` /
 * `Remove set`, and `Rest` under them.
 *
 * At most one card is expanded at a time, and NONE is a legal answer — tapping the
 * open card's header shuts it. That is the whole navigation model of the logging
 * screen: no tabs, no per-exercise route, no back button. The user moves down the
 * list as they move through the gym, and can shut the list down to eight names when
 * what they want is the shape of the session rather than the numbers in it.
 *
 * ── OPEN IS NOT THE SAME AS UP NEXT ─────────────────────────────────────────
 *
 * `isExpanded` is "this card is showing its sets". `upNextSetId` is "the one set
 * of the whole session that should happen next is this one, and it is in here" —
 * a fact about the LOG, computed by `lib/upNext.ts` and handed down. They usually
 * agree, and the two moments they do not are exactly the two moments the
 * distinction earns itself: the user has shut the card they are on, and the user
 * is reading a card further down the list. Opening a card to read it does not move
 * the mark; only a ✓ does.
 *
 * THE CARD HOLDING THE NEXT SET IS MARKED IN GREEN, the same green in both states:
 *
 *   • Shut — the name goes `green-bright` and the card takes a green ring. With
 *     everything closed this is the only thing on screen saying where you are.
 *   • Open — the ring is not repeated (the open card is obviously the subject);
 *     the mark moves INSIDE, onto the one set row that should happen next. See
 *     `SetRow`'s `isUpNext`.
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
 * ── THE PLAN IS BEHIND THE ✎ ────────────────────────────────────────────────
 *
 * An open card used to carry every control that changes the PLAN — `Add set`,
 * `Remove set`, `Warm-up`, `Edit exercise`, `Remove exercise` — under its sets,
 * all the time, on every card, for the whole session. Those are decisions made
 * two or three times a workout, and they sat a thumb's width from the ✓ that is
 * pressed sixty times. So they moved behind a 36 dp ✎ beside the card's name.
 *
 *   • OUTSIDE EDIT MODE the footer is one row: `⏸ Rest 1:30 | ▶ Focus`. Rest on
 *     demand, and the door into focus mode on the card that holds the next set.
 *   • IN EDIT MODE the ✎ becomes a green `Done` pill, `EDITING PLAN` appears over
 *     the name, every set row grows its own coral `−` (so you remove the set you
 *     mean, not the bottom one), and the footer becomes `+ Add set`, `+ Warm-up`
 *     (only before anything is logged), `✎ Rest, targets and cue`, and a coral
 *     `− Remove exercise`.
 *
 * Edit mode belongs to the SCREEN, not to the card (`editingExerciseId`): at most
 * one card is in it, and it ends only on `Done`. Shutting the card or logging a
 * set does not end it — a user in the middle of reshaping an exercise who logs a
 * set on the way has not said they are finished reshaping it.
 *
 * ── ROWS ARRIVE AND LEAVE ───────────────────────────────────────────────────
 *
 * A row added — `Add set`, a warm-up, an Undo — grows in from zero height; a row
 * removed slides right and closes, and only THEN leaves the store (`GrowIn`). The
 * last row of an exercise is not removed on its own: removing it is removing the
 * exercise, so it goes through the same path `Remove exercise` does, and gets the
 * same Undo.
 *
 * ── `REMOVE EXERCISE` NO LONGER ASKS ────────────────────────────────────────
 *
 * It animates out and the screen shows `Removed Barbell row · Undo` for 4.5 s.
 * Sets already logged come back with the Undo, which is what the old sheet was
 * protecting; a question on every removal was that protection charged to the
 * nine removals out of ten that were meant.
 *
 * A long press LIFTS the card for reordering. The gesture and the movement live in
 * the screen (it owns the geometry of the list); this component only reports the
 * press and renders the two states it puts a card into — `lifted`, which follows
 * the finger, and `dimmed`, which is every other card while one is in the air. Same
 * language as the routine editor's reorder, deliberately.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { DraftEntry, DraftSet } from '../lib/draft';
import { formatTarget, workingSetLabels } from '../lib/draft';
import { tap, undo } from '../lib/feedback';
import { isTimed as isTimedExercise } from '../lib/setTimer';
import { formatClock } from '../lib/units';
import type { ID, UnitSystem } from '../types/models';
import { curve, danger, glow as GLOW, motion, palette } from '../theme/tokens';
import { Icon } from './Icon';
import { useLanguage, useT } from '../hooks/useT';
import { useMotionScale } from '../hooks/useMotionScale';
import { GrowIn, Pop, Stagger, usePressScale } from './motion';
import { OverloadNudge } from './OverloadNudge';
import { Pressable } from './Pressable';
import { QuickAdjust } from './QuickAdjust';
import { RollingNumber } from './RollingNumber';
import { RunningText } from './RunningText';
import { SetRow, type SetField } from './SetRow';

interface ExerciseCardProps {
  entry: DraftEntry;
  /** This card is showing its sets. At most one card in the list is. */
  isExpanded: boolean;
  /**
   * THE session's next set, when it is one of this card's — otherwise null.
   *
   * Decided by `lib/upNext.ts` off what has been logged, not by which card is
   * open: reaching down the list to read an exercise must not move the mark off
   * the set you are about to do. Exactly one card in the list gets a non-null
   * value, and it is the card that glows. See the file header.
   */
  upNextSetId?: ID | null;
  unitSystem: UnitSystem;
  /**
   * Where this card sits in a superset run. Computed by the screen, which is the
   * only place that can see the cards either side of this one.
   */
  superset?: 'none' | 'start' | 'continue';
  /** The set in this card whose clock is running, if any. */
  timingSetId?: ID | null;
  /**
   * The gym's plates, from Settings — for the `20 + 2×10` line under a barbell
   * lift's weight cell. Passed straight through; only `SetRow` reads it, and only
   * for an exercise that declares a bar weight.
   */
  availablePlatesKg?: readonly number[];
  /** This card is being dragged: it follows the finger and marks itself. */
  isLifted?: boolean;
  /** Another card is being dragged, so this one is not the subject right now. */
  dimmed?: boolean;
  /**
   * Open focus mode on the session's next set.
   *
   * Only handed to the card that HOLDS that set (see `upNextSetId`), because focus
   * mode always shows the work: a `Focus` row on a card you opened to read would
   * take you somewhere else in the session, which is the same confusion the glow
   * was moved off the cursor to avoid.
   */
  onOpenFocus?: () => void;
  /** Tap: open this card, or shut it when it is already the open one. */
  onToggleExpanded: () => void;
  /** Long press — the screen turns this into a drag. Absent = not reorderable. */
  onLift?: () => void;
  onToggleSet: (setId: ID) => void;
  onPatchSet: (setId: ID, patch: Partial<DraftSet>) => void;
  onAddSet: () => void;
  /**
   * Take one row out of the STORE. Called after the row's exit animation, never
   * before — and never for the last row, which goes through `onRemoveExercise`.
   */
  onRemoveSet: (setId: ID) => void;
  /**
   * Session edit mode is on for THIS card — see the file header. The screen owns
   * it, so at most one card is ever in it.
   */
  isEditing?: boolean;
  /** The ✎ and the `Done` pill. Absent = no edit mode on this card. */
  onToggleEditing?: () => void;
  onAcceptOverload: () => void;
  onDismissOverload: () => void;
  /**
   * Put generated warm-up rows on top of this exercise.
   *
   * Absent = no control, which is what an exercise with nothing to warm up for
   * should get rather than a row that does nothing: unweighted work, a session
   * already under way, or a working weight the plates cannot make a fraction of.
   * The SCREEN decides that, because deciding it needs the gym's plates and
   * `lib/warmup.ts`; the card only renders the offer and names what it will add.
   */
  onAddWarmup?: () => void;
  /** "40 × 5 · 60 × 5 · 80 × 3" — what `onAddWarmup` is about to do. */
  warmupSummary?: string | null;
  /**
   * A best this exercise has broken IN THIS SESSION, already logged: "85 kg × 5".
   *
   * The screen computes it, because comparing a row against the standing bests
   * needs the bodyweight of today and `lib/records.ts`, and a card is composition.
   * Null — the normal case — renders nothing at all.
   */
  bestLine?: string | null;
  /**
   * "3 sessions at 80 kg without a rep. One session at 67.5 kg resets it."
   *
   * Computed by the screen — it needs the gym's plates and `lib/deload.ts` — and
   * null on all but a genuinely stalled movement, which is most of them most of
   * the time.
   */
  deloadMessage?: string | null;
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
  /**
   * Drop this exercise, sets and all — edit mode's `Remove exercise`, and the `−`
   * on its last row. The screen animates the card out and offers the Undo.
   */
  onRemoveExercise?: () => void;
  /**
   * Open the exercise editor on THIS movement, mid-workout.
   *
   * The rest between its sets, the weight and count it starts at, how many sets it
   * plans, its ladder, its clock — every one of those is a fact you discover while
   * doing the exercise, and every one of them lived behind three screens: leave the
   * session, find the Library tab, open the tree, find the row. Nobody does that
   * between sets, so the numbers stayed wrong.
   *
   * The edit lands on this card immediately — `activeWorkoutStore.syncExercise`,
   * called by the shell — because an edit made on the open card that only took
   * effect next Tuesday would be the same "I changed it and nothing happened" that
   * `lib/rest.ts` is about.
   */
  onEditExercise?: () => void;
}

function ExerciseCardComponent({
  entry,
  isExpanded,
  upNextSetId = null,
  unitSystem,
  superset = 'none',
  availablePlatesKg,
  timingSetId = null,
  isLifted = false,
  dimmed = false,
  onOpenFocus,
  onToggleExpanded,
  onLift,
  onToggleSet,
  onPatchSet,
  onAddSet,
  onRemoveSet,
  isEditing = false,
  onToggleEditing,
  onAcceptOverload,
  onDismissOverload,
  onAddWarmup,
  warmupSummary,
  bestLine,
  deloadMessage,
  onPressTimer,
  restSeconds = 0,
  onStartRest,
  onRemoveExercise,
  onEditExercise,
}: ExerciseCardProps) {
  /** Which set row has the editor open, and on which field. Card-local state. */
  const t = useT();
  const lang = useLanguage();
  const [focus, setFocus] = useState<{ setId: ID; field: SetField } | null>(null);
  /** Rows on their way out — still drawn, closing, and not yet out of the store. */
  const [leaving, setLeaving] = useState<ReadonlySet<ID>>(() => new Set());
  /**
   * The rows this card has already drawn, so a row it has NOT is one that just
   * arrived and grows in. Seeded with what was there at mount: opening a card is
   * not four rows arriving.
   */
  const known = useRef<Set<ID>>(new Set(entry.sets.map((s) => s.localId)));
  useEffect(() => {
    for (const set of entry.sets) known.current.add(set.localId);
  }, [entry.sets]);

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
  const unit = isRounds ? t('round') : t('set');

  /**
   * The `−` on a row. The LAST row is the exercise — see the file header — so it
   * is handed to the screen's removal, Undo and all, rather than to the store.
   */
  const removeRow = (setId: ID) => {
    undo();
    setFocus(null);
    const remaining = entry.sets.filter((s) => !leaving.has(s.localId)).length;
    if (remaining <= 1) {
      onRemoveExercise?.();
      return;
    }
    setLeaving((current) => new Set(current).add(setId));
  };

  /* ---------------------------------------------------------------- */
  /* Collapsed                                                         */
  /* ---------------------------------------------------------------- */
  if (!isExpanded) {
    /*
     * The glow. Only on the card holding the session's next set — which already
     * means it has a set left — and only while nothing is being dragged: a green
     * ring on a dimmed card in a list where another card is in the air is two
     * signals fighting.
     *
     * `boxShadow` is the app's one deliberate exception to "exactly one shadow"
     * (`theme/tokens.ts`), and it is spent here because this mark has to be
     * findable at arm's length on a bench. It is decoration on top of the border,
     * never instead of it: on a renderer that ignores it the green ring and the
     * green name still say everything.
     */
    const glowing = upNextSetId != null && !isLifted && !dimmed;
    return (
      <Pressable
        onPress={onToggleExpanded}
        onLongPress={onLift}
        delayLongPress={280}
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={`${t('{name}, {done} of {total} sets done', {
          name: entry.exercise.name,
          done: completed,
          total,
        })}${glowing ? `, ${t('your next set is in here')}` : ''}${
          nudgeWaiting ? `, ${t('suggestion waiting')}` : ''
        }${superset === 'none' ? '' : `, ${t('part of a superset')}`}`}
        accessibilityHint={onLift ? t('Long press, then slide to reorder') : undefined}
        style={[
          dimmed ? { opacity: 0.4 } : null,
          glowing ? { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 18, color: GLOW }] } : null,
        ]}
        className={[
          'mx-lg mb-sm rounded-surface border p-lg',
          isLifted
            ? 'border-green-dim bg-surface-alt'
            : glowing
              ? 'border-green-bright bg-surface-alt'
              : 'border-hairline bg-surface',
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
          {/* The name RUNS rather than ellipsising: two machines whose names
              differ only at the end are two exercises. See `RunningText`. */}
          <RunningText
            text={entry.exercise.name}
            containerStyle={{ flex: 1 }}
            fadeColor={isLifted || glowing ? palette.surfaceAlt : palette.surface}
            className={[
              'text-body font-semibold',
              glowing ? 'text-green-bright' : allDone ? 'text-ink-faint' : 'text-ink',
            ].join(' ')}
          />

          {/* The waiting suggestion: one 6 px dot, never a badge. */}
          {nudgeWaiting ? (
            <View
              className="ml-md h-[6px] w-[6px] rounded-pill bg-green-bright"
              style={{
                boxShadow: [
                  { offsetX: 0, offsetY: 0, blurRadius: 8, color: 'rgba(63,169,108,0.8)' },
                ],
              }}
            />
          ) : null}

          {/* Progress as text, rolled when a set lands, and as a ring beside it:
              the text for reading, the ring for the shape of the list at a glance. */}
          <RollingNumber
            value={`${completed}/${total}`}
            lineHeight={18}
            duration={450}
            containerStyle={{ marginLeft: 10 }}
            className="text-label font-medium text-ink-faint"
          />
          <View className="ml-sm">
            <MiniRing fraction={total > 0 ? completed / total : 0} done={allDone} />
          </View>
        </View>

        {/* One line of context: what happened last time. */}
        {entry.lastSessionSummary ? (
          <Text className="mt-xs text-label tabular-nums text-ink-faint">
            {entry.lastSessionSummary}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Expanded                                                          */
  /* ---------------------------------------------------------------- */
  const showRest = onStartRest != null && restSeconds > 0;
  const showFocus = onOpenFocus != null;

  return (
    <View className="mb-xl mt-xs" style={dimmed ? { opacity: 0.4 } : undefined}>
      {/* Header — name, then the target, then what it was last time. The last
          clause drops to ink-faint: it's reference, not instruction. It is also
          the expanded card's grab handle: long-pressing a set row would fight the
          row's own controls, and this is the one part of the card that isn't one. */}
      <View className="mx-lg mb-md flex-row items-start">
        <Pressable
          onPress={onToggleExpanded}
          onLongPress={onLift}
          delayLongPress={280}
          accessibilityRole="button"
          accessibilityState={{ expanded: true }}
          accessibilityLabel={entry.exercise.name}
          accessibilityHint={
            onLift
              ? t('Tap to close its sets. Long press, then slide to reorder')
              : t('Tap to close its sets')
          }
          className="flex-1"
        >
          {/* The mode, said in words over the name, for as long as it lasts. */}
          {isEditing ? (
            <Stagger rise={6} duration={240}>
              <Text className="mb-xs text-micro font-semibold uppercase text-green-bright">
                {t('Editing plan')}
              </Text>
            </Stagger>
          ) : null}
          <Text
            className={['text-title font-medium', isLifted ? 'text-green-bright' : 'text-ink'].join(
              ' ',
            )}
          >
            {entry.exercise.name}
          </Text>
          <Text className="mt-xs text-label tabular-nums text-ink-muted">
            {formatTarget(entry, lang)}
            {entry.exercise.isUnilateral ? (
              <Text className="text-label text-ink-faint"> · {t('each side')}</Text>
            ) : null}
            {entry.lastSessionShort ? (
              <Text className="text-label text-ink-faint">
                {' '}
                · {t('last: {what}', { what: entry.lastSessionShort })}
              </Text>
            ) : null}
          </Text>

          {/*
            A BEST, ONCE IT HAS HAPPENED — and only once it has.

            Appended to this line rather than given a block of its own, because it is
            the same kind of statement as `last:`: what the log now says about this
            movement. `green-bright` is the app's one accent and it is doing the same
            job here it does everywhere else — this is new — but there is no medal, no
            banner and no sound. `lib/records.ts` has the argument: other trackers
            announce a PR mid-set, and that is a different product's idea of why
            somebody trains.
          */}
          {bestLine ? (
            <Text className="mt-xs text-label tabular-nums text-green-bright">
              {t('New best')} · {bestLine}
            </Text>
          ) : null}

          {/* THE CUE. Only on the OPEN card — this whole block is the expanded
              header — because that is the card you are working out of, and a
              reminder about elbow position on four collapsed rows is noise. Faint
              and single-line: it is reference, and it must never compete with the
              numbers below it. */}
          {entry.exercise.cue ? (
            <Text numberOfLines={1} className="mt-xs text-label text-ink-faint">
              {entry.exercise.cue}
            </Text>
          ) : null}
        </Pressable>

        {/* THE DOOR INTO EDIT MODE, and the way out of it. */}
        {onToggleEditing ? (
          isEditing ? (
            <DonePill onPress={onToggleEditing} />
          ) : (
            <EditCircle onPress={onToggleEditing} name={entry.exercise.name} />
          )
        ) : null}

        {/* The affordance for shutting it. `chevron-down` is what the routine
            editor's open row uses, for the same "this closes" meaning. */}
        <Pressable
          onPress={onToggleExpanded}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('Tap to close its sets')}
          className="ml-xs h-[36px] w-[36px] items-center justify-center"
        >
          <Icon name="chevron-down" size={18} color={palette.inkFaint} />
        </Pressable>
      </View>

      {/*
        A STALL, stated and nothing else — no `Use` button beside it.

        The nudge below it is an offer, because "add 2.5 kg" is one number written
        into the unlogged sets and trivially undone. Cutting a session's weight is a
        decision about a training block, and an app that took it on one tap would be
        rewriting a plan off three data points. So this is a sentence, in the plain
        `surface-alt` a fact gets, rather than the `green-wash` the app reserves for
        progressive overload. `lib/deload.ts` has the argument.

        It renders only when the nudge does not: two contradictory suggestions —
        "add a rep" and "take some weight off" — on one card is one of them wrong,
        and the screen picks the deload because three failed sessions is newer
        information than a stale weight.
      */}
      {deloadMessage ? (
        <View className="mx-lg mb-sm flex-row items-center rounded-surface bg-surface-alt py-md pl-lg pr-lg">
          <Icon name="trending-down" size={16} color={palette.inkMuted} />
          <Text className="ml-md flex-1 text-label tabular-nums text-ink-muted">
            {deloadMessage}
          </Text>
        </View>
      ) : null}

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
          <GrowIn
            key={set.localId}
            appear={!known.current.has(set.localId)}
            leaving={leaving.has(set.localId)}
            onLeft={() => {
              setLeaving((current) => {
                const next = new Set(current);
                next.delete(set.localId);
                return next;
              });
              onRemoveSet(set.localId);
            }}
          >
            {/* Separators inset 16 from the left, so the index column reads as
                one continuous ruler down the card. */}
            {index > 0 ? <View className="ml-lg h-hairline bg-hairline" /> : null}

            <SetRow
              set={set}
              workingNumber={setLabels[index]}
              exercise={entry.exercise}
              unitSystem={unitSystem}
              isNext={set.localId === nextSetId}
              /* The mark for "do this one". Every card has a next row; only one
                 row in the session is THE next row, and outlining all of them
                 would mark nothing. `upNextSetId` is that row — the set after the
                 one last logged (`lib/upNext.ts`), which on a card being read
                 rather than worked is no row at all. */
              isUpNext={set.localId === upNextSetId}
              /* The two gestures on the up-next row — see `SetRow`. Passed only
                 for that row, which is what scopes them to it. */
              onOpenFocus={set.localId === upNextSetId ? onOpenFocus : undefined}
              focusedField={focus?.setId === set.localId ? focus.field : null}
              isTimed={isTimed}
              isTiming={timingSetId === set.localId}
              availablePlatesKg={availablePlatesKg}
              /* Edit mode's `−`, on every row — see the file header. */
              onRemove={isEditing ? () => removeRow(set.localId) : undefined}
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
              /* The inline editor opens by growing its own height, so the rows
                 under it are pushed rather than jumped. */
              <GrowIn duration={260}>
                <QuickAdjust
                  field={focus.field}
                  set={set}
                  exercise={entry.exercise}
                  unitSystem={unitSystem}
                  onChange={(patch) => onPatchSet(set.localId, patch)}
                  onClose={() => setFocus(null)}
                  onRemoveSet={() => removeRow(set.localId)}
                />
              </GrowIn>
            ) : null}
          </GrowIn>
        ))}

        {isEditing ? (
          <GrowIn key="editing" duration={motion.row}>
            {/* Full-bleed hairline: the footer is not a set, so its rule isn't inset. */}
            <View className="h-hairline bg-hairline" />
            <View className="flex-row">
              <FooterButton
                icon="plus"
                label={t('Add {unit}', { unit })}
                tone="green"
                onPress={() => {
                  tap();
                  onAddSet();
                }}
              />
              {/* WARM-UP, and it states the numbers it is about to add — because a
                  button that silently inserts three rows at the top of the exercise
                  is one the user has to undo to find out about, and because seeing
                  `40 × 5 · 60 × 5` is how you notice today's working weight is
                  wrong. Only before anything is logged: `warmupSets` decides. */}
              {onAddWarmup && warmupSummary ? (
                <>
                  <View className="w-hairline bg-hairline" />
                  <Pressable
                    onPress={() => {
                      tap();
                      onAddWarmup();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('Add warm-up sets: {what}', { what: warmupSummary })}
                    style={({ pressed }) =>
                      pressed ? { backgroundColor: 'rgba(63,169,108,0.08)' } : undefined
                    }
                    className="h-row flex-1 items-center justify-center px-sm"
                  >
                    <Text className="text-label font-medium text-green-bright">
                      {`+ ${t('Warm-up')}`}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-[11px] tabular-nums text-ink-faint"
                      allowFontScaling={false}
                    >
                      {warmupSummary}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>

            {/* The plan's own numbers — rest, defaults, targets, the cue — in the
                exercise editor, mid-workout. Ink-muted rather than green: it
                changes the plan, it does not advance it. */}
            {onEditExercise ? (
              <>
                <View className="h-hairline bg-hairline" />
                <FooterButton
                  icon="edit"
                  label={t('Rest, targets and cue')}
                  tone="muted"
                  accessibilityLabel={t('Edit {name}: rest, defaults and targets', {
                    name: entry.exercise.name,
                  })}
                  onPress={() => {
                    tap();
                    onEditExercise();
                  }}
                />
              </>
            ) : null}

            {/* The way out of an exercise in one tap, in the one hue that means
                "this deletes plan". It does not ask: the screen offers the Undo. */}
            {onRemoveExercise ? (
              <>
                <View className="h-hairline bg-hairline" />
                <FooterButton
                  icon="minus"
                  label={t('Remove exercise')}
                  tone="danger"
                  accessibilityLabel={t('Remove {name} from this workout', {
                    name: entry.exercise.name,
                  })}
                  onPress={() => {
                    undo();
                    onRemoveExercise();
                  }}
                />
              </>
            ) : null}
          </GrowIn>
        ) : showRest || showFocus ? (
          <>
            {/* Full-bleed hairline: the footer is not a set, so its rule isn't inset. */}
            <View className="h-hairline bg-hairline" />
            <View className="flex-row">
              {/* Rest, on demand — the answer to "auto-rest is off, so how do I
                  run a rest at all", and the way back from a `Skip` you didn't
                  mean. */}
              {showRest ? (
                <FooterButton
                  icon="pause"
                  label={t('Rest {clock}', { clock: formatClock(restSeconds) })}
                  tone="muted"
                  accessibilityLabel={t('Start a {clock} rest', {
                    clock: formatClock(restSeconds),
                  })}
                  onPress={() => onStartRest?.()}
                />
              ) : null}
              {/* FOCUS MODE, named, on the card that holds the next set. The two
                  gestures that also open it — the up-next row's numbers and a long
                  press on that row — are not discoverable on their own. */}
              {showFocus ? (
                <>
                  {showRest ? <View className="w-hairline bg-hairline" /> : null}
                  <FooterButton
                    icon="play"
                    label={t('Focus')}
                    tone="green"
                    accessibilityLabel={t('Open focus mode on your next set')}
                    onPress={() => {
                      tap();
                      onOpenFocus?.();
                    }}
                  />
                </>
              ) : null}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One cell of the footer: an icon and a label, 56 high, centred. Every row and
 * half-row of both footers is one of these, so the two modes are the same shape.
 */
function FooterButton({
  icon,
  label,
  tone,
  onPress,
  accessibilityLabel,
}: {
  icon: 'plus' | 'minus' | 'edit' | 'pause' | 'play';
  label: string;
  tone: 'green' | 'muted' | 'danger';
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const color =
    tone === 'green' ? palette.greenBright : tone === 'danger' ? danger : palette.inkMuted;
  const glyph = tone === 'muted' ? palette.inkFaint : color;
  const wash =
    tone === 'danger'
      ? 'rgba(224,115,95,0.08)'
      : tone === 'green'
        ? 'rgba(63,169,108,0.08)'
        : 'rgba(236,241,238,0.04)';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => (pressed ? { backgroundColor: wash } : undefined)}
      className="h-row flex-1 flex-row items-center justify-center px-sm"
    >
      <Icon name={icon} size={13} color={glyph} />
      <Text
        numberOfLines={1}
        style={{ color }}
        className={['ml-sm text-label tabular-nums', tone === 'muted' ? '' : 'font-medium'].join(
          ' ',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The ✎: a 36 dp glass circle beside the name. It sinks and tilts −12° under the
 * finger — a pencil being picked up — which is the only flourish in the card.
 */
function EditCircle({ onPress, name }: { onPress: () => void; name: string }) {
  const t = useT();
  const press = usePressScale(0.88, -12);
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('Edit the plan of {name}', { name })}
      className="ml-sm"
    >
      <Animated.View
        style={{
          width: 36,
          height: 36,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(236,241,238,0.055)',
          borderWidth: 1,
          borderColor: 'rgba(236,241,238,0.07)',
          transform: press.style.transform,
        }}
      >
        <Icon name="edit" size={16} color={palette.inkMuted} />
      </Animated.View>
    </Pressable>
  );
}

/** `✓ Done` — the only way out of edit mode, and it arrives with a pop. */
function DonePill({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <Pop duration={300} style={{ marginLeft: 8 }}>
      <Pressable
        onPress={() => {
          tap();
          onPress();
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t('Done editing the plan')}
        style={{
          height: 36,
          paddingHorizontal: 14,
          borderRadius: 9999,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: palette.green,
          borderWidth: 1,
          borderColor: 'rgba(63,169,108,0.5)',
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(63,169,108,0.3)' }],
        }}
      >
        <Icon name="check" size={14} color={palette.ink} />
        <Text
          allowFontScaling={false}
          style={{ fontSize: 13, marginLeft: 6 }}
          className="font-semibold text-ink"
        >
          {t('Done')}
        </Text>
      </Pressable>
    </Pop>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 22;
const RING_STROKE = 2.5;
const RING_R = (RING_SIZE - RING_STROKE * 2) / 2 + RING_STROKE / 2;
const RING_LENGTH = 2 * Math.PI * RING_R;

/**
 * The collapsed card's progress ring: 22 dp, a hairline track, `green-bright`
 * fill — `ink-faint` once the exercise is done, because done is history — and
 * the arc travels to its new share over 600 ms when a set lands.
 */
function MiniRing({ fraction, done }: { fraction: number; done: boolean }) {
  const scale = useMotionScale();
  const clamped = Math.max(0, Math.min(1, fraction));
  const v = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: clamped,
      duration: 600 * scale,
      easing: curve(motion.ease),
      // strokeDashoffset is an SVG prop, not a transform: JS driver.
      useNativeDriver: false,
    }).start();
  }, [clamped, scale, v]);
  return (
    <Svg
      width={RING_SIZE}
      height={RING_SIZE}
      style={{ transform: [{ rotate: '-90deg' }] }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        fill="none"
        stroke={palette.hairline}
        strokeWidth={RING_STROKE}
      />
      <AnimatedCircle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        fill="none"
        stroke={done ? palette.inkFaint : palette.greenBright}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={v.interpolate({ inputRange: [0, 1], outputRange: [RING_LENGTH, 0] })}
      />
    </Svg>
  );
}

export const ExerciseCard = memo(ExerciseCardComponent);
