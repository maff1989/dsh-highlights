/**
 * Admission rules for the plugin-owned right-click gesture.
 *
 * The plugin owns the `contextmenu` gesture over a highlightable selection
 * instead of Chat's interaction dispatcher, because Chat anchors a contextmenu
 * surface at the pointer by design (it cannot be asked to anchor to the
 * selection) and cannot be repositioned from inside the entry it renders. This
 * module restates the two rules that decide whether a right-click belongs to
 * the plugin: Chat's own admission (an enabled text source, no target that owns
 * a menu, the point inside the live selection) and the plugin's capture scope
 * (`captureSelection` in the component). Everything else keeps the browser
 * menu.
 *
 * The caller checks its own floating bar and menu separately: that is plugin
 * chrome, not transcript text.
 */
import { conversationBoundsForRange, selectionBoundsOf } from './bounds'

/** Class of the bar's portalled More menu, whose portal sits outside the bar element. */
export const AFFORDANCE_MENU_CLASS = 'dshhl-affordance__menuList'

/**
 * Targets that own their own right-click menu, or that are not transcript text.
 *
 * `a[href]` and `[data-context-menu-trigger]` are deliberately stricter than
 * Chat's own rule: a link, file chip, or button inside a selection keeps its
 * menu instead of being replaced by the highlight bar.
 */
export const CONTEXT_MENU_BLOCKED_SELECTOR = [
  'a[href]',
  '[data-context-menu-trigger]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[data-text-interaction-exclude]',
  `.${AFFORDANCE_MENU_CLASS}`,
].join(', ')

/**
 * Whether the event is the keyboard context-menu key (Shift+F10 or the ≣ key).
 *
 * Browsers report `(0, 0)` for a menu opened from the keyboard, which is a
 * position the reader never aimed at; the native menu therefore stays the
 * keyboard reader's menu.
 * @param event - the contextmenu event.
 * @returns whether the gesture came from the keyboard rather than the pointer.
 */
export function isKeyboardContextMenu(event: MouseEvent): boolean {
  return event.clientX === 0 && event.clientY === 0
}

/**
 * Whether the reader asked for the browser's own menu.
 *
 * Shift is the conventional bypass and is what Firefox already honours for
 * pages that cancel the event. Ctrl is not used: on macOS Control-click is the
 * trackpad's secondary click, so it must stay a normal right-click.
 * @param event - the contextmenu event.
 * @returns whether the plugin must stand aside.
 */
export function isNativeMenuGesture(event: MouseEvent): boolean {
  return event.shiftKey
}

/** Vertical slack for the leading between two selected lines (a line box is shorter than its line pitch). */
const LINE_GAP_TOLERANCE_PX = 8

/**
 * Whether one viewport point falls inside a range's rendered lines.
 *
 * A line box covers the glyphs, not the leading between lines: with a 16 px box
 * and a 24 px pitch the 7 px band between two selected lines is outside every
 * rect, and a right-click there was rejected — common on multi-line paragraphs
 * (the last paragraph failed while a short list item worked). Interior bands
 * therefore count as inside the selection; the outer edges of the range stay
 * strict, so a click above the first or below the last line never claims.
 * @param range - the range to hit-test.
 * @param clientX - viewport X of the right-click.
 * @param clientY - viewport Y of the right-click.
 * @returns whether the point is inside the rendered range.
 */
export function pointInsideRange(range: Range, clientX: number, clientY: number): boolean {
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  const rects = [...range.getClientRects()]
  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue
    top = Math.min(top, rect.top)
    bottom = Math.max(bottom, rect.bottom)
  }
  if (!Number.isFinite(top)) return false
  for (const rect of rects) {
    if (clientX < rect.left || clientX > rect.right) continue
    if (clientY >= rect.top && clientY <= rect.bottom) return true
    // Interior leading between two lines belongs to the selection; outside the
    // vertical span of the whole range it does not.
    if (clientY >= top && clientY <= bottom
      && clientY >= rect.top - LINE_GAP_TOLERANCE_PX && clientY <= rect.bottom + LINE_GAP_TOLERANCE_PX) return true
  }
  return false
}

/**
 * The enabled text source under one contextmenu event, when it belongs to this
 * session's conversation and no menu-owning target blocks it.
 * @param event - the contextmenu event.
 * @param sessionId - session whose conversation this plugin instance serves.
 * @returns the source element, or null when the gesture is not the plugin's.
 */
export function contextMenuSource(event: MouseEvent, sessionId: string): HTMLElement | null {
  const target = event.target instanceof Element ? event.target : null
  if (target === null || target.closest(CONTEXT_MENU_BLOCKED_SELECTOR) !== null) return null
  const source = target.closest<HTMLElement>('[data-text-interaction-source]')
  if (source === null) return null
  const session = source.closest<HTMLElement>('[data-conversation-session]')
  if (session?.dataset.conversationSession !== sessionId) return null
  return source
}

/**
 * Whether a selection is inside the visible transcript, i.e. the bar can place.
 *
 * A selection scrolled behind the composer or out of the transcript keeps the
 * browser menu: claiming the gesture there would suppress the menu for a bar
 * that could only hide itself.
 * @param range - the selection range.
 * @returns whether the selection intersects the visible transcript bounds.
 */
export function selectionIsVisible(range: Range): boolean {
  const bounds = conversationBoundsForRange(range)
  const union = selectionBoundsOf([...range.getClientRects()])
  return union !== null && union.bottom > bounds.top && union.top < bounds.bottom
}
