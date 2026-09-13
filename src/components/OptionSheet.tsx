/**
 * OptionSheet — a bottom sheet that asks "which one", where `ConfirmSheet` asks
 * "are you sure".
 *
 * Same scrim, same rise, same cancel-on-scrim rule, and it exists for the two
 * places a choice is a LIST rather than a yes/no: the window the money screen is
 * looking at, and the direction a transaction moves money. Rolling it into
 * `ConfirmSheet` would have meant a component with two mutually exclusive halves;
 * five options is the ceiling here, and past that the answer is a screen.
 *
 * Each option can carry a `detail` — `September 2026` under `Month` — because the
 * thing that makes a period picker usable is seeing what you would be choosing
 * before you choose it.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../theme/tokens';
import { pressedStyle } from './motion';
import { PrimaryButton, Separator } from './primitives';

const EASING = Easing.bezier(0.2, 0, 0, 1);

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  /** What picking it would mean, in the user's own calendar. Optional. */
  detail?: string;
}

export function OptionSheet<T extends string>({
  title,
  options,
  value,
  onSelect,
  onCancel,
}: {
  title: string;
  options: readonly SheetOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scrim = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(scrim, {
      toValue: 1,
      duration: 180,
      easing: EASING,
      useNativeDriver: true,
    }).start();
    Animated.timing(sheet, {
      toValue: 1,
      duration: 260,
      easing: EASING,
      useNativeDriver: true,
    }).start();
  }, [scrim, sheet]);

  return (
    <View className="absolute inset-0" accessibilityViewIsModal>
      <AnimatedPressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        style={{ flex: 1, backgroundColor: palette.scrim, opacity: scrim }}
      />

      <Animated.View
        style={{
          opacity: sheet,
          transform: [
            { translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          ],
        }}
      >
        <View
          style={{ paddingBottom: insets.bottom + 16 }}
          className="rounded-t-surface border-t border-t-hairline bg-surface px-lg pt-xl"
        >
          <Text className="text-title font-medium text-ink">{title}</Text>

          <View className="mt-lg overflow-hidden rounded-surface border border-hairline bg-surface-alt">
            {options.map((option, index) => {
              const selected = option.value === value;
              return (
                <View key={option.value}>
                  {index > 0 ? <Separator inset={16} /> : null}
                  <Pressable
                    onPress={() => onSelect(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={
                      option.detail ? `${option.label}, ${option.detail}` : option.label
                    }
                    style={pressedStyle}
                    className="h-row-lg flex-row items-center px-lg"
                  >
                    <View className="flex-1">
                      <Text
                        className={[
                          'text-body',
                          selected ? 'font-semibold text-green-bright' : 'font-medium text-ink',
                        ].join(' ')}
                      >
                        {option.label}
                      </Text>
                      {option.detail ? (
                        <Text className="mt-[2px] text-label tabular-nums text-ink-faint">
                          {option.detail}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View className="mt-lg">
            <PrimaryButton label="Cancel" variant="ghost" onPress={onCancel} />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
