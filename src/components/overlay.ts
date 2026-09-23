/**
 * "Is something modal on screen right now" — one boolean, outside React's tree.
 *
 * ── THE PROBLEM THE FLOATING NAV PILL CREATED ─────────────────────────────
 *
 * The tab bar used to be a docked strip at the bottom of `AppShell`, below the
 * section. A sheet raised inside a section covered the section and stopped at
 * the bar, which was fine: the bar was never over the sheet because it was never
 * over anything.
 *
 * The pill floats now (`components/TabBar.tsx`), and it is a SIBLING of the
 * whole section rather than a child of it — so it paints on top of everything a
 * section draws, including a sheet's scrim. `zIndex` cannot fix that: it orders
 * siblings, and the sheet is three levels deeper in a different subtree.
 *
 * ── AND WHY THIS RATHER THAN A `Modal` ────────────────────────────────────
 *
 * Rendering the sheets in a React Native `Modal` would put them in their own
 * window, above the pill, and it is the textbook answer. It also puts every
 * `TextInput` in `TaskEditorSheet` and `CategoryEditorSheet` into a window with
 * its own soft-input mode — and this app runs `softwareKeyboardLayoutMode: pan`,
 * chosen in `app.json` for the way the set editors behave. Swapping the window
 * under a text field to fix a paint order is a large change to make for a small
 * reason.
 *
 * So: a sheet says it exists, and the shell does not draw the pill while one
 * does. Which is also the honest behaviour — a sheet is modal, so a tab bar
 * under it was never something that should have been pressable.
 *
 * A COUNTER rather than a flag, because two overlays can legitimately overlap
 * (a confirmation raised from inside a sheet), and the first one to close must
 * not bring the pill back under the second.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler } from 'react-native';

let open = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Declare that this component is a modal overlay for as long as it is mounted.
 *
 * In an effect rather than at render time: React may render a component it
 * then throws away, and a count incremented during a discarded render is a
 * count that never comes back down.
 *
 * `onBack` is what Android's back gesture means while it is up — the caller's
 * NON-committal answer. Without it back went straight past the sheet: at a tab
 * root it left the app, on a pushed screen it popped the screen underneath and
 * left the sheet's question standing, so "Delete X?" reappeared the next time
 * the library opened. Registered after the shell's own handler, and Android
 * asks the newest one first, so the sheet answers before the stack does.
 */
export function useIsOverlay(onBack?: () => void): void {
  useEffect(() => {
    open += 1;
    emit();
    return () => {
      open -= 1;
      emit();
    };
  }, []);

  // Through a ref, so a caller passing a fresh closure every render does not
  // re-register (and re-order) the listener on every render.
  const back = useRef(onBack);
  back.current = onBack;
  const handlesBack = onBack !== undefined;
  useEffect(() => {
    if (!handlesBack) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back.current?.();
      return true;
    });
    return () => sub.remove();
  }, [handlesBack]);
}

/**
 * The same fact, read once rather than subscribed — for a gesture handler that
 * has to decide at the moment of a touch, not on the next render.
 */
export function isOverlayOpen(): boolean {
  return open > 0;
}

/** True while any overlay is mounted. Subscribed, so the shell re-renders. */
export function useOverlayOpen(): boolean {
  const snapshot = useCallback(() => open > 0, []);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
