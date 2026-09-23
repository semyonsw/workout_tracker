/**
 * App entry — providers, the boundary, the notification handler, and the shell.
 *
 * Everything about WHICH screen is showing lives in `src/navigation/AppShell`;
 * everything about WHAT the data is lives in the three stores under `src/state`
 * (the library and routines, the settings, the finished workouts).
 *
 * That paragraph used to end "swap those for SQLite queries and neither this file
 * nor any screen below it changes". As of 0.12.0 the finished workouts DID move to
 * SQLite (`src/state/historyDb.ts`) and the claim held: no screen changed, and the
 * only line this file gained is the one below that brings the old AsyncStorage log
 * across. The other two stores are a few dozen rows and stay where they are.
 *
 * The side effects set up here are all "make the phone able to reach the user" —
 * plus, now, one storage migration — and every one of them is allowed to fail:
 *
 *   • the notification handler, which decides what a timer alert does when it
 *     arrives with the app already on screen
 *   • the Android notification channels, without which a scheduled alert on
 *     Android 8+ has no sound, no vibration, and nothing the user can tune — and
 *     which is where the app's own two tones are attached, because on Android the
 *     sound belongs to the channel and not to the notification
 *   • the audio session, so the countdown's beeps play over their music and
 *     through a silent switch
 *   • the HISTORY RE-READ, which gives the log a second chance to load from a point
 *     where every native module is up — see the note on it below, and
 *     `workoutHistoryStore.loadWorkouts`
 *   • the HISTORY MIGRATION, which brings a log written by 0.10.0 or earlier out of
 *     AsyncStorage and into the database. It runs once, it never deletes the old
 *     key, and it stays quiet either way: a migration that could not run tries
 *     again next launch, and a dialog on launch about a storage system the user has
 *     never heard of is worse than a History tab that fills itself in tomorrow.
 *   • the REMINDER SYNC, which makes Android's notification queue match the tasks
 *     that asked to speak and the workout schedule. Also here rather than in a
 *     screen, and also silent: a reminder that cannot be armed — no permission,
 *     exact alarms refused — must not become a dialog in front of somebody who
 *     opened the app to train, and the settings screen reports it instead.
 *   • the AUTOMATIC BACKUP, which writes the whole log into a folder the user has
 *     granted, if the last copy is old enough. Here because launch is the only
 *     moment a sideloaded app can reliably run anything (see `lib/notify.ts` on
 *     why), and silent because a backup that cannot write must not become a modal
 *     in front of somebody who opened the app to train — the Settings row and the
 *     Finish sheet report the age instead. `hooks/useAutoBackup.ts` has the rest.
 *
 * None of them are load-bearing: the on-screen pill derives from a stored
 * deadline and is correct whether or not any of this works, and the log already on
 * disk is read synchronously before the first render whatever the migration does.
 */

import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import './global.css';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AppShell } from './src/navigation/AppShell';
import { LanguageChoiceScreen } from './src/screens/LanguageChoiceScreen';
import { useSettingsHydrated } from './src/hooks/useHydrated';
import { useSettings } from './src/state/settingsStore';
import { prepareAudio } from './src/lib/beeper';
import { ensureTimerChannels, requestNotificationPermission } from './src/lib/notify';
import { migrateHistoryIfNeeded, useWorkoutHistory } from './src/state/workoutHistoryStore';
import { useAutoBackup } from './src/hooks/useAutoBackup';
import { useAutoRounds } from './src/hooks/useAutoRounds';
import { useReminders } from './src/hooks/useReminders';
import { useTimerAlerts } from './src/hooks/useTimerAlerts';

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
  /*
   * Mounted here, at the top, rather than inside a screen: it must run on the
   * launches where the user never opens Settings, which is all of them.
   */
  useAutoBackup();
  /*
   * Same argument, for the same reason: a reminder the user set has to be armed
   * on the launches where they never open the tasks section, which is most of
   * them. `hooks/useReminders.ts` has the rest.
   */
  useReminders();

  useEffect(() => {
    void requestNotificationPermission();
    void ensureTimerChannels();
    // Warmed here rather than on the first beep, so 0:05 of a plank isn't where
    // the audio session gets configured.
    void prepareAudio();
    /*
     * READ THE LOG AGAIN, now that React is running.
     *
     * The log is read once at module scope, during bundle evaluation, so that
     * History does not flicker from empty to full on every launch — see
     * `historyDb.ts`. The cost of reading it that early is that it is the one
     * moment a native module may not be ready: a release build resolves its
     * TurboModules lazily, nothing has mounted, and if the open throws there is
     * nobody to tell. The store caught that throw and started empty, which is
     * indistinguishable on screen from having never trained.
     *
     * This is the second attempt, from a point where that cannot happen. It is a
     * no-op-shaped few milliseconds when the first read worked, and it is the
     * difference between "the app forgot my history" and not, when it did not.
     */
    useWorkoutHistory.getState().reloadHistory();
    /*
     * Once, on the first launch after upgrading. In an effect rather than at module
     * scope because it is async and it touches two storage systems, and a side
     * effect that size hiding inside an import is how a launch crash becomes hard
     * to place.
     */
    void migrateHistoryIfNeeded();
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
          <Root />
        </ErrorBoundary>
      </View>
    </SafeAreaProvider>
  );
}

/**
 * The language question, then the app.
 *
 * Its own component rather than a branch in `App`, because the branch has to
 * re-render when the store hydrates and when the language is answered — and
 * `App` is where the launch effects live, which must run once and not again.
 *
 * NOTHING until the store has been read: the picker's whole correctness rests on
 * `languageChosen`, and that flag reads false for a frame or two on every launch
 * while `persist` is still reading from disk (`useSettingsHydrated`). A bare
 * background for those two frames is the app's own colour, so it reads as the
 * splash rather than as a blank screen.
 *
 * ── IT IS A LAUNCH SCREEN, SO IT ONLY EVER APPEARS AT LAUNCH ──────────────
 *
 * The question is asked because of what was on disk when the app opened, and
 * that answer is latched the moment hydration finishes. Reading the flag live
 * instead would let it go false again mid-session — importing a backup written
 * before the picker existed does exactly that — and a launch screen arriving on
 * top of somebody who is three taps into Settings is worse than asking them
 * again next time they open the app, which is what latching gets us.
 */
function Root() {
  const hydrated = useSettingsHydrated();
  /** Null until hydration; then fixed for the life of this launch. */
  const [asking, setAsking] = useState<boolean | null>(null);

  useEffect(() => {
    if (hydrated) setAsking((current) => current ?? !useSettings.getState().languageChosen);
  }, [hydrated]);

  const chosen = useSettings((s) => s.languageChosen);

  if (!hydrated || asking === null) return <View className="flex-1 bg-bg" />;
  // `chosen` is still read live, for the one transition that has to be instant:
  // the tap on the picker itself.
  if (asking && !chosen) return <LanguageChoiceScreen />;
  return (
    <>
      <SessionClock />
      <AppShell />
    </>
  );
}

/**
 * The parts of a running workout that must not depend on which screen is up.
 *
 * The shell renders only the top of its stack, so anything mounted inside the
 * session screen stops the moment `Add an exercise` is pushed over it or the user
 * backs out to Home mid-rest. Two things cannot afford that: the pocket alarms
 * (`useTimerAlerts`) and the boxing round chain (`useAutoRounds`) — both read the
 * store and the clock and nothing on screen. A sibling rendering nothing rather
 * than hooks inside `AppShell`, so a rest starting re-renders this and not the
 * whole app.
 */
function SessionClock() {
  useTimerAlerts();
  useAutoRounds();
  return null;
}
