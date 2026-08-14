# Workout Tracker — Architecture & Design System

Philosophy: **zero friction**. The benchmark for every decision is *how many taps
does it cost mid-set, with cold hands, in a loud room*. Repeating last session's
set — the overwhelmingly common case — costs **one tap**.

---

## Step 1 — Tech stack

**React Native + Expo (SDK 54) + TypeScript + NativeWind v4.**

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Expo (managed, dev-client ready) | Rest timers need `expo-notifications`, `expo-haptics`, `expo-keep-awake` — all first-party, config-plugin driven, no manual native work. EAS handles builds/OTA. |
| Styling | NativeWind v4 | Tailwind constraints are what keep a minimal app minimal. The config amputates the default palette, so a stray `text-blue-500` is a compile error, not a design review. |
| Local state | Zustand + `persist` | One store, for the live session only. A crash or a phone call mid-workout costs nothing. |
| Server/DB state | TanStack Query over SQLite | History and library are cached reads, not mutable app state — different tool, deliberately. |
| Storage | `expo-sqlite` + Drizzle ORM | **Local-first.** A gym has no signal. SQLite is the source of truth, sync is a later feature, not a dependency. Drizzle gives typed queries against the exact index the overload engine needs. |
| Animation | Reanimated 4 | UI-thread animation for the timer and card transitions; the JS thread stays free while logging. |
| Navigation | Expo Router | File-based, typed, deep-linkable ("resume workout" from a notification). |
| Tests | Vitest for `lib/` | The overload engine is pure and dependency-free — it tests in milliseconds without a native runtime. |

**Why not Flutter?** It would be a fine choice — arguably better raw list
performance. React Native wins here on three specifics: Expo's notification +
haptics + background story is less work for the exact features in this spec;
NativeWind enforces a design system in a way Flutter's widget styling does not;
and the pure-TypeScript domain layer (`lib/progressiveOverload.ts`) can be reused
verbatim in a future web dashboard or server. Nothing in this app is
GPU-expensive enough for Flutter's advantages to show.

**Why local-first, no backend on day one?** Every feature in the spec works
offline. Adding auth and a server before the app is used once buys latency and a
login screen. The schema is UUID-keyed and timestamped, so a sync layer
(Turso/Postgres, last-write-wins per set row) drops in later without a migration.

---

## Step 2 — Data models

Full interfaces in [src/types/models.ts](src/types/models.ts); SQLite/Drizzle
schema in [src/db/schema.ts](src/db/schema.ts). The four decisions that matter:

1. **`SetHistory` is denormalized on purpose.** Each row carries `exerciseId` +
   `performedAt` + `weightKg`, so an overload verdict is one indexed range scan
   (`idx_set_history_exercise_time`) — no joins, no session hydration.
2. **Load and count are separate axes**, not one enum:
   `requiresWeight` (does a weight input render at all?) ×
   `countUnit` (`reps` | `seconds` | `meters` | `rounds`) ×
   `loadMode` (`external` | `added_bodyweight` | `assisted` | `none`).
   That covers "weighted dips +30 kg 8 6 5 4", "machine 80 kg 8 6 5 5",
   "push-ups 14 13 10 10" and "12 rounds × 3 min" in one model.
3. **Weight lives on the set, never on the exercise.** Real sessions ramp and
   drop inside one exercise ("15 kg × 5, then 10 kg × 12 9 8"); a per-exercise
   weight would fabricate plateaus.
4. **`WorkoutSplit.cycleMode: 'rolling'`.** A split is a queue that advances when
   a session completes, not a calendar that judges you for a missed Tuesday.
   `weekly` is available for people who train on fixed days.

`weightKg` is `NULL` — never `0` — for bodyweight and cardio work. Zero is a
weight; `NULL` is the absence of the concept, and the engine depends on it.
All weights are stored in kilograms; imperial is a render-time conversion, so a
unit toggle can never corrupt history.

---

## Step 3 — Design system

### Colour

Monochrome, plus exactly one accent that means one thing.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | `#FAFAF9` | `#0B0B0C` | Page |
| `surface` | `#FFFFFF` | `#151517` | Cards, set rows |
| `surface-alt` | `#F2F2F0` | `#1D1D20` | Wells, the primed next set, QuickAdjust |
| `ink` | `#0E0E10` | `#F4F4F2` | Primary text, completed marks |
| `ink-muted` | `#6B6B70` | `#8E8E93` | Secondary text |
| `ink-faint` | `#A0A0A5` | `#5C5C61` | Micro-labels, ghosted prefills |
| `hairline` | `#E5E5E2` | `#27272B` | 1px separators |
| `signal` | `#8A5A2B` | `#E0B183` | **Progressive overload only** |

No green for "done", no red for "failed". Completion is expressed by *weight of
ink*, not hue. Because colour appears exactly once in the app, the overload
nudge is impossible to miss without ever shouting. Both themes are defined as
CSS variables in [global.css](global.css) and consumed as semantic names
(`bg-surface`, `text-ink`), so no component knows which theme is active.

### Typography

System font (SF Pro / Roboto) — a custom typeface would cost a download and buy
nothing at these sizes. Five sizes, no more:

