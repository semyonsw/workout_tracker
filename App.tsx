/**
 * App entry — providers, the boundary, the notification handler, and the shell.
 *
 * Everything about WHICH screen is showing lives in `src/navigation/AppShell`;
 * everything about WHAT the data is lives in the three stores under `src/state`
 * (the library and routines, the settings, the finished workouts). Swap those for
 * SQLite queries and neither this file nor any screen below it changes: they
 * already speak the real types.
 *
 * The three side effects set up here are all "make the phone able to reach the
 * user", and all three are allowed to fail:
 *
 *   • the notification handler, which decides what a timer alert does when it
 *     arrives with the app already on screen
 *   • the Android notification channels, without which a scheduled alert on
 *     Android 8+ has no sound, no vibration, and nothing the user can tune — and
 *     which is where the app's own two tones are attached, because on Android the
 *     sound belongs to the channel and not to the notification
 *   • the audio session, so the countdown's beeps play over their music and
 *     through a silent switch
 *
 * None of them are load-bearing: the on-screen pill derives from a stored
 * deadline and is correct whether or not any of this works.
 */

import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import './global.css';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AppShell } from './src/navigation/AppShell';
import { prepareAudio } from './src/lib/beeper';
import { ensureTimerChannels, requestNotificationPermission } from './src/lib/notify';

/*
 * Timer alerts — rest ending, and the bell on a timed hold.
 *
 * The alert is a BACKUP for a phone that isn't being looked at, so it stays
 * silent while the app is in the foreground: the pill already counted the last
 * seconds out loud and buzzed at zero, and adding the notification's own sound on
 * top of that is the same event announced twice — which is heard as the countdown
 * beeping more times than it counted.
 *
 * Backgrounded, it is the only thing that can reach the user, so it gets the
 * banner and the sound.
 *
 * Wrapped because this runs at module scope, before any boundary exists. A throw
 * here would be a crash on launch with no screen to report it on.
 */
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const foreground = AppState.currentState === 'active';
      return {
        shouldShowBanner: !foreground,
        shouldShowList: false,
        shouldPlaySound: !foreground,
        shouldSetBadge: false,
      };
    },
  });
} catch {
  // Alerts will be silent-but-scheduled, or absent. The pill is unaffected.
}

export default function App() {
  useEffect(() => {
    void requestNotificationPermission();
    void ensureTimerChannels();
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
