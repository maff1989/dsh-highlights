/**
 * Transcript position of one highlight.
 *
 * Highlights are browsed "by where the text sits in the conversation", not by
 * when they were created. Chat's durable `data-chat-node-key` carries the Turn
 * and Step (`${kind.length}:${kind}${turn}:${step}`), so ordering needs no
 * session read: it is (turn, step, source order, character offset), with
 * creation time only as a tie-break for anchors that never resolved.
 */
import type { HighlightRecord } from './schema'

/** Sort key tuple: earlier wins; `Number.POSITIVE_INFINITY` sorts last. */
export type PositionKey = readonly [number, number, number, number, number]

/** Build the ordering tuple of one record. */
export function positionKey(record: HighlightRecord): PositionKey {
  const anchor = record.anchor
  return [
    anchor.turn ?? Number.POSITIVE_INFINITY,
    anchor.step ?? Number.POSITIVE_INFINITY,
    anchor.sourceIndex,
    anchor.start,
    record.createdAt,
  ]
}

/**
 * Compare two records by transcript position.
 * @param a - First record.
 * @param b - Second record.
 * @returns negative when `a` is earlier, positive when later, 0 when equal.
 */
export function comparePosition(a: HighlightRecord, b: HighlightRecord): number {
  const left = positionKey(a)
  const right = positionKey(b)
  for (let index = 0; index < left.length; index += 1) {
    // Compare with relational operators, not subtraction: two absent anchors
    // both carry `Infinity` here, and `Infinity - Infinity` is NaN, which would
    // silently skip the remaining keys.
    const one = left[index] ?? 0
    const other = right[index] ?? 0
    if (one === other) continue
    return one < other ? -1 : 1
  }
  return 0
}

/**
 * Sort records by transcript position, returning a new array.
 * @param records - Records in any order.
 * @returns a new array in positional order.
 */
export function sortByPosition(records: readonly HighlightRecord[]): HighlightRecord[] {
  return [...records].sort(comparePosition)
}
