/**
 * Visible conversation bounds for floating selection UI.
 *
 * Chat owns the conversation pane: the header is above the scroller and the
 * composer is a sticky child of it. A fixed popover must be laid out inside the
 * *transcript* area — not over the header, the input, the right sidebar, or the
 * app chrome. This module derives those edges from the range's nearest
 * `[data-conversation-scroll]` and its `[data-composer-seat]`; outside Chat
 * (tests/degraded hosts) it falls back to the viewport.
 */

/** Edges of the usable transcript area. */
export interface ConversationBounds {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/** Find the transcript viewport that owns one range. */
export function conversationBoundsForRange(range: Range): ConversationBounds {
  const container = range.startContainer
  const element = container.nodeType === 1 ? container as Element : container.parentElement
  const scroller = element?.closest<HTMLElement>('[data-conversation-scroll]') ?? null
  const view = (globalThis as { window?: Window }).window
  const fallback: ConversationBounds = {
    left: 0,
    right: view?.innerWidth ?? 0,
    top: 0,
    bottom: view?.innerHeight ?? 0,
  }
  const rect = scroller?.getBoundingClientRect()
  if (rect === undefined || rect.width <= 0) return fallback
  // The composer seat is sticky at the bottom of the same scroller; popovers sit
  // above it even while the text continues underneath.
  const composer = scroller?.querySelector<HTMLElement>('[data-composer-seat]')
  const composerRect = composer?.getBoundingClientRect()
  const bottom = composerRect !== undefined && composerRect.height > 0
    && composerRect.top > rect.top && composerRect.top < rect.bottom
    ? composerRect.top
    : rect.bottom
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: Math.max(rect.top, bottom),
  }
}

/** Space between a selection and a floating surface. */
export const FLOATING_GAP = 8

/** Minimum usable height for a constrained floating surface. */
const MIN_FLOATING_HEIGHT = 80

/** Selection geometry used for placement (union of all line rects). */
export interface SelectionBounds {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
}

/** One placement decision shared by the bar, the new editor and the edit card. */
export interface FloatingPlacement {
  /** Top edge when anchored below the selection (or for a known-height surface). */
  readonly top?: number
  /** Bottom edge when a height-less surface is anchored above the selection. */
  readonly bottom?: number
  readonly left: number
  readonly maxHeight?: number
  readonly hidden: boolean
}

/** Union of a range's client rects. */
export function selectionBoundsOf(rects: readonly DOMRect[]): SelectionBounds | null {
  if (rects.length === 0) return null
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue
    top = Math.min(top, rect.top)
    bottom = Math.max(bottom, rect.bottom)
    left = Math.min(left, rect.left)
    right = Math.max(right, rect.right)
  }
  return Number.isFinite(top) ? { top, bottom, left, right } : null
}

/**
 * Place a floating surface around a selection.
 *
 * The same rule serves the quick bar, the new-annotation editor and the edit
 * card: below the full selection when it fits, otherwise above, otherwise the
 * larger free side with a max-height (the surface scrolls internally) so it
 * never covers the selected text; right-align to the selection when it would
 * cross the conversation-pane edge.
 *
 * @param options - selection rects, transcript bounds, surface width and
 * optional natural height (the edit card does not know its height up front).
 * @returns placement, including `hidden` when no non-overlapping space exists.
 */
export function placeFloating(options: {
  readonly rects: readonly DOMRect[]
  readonly bounds: ConversationBounds
  readonly width: number
  readonly height?: number
}): FloatingPlacement {
  const { rects, bounds, width, height } = options
  const selection = selectionBoundsOf(rects)
  if (selection === null) return { left: 0, hidden: true }
  if (selection.bottom <= bounds.top || selection.top >= bounds.bottom) {
    return { left: 0, hidden: true }
  }

  const gap = FLOATING_GAP
  const minLeft = bounds.left + gap
  const maxLeft = Math.max(minLeft, bounds.right - width - gap)
  let left = selection.left
  if (left + width > bounds.right - gap) left = selection.right - width
  left = Math.min(Math.max(minLeft, left), maxLeft)

  const belowTop = selection.bottom + gap
  const belowRoom = bounds.bottom - gap - belowTop
  const aboveRoom = selection.top - gap - (bounds.top + gap)

  const viewportHeight = (globalThis as { window?: Window }).window?.innerHeight ?? bounds.bottom
  /** Anchor a height-less surface's bottom edge just above the selection. */
  const bottomAbove = viewportHeight - (selection.top - gap)

  let top: number | undefined
  let bottom: number | undefined
  let maxHeight: number | undefined
  if (height !== undefined) {
    if (belowRoom >= height) top = belowTop
    else if (aboveRoom >= height) top = selection.top - gap - height
    else if (belowRoom >= aboveRoom && belowRoom >= MIN_FLOATING_HEIGHT) {
      top = belowTop
      maxHeight = belowRoom
    } else if (aboveRoom >= MIN_FLOATING_HEIGHT) {
      top = bounds.top + gap
      maxHeight = aboveRoom
    } else {
      return { left: 0, hidden: true }
    }
  } else if (belowRoom >= 120 || (belowRoom >= aboveRoom && belowRoom >= MIN_FLOATING_HEIGHT)) {
    top = belowTop
    maxHeight = Math.max(MIN_FLOATING_HEIGHT, belowRoom)
  } else if (aboveRoom >= MIN_FLOATING_HEIGHT) {
    // Height is unknown (edit card): anchor by the bottom edge so the card sits
    // directly above the highlight regardless of its natural height.
    bottom = bottomAbove
    maxHeight = Math.max(MIN_FLOATING_HEIGHT, aboveRoom)
  } else {
    return { left: 0, hidden: true }
  }

  return {
    ...(top === undefined ? {} : { top }),
    ...(bottom === undefined ? {} : { bottom }),
    left,
    ...(maxHeight === undefined ? {} : { maxHeight }),
    hidden: false,
  }
}
