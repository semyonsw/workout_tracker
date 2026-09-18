/**
 * MoneyScreen — the balance, the window, and where it went.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ EXPENSES                                 ⟲   │
 *   │        ( 💵 Cash )( 💳 Online )( + )          │
 *   │                   CASH                       │
 *   │                9,020 AMD                     │  ← tap to set
 *   │          ‹  September 2026 ▾  ›              │
 *   │ ┌──────────────────┬───────────────────────┐ │
 *   │ │ EXPENSES         │ INCOMES               │ │
 *   │ │ 28,970 AMD       │ 36,200 AMD            │ │
 *   │ └──────────────────┴───────────────────────┘ │
 *   │ ┌───────────────┐ ┌────────────────────────┐ │
 *   │ │ 🚌 Transport  │ │ 🧊 Food                │ │
 *   │ │   10,300 AMD  │ │    9,360 AMD           │ │
 *   │ └───────────────┘ └────────────────────────┘ │
 *   │ ╭──────────── Add expense ───────────────╮   │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE SUBSECTION IS THE FIRST THING ON THE SCREEN ───────────────────────
 *
 * `Cash` and `Online` are two different piles of money and neither of them is
 * the sum. The chip row picks ONE, and everything under it — the balance, the
 * two totals, the grid — is that one's. Nothing on this screen adds them up,
 * because "how much do I have" is only answerable about a pocket or an account,
 * never about both at once.
 *
 * A LONG PRESS on a chip renames or archives it, which is the same
 * long-press-for-the-rare-thing the category tiles use.
 *
 * ── AND THE BALANCE IS A BUTTON ───────────────────────────────────────────
 *
 * Tapping it asks what the subsection actually holds and sets it (see
 * `components/BalanceSheet.tsx`). The money already in a pocket on the day the
 * app is installed is not an income, and the only other way to enter it would be
 * to invent one — a figure nobody earned, sitting in September's incomes and in
 * every chart drawn from them, forever.
 *
 * ── THE BALANCE DOES NOT MOVE WHEN THE WINDOW DOES ────────────────────────
 *
 * It is the one number the screen is about, so it is the biggest thing on it,
 * and it is ALL-TIME — "what do I have" is not a question about September. The
 * picker under it changes everything below, and nothing above. Putting a
 * windowed total in that slot is the single most tempting mistake here, and it
 * would make the largest figure on the screen the one that means least.
 *
 * ── THE TWO TILES ARE A SELECTOR, NOT A SUMMARY ───────────────────────────
 *
 * Tapping `Expenses` or `Incomes` changes which direction the grid below is
 * totalling. The selected one sits on `surface-alt` with its figure in
 * `green-bright`; the other is flat and muted. That is the whole of what colour
 * means here — THIS IS THE ONE YOU ARE READING. Neither direction is good or
 * bad, there is no red in this app, and an income is not a green number.
 *
 * ── A TILE IS THE FASTEST WAY TO RECORD SOMETHING ─────────────────────────
 *
 * TAP a category and the editor opens ON that category, in the direction the two
 * tiles are currently showing — so a taxi is Transport, a number, Save. It used
 * to open the category's own screen, which meant the common act (write this
 * down) went through the rare one (look at what I wrote down) and cost two more
 * taps and a category chip.
 *
 * LONG PRESS is where the rare one went: a sheet with `Edit category` on it, and
 * with the OTHER direction — because an income into a category whose tile is
 * showing expenses is the one thing a tap can no longer express. The same
 * long-press-for-the-other-thing that the rest of the app uses to reorder.
 *
 * ── THE CHARTS ARE A QUESTION A TOTAL CANNOT ANSWER, SO THEY LEFT ────────
 *
 * The window here says how much in September. Whether it is going UP is a series
 * rather than a filter, and it used to be stacked four scrolls under this screen
 * with a second range control that looked like the first one misbehaving. It is
 * behind the ⟲ in the corner now (`MoneyHistoryScreen`), the same glyph in the
 * same place as the training log's and the daily tasks'.
 *
 * ── A ZERO IS A FACT ──────────────────────────────────────────────────────
 *
 * A category with nothing in the window reads `0 AMD` (or whatever the currency
 * setting says) in `ink-faint` and keeps
 * its tile. Hiding it would make the grid rearrange itself every time the window
 * moved, and the empty categories are half the information: `Entertainment 0`
 * this month is a thing you want to see.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { BalanceSheet } from '../components/BalanceSheet';
import { CategoryEditorSheet } from '../components/CategoryEditorSheet';
import { BubblePressable } from '../components/bubbles';
import { Icon } from '../components/Icon';
import { SectionGlow } from '../components/SectionGlow';
import { SectionTopBar } from '../components/SectionTopBar';
import { Sheet } from '../components/Sheet';
import { pressedStyle } from '../components/motion';
import {
  DashedAdd,
  GlassCard,
  Kicker,
  PrimaryButton,
  Separator,
  TextButton,
} from '../components/primitives';
import { ProgressRing } from '../components/ProgressRing';
import { dayKey } from '../lib/days';
import { tap } from '../lib/feedback';
import { useLanguage, useT } from '../hooks/useT';
import {
  INTERVALS,
  intervalLabel,
  type Direction,
  type Interval,
  type MoneyAccount,
  type MoneyCategory,
  balanceOfAccount,
  byCategory,
  describeInterval,
  formatMoney,
  formatValue,
  historyDay,
  inAccount,
  shiftAnchor,
  totalsIn,
} from '../lib/money';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { glass, glowRepeating, palette } from '../theme/tokens';
import type { ID } from '../types/models';

interface MoneyScreenProps {
  /**
   * The window travels WITH the tap. The category screen is this screen's tile,
   * opened, and landing on a different window from the one you were reading is
   * the kind of small lie that makes a total untrustable.
   *
   * Reached by LONG PRESS now — see the header — because the tap belongs to the
   * thing you came here to do.
   */
  onOpenCategory: (categoryId: ID, accountId: ID, interval: Interval, anchor: string) => void;
  /**
   * The editor, opened on a category, a subsection and a direction it does not
   * have to be told twice.
   */
  onAddAmount: (categoryId: ID | null, accountId: ID, direction: Direction) => void;
  /**
   * The ⟲ in the corner: the lines, the balance and where it went.
   *
   * The ANCHOR travels with it, for the same reason the window travels with a
   * tap on a tile. Stepping back three days and then opening the history to be
   * shown today is the screen forgetting where you were standing — and the day
   * list over there is the one thing on it that answers a question about a
   * particular day rather than about a range.
   */
  onOpenHistory: (accountId: ID, anchor: string) => void;
}