| Role | Size / leading | Notes |
| --- | --- | --- |
| `display` | 40 / 44, tracking −1.2 | QuickAdjust value, rest countdown |
| `title` | 22 / 28, tracking −0.4 | Exercise name, set values |
| `body` | 16 / 22 | Suggestions, collapsed headers |
| `label` | 13 / 18 | Secondary lines |
| `micro` | 11 / 14, tracking +1.1, uppercase | `KG`, `REPS`, `SET`, timeline |

**Every number is tabular.** A weight that shifts a pixel going from 9 to 10 reps
is the difference between an app and an instrument.

### Shape, space, motion

- **Two radii only**: `14` for surfaces, `999` for pills. No third option.
- **Hairlines, not shadows.** One elevation exists in the whole app: the floating
  rest timer, because it must read as *above* the list.
- **4pt grid**, five steps (`4 / 8 / 12 / 16 / 24 / 40`).
- **56pt rows, 44pt minimum tap targets** — everything in the logging flow is
  thumb-sized.
- **Motion**: 140 ms for row state, 240 ms for cards, easing `[0.22, 1, 0.36, 1]`.
  Fast enough to feel immediate, slow enough not to twitch.
- **Haptics carry meaning**: medium impact = set logged, light = undo,
  selection tick = value nudged, success notification = rest over. The user can
  tell what happened without looking.

### The logging screen, in taps

| Action | Taps |
| --- | --- |
| Log a set identical to last time | **1** (the ✓) |
| Log a set 2.5 kg heavier | **3** (weight → +2.5 → ✓) |
| Accept an overload suggestion for all remaining sets | **1** (Use) |
| Add 15 s of rest | **1** |
| Type an exact weight | 2 + keyboard |

---

## Step 4 — What's in the code

| File | Role |
| --- | --- |
| [src/screens/ActiveWorkoutScreen.tsx](src/screens/ActiveWorkoutScreen.tsx) | The logging screen — composition and wiring only |
| [src/components/SetRow.tsx](src/components/SetRow.tsx) | One set: prefilled, ghosted, one-tap commit |
| [src/components/QuickAdjust.tsx](src/components/QuickAdjust.tsx) | Inline ± editor; keyboard is the fallback, not the default |
| [src/components/ExerciseCard.tsx](src/components/ExerciseCard.tsx) | Expanded / collapsed exercise; one open at a time |
| [src/components/RestTimerPill.tsx](src/components/RestTimerPill.tsx) | Floating countdown with `+15` and `Skip` on the pill |
| [src/components/OverloadNudge.tsx](src/components/OverloadNudge.tsx) | The only coloured element in the app |
| [src/components/SplitTimeline.tsx](src/components/SplitTimeline.tsx) | Push → Pull → Boxing → Rest strip |
| [src/lib/progressiveOverload.ts](src/lib/progressiveOverload.ts) | The engine — pure, injectable clock, zero deps |
| [src/lib/draft.ts](src/lib/draft.ts) | Prefill from history; draft → `SetHistory` on save |
| [src/hooks/useRestTimer.ts](src/hooks/useRestTimer.ts) | Deadline-based timer, background-safe |
| [src/state/activeWorkoutStore.ts](src/state/activeWorkoutStore.ts) | The only global state |

### Progressive overload rules

Judged on the **top working weight per session** (never per set), over the streak
of recent sessions sharing that weight — the *plateau run*.

| Verdict | Condition | UI |
| --- | --- | --- |
| `insufficient_data` | No history, or `requiresWeight: false` | silent |
| `progressing` | Latest session is heavier than the one before | silent |
| `regressing` | A heavier top weight within the last 60 days | silent — they're rebuilding, never nudge into a deload |
| `building` | Plateau exists but under the threshold | silent (`3× at this weight` in dev) |
| `due_reps` | Plateau ≥ 14 days **and** ≥ 3 sessions, but reps < target | "Reps first — go for 5" |
| `due_weight` | Plateau ≥ 14 days **and** ≥ 3 sessions, reps owned | "Try 27.5 kg" |

Both thresholds must pass: **days** catch true stagnation, **sessions** stop a
two-week holiday from reading as one. Increments come from the exercise
(`incrementKg`) so a dumbbell movement offers ±2.5 and a cable stack ±5 — the app
never suggests a weight that cannot be loaded. Imperial users get 5 lb jumps, not
an unloadable 5.5 lb conversion of 2.5 kg.

Verified in [src/lib/progressiveOverload.test.ts](src/lib/progressiveOverload.test.ts)
against real logged sessions (#80–#87, 21 Jul – 11 Aug 2026) — 9 cases, all
passing, including the ramp-then-drop and deload traps.

---

## Running it

```bash
npx expo install   # pin every dependency to the installed SDK
npx expo start
npm test           # overload engine
```

> Dependency versions in `package.json` are SDK-54-era ranges written by hand.
> Run `npx expo install` to let Expo resolve the exact compatible set before the
> first build.

## Not built yet (deliberate next steps)

- Persistence wiring: `draftToSetHistory()` → Drizzle insert → advance
  `split.cursor`. The seam exists (`onFinish`), the writer does not.
- Routine/exercise editor screens (the models and store support them fully).
- Superset grouping in the UI (`RoutineItem.supersetGroup` is modelled).
- Plate-math helper for barbell loading.
- Sync. Schema is ready; the feature is not needed until there is a second device.
