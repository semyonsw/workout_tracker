import { describe, expect, it } from 'vitest';

import { ADVANCE_RECENT_MS, holdsAfterFinishing } from './cardAdvance';
import type { DraftEntry } from './draft';

/**
 * The hold after an exercise's last ✓. The case that matters is the one it must
 * NOT fire in: a finished card the user has simply moved away from by tapping
 * another one.
 */

const NOW = Date.parse('2026-09-25T10:00:00.000Z');

function entry(sets: { done: boolean; at?: number }[]): DraftEntry {
  return {
    sets: sets.map((set, index) => ({
      localId: `s${index}`,
      weightKg: 60,
      count: 8,
      isWarmup: false,
      isCompleted: set.done,
      completedAt: set.at == null ? null : new Date(set.at).toISOString(),
      isPrefilled: false,
    })),
  } as unknown as DraftEntry;
}

describe('holding a just-finished card open', () => {
  it('holds when the last set was logged a moment ago', () => {
    expect(
      holdsAfterFinishing(
        entry([
          { done: true, at: NOW - 90_000 },
          { done: true, at: NOW - 40 },
        ]),
        NOW,
      ),
    ).toBe(true);
  });

  it('does not hold a card with work left in it', () => {
    expect(holdsAfterFinishing(entry([{ done: true, at: NOW - 40 }, { done: false }]), NOW)).toBe(
      false,
    );
  });

  it('does not hold a card that was finished a while ago — that was a tap', () => {
    expect(holdsAfterFinishing(entry([{ done: true, at: NOW - ADVANCE_RECENT_MS - 1 }]), NOW)).toBe(
      false,
    );
  });

  it('does not hold nothing', () => {
    expect(holdsAfterFinishing(undefined, NOW)).toBe(false);
    expect(holdsAfterFinishing(entry([]), NOW)).toBe(false);
  });

  it('does not hold a finished card with no times on it', () => {
    expect(holdsAfterFinishing(entry([{ done: true }]), NOW)).toBe(false);
  });
});
