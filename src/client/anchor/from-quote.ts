/**
 * Quote → anchor: locate a quoted passage that the agent wrote and turn it into
 * the same anchor the selection gesture produces.
 *
 * The agent cannot know a Chat `nodeKey` or projection offsets — both are
 * client-computed (`anchor/capture.ts`). What it *can* produce verbatim is the
 * text it wrote, so a proposal carries a quote and the client resolves it here
 * against the rendered transcript. Reusing `captureSelection` means the resulting
 * anchor comes from the one authoritative projection rather than a second
 * implementation.
 */
import { captureSelection, type SelectionCandidate } from './capture'

/** A resolved quote and the source element it was found in. */
export interface QuoteMatch {
  /** The range covering the quote. */
  readonly range: Range
  /** The `[data-text-interaction-source]` element the range lives in. */
  readonly source: HTMLElement
}

/**
 * Whether an element is inside a reasoning row (out of this plugin's scope).
 * @param element - candidate element.
 * @returns true when the closest reasoning variant owns it.
 */
function insideReasoning(element: Element): boolean {
  return element.closest('[data-variant="think"]') !== null
}

/**
 * Build a Range for a character window inside one element's text.
 * @param root - element whose text the offsets index.
 * @param start - inclusive character offset.
 * @param end - exclusive character offset.
 * @returns the range, or null when the window is not a single contiguous run.
 */
function rangeIn(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let consumed = 0
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text
    const length = text.data.length
    if (startNode === null && consumed + length > start) {
      startNode = text
      startOffset = start - consumed
    }
    if (startNode !== null && consumed + length >= end) {
      endNode = text
      endOffset = end - consumed
      break
    }
    consumed += length
  }
  if (startNode === null || endNode === null) return null
  const range = document.createRange()
  range.setStart(startNode, Math.max(0, Math.min(startOffset, startNode.data.length)))
  range.setEnd(endNode, Math.max(0, Math.min(endOffset, endNode.data.length)))
  return range
}

/**
 * Find the first rendered occurrence of a quoted passage.
 *
 * Response sources are searched before any other source, and reasoning rows are
 * skipped, because only reply text is annotatable.
 * @param quote - the passage as the agent wrote it.
 * @returns the match, or null when the text is not on screen.
 */
export function findQuoteRange(quote: string): QuoteMatch | null {
  const probe = quote.trim()
  if (probe === '') return null
  const sources = [...document.querySelectorAll<HTMLElement>('[data-text-interaction-source]')]
  const ordered = [
    ...sources.filter(source => !insideReasoning(source)),
    ...sources.filter(source => insideReasoning(source)),
  ]
  for (const source of ordered) {
    const text = source.textContent ?? ''
    let index = text.indexOf(probe)
    while (index !== -1) {
      const range = rangeIn(source, index, index + probe.length)
      if (range !== null) return { range, source }
      index = text.indexOf(probe, index + 1)
    }
  }
  return null
}

/**
 * Capture the anchor of a quoted passage the agent proposed.
 *
 * The selection is borrowed for the duration of the capture because that is the
 * contract `captureSelection` reads; the caller's previous selection is restored,
 * and the capture is synchronous so the user never sees the borrowed selection.
 * @param quote - the passage as the agent wrote it.
 * @returns the anchor candidate, or null when the text is absent or not
 *   capturable (multi-block selection, reasoning row, truncated markup).
 */
export function captureQuote(quote: string): SelectionCandidate | null {
  const match = findQuoteRange(quote)
  if (match === null) return null
  const selection = window.getSelection()
  if (selection === null) return null
  const ranges: Range[] = []
  for (let index = 0; index < selection.rangeCount; index += 1) ranges.push(selection.getRangeAt(index).cloneRange())
  try {
    selection.removeAllRanges()
    selection.addRange(match.range)
    return captureSelection(selection)
  } finally {
    selection.removeAllRanges()
    for (const range of ranges) selection.addRange(range)
  }
}
