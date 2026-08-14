/**
 * SplitTimeline — the "where am I in my split" strip for the home screen.
 *
 *   ●────●────◉────○────○
 *  Push  Boxing Pull Push Rest
 *             TODAY
 *
 * A split is a QUEUE, NOT A CALENDAR. Two cycle modes, both rendered by this one
 * component:
 *   • `weekly`  — days pinned to weekdays, the classic Mon/Wed/Fri view.
 *   • `rolling` — a queue that advances only when a session is completed. This
 *     is what a real training log looks like: an unbroken push → boxing → pull
 *     chain that doesn't care what the calendar says, and doesn't guilt-trip you
 *     for a missed Tuesday.
 *
 * The whole feature is one horizontal strip, because a sequence is what it is,
 * and a calendar grid would be a lie about how people actually train.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';

import type { SplitDay, WorkoutSplit } from '../types/models';
import { Kicker } from './primitives';

interface SplitTimelineProps {
  split: WorkoutSplit;
  /** Tapping a day starts (or previews) that routine. */
  onSelectDay: (day: SplitDay) => void;
}

export function SplitTimeline({ split, onSelectDay }: SplitTimelineProps) {
  const days = [...split.days].sort((a, b) => a.order - b.order);
  const todayIndex =
    split.cycleMode === 'rolling'
      ? split.cursor
      : days.findIndex((d) => d.weekday === new Date().getDay());

  return (
    <View>
      <Kicker className="mx-lg">
        {split.name} · {split.cycleMode}
      </Kicker>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8 }}
        className="mt-xl"
      >
        {days.map((day, index) => {
          const state: 'past' | 'today' | 'upcoming' =
            index < todayIndex ? 'past' : index === todayIndex ? 'today' : 'upcoming';
          const isRest = day.kind === 'rest';

          return (
            <Pressable
              key={day.id}
              onPress={() => onSelectDay(day)}
              accessibilityRole="button"
              accessibilityLabel={`${day.label}${state === 'today' ? ', today' : ''}`}
              className="w-[74px] items-center"
            >
              {/*
               * Node + connectors in one row: the two flex-1 rules grow to the
               * cell edges, so consecutive cells produce a continuous line with
               * no magic offsets. The outer stubs are transparent, which is what
               * makes the strip read as a segment rather than an axis.
               *
               * A connector is green-dim only where it links two COMPLETED
               * nodes: the line is history, not a route.
               */}
              <View className="h-[14px] w-full flex-row items-center">
                <View
                  className={[
                    'h-hairline flex-1',
                    index === 0
                      ? 'bg-transparent'
                      : index <= todayIndex
                        ? 'bg-green-dim'
                        : 'bg-hairline',
                  ].join(' ')}
                />

                {/* Filled = done, ring = today, hollow = upcoming. */}
                <View
                  className={[
                    'h-[14px] w-[14px] rounded-pill',
                    state === 'past' ? 'bg-green' : '',
                    state === 'today' ? 'border-[3px] border-green-bright bg-bg' : '',
                    state === 'upcoming'
                      ? `border border-hairline ${isRest ? 'bg-transparent' : 'bg-surface'}`
                      : '',
                  ].join(' ')}
                />

                <View
                  className={[
                    'h-hairline flex-1',
                    index === days.length - 1
                      ? 'bg-transparent'
                      : index < todayIndex
                        ? 'bg-green-dim'
                        : 'bg-hairline',
                  ].join(' ')}
                />
              </View>

              <Text
                numberOfLines={1}
                className={[
                  'mt-sm text-label',
                  state === 'today' ? 'font-semibold text-ink' : '',
                  state === 'past' ? 'text-ink-faint' : '',
                  state === 'upcoming' ? 'text-ink-muted' : '',
                ].join(' ')}
              >
                {day.label}
              </Text>

              {state === 'today' ? <Kicker tone="green" className="mt-xs">today</Kicker> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
