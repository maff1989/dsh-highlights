/**
 * Sidebar Session-row kept badge (T4.2), seated in
 * `sidebar.session.row.trailing`.
 *
 * The seat's contract is explicit: a *non-interactive* decoration after the
 * row's time label, addressed by Session id only — so this is a signal, not a
 * control. Its footprint stays at the icon scale of the trailing strip (glyph +
 * count); the hover card lists what was saved. A Session without kept items
 * renders nothing.
 */
import { useMemo, type ReactNode } from 'react'
import { IconCheckCircleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

import type { SessionSurfacesDeps } from './deps'
import { countKept } from './model'
import { useSessionRecords } from './use-session-records'

/** Props the renderer assembles for this registration. */
export type KeptBadgeProps = PropsRuntime<'sidebar.session.row.trailing'> & PropsLocale<'highlights'> & InjectFace<SessionSurfacesDeps>

/**
 * Render the kept count for this row's Session, or nothing.
 * @param props - row Session id, snapshot face and localized copy.
 * @returns the badge.
 */
export function KeptBadge({ sessionId, snapshot, subscribe, t }: KeptBadgeProps): ReactNode {
  // A row always carries its Session id; degrade to nothing rather than throw
  // if a future owner omits it.
  const id = typeof sessionId === 'string' ? String(sessionId) : ''
  const records = useSessionRecords({ snapshot, subscribe }, id)
  const kept = useMemo(() => countKept(records), [records])
  if (kept === 0) return null
  const accessible = t(kept === 1 ? 'sidebar.kept.aria.one' : 'sidebar.kept.aria.other', { count: kept })
  return (
    <span className="dshhl-kept" data-kept-count={kept}>
      <IconCheckCircleOutlineRegular size={12} className="dshhl-kept__glyph" aria-hidden="true" />
      <span aria-hidden="true">{kept}</span>
      {/* The row is non-interactive, so the full sentence rides a hidden label. */}
      <span className="dshhl-visually-hidden">{accessible}</span>
    </span>
  )
}
