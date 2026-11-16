/**
 * Session mini-map (T4.4): a compact rail of marks in the session header, one
 * per annotation in the current Session, so any mark can be jumped back to
 * without opening the right panel.
 *
 * The rail is a navigation control, not a second list: it shows position, not
 * detail. Ordering is **transcript order** (`anchor.turn`, then `step`, then
 * `nodeSeq`, then id), which is stable across reloads and does not depend on
 * the transcript's current scroll position. Layout is derived from the ordered
 * record count alone — every mark is placed at a percentage of a fixed-width
 * rail — so the component performs no layout reads and adds nothing to the
 * paint path.
 *
 * Fewer than two annotations render nothing: a single dot is noise in a header
 * that already carries a Highlights button. When a session has more marks than
 * the rail can space legibly, the tail aggregates into one last "N more" mark
 * that opens the panel instead of a transcript position.
 */
import type { ReactNode } from 'react'

import type { HighlightRecord } from '../../shared/schema'

/**
 * Marks the rail can space legibly before the remainder aggregates. The rail is
 * 120px wide with 14px marks: 8 marks leave ~15px between centres.
 */
export const MINIMAP_MAX_MARKS = 8

/** Bounded rail width in CSS px (mirrored by `.dshhl-minimap` in styles.ts). */
const RAIL_WIDTH_PX = 120

/** Mark hit-area width in CSS px (mirrored by `.dshhl-minimap__mark`). */
const MARK_WIDTH_PX = 14

/** Longest excerpt carried by a mark's accessible name and tooltip. */
const EXCERPT_MAX_CHARS = 80

/** Props of the mini-map. */
export interface SessionMiniMapProps {
  /** The current Session's live records (the bridge's session slice). */
  readonly records: readonly HighlightRecord[]
  /** Namespace-bound translate function. */
  readonly t: (key: string, params?: Record<string, string | number>) => string
  /** Reveal one annotation in the transcript. */
  readonly onReveal: (record: HighlightRecord) => void
  /** Open the Session's Highlights tab (the overflow mark's target). */
  readonly onOpenPanel: () => void
}

/** One rail position: an annotation, or the aggregated remainder. */
type Mark =
  | { readonly kind: 'record'; readonly record: HighlightRecord }
  | { readonly kind: 'more'; readonly count: number }

/**
 * Compare two optional ordinals, sorting unknown values last.
 * @param a - left value.
 * @param b - right value.
 * @returns negative/zero/positive comparator result.
 */
function compareOrdinal(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  return a - b
}

/**
 * Order records by transcript position, deterministically.
 * @param records - any order.
 * @returns a new array in turn → step → nodeSeq → id order.
 */
export function orderRecords(records: readonly HighlightRecord[]): HighlightRecord[] {
  return [...records].sort((left, right) => {
    const turn = compareOrdinal(left.anchor.turn, right.anchor.turn)
    if (turn !== 0) return turn
    const step = compareOrdinal(left.anchor.step, right.anchor.step)
    if (step !== 0) return step
    const nodeSeq = compareOrdinal(left.anchor.nodeSeq, right.anchor.nodeSeq)
    if (nodeSeq !== 0) return nodeSeq
    if (left.id === right.id) return 0
    return left.id < right.id ? -1 : 1
  })
}

/**
 * Collapse one quote into a single-line excerpt for the mark's name.
 * @param quote - the record's anchored text.
 * @returns whitespace-normalised, length-capped copy.
 */
function excerptOf(quote: string): string {
  const text = quote.replace(/\s+/gu, ' ').trim()
  return text.length > EXCERPT_MAX_CHARS ? `${text.slice(0, EXCERPT_MAX_CHARS - 1)}…` : text
}

/**
 * Plan the rail from the Session's records.
 * @param records - live records of the current Session.
 * @returns the ordered marks, or an empty array when the rail is hidden.
 */
function marksOf(records: readonly HighlightRecord[]): Mark[] {
  if (records.length < 2) return []
  const ordered = orderRecords(records)
  if (ordered.length <= MINIMAP_MAX_MARKS) {
    return ordered.map(record => ({ kind: 'record' as const, record }))
  }
  // Show the first (MAX - 1) positions and let the last slot aggregate the rest.
  const shown = ordered.slice(0, MINIMAP_MAX_MARKS - 1)
  return [
    ...shown.map(record => ({ kind: 'record' as const, record })),
    { kind: 'more' as const, count: ordered.length - shown.length },
  ]
}

/**
 * Render the session-header rail.
 * @param props - the Session's records, copy, and the two targets.
 * @returns the rail, or null when there is nothing to show.
 */
export function SessionMiniMap({ records, t, onReveal, onOpenPanel }: SessionMiniMapProps): ReactNode {
  const marks = marksOf(records)
  if (marks.length === 0) return null

  // Deterministic spacing from the plan alone: no measurement, no layout reads.
  // The first mark's centre sits half a mark inside the rail so its hit area
  // stays within the bounded width; the last centre lands on the far inset.
  const insetPx = MARK_WIDTH_PX / 2
  const span = RAIL_WIDTH_PX - MARK_WIDTH_PX
  const stepPx = span / (marks.length - 1)

  return (
    <div className="dshhl-minimap" role="group" aria-label={t('minimap.label')} {...{ 'data-dshhl-minimap': '' }}>
      {marks.map((mark, index) => {
        const left = `${String(insetPx + index * stepPx)}px`
        if (mark.kind === 'more') {
          const moreCopy = t('minimap.more', { count: mark.count })
          return (
            <button
              key="more"
              type="button"
              className="dshhl-minimap__mark dshhl-minimap__mark--more"
              style={{ left }}
              title={moreCopy}
              aria-label={moreCopy}
              onClick={onOpenPanel}
            >
              <span className="dshhl-minimap__moreLabel" aria-hidden="true">+</span>
            </button>
          )
        }
        const name = excerptOf(mark.record.anchor.quote)
        return (
          <button
            key={mark.record.id}
            type="button"
            className="dshhl-minimap__mark"
            style={{ left }}
            title={name}
            aria-label={name}
            data-record-id={mark.record.id}
            onClick={() => { onReveal(mark.record) }}
          >
            <span
              className="dshhl-minimap__dot"
              aria-hidden="true"
              style={{ background: `var(--dsh-hl-${String(mark.record.colorId)})` }}
            />
          </button>
        )
      })}
    </div>
  )
}
