/**
 * App entry — providers, the notification handler, and the shell.
 *
 * Everything about WHICH screen is showing lives in `src/navigation/AppShell`;
 * everything about WHAT the data is still comes from `src/data/seed`. Swap
 * `seedHistoryByExerciseId` and friends for SQLite/Drizzle queries and neither
 * this file nor any screen below it changes: they already speak the real types.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import './global.css';
import { AppShell } from './src/navigation/AppShell';

// Timer alerts — rest ending, and the bell on a timed hold — must show even with
// the app foregrounded: the phone is usually face-up on a bench or on the floor
// under a plank, not in the user's hand.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: false,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  useEffect(() => {
    void Notifications.requestPermissionsAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <View className="flex-1 bg-bg">
        <AppShell />
      </View>
    </SafeAreaProvider>
  );
}
