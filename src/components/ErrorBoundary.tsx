/**
 * ErrorBoundary — the difference between a bug and "Workout Tracker keeps
 * stopping".
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ SOMETHING BROKE                              │
 *   │ The screen below this one crashed. Your       │
 *   │ logged sets are saved.                        │
 *   │ ╭──────────────────────────────────────────╮ │
 *   │ │ TypeError: Cannot read property 'x' of…  │ │
 *   │ │   at ExerciseCard (ExerciseCard.tsx:74)  │ │
 *   │ ╰──────────────────────────────────────────╯ │
 *   │ ╭─────────────── Try again ───────────────╮  │
 *   │ ╰──── Discard the workout and restart ────╯  │
 *   └──────────────────────────────────────────────┘
 *
 * Why this exists, and why it shows a stack trace to a lifter:
 *
 * In a release build there is no red box. An uncaught render error takes the
 * whole process down, and Android offers "App info / Close app" — which tells
 * nobody anything. Worse, the live session is PERSISTED: if the crash is in the
 * logging screen, the next launch rehydrates that session, navigates straight
 * back to it, and dies again. That is a crash LOOP, and it is unrecoverable
 * without clearing app data.
 *
 * So this component does three things a bare boundary wouldn't:
 *
 *  1. It shows the actual message and the top of the stack. Ugly on purpose:
 *     "something went wrong" is unactionable, whereas a file and a line is a bug
 *     report the user can screenshot.
 *  2. `Try again` remounts the tree. Enough for a transient failure — a race on a
 *     timer, a half-written store — without losing the session.
 *  3. `Discard the workout` clears the persisted session before remounting. This
 *     is the escape hatch from the loop above, and it is the SECOND button rather
 *     than the first because it throws a workout away.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { releaseBeeper } from '../lib/beeper';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { Kicker, PrimaryButton } from './primitives';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Where React says it broke — more useful than the JS stack for render bugs. */
  componentStack: string | null;
  /** Bumped on recovery to force a fresh subtree rather than a repaired one. */
  generation: number;
}

/** Enough stack to name the component and its parent; more is unreadable. */
const STACK_LINES = 8;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null, generation: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Goes to logcat, which is what `adb logcat -s ReactNativeJS` will show if
    // this ever needs diagnosing from a connected device.
    console.error('[ErrorBoundary]', error?.message, info?.componentStack);
    this.setState({ componentStack: info?.componentStack ?? null });
  }

  private retry = () => {
    this.setState((s) => ({ error: null, componentStack: null, generation: s.generation + 1 }));
  };

  private discardAndRetry = () => {
    /*
     * Order matters: clear the in-memory session first so the remount can't read
     * it back, then wipe the persisted copy so the NEXT cold launch is clean too.
     * Both are best-effort — if the store itself is the broken thing, remounting
     * without a session is still an improvement on a crash loop.
     */
    try {
      useActiveWorkout.getState().discardSession();
    } catch {
      // Nothing more to try; the clear below is the real fix.
    }
    void Promise.resolve(useActiveWorkout.persist?.clearStorage?.()).catch(() => {});
    // Native audio players are the one thing here that survives a remount, and a
    // crash is decent evidence that native state is suspect.
    releaseBeeper();
    this.retry();
  };

  render() {
    const { error, componentStack, generation } = this.state;

    if (!error) {
      // The key is what makes `Try again` a genuine remount: same element type,
      // new identity, so every child rebuilds its state from scratch.
      return <View key={generation} className="flex-1">{this.props.children}</View>;
    }

    const stack = (componentStack ?? error.stack ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, STACK_LINES)
      .join('\n');

    return (
      <View className="flex-1 bg-bg px-lg pt-xxl">
        <Kicker>Something broke</Kicker>

        <Text className="mt-md text-title font-medium text-ink">
          The screen below this one crashed.
        </Text>
        <Text className="mt-sm text-body text-ink-muted">
          Sets you already logged are saved. Try again first — discard the workout only if it
          crashes straight back to here.
        </Text>

        <ScrollView
          className="mt-xl max-h-[280px] rounded-surface border border-hairline bg-surface"
          contentContainerStyle={{ padding: 16 }}
        >
          <Text className="text-label font-semibold text-green-bright">
            {error.name}: {error.message}
          </Text>
          {stack ? <Text className="mt-sm text-label text-ink-faint">{stack}</Text> : null}
        </ScrollView>

        <View className="mt-xl">
          <PrimaryButton label="Try again" onPress={this.retry} />
          <View className="h-sm" />
          <PrimaryButton
            label="Discard the workout and restart"
            variant="ghost"
            onPress={this.discardAndRetry}
          />
        </View>
      </View>
    );
  }
}
