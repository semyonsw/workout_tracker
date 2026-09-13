/**
 * `const t = useT()` — the translator, bound to the setting, subscribed.
 *
 * A hook rather than a module-level function because the language is a SETTING
 * and changing it has to repaint every screen that is mounted. Selecting the
 * primitive `language` out of the store is what makes that happen: the toggle in
 * the corner of Settings writes one string, and every component holding this
 * re-renders with the other language.
 *
 * `useMemo` on the language, so the returned function is stable between renders
 * — a component that passes `t` down to a memoised child is not re-rendering it
 * for nothing.
 *
 * `useLanguage` is the other half, for the handful of places that need the value
 * itself: a date formatter picking a month-name table, the toggle drawing which
 * of the two letters is lit.
 */

import { useCallback, useMemo } from 'react';

import { plural, t as translate, type Language, type PluralForms, type Vars } from '../lib/i18n';
import { useSettings } from '../state/settingsStore';

export function useLanguage(): Language {
  return useSettings((s) => s.language);
}

export type Translate = (key: string, vars?: Vars) => string;

export function useT(): Translate {
  const lang = useLanguage();
  return useMemo(() => (key: string, vars?: Vars) => translate(key, lang, vars), [lang]);
}

/** The counted-noun form, for the rows that print "12 дней подряд". */
export function usePlural(): (n: number, forms: PluralForms) => string {
  const lang = useLanguage();
  return useCallback((n: number, forms: PluralForms) => plural(n, lang, forms), [lang]);
}
