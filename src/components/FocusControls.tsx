/**
 * The controls at the bottom of focus mode — the only things in it you press.
 *
 *   ┌──────────────────────────────┐
 *   │        undo last set         │  ← FocusUndoRow, ghost until there is one
 *   │           ╭────╮             │
 *   │           │ ✓  │             │  ← FocusDone, 176 dp
 *   │           │DONE│             │
 *   │           ╰────╯             │
 *   └──────────────────────────────┘
 *
 *   [ ▶ Start ]            [ ✕ ]     ← FocusAction, filled or outlined
 *
 * THE PRESS FEEDBACK IS THE POINT OF THIS FILE. Every target in focus mode is
 * pressed by a hand that is not aiming — the phone is flat on a bench, the thumb
 * arrives from above, and the screen is being read from two metres. So the big
 * targets scale down 4% under the finger and the ghost rows drop to 45% opacity,
 * declared once here so a control cannot be added later that acknowledges nothing.
 *
 * WHY DONE IS A CIRCLE AND `Finish workout` IS NOT. They live in the same slot, and
 * that is deliberate: the thumb finds the primary action by position without
 * looking. A different GEOMETRY in the same place is how the eye is told that the
 * thing under the thumb has changed — `Finish` writes to history and is not one tap
 * to undo, so it must not be pressable by muscle memory alone.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable } from './Pressable';

import { commit, tap, undo as undoFeedback } from '../lib/feedback';
import { useMotionScale } from '../hooks/useMotionScale';
import { glow as GLOW, palette } from '../theme/tokens';
import { COMMIT_GRADIENT, SpecularEdge } from './glass';
import { Icon, type IconName } from './Icon';
import { Ripple, usePressScale } from './motion';
import { useT } from '../hooks/useT';

/**
 * How far the wide targets sink under a finger — the finish pill and the action
 * row. Enough to see at arm's length, not enough to look like the button is
 * falling over. DONE is the exception and sinks to 0.92 on the overshoot curve:
 * it is the one control on the screen whose press has to read from two metres.
 */
const PRESS_SCALE_LARGE = 0.975;

/** The one glow, spread behind the one control that is always the answer. */
const DONE_GLOW = {
  boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 40, color: GLOW }],
} as const;

/**
 * DONE — 176 dp of "I did that".
 *
 * `commit()` fires here rather than in the caller, because this control means the
 * same thing everywhere it appears (state A, all four timed-set phases) and the
 * haptic is half of the acknowledgement: the visual flash the sheet paints is the
 * other half, and neither may travel alone. See `lib/feedback.ts`.
 *
 * ── THE PRESS, AND THE RIPPLE ─────────────────────────────────────────────
 *
 * It sinks to 0.92 under the thumb and settles back on the overshoot curve, and a
 * 3 dp ring leaves it — scale 1 → 1.9, fading — so the press is visible from two
 * metres away, which is where focus mode is read from. `delayMs` is the one place
 * a commit waits for an animation: the design logs the set 180 ms after the press
 * so the ripple is seen leaving THIS button before the rest screen replaces it.
 * The haptic still fires on the press itself, a second press inside the wait is
 * ignored (it would log the NEXT set), and with reduced motion there is no wait.
 */
