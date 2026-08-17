/**
 * Count-in tests.
 *
 * The feature the user asked for is "beep the last five seconds of any
 * countdown", and everything that can go wrong with it is a timing rule rather
 * than a sound: beeping four times a second because the timer ticks at 4 Hz,
 * beeping through a countdown that finished while the app was killed, or going
 * silent after a `+15` because the seconds were already spoken.
 *
 * The clocks feed this whole seconds and it answers with a cue, so a two-minute
 * plank is 480 ticks in a loop here and no waiting.
 *
 * Run: npx vitest run src/lib/countdownCue.test.ts
 */

import { describe, expect, it } from 'vitest';

import { IDLE_LATCH, nextCue, type Cue, type CueInput, type CueLatch } from './countdownCue';

const DEFAULTS = { window: 5, finalTone: true };

/**
 * Feed a sequence of readings through the latch and collect what it said.
 *
 * `readings` are what the pill would display, in order — the same numbers a 4 Hz
 * tick produces, repeats and all.
 */
function run(
  readings: (number | null)[],
  options: Partial<Omit<CueInput, 'secondsLeft'>> = {},
): Cue[] {
  let latch: CueLatch = IDLE_LATCH;
  const cues: Cue[] = [];

  for (const secondsLeft of readings) {
    const result = nextCue(latch, {
      id: 'rest:1',
      ...DEFAULTS,
      ...options,
      secondsLeft,
    });
    latch = result.latch;
    cues.push(result.cue);
  }

  return cues;
}

/** Only the cues that made a sound, for readable assertions. */
function spoken(cues: Cue[]): Cue[] {
  return cues.filter((c) => c !== 'none');
}

/* ------------------------------------------------------------------ */

