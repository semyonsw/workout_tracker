/**
 * ExerciseHistoryScreen — has this actually been going up.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  HISTORY                                   │
 *   │ Wide pull-ups machine                        │
 *   │ 8 sessions · top 80 kg · same weight 16 days │
 *   │ TOP WORKING WEIGHT                           │
 *   │   ╱╲ chart ╱╲                                │
 *   │ SESSIONS                                     │
 *   │ 8 Aug   80 kg · 8 6 5 5                      │
 *   │ 23 Jul  80 kg · 7 · 75 kg · 7 7 6            │
 *   └──────────────────────────────────────────────┘
 *
 * The screen answers one question and refuses the others. No volume totals, no
 * 1RM estimate, no PR badge: those are numbers that go up on their own and tell
 * you nothing about whether to add a plate. Top working weight per session, the
 * sessions that produced it, and how long it has been stuck — that's the whole
 * screen, and it's the same data the nudge fires on.
 *
 * The 1RM refusal outlived a field: `SetHistory.estimated1RM` was computed and
 * stored on every rep set for two releases and rendered nowhere, because this is
 * the screen it would have been rendered on and this is the screen that says no.
 * It is deleted as of 0.12.0 — the argument here was the whole case against it.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, ListCard, Separator } from '../components/primitives';
import { TrendChart } from '../components/TrendChart';
import { describeHistory, sessionRows, topWeightSeries } from '../lib/history';
import {
  LADDER_SETS,
  describeLadder,
  ladderOf,
  ladderTargets,
  ladderTotal,
  sessionsToNextMax,
} from '../lib/repLadder';
import type { OverloadVerdict } from '../lib/progressiveOverload';
import { formatShortDate } from '../lib/units';
import type { Exercise, ID, SetHistory } from '../types/models';

interface ExerciseHistoryScreenProps {
  exercise: Exercise;
  history: SetHistory[];
  /** Supplies the "same weight for N days" clause. */
  verdict?: OverloadVerdict;
  onBack: () => void;
  /**
   * Open this exercise in the editor.
   *
   * This screen is where the header action belongs: tapping an exercise anywhere in
   * the app lands here, so it is the one place that is always "about" one exercise —
   * and looking at a wrong name or a wrong starting weight is exactly when you want
   * to fix it.
   */
  onEdit?: () => void;
  onOpenSession?: (sessionId: ID) => void;
}

export function ExerciseHistoryScreen({
  exercise,
  history,
  verdict,
  onBack,
  onEdit,
  onOpenSession,
}: ExerciseHistoryScreenProps) {
  const rows = sessionRows(history, exercise);
  const series = topWeightSeries(rows);
  /*
   * The staleness clause is a fact about the data, not a nag, so it appears as
   * soon as the same weight has been hit twice — well before the engine is
   * willing to nudge. On a lift that is still climbing there is no run to report
   * and the clause drops out entirely.
   */
  const plateauDays = verdict && verdict.sessionsInRun >= 2 ? verdict.plateauDays : null;
  const loadPrefix = exercise.loadMode === 'added_bodyweight' ? '+' : '';
  /*
   * The ladder, if this exercise runs one. Shown at five sets — the scheme's own
   * shape — because this screen is about the exercise and not about any one
   * routine's set count.
   */
  const ladder = ladderOf(exercise);
  const ladderPlan = ladder ? ladderTargets(ladder, LADDER_SETS) : null;
  const untilPR = ladder ? sessionsToNextMax(ladder, LADDER_SETS) : 0;

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker="History"
        onBack={onBack}
        action={onEdit ? { label: 'Edit', tone: 'muted', onPress: onEdit } : undefined}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mx-lg text-title font-medium text-ink">{exercise.name}</Text>
        <Text className="mx-lg mt-xs text-label tabular-nums text-ink-muted">
          {describeHistory(rows, plateauDays, loadPrefix)}
        </Text>

        {/*
          THE LADDER, above the chart, because it is the only thing on this screen
          that says what to do NEXT. Everything below it is what already happened.

          It answers the one question a scheme like this gets asked — how far to the
          next max — in sessions rather than in weeks, because a ladder does not
          advance on a calendar. It moves when you meet it.
        */}
        {ladder && ladderPlan ? (
          <>
            <Kicker tone="green" className="mx-lg mt-xl">
              Ladder · max {ladder.max}
            </Kicker>
            <Text className="mx-lg mt-sm text-title font-medium tabular-nums text-ink">
              {describeLadder(ladderPlan)}
            </Text>
            <Text className="mx-lg mt-xs text-label tabular-nums text-ink-muted">
              {ladderTotal(ladderPlan)} reps ·{' '}
              {untilPR === 1
                ? `meet it and the max becomes ${ladder.max + 1}`
                : `${untilPR} met sessions to a max of ${ladder.max + 1}`}
            </Text>
          </>
        ) : null}

        {series.length >= 2 ? (
          <>
            <Kicker className="mx-lg mt-xl">Top working weight</Kicker>
            <View className="mx-lg mt-md">
              <TrendChart points={series} />
            </View>
          </>
        ) : null}

        {rows.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-sm mt-xl">Sessions</Kicker>
            <ListCard className="mx-lg">
              {rows.map((row, index) => (
                <View key={row.sessionId}>
                  {index > 0 ? <Separator /> : null}
                  <Pressable
                    onPress={onOpenSession ? () => onOpenSession(row.sessionId) : undefined}
                    disabled={!onOpenSession}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatShortDate(row.performedAt)}: ${row.lead}${row.drops ?? ''}`}
                    className="h-row flex-row items-center px-lg"
                  >
                    <Text className="w-[64px] text-label tabular-nums text-ink-faint">
                      {formatShortDate(row.performedAt)}
                    </Text>
                    {/* Drops continue the same Text so they wrap as one line of
                        prose, not as a second column that needs aligning. */}
                    <Text
                      numberOfLines={1}
                      className="ml-md flex-1 text-body font-medium tabular-nums text-ink"
                    >
                      {row.lead}
                      {row.drops ? (
                        <Text className="text-body font-medium tabular-nums text-ink-faint">
                          {row.drops}
                        </Text>
                      ) : null}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </ListCard>
          </>
        ) : (
          <Text className="mx-lg mt-xl text-body text-ink-muted">No completed sets yet.</Text>
        )}
      </ScrollView>
    </View>
  );
}
