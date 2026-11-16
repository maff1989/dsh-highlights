/**
 * "Don't ask again" preference for the undo affordance.
 *
 * The reverse-undo strip is useful, but a perpetual prompt after every delete is
 * noise for readers who never undo. Disabling it suppresses the prompt globally
 * (the delete still happens). Stored in localStorage so it survives reloads;
 * storage failures fall back to "prompt enabled".
 */

/** Storage key owned by the undo prompt preference. */
export const UNDO_PROMPT_KEY = 'dsh.highlights.undoPrompt.v1'

/** Read the preference; true unless the reader explicitly disabled it. */
export function undoPromptEnabled(): boolean {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    return storage?.getItem(UNDO_PROMPT_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Persist the reader's choice to stop showing the undo prompt. */
export function disableUndoPrompt(): void {
  try {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(UNDO_PROMPT_KEY, 'off')
  } catch {
    // A blocked storage area only loses the preference; the session stays usable.
  }
}

/** Clear the preference (tests / a future settings surface). */
export function resetUndoPrompt(): void {
  try {
    (globalThis as { localStorage?: Storage }).localStorage?.removeItem(UNDO_PROMPT_KEY)
  } catch {
    // Nothing to do when storage is unavailable.
  }
}
