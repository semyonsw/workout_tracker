/**
 * ScreenHeader — the one header every screen uses.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹   PULL + SWIMMING                [ Finish ] │
 *   │     11 of 18 sets · 42 min                    │
 *   └──────────────────────────────────────────────┘
 *
 * Three slots and nothing else: back, a Micro kicker (plus an optional Label
 * subtitle), and at most one pill action. Every screen in the app fits that,
 * which is why there is no per-screen header component.
 *
 * The kicker can go `green-bright` to signal a transient mode — reordering a
 * routine says `MOVING · PULL TO STOMACH` — and the action can demote to
 * `surface-alt` when it isn't the thing to do right now. Those two switches
 * cover every header state in the design.
 */

import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../hooks/useT';
import { palette } from '../theme/tokens';
import { BubblePressable } from './bubbles';
import { Icon, type IconName } from './Icon';
import { pressedStyle } from './motion';

export interface HeaderAction {
  label: string;
  onPress: () => void;
  /** `primary` = green fill. `muted` = surface-alt, for "not yet / not now". */
  tone?: 'primary' | 'muted';
}

/**
 * A 36px glyph LEFT of the pill action.
 *
 * One caller: the routine editor's die. It is a glyph rather than a second pill
 * because the pill is the commit — `Save` — and two pills in one corner is two
 * things that look equally like the way out of the screen. A circle the same
 * size as the ones in `SectionTopBar` reads as what it is: a thing that does
 * something to the screen you are on, not a thing that leaves it.
 */
export interface HeaderIconAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Held rather than tapped — the die's "ask me what to put in it". */
  onLongPress?: () => void;
  /** Lit, while it is doing something. */
  active?: boolean;
}

interface ScreenHeaderProps {
  /** Uppercase Micro kicker. Reads as a location, not a title. */
  kicker: string;
  /** Tinted kicker for a transient mode (reorder, moving, recording). */
  kickerTone?: 'faint' | 'green';
  /** Second line, Label tabular — progress, counts, dates. */
  subtitle?: string;
  onBack?: () => void;
  action?: HeaderAction;
  /** A glyph button before the pill. See `HeaderIconAction`. */
  iconAction?: HeaderIconAction;
  /**
   * The hairline under the header. Absent where the content below is itself a
   * distinct surface (a search field), so the two rules don't stack.
   */
  bordered?: boolean;
  children?: ReactNode;
}

export function ScreenHeader({
  kicker,
  kickerTone = 'faint',
  subtitle,
  onBack,
  action,
  iconAction,
  bordered = true,
  children,
}: ScreenHeaderProps) {
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingTop: insets.top + 4 }}
      className={['bg-bg px-lg pb-md', bordered ? 'border-b border-b-hairline' : ''].join(' ')}
    >
      <View className="flex-row items-center">
        {/* 32 wide, 44 high: a narrow glyph with a full-height hit area. */}
        <Pressable
          onPress={onBack}
          disabled={!onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
          className="h-hit w-[32px] justify-center"
        >
          {onBack ? <Icon name="chevron-left" size={22} color={palette.inkMuted} /> : null}
        </Pressable>

        <View className="ml-xs flex-1">
          <Text
            numberOfLines={1}
            className={[
              'text-micro font-semibold uppercase',
              kickerTone === 'green' ? 'text-green-bright' : 'text-ink-faint',
            ].join(' ')}
          >
            {kicker}
          </Text>
          {subtitle ? (
            <Text className="mt-xs text-label font-medium tabular-nums text-ink-muted">
              {subtitle}
            </Text>
          ) : null}
        </View>

        {iconAction ? (
          <BubblePressable
            onPress={iconAction.onPress}
            onLongPress={iconAction.onLongPress}
            delayLongPress={320}
            hitSlop={8}
            radius="pill"
            accessibilityRole="button"
            accessibilityLabel={iconAction.label}
            style={pressedStyle}
            className={[
              'mr-sm h-[36px] w-[36px] items-center justify-center rounded-pill border',
              iconAction.active
                ? 'border-green-bright bg-surface-alt'
                : 'border-hairline bg-surface',
            ].join(' ')}
          >
            <Icon
              name={iconAction.icon}
              size={18}
              color={iconAction.active ? palette.greenBright : palette.inkMuted}
            />
          </BubblePressable>
        ) : null}

        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            className={[
              'h-[36px] items-center justify-center rounded-pill px-lg',
              action.tone === 'muted' ? 'border border-hairline bg-surface-alt' : 'bg-green',
            ].join(' ')}
          >
            <Text
              className={[
                'text-label font-semibold',
                action.tone === 'muted' ? 'text-ink-muted' : 'text-ink',
              ].join(' ')}
            >
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {children}
    </View>
  );
}
