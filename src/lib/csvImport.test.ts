import { describe, expect, it } from 'vitest';

import { describeCsvPlan, matchKey, parseCsv, parseSetsCsv, planCsvImport } from './csvImport';
import { workoutsToCsv } from './csv';
import type { CompletedWorkout } from './completedWorkout';
import type { Exercise } from '../types/models';

/**
 * Reading a set table back in.
 *
 * The test that matters most is the ROUND TRIP: what `workoutsToCsv` writes, this
 * has to read, or the app's own export is not a format it can consume. The rest are
 * the rules that answer `lib/csv.ts`'s objection — chiefly that an imported log can
 * never point at an exercise that does not exist.
 */

const pullup: Exercise = {
  id: 'ex_pullup',
  ownerId: null,
  name: 'Weighted 90° pull-ups',
  aliases: ['pull to chest'],
  muscleGroups: ['back'],
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'added_bodyweight',
  isUnilateral: false,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('the CSV grammar', () => {
  it('reads quoted fields with commas and doubled quotes in them', () => {
    // Exercise names contain commas by nature ("Row, stomach").
    const rows = parseCsv('a,"b,c","say ""hi"""\r\n1,2,3\r\n');
    expect(rows).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('accepts LF as well as CRLF, and ignores a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty fields rather than collapsing them', () => {
    // An empty `weight_kg` is what unweighted work looks like — it must survive.
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });
});

describe('the round trip', () => {
  const workout: CompletedWorkout = {
    id: 'w1',
    title: 'Pull + swimming',
    startedAt: new Date(2024, 2, 11, 10).toISOString(),
    endedAt: new Date(2024, 2, 11, 11).toISOString(),
    durationMinutes: 60,
    setCount: 2,
    totalVolumeKg: 0,
    volumeIsPartial: true,
    exercises: [
      {
        exerciseId: pullup.id,
        name: pullup.name,
        countUnit: 'reps',
        loadMode: 'added_bodyweight',
        setCount: 2,
        summary: '+20 kg · 8 6',
        totalCount: 14,
        topWeightKg: 20,
      },
    ],
    sets: [
      {
        id: 's1',
        sessionId: 'w1',
        exerciseId: pullup.id,
        performedAt: new Date(2024, 2, 11, 10).toISOString(),
        setIndex: 0,
        weightKg: 20,
        count: 8,
        countUnit: 'reps',
        loadMode: 'added_bodyweight',
        isWarmup: false,
        isCompleted: true,
      },
      {
        id: 's2',
        sessionId: 'w1',
        exerciseId: pullup.id,
        performedAt: new Date(2024, 2, 11, 10).toISOString(),
        setIndex: 1,
        weightKg: 20,
        count: 6,
        countUnit: 'reps',
        loadMode: 'added_bodyweight',
        isWarmup: false,
        isCompleted: true,
      },
    ],
  };

  it('reads back what the app itself wrote', () => {
    const parsed = parseSetsCsv(workoutsToCsv([workout]));
    expect(parsed.error).toBeNull();
    expect(parsed.skipped).toBe(0);
    expect(parsed.rows).toHaveLength(2);

    const plan = planCsvImport(parsed, [pullup]);
    expect(plan.workouts).toHaveLength(1);
    expect(plan.workouts[0].title).toBe('Pull + swimming');
    expect(plan.workouts[0].sets).toHaveLength(2);
    // The name matched, so nothing was invented.
    expect(plan.newExercises).toHaveLength(0);
    expect(plan.workouts[0].sets.every((s) => s.exerciseId === pullup.id)).toBe(true);
    expect(plan.workouts[0].sets.map((s) => s.count)).toEqual([8, 6]);
    expect(plan.workouts[0].sets[0].loadMode).toBe('added_bodyweight');
  });

  it('is idempotent — the same file twice produces the same ids', () => {
    const csv = workoutsToCsv([workout]);
    const first = planCsvImport(parseSetsCsv(csv), [pullup]);
    const second = planCsvImport(parseSetsCsv(csv), [pullup]);
    // `mergeWorkouts` skips an id it already has, so re-importing costs nothing.
    expect(first.workouts[0].id).toBe(second.workouts[0].id);
  });
});

describe('exercises the file refers to', () => {
  const csv = [
    'date,workout,exercise,set,weight_kg,count,count_unit,load_mode,warmup',
    '2024-03-11,Pull,Weighted 90° pull-ups,1,20,8,reps,added_bodyweight,false',
    '2024-03-11,Pull,Barbell shrug,1,90,10,reps,external,false',
  ].join('\n');

  it('matches by name, ignoring case and punctuation', () => {
    const plan = planCsvImport(parseSetsCsv(csv), [pullup]);
    expect(plan.matched).toBe(1);
    expect(plan.workouts[0].sets[0].exerciseId).toBe(pullup.id);
  });

  it('matches an alias too', () => {
    const aliased = [
      'date,exercise,count,weight_kg,load_mode',
      '2024-03-11,pull to chest,8,20,added_bodyweight',
    ].join('\n');
    const plan = planCsvImport(parseSetsCsv(aliased), [pullup]);
    expect(plan.workouts[0].sets[0].exerciseId).toBe(pullup.id);
  });

  it('CREATES the ones that do not exist, so no row dangles', () => {
    /*
     * This is the whole answer to `lib/csv.ts`'s objection: the importer brings the
     * library with it rather than producing a log pointing at nothing.
     */
    const plan = planCsvImport(parseSetsCsv(csv), [pullup]);
    expect(plan.newExercises.map((e) => e.name)).toEqual(['Barbell shrug']);

    const created = plan.newExercises[0];
    // The shape comes off the row: a weight was present, so it takes one.
    expect(created.requiresWeight).toBe(true);
    expect(created.loadMode).toBe('external');
    expect(created.countUnit).toBe('reps');
    // Unfiled: a set table cannot say which muscle a movement works, and guessing
    // would file half the library wrongly and silently.
    expect(created.muscleGroups).toEqual([]);

    const ids = new Set([pullup.id, ...plan.newExercises.map((e) => e.id)]);
    for (const workout of plan.workouts) {
      for (const row of workout.sets) expect(ids.has(row.exerciseId)).toBe(true);
    }
  });

  it('creates an unweighted exercise for a row with no weight', () => {
    const bodyweight = ['date,exercise,count,count_unit', '2024-03-11,Push-ups,30,reps'].join('\n');
    const plan = planCsvImport(parseSetsCsv(bodyweight), []);
    expect(plan.newExercises[0].requiresWeight).toBe(false);
    expect(plan.newExercises[0].loadMode).toBe('none');
    expect(plan.workouts[0].sets[0].weightKg).toBeNull();
  });
});

describe('grouping', () => {
  it('is one workout per date AND title', () => {
    const csv = [
      'date,workout,exercise,count',
      '2024-03-11,Pull,Pull-ups,8',
      '2024-03-11,Swim,Freestyle,500',
      '2024-03-12,Pull,Pull-ups,8',
    ].join('\n');
    const plan = planCsvImport(parseSetsCsv(csv), []);
    // Not one per date (that would invent a session nobody did) and not one per
    // exercise (that would make every workouts-per-week number wrong).
    expect(plan.workouts).toHaveLength(3);
    expect(plan.workouts.map((w) => w.title).sort()).toEqual(['Pull', 'Pull', 'Swim']);
  });

  it('puts several exercises of one day into one workout', () => {
    const csv = [
      'date,workout,exercise,count',
      '2024-03-11,Pull,Pull-ups,8',
      '2024-03-11,Pull,Rows,10',
    ].join('\n');
    const plan = planCsvImport(parseSetsCsv(csv), []);
    expect(plan.workouts).toHaveLength(1);
    expect(plan.workouts[0].exercises).toHaveLength(2);
  });

  it('is newest first, like the store', () => {
    const csv = [
      'date,workout,exercise,count',
      '2024-03-11,Pull,Pull-ups,8',
      '2026-01-04,Pull,Pull-ups,8',
    ].join('\n');
    const plan = planCsvImport(parseSetsCsv(csv), []);
    expect(plan.workouts[0].startedAt > plan.workouts[1].startedAt).toBe(true);
  });

  it('keeps warm-ups out of the set count but in the rows', () => {
    const csv = [
      'date,workout,exercise,count,weight_kg,warmup',
      '2024-03-11,Pull,Pull-ups,5,0,true',
      '2024-03-11,Pull,Pull-ups,8,20,false',
    ].join('\n');
    const plan = planCsvImport(parseSetsCsv(csv), []);
    expect(plan.workouts[0].sets).toHaveLength(2);
    // The same rule as everywhere else: a warm-up is out of the set count.
    expect(plan.workouts[0].setCount).toBe(1);
  });
});

describe('bad input', () => {
  it('rejects a file that is not a set table', () => {
    expect(parseSetsCsv('name,email\nbob,bob@example.com').error).toContain('not a set table');
    expect(parseSetsCsv('').error).toBe('That file is empty.');
  });

  it('reads columns by NAME, so a reordered sheet still imports', () => {
    const reordered = ['count,exercise,date', '8,Pull-ups,2024-03-11'].join('\n');
    const parsed = parseSetsCsv(reordered);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].exercise).toBe('Pull-ups');
  });

  it('counts unreadable rows instead of failing or hiding them', () => {
    const csv = [
      'date,exercise,count',
      '2024-03-11,Pull-ups,8',
      'nonsense,Pull-ups,8',
      '2024-03-11,,8',
      '2024-03-11,Pull-ups,0',
      '2024-03-11,Pull-ups,notanumber',
    ].join('\n');
    const parsed = parseSetsCsv(csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.skipped).toBe(4);
  });

  it('reads the date formats a spreadsheet actually produces', () => {
    const csv = [
      'date,exercise,count',
      '2024-03-11,Pull-ups,8',
      '11/03/2024,Pull-ups,8',
      '2024-03-11T10:00:00.000Z,Pull-ups,8',
    ].join('\n');
    const parsed = parseSetsCsv(csv);
    // All three are 11 March 2024 — the slashed one read day-first.
    expect(parsed.rows.map((r) => r.date)).toEqual(['2024-03-11', '2024-03-11', '2024-03-11']);
  });

  it('resolves an unambiguous slashed date whichever way round it is', () => {
    const parsed = parseSetsCsv(['date,exercise,count', '3/11/2024,Pull-ups,8'].join('\n'));
    // 3 November: day-first, because that is the stated convention.
    expect(parsed.rows[0].date).toBe('2024-11-03');

    const other = parseSetsCsv(['date,exercise,count', '11/3/2024,Pull-ups,8'].join('\n'));
    expect(other.rows[0].date).toBe('2024-03-11');
  });
});

describe('the summary line', () => {
  it('states what will happen, in one sentence', () => {
    const csv = [
      'date,workout,exercise,count,weight_kg',
      '2024-03-11,Pull,Weighted 90° pull-ups,8,20',
      '2024-03-11,Pull,Barbell shrug,10,90',
    ].join('\n');
    const plan = planCsvImport(parseSetsCsv(csv), [pullup]);
    expect(describeCsvPlan(plan)).toBe('2 sets in 1 workout · 1 new exercise · 1 matched');
  });
});

describe('name matching', () => {
  it('folds case, punctuation and apostrophes', () => {
    expect(matchKey('Weighted 90° pull-ups')).toBe(matchKey('weighted 90 PULL UPS'));
    expect(matchKey("Farmer's walk")).toBe(matchKey('farmers walk'));
  });

  it('keeps non-Latin names distinguishable', () => {
    // The library ships aliases like "pull to փոր" — folding those to nothing would
    // match every Armenian name to every other one.
    expect(matchKey('pull to փոր')).not.toBe(matchKey('pull to կուրծք'));
  });
});
