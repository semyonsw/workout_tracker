/**
 * Sheet — the bottom-third surface everything that is not a question arrives on.
 *
 *   ╭────────────────────────────────────────────╮
 *   │                  ▁▁▁▁                      │  ← the grab handle
 *   │ Time interval                              │
 *   │ …                                          │
 *   ╰────────────────────────────────────────────╯
 *
 * `ConfirmSheet` is the same geometry with a fixed body: a question and two
 * answers. This is the empty version, for a sheet whose contents are a list or a
 * small form — picking the window the money screen reads through, writing a new
 * task. The chrome, the easing and the two entrances are deliberately identical
 * so the two never read as different objects.
 *
 * TAPPING THE SCRIM DISMISSES, and the caller's `onDismiss` is always the
 * NON-committal answer — nothing here is destructive, so the cheap gesture can
 * safely be the one that closes it.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOverlay } from './overlay';
import { useT } from '../hooks/useT';
import { palette } from '../theme/tokens';

/** Matches `ConfirmSheet` and `FocusMode`. */
const EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

interface SheetProps {
  title: string;
  onDismiss: () => void;
  children: ReactNode;
}

export function Sheet({ title, onDismiss, children }: SheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  // The nav pill is a sibling of the whole section and would paint over this.
  // See `components/overlay.ts`.
  useIsOverlay();

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
      {/* `style`, not `className`: NativeWind's classes don't reach a node
          wrapped by `Animated.createAnimatedComponent`. */}
      <AnimatedPressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('Close')}
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
          className="rounded-t-surface border-t border-t-hairline bg-surface px-lg pt-lg"
        >
          <View className="mb-lg h-xs w-[36px] self-center rounded-pill bg-hairline" />
          <Text className="mb-lg text-title font-medium text-ink">{title}</Text>
          {/* Capped, so a long list scrolls rather than growing past the screen. */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
            {children}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
