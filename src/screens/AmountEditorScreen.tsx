/**
 * AmountEditorScreen — one amount, typed on a keypad this screen owns.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  NEW EXPENSE                               │  ← no Save in this bar
 *   │ AMOUNT · AMD                                 │
 *   │ 2,400 AMD                                    │  ← 60 dp, glowing once typed
 *   │ (🧊 Food ▾) (💵 Cash ▾) (Expense|Income)     │
 *   │ (‹ Today, 18 Sep ›) (Day|Month) (＋ Note)     │
 *   │                            ╭ ✓ Save ╮         │  ← floats over the keypad
 *   │ ┌──────┐┌──────┐┌──────┐                     │
 *   │ │  1   ││  2   ││  3   │                     │
 *   │ └──────┘└──────┘└──────┘                     │
 *   │   4       5       6                          │
 *   │   7       8       9                          │
 *   │  000      0       ⌫                          │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE KEYPAD IS A GRID OF VIEWS, NOT A `TextInput` ──────────────────────
 *
 * The whole ergonomic argument depends on owning the bottom 290 dp. With the
 * system keyboard the app cannot: it decides its own height, it covers whatever
 * it likes, it puts a `Done` key where `Save` should be, and it changes all
 * three between phones. A grid of twelve `Pressable`s is the same twelve digits
 * at a size this app chose, in a place `Save` can be anchored against.
 *
 * It also removes the last reason the amount had to be small. `2,400` is the
 * thing you came here to type and it is now the one hero on the screen at 60 dp,
 * faint at zero and lit the moment a digit exists.
 *
 * ── FOUR LABELLED SECTIONS BECAME A ROW OF CHIPS ──────────────────────────
 *
 * `Direction`, `Subsection`, `Category`, `When` were four kickers, four
 * controls and roughly 400 dp of scroll — on a screen whose fastest path is a
 * number and `Save`, because every one of those four arrives already correct:
 * you tapped a category tile in a direction the grid was already showing, in the
 * subsection you were already reading, today. So they are chips. Each one STATES
 * its answer, and correcting one is a tap; the category's chip is the `lit` one
 * because it is the only one of the six that changes what the amount is ABOUT.
 *
 * ── AND SAVE LEFT THE CORNER ──────────────────────────────────────────────
 *
 * It was a pill in the header, which is the single worst place for the one
 * action on a screen whose other twelve targets are all in the bottom third. It
 * floats above the keypad's top-right corner now — `right: 16`, the same
 * geometry as every other section's commit action.
 *
 * It is PRESENT while the amount is empty, at 55% as ghost glass, rather than
 * hidden. A button that materialises under a thumb already on its way is a
 * button that gets pressed by accident; this one wakes instead, over 260 ms,
 * when the first digit lands.
 *
 * ── DELETE IS A SENTENCE, NOT A RED BUTTON ────────────────────────────────
 *
 * `ink-muted` text in a dashed box under the chips — placement rule 5, the same
 * treatment Settings gives its reset. No red: this app has one hue. It only
 * exists when there is something to delete; a new amount has no row to remove.
 *
 * ── `A DAY` OR `WHOLE MONTH` ──────────────────────────────────────────────
 *
 * The one switch here people do not expect, so it keeps its explanation: a whole
 * month counts towards the month, the year and the balance, and towards no
 * single day. Rent is not spent on the 3rd, and filing it there makes the 3rd a
 * lie every time you open it. See `lib/money.ts`.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { BubblePressable } from '../components/bubbles';
import { FloatingAction, Lamps, SpecularEdge } from '../components/glass';
import { pressedStyle } from '../components/motion';
import { Separator, TextButton } from '../components/primitives';
import { dayKey, formatLongDay, formatMonth, parseDay, shiftDay } from '../lib/days';
import { tap } from '../lib/feedback';
import {
  type Amount,
  type AmountWhen,
  type Direction,
  type MoneyAccount,
  type MoneyCategory,
  formatValue,
} from '../lib/money';
import { useMoney } from '../state/moneyStore';
import { useLanguage, useT } from '../hooks/useT';
import { useSettings } from '../state/settingsStore';
import { focalType, palette, radius } from '../theme/tokens';
import type { ID } from '../types/models';

/** The twelve keys, in reading order. `back` is the ⌫. */
const KEYS: readonly (string | 'back')[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '000',
  '0',
  'back',
];

