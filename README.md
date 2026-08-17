# workout_tracker

A minimal, local-first workout tracker built around one rule: **logging a set
that repeats last session costs one tap.**

- **Stack** — Expo (React Native) + TypeScript + NativeWind + Zustand + SQLite/Drizzle
- **Design** — near-black + a single green scale, hairlines, tabular numerals,
  five type sizes, two radii, and exactly one shadow. Colour means one thing:
  progressive overload.
- **Features** — customizable routines, a rolling split timeline, weighted and
  unweighted exercises, background-safe rest timers you can **pause, extend or
  skip**, an **audible count-in over the last seconds of every countdown**,
  overload nudges derived from real set history, **timed sets** (a get-ready
  count, then a countdown or an open hold — planks, dead hangs, boxing rounds),
  a **browsable muscle tree** (`push → chest → dips`) with add and delete per
  group, and a **Settings** tab where every duration the app counts is yours

See [ARCHITECTURE.md](ARCHITECTURE.md) for the stack rationale, data model,
design system and overload rules.

```bash
npx expo install --fix   # align deps with the installed Expo SDK
npx expo start           # dev server
npm test                 # overload engine, timers, count-in, muscle tree, stores
npm run typecheck
```

## Android APK

The app is Android-only and ships as a sideloaded APK — no store, no Expo
account. See **[BUILD_ANDROID.md](BUILD_ANDROID.md)** for how to install it on a
phone, how to rebuild, and — importantly — where the signing keystore lives and
why losing it costs you your workout history.

```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

## Screens

Fourteen states, implemented from the design handoff in
`design_handoff_workout_tracker/`:

| | |
| --- | --- |
| 01–04 | Active workout — primed row, overload nudge, inline editor, rest timer (running and final ten) |
| 05–06 | Rounds and reps-only variants: the weight cell is *absent*, not disabled |
| 07 | Finish-workout sheet |
| 08 | Home — rolling split timeline, today's card, recent sessions |
| 09–10 | Routine editor, and its reorder mode |
| 11 | Exercise library / search, with create-from-query inline |
| 12–13 | Create exercise — `Requires weight` on and off, which changes which inputs exist |
| 14 | Exercise history — top working weight per session |

Built on top of those, in the same system:

| | |
| --- | --- |
| Timed sets | ▶ on the set row, a get-ready count, then a countdown that logs itself at the bell or an open hold you stop — one floating pill shared with the rest timer |
| Count-in | the last N seconds of any countdown tick out loud and land on a long tone; a haptic buzz doesn't travel to a phone on a bench, and a notification arrives too late to get set |
| Rest controls | `+15`, `⏸` and `Skip` on the pill. Pausing freezes the clock and keeps the pill; skipping ends rest. Both work on the between-exercises rest too |
| Muscle tree | the library opens `push → chest → dips`, with `+ Add exercise to chest` and a `−` delete on every row |
| Settings | rest between sets and between exercises, get-ready length, how many seconds beep, the ± step, and switches for sound, vibration, screen-on and notifications |

## Layout

```
App.tsx                     providers, the error boundary, notifications, audio
src/navigation/AppShell     four tabs and a stack; no tab bar during a session
src/screens/                one file per screen, all plain props-and-callbacks
src/components/             SetRow, ExerciseCard, the timer pills, primitives,
                            ErrorBoundary, ConfirmSheet…
src/hooks/                  the two timers and the count-in
src/lib/                    the decisions: overload, set timer, count-in cue,
                            muscles, draft, history, shape, units — all pure,
                            all tested. Plus beeper/notify/feedback, the three
                            wrappers around native side effects that must never
                            throw mid-set
src/state/                  the live session, the library, the settings
                            (zustand + AsyncStorage, all three validated on
                            rehydration)
src/data/seed.ts            real logged sessions, used until SQLite is wired
src/theme/tokens.ts         the values className can't reach
plugins/                    Expo config plugins (release signing)
test/                       AsyncStorage stub, so the stores are testable
```

Not yet wired: finished sessions are logged to the console rather than written
to SQLite, and history + the split are still fixtures. Everything else persists —
an in-progress session survives a force-quit, and exercises, routines and
settings survive a reinstall-free relaunch. See the end of
[BUILD_ANDROID.md](BUILD_ANDROID.md).
