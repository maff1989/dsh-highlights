/**
 * The session-scoped host that makes highlights visible in the conversation.
 *
 * Mounted in Chat's Session utility row, it renders nothing of its own: while a
 * Session is on screen it (1) keeps the painter in step with the transcript by
 * re-resolving anchors after DOM mutations, coalesced to one animation frame,
 * (2) registers this Session's composer bridge so quotes can be inserted, and
 * (3) opens the item card when the reader clicks painted text.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

import type { ObservationService } from '../contracts/observation'
import type { SelectionGesture } from '../contracts/selection'
import type { CommandSurface } from '../commands/surface'
import { createActionSurface } from '../commands/surface'
import type { NoticeService } from '../contracts/notice'
import { createCssHighlightAdapter, createOverlayAdapter } from '../paint/adapters'
import { HighlightOverlay } from '../paint/adapters/overlay'
import { createDecorationPipeline } from '../paint/pipeline'
import { captureFocus, trapFocus } from '../selection/focus'
import { createFloatingPositioner } from '../selection/placement'
import type { HighlightRecord } from '../../shared/schema'
import type { HighlightDraft } from '../data/actions'
import type { HighlightsActionsImpl } from '../data/actions-impl'
import { EMPTY_RECORDS, type HighlightsClient, type HighlightsSnapshot } from '../data/client'
import type { HighlightsPainter } from '../paint/adapters/css-highlights'
import type { InsertService } from '../services/insert'
import { ItemCard } from './ItemCard'
import { SessionMiniMap } from './SessionMiniMap'
import { conversationBoundsForRange, placeFloating, type ConversationBounds } from '../selection/bounds'
import { SelectionAffordance } from './SelectionAffordance'

/** The minimal Chat node-store shape the bridge reads for durable ids. */
interface ChatNodeStoreLike {
  get(key: string): {
    readonly anchorSeq?: number
    readonly data?: { readonly finalNode?: { readonly messageId?: string } }
  } | undefined
}

/** Shape the selection affordance consumes (a node-store holder). */
interface ChatSnapshotLike {
  readonly nodes?: ChatNodeStoreLike
}

/** What the plugin injects into the bridge. */
export interface SessionBridgeInjected {
  /** The record set, for painting. */
  readonly hooks: { readonly snap: ObservableSnapshot<HighlightsSnapshot> }
  /** The action object the card uses. */
  readonly actions: HighlightsActionsImpl
  /** The plugin's painter (one per plugin, not per session). */
  readonly painter: HighlightsPainter
  /** Copy one text to the clipboard; true when it reached it. */
  readonly copy: (text: string) => Promise<boolean>
  /** The plugin's insertion queue and bridge registry. */
  readonly insert: InsertService
  /** The store itself (record lookup by id, stale-set publication). */
  readonly client: HighlightsClient
  /** App-scoped observer/visibility/paint-frame service. */
  readonly observation: ObservationService
  /** App-scoped selection state owner (optional in legacy unit harnesses). */
  readonly selection?: SelectionGesture
  /** Command-routed action face (falls back to the legacy action adapter in tests). */
  readonly commands?: CommandSurface
  /** One notice channel, rendered by the app-level NoticeOverlay (T1.4). */
  readonly notice?: NoticeService
  /** Open this session's Highlights tab in the right panel. */
  readonly openTab: () => void
  /** Persist a captured selection (the composition root owns the session context). */
  readonly createSelection: (
    anchor: import('../../shared/schema').HighlightAnchor,
    sessionId: string,
    draft: HighlightDraft,
    ids: { messageId?: string; nodeSeq?: number },
  ) => void
}

/** Props the renderer assembles for this registration. */
export type SessionBridgeProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'highlights'> & InjectFace<SessionBridgeInjected>

/** A card opened for one painted range. */
interface CardState {
  readonly recordId: string
}

/** Visual width of the item card (shared with `.dshhl-card` in styles.ts). */
const CARD_WIDTH = 272

/**
 * Keep the transcript painted and the composer bridge registered.
 * @param props - Session standard props and the injected plugin services.
 * @returns nothing; the card renders through a portal when open.
 */
