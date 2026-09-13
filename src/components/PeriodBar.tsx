/**
 * PeriodBar — `‹  September 2026  ›`, and a tap in the middle to change what kind
 * of window that is.
 *
 * The one navigation control the money screens share, and the reason both arrows
 * and the label live in one component: the arrows step by the CURRENT kind, so a
 * screen that drew them itself would have to know the stepping rule. It does not;
 * it hands over a `Period` and gets one back (`lib/money.ts` owns the arithmetic).
 *
 * `All time` has nowhere to step, so its arrows are absent rather than disabled:
 * a control that is visible and inert is a control the user taps twice before
 * concluding the app is broken.
 */

import { Pressable, Text, View } from 'react-native';

import { periodLabel, shiftPeriod } from '../lib/money';
import { palette } from '../theme/tokens';
import type { Period } from '../types/finance';
import { Icon } from './Icon';
import { pressedStyle } from './motion';

export function PeriodBar({
  period,
  onChange,
  onOpenPicker,
}: {
  period: Period;
  onChange: (period: Period) => void;
  onOpenPicker: () => void;
}) {
  const steppable = period.kind !== 'all';

  return (
    <View className="h-hit flex-row items-center px-lg">
      <Arrow
        icon="chevron-left"
        label="Previous period"
        visible={steppable}
        onPress={() => onChange(shiftPeriod(period, -1))}
      />

      <Pressable
        onPress={onOpenPicker}
        accessibilityRole="button"
        accessibilityLabel={`${periodLabel(period)}, change period`}
        style={pressedStyle}
        className="h-hit flex-1 flex-row items-center justify-center"
      >
        <Text numberOfLines={1} className="text-body font-semibold tabular-nums text-ink">
          {periodLabel(period)}
        </Text>
        <View className="ml-sm">
          <Icon name="chevron-down" size={14} color={palette.inkFaint} />
        </View>
      </Pressable>

      <Arrow
        icon="chevron-right"
        label="Next period"
        visible={steppable}
        onPress={() => onChange(shiftPeriod(period, 1))}
      />
    </View>
  );
}

function Arrow({
  icon,
  label,
  visible,
  onPress,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  visible: boolean;
  onPress: () => void;
}) {
  if (!visible) return <View className="w-hit" />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={pressedStyle}
      className="h-hit w-hit items-center justify-center"
    >
      <Icon name={icon} size={20} color={palette.ink} />
    </Pressable>
  );
}
