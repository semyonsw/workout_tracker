/**
 * HistoryScreen — every workout you have actually finished.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ HISTORY                                      │
 *   │ 12 workouts · 214 sets · 41 200 kg           │
 *   │ SETS PER CLUSTER          [4w][12w][ All ]   │
 *   │ pull    42  ██████████████████████           │
 *   │ push    31  ████████████████                 │
 *   │ core    18  █████████                        │
 *   │ legs     8  ████                             │
 *   │ cardio   0                                   │
 *   │ AUGUST                                       │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ #92  Pull + swimming     17 Aug · 74 min │ │
 *   │ │      6 exercises · 18 sets · 4 720 kg  ⌄ │ │
 *   │ │  Weighted 90° pull-ups   +40 kg · 4 4 4  │ │  ← open
 *   │ │                             12 REPS TOTAL │ │
 *   │ │    1   40 kg    4 reps               ⌄   │ │
 *   │ │        −2  −0.5   40 KG   +0.5  +2       │ │  ← one row, correcting
 *   │ │        Reps    Remove set        Done    │ │
 *   │ │  + Add a set          Remove exercise    │ │
 *   │ │  Plank                   2:00 · 2:00     │ │
 *   │ │                                4:00 TOTAL │ │
 *   │ │  + Add an exercise                       │ │
 *   │ │  Edit name, date and length              │ │
 *   │ │  ╭ Pull + swimming                     ╮ │ │
 *   │ │  │ Date       17 Aug 2026   ( − )( + ) │ │ │
 *   │ │  │ Started    17:00         ( − )( + ) │ │ │
 *   │ │  ╰ Took       74 min        ( − )( + ) ╯ │ │
 *   │ │  Workout number: 92                      │ │
 *   │ │  Delete this workout                     │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ #91  Push                 15 Aug · 51 min│ │
 *   │ └──────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────┘
 *
 * Design decisions worth keeping:
 *
 *  • A ROW OPENS IN PLACE. Tapping a workout expands it rather than pushing a
 *    detail screen. What you want from history is almost always one line — "what
 *    did I do last Tuesday" — and a route you have to come back from turns a
 *    glance into navigation. The exercise lines use the SAME shorthand as the
 *    exercise cards and the exercise-history screen, so a session reads the same
 *    everywhere it appears.
 *  • GROUPED BY MONTH, NOT PAGINATED. A training log is read backwards from today
 *    and the interesting unit is "this month". The month kicker is what carries the
 *    year, and only when it isn't the current one — a log full of "2026" is noise.
 *  • A TYPO IS NOT A WORKOUT. Tapping an exercise line inside an open workout
 *    lists its logged sets, and one of them at a time can be corrected with the
 *    same ± chips the session uses. 40 kg typed where 4 was meant used to cost the
 *    whole session — delete the workout and re-enter it was the only route, and it
 *    also took those sets out of what the prefills and the suggestions read.
 *  • AND NEITHER IS A MIS-TAP. The same argument applied to everything a session
 *    gets wrong that is NOT one number: a set removed by accident, an exercise
 *    dropped by `Remove exercise` on the wrong card, a workout finished an hour
 *    after it ended because the phone was in a bag, a session dated to the wrong
 *    day because it ran past midnight. So an open workout can also gain a set,
 *    gain or lose an exercise, be renamed, be moved in time and be told how long
 *    it took — every one of them through `lib/workoutEdit.ts`, and every one of
 *    them regenerating the record rather than patching it.
 *
 *    THE STRUCTURAL EDITS ARE WHERE THEIR SUBJECT IS. `+ Add a set` and `Remove
 *    exercise` appear under the exercise whose rows are open, because that is the
 *    exercise the user is looking at and the only one for which "one more" is
 *    unambiguous. The workout-level ones — name, date, length — are behind one
 *    row, shut by default: history is read far more often than it is corrected,
 *    and five controls between the reader and the sets would tax the common case
 *    to serve the rare one.
 *
 *    Every number around the corrected row is REGENERATED, never patched: the
 *    store hands the new row list to `recomputeWorkout`, which reruns
 *    `summarizeSessionSets` and the volume maths that built the record in the first
 *    place. So the shorthand, the set count, the exercise total and the volume
 *    cannot drift from the rows they claim to describe.
 *
 *    ONE ROW AT A TIME, AND VISIBLY. The set being corrected is the only one with
 *    an editor under it, and it stays on screen while it changes — this is the one
 *    place in the app where a number the user is looking at is already history, so
 *    it has to be obvious which row is being touched.
 *  • DELETE IS INSIDE THE OPEN ROW, AND IT ASKS. History is the one thing in this
 *    app that must be true, so removing a piece of it is never a swipe away: you
 *    open the workout, read what it was, and then confirm.
 *  • EVERY EXERCISE STATES ITS TOTAL. Under the per-set line — "+40 kg · 4 4 4"
 *    — sits the sum of those counts: 12 reps, or 4:00 of plank. It is the number
 *    you actually compare between sessions, and reading a row of per-set counts is
 *    the one piece of mental arithmetic this screen used to make you do. Only when
 *    there was more than one set, because the total of one set is the set.
 *  • AND NO SUMMARY MAY TAKE THE NAME'S HALF OF THE ROW. Seven held sets of
 *    fifteen seconds is a legal shorthand and it is wider than the row, so the
 *    name beside it collapsed to nothing — an exercise line with no exercise on
 *    it. The summary is clamped to five values before it is rendered
 *    (`lib/summaryClamp.ts`) with green dots after it, and opening the exercise —
 *    the tap that lists every set one per line anyway — is what shows the whole
 *    thing. The dots are inside the row's own Pressable: what they open is what
 *    the row opens.
 *  • EVERY WORKOUT IS NUMBERED, AND THE NUMBERING IS YOURS. `Workout 92` is an
 *    ordinal, not an id: one workout is pinned to a number you type and every other
 *    one counts from it, forwards and backwards. That is what makes a log that
 *    starts at session 91 — because ninety of them happened before this app
 *    existed — say so. See `workoutNumbers`.
 *  • THE TOTALS LINE IS A FACT, NOT A GOAL. No streaks, no badges, no weekly
 *    target. Three numbers that say how much training is in here.
 *  • SETS PER CLUSTER IS A COUNT, NOT A SCORE. `lib/muscles.ts` files every
 *    exercise under exactly one cluster and every set row carries its
 *    `exerciseId`; nothing had ever joined the two across history, so the one
 *    thing a lifter could not see was the one thing the data answers for free.
 *    It states counts and stops: no target, no ratio to hit, no cluster
 *    coloured as neglected, no "you should train legs". A cluster with zero sets
 *    shows zero, and that IS the feature — "legs 0" over twelve weeks is a fact,
 *    and what to do about it belongs to the person who did the training.
 *    The bar is `green-dim`, scaled to the largest cluster, and it is a
 *    comparison between the user's own numbers rather than against a goal.
 *  • AND WHEN A NUMBER CANNOT BE STOOD BEHIND, IT IS NOT SHOWN. Session volume
 *    needs a bodyweight to weigh a push-up or a −20 kg assisted pull-up, and the
 *    app is only told one if the user types it in `Settings → Body`. A workout
 *    logged without it carries `volumeIsPartial`, and both the header total and
 *    the row's own line drop their volume clause rather than print a figure that
 *    silently omits half the session. A missing clause is a gap somebody can ask
 *    about; a wrong total is one nobody can spot.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { pressedStyle, Reveal } from '../components/motion';
import { NumberSheet } from '../components/NumberSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  FieldWell,
  Kicker,
  ListCard,
  Segmented,
  Separator,
  StepperRow,
} from '../components/primitives';
import {
  BALANCE_WINDOWS,
  balanceWindowDays,
  clusterBalance,
  describeClusterTotals,
  type BalanceWindow,
  type ClusterCount,
} from '../lib/balance';
import { tap, undo } from '../lib/feedback';
import { monthKey, type CompletedExercise, type CompletedWorkout } from '../lib/completedWorkout';
import { clusterLabel } from '../lib/muscles';
import { clampSummary } from '../lib/summaryClamp';
import {
  countStep,
  countUnitLabel,
  formatCount,
  formatDuration,
  formatShortDate,
  formatVolumeKg,
  formatWeight,
  kgToLb,
  lbToKg,
  unitLabel,
  weightSteps,
} from '../lib/units';
import { historyTotals } from '../state/workoutHistoryStore';
import { useLanguage, usePlural, useT, type Translate } from '../hooks/useT';
import { term, type Language } from '../lib/i18n';
import { formatMonth } from '../lib/days';
import { palette } from '../theme/tokens';
import { useSettings } from '../state/settingsStore';
import { DURATION_LIMITS, formatTimeOfDay } from '../lib/workoutEdit';
import type { Exercise, ID, SessionEffort, SetHistory, UnitSystem } from '../types/models';

/**
 * How a session's effort reads on a history row.
 *
 * Lower case, because it is a clause in a sentence of facts and not a label:
 * `6 exercises · 18 sets · 4 720 kg · brutal`.
 */
