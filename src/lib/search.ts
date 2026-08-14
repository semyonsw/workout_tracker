/**
 * Exercise search.
 *
 * Substring, case-insensitive, over the name AND the aliases — the alias list is
 * the whole point. A log that has "pull to փոր" in it needs to find that row when
 * "pull" is typed in Latin, and someone who calls them "lat pulldowns" should not
 * have to remember that the app calls them "Wide pull-ups machine".
 *
 * Deliberately not fuzzy. A gym search is three or four characters into a library
 * of a few dozen movements; edit-distance matching would start volunteering
 * "Weighted dips" for "dead" and cost more taps than it saves.
 */

import type { Exercise } from '../types/models';

export function searchExercises(exercises: Exercise[], query: string): Exercise[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return exercises.filter((e) => !e.isArchived);

  return exercises.filter((exercise) => {
    if (exercise.isArchived) return false;
    if (exercise.name.toLowerCase().includes(needle)) return true;
    return (exercise.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle));
  });
}
