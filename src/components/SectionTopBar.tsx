/**
 * SectionTopBar — the strip at the top of a section root.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ WORKOUT                                  ⟲   │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY THE HISTORY GLYPH IS UP HERE ───────────────────────────────────────
 *
 * Every section used to keep its own past at the BOTTOM of the screen it was
 * looking at: the tasks' month grid and trend under the day's rows, the money's
 * charts under the category tiles. So "how has this been going" was a scroll
 * through everything you already know before you reach the part you came for,
 * and it got longer every time the top of the screen grew. One tap in a corner
 * that never moves is the same distance from every section, and the past gets a
 * screen of its own rather than a tail.
 *
 * ── WHY NOT `ScreenHeader` ─────────────────────────────────────────────────
 *
 * That one is for a screen you are INSIDE: it leads with back, and its kicker
 * reads as a place you can leave. A section root is somewhere you already are —
 * nothing to go back to, and the tab bar says where you are as well. So this is
 * the same type scale and the same safe-area handling with the two halves swapped:
 * no back, one optional action, and no hairline, because every section below puts
 * its own first surface right under it.
 */

import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { pressedStyle } from './motion';
import { palette } from '../theme/tokens';

interface SectionTopBarProps {
  /** Uppercase Micro kicker — the section's own name. */
  title: string;
  /** Second line, for a count or a total the section wants in the corner. */
  subtitle?: string;
  /** The ⟲ on the right. Absent on a section that has no past to show. */
  onOpenHistory?: () => void;
  /** What the glyph opens, spoken. "Training history", "Task history". */
  historyLabel?: string;
}

export function SectionTopBar({
  title,
  subtitle,
  onOpenHistory,
  historyLabel = 'History',
}: SectionTopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top + 4 }} className="bg-bg px-lg pb-sm">
      <View className="h-hit flex-row items-center">
        <View className="flex-1">
          <Text numberOfLines={1} className="text-micro font-semibold uppercase text-ink-faint">
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-xs text-label font-medium tabular-nums text-ink-muted">
              {subtitle}
            </Text>
          ) : null}
        </View>

        {onOpenHistory ? (
          <Pressable
            onPress={onOpenHistory}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={historyLabel}
            style={pressedStyle}
            className="h-hit w-hit items-center justify-end"
          >
            <View className="h-[36px] w-[36px] items-center justify-center rounded-pill border border-hairline bg-surface">
              <Icon name="history" size={18} color={palette.inkMuted} />
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