export function MoneyScreen({ onOpenCategory, onAddAmount, onOpenHistory }: MoneyScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const accounts = useMoney((s) => s.accounts);
  const categories = useMoney((s) => s.categories);
  const amounts = useMoney((s) => s.amounts);
  const addCategory = useMoney((s) => s.addCategory);
  const addAccount = useMoney((s) => s.addAccount);
  const updateAccount = useMoney((s) => s.updateAccount);
  const archiveAccount = useMoney((s) => s.archiveAccount);
  const setAccountBalance = useMoney((s) => s.setAccountBalance);

  /*
   * The window and the direction START where the settings say and are then this
   * screen's own. Reading them live would mean a section that snapped back to the
   * month every time the settings screen was visited, which is not what a default
   * is.
   */
  const currency = useSettings((s) => s.currencyCode);
  const [interval, setInterval] = useState<Interval>(
    () => useSettings.getState().moneyDefaultInterval,
  );
  const [anchor, setAnchor] = useState(() => dayKey(new Date()));
  const [direction, setDirection] = useState<Direction>(
    () => useSettings.getState().moneyDefaultDirection,
  );
  const [picking, setPicking] = useState(false);
  const [naming, setNaming] = useState(false);
  /** The category a long press is asking about. Null = no sheet. */
  const [holding, setHolding] = useState<MoneyCategory | null>(null);
  /*
   * Which subsection is being read. An ID rather than the account itself, so a
   * rename or an archive elsewhere cannot leave this screen holding a stale copy.
   */
  const [accountId, setAccountId] = useState<ID | null>(null);
  const [addingAccount, setAddingAccount] = useState(false);
  /** The subsection a long press is asking about, and the one being renamed. */
  const [heldAccount, setHeldAccount] = useState<MoneyAccount | null>(null);
  const [renamingAccount, setRenamingAccount] = useState<MoneyAccount | null>(null);
  const [settingBalance, setSettingBalance] = useState(false);

  const liveAccounts = accounts.filter((account) => account.archivedAt === null);
  /*
   * The selected one, or the first — which covers both the first render and the
   * one after the selected subsection has been archived. The store guarantees at
   * least one live account, so this is never undefined in practice; the fallback
   * to `accounts[0]` is what makes that true for the type as well.
   */
  const account =
    liveAccounts.find((row) => row.id === accountId) ?? liveAccounts[0] ?? accounts[0];

  /* Every figure below reads THIS subsection's amounts and no others. */
  const mine = useMemo(() => inAccount(amounts, account.id), [amounts, account.id]);
  const balance = useMemo(() => balanceOfAccount(account, amounts), [account, amounts]);
  const totals = useMemo(() => totalsIn(mine, interval, anchor), [mine, interval, anchor]);
  const perCategory = useMemo(
    () => byCategory(mine, direction, interval, anchor),
    [mine, direction, interval, anchor],
  );
  const live = categories.filter((category) => category.archivedAt === null);
  /*
   * What each tile's ring is a fraction OF. The direction's own total for the
   * window — not the balance, and not both directions summed: a ring is only
   * readable if every ring on the screen is a share of the same thing.
   */
  const directionTotal = useMemo(
    () => Object.values(perCategory).reduce((sum, value) => sum + value, 0),
    [perCategory],
  );
  // `All time` has no next or previous window to step to.
  const steppable = interval !== 'all';

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <SectionGlow />

      <SectionTopBar
        title={t('Expenses')}
        /* `historyDay` rather than the anchor itself: a month's anchor is its
           1st, and nobody reading September on the 18th means "show me the
           1st". See `lib/money.ts`. */
        onOpenHistory={() =>
          onOpenHistory(account.id, historyDay(interval, anchor, dayKey(new Date())))
        }
        historyLabel={t('Expense history')}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* The subsections. WRAPPING and not a horizontal `ScrollView`: the tab
            bar's swipe (`components/SwipePager.tsx`) claims sideways drags on
            capture, so a scrolling chip row would change section under the thumb
            instead of scrolling. Chips that run out of room drop to a second
            line, which is also the only arrangement where every one of them is
            visible without a gesture. */}
        <View className="mx-lg flex-row flex-wrap items-center justify-center">
          {liveAccounts.map((row) => (
            <AccountChip
              key={row.id}
              account={row}
              selected={row.id === account.id}
              onPress={() => setAccountId(row.id)}
              onLongPress={() => {
                tap();
                setHeldAccount(row);
              }}
            />
          ))}
          <Pressable
            onPress={() => setAddingAccount(true)}
            accessibilityRole="button"
            accessibilityLabel={t('Add subsection')}
            style={pressedStyle}
            className="mb-sm h-hit flex-row items-center rounded-pill border border-dashed border-hairline px-md"
          >
            <Icon name="plus" size={16} color={palette.inkMuted} />
          </Pressable>
        </View>

        {/* The balance IS the editor — see the header. `button`, not text, and it
            says so out loud for a screen reader.

            It sits on its own lit panel now rather than loose on the page: it is
            the one number the screen is about, and the panel is what stops the
            window picker under it from reading as the same kind of fact. The
            currency is stated in the corner of that panel, as a label and not as
            a control — it is a setting, and it is changed where settings are. */}
        <GlassCard tone="green" radius="sheet" className="mx-lg mt-lg px-lg py-lg">
          <View className="flex-row items-center">
            <Kicker tone="green" className="flex-1">
              {`${account.name} · ${t('All time')}`}
            </Kicker>
            <Kicker tone="green">{currency}</Kicker>
          </View>
          <Pressable
            onPress={() => setSettingBalance(true)}
            accessibilityRole="button"
            accessibilityLabel={`${account.name}. ${formatMoney(balance, currency)}. ${t('Set what you have here.')}`}
            style={pressedStyle}
            className="mt-sm flex-row items-baseline"
          >
            <Text className="text-display font-semibold tabular-nums text-ink">
              {formatValue(balance)}
            </Text>
            <Text className="ml-sm text-title font-semibold text-ink-muted">{currency}</Text>
          </Pressable>
          <Text className="mt-xs text-label text-ink-faint">
            {t('Tap to set what you actually have here')}
          </Text>
        </GlassCard>

        <View className="mx-lg mt-lg flex-row items-center justify-center">
          <Pressable
            onPress={() => setAnchor(shiftAnchor(interval, anchor, -1))}
            disabled={!steppable}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('The window before')}
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            {steppable ? <Icon name="chevron-left" size={20} color={palette.inkMuted} /> : null}
          </Pressable>

          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`${describeInterval(interval, anchor, lang)}. ${t('Change the time interval.')}`}
            style={pressedStyle}
            className="h-hit flex-row items-center px-md"
          >
            <Text className="mr-xs text-body font-medium tabular-nums text-ink">
              {describeInterval(interval, anchor, lang)}
            </Text>
            <Icon name="chevron-down" size={14} color={palette.inkMuted} />
          </Pressable>

          <Pressable
            onPress={() => setAnchor(shiftAnchor(interval, anchor, 1))}
            disabled={!steppable}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('The window after')}
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            {steppable ? <Icon name="chevron-right" size={20} color={palette.inkMuted} /> : null}
          </Pressable>
        </View>

        {/* Two tiles with air between them rather than one card split by a
            hairline: the selected one is a lit surface, and a lit half of a
            shared box reads as a highlight rather than as a choice. */}
        <View className="mx-lg mt-md flex-row gap-sm">
          <DirectionTile
            label={t('Expenses')}
            value={totals.expenses}
            currency={currency}
            selected={direction === 'expense'}
            onPress={() => setDirection('expense')}
          />
          <DirectionTile
            label={t('Incomes')}
            value={totals.incomes}
            currency={currency}
            selected={direction === 'income'}
            onPress={() => setDirection('income')}
          />
        </View>

        <View className="mx-lg mt-xl flex-row flex-wrap">
          {live.map((category) => (
            <View key={category.id} className="w-1/2 p-[5px]">
              <CategoryTile
                category={category}
                total={perCategory[category.id] ?? 0}
                share={directionTotal > 0 ? (perCategory[category.id] ?? 0) / directionTotal : 0}
                currency={currency}
                onPress={() => onAddAmount(category.id, account.id, direction)}
                onLongPress={() => {
                  tap();
                  setHolding(category);
                }}
              />
            </View>
          ))}
          <View className="w-1/2 p-[5px]">
            <DashedAdd
              label={t('Add category')}
              height={150}
              radius="card"
              onPress={() => setNaming(true)}
            />
          </View>
        </View>

        <View className="mx-lg mt-xl">
          <PrimaryButton
            label={direction === 'expense' ? t('Add expense') : t('Add income')}
            onPress={() => onAddAmount(null, account.id, direction)}
          />
        </View>
      </ScrollView>

      {picking ? (
        <Sheet title={t('Time interval')} onDismiss={() => setPicking(false)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            {INTERVALS.map((option, index) => (
              <View key={option}>
                {index > 0 ? <Separator inset={16} /> : null}
                <IntervalRow
                  label={intervalLabel(option, lang)}
                  detail={describeInterval(option, anchor, lang)}
                  selected={option === interval}
                  onPress={() => {
                    setInterval(option);
                    setPicking(false);
                  }}
                />
              </View>
            ))}
          </View>
          <TextButton label={t('Cancel')} onPress={() => setPicking(false)} />
        </Sheet>
      ) : null}

      {settingBalance ? (
        <BalanceSheet
          title={`${account.glyph}  ${account.name}`}
          balance={balance}
          currency={currency}
          onSave={(next) => {
            setAccountBalance(account.id, next);
            setSettingBalance(false);
          }}
          onDismiss={() => setSettingBalance(false)}
        />
      ) : null}

      {addingAccount ? (
        <CategoryEditorSheet
          title={t('Add subsection')}
          onSave={(name, glyph) => {
            const id = addAccount(name, glyph);
            // Land on what you just made — otherwise the only sign it worked is
            // one more chip in a row of them.
            if (id) setAccountId(id);
            setAddingAccount(false);
          }}
          onDismiss={() => setAddingAccount(false)}
        />
      ) : null}

      {renamingAccount ? (
        <CategoryEditorSheet
          title={t('Edit subsection')}
          name={renamingAccount.name}
          glyph={renamingAccount.glyph}
          onSave={(name, glyph) => {
            updateAccount(renamingAccount.id, { name, glyph });
            setRenamingAccount(null);
          }}
          onDismiss={() => setRenamingAccount(null)}
        />
      ) : null}

      {/* The long press on a subsection. `Archive` only exists while there is
          another one to fall back to: every amount names an account, so the last
          live one has nowhere to hand its money to. */}
      {heldAccount ? (
        <Sheet
          title={`${heldAccount.glyph}  ${heldAccount.name}`}
          onDismiss={() => setHeldAccount(null)}
        >
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            <SheetRow
              label={t('Edit subsection')}
              detail={t('Its name and its glyph')}
              onPress={() => {
                const held = heldAccount;
                setHeldAccount(null);
                setRenamingAccount(held);
              }}
            />
            {liveAccounts.length > 1 ? (
              <>
                <Separator inset={16} />
                <SheetRow
                  label={t('Archive this subsection')}
                  detail={t('It leaves the row. Everything recorded in it stays recorded.')}
                  onPress={() => {
                    const held = heldAccount;
                    setHeldAccount(null);
                    archiveAccount(held.id);
                    if (held.id === accountId) setAccountId(null);
                  }}
                />
              </>
            ) : null}
          </View>
          <TextButton label={t('Cancel')} onPress={() => setHeldAccount(null)} />
        </Sheet>
      ) : null}

      {naming ? (
        <CategoryEditorSheet
          title={t('Add category')}
          onSave={(name, glyph) => {
            addCategory(name, glyph);
            setNaming(false);
          }}
          onDismiss={() => setNaming(false)}
        />
      ) : null}

      {/* The long press. Two rows: the category's own screen — where the name,
          the glyph, its amounts and `Archive` all live — and the direction a tap
          can no longer reach. */}
      {holding ? (
        <Sheet title={`${holding.glyph}  ${holding.name}`} onDismiss={() => setHolding(null)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            <SheetRow
              label={t('Edit category')}
              detail={t('Its name, its glyph and everything recorded in it')}
              onPress={() => {
                const category = holding;
                setHolding(null);
                onOpenCategory(category.id, account.id, interval, anchor);
              }}
            />
            <Separator inset={16} />
            <SheetRow
              label={direction === 'expense' ? t('Add an income here') : t('Add an expense here')}
              detail={
                direction === 'expense'
                  ? t('A tap on the tile adds an expense')
                  : t('A tap on the tile adds an income')
              }
              onPress={() => {
                const category = holding;
                setHolding(null);
                onAddAmount(
                  category.id,
                  account.id,
                  direction === 'expense' ? 'income' : 'expense',
                );
              }}
            />
          </View>
          <TextButton label={t('Cancel')} onPress={() => setHolding(null)} />
        </Sheet>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function DirectionTile({
  label,
  value,
  currency,
  selected,
  onPress,
}: {
  label: string;
  value: number;
  /** Passed down rather than read here: the lib formats, the screen decides. */
  currency: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <BubblePressable
      onPress={onPress}
      radius={14}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} ${formatMoney(value, currency)}`}
      style={(state) => [
        pressedStyle(state),
        {
          backgroundColor: selected ? glass.green : glass.sunken,
          borderColor: selected ? glass.greenEdge : palette.hairline,
        },
      ]}
      className="flex-1 rounded-surface border p-lg"
    >
      <Text
        className={[
          'text-micro font-semibold uppercase',
          selected ? 'text-ink' : 'text-ink-muted',
        ].join(' ')}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className={[
          'mt-xs text-title tabular-nums',
          selected ? 'font-semibold text-green-bright' : 'font-medium text-ink-muted',
        ].join(' ')}
      >
        {formatMoney(value, currency)}
      </Text>
    </BubblePressable>
  );
}

/**
 * One subsection, as a pill. Glyph and name; the balance is the big figure above.
 *
 * Selected is the same `green` fill the segmented controls use — this is a choice
 * that changes what the rest of the screen contains, so it has to be readable
 * without a tap.
 */
function AccountChip({
  account,
  selected,
  onPress,
  onLongPress,
}: {
  account: MoneyAccount;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useT();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={account.name}
      accessibilityHint={t('Long press to edit the subsection')}
      style={(state) => [
        pressedStyle(state),
        selected
          ? {
              // The chip that is selected decides what every figure under it
              // means, so it is the one lit control on the screen. `boxShadow`
              // and not `elevation` — see `theme/tokens.ts`.
              boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: glowRepeating }],
            }
          : { backgroundColor: glass.sunken },
      ]}
      className={[
        'mb-sm mr-sm h-hit flex-row items-center rounded-pill px-lg',
        selected ? 'border border-green-bright/50 bg-green' : 'border border-hairline',
      ].join(' ')}
    >
      <Text className="mr-sm text-label">{account.glyph}</Text>
      <Text
        className={[
          'text-label',
          selected ? 'font-semibold text-ink' : 'font-medium text-ink-muted',
        ].join(' ')}
      >
        {account.name}
      </Text>
    </Pressable>
  );
}

/**
 * One category, as a tile with its share drawn round its glyph.
 *
 * The ring is what the row shape could never say: `10,300 AMD` is a number you
 * have to compare with five other numbers to place, and a third of a ring is a
 * third of the window at a glance. The figure stays, because "a third" is not
 * what you tell somebody when they ask what you spent on transport.
 *
 * A zero keeps its tile and reads as an empty ring — see the header. Hiding it
 * would rearrange the grid every time the window moved, and `Fun 0` this month is
 * half the information on the screen.
 */
function CategoryTile({
  category,
  total,
  share,
  currency,
  onPress,
  onLongPress,
}: {
  category: MoneyCategory;
  total: number;
  /** 0–1 of the direction's total for the window. */
  share: number;
  currency: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useT();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${formatMoney(total, currency)}`}
      accessibilityHint={t('Long press to edit the category')}
      style={(state) => [
        pressedStyle(state),
        {
          backgroundColor: glass.raised,
          borderColor: total > 0 ? glass.greenEdge : palette.hairline,
        },
      ]}
      className="h-[150px] items-center justify-center rounded-card border px-md"
    >
      <ProgressRing fraction={share} size={56} stroke={3}>
        <Text className="text-[22px]">{category.glyph}</Text>
      </ProgressRing>
      <Text numberOfLines={1} className="mt-md w-full text-center text-label font-medium text-ink">
        {category.name}
      </Text>
      <Text
        numberOfLines={1}
        className={[
          'mt-[2px] w-full text-center text-label font-medium tabular-nums',
          total > 0 ? 'text-green-bright' : 'text-ink-faint',
        ].join(' ')}
      >
        {formatMoney(total, currency)}
      </Text>
      <Kicker className="mt-[2px]">{total > 0 ? `${Math.round(share * 100)}%` : '—'}</Kicker>
    </Pressable>
  );
}

/**
 * A row on the long-press sheet: a label, why you would tap it, and nothing else.
 *
 * `IntervalRow` below is the same geometry carrying a CHOICE — it renders a ✓ and
 * lives in a radio group. This one is a door, so it has neither.
 */
function SheetRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={pressedStyle}
      className="h-row-lg flex-row items-center px-lg"
    >
      <View className="flex-1 pr-md">
        <Text className="text-body text-ink">{label}</Text>
        <Text numberOfLines={1} className="mt-[2px] text-label text-ink-faint">
          {detail}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={palette.inkFaint} />
    </Pressable>
  );
}

/**
 * One category's share of the range, as a figure and a bar.
 *
 * Not a chart: eight lines on one plot is eight lines and no answer. What the
 * grid above cannot say is WHICH category is the reason the line moved, and a
 * sorted five with a bar apiece says exactly that.
 */
function IntervalRow({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${detail}`}
      style={pressedStyle}
      className="h-row-lg flex-row items-center px-lg"
    >
      <View className="flex-1">
        <Text
          className={['text-body', selected ? 'font-semibold text-green-bright' : 'text-ink'].join(
            ' ',
          )}
        >
          {label}
        </Text>
        <Text className="text-label tabular-nums text-ink-faint">{detail}</Text>
      </View>
      {selected ? <Icon name="check" size={16} color={palette.greenBright} /> : null}
    </Pressable>
  );
}