describe('the window', () => {
  it('beeps the last five seconds and lands on the long tone', () => {
    // 10 arms the latch; nothing outside the window speaks.
    const cues = run([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(spoken(cues)).toEqual(['tick', 'tick', 'tick', 'tick', 'tick', 'final']);
  });

  it('honours a different window length', () => {
    const cues = run([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], { window: 3 });
    expect(spoken(cues)).toEqual(['tick', 'tick', 'tick', 'final']);
  });

  it('a window of zero is silent but still sounds the end', () => {
    const cues = run([10, 5, 4, 3, 2, 1, 0], { window: 0 });
    expect(spoken(cues)).toEqual(['final']);
  });

  it('finalTone off hands the last beat to someone else', () => {
    // The get-ready count: it ticks, and the work clock says "go".
    const cues = run([5, 4, 3, 2, 1, 0], { finalTone: false });
    expect(spoken(cues)).toEqual(['tick', 'tick', 'tick', 'tick']);
  });
});

describe('one cue per second', () => {
  /*
   * The rest and set timers both tick at 250 ms, so every displayed second is read
   * about four times. Without the latch this is the difference between a count-in
   * and a machine gun.
   */
  it('collapses a 4 Hz tick into one beep per second', () => {
    const readings = [8];
    for (const second of [7, 6, 5, 4, 3, 2, 1, 0]) {
      readings.push(second, second, second, second);
    }

    expect(spoken(run(readings))).toEqual([
      'tick',
      'tick',
      'tick',
      'tick',
      'tick',
      'final',
    ]);
  });

  it('never repeats the final tone, however long the clock sits at zero', () => {
    const readings = [3, 2, 1, ...Array.from({ length: 40 }, () => 0)];
    expect(spoken(run(readings)).filter((c) => c === 'final')).toHaveLength(1);
  });
});

describe('a countdown that finished while the app was dead', () => {
  /*
   * Rule 2, and the one that would be most annoying to get wrong: the timers are
   * absolute deadlines, so a plank that ran out in someone's pocket reads as 0 on
   * the first frame after relaunch. Announcing "go" then is the app narrating the
   * past.
   */
  it('says nothing when the first reading is already zero', () => {
    expect(spoken(run([0, 0, 0]))).toEqual([]);
  });

  it('says nothing when the first reading is already inside the window', () => {
    // Rehydrated mid-window: the seconds it missed are not worth inventing, and
    // the end still sounds.
    expect(spoken(run([3, 2, 1, 0]))).toEqual(['tick', 'tick', 'final']);
  });

  it('arms on the first reading whatever it is', () => {
    const { cue, latch } = nextCue(IDLE_LATCH, {
      id: 'rest:1',
      secondsLeft: 4,
      ...DEFAULTS,
    });

    expect(cue).toBe('none');
    expect(latch.armedFor).toBe('rest:1');
    expect(latch.spokenSecond).toBe(4);
  });
});

describe('re-arming', () => {
  /*
   * `+15` on a running rest produces a new deadline, so a new id. The seconds
   * already spoken belong to the old target; without a reset the pill would go
   * permanently silent for the rest of the timer.
   */
  it('a new id counts down again from silence', () => {
    let latch = IDLE_LATCH;
    const cues: Cue[] = [];

    const feed = (id: string, secondsLeft: number) => {
      const result = nextCue(latch, { id, secondsLeft, ...DEFAULTS });
      latch = result.latch;
      cues.push(result.cue);
    };

    // First deadline, counted into the window.
    for (const s of [8, 4, 3]) feed('rest:1', s);
    // ...then +15, which is a different deadline entirely.
    for (const s of [18, 5, 4, 3, 2, 1, 0]) feed('rest:2', s);

    expect(spoken(cues)).toEqual([
      'tick', // 4 on the old deadline
      'tick', // 3 on the old deadline
      'tick', // 5 on the new one — 18 armed it
      'tick',
      'tick',
      'tick',
      'tick',
      'final',
    ]);
  });

  it('a countdown pushed back up speaks the same second again', () => {
    // `−15` then counting down past the same number: the user moved the target, so
    // "3" is a new event rather than a repeat.
    expect(spoken(run([8, 3, 2, 5, 4, 3, 2, 1, 0]))).toEqual([
      'tick', // 3
      'tick', // 2
      'tick', // 5
      'tick', // 4
      'tick', // 3 again — legitimately
      'tick', // 2 again
      'tick', // 1
      'final',
    ]);
  });

  it('going idle resets the latch', () => {
    let latch = IDLE_LATCH;
    for (const secondsLeft of [8, 4, 3]) {
      latch = nextCue(latch, { id: 'rest:1', secondsLeft, ...DEFAULTS }).latch;
    }

    const idle = nextCue(latch, { id: null, secondsLeft: null, ...DEFAULTS });
    expect(idle.cue).toBe('none');
    expect(idle.latch).toEqual(IDLE_LATCH);
  });

  it('a paused timer stops speaking and resumes without repeating itself', () => {
    let latch = IDLE_LATCH;
    const cues: Cue[] = [];

    const feed = (id: string | null, secondsLeft: number | null) => {
      const result = nextCue(latch, { id, secondsLeft, ...DEFAULTS });
      latch = result.latch;
      cues.push(result.cue);
    };

    for (const s of [8, 4, 3]) feed('rest:1', s);
    // Pausing clears the deadline, which is how the hook expresses "not counting".
    for (let i = 0; i < 5; i += 1) feed(null, null);
    // Resuming is a new deadline: 3 arms it, then 2 and 1 speak.
    for (const s of [3, 2, 1, 0]) feed('rest:2', s);

    expect(spoken(cues)).toEqual(['tick', 'tick', 'tick', 'tick', 'final']);
  });
});

describe('purity', () => {
  it('does not mutate the latch it is given', () => {
    const latch: CueLatch = { armedFor: 'rest:1', spokenSecond: 5, spokeFinal: false };
    const frozen = { ...latch };

    nextCue(latch, { id: 'rest:1', secondsLeft: 4, ...DEFAULTS });
    expect(latch).toEqual(frozen);
  });

  it('is deterministic for the same latch and input', () => {
    const latch: CueLatch = { armedFor: 'rest:1', spokenSecond: 5, spokeFinal: false };
    const input = { id: 'rest:1', secondsLeft: 4, ...DEFAULTS };

    expect(nextCue(latch, input)).toEqual(nextCue(latch, input));
  });
});
