import { describe, expect, it } from 'vitest';

import {
  LETTER_ADVANCE,
  NUMERAL_ADVANCE,
  UNIT_GAP,
  UNIT_RATIO,
  workCeiling,
  workNumeralSize,
} from './focusType';

/**
 * The size of the two numbers focus mode exists to show.
 *
 * Every assertion here is really checking one of two things: the line FITS the
 * width, and the lines FIT THE PHONE. The constant this replaced was safe on both
 * counts by being small enough for the worst set anybody does — which is how the
 * number you read between every pair of ordinary sets ended up sized for a set
 * you do twice a year.
 */

/** What the component draws, in dp, at a given size. The model, inverted. */
function advance(text: string): number {
  let ems = 0;
  for (const ch of text) ems += /[0-9+\-.,:]/.test(ch) ? NUMERAL_ADVANCE : LETTER_ADVANCE;
  return ems;
}

function drawnWidth(value: string, unit: string, size: number): number {
  const tail = unit === '' ? 0 : UNIT_GAP * size + advance(unit) * UNIT_RATIO * size;
  return advance(value) * size + tail;
}

describe('the working numerals', () => {
  /* A 360 dp phone, inside the gutter, with the ± box taken off. */
  const NARROW = 284;

  it('takes the ceiling when the line is short enough to have it', () => {
    expect(workNumeralSize([{ value: '5', unit: 'REPS' }], NARROW, 96)).toBe(96);
  });

  it('comes down for the worst realistic weight rather than clipping it', () => {
    const size = workNumeralSize([{ value: '+120', unit: 'KG' }], NARROW, 140);
    expect(size).toBeLessThan(140);
    expect(drawnWidth('+120', 'KG', size)).toBeLessThanOrEqual(NARROW);
  });

  it('draws both lines at one size — the smallest that fits both', () => {
    const lines = [
      { value: '+120', unit: 'KG' },
      { value: '12', unit: 'REPS' },
    ];
    const size = workNumeralSize(lines, NARROW, 140);
    const alone = workNumeralSize([lines[0]], NARROW, 140);
    expect(size).toBe(alone);
    for (const line of lines) {
      expect(drawnWidth(line.value, line.unit, size)).toBeLessThanOrEqual(NARROW);
    }
  });

  it('keeps every line inside the width, over every set and every phone', () => {
    // `MAX` and `МАКС` are in here because the one value on this screen that is
    // a WORD is the one a digit-width model gets wrong by half a line.
    for (const value of ['5', '12', '100', '32.5', '+120', '-22.5', 'MAX', 'МАКС']) {
      for (const unit of ['', 'KG', 'REPS', 'SEC', 'ПОВТ']) {
        for (const width of [120, 180, 220, 284, 340, 600]) {
          const size = workNumeralSize([{ value, unit }], width, 140);
          // Under the floor the contract changes and says so: a phone too narrow
          // for a legible number gets a legible number and clips it, rather than
          // a number nobody can read from the bench. Nothing sold reaches here.
          if (size > 40) expect(drawnWidth(value, unit, size)).toBeLessThanOrEqual(width);
          else expect(size).toBe(40);
        }
      }
    }
  });

  it('never goes under the size the same numbers have everywhere else', () => {
    expect(workNumeralSize([{ value: '+120.5', unit: 'REPS' }], 40, 140)).toBe(40);
  });

  it('falls to the floor on a width nobody has measured yet', () => {
    // Not the ceiling: one frame of a small number beats one frame of a number
    // running off the edge of the screen.
    expect(workNumeralSize([{ value: '5', unit: '' }], 0, 96)).toBe(40);
    expect(workNumeralSize([{ value: '5', unit: '' }], Number.NaN, 96)).toBe(40);
  });

  it('is the ceiling when there is nothing to measure', () => {
    expect(workNumeralSize([], 284, 96)).toBe(96);
  });
});

/**
 * ── AND THE LINES HAVE TO FIT THE PHONE, NOT ONLY THE GUTTER ───────────────
 *
 * The first cut of this budgeted a share of the screen's height for ONE line and
 * then drew two, which on a short phone with the ± panel open would have put the
 * stepper pills behind the DONE circle. The height is a budget: what is left after
 * the furniture, split between the lines actually being drawn.
 */
describe('the ceiling a screen allows', () => {
  /** What each state draws around the numbers, per `focusType.ts`. */
  const FURNITURE = { lift: 514, rest: 490 } as const;

  const PANEL = 150;
  const NEW_EXERCISE = 60;

  function fits(
    height: number,
    where: 'lift' | 'rest',
    lines: number,
    compact: boolean,
    newExercise = false,
  ) {
    const size = workCeiling(height, where, lines, compact, newExercise);
    const extra = newExercise && where === 'rest' ? NEW_EXERCISE : 0;
    return FURNITURE[where] + (compact ? PANEL : 0) + extra + lines * size * 1.06 <= height;
  }

  it('gives a tall phone the countdown’s own size for the set it replaces', () => {
    expect(workCeiling(800, 'lift', 2)).toBe(120);
  });

  it('gives a single bodyweight line the height both lines would have shared', () => {
    expect(workCeiling(680, 'lift', 1)).toBeGreaterThan(workCeiling(680, 'lift', 2));
  });

  it('keeps the whole state on the phone, on every screen it can run on', () => {
    for (const height of [640, 667, 720, 800, 900, 1000]) {
      for (const lines of [1, 2]) {
        for (const compact of [false, true]) {
          for (const where of ['lift', 'rest'] as const) {
            for (const newExercise of [false, true]) {
              // The floor is allowed to win on the smallest screen with the panel
              // open — under it the number has stopped being worth its own line.
              if (workCeiling(height, where, lines, compact, newExercise) > 40) {
                expect(fits(height, where, lines, compact, newExercise)).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('stands down while the ± panel states the same numbers', () => {
    expect(workCeiling(900, 'lift', 2, true)).toBeLessThanOrEqual(56);
    expect(workCeiling(900, 'lift', 2, true)).toBeLessThan(workCeiling(900, 'lift', 2));
  });

  it('leaves room for the line that says you are walking to another machine', () => {
    // On a screen tall enough for the cap both are 76; the budget only has a say
    // where there is not enough room for everything, which is where it matters.
    expect(workCeiling(640, 'rest', 2, false, true)).toBeLessThan(
      workCeiling(640, 'rest', 2, false, false),
    );
  });

  it('keeps the up-next block under the clock that owns the screen', () => {
    expect(workCeiling(900, 'rest', 2)).toBeLessThan(workCeiling(900, 'lift', 2));
  });

  it('never goes under the size the same numbers have everywhere else', () => {
    expect(workCeiling(200, 'rest', 2)).toBe(40);
  });
});