export function FocusDone({
  onPress,
  label,
  delayMs = 0,
}: {
  onPress: () => void;
  label: string;
  /** Log this long after the press, so the ripple is seen. 0 = at once. */
  delayMs?: number;
}) {
  const motionScale = useMotionScale();
  const press = usePressScale(0.92);
  const [rippleKey, setRippleKey] = useState<number | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const handlePress = () => {
    if (pending.current) return;
    commit();
    setRippleKey(Date.now());
    const wait = delayMs * motionScale;
    if (wait <= 0) {
      onPress();
      return;
    }
    pending.current = setTimeout(() => {
      pending.current = null;
      onPress();
    }, wait);
  };

  return (
    <View className="h-focus-done w-focus-done self-center">
      {rippleKey != null ? <Ripple key={rippleKey} size={176} /> : null}
      <Pressable
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Animated.View
          style={{
            width: 176,
            height: 176,
            borderRadius: 9999,
            transform: press.style.transform,
            boxShadow: [
              { offsetX: 0, offsetY: 0, blurRadius: 44, color: 'rgba(63,169,108,0.45)' },
              { offsetX: 0, offsetY: 18, blurRadius: 44, color: 'rgba(0,0,0,0.6)' },
            ],
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 9999,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(63,169,108,0.5)',
            }}
          >
            <LinearGradient
              colors={[...COMMIT_GRADIENT]}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <SpecularEdge color="rgba(236,241,238,0.22)" radius={9999} height={2} />
            {/* The check never changes meaning anywhere in this app; this is the
                same mark the set row carries, at the size a thumb aiming from
                above needs. */}
            <Icon name="check" size={56} color={palette.ink} />
            <Text
              allowFontScaling={false}
              style={{ marginTop: 6, fontSize: 15, letterSpacing: 2 }}
              className="font-bold uppercase text-ink"
            >
              {label}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

/**
 * `Finish workout` — DONE's slot, a different shape. See the file header.
 *
 * It does NOT finish anything: it opens the sheet that already asks the three
 * questions finishing a session asks (`FinishSheet`). Focus mode adds no finish
 * logic of its own; it only puts the button where the thumb is.
 */
export function FocusFinish({ onPress }: { onPress: () => void }) {
  const t = useT();

  return (
    <Pressable
      onPress={() => {
        commit();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('Finish this workout')}
      style={({ pressed }) => [
        DONE_GLOW,
        pressed ? { transform: [{ scale: PRESS_SCALE_LARGE }] } : null,
      ]}
      className="h-focus-finish flex-row items-center justify-center rounded-pill bg-green"
    >
      <Icon name="check" size={34} color={palette.ink} />
      <Text className="ml-lg text-title-lg font-semibold text-ink">{t('Finish workout')}</Text>
    </Pressable>
  );
}

/**
 * `undo last set` — a ghost row above the primary control.
 *
 * PRESENT EVEN WHEN THERE IS NOTHING TO UNDO, at 25% opacity, because the row
 * under it is 176 dp of green and a control that appears and disappears above it
 * would move the thing the thumb is aiming at. It occupies its 44 dp always; only
 * its opacity says whether it can be pressed.
 */
export function FocusUndoRow({ onPress }: { onPress: (() => void) | null }) {
  const t = useT();

  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              undoFeedback();
              onPress();
            }
          : undefined
      }
      disabled={onPress == null}
      accessibilityRole="button"
      accessibilityLabel={t('Undo the last logged set')}
      accessibilityState={{ disabled: onPress == null }}
      style={({ pressed }) => [{ opacity: onPress == null ? 0.25 : pressed ? 0.45 : 1 }]}
      className="h-hit items-center justify-center"
    >
      <Text className="text-micro font-semibold uppercase text-ink-faint">
        {t('undo last set')}
      </Text>
    </Pressable>
  );
}

/**
 * `Start` / `Start now` / `Stop` / `+15` / `✕` — the timed-set row.
 *
 * One component for all five because they are one row of one shape in two tones:
 * FILLED means it logs something (`Stop`), outlined means it does not. That is the
 * same argument `SetTimerPill` makes for wording the primary action `Stop` rather
 * than `Skip` — stopping a hold records it — and the ✕ beside it is a glyph rather
 * than a word precisely because it is the escape hatch and not one of the two
 * things you normally do.
 */
export function FocusAction({
  label,
  icon,
  tone = 'outlined',
  width = 'flex-1',
  onPress,
  accessibilityLabel,
}: {
  /** Absent = a glyph-only target, which is the ✕. */
  label?: string;
  icon?: IconName;
  tone?: 'filled' | 'outlined';
  /** `flex-1` for the primary, a fixed `w-[…]` for the two that flank it. */
  width?: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const filled = tone === 'filled';
  const ink = filled ? palette.ink : palette.greenBright;

  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? { transform: [{ scale: PRESS_SCALE_LARGE }] } : null)}
      className={[
        'h-focus-action flex-row items-center justify-center rounded-pill',
        width,
        filled ? 'bg-green' : 'border border-hairline bg-surface-alt',
      ].join(' ')}
    >
      {icon ? <Icon name={icon} size={28} color={ink} /> : null}
      {label ? (
        <Text
          className={[
            'text-title font-semibold',
            icon ? 'ml-md' : '',
            filled ? 'text-ink' : 'text-green-bright',
          ].join(' ')}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The quiet ✕ that walks away from a hold with nothing logged, and the `+15` that
 * extends one. Same height as `FocusAction` so the row's baseline is one line;
 * `ink-faint` because neither is what you are most likely to want.
 */
export function FocusQuietAction({
  label,
  icon,
  width,
  onPress,
  accessibilityLabel,
}: {
  label?: string;
  icon?: IconName;
  width: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? { opacity: 0.5 } : null)}
      className={[
        'h-focus-action items-center justify-center rounded-pill border border-hairline',
        width,
      ].join(' ')}
    >
      {icon ? <Icon name={icon} size={22} color={palette.inkFaint} /> : null}
      {label ? (
        <Text className="text-label font-semibold tabular-nums text-ink-muted">{label}</Text>
      ) : null}
    </Pressable>
  );
}

/** The bottom stack: the ghost undo row, then whatever the state's answer is. */
export function FocusBottom({
  children,
  onUndo,
}: {
  children: ReactNode;
  onUndo: (() => void) | null;
}) {
  return (
    <View className="px-lg pb-xl">
      <FocusUndoRow onPress={onUndo} />
      <View className="mt-sm">{children}</View>
    </View>
  );
}
