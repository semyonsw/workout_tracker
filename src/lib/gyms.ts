/**
 * Gyms — because "which plates exist" is a fact about a ROOM, and you train in more
 * than one.
 *
 *   ● Commercial gym   25 20 15 10 5 2.5 1.25      ← the active one
 *   ○ Home rack        20 10 5 2.5
 *   ○ Hotel            10 5 2.5
 *
 * `Settings.availablePlatesKg` was one list, and `platesFor` reads it to answer the
 * only question the set row asks out loud: what goes on the bar. One list means the
 * answer is right in one building. Travel, or train in a garage at the weekend, and
 * the plate label under every barbell weight is confidently wrong — and `SetRow`'s
 * header is explicit that the label must never be a lie about the equipment, which
 * is exactly what it becomes.
 *
 * So the plate list is per gym, and one gym is active. Everything downstream is
 * unchanged: `activeGymPlates` hands back a single list, `platesFor` still takes a
 * single list, and nothing else in the app knows gyms exist.
 *
 * ── WHY NOT A FULL EQUIPMENT MODEL ─────────────────────────────────────────
 *
 * A gym is a NAME AND A PLATE LIST. Not dumbbell increments, not which machines are
 * there, not a bar inventory — those are the fields that turn a two-line feature
 * into a database nobody fills in. The bar is already per-exercise
 * (`Exercise.barWeightKg`, a fact about the movement), the progression step is
 * already per-exercise (`incrementKg`), and between them the only thing left that is
 * genuinely about the building is the rack of plates. One field, so switching gyms
 * is one tap and there is nothing to maintain.
 *
 * ── MIGRATION ──────────────────────────────────────────────────────────────
 *
 * A device upgrading from a build with one `availablePlatesKg` list becomes a device
 * with one gym holding exactly that list (`gymsFromLegacyPlates`). No prompt, no
 * loss: the plate labels on the day after the update are the plate labels on the day
 * before it.
 */

import { DEFAULT_PLATES_KG } from './plates';

export interface Gym {
  id: string;
  /** What the user calls the place. Free text; only ever displayed. */
  name: string;
  /** The plates on the rack there, in kilograms. Sanitized by `clampPlates`. */
  platesKg: number[];
}

/** How many gyms are worth having. Three is home, gym, travel; eight is generous. */
export const MAX_GYMS = 8;

/** The id of the gym a fresh install and every migration starts with. */
export const DEFAULT_GYM_ID = 'gym_default';

/** The name a migrated or fresh single gym gets. Deliberately generic. */
export const DEFAULT_GYM_NAME = 'My gym';

/**
 * A usable plate list: positive, finite, deduplicated, heaviest first.
 *
 * Moved here from `settingsStore` along with the rest of the plate concern. Sorted
 * so the greedy walk in `platesFor` gets a canonical list however the value reached
 * disk, and deduplicated because two 20s in the list is not two 20 kg plates in the
 * gym, it is one entry written twice. An empty or unusable list falls back to the
 * default rather than to nothing: `[]` means every target is unreachable, so every
 * plate label silently disappears, which looks exactly like the feature being broken.
 *
 * Capped at sixteen entries. A real gym has seven sizes; sixteen is room to be
 * unusual, and a blob with four thousand of them is corrupt.
 */
export function clampPlates(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_PLATES_KG];
  const usable = [
    ...new Set(
      value.filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0),
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, 16);
  return usable.length > 0 ? usable : [...DEFAULT_PLATES_KG];
}

/** A gym name that will render: trimmed, capped, never empty. */
export function clampGymName(value: unknown, fallback = DEFAULT_GYM_NAME): string {
  const name = typeof value === 'string' ? value.trim().slice(0, 40) : '';
  return name === '' ? fallback : name;
}

/**
 * One gym holding the legacy single plate list — the upgrade path.
 *
 * Called by `sanitizeSettings` when a persisted blob has `availablePlatesKg` and no
 * `gyms`, which is every device installed before this feature existed.
 */
export function gymsFromLegacyPlates(platesKg: unknown): Gym[] {
  return [{ id: DEFAULT_GYM_ID, name: DEFAULT_GYM_NAME, platesKg: clampPlates(platesKg) }];
}

/**
 * A usable gym list from anything at all. Never empty.
 *
 * Never empty is the load-bearing part: `activeGymPlates` has to return a list, and
 * a plate label that silently vanishes reads as a broken feature rather than as an
 * empty setting. A blob with no readable gym gets the default one.
 */
