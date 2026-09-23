/**
 * LanguageChoiceScreen — the one question the app asks before anything else.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │                                              │
 *   │  WORKOUT TRACKER                             │
 *   │  Выберите язык                               │
 *   │  Choose a language                           │
 *   │                                              │
 *   │  ╭────────────────────────────────────────╮  │
 *   │  │ РУ   Русский                           │  │
 *   │  ╰────────────────────────────────────────╯  │
 *   │  ╭────────────────────────────────────────╮  │
 *   │  │ EN   English                           │  │
 *   │  ╰────────────────────────────────────────╯  │
 *   │                                              │
 *   │  Можно поменять в настройках · in Settings   │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The app SHIPS in Russian, and shipping in a language is not the same as the
 * user choosing one. Someone who reads English opened a phone full of Cyrillic
 * and had to find a two-letter toggle in the corner of a settings screen they
 * could not read to get out of it. One screen, once, removes that entirely.
 *
 * ── IT IS BILINGUAL, AND THAT IS THE WHOLE TRICK ──────────────────────────
 *
 * Every word on it appears in BOTH languages at once, because it is the one
 * screen that cannot assume an answer to the question it is asking. Nothing here
 * goes through `t()` — a translated launch screen would render in the language
 * being chosen, which is exactly the assumption this screen exists to avoid.
 *
 * ── ASKED ONCE, AND NEVER AGAIN ───────────────────────────────────────────
 *
 * `languageChosen` in `settingsStore` is the flag, and any write of the language
 * sets it — including the РУ / EN toggle in Settings, because somebody who used
 * that has plainly answered. The caller also has to wait for the store to
 * rehydrate before showing this, or every existing user gets asked again on
 * every launch; `hooks/useHydrated.ts` is that wait.
 *
 * There is no "skip". Both buttons are an answer, the default is one tap, and a
 * third control that means "decide for me" is a thing to read rather than a
 * thing to press.
 */

import { Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { commit } from '../lib/feedback';
import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_NAMES, type Language } from '../lib/i18n';
import { useSettings } from '../state/settingsStore';
import { palette } from '../theme/tokens';

export function LanguageChoiceScreen() {
  const setLanguage = useSettings((s) => s.setLanguage);
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 justify-center bg-bg px-lg"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Text className="text-micro font-semibold uppercase text-green-bright">Workout tracker</Text>

      {/* Both languages, same weight. Neither is the app's suggestion. */}
      <Text className="mt-md text-title-lg font-medium text-ink">Выберите язык</Text>
      <Text className="text-title-lg font-medium text-ink">Choose a language</Text>

      <View className="mt-xxl">
        {LANGUAGES.map((language) => (
          <Choice
            key={language}
            language={language}
            onPress={() => {
              commit();
              setLanguage(language);
            }}
          />
        ))}
      </View>

      <Text className="mt-xl text-label text-ink-faint">
        Это можно поменять в любой момент — переключатель РУ / EN в углу настроек.
      </Text>
      <Text className="mt-xs text-label text-ink-faint">
        You can change this at any time — the РУ / EN toggle in the corner of Settings.
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One language, as a full-width row.
 *
 * The two-letter badge is the SAME mark the Settings toggle uses, so the thing
 * pressed here is recognisable as the thing that changes it later — the sentence
 * under the buttons is then a description of something already seen rather than
 * a promise about a control nobody has met.
 */
function Choice({ language, onPress }: { language: Language; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={LANGUAGE_NAMES[language]}
      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
      className="mb-sm h-row-lg flex-row items-center rounded-surface border border-hairline bg-surface px-lg"
    >
      <View className="h-[36px] w-[44px] items-center justify-center rounded-pill border border-green-bright bg-surface-alt">
        <Text allowFontScaling={false} className="text-label font-semibold text-green-bright">
          {LANGUAGE_LABELS[language]}
        </Text>
      </View>
      <Text className="ml-lg flex-1 text-title font-medium text-ink">
        {LANGUAGE_NAMES[language]}
      </Text>
      <View
        className="h-[8px] w-[8px] rounded-pill"
        style={{ backgroundColor: palette.greenDim }}
      />
    </Pressable>
  );
}
