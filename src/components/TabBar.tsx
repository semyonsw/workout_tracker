/**
 * TabBar — Today / Tasks / Money / History / More.
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
 * ── FIVE IS STILL THE CEILING ─────────────────────────────────────────────
 *
 * It used to be Today · History · Routines · Library · Settings. Two more logs
 * arrived — the daily tasks and the money — and both are a reason to open the
 * app on their own, which is the test a root has to pass. So three training
 * screens that are NOT reasons to open the app gave up their roots: Routines,
 * the Library and Settings are all things you go to in order to change something
 * you set up once, and they now live one tap inside `More`.
 *
 * The labels stay at 13px. `History` is the longest of the five and still does
 * not truncate at 360 dp; a sixth root would not fit, so anything else that
 * needs a home goes inside one of these.
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