export function SessionBridge({ sessionId, t, useSnap, useChat, inputActions, actions, painter, copy, insert, client, observation, selection, commands, notice, createSelection, openTab }: SessionBridgeProps): ReactNode {
  const ops = useMemo(() => commands ?? createActionSurface(actions), [actions, commands])
  // Identity-stable session slice: an unrelated write does not re-render this bridge.
  const records = useSnap(snapshot => snapshot.recordsBySession.get(String(sessionId)) ?? EMPTY_RECORDS)
  // The node store's object identity is stable across Chat snapshots, so this
  // selects it once instead of subscribing this component to every token.
  const chatNodes = useChat(snapshot => snapshot.nodes) as unknown as ChatNodeStoreLike | undefined
  const chat = useMemo<ChatSnapshotLike>(() => ({ nodes: chatNodes }), [chatNodes])
  const [card, setCard] = useState<CardState | null>(null)
  const [cardHidden, setCardHidden] = useState(false)
  const [visible, setVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  /** Last record shown by the card, retained through its delete/undo window. */
  const lastCardRecord = useRef<HighlightRecord | undefined>(undefined)
  const overlay = useMemo(() => new HighlightOverlay(), [])
  const positioner = useMemo(() => createFloatingPositioner(), [])
  const pipeline = useMemo(() => createDecorationPipeline({
    adapters: [createCssHighlightAdapter(painter), createOverlayAdapter(overlay)],
  }), [overlay, painter])

  /** The mounted conversation root for this session, when committed. */
  const conversationElement = useCallback((): HTMLElement | null => (
    Array.from(document.querySelectorAll<HTMLElement>('[data-conversation-session]'))
      .find(element => element.dataset.conversationSession === String(sessionId)) ?? null
  ), [sessionId])

  /** Resolve every record of this session and publish the paint. */
  const repaint = useCallback(() => {
    // Scope resolution to this session's conversation: a colliding node key in
    // another mounted conversation must never resolve to its DOM.
    const scope = conversationElement() ?? undefined
    const { stale } = pipeline.paint({ sessionId: String(sessionId), records, reason: 'store', ...(scope === undefined ? {} : { scope }) })
    client.setStaleForSession(String(sessionId), stale)
  }, [client, pipeline, records, conversationElement, sessionId])

  // Paint when the record set changes, but only while the conversation is shown.
  useEffect(() => {
    if (visible) repaint()
  }, [repaint, visible])

  // Register this session with the app-scoped observation service. It owns the
  // transcript observer, resize handling, visibility and paint coalescing; while
  // the conversation is hidden (a global page is open) it fires no callbacks.
  useEffect(() => {
    const id = sessionId as unknown as string
    const conversationRoot = (): HTMLElement | null => (
      Array.from(document.querySelectorAll<HTMLElement>('[data-conversation-session]'))
        .find(element => element.dataset.conversationSession === id) ?? null
    )
    const transcriptRoot = (): HTMLElement | null => (
      conversationRoot()?.querySelector<HTMLElement>('[data-chat-flow]')
        ?? document.querySelector<HTMLElement>('[data-chat-flow]')
    )
    const handle = observation.registerSession({
      sessionId: id,
      conversationRoot,
      transcriptRoot,
    })
    setVisible(handle.visible.get())
    const unsubscribe = handle.visible.subscribe(setVisible)
    return () => {
      unsubscribe()
      handle.dispose()
    }
  }, [observation, sessionId])

  // Repaint on the service's coalesced paint frames.
  useEffect(() => observation.onPaintFrame((paintedSession) => {
    if (paintedSession === (sessionId as unknown as string)) repaint()
  }), [observation, repaint, sessionId])

  // Release this bridge's adapter-owned DOM when it unmounts. The painter is
  // app-scoped and is disposed by the composition root (W2).
  useEffect(() => () => {
    pipeline.dispose()
  }, [pipeline])

  // Register this session's composer bridge for queued insertions.
  useEffect(() => insert.registerBridge(sessionId as unknown as string, {
    // rc.1's InputActions.insertQuote takes only the text; a display summary
    // chip arrived in a later release, so the quote is inserted verbatim here.
    insertQuote: text => inputActions.insertQuote(text),
    insertText: text => inputActions.insertText(text, inputActions.captureInsertion()),
  }), [inputActions, insert, sessionId])

  /**
   * Dismiss the card, but only when no nested layer owns the Escape.
   *
   * An open More menu is a layer above the card: the Menu primitive closes
   * itself from its own capture-phase listener, and the card must stay put for
   * that first Escape (F13). The menu marks the card root while it is open, so
   * this check is synchronous with the same key event.
   */
  const dismissCardLayer = useCallback((): void => {
    if (document.querySelector('[data-dshhl-card][data-dshhl-menu-open]') !== null) return
    setCard(null)
  }, [])

  // Click inside painted text opens the card; Escape and outside presses close it.
  // A press on the card's own portal is interaction, not an outside press: the
  // card is portalled into <body>, so without this exclusion every control would
  // dismiss the card before its click could act.
  useEffect(() => {
    const onPointerUp = (event: PointerEvent): void => {
      // A right-press belongs to the contextmenu gesture, never to the card.
      if (event.button !== 0) return
      const selection = document.getSelection()
      if (selection !== null && !selection.isCollapsed) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[data-dshhl-card], [data-dshhl-card-menu], .dshhl-card__menuList') != null) return
      if (target === null || target.closest('[data-text-interaction-source]') === null) {
        setCard(null)
        return
      }
      const range = hitTestRange(event.clientX, event.clientY, painter.resolved)
      if (range === null) {
        setCard(null)
        return
      }
      setCard({ recordId: range.recordId })
    }
    document.addEventListener('pointerup', onPointerUp)
    return () => { document.removeEventListener('pointerup', onPointerUp) }
  }, [painter])

  // Escape belongs to an open card only: the interaction affordance owns its own
  // Escape layer, and a listener that exists while no card is open is one more
  // document-level owner for the same key (audit: duplicate keydown at N=1).
  useEffect(() => {
    if (card === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismissCardLayer()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [card, dismissCardLayer])

  /**
   * Position the open card directly on the DOM, without a React state update.
   *
   * The bar and the new-annotation editor update `style` inside their rAF loop;
   * doing the card through `setState` queued a render after the frame, so it
   * visibly trailed the highlight while scrolling ("dragged"). This path keeps
   * the same frame timing as the other surfaces.
   */
  const positionCard = useCallback((recordId: string): void => {
    const wrapper = cardRef.current
    if (wrapper === null) return
    const range = painter.resolved.get(recordId)
    if (range === undefined) {
      setCardHidden(true)
      return
    }
    let rect: DOMRect
    try {
      rect = range.getBoundingClientRect()
    } catch {
      setCardHidden(true)
      return
    }
    if (rect.width === 0 && rect.height === 0) {
      setCardHidden(true)
      return
    }
    const bounds = conversationBoundsForRange(range)
    const hidden = positioner.place({ element: wrapper, rects: [rect], bounds, width: CARD_WIDTH })
    setCardHidden(hidden)
  }, [painter, positioner])

  // Position before paint on open, then follow the range each frame like the bar.
  useLayoutEffect(() => {
    if (card !== null) positionCard(card.recordId)
  }, [card?.recordId, positionCard])

  useEffect(() => {
    if (card === null || !visible) return
    const recordId = card.recordId
    positionCard(recordId)
    // Dirty-driven: follow the highlight on scroll/resize only, never per frame.
    let frameId: number | undefined
    const schedule = (): void => {
      if (frameId !== undefined) return
      frameId = requestAnimationFrame(() => {
        frameId = undefined
        positionCard(recordId)
      })
    }
    const scroller = document.querySelector('[data-conversation-scroll]')
    scroller?.addEventListener('scroll', schedule, { passive: true })
    // Capture-phase window scroll catches nested scrollers (and jsdom tests).
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      scroller?.removeEventListener('scroll', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (frameId !== undefined) cancelAnimationFrame(frameId)
      const wrapper = cardRef.current
      if (wrapper !== null) positioner.forget(wrapper)
    }
  }, [card?.recordId, positionCard, positioner, visible])

  // Focus contract for the card: trap Tab, restore focus on close. Escape is
  // one layer per press (an open More menu consumes the first one).
  const restoreFocus = useRef<(() => void) | undefined>(undefined)
  useEffect(() => {
    if (card !== null) {
      restoreFocus.current = captureFocus(document)
      const wrapper = cardRef.current
      if (wrapper === null) return
      return trapFocus(wrapper, { onEscape: dismissCardLayer })
    }
    restoreFocus.current?.()
    restoreFocus.current = undefined
    return undefined
  }, [card, dismissCardLayer])

  // The session header gains a rail of this Session's marks (T4.4): position, not
  // detail. It renders nothing for fewer than two annotations, and its overflow
  // mark opens the panel tab instead of a transcript position.
  const minimap = (
    <SessionMiniMap
      records={records}
      t={t as unknown as (key: string, params?: Record<string, string | number>) => string}
      onReveal={record => { void ops.reveal(record) }}
      onOpenPanel={openTab}
    />
  )

  // The session header carries the only always-mountable entry to the panel tab.
  const headerButton = (
    <Button
      variant="ghost"
      size="sm"
      className="dshhl-icon-button"
      title={t('action.openPanel')}
      aria-label={t('action.openPanel')}
      icon={<IconListPenOutlineRegular size={15} />}
      onClick={openTab}
    />
  )

  // Stable identity: the affordance's listener effect must not re-register on
  // every bridge render (audit §3.5).
  const revealPending = useCallback((): boolean => observation.revealPending.get(), [observation])

  const affordance = (
    <SelectionAffordance
      t={t as unknown as (key: string, params?: Record<string, string | number>) => string}
      sessionId={String(sessionId)}
      defaultColor={() => actions.lastColorId()}
      tagSuggestions={() => actions.tagSuggestions()}
      createSelection={createSelection}
      chat={chat}
      client={client}
      copy={copy}
      announce={text => { notice?.notify(text) }}
      visible={visible}
      revealPending={revealPending}
      {...(selection === undefined ? {} : { gesture: selection })}
    />
  )

  // Outcomes are no longer rendered here: T1.4 moves every transient notice to
  // the app-level NoticeOverlay (registered on `shell.overlay`), so it survives
  // this bridge unmounting. This component keeps only the transcript surfaces.
  const liveCardRecord = card === null ? undefined : client.getSnapshot().byId.get(card.recordId)
  if (liveCardRecord !== undefined) lastCardRecord.current = liveCardRecord
  // Keep the card's record after a confirmed delete: policy A renders Undo in the card.
  const record = liveCardRecord ?? (card === null ? undefined : lastCardRecord.current)
  if (card === null || record === undefined) return <>{minimap}{headerButton}{affordance}</>

  const close = (): void => { setCard(null) }

  return (
    <>
      {minimap}
      {headerButton}
      {affordance}
      {createPortal(
        <div
          ref={cardRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 6,
            maxHeight: '70vh',
            overflow: 'auto',
            visibility: 'hidden',
          }}
        >
          <ItemCard
            key={record.id}
            hidden={cardHidden}
            t={t as unknown as (key: string, params?: Record<string, string | number>) => string}
            record={record}
            tagSuggestions={actions.tagSuggestions()}
            onSave={(draft, expectedVersion) => ops.update(record.id, {
              colorId: draft.colorId as HighlightRecord['colorId'],
              tags: [...draft.tags],
              note: draft.note ?? null,
              starred: draft.starred,
              ...(draft.intent === undefined ? {} : { intent: draft.intent }),
            }, expectedVersion)}
            onClose={close}
            onReveal={() => ops.reveal(record)}
            onInsert={target => ops.insert(record, target, String(sessionId))}
            onCopy={() => ops.copy(record)}
            onDelete={() => ops.remove(record.id)}
            onStar={starred => ops.star(record.id, starred, record.version)}
            onRestore={() => ops.restore(record.id)}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

/** One resolved range with its record id. */
interface RangeHit {
  readonly recordId: string
  readonly range: Range
}

/**
 * Find the painted range under one viewport point.
 * @param x - Client X coordinate.
 * @param y - Client Y coordinate.
 * @param ranges - Resolved ranges keyed by record id.
 * @returns the range under the point with its record id, or null.
 */
function hitTestRange(x: number, y: number, ranges: ReadonlyMap<string, Range>): RangeHit | null {
  const documentWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  const caret = documentWithCaret.caretRangeFromPoint?.(x, y) ?? null
  const point = caret ?? (() => {
    const position = documentWithCaret.caretPositionFromPoint?.(x, y)
    if (position === null || position === undefined) return null
    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  })()
  if (point === null) return null
  for (const [recordId, range] of ranges) {
    try {
      if (range.isPointInRange(point.startContainer, point.startOffset)) return { recordId, range }
    } catch {
      // A stale range whose nodes detached: skip it.
    }
  }
  return null
}
