/**
 * Vitest config.
 *
 * `lib/` is pure and needs nothing. The STORES are worth testing too — a bad
 * rehydration and an unstable selector were both crashes on the logging screen —
 * and they reach `@react-native-async-storage/async-storage`, which cannot load
 * outside a native runtime. One alias to an in-memory stub buys the whole state
 * layer without pulling in a React Native test harness.
 *
 * HISTORY moved to SQLite in 0.12.0, which needs a third alias — see the note on
 * it below. It is the one stub in here backed by a real engine.
 *
 * The BEEPER earns the same treatment for the same reason: it is the file that
 * turned one cue into two audible beeps, the bug is about the order and the timing
 * of calls into a native player, and that is exactly what a stub can assert and a
 * human ear cannot. That needs one more alias, for the native audio module; the
 * asset requires are handled by mocking `lib/beepSources` in the suite itself,
 * because an alias does not reach a `require()` specifier — only an `import`.
 *
 * Nothing here mocks `react-native` itself, deliberately: a test that needs it is
 * a test of a component, and components are verified by running the app.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@react-native-async-storage/async-storage',
        replacement: resolve(__dirname, 'test/asyncStorageStub.ts'),
      },
      { find: 'expo-audio', replacement: resolve(__dirname, 'test/expoAudioStub.ts') },
      /*
       * `expo-sqlite` gets an alias for the same reason the other two do — it
       * cannot load outside a native runtime — but the stub behind it is different
       * in kind: it is a thin adapter over Node 22's own `node:sqlite`, so the
       * schema, the index, the constraints and every query run for real. A migration
       * whose failure mode is losing somebody's training log is the last thing that
       * should be verified against an imitation of a database.
       */
      { find: 'expo-sqlite', replacement: resolve(__dirname, 'test/expoSqliteStub.ts') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
