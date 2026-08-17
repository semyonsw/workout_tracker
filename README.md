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
  group, a **History** tab holding every workout you have finished, and a
  **Settings** tab where every duration the app counts is yours

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
| Rest controls | `+15`, `⏸` and `Skip` on the pill, which names the rest it is running (`BETWEEN SETS` / `NEXT EXERCISE`). Both lengths come from Settings, live. `Rest 2:00` in the card footer starts one by hand |
| Out-of-app cue | with the app off screen the count-in is a pair of scheduled notifications — a tick 5 s out, the long tone at zero — carrying the app's own WAVs on their own channels, because a JS interval does not survive Doze or a swipe-away |
| Pick your session | the split SUGGESTS today and every routine is one tap from starting, from the home screen or the ▶ on a `Routines` row. A rest day is not a locked door |
| Build a routine | `+ Add routine` makes one and opens it on its name; add exercises from the library, reorder by long-press, Save. Backing out of one you never filled in removes it again |
| New exercise | every number on the create screen is adjustable in place — tap `DEFAULT KG` or `TARGET REPS` for the same ± chips a set row gives you. Weight steps by ±1 and ±10, so 16 kg is two taps and every whole kilo is reachable. Those two numbers are where the movement STARTS: its first session is prefilled with them, and history takes over from the second |
| Edit an exercise | tap it anywhere → `Edit` in the header → the same screen it was created on. Name, muscles, weight, target, load mode, timer, increment. The row is replaced in place, so a rename keeps every set ever logged against it |
| History | every finished workout, newest first, grouped by month: date, duration, sets, volume, and each exercise in the shorthand the rest of the app uses. Its sets feed the next session's prefills and the overload nudges |
| Muscle tree | the library opens `push → chest → dips`, with `+ Add exercise to chest` and a `−` delete on every row |
| Settings | rest between sets and between exercises, get-ready length, how many seconds beep, the ± step, and switches for sound, vibration, screen-on and notifications |

## Layout

```
App.tsx                     providers, the error boundary, notifications, audio
src/navigation/AppShell     five tabs and a stack; no tab bar during a session
src/screens/                one file per screen, all plain props-and-callbacks
src/components/             SetRow, ExerciseCard, the timer pills, primitives,
                            ErrorBoundary, ConfirmSheet…
src/hooks/                  the two timers and the count-in
src/lib/                    the decisions: overload, set timer, count-in cue,
                            muscles, draft, completed workout, history, shape,
                            units — all pure, all tested. Plus
                            beeper/notify/feedback, the three wrappers around
                            native side effects that must never throw mid-set
src/state/                  the live session, the finished workouts, the library,
                            the settings (zustand + AsyncStorage, all four
                            validated on rehydration)
src/data/seed.ts            the starting library, routines and split. NO history:
                            everything in History is what you logged
test/fixtures/history.ts    a real training log, as a test fixture only
src/theme/tokens.ts         the values className can't reach
plugins/                    Expo config plugins (release signing)
test/                       AsyncStorage stub, so the stores are testable
```

Everything the user does now persists: finished workouts (History), an
in-progress session across a force-quit, and exercises, routines and settings
across a relaunch — all of it AsyncStorage, in the shapes `src/db/schema.ts`
already models. A fresh install starts with **no history at all**; the only
fixture left is the split, whose cursor does not yet advance when a workout
completes. See the end of [BUILD_ANDROID.md](BUILD_ANDROID.md).
