/**
 * ConfirmSheet — "are you sure", in the bottom third where the thumb already is.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Delete “Weighted dips”?                    │
 *   │ It's in 2 routines. Sets you already logged │
 *   │ stay in your history.                       │
 *   │                                            │
 *   │ ╭──────────────── Delete ────────────────╮ │
 *   │ ╰──────────────── Keep it ───────────────╯ │
 *   ╰────────────────────────────────────────────╯
 *
 * A sheet rather than a dialog, for the same reason `FinishSheet` is one: both
 * answers have to stay under the thumb. A centred dialog puts the destructive
 * option in the middle of the screen and asks the user to reach for it.
 *
 * The destructive path is stated as a FACT and rendered in the same green as
 * every other primary action. There is no red in this app — a red button teaches
 * people to fear a button, and fear is not information. What makes this safe is
 * that the SAFE answer is bigger, lower, and also the whole scrim.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOverlay } from './overlay';
import { useT } from '../hooks/useT';
import { palette } from '../theme/tokens';
import { PrimaryButton } from './primitives';

/** Matches `FocusMode.tsx`'s `EASING`. */
const EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

interface ConfirmSheetProps {
  /** "Delete “Weighted dips”?" — a question, naming the actual subject. */
  title: string;
  /** What will happen, and what won't. States consequences, never scolds. */
  body?: string;
  confirmLabel: string;
  /** Defaults to the translated `Cancel`, so a caller only names an unusual one. */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  // The nav pill is a sibling of the whole section and would paint over this.
  // See `components/overlay.ts`.
  useIsOverlay();
  const keep = cancelLabel ?? t('Cancel');

  /* Scrim fades in; the sheet fades and rises the last 24dp under it — the same
     `EASING` as everything else that arrives, at the design's own 260ms. Both
     run once, on mount: this component exists only while the question is being
     asked, so there is no later render to guard against replaying it. */
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
      {/* Tapping the scrim is the safe answer: the easy gesture is never the
          irreversible one, even when the easy gesture is a mis-tap. */}
      {/* `style`, not `className`: NativeWind's classes don't reach a node
          wrapped by `Animated.createAnimatedComponent` — see `FocusRest.tsx`. */}
      <AnimatedPressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={keep}
        style={{ flex: 1, backgroundColor: palette.scrim, opacity: scrim }}
      />

      {/* The animated node only carries the transform: NativeWind's classes
          don't reach it, so the actual surface is the static `View` inside —
          same split `FocusMode.tsx` uses. */}
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
          {body ? <Text className="mt-sm text-body text-ink-muted">{body}</Text> : null}

          <View className="mt-xl">
            <PrimaryButton label={confirmLabel} onPress={onConfirm} />
            <View className="h-sm" />
            <PrimaryButton label={keep} variant="ghost" onPress={onCancel} />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
