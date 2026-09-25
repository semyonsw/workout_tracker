/**
 * BalanceBubble — every account's balance, carried along at the top of Expenses
 * once the balance card has scrolled away.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ ╭──────────────╮                         │
 *   │ │💵 CASH       │  💳 ONLINE              │   ← the lit thumb is the account
 *   │ │   9,020      │     48,500              │     every figure below is about
 *   │ ╰──────────────╯                         │
 *   ╰──────────────────────────────────────────╯
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 *
 * The balance is the one number the Expenses section is ABOUT, and it was the
 * first thing to scroll away: reading the category grid meant reading it with no
 * idea what was left. The bubble keeps it on screen — and keeps EVERY live
 * account's balance, one pill each, because switching account is the other thing
 * you do while you read the grid.
 *
 * ── NEVER A TOTAL ─────────────────────────────────────────────────────────
 *
 * Each balance on its own pill, and no sum anywhere, for the same reason the
 * money screen never adds its accounts up: cash and a card are different piles
 * of money, and a figure that pooled them would be a number nobody can spend.
 *
 * ── THE PILLS ─────────────────────────────────────────────────────────────
 *
 *   • The selected account sits on a lit thumb that SLIDES between pills on the
 *     spring curve (460 ms). The pills are as wide as their names, so the thumb
 *     is measured onto each one rather than being a fixed fraction.
 *   • Its name goes green-bright and its amount ink; the other's name goes faint
 *     and its amount muted. The amounts ROLL, so a saved expense is seen landing.
 *   • The other pill switches account — the whole screen rolls to it. The
 *     selected one scrolls back to the top, which is where its full card is.
 *
 * It rides on `FloatingBubble`, the shell Workout and Tasks share: same glass,
 * same trigger, same drop-in. Only the contents are this file's.
 */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { useT } from '../hooks/useT';
import { formatMoney, formatValue } from '../lib/money';
import { radius } from '../theme/tokens';
import { FloatingBubble } from './FloatingBubble';
import { Pressable } from './Pressable';
import { RollingNumber } from './RollingNumber';
import { SlidingThumb } from './SlidingThumb';

export interface BubbleAccount {
  id: string;
  name: string;
  glyph: string;
  balance: number;
}

export function BalanceBubble({
  visible,
  accounts,
  selectedId,
  currency,
  onSelect,
  onTop,
}: {
  visible: boolean;
  accounts: readonly BubbleAccount[];
  selectedId: string;
  currency: string;
  onSelect: (id: string) => void;
  onTop: () => void;
}) {
  const t = useT();
  /* Where each pill landed inside the capsule, so the thumb can be put on one. */
  const [layouts, setLayouts] = useState<Record<number, { x: number; width: number }>>({});
  const selectedIndex = Math.max(
    0,
    accounts.findIndex((account) => account.id === selectedId),
  );
  const offsets = accounts.map((_, index) => {
    const layout = layouts[index];
    /* `layout.x` is measured from the capsule's outer edge; an absolute child is
       placed from inside its 1 dp border, and `SlidingThumb` adds its own 5 dp
       inset back — so the two come off here. */
    return layout ? { x: layout.x - 6, width: layout.width } : { x: 0, width: 0 };
  });
  const measured = layouts[selectedIndex] != null;

  return (
    <FloatingBubble
      visible={visible}
      /* 140 ms, then 70 ms a pill after it. */
      delays={accounts.map((_, index) => 140 + index * 70)}
      contentStyle={{ gap: 4 }}
      onItemLayout={(index, layout) =>
        setLayouts((current) => {
          const was = current[index];
          if (was && was.x === layout.x && was.width === layout.width) return current;
          return { ...current, [index]: layout };
        })
      }
      underlay={
        measured ? (
          <SlidingThumb
            index={selectedIndex}
            count={accounts.length}
            trackWidth={1}
            inset={5}
            offsets={offsets}
            duration={460}
            bezier={[0.34, 1.3, 0.64, 1]}
            style={{
              borderRadius: radius.pill,
              backgroundColor: 'rgba(63,169,108,0.22)',
              borderWidth: 1,
              borderColor: 'rgba(63,169,108,0.38)',
              boxShadow: [
                { offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(63,169,108,0.3)' },
              ],
            }}
          />
        ) : null
      }
    >
      {accounts.map((account) => {
        const selected = account.id === selectedId;
        return (
          <Pressable
            key={account.id}
            onPress={() => (selected ? onTop() : onSelect(account.id))}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${account.name}, ${formatMoney(account.balance, currency)}`}
            accessibilityHint={selected ? t('Back to the top') : t('Switch to this subsection')}
            style={({ pressed }) => ({
              height: 40,
              paddingLeft: 10,
              paddingRight: 14,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: radius.pill,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            <Text allowFontScaling={false} style={{ fontSize: 15 }}>
              {account.glyph}
            </Text>
            <View style={{ marginLeft: 8 }}>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={{ fontSize: 9, lineHeight: 10, letterSpacing: 1 }}
                className={[
                  'font-semibold uppercase',
                  selected ? 'text-green-bright' : 'text-ink-faint',
                ].join(' ')}
              >
                {account.name}
              </Text>
              <RollingNumber
                value={formatValue(account.balance)}
                lineHeight={17}
                duration={800}
                containerStyle={{ marginTop: 2 }}
                style={{ fontSize: 15 }}
                className={['font-semibold', selected ? 'text-ink' : 'text-ink-muted'].join(' ')}
              />
            </View>
          </Pressable>
        );
      })}
    </FloatingBubble>
  );
}
