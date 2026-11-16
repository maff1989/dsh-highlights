/**
 * Composer-dock strip: the pending-insertion queue, made visible.
 *
 * A quote inserted into a session whose composer is busy (or not mounted yet) is
 * queued and retried in the background. Until this strip existed that queue was
 * invisible: the user saw "queued" and then nothing until it landed — or expired
 * after 24 hours. The strip is informational only; it owns no retry logic and no
 * dismissal, because the queue is the service's.
 */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import type { HighlightsKey } from '../locales'
import type { InsertService } from '../services/insert'

/** Props the dock slot injects. */
export interface PendingInsertStripProps {
  /** Namespace-bound translate function. */
  readonly t: (key: HighlightsKey, params?: Record<string, string | number>) => string
  /** The app-scoped insertion queue. */
  readonly insert: InsertService
  /** Session this composer belongs to. */
  readonly sessionId: string
}

/**
 * Render the queued-insert count for one session, or nothing.
 * @param props - translation, the queue, and the session.
 * @returns the strip, or null when nothing is pending.
 */
export function PendingInsertStrip({ t, insert, sessionId }: PendingInsertStripProps): ReactNode {
  const count = useSyncExternalStore(
    listener => insert.subscribe(listener),
    () => insert.pendingFor(sessionId).length,
  )
  if (count <= 0) return null
  return (
    <div className="dshhl-dock" role="status">
      <span className="dshhl-dock__text">
        {count === 1 ? t('insert.pending.one') : t('insert.pending.other', { count: String(count) })}
      </span>
    </div>
  )
}
