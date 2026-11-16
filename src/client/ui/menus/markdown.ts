/**
 * Markdown export of one Session's highlights (S4 "Copy this session's
 * highlights").
 *
 * The output is a plain bullet list in transcript order, so it pastes usefully
 * into a message, a note, or a document:
 *
 *     - “the migration must land”
 *       — ship it behind a flag
 *
 * Quotes and notes are collapsed to one line each: a Markdown list item cannot
 * carry a raw newline without turning the remainder into a paragraph, and the
 * annotation's own structure (one quote, at most one note) is what matters in
 * the export, not its original soft wrapping. No colour/tag/date metadata is
 * added — those are list-surface affordances, not content, and the cap keeps
 * the paste bounded.
 */
import type { HighlightRecord } from '../../../shared/schema'
import { sortByPosition } from '../../../shared/position'

/** Maximum items one copy includes. */
export const COPY_ITEM_LIMIT = 50

/**
 * Collapse every whitespace run (including newlines) to one space.
 * @param text - raw user text.
 * @returns one trimmed line.
 */
function oneLine(text: string): string {
  return text.replace(/\s+/gu, ' ').trim()
}

/**
 * Build the Markdown export for one Session.
 * @param records - that Session's records, in any order.
 * @returns the Markdown list (empty string when there is nothing to copy).
 */
export function buildSessionMarkdown(records: readonly HighlightRecord[]): string {
  const ordered = sortByPosition(records.filter(record => record.deletedAt === undefined)).slice(0, COPY_ITEM_LIMIT)
  const lines: string[] = []
  for (const record of ordered) {
    const quote = oneLine(record.anchor.quote)
    if (quote === '') continue
    lines.push(`- “${quote}”`)
    const note = record.note === undefined ? '' : oneLine(record.note)
    if (note !== '') lines.push(`  — ${note}`)
  }
  return lines.join('\n')
}
