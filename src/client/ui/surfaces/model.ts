/**
 * Pure selectors behind the passive resurfacing surfaces (T4.2, T4.3).
 *
 * Everything here reads the client snapshot's existing projections —
 * `recordsBySession` and the records themselves — so these surfaces never
 * fetch, never query a Host, and cost zero model tokens. Provenance defaults
 * come from `shared/provenance.ts` (zod-free) instead of `shared/schema.ts`:
 * a runtime import of the schema module would inline the whole zod tree into
 * the browser bundle.
 */
import { stateOf } from '../../../shared/provenance'
import type { HighlightsSnapshot } from '../../data/client'

/** One record as the browser store carries it. */
export type SurfaceRecord = HighlightsSnapshot['records'][number]

/** Stable empty list: selectors with no data keep one identity. */
export const NO_RECORDS: readonly SurfaceRecord[] = Object.freeze([])

/** Default excerpt budget of a hover/preview line, in code points. */
const EXCERPT_CHARS = 96

/**
 * Records of one Session, read from the store's per-session projection.
 * @param snapshot - current client snapshot.
 * @param sessionId - owning Session, or empty for an absent identity.
 * @returns that Session's records (empty for an unknown Session).
 */
export function sessionRecords(snapshot: HighlightsSnapshot, sessionId: string): readonly SurfaceRecord[] {
  if (sessionId === '') return NO_RECORDS
  return snapshot.recordsBySession.get(sessionId) ?? NO_RECORDS
}

/**
 * The only state a resurfacing badge may claim: a record the user kept.
 * @param records - records of one Session.
 * @returns how many are in the `kept` cursor state.
 */
export function countKept(records: readonly SurfaceRecord[]): number {
  let kept = 0
  for (const record of records) if (stateOf(record) === 'kept') kept += 1
  return kept
}

/**
 * Preview order: kept items first (the signal), then the most recently touched.
 * Ties fall back to the record id so the order is deterministic.
 * @param records - records of one Session.
 * @param limit - how many to show.
 * @returns the rows to render and how many were left out.
 */
export function previewOf(records: readonly SurfaceRecord[], limit = 2): { readonly shown: readonly SurfaceRecord[]; readonly more: number } {
  const ordered = [...records].sort((left, right) => (rank(left) - rank(right))
    || (right.updatedAt - left.updatedAt)
    || left.id.localeCompare(right.id))
  const shown = ordered.slice(0, limit)
  return { shown, more: Math.max(0, ordered.length - shown.length) }
}

/** Kept-first sort rank; `new` and `compiled` both trail a kept item. */
function rank(record: SurfaceRecord): number {
  return stateOf(record) === 'kept' ? 0 : 1
}

/**
 * One-line excerpt of a quote: whitespace collapsed, hard-cut on a code-point
 * boundary (never inside a surrogate pair) with an ellipsis.
 * @param quote - verbatim highlighted text.
 * @param max - code-point budget.
 * @returns the excerpt, or an empty string for whitespace-only input.
 */
export function excerptOf(quote: string, max: number = EXCERPT_CHARS): string {
  const collapsed = quote.replace(/\s+/gu, ' ').trim()
  if (collapsed === '') return ''
  const points = [...collapsed]
  if (points.length <= max) return collapsed
  return `${points.slice(0, Math.max(1, max - 1)).join('')}…`
}

/** Structural turn bounds the turn-tail owner supplies (a subset of TurnLocation). */
export interface TurnBounds {
  /** Durable turn number. */
  readonly turn: number
  /** Turn lifecycle; an open turn has no digest yet. */
  readonly status?: 'open' | 'closed' | 'unknown' | undefined
  /** Turn start event, when the projection resolved it. */
  readonly start?: { readonly seq: number } | undefined
  /** Turn end event, when the projection resolved it. */
  readonly end?: { readonly seq: number } | undefined
}

/**
 * Whether one record was captured inside the given turn.
 *
 * `anchor.turn` is the primary identity. When capture could not parse it, the
 * record's node sequence falls back to the turn's event bounds — never to
 * `anchor.step`, because step numbers are turn-local and would mis-attribute
 * the same step number across turns.
 * @param record - one stored record.
 * @param turn - bounds of the rendered turn.
 * @returns true when the record belongs to that turn.
 */
export function belongsToTurn(record: SurfaceRecord, turn: TurnBounds): boolean {
  if (record.anchor.turn !== undefined) return record.anchor.turn === turn.turn
  const seq = record.anchor.nodeSeq
  const start = turn.start?.seq
  const end = turn.end?.seq
  if (seq === undefined || start === undefined || end === undefined) return false
  return seq >= start && seq <= end
}

/**
 * Counts for one completed turn's digest.
 * @param records - records of the rendered Session.
 * @param turn - bounds of the rendered turn.
 * @returns total/kept counts, or undefined when the turn has no annotations or
 *   is still open (the seat renders before the action row of completed turns).
 */
export function turnCounts(records: readonly SurfaceRecord[], turn: TurnBounds): { readonly total: number; readonly kept: number } | undefined {
  if (typeof turn.turn !== 'number' || turn.status === 'open') return undefined
  let total = 0
  let kept = 0
  for (const record of records) {
    if (!belongsToTurn(record, turn)) continue
    total += 1
    if (stateOf(record) === 'kept') kept += 1
  }
  return total === 0 ? undefined : { total, kept }
}
