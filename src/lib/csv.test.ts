import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import { CSV_COLUMNS, csvBaseName, csvField, workoutsToCsv } from './csv';
import type { SetHistory } from '../types/models';

/**
 * The log as a spreadsheet.
 *
 * `backup.ts` argues the JSON file is readable so "a script, a spreadsheet, a
 * future version of this app" can read the log out; two of those three were true.
 * The interesting tests are the quoting (exercise names contain commas by nature)
 * and the exercise somebody deleted six months after training it.
 */

function row(overrides: Partial<SetHistory> = {}, index = 0): SetHistory {
  return {
    id: `sh${index}`,
    sessionId: 'w1',
    exerciseId: 'ex_a',
    performedAt: '2026-08-17T18:00:00.000Z',
    setIndex: index,
    weightKg: 40,
    count: 8,
    countUnit: 'reps',
    loadMode: 'added_bodyweight',
    isWarmup: false,
    isCompleted: true,
    ...overrides,
  };
}

function workout(
  title: string,
  sets: SetHistory[],
  exercises: { exerciseId: string; name: string }[] = [{ exerciseId: 'ex_a', name: 'Dips' }],
): CompletedWorkout {
  return {
    id: 'w1',
    title,
    startedAt: '2026-08-17T18:00:00.000Z',
    endedAt: '2026-08-17T19:00:00.000Z',
    durationMinutes: 60,
    setCount: sets.length,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    exercises: exercises.map((e) => ({
      ...e,
      countUnit: 'reps' as const,
      loadMode: 'added_bodyweight' as const,
      setCount: 1,
      summary: '',
      totalCount: 0,
      topWeightKg: null,
    })),
    sets,
  };
}

const lines = (csv: string) => csv.split('\r\n').filter((l) => l !== '');

/* ------------------------------------------------------------------ */

describe('workoutsToCsv', () => {
  it('starts with a header row in a fixed column order', () => {
    expect(lines(workoutsToCsv([]))[0]).toBe(CSV_COLUMNS.join(','));
  });

  it('is a header and nothing else for an empty log', () => {
    // Not an empty file: a spreadsheet opening a zero-byte CSV shows nothing and
    // gives no clue whether the export worked.
    expect(lines(workoutsToCsv([]))).toHaveLength(1);
  });

  it('writes one row per set', () => {
    const csv = workoutsToCsv([workout('Pull', [row({}, 0), row({}, 1), row({}, 2)])]);
    expect(lines(csv)).toHaveLength(4);
  });

  it('carries every column off the row', () => {
    const csv = workoutsToCsv([workout('Pull', [row()])]);
    expect(lines(csv)[1]).toBe('2026-08-17,Pull,Dips,1,40,8,reps,added_bodyweight,false');
  });

  it('leaves the weight EMPTY for unweighted work rather than writing 0', () => {
    // A spreadsheet summing this column must not be told a push-up weighed nothing.
    const csv = workoutsToCsv([workout('Push', [row({ weightKg: null, loadMode: 'none' })])]);
    expect(lines(csv)[1]).toBe('2026-08-17,Push,Dips,1,,8,reps,none,false');
  });

  it('flags a warm-up, since that is what says which rows count', () => {
    const csv = workoutsToCsv([workout('Pull', [row({ isWarmup: true })])]);
    expect(lines(csv)[1].endsWith(',true')).toBe(true);
  });

  it('ends at a line boundary', () => {
    expect(workoutsToCsv([workout('Pull', [row()])]).endsWith('\r\n')).toBe(true);
  });

  it('quotes a name with a comma in it, which is the common case', () => {
    const csv = workoutsToCsv([
      workout('Pull + swimming, short', [row()], [{ exerciseId: 'ex_a', name: 'Row, stomach' }]),
    ]);
    expect(lines(csv)[1]).toContain('"Pull + swimming, short"');
    expect(lines(csv)[1]).toContain('"Row, stomach"');
  });

  it('doubles a quote inside a field, per RFC 4180', () => {
    const csv = workoutsToCsv([
      workout('Pull', [row()], [{ exerciseId: 'ex_a', name: '90" pull-ups' }]),
    ]);
    expect(lines(csv)[1]).toContain('"90"" pull-ups"');
  });

  it('quotes a field with a newline in it', () => {
    const csv = workoutsToCsv([
      workout('Pull', [row()], [{ exerciseId: 'ex_a', name: 'Odd\nname' }]),
    ]);
    expect(csv).toContain('"Odd\nname"');
  });

  it('exports a set whose exercise has been deleted since', () => {
    // The record carries a snapshot of the name precisely so a rename or a delete
    // cannot rewrite the log, and this reads that snapshot. A row the snapshot does
    // not cover — a malformed record — falls back to the id rather than being
    // dropped: a set that happened should reach the file with something in it.
    const csv = workoutsToCsv([
      workout('Pull', [row({ exerciseId: 'ex_gone' })], [{ exerciseId: 'ex_a', name: 'Dips' }]),
    ]);
    expect(lines(csv)[1]).toContain('ex_gone');
    expect(lines(csv)).toHaveLength(2);
  });

  it('numbers the set from the row, warm-ups included', () => {
    const csv = workoutsToCsv([
      workout('Pull', [row({ isWarmup: true }, 0), row({}, 1), row({}, 2)]),
    ]);
    expect(
      lines(csv)
        .slice(1)
        .map((l) => l.split(',')[3]),
    ).toEqual(['1', '2', '3']);
  });

  it('dates by the workout, in the phone’s own calendar', () => {
    // Matching `formatShortDate` and the date the history list prints: reading it
    // out of UTC would date a workout logged before 04:00 in Yerevan to the day
    // before, so the spreadsheet and the screen would disagree.
    const local = new Date('2026-08-17T18:00:00.000Z');
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(
      local.getDate(),
    ).padStart(2, '0')}`;
    expect(lines(workoutsToCsv([workout('Pull', [row()])]))[1].startsWith(expected)).toBe(true);
  });
});

describe('csvField', () => {
  it('leaves an ordinary field alone, so the file is readable in a terminal', () => {
    expect(csvField('Dips')).toBe('Dips');
    expect(csvField('40')).toBe('40');
  });

  it('quotes only what has to be quoted', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('a"b')).toBe('"a""b"');
    expect(csvField('a\r\nb')).toBe('"a\r\nb"');
  });
});

describe('csvBaseName', () => {
  it('is sortable, and a different stem from the backup', () => {
    // A folder with both in it must not leave anybody guessing which one restores.
    const name = csvBaseName(new Date(2026, 7, 19, 9, 12));
    expect(name).toBe('workout-tracker-sets-2026-08-19-0912');
    expect(name).not.toContain('backup');
  });
});