/** One day, in the minutes the retime stepper counts in. */
const MINUTES_PER_DAY = 1440;

/**
 * The step on the `Started` row, in minutes.
 *
 * Fifteen, not one: nobody corrects the start of a finished workout to the minute,
 * and the reason to touch this row at all is a phone that was in a bag for half an
 * hour. Four taps an hour is the right coarseness for that.
 */
const TIME_STEP_MINUTES = 15;

/*
 * A function rather than a constant, because the words are translated: a
 * module-level record would be frozen in whichever language the app started in.
 */
function effortWords(t: Translate): Record<SessionEffort, string> {
  return {
    easy: t('easy'),
    right: t('right'),
    hard: t('brutal'),
  };
}

export interface HistoryScreenProps {
  workouts: CompletedWorkout[];
  /**
   * The log could not be READ off disk — see `workoutHistoryStore.loadFailed`.
   *
   * Changes the empty state and nothing else, which is the whole reason it is a
   * prop: "you have not finished a workout yet" and "your workouts are on disk and
   * I could not open them" are different facts, and one screen printing the first
   * over the second is what makes an app look like it lost a year of training.
   */
  loadFailed?: boolean;
  /** Every workout's ordinal, keyed by id — see `workoutNumbers`. */
  numbers: Record<ID, number>;
  /** The library, for the muscles behind the cluster counts. */
  exercisesById: Record<ID, Exercise>;
  /**
   * A workout to open and scroll to, from a tap somewhere else in the app.
   *
   * Home's `RECENT` rows and the exercise-history session rows both hand over a
   * workout id, and both used to have it thrown away — you landed at the top of
   * this screen and hunted for the row you had just tapped. An id that no longer
   * resolves opens nothing and is not an error: the workout may have been deleted
   * between the tap and the render.
   */
  focusWorkoutId?: ID | null;
  /** Called once the id above has been acted on, so it fires once and not again. */
  onFocusHandled?: () => void;
  unitSystem: UnitSystem;
  onDelete: (id: ID) => void;
  /**
   * Correct one logged set. The store recomputes every derived number from the
   * rows — see `recomputeWorkout` — so this screen never patches a summary string.
   */
  onEditSet: (
    workoutId: ID,
    setId: ID,
    patch: { weightKg?: number | null; count?: number },
  ) => void;
  /** Remove one logged set. False when it was refused — the last row of a workout. */
  onDeleteSet: (workoutId: ID, setId: ID) => boolean;
  /**
   * Change what a finished workout IS: its name, when it happened, how long it took.
   *
   * `shiftMinutes` nudges the start and drags every set's date with it — see
   * `lib/workoutEdit.ts` on why those cannot move independently.
   */
  onEditWorkout: (
    workoutId: ID,
    patch: { title?: string; shiftMinutes?: number; durationMinutes?: number },
  ) => void;
  /** One more row on an exercise the workout already has. */
  onAddSet: (workoutId: ID, exerciseId: ID) => void;
  /** Take an exercise out, rows and all. False when it was the last one. */
  onRemoveExercise: (workoutId: ID, exerciseId: ID) => boolean;
  /**
   * Open the library picker to put an exercise INTO a finished workout.
   *
   * Optional because it is the one edit on this screen that needs navigation, and a
   * caller with nowhere to push should render no row rather than a dead one.
   */
  onAddExercise?: (workoutId: ID) => void;
  /** Pin this workout's number; everything else renumbers from it. */
  onSetNumber: (id: ID, number: number) => void;
  /** The `Log | Graphs` switch, rendered under the header by whoever owns it. */
  toolbar?: ReactNode;
  /** `‹` — this screen is pushed by the ⟲ on the workout section now. */
  onBack?: () => void;
}

