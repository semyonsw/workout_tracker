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
 */

import { Pressable, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, ListCard, Separator } from '../components/primitives';
import { TrendChart } from '../components/TrendChart';
import { describeHistory, sessionRows, topWeightSeries } from '../lib/history';
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
  const plateauDays =
    verdict && verdict.sessionsAtWeight >= 2 ? verdict.plateauDays : null;
  const loadPrefix = exercise.loadMode === 'added_bodyweight' ? '+' : '';

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
          <Text className="mx-lg mt-xl text-body text-ink-muted">
            No completed sets yet.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
