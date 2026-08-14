repo: semyonsw/workout_tracker
branch: main

## Last sync

date: 2026-08-13T00:00:00Z

### Updated in this project

- Read the full RN source (README, ARCHITECTURE, tokens, all six components, ActiveWorkoutScreen, seed data).
- Rebuilt the UI as a 14-state Android mockup gallery at 390 × 844.
- Palette switched from the repo's monochrome + brown `signal` to the near-black + green scale the design brief specifies (user's explicit call).
- Added seven screens the repo does not have yet: home/split timeline, routine editor (+ reorder), library/search, create-exercise (both toggle states), exercise history, finish-confirm sheet.

## Screen map

| Project screen | Repo source |
| --- | --- |
| 01–04 Active workout, nudge, inline editor, timer | src/screens/ActiveWorkoutScreen.tsx, src/components/SetRow.tsx, ExerciseCard.tsx, QuickAdjust.tsx, OverloadNudge.tsx, RestTimerPill.tsx |
| 05–06 Rounds / reps-only variants | src/types/models.ts (requiresWeight × countUnit × loadMode), src/data/seed.ts |
| 07 Finish confirm | src/screens/ActiveWorkoutScreen.tsx (handleFinish Alert) |
| 08 Home / split timeline | src/components/SplitTimeline.tsx, src/data/seed.ts (seedSplit) |
| 09–10 Routine editor + reorder | src/data/seed.ts (seedRoutine), src/types/models.ts (RoutineItem) — no screen exists upstream |
| 11–13 Library + create exercise | src/types/models.ts (Exercise), src/data/seed.ts (seedExercises) |
| 14 Exercise history | src/lib/progressiveOverload.ts, src/data/seed.ts (seedHistory) |

## Notes

Design tokens in this project intentionally diverge from src/theme/tokens.ts + global.css; do not sync them back without confirming.
