import { describe, expect, it } from 'vitest';

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupBaseName,
  countPayload,
  describeCounts,
  parseBackup,
  serializeBackup,
  type BackupPayload,
} from './backup';

const payload = (over: Partial<BackupPayload> = {}): BackupPayload => ({
  settings: { restSecondsBetweenSets: 90 },
  exercises: [{ id: 'ex_1' }, { id: 'ex_2' }],
  routines: [{ id: 'r_1' }],
  workouts: [
    { id: 'w_1', sets: [{}, {}, {}] },
    { id: 'w_2', sets: [{}] },
  ],
  ...over,
});

/* ------------------------------------------------------------------ */

describe('the envelope', () => {
  it('states the format and the version, so a reader knows what it is holding', () => {
    const file = JSON.parse(serializeBackup(payload()));

    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.version).toBe(BACKUP_VERSION);
    expect(typeof file.exportedAt).toBe('string');
  });

  it('counts what is actually in it, not what anyone claims', () => {
    // Sets are counted across workouts: it is the number that says how much
    // training is in the file, and it is the one a restore is checked against.
    expect(countPayload(payload())).toEqual({
      exercises: 2,
      routines: 1,
      workouts: 2,
      sets: 4,
    });
  });

  it('survives a workout whose sets array is missing rather than counting NaN', () => {
    expect(countPayload(payload({ workouts: [{ id: 'w_1' }] })).sets).toBe(0);
  });

  it('is pretty-printed, because a backup you cannot read is a promise', () => {
    const text = serializeBackup(payload());

    expect(text).toContain('\n  "format"');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('names the file so a folder of them sorts chronologically', () => {
    const name = backupBaseName(new Date(2026, 7, 19, 9, 12));

    expect(name).toBe(`${BACKUP_FORMAT}-2026-08-19-0912`);
    // No extension: the SAF file creator appends one from the MIME type.
    expect(name).not.toContain('.json');
  });
});

/* ------------------------------------------------------------------ */

describe('reading one back', () => {
  it('round-trips a payload unchanged', () => {
    const original = payload();
    const result = parseBackup(serializeBackup(original));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.exercises).toEqual(original.exercises);
    expect(result.envelope.routines).toEqual(original.routines);
    expect(result.envelope.workouts).toEqual(original.workouts);
    expect(result.envelope.settings).toEqual(original.settings);
    expect(result.counts.sets).toBe(4);
  });

  it('refuses text that is not JSON', () => {
    const result = parseBackup('{"format": "workout-tracker-backup", "exer');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The usual cause is a half-copied paste, and the message says so.
    expect(result.error).toMatch(/JSON/);
  });

  it('refuses a file from a NEWER format rather than half-reading it', () => {
    const text = serializeBackup(payload()).replace('"version": 1', '"version": 99');
    const result = parseBackup(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/newer version/);
  });

  it('refuses a JSON file that is simply something else', () => {
    expect(parseBackup('{"hello":"world"}').ok).toBe(false);
    expect(parseBackup('[1,2,3]').ok).toBe(false);
    expect(parseBackup('"a string"').ok).toBe(false);
  });

  it('accepts a hand-edited file that lost its format field but kept the rows', () => {
    const text = serializeBackup(payload()).replace(`"format": "${BACKUP_FORMAT}",`, '');
    const result = parseBackup(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.workouts).toBe(2);
  });

  it('treats a missing collection as empty rather than as a reason to refuse', () => {
    const result = parseBackup(
      JSON.stringify({ format: BACKUP_FORMAT, version: 1, workouts: [{ id: 'w', sets: [] }] }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.exercises).toEqual([]);
    expect(result.envelope.routines).toEqual([]);
  });

  it('recounts rather than trusting the counts written in the file', () => {
    const text = serializeBackup(payload()).replace('"workouts": 2', '"workouts": 900');
    const result = parseBackup(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.workouts).toBe(2);
  });
});

describe('describeCounts', () => {
  it('reads as a sentence a human would say, singulars included', () => {
    expect(describeCounts({ workouts: 1, sets: 1, exercises: 1, routines: 1 })).toBe(
      '1 workout · 1 set · 1 exercise · 1 routine',
    );
    expect(describeCounts({ workouts: 42, sets: 512, exercises: 88, routines: 6 })).toBe(
      '42 workouts · 512 sets · 88 exercises · 6 routines',
    );
  });
});
