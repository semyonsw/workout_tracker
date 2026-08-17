/**
 * TabBar — Today / History / Routines / Library / Settings.
 *
 * This bar exists ONLY outside a session. During a workout the session owns the
 * whole screen: there is nothing else to do while you are mid-set, and a tab bar
 * would put "Library" one thumb-slip away from the ✓.
 *
 * Text only, no icons. Words are faster to read than glyphs you have to learn,
 * and the app's icon budget is spent on things that do something.
 *
 * FIVE IS THE CEILING, and History is the fifth. It earns a root rather than a
 * corner of Today because it is the second reason to open the app at all — you
 * either train, or you look at what you have trained. The labels stay at 13px
 * (`History` is the second-shortest of the five, so nothing truncates); a sixth
 * root would not fit, so anything else that needs a home goes inside one of these.
 */

import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const TABS = ['Today', 'History', 'Routines', 'Library', 'Settings'] as const;
export type TabName = (typeof TABS)[number];

interface TabBarProps {
  active: TabName;
  onSelect: (tab: TabName) => void;
}

export function TabBar({ active, onSelect }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingBottom: insets.bottom }}
      className="border-t border-t-hairline bg-bg"
    >
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
