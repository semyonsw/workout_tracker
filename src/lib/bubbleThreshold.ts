/**
 * THE FLOATING BUBBLE — when a section's hero has scrolled far enough away to be
 * carried along at the top, and when it is back.
 *
 * Two thresholds, not one, and the gap between them is the whole point: with a
 * single line at 170 a list that comes to rest ON the line — a thumb lifting a
 * few pixels either side of it, the inertia settling — flips the capsule in and
 * out on every frame, which reads as a flicker rather than as a layer. So it
 * appears past 190 and only leaves below 150, and anywhere in between it keeps
 * whatever it was already doing.
 *
 * Pure, so the screen can call it on every scroll event and only set state when
 * the answer actually changes.
 */

export const BUBBLE_SHOW_Y = 190;
export const BUBBLE_HIDE_Y = 150;

export function nextBubbleVisible(
  visible: boolean,
  y: number,
  show: number = BUBBLE_SHOW_Y,
  hide: number = BUBBLE_HIDE_Y,
): boolean {
  if (!Number.isFinite(y)) return visible;
  if (!visible && y > show) return true;
  if (visible && y < hide) return false;
  return visible;
}
