/**
 * The global Highlights page (surface S5): every record across workspaces and
 * sessions, grouped by where it sits in its conversation.
 *
 * The page is a projection of the record store plus view state that belongs to
 * the *page* rather than to one mount: search, filters, folds, the bounded row
 * count and the scroll offset live in {@link pageStore}, so opening a session
 * and coming back restores the reader's place. Display names resolve live from
 * the platform's Session and Workspace catalogs (with the stored snapshots as
 * fallback), so a renamed session or moved workspace does not keep an old
 * label. Writes go through the injected action face; every surface reading the
 * same store re-renders from the same snapshot.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

import type { HighlightsActions } from '../../data/actions'
import type { HighlightRecord } from '../../../shared/schema'
import type { CommandSurface } from '../../commands/surface'
import { createActionSurface } from '../../commands/surface'
import type { NoticeService } from '../../contracts/notice'
import { createNoticeService } from '../../notice/service'
import { captureChordLabel } from '../shortcutHint'
import { useSignalValue } from '../../runtime/use-signal'
import type { HighlightsSnapshot } from '../../data/client'
import {
  buildCatalog,
  filterRecords,
  deriveFacets,
  groupRecords,
  hasActiveFilters,
  worthReview,
  type CatalogHooks,
  type PageFilters,
  type PageTranslate,
} from './grouping'
import { pageStore } from './pageStore'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'

import { GroupList } from './GroupList'
import { UndoBar } from '../UndoBar'
import { WorthALook } from './WorthALook'
import { disableUndoPrompt, undoPromptEnabled } from '../undoPrompt'
import { PageHeader } from './PageHeader'
import type { RecordRowActions } from './RecordRow'

/** How often the relative-time labels are recomputed. */
const CLOCK_TICK_MS = 60_000

export { PAGE_ROW_LIMIT } from './pageStore'

/** What the registration injects into the page. */
export interface HighlightsPageInjected {
  /** Bare observables exposed through the slot `hooks` compartment. */
  readonly hooks: { readonly snap: ObservableSnapshot<HighlightsSnapshot> }
  /** The shared action face (refresh, writes, reveal, insert, panel tab). */
  readonly actions: HighlightsActions
  /** One app-scoped notice channel (falls back to a page-local one in tests). */
  readonly notice?: NoticeService
  /** Command-routed action face (falls back to the legacy action adapter in tests). */
  readonly commands?: CommandSurface
}

/**
 * Props the renderer assembles for this registration.
 *
 * The platform also hands every root-scope page the Session and Workspace
 * selector hooks ({@link CatalogHooks}); they are optional here so a test or a
 * catalog-less composition still renders from the stored snapshots.
 */
export type HighlightsPageProps =
  PropsRuntime<'main'> &
  PropsLocale<'highlights'> &
  InjectFace<HighlightsPageInjected> &
  CatalogHooks

/** How long a transient page notice stays on screen, in milliseconds. */
const NOTICE_MS = 4000

/**
 * Text for the "narrowed" summary line above the list.
 * @param t - namespace-bound translate function.
 * @param shown - Records that pass the filters.
 * @param total - Records in the store.
 * @returns the summary copy.
 */
function filteredSummary(t: PageTranslate, shown: number, total: number): string {
  return t('page.showing', { shown, total })
}

/**
 * Render the global Highlights page.
 * @param props - slot-standard props, copy, and the injected store/actions.
 * @returns the page element.
 */
