# workout_tracker

A minimal, local-first workout tracker built around one rule: **logging a set
that repeats last session costs one tap.**

- **Stack** — Expo (React Native) + TypeScript + NativeWind + Zustand + SQLite/Drizzle
- **Design** — near-black + a single green scale, hairlines, tabular numerals,
  five type sizes, two radii, and exactly one shadow. Colour means one thing:
  progressive overload.
- **Features** — customizable routines, a rolling split timeline, weighted and
  unweighted exercises, background-safe rest timers, overload nudges derived from
  real set history, **timed sets** (a get-ready count, then a countdown or an
  open hold — planks, dead hangs, boxing rounds), and a **muscle → cluster
  library** where `back` lives under `pull`, so a routine can say what day it
  actually is

See [ARCHITECTURE.md](ARCHITECTURE.md) for the stack rationale, data model,
design system and overload rules.

```bash
npx expo install --fix   # align deps with the installed Expo SDK
npx expo start           # dev server
npm test                 # overload engine, set timer, muscle clusters, shorthand
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
| Muscle clusters | the library browses as `PULL · BACK`, filters by movement family, and every routine leads with the day it actually is |

## Layout

```
App.tsx                     providers + the notification handler
src/navigation/AppShell     three tabs and a stack; no tab bar during a session
src/screens/                one file per screen, all plain props-and-callbacks
src/components/             SetRow, ExerciseCard, the timer pills, primitives…
src/lib/                    the decisions: overload, set timer, muscles, draft,
                            history, shape, units — all pure, all tested
src/state/                  the live session (zustand + AsyncStorage)
src/data/seed.ts            real logged sessions, used until SQLite is wired
src/theme/tokens.ts         the values className can't reach
plugins/                    Expo config plugins (release signing)
```

Not yet wired: finished sessions are logged to the console rather than written
to SQLite. An *in-progress* session already survives a force-quit. See the end of
[BUILD_ANDROID.md](BUILD_ANDROID.md).
