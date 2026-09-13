import { describe, expect, it } from 'vitest';

import {
  SECTION_FORMAT,
  SECTION_VERSION,
  countSection,
  describeSectionCounts,
  parseSection,
  sectionBaseName,
  serializeSection,
} from './sectionBackup';

/**
 * One section, in one file.
 *
 * The assertion that matters most here is the one about the WRONG SECTION: a
 * money file picked on the tasks import would sanitize down to "no tasks" and be
 * reported as a successful restore of nothing, which is how somebody loses a year
 * of answered days to a mis-tap. Everything else in this suite is the envelope
 * being an envelope.
 */

const tasksValue = {
  tasks: [
    { id: 't1', name: 'Read', schedule: { kind: 'daily' }, order: 0 },
    { id: 't2', name: 'Gym', schedule: { kind: 'daily' }, order: 1 },
  ],
  log: {
    t1: { '2026-09-11': { mark: 'done', note: '' }, '2026-09-12': { mark: 'done', note: '' } },
    t2: { '2026-09-12': { mark: 'missed', note: 'travelling' } },
  },
};

const moneyValue = {
  categories: [{ id: 'food', name: 'Food', glyph: '🧊', order: 0, archivedAt: null }],
  amounts: [
    { id: 'a1', categoryId: 'food', direction: 'expense', value: 400, when: { kind: 'day' } },
  ],
};

const trainingValue = {
  exercises: [{ id: 'e1' }, { id: 'e2' }],
  routines: [{ id: 'r1' }],
  workouts: [
    { id: 'w1', sets: [{}, {}, {}] },
    { id: 'w2', sets: [{}] },
  ],
};

describe('counting a section', () => {
  it('counts a task log by its ANSWERED DAYS, not by its tasks twice over', () => {
    expect(countSection('tasks', tasksValue)).toEqual({ tasks: 2, answeredDays: 3 });
  });

  it('counts money as categories and amounts', () => {
    expect(countSection('money', moneyValue)).toEqual({ categories: 1, amounts: 1 });
  });

  it('counts training the way the whole backup does — sets included', () => {
    expect(countSection('training', trainingValue)).toEqual({
      exercises: 2,
      routines: 1,
      workouts: 2,
      sets: 4,
    });
  });

  it('is TOTAL over junk, because the same function counts a file off an SD card', () => {
    expect(countSection('tasks', null)).toEqual({ tasks: 0, answeredDays: 0 });
    expect(countSection('money', 'nonsense')).toEqual({ categories: 0, amounts: 0 });
    expect(countSection('training', { workouts: 'not an array' })).toEqual({
      exercises: 0,
      routines: 0,
      workouts: 0,
      sets: 0,
    });
  });
});

describe('describing the counts', () => {
  it('reads as a sentence, and a one is singular', () => {
    expect(describeSectionCounts({ tasks: 9, answeredDays: 341 })).toBe(
      '9 tasks · 341 answered days',
    );
    expect(describeSectionCounts({ tasks: 1, answeredDays: 1 })).toBe('1 task · 1 answered day');
  });

  it('says something rather than nothing for an empty count', () => {
    expect(describeSectionCounts({})).toBe('nothing');
  });
});

describe('writing one', () => {
  it('states the format, the version and WHICH SECTION it holds', () => {
    const file = JSON.parse(serializeSection('tasks', tasksValue));
    expect(file.format).toBe(SECTION_FORMAT);
    expect(file.version).toBe(SECTION_VERSION);
    expect(file.section).toBe('tasks');
    expect(file.counts).toEqual({ tasks: 2, answeredDays: 3 });
  });

  it('writes the rows as they are stored, not a summary of them', () => {
    const file = JSON.parse(serializeSection('money', moneyValue));
    expect(file.data).toEqual(moneyValue);
  });

  it('names the file after the section and the minute, date first so it sorts', () => {
    expect(sectionBaseName('money', new Date(2026, 8, 13, 9, 12))).toBe(
      'workout-tracker-money-2026-09-13-0912',
    );
  });
});

describe('reading one back', () => {
  it('round-trips', () => {
    const result = parseSection(serializeSection('tasks', tasksValue), 'tasks');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.section).toBe('tasks');
    expect(result.envelope.data).toEqual(tasksValue);
    expect(result.counts).toEqual({ tasks: 2, answeredDays: 3 });
  });

  it('REFUSES a file from another section, and names the one you picked', () => {
    const result = parseSection(serializeSection('money', moneyValue), 'tasks');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/money file/);
    expect(result.error).toMatch(/daily tasks import/);
  });

  it('accepts any section when the caller does not care which', () => {
    const result = parseSection(serializeSection('money', moneyValue));
    expect(result.ok).toBe(true);
  });

  it('refuses a NEWER format rather than half-reading it', () => {
    const text = serializeSection('tasks', tasksValue).replace(
      `"version": ${SECTION_VERSION}`,
      '"version": 99',
    );
    const result = parseSection(text, 'tasks');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/newer version/);
  });

  it('refuses something that is not JSON, and says which half-copied thing it was', () => {
    const result = parseSection('{"section": "tasks"', 'tasks');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/JSON/);
  });

  it('refuses a JSON file that is simply something else', () => {
    const result = parseSection(JSON.stringify({ hello: 'world' }), 'tasks');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/which section/);
  });

  it('refuses a whole-app BACKUP, which is a different operation with a different sheet', () => {
    const backup = JSON.stringify({ format: 'workout-tracker-backup', version: 2, workouts: [] });
    expect(parseSection(backup, 'training').ok).toBe(false);
  });

  it('recounts rather than trusting the counts written in the file', () => {
    const text = JSON.stringify({
      format: SECTION_FORMAT,
      version: 1,
      section: 'money',
      counts: { categories: 99, amounts: 99 },
      data: moneyValue,
    });
    const result = parseSection(text, 'money');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts).toEqual({ categories: 1, amounts: 1 });
  });

  it('refuses an envelope with no data in it at all', () => {
    const text = JSON.stringify({ format: SECTION_FORMAT, version: 1, section: 'tasks' });
    const result = parseSection(text, 'tasks');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/empty/);
  });
});