/**
 * How many digits an amount may hold.
 *
 * Twelve, which is a trillion in any currency this app is likely to count in,
 * and the point of the cap is not the ceiling — it is that `000` exists. Three
 * taps on it is nine zeroes, and without a limit a pocketed phone can produce a
 * number that overflows the field and then the `Number` behind it.
 */
const MAX_DIGITS = 12;

interface AmountEditorScreenProps {
  /** The amount being edited, or null for a new one. */
  amount: Amount | null;
  /** Which category a new amount lands in. Ignored when editing. */
  categoryId: ID | null;
  /** Which subsection a new amount lands in. Ignored when editing. */
  accountId: ID | null;
  /**
   * Which way a NEW amount points, decided by whatever opened this screen.
   *
   * The money grid is already showing expenses or incomes when a tile is tapped,
   * and arriving on the other one would mean the first field a user corrects is
   * the one they had just told the app. Ignored when editing: an amount already
   * knows its own direction, and the chip is right there.
   */
  direction?: Direction;
  /**
   * Leave.
   *
   * `saved` is true only on the path through the floating `Save`, and the shell
   * uses it to raise the toast over the section this screen returns to. It is an
   * argument rather than a second callback because every other way out of here —
   * the chevron, hardware back, deleting the amount — means exactly the same
   * thing, and a `onSaved` beside an `onBack` is two doors where there is one.
   */
  onBack: (saved?: boolean) => void;
}

