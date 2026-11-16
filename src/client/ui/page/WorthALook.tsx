/**
 * "Worth another look": a small resurfacing block above a list.
 *
 * The block's contract is the plan's: every row appears with exactly one reason,
 * and the reasons are only those the data can prove (see `worthReview`). It is
 * therefore silent by default — no candidates, no block — and it never scores,
 * ranks or guesses. A row opens the item through the surface's existing reveal
 * path; the block itself performs no writes.
 *
 * The first `WORTH_LIMIT` rows render, then a deterministic "Show N more"
 * expands the rest and collapses again. Ordering is fixed by the derivation, so
 * a clock tick cannot reshuffle it.
 */
import { useId, useState } from 'react'
import type { ReactNode } from 'react'

import type { HighlightRecord } from '../../data/actions'
import {
  WORTH_LIMIT,
  WORTH_REASON_KEYS,
  type PageTranslate,
  type WorthCandidate,
} from './grouping'

/** Props of the resurfacing block. */
export interface WorthALookProps {
  /** Namespace-bound copy. */
  readonly t: PageTranslate
  /** Candidates from {@link worthReview}; an empty list renders nothing. */
  readonly candidates: readonly WorthCandidate[]
  /** Open (reveal) one item; the surface owns outcome reporting. */
  readonly onOpen: (record: HighlightRecord) => void
  /** Panel variant: tighter rows for the narrow column. */
  readonly compact?: boolean
  /** Heading level: 2 on a page, 3 when it sits inside the panel. */
  readonly headingLevel?: 2 | 3
}

/**
 * Render the "worth another look" block.
 * @param props - candidates, copy, and the open callback.
 * @returns the block, or null when there is nothing worth showing.
 */
export function WorthALook({
  t,
  candidates,
  onOpen,
  compact = false,
  headingLevel = 2,
}: WorthALookProps): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const headingId = useId()
  if (candidates.length === 0) return null

  const shown = expanded ? candidates : candidates.slice(0, WORTH_LIMIT)
  const remaining = candidates.length - shown.length
  const expandable = candidates.length > WORTH_LIMIT
  const Heading = headingLevel === 3 ? 'h3' : 'h2'

  return (
    <section
      className={compact ? 'dshhl-worth dshhl-worth--compact' : 'dshhl-worth'}
      aria-labelledby={headingId}
    >
      <Heading id={headingId} className="dshhl-worth__title">{t('worth.title')}</Heading>
      <ul className="dshhl-worth__list">
        {shown.map(candidate => (
          <li key={candidate.record.id}>
            <button
              type="button"
              className="dshhl-worth__row"
              title={t('action.reveal')}
              // The visible row is excerpt + reason; the name says both with a
              // separator (CSS gaps are not text, so they add no space).
              aria-label={`${candidate.record.anchor.quote} — ${t(WORTH_REASON_KEYS[candidate.reason])}`}
              onClick={() => { onOpen(candidate.record) }}
            >
              <span
                className="dshhl-worth__dot"
                style={{ backgroundColor: `var(--dsh-hl-${String(candidate.record.colorId)})` }}
                aria-hidden="true"
              />
              <span className="dshhl-worth__excerpt">{candidate.record.anchor.quote}</span>
              <span className="dshhl-worth__reason">{t(WORTH_REASON_KEYS[candidate.reason])}</span>
            </button>
          </li>
        ))}
      </ul>
      {expandable && (
        <button
          type="button"
          className="dshhl-worth__more"
          onClick={() => { setExpanded(current => !current) }}
        >
          {expanded ? t('worth.less') : t('worth.more', { count: remaining })}
        </button>
      )}
    </section>
  )
}
