/**
 * Turn-tail digest (T4.3), seated in `conversation.chat.turnTail`.
 *
 * One quiet line under a completed turn: `2 highlights · 1 kept`. It reads the
 * already-loaded snapshot (turn number first, event bounds as the fallback),
 * renders nothing for a turn with no annotations, and opens the right-panel
 * Highlights tab on click. The hover preview reuses the sidebar row renderer.
 */
import { useMemo, type ReactNode } from 'react'
import { HoverCard, IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'

import type { SessionSurfacesDeps } from './deps'
import { belongsToTurn, previewOf, turnCounts, type TurnBounds } from './model'
import { PreviewList } from './PreviewList'
import { useSessionRecords } from './use-session-records'

/** How many annotations the hover card previews. */
const TURN_PREVIEW_LIMIT = 3

/** What the registration injects: the shared store face plus the Session scope. */
export interface TurnDigestInjected extends SessionSurfacesDeps {
  /** Session the turn belongs to (the slot's session scope resolves it). */
  readonly sessionId: string
}

/** Props the renderer assembles for this registration. */
export type TurnDigestProps = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'highlights'> & InjectFace<TurnDigestInjected>

/**
 * Render the turn's annotation digest, or nothing.
 * @param props - closing turn, Session scope, snapshot face and localized copy.
 * @returns the digest line.
 */
export function TurnDigest({ turn, sessionId, snapshot, subscribe, openPanel, t }: TurnDigestProps): ReactNode {
  // The owner always passes a resolved turn; degrade to nothing if a future
  // projection hands over an unresolved one.
  const bounds = turn as unknown as TurnBounds | undefined
  const id = typeof sessionId === 'string' ? sessionId : ''
  const records = useSessionRecords({ snapshot, subscribe }, id)
  const turnNo = bounds?.turn
  const startSeq = bounds?.start?.seq
  const endSeq = bounds?.end?.seq
  const status = bounds?.status
  // The owner rebuilds the turn object each render, so the memo keys on its
  // primitives: the counts depend on nothing else about it.
  const counts = useMemo(
    () => (bounds === undefined ? undefined : turnCounts(records, bounds)),
    [records, turnNo, status, startSeq, endSeq], // `bounds` is represented by these primitives.
  )
  const turnRecords = useMemo(
    () => (bounds === undefined ? [] : records.filter(record => belongsToTurn(record, bounds))),
    [records, turnNo, startSeq, endSeq], // `bounds` is represented by these primitives.
  )
  if (typeof turnNo !== 'number' || counts === undefined) return null

  const total = t(counts.total === 1 ? 'turn.tail.count.one' : 'turn.tail.count.other', { count: counts.total })
  const kept = counts.kept === 0
    ? ''
    : t(counts.kept === 1 ? 'turn.tail.kept.one' : 'turn.tail.kept.other', { count: counts.kept })
  const summary = kept === '' ? total : `${total} · ${kept}`
  const preview = previewOf(turnRecords, TURN_PREVIEW_LIMIT)

  return (
    <HoverCard
      variant="compact"
      openDelayMs={300}
      anchor={(
        <button
          type="button"
          className="dshhl-digest"
          onClick={() => { openPanel() }}
          aria-label={t('turn.tail.open', { summary })}
        >
          <IconListPenOutlineRegular size={14} className="dshhl-digest__glyph" aria-hidden="true" />
          <span>{summary}</span>
        </button>
      )}
      content={(
        <div className="dshhl-digest__preview">
          <PreviewList records={preview.shown} />
          {preview.more > 0 && (
            <div className="dshhl-digest__more">{t('sidebar.hover.more', { count: preview.more })}</div>
          )}
        </div>
      )}
    />
  )
}
