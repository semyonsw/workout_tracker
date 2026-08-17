/**
 * Exercise search.
 *
 * Substring, case-insensitive, over the name, the aliases, AND the muscles the
 * exercise works — including the cluster those muscles sit under. The alias list
 * is the whole point: a log that has "pull to փոր" in it needs to find that row
 * when "pull" is typed in Latin, and someone who calls them "lat pulldowns"
 * should not have to remember that the app calls them "Wide pull-ups machine".
 *
 * Muscle and cluster matching is the second half of that same idea. "back" is
 * what a person types when they want back work, and it is not in the name of a
 * single row in the library — "Pull to stomach" and "Wide pull-ups machine" are
 * both back exercises that the word "back" would otherwise miss. Typing "pull"
 * now finds every pull-cluster movement, not just the ones with "pull" in the
 * name, which is exactly what the cluster hierarchy is for.
 *
 * Deliberately not fuzzy. A gym search is three or four characters into a library
 * of a few dozen movements; edit-distance matching would start volunteering
 * "Weighted dips" for "dead" and cost more taps than it saves.
 *
 * Ranking: name matches first, then everything found by muscle or cluster.
 * Someone typing "plank" wants the plank, not the first core exercise
 * alphabetically — but when the query is a body part, any hit is a good hit.
 */

import type { Exercise } from '../types/models';
import { MUSCLE_CLUSTER } from './muscles';

function matchesName(exercise: Exercise, needle: string): boolean {
  if (exercise.name.toLowerCase().includes(needle)) return true;
  return (exercise.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle));
}

function matchesMuscle(exercise: Exercise, needle: string): boolean {
  return exercise.muscleGroups.some(
    (muscle) => muscle.includes(needle) || MUSCLE_CLUSTER[muscle].includes(needle),
  );
}

export function searchExercises(exercises: Exercise[], query: string): Exercise[] {
  const needle = query.trim().toLowerCase();
  const live = exercises.filter((e) => !e.isArchived);
  if (!needle) return live;

  const byName = live.filter((e) => matchesName(e, needle));
  const byMuscle = live.filter((e) => !matchesName(e, needle) && matchesMuscle(e, needle));
  return [...byName, ...byMuscle];
}
