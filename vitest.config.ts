/**
 * Vitest config.
 *
 * `lib/` is pure and needs nothing. The STORES are worth testing too — a bad
 * rehydration and an unstable selector were both crashes on the logging screen —
 * and they reach `@react-native-async-storage/async-storage`, which cannot load
 * outside a native runtime. One alias to an in-memory stub buys the whole state
 * layer without pulling in a React Native test harness.
 *
 * Nothing here mocks `react-native` itself, deliberately: a test that needs it is
 * a test of a component, and components are verified by running the app.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@react-native-async-storage/async-storage': resolve(
        __dirname,
        'test/asyncStorageStub.ts',
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
