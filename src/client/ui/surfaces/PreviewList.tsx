/**
 * Compact quote preview shared by the sidebar hover section and the turn-tail
 * hover card: a colour dot and a one-line excerpt per item.
 *
 * Tone is a class, not a prop tree: the sidebar card paints on the hover-card
 * surface (its own label tokens), the chat card on the ordinary menu material.
 */
import type { ReactNode } from 'react'

import { excerptOf, type SurfaceRecord } from './model'

/** Which surface the rows sit on. */
export type PreviewTone = 'hovercard' | 'card'

/** Props of the preview list. */
export interface PreviewListProps {
  /** Items to show, already ordered and limited. */
  readonly records: readonly SurfaceRecord[]
  /** Surface the rows sit on; selects the hover-card label tokens. */
  readonly tone?: PreviewTone
}

/**
 * Render one quiet row per item.
 * @param props - ordered records and their surface tone.
 * @returns the preview rows.
 */
export function PreviewList({ records, tone = 'card' }: PreviewListProps): ReactNode {
  return (
    <div className={`dshhl-preview${tone === 'hovercard' ? ' dshhl-preview--hovercard' : ''}`}>
      {records.map((record) => (
        <div className="dshhl-preview__row" key={record.id} data-surface-record={record.id}>
          {/* The palette wash is translucent by design; the same custom property every list dot uses. */}
          <span
            className="dshhl-preview__dot"
            style={{ backgroundColor: `var(--dsh-hl-${String(record.colorId)})` }}
            aria-hidden="true"
          />
          <span className="dshhl-preview__text">{excerptOf(record.anchor.quote)}</span>
        </div>
      ))}
    </div>
  )
}