export function HistoryScreen({
  workouts,
  loadFailed,
  exercisesById,
  focusWorkoutId,
  onFocusHandled,
  unitSystem,
  onDelete,
  onEditSet,
  onDeleteSet,
  onEditWorkout,
  onAddSet,
  onRemoveExercise,
  onAddExercise,
  numbers,
  onSetNumber,
  toolbar,
  onBack,
}: HistoryScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const counted = usePlural();
  /** The open workout, the one being deleted, the one being renumbered. */
  const [openId, setOpenId] = useState<ID | null>(null);
  const [deleting, setDeleting] = useState<CompletedWorkout | null>(null);
  const [numbering, setNumbering] = useState<CompletedWorkout | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  /**
   * Where each workout row sits in the SCROLL CONTENT, captured on layout.
   *
   * `onLayout` reports a y relative to the immediate parent, so a row's position
   * in the scroll is the sum of three: the month group's offset in the content,
   * the card's offset inside that group (a Kicker sits above it), and the row's
   * offset inside the card. Each level records its own, which is why there are
   * three refs instead of one — and why none of them guesses a Kicker's height.
   *
   * Refs rather than state: written during layout, read by an effect. In state,
   * every row measuring itself would re-render the list.
   */
  const monthOffsets = useRef<Record<string, number>>({});
  const cardOffsets = useRef<Record<string, number>>({});
  const rowOffsets = useRef<Record<ID, { monthKey: string; y: number }>>({});
  /**
   * The balance window. Four weeks by default: long enough that one missed
   * session does not swing it, short enough that it is about now.
   */
  const [window, setWindow] = useState<BalanceWindow>('4w');

  /*
   * The user's own weekly set targets, if they have set any. Read here rather than
   * passed in for the same reason the bodyweight log is on the Progress screen: it
   * is a setting, and threading it through `AppShell` would make the shell
   * responsible for a number it has no opinion about.
   */
  const weeklyTargets = useSettings((s) => s.weeklySetTargets);

  const totals = useMemo(() => historyTotals(workouts), [workouts]);
  const months = useMemo(() => groupByMonth(workouts, lang), [lang, workouts]);
  const balance = useMemo(
    () => clusterBalance({ workouts, exercisesById, windowDays: balanceWindowDays(window) }),
    [workouts, exercisesById, window],
  );
  /* Either sheet takes the screen; the list behind it dims and stops scrolling. */
  const dimmed = deleting != null || numbering != null;

  /*
   * OPEN THE WORKOUT SOMEBODY TAPPED, and scroll it into view.
   *
   * Two steps rather than one, because the row cannot be scrolled to until it has
   * been measured and it is only measured once it is rendered. So the effect opens
   * it immediately and asks for the scroll on the next frame, by which time the
   * expanded row's `onLayout` has run and `rowOffsets` knows where it is.
   *
   * `onFocusHandled` IS CALLED FROM INSIDE THE FRAME, and that is not a detail.
   * Calling it beside `setOpenId` clears the parent's id, which changes this
   * effect's deps, which runs its CLEANUP — and the cleanup cancels the frame that
   * has not fired yet. The row opened and never scrolled, which is the half of this
   * feature that is hard to notice in a list short enough to fit on screen.
   * Deferring the callback keeps the deps stable until the scroll has happened.
   *
   * An id that does not resolve is handled and forgotten rather than treated as an
   * error: the workout may have been deleted between the tap and this render, and
   * landing at the top of History is the right outcome for that.
   */
  useEffect(() => {
    if (!focusWorkoutId) return;

    if (!workouts.some((w) => w.id === focusWorkoutId)) {
      onFocusHandled?.();
      return;
    }
    setOpenId(focusWorkoutId);

    const frame = requestAnimationFrame(() => {
      const row = rowOffsets.current[focusWorkoutId];
      if (row != null) {
        const y =
          (monthOffsets.current[row.monthKey] ?? 0) +
          (cardOffsets.current[row.monthKey] ?? 0) +
          row.y;
        // −8 so the row is not flush against the header's hairline.
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }
      // Only now: see above.
      onFocusHandled?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusWorkoutId, onFocusHandled, workouts]);

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={dimmed ? { opacity: 0.28 } : undefined}>
        <ScreenHeader
          kicker={t('Training history')}
          onBack={onBack}
          subtitle={
            totals.workouts > 0
              ? `${t('{count} {workouts}', {
                  count: totals.workouts,
                  // `few` is Russian's own third form, so it is the Russian word.
                  workouts: counted(totals.workouts, {
                    one: t('workout'),
                    few: 'тренировки',
                    many: t('workouts'),
                  }),
                })} · ${t('{count} sets', { count: totals.sets })}${
                  totals.volumeKg > 0 && !totals.volumeIsPartial
                    ? ` · ${formatVolumeKg(totals.volumeKg, lang)}`
                    : ''
                }`
              : undefined
          }
          bordered={false}
        >
          {toolbar}
        </ScreenHeader>

        {workouts.length === 0 ? (
          <Empty loadFailed={loadFailed} />
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!dimmed}
          >
            {/* ----------------------------------------------------------
                SETS PER CLUSTER — above the months, because it is about the
                shape of recent training rather than about one session. */}
            {balance.totalSets > 0 ? (
              <View className="mb-lg">
                <View className="mx-lg mb-sm flex-row items-center">
                  <Kicker className="flex-1">{t('Sets per cluster')}</Kicker>
                </View>
                <View className="mx-lg mb-md">
                  <Segmented
                    options={BALANCE_WINDOWS.map((w) => ({ value: w.value, label: t(w.label) }))}
                    value={window}
                    onChange={(next) => {
                      tap();
                      setWindow(next);
                    }}
                    accessibilityLabel={t('How far back the cluster counts reach')}
                  />
                </View>
                <ListCard className="mx-lg">
                  {balance.clusters.map((row, index) => (
                    <View key={row.cluster}>
                      {index > 0 ? <Separator /> : null}
                      <ClusterRow
                        row={row}
                        maxSets={balance.maxSets}
                        target={weeklyTargets[row.cluster]}
                      />
                    </View>
                  ))}
                  {/* Only when there is something to say. Sets whose exercise has
                      been deleted still happened, and a total that quietly omitted
                      them would be worse than one that admits it cannot place
                      them. */}
                  {balance.unfiled > 0 ? (
                    <>
                      <Separator />
                      <View className="min-h-[44px] flex-row items-center px-lg py-sm">
                        <Text className="flex-1 text-label text-ink-faint">
                          {t('Exercise since deleted')}
                        </Text>
                        <Text className="text-label font-semibold tabular-nums text-ink-faint">
                          {balance.unfiled}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </ListCard>
              </View>
            ) : null}

            {months.map((month) => (
              <View
                key={month.key}
                onLayout={(e) => {
                  monthOffsets.current[month.key] = e.nativeEvent.layout.y;
                }}
              >
                <Kicker className="mx-lg mb-sm mt-xl">{month.label}</Kicker>
                <View
                  onLayout={(e) => {
                    cardOffsets.current[month.key] = e.nativeEvent.layout.y;
                  }}
                >
                  <ListCard className="mx-lg">
                    {month.workouts.map((workout, index) => (
                      <View
                        key={workout.id}
                        onLayout={(e) => {
                          rowOffsets.current[workout.id] = {
                            monthKey: month.key,
                            y: e.nativeEvent.layout.y,
                          };
                        }}
                      >
                        {index > 0 ? <Separator /> : null}
                        <WorkoutRow
                          workout={workout}
                          number={numbers[workout.id]}
                          isOpen={openId === workout.id}
                          unitSystem={unitSystem}
                          onEditSet={(setId, patch) => onEditSet(workout.id, setId, patch)}
                          onDeleteSet={(setId) => onDeleteSet(workout.id, setId)}
                          onEditWorkout={(patch) => onEditWorkout(workout.id, patch)}
                          onAddSet={(exerciseId) => onAddSet(workout.id, exerciseId)}
                          onRemoveExercise={(exerciseId) =>
                            onRemoveExercise(workout.id, exerciseId)
                          }
                          onAddExercise={
                            onAddExercise ? () => onAddExercise(workout.id) : undefined
                          }
                          onPress={() => {
                            tap();
                            setOpenId((current) => (current === workout.id ? null : workout.id));
                          }}
                          onDelete={() => {
                            undo();
                            setDeleting(workout);
                          }}
                          onEditNumber={() => {
                            tap();
                            setNumbering(workout);
                          }}
                        />
                      </View>
                    ))}
                  </ListCard>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {numbering ? (
        <NumberSheet
          title={t('Which workout was this?')}
          body={t(
            'Every other workout renumbers from this one — the ones before it count down, the ones after it count up. Set it once on any session and the whole log lines up, including the sessions you did before this app existed.',
          )}
          initial={numbers[numbering.id] ?? null}
          onConfirm={(value) => {
            onSetNumber(numbering.id, value);
            setNumbering(null);
          }}
          onCancel={() => setNumbering(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmSheet
          title={t('Delete “{title}”?', { title: deleting.title })}
          body={t(
            '{date} · {count} sets. This is the record of a workout you did — deleting it also removes those sets from what the overload suggestions read.',
            {
              date: formatShortDate(deleting.startedAt, lang),
              count: deleting.setCount,
            },
          )}
          confirmLabel={t('Delete it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            onDelete(deleting.id);
            setDeleting(null);
            setOpenId(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function WorkoutRow({
  workout,
  number,
  isOpen,
  unitSystem,
  onPress,
  onDelete,
  onEditSet,
  onDeleteSet,
  onEditNumber,
  onEditWorkout,
  onAddSet,
  onRemoveExercise,
  onAddExercise,
}: {
  workout: CompletedWorkout;
  /** Its ordinal, or undefined / below 1 when the pinning leaves it without one. */
  number?: number;
  isOpen: boolean;
  unitSystem: UnitSystem;
  onPress: () => void;
  onDelete: () => void;
  onEditSet: (setId: ID, patch: { weightKg?: number | null; count?: number }) => void;
  onDeleteSet: (setId: ID) => boolean;
  onEditNumber: () => void;
  /** Rename it, move it in time, or say how long it took. */
  onEditWorkout: (patch: {
    title?: string;
    shiftMinutes?: number;
    durationMinutes?: number;
  }) => void;
  /** One more row on an exercise this workout already has. */
  onAddSet: (exerciseId: ID) => void;
  /** Take an exercise out, rows and all. False when it was the last one. */
  onRemoveExercise: (exerciseId: ID) => boolean;
  /** Open the library picker for this workout. Absent = no way to navigate there. */
  onAddExercise?: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const counted = usePlural();
  const exerciseCount = workout.exercises.length;
  const numbered = number != null && number >= 1;
  /** The exercise whose logged sets are listed, and the set being corrected. */
  const [openExerciseId, setOpenExerciseId] = useState<ID | null>(null);
  const [editing, setEditing] = useState<{ setId: ID; field: 'weight' | 'count' } | null>(null);
  /**
   * The workout-level edit block is SHUT by default.
   *
   * What you want from history is almost always a glance — the file header says so
   * — and a name field, three steppers and an `Add an exercise` row on every open
   * workout would put five controls between the reader and the sets they came to
   * see. One row reveals them, which is the same shape `Set the workout number`
   * already had.
   */
  const [editingWorkout, setEditingWorkout] = useState(false);
  /** The name, while it is being typed. Committed on blur — see the field below. */
  const [draftTitle, setDraftTitle] = useState(workout.title);

  return (
    <View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={[
          numbered ? `${t('Workout {number}', { number })},` : '',
          workout.title,
          formatShortDate(workout.startedAt, lang),
          t('{count} sets', { count: workout.setCount }),
          t('{minutes} minutes', { minutes: workout.durationMinutes }),
        ]
          .filter(Boolean)
          .join(' ')}
        style={pressedStyle}
        className="min-h-[64px] flex-row items-center px-lg py-md"
      >
        {/* The ordinal is its own left column so the numbers line up down the
            list like a ledger, and so a long title can never push it off. The
            gutter is reserved even when a workout has no number, because a row
            that shifts left is harder to scan than one with a gap. */}
        <Text className="w-[38px] text-label font-semibold tabular-nums text-green-bright">
          {numbered ? `#${number}` : ''}
        </Text>

        <View className="flex-1 pr-md">
          <Text numberOfLines={1} className="text-body font-medium text-ink">
            {workout.title}
          </Text>
          <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
            {t('{count} {exercises}', {
              count: exerciseCount,
              // `few` is Russian's own third form, so it is the Russian word.
              exercises: counted(exerciseCount, {
                one: t('exercise'),
                few: 'упражнения',
                many: t('exercises'),
              }),
            })}{' '}
            · {t('{count} sets', { count: workout.setCount })}
            {workout.totalVolumeKg > 0 && !workout.volumeIsPartial
              ? ` · ${formatVolumeKg(workout.totalVolumeKg, lang)}`
              : ''}
            {/* HOW IT FELT, where the user said. Appended in `ink-faint` rather
                than given a badge: it is one more fact on a line of facts, and a
                brutal session is not a worse session. Absent on every workout
                logged before the question existed, and on every one where it was
                skipped — which are the same thing and read the same way. */}
            {workout.effort ? (
              <Text className="text-label text-ink-faint"> · {effortWords(t)[workout.effort]}</Text>
            ) : null}
          </Text>
        </View>

        <Text className="mr-sm text-label tabular-nums text-ink-muted">
          {formatShortDate(workout.startedAt, lang)} ·{' '}
          {t('{minutes} min', { minutes: workout.durationMinutes })}
        </Text>
        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={18} color={palette.inkFaint} />
      </Pressable>

      {isOpen ? (
        <Reveal>
          <View className="bg-surface-alt pb-sm">
            {workout.exercises.map((exercise) => {
              const total = describeTotal(exercise, t, lang);
              const listing = openExerciseId === exercise.exerciseId;
              /* Bounded before it is rendered, so it can never take the name's
               half of the row. Open, the row shows the whole thing. */
              const clamped = clampSummary(exercise.summary);
              const rows = listing
                ? workout.sets
                    .filter((row) => row.exerciseId === exercise.exerciseId)
                    .sort((a, b) => a.setIndex - b.setIndex)
                : [];

              return (
                <View key={`${exercise.exerciseId}-${exercise.name}`}>
                  <Pressable
                    onPress={() => {
                      tap();
                      setEditing(null);
                      setOpenExerciseId((current) =>
                        current === exercise.exerciseId ? null : exercise.exerciseId,
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: listing }}
                    accessibilityLabel={`${exercise.name}, ${exercise.summary}. ${
                      clamped.hidden > 0 && !listing
                        ? `${t('Show all {count} sets.', { count: exercise.setCount })} `
                        : ''
                    }${t('Correct a set.')}`}
                    style={pressedStyle}
                    className="flex-row items-start px-lg py-sm"
                  >
                    {/* TWO LINES OF NAME, and a column no summary can take.

                      The name used to be `flex-1` beside a column that sized
                      itself to whatever the shorthand was, and an exercise with
                      seven held sets rendered a row with NO NAME ON IT — see
                      `lib/summaryClamp.ts`. `maxWidth` is inline because it is a
                      percentage and the scale in `tailwind.config.js` is dp on
                      purpose; this is the one place in the app where the split has
                      to follow the phone's width rather than a step of the
                      spacing scale. */}
                    <Text
                      numberOfLines={2}
                      className="flex-1 pr-md text-label font-medium text-ink"
                    >
                      {exercise.name}
                    </Text>
                    <View className="shrink items-end" style={{ maxWidth: '56%' }}>
                      <View className="flex-row items-baseline">
                        <Text
                          /* Open, the summary is worth its full height: the rows
                           under it are the same sets one per line, so a wrapped
                           shorthand above them is a heading, not a wall. */
                          numberOfLines={listing ? 3 : 1}
                          className="shrink text-label tabular-nums text-ink-muted"
                        >
                          {listing ? exercise.summary : clamped.text}
                        </Text>
                        {/* THE DOTS. Green, because green is what a tap does in this
                          app, and inside the row's own Pressable rather than a
                          nested one — the thing they open is the thing the row
                          opens. */}
                        {clamped.hidden > 0 && !listing ? (
                          <Text className="ml-xs text-body font-semibold leading-none text-green-bright">
                            {'\u2026'}
                          </Text>
                        ) : null}
                      </View>
                      {total ? (
                        <Text className="mt-[2px] text-micro font-semibold uppercase tabular-nums text-green-bright">
                          {total}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>

                  {/* The logged rows, one correctable at a time. See the header. */}
                  {listing ? (
                    <Reveal>
                      {rows.map((row, index) => (
                        <LoggedSetRow
                          key={row.id}
                          row={row}
                          number={index + 1}
                          unitSystem={unitSystem}
                          editing={editing?.setId === row.id ? editing.field : null}
                          onFocusField={(field) =>
                            setEditing((current) =>
                              current?.setId === row.id && current.field === field
                                ? null
                                : { setId: row.id, field },
                            )
                          }
                          onChange={(patch) => onEditSet(row.id, patch)}
                          onRemove={() => {
                            if (onDeleteSet(row.id)) setEditing(null);
                          }}
                          onDone={() => setEditing(null)}
                          canRemove={workout.sets.length > 1}
                        />
                      ))}
                    </Reveal>
                  ) : null}

                  {/* THE TWO STRUCTURAL EDITS, and only on the exercise whose rows
                    are open — which is the exercise the user is looking at, and
                    the only one for which "one more set" is unambiguous.

                    `+ Add a set` is the way back from a mis-tapped ✕, and it is
                    the reason a set row's ✕ can stay a single tap. `Remove
                    exercise` is `ink-faint` rather than green because it takes
                    something away, the same weight `Delete this workout` has. */}
                  {listing ? (
                    <View className="flex-row px-lg pb-sm">
                      <Pressable
                        onPress={() => {
                          tap();
                          onAddSet(exercise.exerciseId);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('Add a set to {name}', { name: exercise.name })}
                        style={pressedStyle}
                        className="h-hit flex-1 justify-center"
                      >
                        <Text className="text-label font-medium text-green-bright">
                          {t('+ Add a set')}
                        </Text>
                      </Pressable>

                      {exerciseCount > 1 ? (
                        <Pressable
                          onPress={() => {
                            undo();
                            if (onRemoveExercise(exercise.exerciseId)) {
                              setOpenExerciseId(null);
                              setEditing(null);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('Remove {name} from this workout', {
                            name: exercise.name,
                          })}
                          style={pressedStyle}
                          className="h-hit justify-center"
                        >
                          <Text className="text-label font-medium text-ink-faint">
                            {t('Remove exercise')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}

            {/* An exercise the session missed, or one removed by mistake. Above the
              edit block because it is about the CONTENT of the workout, which is
              what everything above it is too. */}
            {onAddExercise ? (
              <Pressable
                onPress={() => {
                  tap();
                  onAddExercise();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('Add an exercise to this workout')}
                style={pressedStyle}
                className="h-hit justify-center px-lg"
              >
                <Text className="text-label font-medium text-green-bright">
                  {t('+ Add an exercise')}
                </Text>
              </Pressable>
            ) : null}

            {/* WHAT THE WORKOUT IS: its name, when it happened, how long it took.

              Behind one row, because history is read far more often than it is
              corrected. Every control in here is the app's own ± idiom rather than
              a native picker: there is no date picker in this codebase, a stepper
              needs no permissions and no module, and the edits people actually
              make to a finished session are small ones — a day out because it ran
              past midnight, an hour because the phone was in a bag, a duration
              that kept counting on the walk home. */}
            <Pressable
              onPress={() => {
                tap();
                setDraftTitle(workout.title);
                setEditingWorkout((open) => !open);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: editingWorkout }}
              accessibilityLabel={t('Edit the name, date and length of {title}', {
                title: workout.title,
              })}
              style={pressedStyle}
              className="h-hit justify-center px-lg"
            >
              <Text className="text-label font-medium text-green-bright">
                {editingWorkout ? t('Done editing') : t('Edit name, date and length')}
              </Text>
            </Pressable>

            {editingWorkout ? (
              <View className="px-lg pb-sm">
                <Kicker className="mb-sm">{t('Name')}</Kicker>
                <FieldWell
                  value={draftTitle}
                  placeholder={t('Workout name')}
                  onChangeText={setDraftTitle}
                  /*
                   * Committed on BLUR, not on every keystroke. Every write here
                   * recomputes the record and re-sorts the log, and doing that once
                   * per typed character would rebuild the list under the keyboard.
                   */
                  onBlur={() => onEditWorkout({ title: draftTitle })}
                  accessibilityLabel={t('Workout name')}
                />

                <View className="mt-md overflow-hidden rounded-surface border border-hairline bg-surface">
                  <StepperRow
                    label={t('Date')}
                    hint={t('Every set in this workout moves with it')}
                    value={formatShortDate(workout.startedAt, lang)}
                    onDecrease={() => {
                      tap();
                      onEditWorkout({ shiftMinutes: -MINUTES_PER_DAY });
                    }}
                    onIncrease={() => {
                      tap();
                      onEditWorkout({ shiftMinutes: MINUTES_PER_DAY });
                    }}
                  />
                  <Separator />
                  <StepperRow
                    label={t('Started')}
                    value={formatTimeOfDay(workout.startedAt)}
                    onDecrease={() => {
                      tap();
                      onEditWorkout({ shiftMinutes: -TIME_STEP_MINUTES });
                    }}
                    onIncrease={() => {
                      tap();
                      onEditWorkout({ shiftMinutes: TIME_STEP_MINUTES });
                    }}
                  />
                  <Separator />
                  <StepperRow
                    label={t('Took')}
                    value={t('{minutes} min', { minutes: workout.durationMinutes })}
                    onDecrease={() => {
                      tap();
                      onEditWorkout({
                        durationMinutes: workout.durationMinutes - DURATION_LIMITS.step,
                      });
                    }}
                    onIncrease={() => {
                      tap();
                      onEditWorkout({
                        durationMinutes: workout.durationMinutes + DURATION_LIMITS.step,
                      });
                    }}
                  />
                </View>
              </View>
            ) : null}

            {/* Renumbering sits above delete because it is the one you actually
              reach for, and both are inside the open row for the same reason:
              you read what the workout was before you touch it. */}
            <Pressable
              onPress={onEditNumber}
              accessibilityRole="button"
              accessibilityLabel={
                numbered
                  ? t('Change the number of workout {number}', { number })
                  : t('Set this workout’s number')
              }
              style={pressedStyle}
              className="h-hit justify-center px-lg"
            >
              <Text className="text-label font-medium text-green-bright">
                {numbered ? t('Workout number: {number}', { number }) : t('Set the workout number')}
              </Text>
            </Pressable>

            {/* No red, and not a swipe: see the file header. */}
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel={t('Delete the {title} workout', { title: workout.title })}
              style={pressedStyle}
              className="h-hit justify-center px-lg"
            >
              <Text className="text-label font-medium text-ink-faint">
                {t('Delete this workout')}
              </Text>
            </Pressable>
          </View>
        </Reveal>
      ) : null}
    </View>
  );
}

/**
 * One cluster: name, count, bar.
 *
 * The bar is `green-dim` and scaled to the LARGEST cluster, not to a target — it
 * compares the user's own numbers to each other, which is the only comparison
 * this screen is willing to draw. A cluster with no sets gets no bar and a plain
 * `0`, because a zero-width bar reads as a rendering failure and the zero is the
 * information.
 *
 * The count is `ink` even at zero: it is a fact, not a warning, and dimming it
 * would be the screen having an opinion.
 */
function ClusterRow({
  row,
  maxSets,
  target,
}: {
  row: ClusterCount;
  maxSets: number;
  /** The user's own weekly target for this cluster, or undefined. */
  target?: number;
}) {
  const t = useT();
  const lang = useLanguage();
  const totals = describeClusterTotals(row.totals, (s) => formatDuration(s, lang), lang);
  /*
   * THE BAR IS MEASURED AGAINST THE TARGET WHERE THERE IS ONE, and against the
   * busiest cluster otherwise.
   *
   * That is the whole difference the target makes. Without one, the bars are a
   * comparison between clusters — "back got twice the work chest did" — which is
   * `balance.ts`'s "a count, not a score" and stays exactly as it was. With one,
   * the bar is progress toward a number the USER typed, which is the only kind of
   * target this app is willing to draw. It is capped at full: a bar past 100% would
   * need a second visual language for overshoot, and the numerals already say it.
   */
  const fraction =
    target != null && target > 0
      ? Math.min(1, row.sets / target)
      : maxSets > 0
        ? row.sets / maxSets
        : 0;

  return (
    <View
      className="min-h-[44px] flex-row items-center px-lg py-sm"
      accessibilityLabel={`${clusterLabel(row.cluster, lang)}, ${t('{count} sets', {
        count: row.sets,
      })}${target != null ? ` ${t('of {target}', { target })}` : ''}${totals ? `, ${totals}` : ''}`}
    >
      <Text className="w-[64px] text-label font-medium text-ink">
        {clusterLabel(row.cluster, lang)}
      </Text>

      {/* `14 / 16` where a target exists, `14` where it does not. The target is
          `ink-faint` because it is the thing the user typed, not the thing that
          happened — the fact is the number in full ink beside it. */}
      <View className="w-[56px] flex-row items-baseline">
        <Text className="text-body font-semibold tabular-nums text-ink">{row.sets}</Text>
        {target != null ? (
          <Text className="text-label tabular-nums text-ink-faint">/{target}</Text>
        ) : null}
      </View>

      {/* The bar, and what those sets added up to, on one line. */}
      <View className="ml-sm flex-1">
        <View className="h-[6px] flex-row overflow-hidden rounded-pill">
          <View className="bg-green-dim" style={{ flex: fraction }} />
          <View style={{ flex: Math.max(0, 1 - fraction) }} />
        </View>
        {totals ? (
          <Text className="mt-[3px] text-micro tabular-nums text-ink-faint">{totals}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * One logged set, correctable.
 *
 * ── WHY THIS IS NOT `SetRow` + `QuickAdjust` ────────────────────────────────
 *
 * They are the right shape and the wrong contract. `SetRow` is 56 dp built around
 * a ✓ that logs, a ▶ that runs a clock, and a prefill-ghost state — none of which
 * means anything about a set that happened three weeks ago, and the ✓ in
 * particular would be a control that either does nothing or un-logs history.
 * `QuickAdjust` edits a `DraftSet` and offers `Remove set` against a live session.
 *
 * So this is deliberately quieter and smaller than both: a number, a chip row, and
 * two words. It reuses the app's own weight and count steps (`weightSteps`,
 * `countStep`) so a correction nudges by exactly what a set row nudges by, and it
 * snaps nothing — `QuickAdjust`'s rule about not rounding to a grid the app has
 * never seen applies at least as strongly to a number that is already a record.
 *
 * NO CONFIRMATION on a nudge, because a nudge is reversible by the opposite nudge
 * and the number is on screen while it changes. `Remove set` is not offered at all
 * on the last row of a workout: that is deleting the workout, which exists two rows
 * below and asks first.
 */
function LoggedSetRow({
  row,
  number,
  unitSystem,
  editing,
  canRemove,
  onFocusField,
  onChange,
  onRemove,
  onDone,
}: {
  row: SetHistory;
  /** 1-based position among this exercise's logged sets. `W` for a warm-up. */
  number: number;
  unitSystem: UnitSystem;
  editing: 'weight' | 'count' | null;
  canRemove: boolean;
  onFocusField: (field: 'weight' | 'count') => void;
  onChange: (patch: { weightKg?: number | null; count?: number }) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const weighted = row.weightKg != null;
  const steps = weightSteps(unitSystem);
  const countDelta = countStep(row.countUnit);

  const bumpWeight = (delta: number) => {
    tap();
    const current = unitSystem === 'imperial' ? kgToLb(row.weightKg ?? 0) : (row.weightKg ?? 0);
    const next = Math.max(0, Number((current + delta).toFixed(2)));
    onChange({ weightKg: unitSystem === 'imperial' ? lbToKg(next) : next });
  };

  const bumpCount = (delta: number) => {
    tap();
    onChange({ count: Math.max(0, row.count + delta) });
  };

  return (
    <View>
      <View className="flex-row items-center px-lg py-xs">
        <Text className="w-[20px] text-micro font-semibold uppercase tabular-nums text-ink-faint">
          {row.isWarmup ? 'W' : number}
        </Text>

        {weighted ? (
          <Pressable
            onPress={() => onFocusField('weight')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('Correct the weight, {weight} {unit}', {
              weight: formatWeight(row.weightKg, unitSystem, row.loadMode),
              unit: unitLabel(unitSystem, lang),
            })}
            style={pressedStyle}
            className={[
              'min-w-[76px] flex-row items-baseline',
              editing === 'weight' ? 'rounded-surface bg-surface px-xs' : '',
            ].join(' ')}
          >
            <Text className="text-label font-semibold tabular-nums text-ink">
              {formatWeight(row.weightKg, unitSystem, row.loadMode)}
            </Text>
            <Text className="ml-xs text-micro uppercase text-ink-faint">
              {unitLabel(unitSystem, lang)}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => onFocusField('count')}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('Correct the count, {count} {unit}', {
            count: formatCount(row.count, row.countUnit),
            unit: countUnitLabel(row.countUnit, lang),
          })}
          style={pressedStyle}
          className={[
            'ml-md min-w-[76px] flex-row items-baseline',
            editing === 'count' ? 'rounded-surface bg-surface px-xs' : '',
          ].join(' ')}
        >
          <Text className="text-label font-semibold tabular-nums text-ink">
            {formatCount(row.count, row.countUnit)}
          </Text>
          <Text className="ml-xs text-micro uppercase text-ink-faint">
            {countUnitLabel(row.countUnit, lang)}
          </Text>
        </Pressable>

        <View className="flex-1" />
        <Icon
          name={editing ? 'chevron-down' : 'chevron-right'}
          size={14}
          color={palette.inkFaint}
        />
      </View>

      {editing ? (
        <View className="mx-lg mb-sm rounded-surface bg-surface px-md py-sm">
          <View className="flex-row items-center justify-between">
            {(editing === 'weight'
              ? [-steps.coarse, -steps.fine, steps.fine, steps.coarse]
              : [-countDelta * 2, -countDelta, countDelta, countDelta * 2]
            ).map((delta) => (
              <Pressable
                key={delta}
                onPress={() => (editing === 'weight' ? bumpWeight(delta) : bumpCount(delta))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${delta > 0 ? 'Add' : 'Subtract'} ${Math.abs(delta)}`}
                style={pressedStyle}
                className="h-hit min-w-[52px] items-center justify-center rounded-pill border border-hairline bg-surface-alt"
              >
                <Text className="text-label font-medium tabular-nums text-ink">
                  {delta < 0 ? '−' : '+'}
                  {Math.abs(Number(delta.toFixed(2)))}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-sm flex-row items-center justify-between">
            {/* Only where it is not the last row of the workout. See the note above. */}
            {canRemove ? (
              <Pressable
                onPress={onRemove}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('Remove this set from the workout')}
                style={pressedStyle}
                className="h-hit justify-center"
              >
                <Text className="text-label font-medium text-ink-muted">{t('Remove set')}</Text>
              </Pressable>
            ) : (
              <Text className="text-label text-ink-faint">
                {t('The only set — delete the workout')}
              </Text>
            )}

            <Pressable
              onPress={onDone}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('Done correcting')}
              style={pressedStyle}
              className="h-hit justify-center"
            >
              <Text className="text-label font-semibold text-green-bright">{t('Done')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Nothing to show — and WHICH nothing, because they are not the same.
 *
 * An empty log is the normal state of a new install and reads as an invitation. A
 * log that could not be opened is a fault, the workouts are still on disk, and the
 * worst thing the screen can do is describe it as an empty log: that is the app
 * telling somebody their training is gone when it is not. So it says what happened
 * and what to do about it — reopening the app re-reads the file, and the number of
 * workouts actually on disk is stated in Settings.
 */
function Empty({ loadFailed = false }: { loadFailed?: boolean }) {
  const t = useT();

  if (loadFailed) {
    return (
      <View className="flex-1 items-center justify-center px-xl">
        <Text className="text-title font-medium text-ink">{t("Couldn't open your log")}</Text>
        <Text className="mt-sm text-center text-body text-ink-muted">
          {t(
            'Your workouts are still on disk — this is a failure to READ them, not a loss. Close the app and open it again. Settings states how many are down there, and “Export data” still works.',
          )}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center px-xl">
      <Text className="text-title font-medium text-ink">{t('Nothing finished yet')}</Text>
      <Text className="mt-sm text-center text-body text-ink-muted">
        {t(
          'Finish a workout and it lands here — every set, with what you lifted and how long it took.',
        )}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */

interface MonthGroup {
  key: string;
  label: string;
  workouts: CompletedWorkout[];
}

/**
 * Workouts bucketed by month, newest month first.
 *
 * The input is already newest-first (the store keeps it that way), so insertion
 * order is the right order and nothing is re-sorted here.
 */
function groupByMonth(
  workouts: readonly CompletedWorkout[],
  lang: Language,
  now: Date = new Date(),
): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  for (const workout of workouts) {
    const key = monthKey(workout.startedAt);
    const existing = groups.get(key);
    if (existing) {
      existing.workouts.push(workout);
      continue;
    }
    groups.set(key, {
      key,
      label: monthLabel(workout.startedAt, now, lang),
      workouts: [workout],
    });
  }

  return [...groups.values()];
}

/** "August", or "August 2025" once the year stops being obvious. */
function monthLabel(iso: string, now: Date, lang: Language): string {
  const date = new Date(iso);
  // The nominative month, because this is a heading naming the month itself —
  // `formatMonth` owns that table, and the genitive one is for dates.
  const full = formatMonth(date.getFullYear(), date.getMonth(), lang);
  if (date.getFullYear() !== now.getFullYear()) return full;
  // Same year, so the year is noise: drop it off whatever `formatMonth` built.
  return full.replace(` ${date.getFullYear()}`, '');
}

/**
 * "12 reps total" / "4:00 total" — every set of one exercise added up.
 *
 * Null for a single set, where the total is just the set restated, and for work
 * whose counts don't add to anything meaningful. Rounds state both numbers,
 * because "12 rounds" and "36:00" are two different facts about the same session.
 */
function describeTotal(exercise: CompletedExercise, t: Translate, lang: Language): string | null {
  const { totalCount, setCount, countUnit } = exercise;
  if (setCount <= 1 || totalCount <= 0) return null;

  if (countUnit === 'seconds') return t('{what} total', { what: formatDuration(totalCount, lang) });
  if (countUnit === 'rounds') {
    return `${t('{count} rounds', { count: setCount })} · ${formatDuration(totalCount, lang)}`;
  }
  return t('{what} total', {
    what: `${totalCount} ${term('unit', countUnit === 'meters' ? 'm' : 'reps', lang)}`,
  });
}

/**
 * "4 720 kg" — space-grouped thousands, because five digits of session volume is
 * normal and `47200` is unreadable at Label size.
 *
 * Grouped by hand rather than with `toLocaleString`: number formatting through
 * Intl depends on which ICU the engine shipped with, and a volume figure that
 * silently loses its grouping on one build and not another is not worth the
 * dependency for one regex.
 */
