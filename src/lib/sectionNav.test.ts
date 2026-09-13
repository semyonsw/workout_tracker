import { describe, expect, it } from 'vitest';

import { SECTIONS, stepSection, type SectionTab } from './sectionNav';

/**
 * The swipe, as arithmetic.
 *
 * Four sections and one rule, and the rule is the one worth pinning: the ends
 * CLAMP. Wrapping would make `Workout` and `Settings` adjacent — the two screens
 * with the least to do with each other — so a flick past the first section would
 * land on the last, and the gesture would stop meaning "the next one along".
 */
describe('stepSection', () => {
  it('moves one along in each direction', () => {
    expect(stepSection('Workout', 1)).toBe('Tasks');
    expect(stepSection('Tasks', 1)).toBe('Expenses');
    expect(stepSection('Expenses', 1)).toBe('Settings');
    expect(stepSection('Settings', -1)).toBe('Expenses');
    expect(stepSection('Tasks', -1)).toBe('Workout');
  });

  it('stays put at either end rather than wrapping', () => {
    expect(stepSection('Workout', -1)).toBe('Workout');
    expect(stepSection('Settings', 1)).toBe('Settings');
  });

  it('answers with the first section for a tab this build does not have', () => {
    // A tab name persisted by an older build is a thing that happens.
    expect(stepSection('Money' as never, 1)).toBe('Workout');
  });

  it('walks the whole row and back', () => {
    let at: SectionTab = SECTIONS[0];
    for (let i = 1; i < SECTIONS.length; i += 1) at = stepSection(at, 1);
    expect(at).toBe(SECTIONS[SECTIONS.length - 1]);
    for (let i = 1; i < SECTIONS.length; i += 1) at = stepSection(at, -1);
    expect(at).toBe(SECTIONS[0]);
  });
});