export function sanitizeGyms(value: unknown): Gym[] {
  if (!Array.isArray(value)) return gymsFromLegacyPlates(undefined);

  const seen = new Set<string>();
  const gyms: Gym[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw == null) continue;
    const entry = raw as { id?: unknown; name?: unknown; platesKg?: unknown };
    const id = typeof entry.id === 'string' && entry.id.trim() !== '' ? entry.id : null;
    // An id is identity — `activeGymId` points at it — so a row without one is not
    // repaired with a generated id that the pointer could never have named.
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    gyms.push({ id, name: clampGymName(entry.name), platesKg: clampPlates(entry.platesKg) });
    if (gyms.length >= MAX_GYMS) break;
  }

  return gyms.length > 0 ? gyms : gymsFromLegacyPlates(undefined);
}

/**
 * The id that is actually active: the requested one where it exists, the first gym
 * otherwise.
 *
 * A dangling pointer is ordinary — deleting the active gym leaves one — so it
 * resolves rather than throws, and it resolves to something that exists so the plate
 * label never goes blank.
 */
export function resolveActiveGymId(gyms: readonly Gym[], requested: unknown): string {
  const id = typeof requested === 'string' ? requested : '';
  return gyms.some((gym) => gym.id === id) ? id : (gyms[0]?.id ?? DEFAULT_GYM_ID);
}

/**
 * The plates in force — the one thing the rest of the app reads.
 *
 * Everything that used to read `Settings.availablePlatesKg` reads this instead, so
 * the whole feature is invisible below this line: `platesFor` still gets one list.
 */
export function activeGymPlates(gyms: readonly Gym[], activeGymId: unknown): number[] {
  const id = resolveActiveGymId(gyms, activeGymId);
  const gym = gyms.find((g) => g.id === id);
  return gym ? gym.platesKg : [...DEFAULT_PLATES_KG];
}

/** The active gym itself, for a row that names where you are. */
export function activeGym(gyms: readonly Gym[], activeGymId: unknown): Gym | null {
  const id = resolveActiveGymId(gyms, activeGymId);
  return gyms.find((g) => g.id === id) ?? null;
}

/**
 * Add a gym, seeded from the one that is active.
 *
 * SEEDED, not empty: a second gym is nearly always the same rack minus the heavy
 * plates, and starting from nothing would mean re-picking seven sizes to express
 * "the same but no 25s". Returns the list unchanged at the cap.
 */
export function addGym(
  gyms: readonly Gym[],
  name: string,
  activeGymId: unknown,
  id: string,
): Gym[] {
  if (gyms.length >= MAX_GYMS) return [...gyms];
  return [
    ...gyms,
    {
      id,
      name: clampGymName(name, `Gym ${gyms.length + 1}`),
      platesKg: activeGymPlates(gyms, activeGymId),
    },
  ];
}

/**
 * Remove a gym. The last one cannot go — there is always somewhere you train.
 */
export function removeGym(gyms: readonly Gym[], id: string): Gym[] {
  if (gyms.length <= 1) return [...gyms];
  const next = gyms.filter((gym) => gym.id !== id);
  return next.length > 0 ? next : [...gyms];
}

/** Rename one gym, or toggle one plate on it — the two edits the screen offers. */
export function updateGym(
  gyms: readonly Gym[],
  id: string,
  patch: Partial<Omit<Gym, 'id'>>,
): Gym[] {
  return gyms.map((gym) =>
    gym.id === id
      ? {
          ...gym,
          ...(patch.name != null ? { name: clampGymName(patch.name, gym.name) } : {}),
          ...(patch.platesKg != null ? { platesKg: clampPlates(patch.platesKg) } : {}),
        }
      : gym,
  );
}

/**
 * Toggle a plate size on one gym.
 *
 * Removing the last plate is refused, exactly as it was when there was one global
 * list: `clampPlates` falls back to the default on an empty array, which would read
 * as "removing my last plate restored all of them".
 */
export function toggleGymPlate(gyms: readonly Gym[], id: string, kg: number): Gym[] {
  const gym = gyms.find((g) => g.id === id);
  if (!gym) return [...gyms];
  const next = gym.platesKg.includes(kg)
    ? gym.platesKg.filter((p) => p !== kg)
    : [...gym.platesKg, kg];
  if (next.length === 0) return [...gyms];
  return updateGym(gyms, id, { platesKg: next });
}