export function HighlightsPage(props: HighlightsPageProps): ReactNode {
  const { t, actions, notice: injectedNotice, commands } = props
  const useSnap = props.useSnap
  // Narrow selectors: a stale/publication change no longer re-renders the whole page.
  const records = useSnap(snapshot => snapshot.records)
  const stale = useSnap(snapshot => snapshot.stale)
  const status = useSnap(snapshot => snapshot.status)
  const offline = useSnap(snapshot => snapshot.offline)
  const paintSupported = useSnap(snapshot => snapshot.paintSupported)
  const error = useSnap(snapshot => snapshot.error)

  // Page view state survives navigation because it lives outside React.
  const view = useSyncExternalStore(pageStore.subscribe, pageStore.getSnapshot)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /** Policy A: a confirmed delete offers Undo on the page too. */
  const [pendingUndo, setPendingUndo] = useState<HighlightRecord | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  /** One notice channel: the app-scoped service, or a page-local fallback. */
  const fallbackNotice = useMemo(() => createNoticeService(), [])
  const noticeService = injectedNotice ?? fallbackNotice
  /** Chord the composition root actually registered, for first-run guidance. */
  const chord = captureChordLabel()
  /** Model visibility; an older Host half omits it, and `off` is the default. */
  const hello = useSnap(snapshot => snapshot.hello)
  const agentAccess = hello?.agentAccess ?? 'off'
  const ops = useMemo(() => commands ?? createActionSurface(actions), [actions, commands])
  const busy = useSignalValue(ops.busy)
  useEffect(() => () => { if (injectedNotice === undefined) fallbackNotice.dispose() }, [fallbackNotice, injectedNotice])

  // Live catalog: a renamed session or moved workspace resolves without waiting
  // for a write to refresh the stored snapshots. Hook presence is fixed for a
  // given composition, so null-checking it keeps the call order stable; without
  // one the lists resolve from the stored snapshots alone.
  const useSessions = props.useSessions
  const useWorkspaces = props.useWorkspaces
  const sessionsState = useSessions === undefined ? undefined : useSessions(state => state)
  const workspacesState = useWorkspaces === undefined ? undefined : useWorkspaces(state => state)
  const catalog = useMemo(
    () => buildCatalog({ sessions: sessionsState, workspaces: workspacesState }),
    [sessionsState, workspacesState],
  )

  // The store's stale union is the single source for the page's unanchored filter.
  const orphaned = stale

  // The store is primed when the plugin activates; this covers a cold remount
  // and keeps the page fresh without forcing past the freshness window.
  useEffect(() => {
    actions.refresh()
  }, [actions])

  // Relative times are bucketed; a minute of drift is invisible, a frozen
  // clock after hours is not, so the page re-renders on a slow tick.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, CLOCK_TICK_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  // Coming back to the page restores the reading position before paint. The
  // offset is only remembered (never published), so scrolling cannot re-render.
  useLayoutEffect(() => {
    const node = scrollRef.current
    if (node === null) return
    node.scrollTop = pageStore.scrollTop()
  }, [])

  const facets = useMemo(() => deriveFacets(records, catalog), [records, catalog])
  const visible = useMemo(() => filterRecords(records, view.filters, orphaned, catalog), [records, view.filters, orphaned, catalog])
  const groups = useMemo(() => groupRecords(visible, catalog), [visible, catalog])
  /** Resurfacing reads every live record, never the narrowed list. */
  const worth = useMemo(() => worthReview(records, orphaned, now), [records, orphaned, now])
  const totalCount = useMemo(
    () => records.filter(record => record.deletedAt === undefined).length,
    [records],
  )
  const unanchoredCount = useMemo(
    () => records.filter(record => record.deletedAt === undefined && orphaned.has(record.id)).length,
    [records, orphaned],
  )
  const filtersActive = hasActiveFilters(view.filters)

  const patchFilters = useCallback((patch: Partial<PageFilters>) => {
    pageStore.setFilters(patch)
  }, [])

  const clearFilters = useCallback(() => {
    pageStore.clearFilters()
  }, [])

  const retry = useCallback(() => {
    actions.refresh(true)
  }, [actions])

  /** Show one short-lived notice (copy/reveal/conflict feedback). */
  const showNotice = useCallback((text: string, warn = false): void => {
    noticeService.notify(text, { warn })
  }, [noticeService])

  /** Offer Undo unless the reader opted out of the prompt. */
  const armUndo = useCallback((record: HighlightRecord) => {
    if (!undoPromptEnabled()) return
    setPendingUndo(record)
  }, [])

  /** Undo a confirmed page delete. */
  const undo = useCallback(async () => {
    if (pendingUndo === undefined) return
    const record = pendingUndo
    setPendingUndo(undefined)
    await actions.restore(record.id)
  }, [actions, pendingUndo])

  /**
   * Brief the agent on one session, from a session group's header.
   *
   * The packet action inserts into that session's composer (opening the session
   * when needed); the page only reports the outcome.
   */
  const briefSession = useCallback((sessionId: string, records: readonly HighlightRecord[]): void => {
    void actions.briefSession(sessionId, records).then(outcome => {
      if (outcome === 'queued') showNotice(t('insert.queued'))
      else if (outcome === 'failed') showNotice(t('insert.failed'), true)
    })
  }, [actions, showNotice, t])

  const rowActions = useMemo<RecordRowActions>(
    () => ({
      onToggleStar: record => {
        void ops.star(record.id, !record.starred).then(outcome => {
          if (outcome.status === 'conflict') showNotice(t('conflict.title'), true)
        })
      },
      onUpdate: (record, patch, expectedVersion) => ops.update(record.id, patch, expectedVersion),
      onCursor: async (record, state) => {
        // Every mutation goes through the command surface, including the
        // cursor: single-flight, typed outcome, and one notice channel.
        const outcome = await ops.update(record.id, { state }, record.version)
        if (outcome.status !== 'written') showNotice(t('cursor.failed'), true)
        return outcome
      },
      onRemove: async record => {
        const outcome = await ops.remove(record.id)
        if (outcome.status === 'conflict') showNotice(t('conflict.title'), true)
        else if (outcome.status === 'written') armUndo(record)
        return outcome
      },
      onCopy: async record => {
        const copied = await ops.copy(record)
        showNotice(copied ? t('action.copied') : t('action.copyFailed'), !copied)
        return copied
      },
      onReveal: async record => {
        const outcome = await ops.reveal(record)
        if (outcome === 'not-found') showNotice(t('reveal.failed'), true)
        return outcome
      },
      onOpenPanelTab: record => {
        void ops.openPanel(record)
      },
    }),
    [actions, ops, armUndo, showNotice, t],
  )

  const loading = status === 'idle' || status === 'loading'

  return (
    <section className="dshhl-page" aria-label={t('page.title')} aria-busy={busy.size > 0}>
      <div
        className="dshhl-page__scroll"
        ref={scrollRef}
        onScroll={event => { pageStore.rememberScroll(event.currentTarget.scrollTop) }}
      >
        <div className="dshhl-page__content">
          <PageHeader
            t={t}
            count={totalCount}
            filters={view.filters}
            facets={facets}
            unanchoredCount={unanchoredCount}
            filtersActive={filtersActive}
            onQueryChange={query => { patchFilters({ query }) }}
            onFiltersChange={patchFilters}
            onClearFilters={clearFilters}
          />

          {offline && (
            <div className="dshhl-notice" role="status">
              {t('state.offline')}
            </div>
          )}
          {!paintSupported && (
            <div className="dshhl-notice" role="status">
              {t('state.unsupported')}
            </div>
          )}
          {error !== undefined && !offline && (
            <div className="dshhl-notice" role="status">
              {t('state.stale')}
            </div>
          )}

          {pendingUndo !== undefined && (
            <UndoBar
              t={t as unknown as (key: string, params?: Record<string, string | number>) => string}
              className="dshhl-undo--page"
              onUndo={() => { void undo() }}
              onDismiss={() => { setPendingUndo(undefined) }}
              onDontAsk={() => { disableUndoPrompt(); setPendingUndo(undefined) }}
            />
          )}

          <div className="dshhl-page__body">
            {loading && totalCount === 0 && (
              <div className="dshhl-empty" role="status">
                <p className="dshhl-empty__body">{t('state.loading')}</p>
              </div>
            )}

            {status === 'error' && totalCount === 0 && (
              <div className="dshhl-empty">
                <p className="dshhl-empty__title">{t('state.error')}</p>
                {error !== undefined && <p className="dshhl-empty__body">{error}</p>}
                <Button variant="outline" size="sm" onClick={retry}>
                  {t('state.retry')}
                </Button>
              </div>
            )}

            {!loading && status !== 'error' && totalCount === 0 && (
              <div className="dshhl-empty">
                <p className="dshhl-empty__title">{t('page.empty.title')}</p>
                <p className="dshhl-empty__body">{t('page.empty.hint')}</p>
                {/* First run: explain the gesture with the chord that actually
                    registered, and state the model-visibility truth. */}
                <p className="dshhl-empty__hint">
                  {chord === null
                    ? t('firstRun.capture.noChord')
                    : t('firstRun.capture', { chord })}
                </p>
                {agentAccess === 'off' && (
                  <p className="dshhl-empty__hint">{t('firstRun.agentOff')}</p>
                )}
              </div>
            )}

            {/* Filtered empty: the header's Clear control is the single escape
                hatch; repeating it here would offer the same action twice. */}
            {totalCount > 0 && visible.length === 0 && (
              <div className="dshhl-empty">
                <p className="dshhl-empty__title">{t('page.empty.filtered')}</p>
              </div>
            )}

            {!filtersActive && worth.length > 0 && (
              <WorthALook
                t={t}
                candidates={worth}
                onOpen={record => { void rowActions.onReveal(record) }}
              />
            )}

            {visible.length > 0 && (
              <>
                {filtersActive && <p className="dshhl-page__summary">{filteredSummary(t, visible.length, totalCount)}</p>}
                <GroupList
                  t={t}
                  groups={groups}
                  catalog={catalog}
                  orphanedIds={orphaned}
                  now={now}
                  actions={rowActions}
                  collapsed={view.collapsed}
                  onToggle={key => { pageStore.toggleCollapsed(key) }}
                  onBriefSession={briefSession}
                  limit={view.rowLimit}
                  onShowMore={() => { pageStore.showMore() }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
