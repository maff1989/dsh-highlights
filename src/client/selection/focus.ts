/**
 * Focus helpers for the floating surfaces and dialogs.
 *
 * One focus contract: a surface traps Tab inside itself, Escape dismisses, and
 * closing returns focus to the element that had it. Previously each surface
 * hand-rolled part of this (the card did not trap focus; the editor differed).
 */
import type { Disposer } from '../contracts/scope'

/** Elements that can receive keyboard focus. */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Trap Tab inside a container and wire Escape.
 * @param container - dialog/floating root.
 * @param options - Escape handler.
 * @returns disposer removing the listener.
 */
export function trapFocus(container: HTMLElement, options: { readonly onEscape?: () => void } = {}): Disposer {
  /** Focusable children in DOM order. */
  function focusables(): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => element.tabIndex !== -1)
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      options.onEscape?.()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusables()
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (first === undefined || last === undefined) return
    const active = container.ownerDocument.activeElement
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !container.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }
  container.ownerDocument.addEventListener('keydown', onKeyDown)
  return () => { container.ownerDocument.removeEventListener('keydown', onKeyDown) }
}

/**
 * Capture the current focus and return a restore function.
 * @param doc - document to read.
 */
export function captureFocus(doc: Document = document): () => void {
  const active = doc.activeElement
  const previous = active instanceof HTMLElement ? active : null
  return () => {
    if (previous !== null && previous.isConnected) previous.focus()
  }
}
