import { describe, expect, it } from 'vitest';

import { plural, ruPluralForm, t, translatedKeys, usableLanguage } from './i18n';

/**
 * The catalogue.
 *
 * Two properties matter and both are about FAILURE. A string nobody has
 * translated has to come back in English rather than as a key or an empty
 * string, because that is what makes it safe to wrap screens one at a time. And
 * a placeholder that is not filled has to survive as itself rather than becoming
 * `undefined` on somebody's phone.
 *
 * The Russian plural rule is here because it is the one piece of grammar the app
 * computes, and getting it wrong reads as broken Russian rather than as a bug.
 */

describe('looking a string up', () => {
  it('returns the Russian when there is one', () => {
    expect(t('Add task', 'ru')).toBe('Добавить задачу');
  });

  it('returns the English key itself when there is not', () => {
    expect(t('A string nobody has translated', 'ru')).toBe('A string nobody has translated');
  });

  it('never translates when the language is English', () => {
    expect(t('Add task', 'en')).toBe('Add task');
  });
});

describe('filling the holes', () => {
  it('substitutes by name, in the target language’s own word order', () => {
    expect(t('{done} of {total} done', 'en', { done: 6, total: 8 })).toBe('6 of 8 done');
    expect(t('{done} of {total} done', 'ru', { done: 6, total: 8 })).toBe('сделано 6 из 8');
  });

  it('leaves a placeholder alone rather than printing undefined', () => {
    expect(t('{done} of {total} done', 'en', { done: 6 })).toBe('6 of {total} done');
  });

  it('fills an untranslated string too', () => {
    expect(t('{n} widgets', 'ru', { n: 3 })).toBe('3 widgets');
  });
});

describe('the Russian plural rule', () => {
  it('takes the singular at 1, 21, 101 — and not at 11', () => {
    expect(ruPluralForm(1)).toBe('one');
    expect(ruPluralForm(21)).toBe('one');
    expect(ruPluralForm(101)).toBe('one');
    expect(ruPluralForm(11)).toBe('many');
  });

  it('takes the paucal at 2–4, 22–24 — and not at 12–14', () => {
    expect(ruPluralForm(2)).toBe('few');
    expect(ruPluralForm(4)).toBe('few');
    expect(ruPluralForm(23)).toBe('few');
    expect(ruPluralForm(12)).toBe('many');
    expect(ruPluralForm(14)).toBe('many');
  });

  it('takes the genitive plural at 0, 5–20 and the rest', () => {
    expect(ruPluralForm(0)).toBe('many');
    expect(ruPluralForm(5)).toBe('many');
    expect(ruPluralForm(19)).toBe('many');
  });

  it('reads English as two forms and Russian as three', () => {
    const forms = { one: 'день', few: 'дня', many: 'дней' };
    expect(plural(1, 'ru', forms)).toBe('день');
    expect(plural(3, 'ru', forms)).toBe('дня');
    expect(plural(8, 'ru', forms)).toBe('дней');

    const english = { one: 'day', many: 'days' };
    expect(plural(1, 'en', english)).toBe('day');
    expect(plural(3, 'en', english)).toBe('days');
  });
});

describe('the setting', () => {
  it('accepts the two languages this build has', () => {
    expect(usableLanguage('ru')).toBe('ru');
    expect(usableLanguage('en')).toBe('en');
  });

  // Russian is what the app ships in, so anything unreadable lands there.
  it('falls back to Russian for anything else', () => {
    expect(usableLanguage('fr')).toBe('ru');
    expect(usableLanguage(undefined)).toBe('ru');
    expect(usableLanguage(7)).toBe('ru');
  });
});

describe('the catalogue itself', () => {
  it('translates nothing to an empty string', () => {
    for (const key of translatedKeys()) {
      expect(t(key, 'ru').trim()).not.toBe('');
    }
  });

  it('answers in Russian, not in the English it was handed', () => {
    /*
     * The sweep that translated the rest of the app added ~400 entries by hand,
     * and the way that goes wrong quietly is an entry copied across without
     * being translated: `t(key, 'ru') === key` renders English on a Russian
     * phone and looks, from the code, exactly like a finished translation.
     *
     * Anything genuinely the same in both languages is a proper noun and has no
     * business in the catalogue at all, so an identical pair is always a
     * mistake.
     */
    for (const key of translatedKeys()) {
      expect(t(key, 'ru')).not.toBe(key);
    }
  });

  it('keeps every placeholder a key declares', () => {
    for (const key of translatedKeys()) {
      const holes = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const translated = [...t(key, 'ru').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      // A translation that drops `{total}` renders a sentence with a number
      // missing from the middle of it, which is worse than being untranslated.
      expect(translated).toEqual(holes);
    }
  });
});
