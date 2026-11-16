/**
 * Sidebar Session-row hover section (T4.2), seated in
 * `sidebar.session.row.hover`.
 *
 * The seat renders inside the row's hover card between the relative time and
 * the trailing status lines, and is mounted only while that card is open. It
 * is a preview, not a menu: the top two items (colour dot + quote excerpt),
 * kept items first, plus an omission line. No fetch: the snapshot already
 * carries the records. Content uses the hover card's own dark-surface label
 * tokens so it reads as part of that card in both themes.
 */
import { useMemo, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

import type { SessionSurfacesDeps } from './deps'
import { previewOf } from './model'
import { PreviewList } from './PreviewList'
import { useSessionRecords } from './use-session-records'

/** How many items the hover preview lists. */
const HOVER_PREVIEW_LIMIT = 2

/** Props the renderer assembles for this registration. */
export type SessionHoverProps = PropsRuntime<'sidebar.session.row.hover'> & PropsLocale<'highlights'> & InjectFace<SessionSurfacesDeps>

/**
 * Render the top of this Session's annotations, or nothing.
 * @param props - row Session id, snapshot face and localized copy.
 * @returns the hover-card section.
 */
export function SessionHover({ sessionId, snapshot, subscribe, t }: SessionHoverProps): ReactNode {
  const id = typeof sessionId === 'string' ? String(sessionId) : ''
  const records = useSessionRecords({ snapshot, subscribe }, id)
  const preview = useMemo(() => previewOf(records, HOVER_PREVIEW_LIMIT), [records])
  if (preview.shown.length === 0) return null
  return (
    <div className="dshhl-hover" data-session-highlights-hover="">
      <div className="dshhl-hover__title">{t('sidebar.hover.title')}</div>
      <PreviewList records={preview.shown} tone="hovercard" />
      {preview.more > 0 && (
        <div className="dshhl-hover__more">{t('sidebar.hover.more', { count: preview.more })}</div>
      )}
    </div>
  )
}
