import { describe, expect, it } from 'vitest';

import { searchExercises } from './search';
import { seedExercises } from '../data/seed';

/**
 * Search is the one place the app's two languages meet a stored ENGLISH
 * identifier: a muscle group is `back` on disk whatever the screen says. The
 * cases below are the ones that were broken — a Russian word finding nothing —
 * and the ones that must keep working while it is fixed.
 */
describe('searchExercises', () => {
  it('finds a row by the Russian name of the muscle it works', () => {
    const hits = searchExercises(seedExercises, 'спина');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.muscleGroups.includes('back'))).toBe(true);
  });

  it('still finds it by the English identifier, which is what is stored', () => {
    expect(searchExercises(seedExercises, 'back').length).toBeGreaterThan(0);
  });

  it('finds a row by the English name it used to ship under, now an alias', () => {
    const hits = searchExercises(seedExercises, 'weighted dips');
    expect(hits.map((e) => e.id)).toContain('ex_dips_weighted');
  });

  it('finds a row by its Russian name', () => {
    const hits = searchExercises(seedExercises, 'отжимания');
    expect(hits.map((e) => e.id)).toContain('ex_pushups');
  });

  it('returns every live row for an empty query', () => {
    expect(searchExercises(seedExercises, '  ')).toHaveLength(seedExercises.length);
  });
});
