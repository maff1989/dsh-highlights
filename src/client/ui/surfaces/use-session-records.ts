/**
 * Snapshot subscription shared by the passive surfaces.
 *
 * `useSyncExternalStore` reads a per-Session record array out of the store's
 * projection. The projection keeps an unchanged Session's array identity, and
 * `NO_RECORDS` is frozen, so a write in some other Session re-runs the read but
 * does not re-render this row.
 */
import { useSyncExternalStore } from 'react'

import type { SessionSurfacesDeps } from './deps'
import { NO_RECORDS, sessionRecords, type SurfaceRecord } from './model'

/** The subscription half a surface needs (components take the whole deps face). */
export type SnapshotSource = Pick<SessionSurfacesDeps, 'snapshot' | 'subscribe'>

/**
 * Live records of one Session.
 * @param source - snapshot/subscribe face.
 * @param sessionId - owning Session; an empty id yields the frozen empty list.
 * @returns that Session's records.
 */
export function useSessionRecords(source: SnapshotSource, sessionId: string): readonly SurfaceRecord[] {
  return useSyncExternalStore(
    source.subscribe,
    () => (sessionId === '' ? NO_RECORDS : sessionRecords(source.snapshot(), sessionId)),
  )
}
