/**
 * TabBar — Today / Tasks / Money / History / More.
 *
 * This bar exists ONLY outside a session. During a workout the session owns the
 * whole screen: there is nothing else to do while you are mid-set, and a tab bar
 * would put "Library" one thumb-slip away from the ✓.
 *
 * Text only, no icons. Words are faster to read than glyphs you have to learn,
 * and the app's icon budget is spent on things that do something.
 *
 * FIVE IS STILL THE CEILING, and the app tracking three things rather than one did
 * not move it. What moved is which five: `Tasks` and `Money` became roots because
 * they are each a reason to open the app, and `Routines`, `Library` and `Settings`
 * went behind `More` because they are setup — opened once a month, not twice a day.
 *
 * `History` keeps its root for the reason it earned one: you either train, or you
 * look at what you have trained. The labels stay at 13px, and `History` is still the
 * longest of the five, so nothing truncates. A sixth root would not fit — anything
 * else that needs a home goes inside one of these.
 */

import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const TABS = ['Today', 'Tasks', 'Money', 'History', 'More'] as const;
export type TabName = (typeof TABS)[number];

interface TabBarProps {
  active: TabName;
  onSelect: (tab: TabName) => void;
}

export function TabBar({ active, onSelect }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingBottom: insets.bottom }} className="border-t border-t-hairline bg-bg">
      <View className="h-[64px] flex-row items-center">
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <Pressable
              key={tab}
              onPress={() => onSelect(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab}
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
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