export function AmountEditorScreen({
  amount,
  categoryId,
  accountId,
  direction: initialDirection = 'expense',
  onBack,
}: AmountEditorScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const accounts = useMoney((s) => s.accounts);
  const categories = useMoney((s) => s.categories);
  const currency = useSettings((s) => s.currencyCode);
  const addAmount = useMoney((s) => s.addAmount);
  const updateAmount = useMoney((s) => s.updateAmount);
  const deleteAmount = useMoney((s) => s.deleteAmount);

  const live = categories.filter(
    (category) => category.archivedAt === null || category.id === amount?.categoryId,
  );
  /* An archived subsection stays selectable while an amount still sits in it —
     otherwise editing that amount would silently move it somewhere else. */
  const liveAccounts = accounts.filter(
    (account) => account.archivedAt === null || account.id === amount?.accountId,
  );

  const today = dayKey(new Date());
  const [digits, setDigits] = useState(amount ? String(amount.value) : '');
  const [direction, setDirection] = useState<Direction>(amount?.direction ?? initialDirection);
  const [category, setCategory] = useState<ID | null>(
    amount?.categoryId ?? categoryId ?? live[0]?.id ?? null,
  );
  const [account, setAccount] = useState<ID | null>(
    amount?.accountId ?? accountId ?? liveAccounts[0]?.id ?? null,
  );
  const [span, setSpan] = useState<'day' | 'month'>(amount?.when.kind ?? 'day');
  const [day, setDay] = useState(amount?.when.kind === 'day' ? amount.when.date : today);
  const [monthAnchor, setMonthAnchor] = useState(() =>
    amount?.when.kind === 'month'
      ? dayKey(new Date(amount.when.year, amount.when.month, 1))
      : today,
  );
  const [note, setNote] = useState(amount?.note ?? '');
  const [deleting, setDeleting] = useState(false);
  /** Which picker is open. Closed is the normal state of all three. */
  const [picking, setPicking] = useState<'category' | 'account' | 'note' | null>(null);
  /** Said out loud when `Save` is pressed with nothing typed. */
  const [complaint, setComplaint] = useState(false);

  const chosen = live.find((option) => option.id === category) ?? null;
  const chosenAccount = liveAccounts.find((option) => option.id === account) ?? null;

  const value = Number(digits) || 0;
  const savable = value > 0 && category !== null && account !== null;
  const noun = direction === 'expense' ? t('expense') : t('income');

  const whenOf = (): AmountWhen => {
    if (span === 'day') return { kind: 'day', date: day };
    const at = parseDay(monthAnchor) ?? new Date();
    return { kind: 'month', year: at.getFullYear(), month: at.getMonth() };
  };

  const press = (key: string | 'back') => {
    tap();
    setComplaint(false);
    setDigits((current) => {
      if (key === 'back') return current.slice(0, -1);
      // A leading zero is never a digit anybody meant: `0` then `5` is five.
      const next = (current === '0' ? '' : current) + key;
      return next.replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS);
    });
  };

  const save = () => {
    if (!savable || category === null || account === null) {
      setComplaint(true);
      return;
    }
    const draft = {
      categoryId: category,
      accountId: account,
      direction,
      value,
      when: whenOf(),
      note,
    };
    if (amount) updateAmount(amount.id, draft);
    else addAmount(draft);
    onBack(true);
  };

  const stepWhen = (delta: number) => {
    if (span === 'day') {
      setDay(shiftDay(day, delta));
      return;
    }
    const at = parseDay(monthAnchor) ?? new Date();
    // Day 1 first, so stepping off the 31st does not skip February.
    setMonthAnchor(dayKey(new Date(at.getFullYear(), at.getMonth() + delta, 1)));
  };
  const whenLabel = (() => {
    if (span === 'day') {
      return day === today
        ? `${t('Today')}, ${formatLongDay(day, lang)}`
        : formatLongDay(day, lang);
    }
    const at = parseDay(monthAnchor) ?? new Date();
    return formatMonth(at.getFullYear(), at.getMonth(), lang);
  })();

  /* The keypad's own height, so `Save` can be anchored to its top-right corner
     rather than to the bottom of the screen: four rows of 58 plus their 5 of
     margin apiece, plus the block's own 10 of padding. The gesture strip is NOT
     in here — `FloatingAction` adds it, the same way it does in every section. */
  const keypadHeight = 4 * (58 + 10) + 10;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Lamps section="Expenses" />

      {/* 56 tall, a chevron and a kicker. NO COMMIT ACTION — see the header. */}
      <View style={{ paddingTop: insets.top }} className="px-md">
        <View className="h-[56px] flex-row items-center">
          <Pressable
            /* Wrapped, not passed: `onBack` takes a `saved` flag and
               `Pressable` would hand it a gesture event, which is truthy. */
            onPress={() => onBack()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('Back')}
            style={pressedStyle}
            className="h-hit w-[40px] justify-center"
          >
            <Icon name="chevron-left" size={22} color={palette.inkMuted} />
          </Pressable>
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={{ letterSpacing: 1.3 }}
            className="flex-1 text-micro font-semibold uppercase text-ink-muted"
          >
            {amount ? t('Edit {noun}', { noun }) : t('New {noun}', { noun })}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* THE ONE HERO. Faint at zero, ink with the app's hero glow the moment
            there is something to read. */}
        <View className="px-[20px] pt-[26px]">
          <Text
            allowFontScaling={false}
            style={{ fontSize: 11, letterSpacing: 1.3 }}
            className="font-semibold uppercase text-ink-faint"
          >
            {`${t('Amount')} · ${currency}`}
          </Text>
          <View className="mt-xs flex-row items-baseline">
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              accessibilityLabel={t('Amount in {currency}', { currency })}
              style={[
                focalType.amount,
                digits === ''
                  ? undefined
                  : { textShadowColor: 'rgba(63,169,108,0.22)', textShadowRadius: 30 },
              ]}
              className={[
                'font-semibold tabular-nums',
                digits === '' ? 'text-ink-faint' : 'text-ink',
              ].join(' ')}
            >
              {formatValue(value)}
            </Text>
            <Text
              allowFontScaling={false}
              style={{ fontSize: 22 }}
              className="ml-sm font-semibold text-ink-muted"
            >
              {currency}
            </Text>
          </View>
          {complaint ? (
            <Text className="mt-xs text-label font-medium text-green-bright">
              {t('Type an amount first')}
            </Text>
          ) : null}
        </View>

        {/* THE ANSWERED FIELDS, as one wrapping row. Four kickers and 400 dp of
            scroll used to be here. */}
        <View className="mt-lg flex-row flex-wrap px-lg">
          <Chip
            label={chosen ? `${chosen.glyph}  ${chosen.name}` : t('Pick a category')}
            tone="lit"
            chevron
            onPress={() => {
              tap();
              setPicking('category');
            }}
            accessibilityLabel={
              chosen
                ? t('Category: {name}. Change it.', { name: chosen.name })
                : t('Pick a category')
            }
          />
          <Chip
            label={chosenAccount ? `${chosenAccount.glyph}  ${chosenAccount.name}` : '—'}
            chevron
            onPress={() => {
              tap();
              setPicking('account');
            }}
            accessibilityLabel={t('Subsection')}
          />
          <MiniSegmented
            options={[
              { value: 'expense' as const, label: t('Expense') },
              { value: 'income' as const, label: t('Income') },
            ]}
            value={direction}
            onChange={setDirection}
            accessibilityLabel={t('Money out, or money in')}
          />
          <StepperChip
            label={whenLabel}
            onEarlier={() => stepWhen(-1)}
            onLater={() => stepWhen(1)}
          />
          <MiniSegmented
            options={[
              { value: 'day' as const, label: t('A day') },
              { value: 'month' as const, label: t('Whole month') },
            ]}
            value={span}
            onChange={setSpan}
            accessibilityLabel={t('A single day, or a whole month')}
          />
          <Chip
            label={note.trim() === '' ? t('Note') : note.trim()}
            onPress={() => {
              tap();
              setPicking('note');
            }}
            accessibilityLabel={t('Note')}
          />
        </View>

        {span === 'month' ? (
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            {t(
              'A whole month counts towards the month, the year and the balance, and towards no single day.',
            )}
          </Text>
        ) : null}

        {/* Placement rule 5: out of reach, plain, dashed, no red. */}
        {amount ? (
          <BubblePressable
            onPress={() => setDeleting(true)}
            radius={16}
            accessibilityRole="button"
            accessibilityLabel={t('Delete this amount')}
            style={(state) => [
              pressedStyle(state),
              {
                marginTop: 22,
                marginHorizontal: 16,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: 'rgba(138,150,143,0.22)',
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={{ fontSize: 13 }}
              className="font-medium text-ink-muted"
            >
              {t('Delete this amount')}
            </Text>
          </BubblePressable>
        ) : null}
      </ScrollView>

      {/* THE KEYPAD. Twelve keys the app owns, at a size the app chose. */}
      <View style={{ paddingHorizontal: 10, paddingBottom: 10 + insets.bottom }}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} className="flex-row">
            {KEYS.slice(row * 3, row * 3 + 3).map((key) => (
              <Key key={key} value={key} onPress={() => press(key)} />
            ))}
          </View>
        ))}
      </View>

      {/* Anchored to the keypad's top-right corner — the same `right: 16` every
          other section's commit action uses, raised by the block it sits over. */}
      <FloatingAction
        label={t('Save')}
        icon="check"
        asleep={!savable}
        bottom={keypadHeight + 12}
        onPress={save}
      />

      {picking === 'category' ? (
        <Sheet title={t('Category')} onDismiss={() => setPicking(null)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            {live.map((option, index) => (
              <View key={option.id}>
                {index > 0 ? <Separator inset={16} /> : null}
                <PickRow
                  glyph={option.glyph}
                  name={option.name}
                  selected={option.id === category}
                  onPress={() => {
                    tap();
                    setCategory(option.id);
                    setPicking(null);
                  }}
                />
              </View>
            ))}
          </View>
          <TextButton label={t('Cancel')} onPress={() => setPicking(null)} />
        </Sheet>
      ) : null}

      {picking === 'account' ? (
        <Sheet title={t('Subsection')} onDismiss={() => setPicking(null)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            {liveAccounts.map((option, index) => (
              <View key={option.id}>
                {index > 0 ? <Separator inset={16} /> : null}
                <PickRow
                  glyph={option.glyph}
                  name={option.name}
                  selected={option.id === account}
                  onPress={() => {
                    tap();
                    setAccount(option.id);
                    setPicking(null);
                  }}
                />
              </View>
            ))}
          </View>
          <TextButton label={t('Cancel')} onPress={() => setPicking(null)} />
        </Sheet>
      ) : null}

      {picking === 'note' ? (
        <Sheet title={t('Note')} onDismiss={() => setPicking(null)}>
          <View className="h-row flex-row items-center rounded-surface border border-hairline bg-surface-alt px-lg">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('What it was for')}
              placeholderTextColor={palette.inkFaint}
              cursorColor={palette.greenBright}
              selectionColor={palette.greenBright}
              accessibilityLabel={t('Note')}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => setPicking(null)}
              className="flex-1 text-body text-ink"
            />
          </View>
          <TextButton label={t('Done')} tone="green" onPress={() => setPicking(null)} />
        </Sheet>
      ) : null}

      {deleting && amount ? (
        <ConfirmSheet
          title={t('Delete this amount?')}
          body={t(
            'It leaves the category, the month, the year and the balance. Nothing else changes.',
          )}
          confirmLabel={t('Delete it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            deleteAmount(amount.id);
            setDeleting(false);
            onBack();
          }}
          onCancel={() => setDeleting(false)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One key. 58 tall, `card` glass, and its own shadow — twelve panes sitting on
 * the page rather than twelve holes cut in it.
 *
 * `flat`: twelve `BlurView`s in one grid is four times the budget this app gives
 * a whole screen, and a key is 58 dp of solid tint with a digit on it — there is
 * nothing behind it to see through. The tint and the specular edge are what make
 * it read as glass; the blur would only cost frames.
 */
function Key({ value, onPress }: { value: string | 'back'; onPress: () => void }) {
  const t = useT();
  const back = value === 'back';
  return (
    <BubblePressable
      onPress={onPress}
      radius={radius.row}
      accessibilityRole="button"
      accessibilityLabel={back ? t('Delete the last digit') : value}
      style={(state) => [
        pressedStyle(state),
        {
          flex: 1,
          margin: 5,
          height: 58,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.row,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(236,241,238,0.06)',
          backgroundColor: back ? 'rgba(236,241,238,0.028)' : 'rgba(236,241,238,0.055)',
          boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(0,0,0,0.35)' }],
        },
      ]}
    >
      <SpecularEdge color="rgba(236,241,238,0.1)" radius={radius.row} />
      {back ? (
        <Icon name="backspace" size={22} color={palette.inkMuted} />
      ) : (
        <Text
          allowFontScaling={false}
          style={{ fontSize: value === '000' ? 17 : 24 }}
          className={[
            'tabular-nums text-ink',
            value === '000' ? 'font-semibold' : 'font-medium',
          ].join(' ')}
        >
          {value}
        </Text>
      )}
    </BubblePressable>
  );
}

/** One answered field, stated. `lit` for the one that says what this amount IS. */
function Chip({
  label,
  tone = 'plain',
  chevron = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  tone?: 'plain' | 'lit';
  chevron?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const lit = tone === 'lit';
  return (
    <BubblePressable
      onPress={onPress}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={(state) => [
        pressedStyle(state),
        {
          height: 38,
          marginRight: 8,
          marginBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          overflow: 'hidden',
          borderWidth: 1,
          backgroundColor: lit ? 'rgba(63,169,108,0.14)' : 'rgba(236,241,238,0.045)',
          borderColor: lit ? 'rgba(63,169,108,0.30)' : 'rgba(236,241,238,0.065)',
        },
      ]}
    >
      {lit ? <SpecularEdge color="rgba(236,241,238,0.12)" radius={radius.pill} /> : null}
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={{ fontSize: 13, maxWidth: 190 }}
        className={lit ? 'font-medium text-green-bright' : 'font-medium text-ink-muted'}
      >
        {label}
      </Text>
      {chevron ? (
        <View className="ml-sm">
          <Icon
            name="chevron-down"
            size={12}
            color={lit ? palette.greenBright : palette.inkFaint}
          />
        </View>
      ) : null}
    </BubblePressable>
  );
}

/**
 * A chip with a ‹ and a › built into it.
 *
 * The date is the one answered field whose correction is almost always "one
 * step back" — you are writing down yesterday's taxi — so a sheet listing days
 * would be three taps for the common case. The chevrons are 38 tall inside the
 * chip and have their own hit slop, which keeps all three targets legal.
 */
function StepperChip({
  label,
  onEarlier,
  onLater,
}: {
  label: string;
  onEarlier: () => void;
  onLater: () => void;
}) {
  const t = useT();
  return (
    <View
      style={{
        height: 38,
        marginRight: 8,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: 'rgba(236,241,238,0.045)',
        borderColor: 'rgba(236,241,238,0.065)',
      }}
    >
      <Pressable
        onPress={onEarlier}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('Earlier')}
        style={pressedStyle}
        className="h-[30px] w-[28px] items-center justify-center"
      >
        <Icon name="chevron-left" size={14} color={palette.inkMuted} />
      </Pressable>
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={{ fontSize: 13, maxWidth: 170 }}
        className="font-medium tabular-nums text-ink-muted"
      >
        {label}
      </Text>
      <Pressable
        onPress={onLater}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('Later')}
        style={pressedStyle}
        className="h-[30px] w-[28px] items-center justify-center"
      >
        <Icon name="chevron-right" size={14} color={palette.inkMuted} />
      </Pressable>
    </View>
  );
}

/**
 * Two halves in a 38-high pill — a `Segmented` at chip scale.
 *
 * It is not `primitives.Segmented` because that one is 44 high, full width and
 * has its own track: it is a control that owns a row. These sit in a wrapping
 * row of chips and have to be the same height as the things beside them, which
 * is the entire difference.
 */
function MiniSegmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        height: 38,
        marginRight: 8,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: 'rgba(236,241,238,0.045)',
        borderColor: 'rgba(236,241,238,0.065)',
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <BubblePressable
            key={option.value}
            onPress={() => {
              tap();
              onChange(option.value);
            }}
            radius="pill"
            bubbleColor={selected ? palette.ink : palette.greenBright}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={(state) => [
              pressedStyle(state),
              {
                height: 30,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.pill,
                overflow: 'hidden',
                backgroundColor: selected ? palette.green : 'transparent',
              },
            ]}
          >
            {selected ? <SpecularEdge color="rgba(236,241,238,0.2)" radius={radius.pill} /> : null}
            <Text
              numberOfLines={1}
              allowFontScaling={false}
              style={{ fontSize: 12 }}
              className={selected ? 'font-semibold text-ink' : 'font-medium text-ink-faint'}
            >
              {option.label}
            </Text>
          </BubblePressable>
        );
      })}
    </View>
  );
}

/**
 * One row in a picker sheet: the glyph, the name, and a ✓ on the one in force.
 *
 * `h-row-lg` and a tick rather than a filled pill, because this is a LIST being
 * chosen from rather than a row of switches — the same shape the interval picker
 * on the money screen uses, so the two sheets are recognisably one object.
 */
function PickRow({
  glyph,
  name,
  selected,
  onPress,
}: {
  glyph: string;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      style={pressedStyle}
      className="h-row-lg flex-row items-center px-lg"
    >
      <Text className="mr-md text-title">{glyph}</Text>
      <Text
        numberOfLines={1}
        className={`flex-1 text-body ${selected ? 'font-semibold text-ink' : 'text-ink-muted'}`}
      >
        {name}
      </Text>
      {selected ? <Icon name="check" size={18} color={palette.greenBright} /> : null}
    </Pressable>
  );
}

/* Kept for the type the store hands back, so a caller that passes a stale
   account or category still type-checks against the same shapes this screen
   reads. */
export type { MoneyAccount, MoneyCategory };
