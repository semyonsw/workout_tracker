/**
 * TabBar — Workout / Tasks / Expenses / Settings.
 *
 * This bar exists ONLY outside a session. During a workout the session owns the
 * whole screen: there is nothing else to do while you are mid-set, and a tab bar
 * would put another log one thumb-slip away from the ✓.
 *
 * Text only, no icons. Words are faster to read than glyphs you have to learn,
 * and the app's icon budget is spent on things that do something. The icon set
 * was drawn and compared; it cost the label two pixels and the app five glyphs,
 * and bought nothing a word was not already saying.
 *
 * ── FOUR SECTIONS, AND THE TWO THAT LEFT ──────────────────────────────────
 *
 * It was Today · Tasks · Money · History · More. `History` was never a section:
 * it is the PAST of one, and putting it on the bar meant the training log had a
 * root of its own while the tasks' and the money's were buried at the bottom of
 * their screens. It is a ⟲ in each section's own corner now — see
 * `components/SectionTopBar.tsx` — which is the same tap from all three.
 *
 * `More` was a lobby: one screen whose whole job was to hold the door for three
 * others. Settings is a root because it is the one of the three you actually
 * open, and it leads with a row per section. Routines and the exercise library
 * belong to the training log and now sit at the foot of the Workout section,
 * beside the routines they are about.
 *
 * The order is `lib/sectionNav.ts`, because a swipe moves along it — this bar
 * renders that array rather than declaring a second one. The array holds the
 * ENGLISH names, because it is also the route key — what is drawn goes through
 * `t()`, so the bar reads `Тренировка` while the navigation still says `Workout`.
 * A translated value used as an identifier is a router that breaks when somebody
 * changes language mid-session.
 *
 * The labels stay at 13px; `Тренировка` is the longest of the eight names across
 * both languages and does not truncate at 360 dp.
 */

import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BubblePressable } from './bubbles';
import { useT } from '../hooks/useT';
import { SECTIONS, type SectionTab } from '../lib/sectionNav';

export const TABS = SECTIONS;
export type TabName = SectionTab;

interface TabBarProps {
  active: TabName;
  onSelect: (tab: TabName) => void;
}

export function TabBar({ active, onSelect }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const t = useT();

  return (
    <View style={{ paddingBottom: insets.bottom }} className="border-t border-t-hairline bg-bg">
      <View className="h-[64px] flex-row items-center">
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <BubblePressable
              key={tab}
              onPress={() => onSelect(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t(tab)}
              className="h-hit flex-1 items-center justify-center"
            >
              <Text
                numberOfLines={1}
                allowFontScaling={false}
                className={[
                  'text-label',
                  isActive ? 'font-semibold text-green-bright' : 'font-medium text-ink-muted',
                ].join(' ')}
              >
                {t(tab)}
              </Text>
            </BubblePressable>
          );
        })}
      </View>
    </View>
  );
}
