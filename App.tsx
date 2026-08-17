/**
 * App entry — providers, the boundary, the notification handler, and the shell.
 *
 * Everything about WHICH screen is showing lives in `src/navigation/AppShell`;
 * everything about WHAT the data is now lives in `src/state/libraryStore` (the
 * exercises and routines) and `src/data/seed` (the history and the split, still
 * fixtures). Swap those for SQLite/Drizzle queries and neither this file nor any
 * screen below it changes: they already speak the real types.
 *
 * The three side effects set up here are all "make the phone able to reach the
 * user", and all three are allowed to fail:
 *
 *   • the notification handler, so a timer alert shows with the app foregrounded
 *   • the Android notification channel, without which a scheduled alert on
 *     Android 8+ has no sound, no vibration, and nothing the user can tune
 *   • the audio session, so the countdown's beeps play over their music and
 *     through a silent switch
 *
 * None of them are load-bearing: the on-screen pill derives from a stored
 * deadline and is correct whether or not any of this works.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import './global.css';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AppShell } from './src/navigation/AppShell';
import { prepareAudio } from './src/lib/beeper';
import { ensureTimerChannel, requestNotificationPermission } from './src/lib/notify';

/*
 * Timer alerts — rest ending, and the bell on a timed hold — must show even with
 * the app foregrounded: the phone is usually face-up on a bench or on the floor
 * under a plank, not in the user's hand.
 *
 * Wrapped because this runs at module scope, before any boundary exists. A throw
 * here would be a crash on launch with no screen to report it on.
 */
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Alerts will be silent-but-scheduled, or absent. The pill is unaffected.
}

export default function App() {
  useEffect(() => {
    void requestNotificationPermission();
    void ensureTimerChannel();
    // Warmed here rather than on the first beep, so 0:05 of a plank isn't where
    // the audio session gets configured.
    void prepareAudio();
  }, []);

  return (
    <SafeAreaProvider>
      <View className="flex-1 bg-bg">
        {/*
          Inside the provider, outside the shell: a crash in any screen lands on a
          readable error with a way out, instead of taking the process down. The
          session is persisted, so without this a crash on the logging screen
          repeats on every launch — see `ErrorBoundary`.
        */}
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      </View>
    </SafeAreaProvider>
  );
}
