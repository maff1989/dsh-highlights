/**
 * The right-panel Highlights tab body (surface S4).
 *
 * A session-scoped projection of the shared record store: the tab is handed a
 * session id and the action face, reads the session's records through a
 * selector so a write repaints it, and lets the user search, filter, reveal,
 * insert, copy, edit, and delete. Everything that leaves the component does so
 * through {@link HighlightsActions}, never through the transport.
 *
 * The tab also reads the platform's catalog selector hooks, so an archived or
 * no-longer-available session is named on the rows and loses reveal instead of
 * offering an action that cannot work.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconSearchOutlineRegular, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

import type { HighlightsActions, InsertTarget, UpdatePatch, WriteOutcome } from '../../data/actions'
import type { CommandSurface } from '../../commands/surface'
import { createActionSurface } from '../../commands/surface'
import type { HighlightRecord } from '../../../shared/schema'
import { visibilityOf, type RecordState } from '../../../shared/provenance'
import { EMPTY_RECORDS, EMPTY_STALE, type HighlightsSnapshot } from '../../data/client'
import { ConflictBar } from '../ConflictBar'
import { useSignalValue } from '../../runtime/use-signal'
import { PanelRow } from './PanelRow'
import { UndoBar } from '../UndoBar'
import { disableUndoPrompt, undoPromptEnabled } from '../undoPrompt'
import {
  collectTags,
  createEmptyFilter,
  highlightIdOf,
  isEmptyFilter,
  PANEL_COLOR_IDS,
  selectRecords,
  toggleInSet,
} from './panelFilter'
import {
  buildCatalog,
  catalogEntryOf,
  colorLabel,
  worthReview,
  type CatalogHooks,
} from '../page/grouping'
import { WorthALook } from '../page/WorthALook'

/** How long a navigation target stays flashed, in milliseconds. */
const FLASH_MS = 1200

/** How long a transient failure line stays on screen, in milliseconds. */
const NOTICE_MS = 4000

/** How often the relative-time labels are recomputed. */
const CLOCK_TICK_MS = 60_000

/** Rows rendered per panel page; the rest render on demand. */
export const PANEL_ROW_LIMIT = 200

/** What the tab registration injects into the body. */
export interface HighlightsPanelInjected {
  /** Bare observables exposed through the slot `hooks` compartment. */
  readonly hooks: { readonly snap: ObservableSnapshot<HighlightsSnapshot> }
  /** The shared action face every Highlights surface calls. */
  readonly actions: HighlightsActions
  /** Owning session of this tab occurrence. */
  readonly sessionId: string
  /** Command-routed action face (falls back to the legacy action adapter in tests). */
  readonly commands?: CommandSurface
}

/**
 * Props the renderer assembles for the tab body registration.
 *
 * The platform hands every slot the Session and Workspace catalog selector
 * hooks ({@link CatalogHooks}); they stay optional so the body still renders
 * from the stored snapshots in a test or a catalog-less composition.
 */
export type HighlightsPanelProps =
  PropsRuntime<'sidebar.right.pane.tab'> &
  PropsLocale<'highlights'> &
  InjectFace<HighlightsPanelInjected> &
  CatalogHooks

/**
 * Element-wise identity comparison for the session projection, so the selector
 * hook only re-renders when this session's records actually changed.
 * @param left - previous projection.
 * @param right - next projection.
 * @returns whether both carry the same records in the same order.
 */
function sameRecords(left: readonly HighlightRecord[], right: readonly HighlightRecord[]): boolean {
  return left.length === right.length && left.every((record, index) => record === right[index])
}

/**
 * Render the session's highlights: header, search, filters, rows, and states.
 * @param props - tab-standard props, copy, the injected snapshot/actions/session.
 * @returns the tab body element.
 */
