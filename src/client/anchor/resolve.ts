/**
 * Re-locating a stored anchor in the live transcript.
 *
 * Anchors survive reload, re-render and mode changes because they identify the
 * node and the source element, not a DOM node reference. Resolution is a
 * four-step ladder: the recorded position (verified by quote and context), a
 * unique quote match, the best of several quote matches, then a stale result.
 * A stale result is a normal state — the list still shows the item and offers
 * re-anchoring — never an error.
 */
import type { HighlightRecord } from '../../shared/schema'
import { projectSource, type SourceProjection } from './projection'
import { findNodeSeats, pickNodeSeat } from './seat'

/**
 * Per-pass projection cache.
 *
 * Several records commonly live in the same source element (a paragraph with
 * three highlights, a message mark plus text highlights). Projecting a source
 * walks its DOM and builds the text once; reusing the projection inside one
 * resolve pass keeps a repaint proportional to sources, not records.
 */
export type ProjectionCache = WeakMap<HTMLElement, SourceProjection>

/**
 * The projection for one source, memoised when a cache is supplied.
 * @param source - the source element.
 * @param cache - optional per-pass cache.
 * @returns the projection.
 */
function projectionOf(source: HTMLElement, cache: ProjectionCache | undefined): SourceProjection {
  if (cache === undefined) return projectSource(source)
  const cached = cache.get(source)
  if (cached !== undefined) return cached
  const projection = projectSource(source)
  cache.set(source, projection)
  return projection
}

/** Why a record could not be resolved. */
export type StaleReason =
  /** The assistant node is not rendered (history window, session not open). */
  | 'node-absent'
  /** The node is rendered but the source element is not (folded/collapsed content). */
  | 'source-absent'
  /** The source is rendered but the recorded text no longer matches it. */
  | 'text-mismatch'

/** One resolution attempt. */
export type Resolution =
  | { readonly ok: true; readonly range: Range }
  | { readonly ok: false; readonly reason: StaleReason }

/**
 * Every rendered Chat seat, grouped by node key, built once per resolve pass.
 *
 * One record per node is the normal case; a split assistant step renders two
 * seats under the same key. The index keeps the per-pass cost at one DOM walk
 * instead of one attribute-selector scan per record, which is what made a
 * repaint grow with the transcript during streaming.
 */
export type SeatIndex = ReadonlyMap<string, readonly HTMLElement[]>

/**
 * Index every rendered seat under `[data-chat-node-key]` in one walk.
 * @param scope - subtree to search (a Document, or one conversation root).
 * @returns node key -> its seats in DOM order.
 */
export function indexSeats(scope: ParentNode = document): Map<string, HTMLElement[]> {
  const index = new Map<string, HTMLElement[]>()
  for (const element of scope.querySelectorAll<HTMLElement>('[data-chat-node-key]')) {
    const nodeKey = element.dataset.chatNodeKey
    if (nodeKey === undefined || nodeKey === '') continue
    const seats = index.get(nodeKey)
    if (seats === undefined) index.set(nodeKey, [element])
    else seats.push(element)
  }
  return index
}

/**
 * The assistant response/flat seat for one anchor, when rendered.
 *
 * Chat can render the same `data-chat-node-key` on a reasoning row and a
 * response row; `pickNodeSeat` picks the paint-able one and honours the
 * anchor's recorded group part. With a pass index the seats come from it
 * without touching the DOM again.
 * @param nodeKey - Chat's node key.
 * @param groupPart - recorded occurrence, when known.
 * @param scope - subtree searched when no index is supplied.
 * @param seats - per-pass seat index, when the caller built one.
 * @returns the paint-able seat, or null.
 */
function nodeOf(
  nodeKey: string,
  groupPart: 'reasoning' | 'response' | undefined,
  scope: ParentNode,
  seats: SeatIndex | undefined,
): HTMLElement | null {
  const candidates = seats === undefined ? findNodeSeats(nodeKey, scope) : seats.get(nodeKey) ?? []
  return pickNodeSeat(candidates, nodeKey, groupPart)
}

/** True when the source belongs to the reasoning body. */
function isReasoningSource(source: HTMLElement): boolean {
  return source.closest('[data-variant="think"]') !== null
}

/** The selection sources of a node, in DOM order, restricted to reply text. */
function replySources(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>('[data-text-interaction-source]')].filter(source => !isReasoningSource(source))
}

