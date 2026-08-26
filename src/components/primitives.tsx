/**
 * The shared vocabulary every screen outside the session is assembled from.
 *
 *   Kicker      an uppercase Micro section label
 *   ListCard    a `surface` card that clips its children's hairlines
 *   Separator   a 1px rule, inset past whatever column it must clear
 *   SettingRow  56 high: label left, value right
 *   FieldWell   a 56-high text field with a green caret
 *   NumericWell a 96-high labelled number
 *   Segmented   a 44-high pill of equal segments
 *   SelectChip  a 36-high pill that is on or off, for sets of options
 *   Toggle      52 × 32, the only switch in the app
 *   PrimaryButton / GhostButton — 56 high, full width
 *
 * These exist so a new screen is a composition rather than a new set of
 * spacing decisions. Every value here is from the design; none of them are
 * parameterised beyond what the design actually varies.
 */

import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { palette } from '../theme/tokens';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

/**
 * Section label. Uppercase, wide-tracked, faint.
 *
 * `green` marks a section whose contents just changed under the user (the set
 * inputs a toggle added). `dim` is for a label on a target rather than on
 * content — the "DROP HERE" in a reorder gap.
 */
export function Kicker({
  children,
  tone = 'faint',
  className = '',
}: {
  children: ReactNode;
  tone?: 'faint' | 'green' | 'dim';
  className?: string;
}) {
  const toneClass =
    tone === 'green' ? 'text-green-bright' : tone === 'dim' ? 'text-green-dim' : 'text-ink-faint';
  return (
    <Text
      className={['text-micro font-semibold uppercase tabular-nums', toneClass, className].join(
        ' ',
      )}
    >
      {children}
    </Text>
  );
}

/**
 * A card of rows. `overflow-hidden` is load-bearing: it is what lets a row's
 * own background and its hairlines stop cleanly at the 14px corner.
 */
export function ListCard({
  children,
  className = '',
  clip = true,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Clip children to the card's rounded box. On by default, and off for exactly one
   * reason: a row lifted out of the list for reordering is translated past the
   * card's own edges, and a clipped card cuts it in half on the way. Nothing else
   * here overflows, so turning it off costs nothing while a drag is in flight.
   */
  clip?: boolean;
}) {
  return (
    <View
      className={[
        clip ? 'overflow-hidden' : 'overflow-visible',
        'rounded-surface border border-hairline bg-surface',
        className,
      ].join(' ')}
    >
      {children}
    </View>
  );
}

/**
 * A 1px rule. `inset` is how far past the left edge it starts — 16 to clear the
 * gutter, 40 to clear a drag handle, 0 to full-bleed under a footer row.
 */
