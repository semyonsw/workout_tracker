/**
 * Where the two tones come from.
 *
 * One line per sound, in its own file, for one reason: this is the only part of
 * the beeper that depends on the BUNDLER rather than on audio.
 * `require('…/beep.wav')` is a Metro asset reference — it evaluates to the module
 * id `createAudioPlayer` wants, and it is exactly what every React Native asset
 * lookup in the ecosystem looks like. Nothing else can resolve it: Vitest reads
 * the specifier and tries to parse 9 KB of RIFF header as JavaScript.
 *
 * Keeping it here means `beeper.ts` — which holds the behaviour that was actually
 * broken, and is now tested — can be exercised with this module mocked, while the
 * app keeps the asset resolution that is known to work on the phone. The lookup
 * stays lazy: the WAVs are decoded the first time something beeps, not at import.
 *
 * The file names are `beep_tick` / `beep_final`, with underscores, because the same
 * two files are ALSO shipped as Android notification sounds (see `NOTIFICATION_SOUND`
 * in `lib/notify.ts`), and an Android resource name cannot contain a hyphen.
 */

import type { BeepKind } from './beeper';

export function beepSource(kind: BeepKind): unknown {
  return kind === 'tick'
    ? require('../../assets/beep_tick.wav')
    : require('../../assets/beep_final.wav');
}