export function HighlightsPanel(props: HighlightsPanelProps): ReactNode {
  const { t, useSnap, useTabInfo, actions, sessionId, commands } = props
  const ops = useMemo(() => commands ?? createActionSurface(actions), [actions, commands])
  const busy = useSignalValue(ops.busy)
  const [rowLimit, setRowLimit] = useState(PANEL_ROW_LIMIT)
  const { tab } = useTabInfo()

  const records = useSnap(snapshot => snapshot.recordsBySession.get(String(sessionId)) ?? EMPTY_RECORDS)
  const status = useSnap(snapshot => snapshot.status)
  const error = useSnap(snapshot => snapshot.error)
  const offline = useSnap(snapshot => snapshot.offline)
  const paintSupported = useSnap(snapshot => snapshot.paintSupported)
  const staleIds = useSnap(snapshot => snapshot.staleBySession.get(String(sessionId)) ?? (snapshot.staleBySession.size === 0 ? snapshot.stale : EMPTY_STALE))

  // Live catalog: archived/unavailable are catalog facts, not record facts.
  // Hook presence is fixed for a given composition, so null-checking it keeps
  // the call order stable; without one the rows resolve from stored snapshots.
  const useSessions = props.useSessions
  const useWorkspaces = props.useWorkspaces
  const sessionsState = useSessions === undefined ? undefined : useSessions(state => state)
  const workspacesState = useWorkspaces === undefined ? undefined : useWorkspaces(state => state)
  const catalog = useMemo(
    () => buildCatalog({ sessions: sessionsState, workspaces: workspacesState }),
    [sessionsState, workspacesState],
  )
  const live = catalogEntryOf(catalog, String(sessionId))

  const [filter, setFilter] = useState(createEmptyFilter)
  const [pendingUndo, setPendingUndo] = useState<HighlightRecord | undefined>(undefined)
  const [deleteConflict, setDeleteConflict] = useState<HighlightRecord | undefined>(undefined)
  const [flashId, setFlashId] = useState<string | undefined>(undefined)
  const [transientNotice, setTransientNotice] = useState<string | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())

  const rowNodes = useRef(new Map<string, HTMLLIElement>())
  const flashedKey = useRef<string | undefined>(undefined)

  const highlightId = highlightIdOf(tab.navigation.params)
  const navigationKey = `${String(tab.navigation.revision)}:${highlightId ?? ''}`

  const visible = useMemo(() => selectRecords(records, filter), [records, filter])
  const tags = useMemo(() => collectTags(records), [records])
  const count = records.length
  /** Resurfacing reads the whole session, never the narrowed list. */
  const worth = useMemo(() => worthReview(records, staleIds, now), [records, staleIds, now])

  /** Register a row element so a navigation target can be scrolled to. */
  const registerNode = (id: string, node: HTMLLIElement | null): void => {
    if (node === null) rowNodes.current.delete(id)
    else rowNodes.current.set(id, node)
  }

  // Prime the store; the freshness window makes this a no-op when the page just read.
  useEffect(() => {
    actions.refresh()
  }, [actions])

  // Hand the tab's own refresh command (menu and shortcut) to the same read.
  useEffect(() => tab.actions.bindCommands({ refresh: () => { actions.refresh(true) } }), [tab.actions, actions])

  // A minute of relative-time drift is invisible; a frozen clock after hours is not.
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()) }, CLOCK_TICK_MS)
    return () => { window.clearInterval(timer) }
  }, [])

  // A navigation target must be visible, so the panel's own narrowing yields to it.
  useEffect(() => {
    if (highlightId === undefined) return
    setFilter(createEmptyFilter())
  }, [navigationKey, highlightId])

  // Scroll to and flash the navigation target once per navigation.
  useEffect(() => {
    if (highlightId === undefined || !tab.visible) return
    if (flashedKey.current === navigationKey) return
    const node = rowNodes.current.get(highlightId)
    if (node === undefined) return
    flashedKey.current = navigationKey
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'center' })
    setFlashId(highlightId)
  }, [highlightId, navigationKey, tab.visible, visible])

  // Retire the flash.
  useEffect(() => {
    if (flashId === undefined) return
    const timer = window.setTimeout(() => { setFlashId(undefined) }, FLASH_MS)
    return () => { window.clearTimeout(timer) }
  }, [flashId])

  // Retire the transient failure line.
  useEffect(() => {
    if (transientNotice === undefined) return
    const timer = window.setTimeout(() => { setTransientNotice(undefined) }, NOTICE_MS)
    return () => { window.clearTimeout(timer) }
  }, [transientNotice])

  /** Open one resurfaced item; a missing anchor says so instead of failing quietly. */
  const openWorth = (record: HighlightRecord): void => {
    setTransientNotice(undefined)
    void ops.reveal(record).then(outcome => {
      if (outcome === 'not-found') setTransientNotice(t('reveal.failed'))
    })
  }

  /** Patch one record; the row keeps its draft and prompts when the CAS is lost. */
  const update = (id: string, patch: UpdatePatch, expectedVersion?: number): Promise<WriteOutcome> => (
    expectedVersion === undefined ? ops.update(id, patch) : ops.update(id, patch, expectedVersion)
  )

  /**
   * Advance one row's processing cursor.
   *
   * Writes the schema-v2 field through the injected action face directly: the
   * command table's patch contract is still the presentation-only set. The row
   * owns the optimistic value and reports a failure on its own status line.
   */
  /**
   * Advance the cursor through the command surface, like every other mutation.
   * @param record - the row's record.
   * @param state - the next state.
   * @returns the write outcome.
   */
  const cursor = (record: HighlightRecord, state: RecordState): Promise<WriteOutcome> => (
    ops.update(record.id, { state }, record.version)
  )

  /** Insert through the action face, targeting the Session this tab shows. */
  const insert = (record: HighlightRecord, target: InsertTarget): ReturnType<HighlightsActions['insert']> => (
    ops.insert(record, target, sessionId)
  )

  /**
   * Soft-delete. Undo is only offered when the Host confirmed the delete; a
   * refused delete leaves the record visible and asks the reader to reload.
   */
  const remove = async (record: HighlightRecord): Promise<WriteOutcome> => {
    const outcome = await ops.remove(record.id)
    if (outcome.status === 'written') {
      setDeleteConflict(undefined)
      if (undoPromptEnabled()) setPendingUndo(record)
    } else if (outcome.status === 'conflict') {
      // The Host refused the stale version: the record stays visible.
      setDeleteConflict(outcome.record)
    }
    // A failed delete is reported through the outcome; no whole-store re-read.
    return outcome
  }

  const undo = async (): Promise<void> => {
    if (pendingUndo === undefined) return
    const record = pendingUndo
    const outcome = await ops.restore(record.id)
    setPendingUndo(undefined)
    // Undo failure is an outcome, not a reason to re-read every record.
    void outcome
  }

  const loading = status === 'idle' || status === 'loading'
  // A new filter/session starts a new bounded page, not a continuation.
  useEffect(() => { setRowLimit(PANEL_ROW_LIMIT) }, [filter, sessionId])
  const shown = visible.slice(0, rowLimit)
  const filterActive = !isEmptyFilter(filter)
  // Private items never leave the device, so the control is absent when the
  // shown list has nothing briefable.
  const briefable = useMemo(
    () => visible.filter(record => visibilityOf(record) !== 'private'),
    [visible],
  )

  /** Brief the agent on the shown (filtered) items of this session. */
  const brief = (): void => {
    if (briefable.length === 0) return
    void actions.briefSession(String(sessionId), briefable).then(outcome => {
      if (outcome === 'queued') setTransientNotice(t('insert.queued'))
      else if (outcome === 'failed') setTransientNotice(t('insert.failed'))
    })
  }

  return (
    <section className="dshhl-panel" aria-label={t('panel.title')} aria-busy={busy.size > 0}>
      <header className="dshhl-panel__header">
        <div className="dshhl-panel__titleRow">
          <h2 className="dshhl-panel__title">{t('panel.title')}</h2>
          <span className="dshhl-panel__count">{t(count === 1 ? 'page.count.one' : 'page.count.other', { count })}</span>
          {briefable.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="dshhl-panel__brief"
              title={t('brief.action')}
              onClick={brief}
            >
              {t('brief.action')}
            </Button>
          )}
        </div>
        <div className="dshhl-panel__toolbar">
          <Input
            className="dshhl-panel__search"
            type="search"
            icon={<IconSearchOutlineRegular size={16} />}
            value={filter.query}
            placeholder={t('panel.filter.placeholder')}
            aria-label={t('panel.filter.placeholder')}
            onChange={event => { setFilter(current => ({ ...current, query: event.target.value })) }}
          />
        </div>
        <div className="dshhl-panel__filters" role="group" aria-label={t('page.filters')}>
          {PANEL_COLOR_IDS.map(colorId => {
            const selected = filter.colorIds.has(colorId)
            return (
              <Pill
                key={colorId}
                active={selected}
                aria-pressed={selected}
                onClick={() => { setFilter(current => ({ ...current, colorIds: toggleInSet(current.colorIds, colorId) })) }}
              >
                <span
                  className="dshhl-colorDot"
                  style={{ backgroundColor: `var(--dsh-hl-${String(colorId)})` }}
                  aria-hidden="true"
                />
                {colorLabel(t, colorId)}
              </Pill>
            )
          })}
          {/* Provenance: All is the default; one chip narrows to that author,
              clicking it again returns to All. */}
          <span className="dshhl-panel__chips" role="group" aria-label={t('page.filter.author')}>
            <Pill
              active={filter.author === 'user'}
              aria-pressed={filter.author === 'user'}
              onClick={() => {
                setFilter(current => ({ ...current, author: current.author === 'user' ? undefined : 'user' }))
              }}
            >
              {t('page.filter.mine')}
            </Pill>
            <Pill
              active={filter.author === 'agent'}
              aria-pressed={filter.author === 'agent'}
              onClick={() => {
                setFilter(current => ({ ...current, author: current.author === 'agent' ? undefined : 'agent' }))
              }}
            >
              {t('page.filter.agent')}
            </Pill>
          </span>
          <Pill
            active={filter.starredOnly}
            aria-pressed={filter.starredOnly}
            onClick={() => { setFilter(current => ({ ...current, starredOnly: !current.starredOnly })) }}
          >
            {t('page.filter.starred')}
          </Pill>
          {tags.map(({ tag }) => (
            <Pill
              key={tag}
              active={filter.tags.has(tag)}
              aria-pressed={filter.tags.has(tag)}
              onClick={() => { setFilter(current => ({ ...current, tags: toggleInSet(current.tags, tag) })) }}
            >
              {tag}
            </Pill>
          ))}
          {/* The header owns the one Clear control; the filtered-empty body states
              the situation without repeating the same action. */}
          {filterActive && (
            <Pill onClick={() => { setFilter(createEmptyFilter()) }}>
              {t('page.filter.clear')}
            </Pill>
          )}
        </div>
      </header>

      {offline && <div className="dshhl-panel__notice" role="status">{t('state.offline')}</div>}
      {!paintSupported && <div className="dshhl-panel__notice" role="status">{t('state.unsupported')}</div>}
      {status === 'error' && count > 0 && <div className="dshhl-panel__notice" role="status">{t('state.stale')}</div>}
      {transientNotice !== undefined && <div className="dshhl-panel__notice" role="status">{transientNotice}</div>}

      {deleteConflict !== undefined && (
        <ConflictBar
          t={t}
          onReload={() => { actions.refresh(true); setDeleteConflict(undefined) }}
        />
      )}

      {pendingUndo !== undefined && (
        <UndoBar
          t={t as unknown as (key: string, params?: Record<string, string | number>) => string}
          className="dshhl-undo--panel"
          onUndo={() => { void undo() }}
          onDismiss={() => { setPendingUndo(undefined) }}
          onDontAsk={() => { disableUndoPrompt(); setPendingUndo(undefined) }}
        />
      )}

      <div className="dshhl-panel__body">
        {loading && count === 0 && <div className="dshhl-empty" role="status">{t('state.loading')}</div>}

        {status === 'error' && count === 0 && (
          <div className="dshhl-empty" role="alert">
            <p className="dshhl-empty__title">{t('state.error')}</p>
            {error !== undefined && <p className="dshhl-empty__body">{error}</p>}
            <Button variant="outline" size="sm" onClick={() => { actions.refresh(true) }}>
              {t('state.retry')}
            </Button>
          </div>
        )}

        {status === 'ready' && count === 0 && (
          <div className="dshhl-empty">
            <p className="dshhl-empty__title">{t('panel.empty.title')}</p>
            <p className="dshhl-empty__body">{t('panel.empty.hint')}</p>
          </div>
        )}

        {count > 0 && visible.length === 0 && (
          <div className="dshhl-empty">
            <p className="dshhl-empty__title">{t('page.empty.filtered')}</p>
          </div>
        )}

        {!filterActive && worth.length > 0 && (
          <WorthALook
            t={t}
            candidates={worth}
            compact
            headingLevel={3}
            onOpen={openWorth}
          />
        )}

        {visible.length > 0 && (
          <ol className="dshhl-panel__list" aria-label={t('panel.title')}>
            {shown.map(record => (
              <PanelRow
                key={record.id}
                record={record}
                t={t}
                flash={flashId === record.id}
                stale={staleIds.has(record.id)}
                archived={live.archived}
                unavailable={!live.available}
                now={now}
                registerNode={registerNode}
                onReveal={target => ops.reveal(target)}
                onInsert={insert}
                onCopy={target => ops.copy(target)}
                onDelete={remove}
                onUpdate={update}
                onCursor={cursor}
              />
            ))}
          </ol>
        )}
        {visible.length > shown.length && (
          <div className="dshhl-panel__more">
            <Button variant="ghost" size="sm" onClick={() => { setRowLimit(current => current + PANEL_ROW_LIMIT) }}>
              {t('page.showMore', { shown: shown.length, total: visible.length })}
            </Button>
          </div>
        )}
      </div>

    </section>
  )
}