export function Separator({ inset = 16 }: { inset?: 0 | 16 | 40 }) {
  const insetClass = inset === 40 ? 'ml-[40px]' : inset === 16 ? 'ml-lg' : '';
  return <View className={`h-hairline bg-hairline ${insetClass}`} />;
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

/** 56 high: label left in ink, value right in ink-muted. A fact, or a link to one. */
export function SettingRow({
  label,
  value,
  valueTone = 'muted',
  onPress,
}: {
  label: string;
  value?: string;
  /** `faint` states a value the user cannot change and shouldn't chase. */
  valueTone?: 'muted' | 'faint';
  onPress?: () => void;
}) {
  const body = (
    <View className="h-row flex-row items-center px-lg">
      <Text className="flex-1 text-body font-medium text-ink">{label}</Text>
      {value ? (
        <Text
          className={[
            'text-body font-medium tabular-nums',
            valueTone === 'faint' ? 'text-ink-faint' : 'text-ink-muted',
          ].join(' ')}
        >
          {value}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Pressable>
  );
}

/**
 * The footer row of a card: a plus and a verb. Green when it adds something the
 * user chose to add, faint when it is just the next slot in a list.
 */
export function AddRow({
  label,
  tone = 'green',
  onPress,
}: {
  label: string;
  tone?: 'green' | 'faint';
  onPress: () => void;
}) {
  const green = tone === 'green';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-row flex-row items-center justify-center"
    >
      <Icon name="plus" size={14} color={green ? palette.greenBright : palette.inkFaint} />
      <Text
        className={`ml-sm text-label font-medium ${green ? 'text-green-bright' : 'text-ink-muted'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

/**
 * A text field. Plain — nothing clever.
 *
 * With `onChangeText` it is a real `TextInput` whose caret is tinted
 * `green-bright`, which is exactly what the design draws: a 2px green bar after
 * the value. With no `onChangeText` it renders the same thing statically and
 * draws that bar itself, for the read-only case.
 *
 * Both paths are the same 56-high box so a field never changes size or position
 * when it gains focus.
 */
export function FieldWell({
  value,
  size = 'title',
  shape = 'surface',
  placeholder,
  onChangeText,
  onPress,
  autoFocus = false,
  selectAllOnFocus = false,
  keyboardType = 'default',
  accessibilityLabel,
}: {
  value: string;
  /** `title` for names, `body` for a search query. */
  size?: 'title' | 'body';
  /** `pill` for search, `surface` for form fields. */
  shape?: 'surface' | 'pill';
  placeholder?: string;
  /** Present = editable. Absent = a drawn, read-only field. */
  onChangeText?: (value: string) => void;
  onPress?: () => void;
  /** Open the keyboard on mount. For a field that exists to be filled in. */
  autoFocus?: boolean;
  /**
   * Select the whole value on focus, so the first keystroke replaces a
   * placeholder name instead of appending to it.
   */
  selectAllOnFocus?: boolean;
  /** `number-pad` for a field that only ever holds digits. */
  keyboardType?: 'default' | 'number-pad';
  accessibilityLabel: string;
}) {
  const box = [
    'h-row flex-row items-center border border-hairline bg-surface-alt',
    shape === 'pill' ? 'rounded-pill px-[20px]' : 'rounded-surface px-lg',
  ].join(' ');
  const textClass = size === 'title' ? 'text-title font-medium text-ink' : 'text-body text-ink';

  if (onChangeText) {
    return (
      <View className={box}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.inkFaint}
          // The caret IS the green bar in the design. Android honours
          // `cursorColor`, iOS `selectionColor`; both are set so the field looks
          // the same either way.
          cursorColor={palette.greenBright}
          selectionColor={palette.greenBright}
          autoFocus={autoFocus}
          selectTextOnFocus={selectAllOnFocus}
          keyboardType={keyboardType}
          accessibilityLabel={accessibilityLabel}
          returnKeyType="done"
          className={`flex-1 ${textClass}`}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={box}
    >
      <Text className={textClass}>{value}</Text>
      <View
        className="ml-[2px] w-[2px] bg-green-bright"
        style={{ height: size === 'title' ? 26 : 20 }}
      />
    </Pressable>
  );
}

/**
 * A 96-high well: micro label pinned top, the number pinned bottom at Display
 * size. Two of these side by side ARE the set-input preview — which is why they
 * are this big. You should be able to see what the exercise will ask you for.
 *
 * A well with an `onPress` says so, with a `±` beside its label. It used to look
 * exactly like one without: the create screen's two wells were tappable-looking
 * and inert, which is the worst of both — the affordance is the promise, so it only
 * appears when there is something behind it. `selected` marks the one an open
 * editor is pointing at, in the same green the rest of the app uses for "this is
 * the live thing".
 */
export function NumericWell({
  label,
  value,
  unit,
  onPress,
  selected = false,
}: {
  label: string;
  value: string;
  unit?: string;
  onPress?: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        onPress
          ? `${label} ${value} ${unit ?? ''}, adjust`.replace(/\s+/g, ' ').trim()
          : `${label} ${value} ${unit ?? ''}`.replace(/\s+/g, ' ').trim()
      }
      className={[
        'h-well flex-1 justify-between rounded-surface border bg-surface-alt px-lg py-md',
        selected ? 'border-green-bright' : 'border-hairline',
      ].join(' ')}
    >
      <View className="flex-row items-center justify-between">
        <Kicker tone={selected ? 'green' : 'faint'}>{label}</Kicker>
        {onPress ? (
          <Text
            className={[
              'text-micro font-semibold',
              selected ? 'text-green-bright' : 'text-ink-faint',
            ].join(' ')}
          >
            ±
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-baseline">
        <Text className="text-display font-semibold tabular-nums text-ink">{value}</Text>
        {unit ? (
          <Text className="ml-xs text-micro font-semibold uppercase text-ink-faint">{unit}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

/**
 * Segmented control. Two to four options, equal width, selected on a `green`
 * fill. Used where the choice changes what the rest of the screen contains —
 * load mode, counted-in — so it has to be visible without a tap.
 */
export function Segmented<T extends string>({
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
      className="h-hit flex-row items-center rounded-pill border border-hairline bg-surface p-xs"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            className={[
              'h-[36px] flex-1 items-center justify-center rounded-pill',
              selected ? 'bg-green' : '',
            ].join(' ')}
          >
            <Text
              className={[
                'text-label',
                selected ? 'font-semibold text-ink' : 'font-medium text-ink-muted',
              ].join(' ')}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A chip that is on or off.
 *
 * `Segmented` is for two to four mutually-exclusive options that must ALL be
 * visible without a tap. Chips are for the other shape: a SET of options — the
 * fourteen muscle groups, the five movement clusters — too many to sit in one
 * fixed-width control, and often more than one selected at a time. Same green
 * fill for "on" so the two controls read as the same system.
 *
 * 36 high inside a 44 row (the parent supplies the padding), which keeps the
 * thumb target legal while letting a row of chips stay one line tall.
 */
export function SelectChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={[
        'mb-sm mr-sm h-[36px] items-center justify-center rounded-pill px-lg',
        selected ? 'bg-green' : 'border border-hairline bg-surface',
      ].join(' ')}
    >
      <Text
        className={[
          'text-label',
          selected ? 'font-semibold text-ink' : 'font-medium text-ink-muted',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The only switch in the app, and it earns it: `Requires weight` visibly adds
 * or removes the inputs below it, so the control needs to read as a hard on/off
 * rather than a preference.
 */
export function Toggle({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      className={[
        'h-[32px] w-[52px] justify-center rounded-pill px-xs',
        value ? 'items-end bg-green' : 'items-start bg-hairline',
      ].join(' ')}
    >
      <View
        className="h-[24px] w-[24px] rounded-pill"
        style={{ backgroundColor: value ? palette.ink : palette.inkFaint }}
      />
    </Pressable>
  );
}

/**
 * 56-high full-width button. `primary` is a green fill with ink at 600;
 * `ghost` is surface-alt on a hairline. There is no third kind, and no red:
 * a destructive action is stated as a fact in the same green as every other.
 */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={[
        'h-row items-center justify-center rounded-pill',
        primary ? 'bg-green' : 'border border-hairline bg-surface-alt',
      ].join(' ')}
    >
      <Text className={`text-body ${primary ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A 56-high borderless text action. Used for `Delete routine` — no red, no fuss.
 *
 * `green` marks a row that DOES something for you rather than undoing something:
 * `Export data` and `Delete all workout history` sit in the same card at the bottom
 * of Settings, and only one of them should look like the thing to reach for. Same
 * green every other primary action in the app uses; the quiet rows stay ink-muted.
 */
export function TextButton({
  label,
  tone = 'muted',
  onPress,
}: {
  label: string;
  tone?: 'muted' | 'green';
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-row items-center justify-center"
    >
      <Text
        className={[
          'text-label font-medium',
          tone === 'green' ? 'text-green-bright' : 'text-ink-muted',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
