/**
 * Clipboard write for the context-menu copy action.
 *
 * Mirrors the mechanism `data/actions-impl.ts` already uses for "Copy quote"
 * (`navigator.clipboard.writeText`, falling back to a hidden textarea and
 * `document.execCommand('copy')` so a plain-HTTP origin still works). It is a
 * separate module because that file belongs to another work package; once the
 * action face exposes a text-level copy, this file can be replaced by that
 * export and deleted. Same contract as the rest of the feature: the boolean is
 * true only when a copy actually happened, and every failure is a `false`,
 * never a throw.
 */

/** The subset of `navigator.clipboard` this module needs. */
interface ClipboardLike {
  readonly writeText?: (value: string) => Promise<void>
}

/**
 * Copy one text to the clipboard.
 * @param text - text to write.
 * @returns whether the text reached the clipboard.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = (globalThis as { navigator?: { clipboard?: ClipboardLike } }).navigator?.clipboard
    if (clipboard?.writeText !== undefined) {
      await clipboard.writeText(text)
      return true
    }
  } catch {
    // A refused Clipboard API is not fatal: fall through to the legacy path.
  }
  return copyWithTextarea(text)
}

/**
 * Legacy copy path: select a hidden textarea and run the native copy command.
 * Works where the asynchronous Clipboard API is unavailable or refused (plain
 * HTTP, older WebViews).
 * @param text - text to write.
 * @returns whether the copy command reported success.
 */
function copyWithTextarea(text: string): boolean {
  const doc = (globalThis as { document?: Document }).document
  if (doc === undefined || doc.body === null) return false
  const previous = doc.activeElement
  const textarea = doc.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  doc.body.append(textarea)
  try {
    textarea.select()
    return typeof doc.execCommand === 'function' && doc.execCommand('copy') === true
  } catch {
    return false
  } finally {
    textarea.remove()
    const focusable = previous as { focus?: () => void } | null
    focusable?.focus?.()
  }
}
