import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The asset lookup is the one part of the beeper that only Metro can do — see
 * `beepSources.ts`. Mocked to an opaque token, which is all the player ever does
 * with it.
 */
vi.mock('./beepSources', () => ({ beepSource: (kind: string) => `asset:${kind}` }));

import { playBeep, prepareAudio, releaseBeeper } from './beeper';
import * as audioModule from 'expo-audio';
import type { FakePlayer } from '../../test/expoAudioStub';

/*
 * Reached through the same specifier `beeper.ts` uses, not through a relative path
 * to the stub file. On Windows the two resolve to strings that differ in drive-
 * letter case and separators, which loads the stub TWICE — and then the test
 * inspects a player list nothing ever wrote to.
 */
const stub = audioModule as unknown as typeof import('../../test/expoAudioStub');
const { createdPlayers, resetAudioStub } = stub;

/**
 * The bug these tests exist for.
 *
 * The count-in beeped more times than the countdown counted. Two independent
 * causes, both of them in this file rather than in the (pure, already-tested) rule
 * about WHEN a countdown should speak:
 *
 *  1. `seekTo(0)` was fired without being awaited and then `play()` called
 *     immediately, so a rewind that landed while the 110 ms tone was still
 *     sounding restarted it — one cue, two beeps.
 *  2. Nothing stopped the same cue arriving twice. Callers can double-fire for
 *     reasons no amount of care upstream rules out, so the floor is enforced here.
 */

/** Wait for the fire-and-forget `restart()` chain to finish. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function player(index = 0): FakePlayer {
  const found = createdPlayers[index];
  if (!found) throw new Error(`no player at ${index}`);
  return found;
}

function methods(index = 0): string[] {
  return player(index).calls.map((c) => c.method);
}

beforeEach(() => {
  releaseBeeper();
  resetAudioStub();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-17T17:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  releaseBeeper();
});

/* ------------------------------------------------------------------ */

describe('one cue is one sound', () => {
  it('rewinds before it plays, and waits for the rewind', async () => {
    playBeep('tick');
    await flush();

    // pause → seekTo → play, in that order. `play` before `seekTo` resolves is
    // the race that doubled the beep.
    expect(methods()).toEqual(['pause', 'seekTo', 'play']);
  });

  it('drops a duplicate cue that arrives immediately after', async () => {
    playBeep('tick');
    await flush();
    // The same tick, twice, from two callers in the same frame.
    playBeep('tick');
    await flush();

    expect(methods().filter((m) => m === 'play')).toHaveLength(1);
  });

  it('plays every cue of a real count-in — one per second', async () => {
    for (let second = 5; second >= 1; second -= 1) {
      playBeep('tick');
      await flush();
      vi.advanceTimersByTime(1000);
    }
    playBeep('final');
    await flush();

    // Five ticks and the long tone: exactly what "beep the last 5 seconds" means.
    expect(methods(0).filter((m) => m === 'play')).toHaveLength(5);
    expect(methods(1).filter((m) => m === 'play')).toHaveLength(1);
  });

  it('does not let the tick and the final tone silence each other', async () => {
    // 0:01 then 0:00 — under the duplicate window, but two different cues.
    playBeep('tick');
    await flush();
    vi.advanceTimersByTime(100);
    playBeep('final');
    await flush();

    expect(createdPlayers).toHaveLength(2);
    expect(methods(0)).toContain('play');
    expect(methods(1)).toContain('play');
  });

  it('one player per kind, reused for every cue', async () => {
    playBeep('tick');
    await flush();
    vi.advanceTimersByTime(1000);
    playBeep('tick');
    await flush();

    expect(createdPlayers).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */

describe('audio never takes a set down with it', () => {
  it('still plays when the rewind fails', async () => {
    playBeep('tick');
    await flush();
    player().failSeek = true;

    vi.advanceTimersByTime(1000);
    playBeep('tick');
    await flush();

    // A player that cannot seek can still make a sound from wherever it is;
    // silence would be the worse failure.
    expect(methods().filter((m) => m === 'play')).toHaveLength(2);
  });

  it('gives up quietly when there is no audio module at all', async () => {
    releaseBeeper();
    resetAudioStub({ failCreate: true });

    expect(() => playBeep('tick')).not.toThrow();
    expect(() => playBeep('final')).not.toThrow();
    await flush();
    expect(createdPlayers).toHaveLength(0);
  });

  it('prepareAudio is safe to call more than once and never throws', async () => {
    await expect(prepareAudio()).resolves.toBeUndefined();
    await expect(prepareAudio()).resolves.toBeUndefined();
  });

  it('releasing clears the players and the duplicate guard', async () => {
    playBeep('tick');
    await flush();
    releaseBeeper();

    // A cue immediately after a release is not a duplicate of anything: the
    // error-boundary reset path rebuilds native state from scratch.
    playBeep('tick');
    await flush();

    expect(createdPlayers).toHaveLength(2);
    expect(methods(1)).toContain('play');
  });
});
