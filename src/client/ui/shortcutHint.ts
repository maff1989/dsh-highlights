/**
 * The capture chord the plugin actually registered, for first-run guidance.
 *
 * `registerChord` may degrade to a fallback key when a preferred binding is
 * taken, so the empty state must not hard-code a chord it cannot honour. The
 * composition root sets this after a successful registration; the page reads it.
 */
let label: string | null = null

/**
 * Record the registered capture chord.
 * @param value - display label, or null when no chord was free.
 */
export function setCaptureChordLabel(value: string | null): void {
  label = value
}

/**
 * Read the registered capture chord.
 * @returns the display label, or null when no chord was free.
 */
export function captureChordLabel(): string | null {
  return label
}

/**
 * Format one physical key code as a platform chord label.
 * @param code - `KeyboardEvent.code`, e.g. `KeyH`.
 * @returns a label such as a shifted command chord on Apple platforms, or a
 *   `Ctrl+Shift+` chord elsewhere.
 */
export function chordLabel(code: string): string {
  const letter = code.startsWith('Key') ? code.slice(3) : code
  const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform)
  return apple ? `\u21e7\u2318${letter}` : `Ctrl+Shift+${letter}`
}
