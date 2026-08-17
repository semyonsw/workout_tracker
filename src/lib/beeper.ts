/**
 * The beeper — the last five seconds of any countdown, out loud.
 *
 *   rest 2:00   ...  0:05  0:04  0:03  0:02  0:01   0:00
 *                     ·     ·     ·     ·     ·      ▔▔▔
 *                    tick  tick  tick  tick  tick   GO
 *
 * Why this exists at all: a haptic buzz is useless when the phone is face-up on
 * a bench three feet away, and a notification arrives at zero — which is a beat
 * too late to be standing under the bar. The count-in is the whole point: you
 * hear five, you get set, you go on the long tone.
 *
 * Design notes worth keeping:
 *
 *  • TWO TONES, NOT ONE LOUDER. The tick is 880 Hz / 110 ms; the final tone is
 *    1320 Hz / 420 ms. A count-in you can identify without counting is one you
 *    can act on while looking at the ceiling.
 *  • TWO PLAYERS, NOT ONE. A shared player would have to seek back to zero
 *    between a tick and the final tone, and at a one-second cadence that race is
 *    audible as a swallowed beep.
 *  • ONE CUE IS ONE SOUND. Two independent things used to be able to turn one cue
 *    into two audible beeps, which is what made the count-in sound like it was
 *    counting faster than the clock:
 *      – REWIND WHILE PLAYING. `seekTo(0)` was fired and not awaited, so a seek
 *        that resolved while the 110 ms tick was still sounding restarted it
 *        mid-tail. The player is paused first now, and `play()` waits for the
 *        rewind (see `restart`).
 *      – THE SAME CUE ARRIVING TWICE. Any caller can double-fire — a remounted
 *        pill, an effect that runs again, two countdowns landing on the same
 *        instant — and no amount of care upstream can prove it never happens. So
 *        the floor is enforced HERE: a cue of the same kind inside `MIN_GAP_MS`
 *        is the same cue and is dropped. The cadence is one per second, so the
 *        gap is far below anything real.
 *  • IT NEVER THROWS. Audio is the least important thing in a gym app: if the
 *    native module is missing, the session is muted by the OS, or the player was
 *    released under us, the workout must carry on in silence. Every entry point
 *    here is wrapped, and failures are latched so a broken device doesn't retry
 *    on every tick.
 *  • Playback is `mixWithOthers`: people train to music, and an app that pauses
 *    their playlist to say "four" is an app they mute.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { beepSource } from './beepSources';

export type BeepKind = 'tick' | 'final';

const players: Partial<Record<BeepKind, AudioPlayer>> = {};
/** Set once audio has proven unusable on this device — stops per-tick retries. */
let disabled = false;
let audioModeRequested = false;

/**
 * Two cues of the same kind closer together than this are the same cue arriving
 * twice, and the second one is dropped.
 *
 * 220 ms: comfortably longer than the 110 ms tick (so a duplicate can never be
 * heard as a stutter) and comfortably shorter than the one-second cadence a real
 * count-in runs at (so no legitimate cue is ever swallowed).
 */
const MIN_GAP_MS = 220;
const lastPlayedAt: Partial<Record<BeepKind, number>> = {};

/**
 * Put the audio session in the right mode for short cues.
 *
 * Safe to call more than once, and safe to never call at all — a beep works
 * without it, just with the wrong interruption behaviour. Called from the app
 * entry so the first beep of a session doesn't pay for the setup.
 */
export async function prepareAudio(): Promise<void> {
  if (audioModeRequested || disabled) return;
  audioModeRequested = true;
  try {
    await setAudioModeAsync({
      // Someone counting down a plank has their phone on silent more often than
      // not. The cue has to survive that or it isn't a cue.
      playsInSilentMode: true,
      // Duck nothing, pause nothing: their music keeps playing.
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // Wrong mode is survivable; a thrown error mid-workout is not.
  }
}

function playerFor(kind: BeepKind): AudioPlayer | null {
  if (disabled) return null;
  const existing = players[kind];
  if (existing) return existing;
  try {
    const player = createAudioPlayer(beepSource(kind) as never);
    player.volume = 1;
    players[kind] = player;
    return player;
  } catch {
    // No audio module, no decoder, no memory — whatever it was, stop trying.
    disabled = true;
    return null;
  }
}

/**
 * Play one cue. Fire-and-forget by design: nothing upstream should ever await a
 * beep, and nothing should branch on whether it was audible.
 *
 * Duplicate cues inside `MIN_GAP_MS` are dropped — see the file header.
 */
export function playBeep(kind: BeepKind): void {
  const now = Date.now();
  if (now - (lastPlayedAt[kind] ?? 0) < MIN_GAP_MS) return;

  const player = playerFor(kind);
  if (!player) return;
  lastPlayedAt[kind] = now;
  void restart(player);
}

/**
 * Rewind to the start, then play.
 *
 * The rewind is unconditional because the previous cue may still be mid-tail;
 * `play()` on a finished player would otherwise be a no-op at the end position.
 * The ORDER is what matters: pause, then wait for the seek, then play. Seeking a
 * sounding player and playing without waiting lets the seek land mid-tail and
 * restart the tone — one cue, two beeps.
 */
async function restart(player: AudioPlayer): Promise<void> {
  try {
    player.pause();
  } catch {
    // Nothing was playing, or the player is gone. Either way, try to play.
  }
  try {
    await player.seekTo(0);
  } catch {
    // A player that cannot seek can still make a sound from wherever it is.
  }
  try {
    player.play();
  } catch {
    // A released or busy player is not a reason to interrupt a set.
  }
}

/**
 * Release both players.
 *
 * Not wired to a component: the players are process-scoped on purpose (they
 * outlive every screen and are reused across sessions). This exists for the
 * error-boundary reset path, where the safest assumption is that native state is
 * suspect and should be rebuilt from scratch.
 */
export function releaseBeeper(): void {
  for (const kind of Object.keys(players) as BeepKind[]) {
    try {
      players[kind]?.remove();
    } catch {
      // Already gone.
    }
    delete players[kind];
    delete lastPlayedAt[kind];
  }
  disabled = false;
  audioModeRequested = false;
}
