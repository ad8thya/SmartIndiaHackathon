/**
 * A short buzz on primary actions, where the device supports it.
 *
 * `navigator.vibrate` exists on Android Chrome and nowhere else that matters —
 * iOS Safari has never shipped it. That is fine and it is why every call is
 * fire-and-forget: haptics are confirmation of something the screen already
 * showed, never the only feedback. Nothing here may gate behaviour on the
 * result.
 *
 * It is also blocked until the user has interacted with the page, and throws
 * in some embedded webviews, hence the try/catch.
 */

type Pattern = 'tap' | 'confirm' | 'warn';

const PATTERNS: Record<Pattern, number | number[]> = {
  /** a button did something */
  tap: 12,
  /** a report was sent, a repair was closed — worth two beats */
  confirm: [14, 40, 22],
  /** something was refused or failed */
  warn: [30, 60, 30],
};

export function haptic(pattern: Pattern = 'tap'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // A device that refuses to vibrate is not an error condition.
  }
}