/** Every occurrence of `needle` in `haystack`. */
function occurrences(haystack: string, needle: string): number[] {
  if (needle.length === 0) return []
  const found: number[] = []
  let index = haystack.indexOf(needle)
  while (index >= 0) {
    found.push(index)
    index = haystack.indexOf(needle, index + Math.max(needle.length, 1))
  }
  return found
}

/** Score one occurrence by how much recorded context agrees with it. */
function contextScore(text: string, start: number, length: number, prefix: string, suffix: string): number {
  const before = text.slice(Math.max(0, start - prefix.length), start)
  const after = text.slice(start + length, start + length + suffix.length)
  let score = 0
  for (let index = 1; index <= prefix.length; index += 1) {
    if (before.slice(-index) === prefix.slice(-index)) score += 1
    else break
  }
  for (let index = 1; index <= suffix.length; index += 1) {
    if (after.slice(0, index) === suffix.slice(0, index)) score += 1
    else break
  }
  return score
}

/**
 * Resolve one record's anchor against the current document.
 * @param record - The stored record.
 * @param scope - Parent node to search (a Document, or the target session's
 * conversation root so a colliding node key in another session cannot win).
 * @param projections - Optional per-pass cache shared across records.
 * @param seats - Optional per-pass seat index (built by `resolveAll`).
 * @returns the resolved Range or a stale reason.
 */
export function resolveRecord(
  record: HighlightRecord,
  scope: ParentNode = document,
  projections?: ProjectionCache,
  seats?: SeatIndex,
): Resolution {
  const anchor = record.anchor
  const node = nodeOf(anchor.nodeKey, anchor.groupPart, scope, seats)
  if (node === null) {
    // A node rendered only as its reasoning row has no paint-able reply source:
    // keep that distinct from "the node is not rendered at all" for diagnostics.
    const rendered = seats === undefined ? findNodeSeats(anchor.nodeKey, scope) : seats.get(anchor.nodeKey) ?? []
    return { ok: false, reason: rendered.length > 0 ? 'source-absent' : 'node-absent' }
  }

  const sources = replySources(node)
  const source = sources[anchor.sourceIndex] ?? sources[0]
  if (source === undefined) return { ok: false, reason: 'source-absent' }

  const projection = projectionOf(source, projections)
  const text = projection.text
  const { start, end, quote, prefix, suffix } = anchor

  // 1) The recorded position, verified by the quote and its context.
  const recordedLength = end - start
  if (recordedLength > 0 && text.slice(start, end) === quote) {
    const range = projection.rangeAt(start, end)
    if (range !== null) return { ok: true, range }
  }

  // 2) A truncated long selection: the stored quote is a prefix of the slice.
  if (quote.length > 0 && recordedLength >= quote.length && text.slice(start, start + quote.length) === quote) {
    const range = projection.rangeAt(start, end)
    if (range !== null) return { ok: true, range }
  }

  // 3) Unique quote occurrence.
  const hits = occurrences(text, quote)
  if (hits.length === 1) {
    const only = hits[0] ?? 0
    const range = projection.rangeAt(only, only + quote.length)
    if (range !== null) return { ok: true, range }
  }

  // 4) Several occurrences: pick the one whose context agrees most.
  if (hits.length > 1) {
    let best = hits[0] ?? 0
    let bestScore = -1
    for (const hit of hits) {
      const score = contextScore(text, hit, quote.length, prefix, suffix)
      if (score > bestScore) {
        bestScore = score
        best = hit
      }
    }
    const range = projection.rangeAt(best, best + quote.length)
    if (range !== null) return { ok: true, range }
  }

  return { ok: false, reason: 'text-mismatch' }
}

/**
 * Resolve every record that belongs to the given session.
 * @param records - Records for one session.
 * @param scope - Parent node to search (document, or one conversation root).
 * @returns resolved ranges keyed by record id, and the ids that went stale.
 */
export function resolveAll(
  records: readonly HighlightRecord[],
  scope: ParentNode = document,
): { readonly ranges: Map<string, Range>; readonly stale: Map<string, StaleReason> } {
  const ranges = new Map<string, Range>()
  const stale = new Map<string, StaleReason>()
  const projections: ProjectionCache = new WeakMap()
  // One DOM walk for every record, instead of one attribute-selector scan per
  // record on every repaint (the largest steady-state plugin cost found by the
  // 2026-11-12 audit: ~5 ms/frame on a 16k-node transcript, scaling with size).
  const seats = indexSeats(scope)
  for (const record of records) {
    const resolution = resolveRecord(record, scope, projections, seats)
    if (resolution.ok) ranges.set(record.id, resolution.range)
    else stale.set(record.id, resolution.reason)
  }
  return { ranges, stale }
}
