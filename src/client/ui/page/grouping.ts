/**
 * Pure derivations behind the global Highlights page and the session panel.
 *
 * Filtering, faceting, live catalog resolution, relative-time wording and the
 * workspace → session → record grouping all live here so the React components
 * stay about layout and the behaviour is testable without a DOM. Records arrive
 * in store order; the lists only ever render the result of these functions.
 *
 * Two vocabularies are deliberately absent from everything this module returns:
 * transcript-internal ordinals (turn/step) and absolute workspace paths. A row
 * names the workspace by its last path segment and dates itself relatively; the
 * stored ordinal and path stay in the record for reveal and grouping identity.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

import { authorOf, stateOf, type Author, type RecordState } from '../../../shared/provenance'
import type { ColorId } from '../../../shared/schema'
import type { HighlightRecord } from '../../data/actions'
import { comparePosition } from '../../../shared/position'

/** Translate function of the plugin dictionary, as slot components receive it. */
export type PageTranslate = TranslateNS<'highlights'>

/** The palette slot order the lists render swatches in. */
export const COLOR_IDS: readonly ColorId[] = [1, 2, 3, 4, 5]

/**
 * Dictionary key of each palette slot's name. Slot 3 is the violet accent and
 * slot 4 the blue business accent (G3); the names travel through `t` so English
 * and Chinese stay in step with the rest of the surface.
 */
const COLOR_LABEL_KEYS: Readonly<Record<ColorId, 'color.1' | 'color.2' | 'color.3' | 'color.4' | 'color.5'>> = {
  1: 'color.1',
  2: 'color.2',
  3: 'color.3',
  4: 'color.4',
  5: 'color.5',
}

/**
 * Localised name of one palette slot.
 * @param t - Page translate function.
 * @param colorId - Palette slot.
 * @returns the human name of the colour (Amber, Green, …).
 */
export function colorLabel(t: PageTranslate, colorId: ColorId): string {
  return t(COLOR_LABEL_KEYS[colorId])
}

/** Group label used when a record carries neither a workspace path nor an id. */
export const UNKNOWN_WORKSPACE = 'Unknown workspace'

/** One user-tunable filter combination of the page. */
export interface PageFilters {
  /** Case-insensitive substring over quote, note and tags. */
  readonly query: string
  /** Workspace key ({@link workspaceKeyOf}); `undefined` means every workspace. */
  readonly workspace: string | undefined
  /** Exact tag match; `undefined` means every tag. */
  readonly tag: string | undefined
  /** Palette slot; `undefined` means every colour. */
  readonly colorId: ColorId | undefined
  /** Keep only starred records. */
  readonly starredOnly: boolean
  /** Author narrowing; `undefined` means every author (All is the default). */
  readonly author: Author | undefined
  /**
   * Keep records whose anchor cannot resolve. Unanchored records stay visible
   * by default in lists (they carry a badge); the toggle hides them.
   */
  readonly showUnanchored: boolean
}

/** No filters applied. Lists show unanchored records by default (DESIGN §2.3 F7). */
export const EMPTY_FILTERS: PageFilters = {
  query: '',
  workspace: undefined,
  tag: undefined,
  colorId: undefined,
  starredOnly: false,
  author: undefined,
  showUnanchored: true,
}

/* ------------------------------------------------------------------------- *
 * Live catalog
 *
 * Records store display snapshots so lists stay readable offline. Snapshots
 * age: a session can be renamed, moved to another workspace, archived, or
 * deleted. The platform hands every page the Session and Workspace list
 * selector hooks, so the lists resolve display values live and fall back to
 * the stored snapshot only when the catalog has nothing.
 *
 * The shapes below are the structural subset this module reads — the same
 * precedent as `data/context.ts`, which reads those services without taking a
 * dependency on their controller packages.
 * ------------------------------------------------------------------------- */

/** The Session catalog row fields the lists read. */
export interface SessionCatalogRow {
  /** Latest durable title; absent until the Host projects one. */
  readonly title?: string
  /** Human-facing label: durable title, project basename, then session id. */
  readonly displayTitle?: string
  /** Working directory the Session was created in. */
  readonly cwd?: string
}

/** The Workspace catalog row fields the lists read. */
export interface WorkspaceCatalogRow {
  readonly workspaceId: string
  /** Absolute workspace path; grouping identity only, never rendered. */
  readonly path: string
  /** Sessions the Workspace accounts for. */
  readonly sessionIds?: readonly string[]
}

/** Snapshot shape behind the platform's `useSessions` selector hook. */
export interface SessionCatalogState {
  readonly byId: Readonly<Record<string, SessionCatalogRow | undefined>>
  /**
   * Arrival lifecycle of the list; `pending` means the Host list has not
   * arrived yet, so absence of a row proves nothing. Absent is treated as
   * settled (tests and catalog-less fixtures).
   */
  readonly phase?: 'pending' | 'ready'
}

/** Snapshot shape behind the platform's `useWorkspaces` selector hook. */
export interface WorkspaceCatalogState {
  readonly items: readonly WorkspaceCatalogRow[]
  /** Registry-global archive set. */
  readonly archivedSessionIds: readonly string[]
}

/**
 * The root-scope catalog selector hooks the shell supplies to every page.
 * Optional so a test (or a future composition without the catalogs) renders
 * from the stored snapshots alone.
 */
export interface CatalogHooks {
  readonly useSessions?: <S>(selector: (state: SessionCatalogState) => S) => S
  readonly useWorkspaces?: <S>(selector: (state: WorkspaceCatalogState) => S) => S
}

/** Everything the lists resolve about one Session's live identity. */
export interface CatalogEntry {
  /** Live title, when the catalog still knows one. */
  readonly title: string | undefined
  readonly workspaceId: string | undefined
  readonly workspacePath: string | undefined
  /** True when the catalog reports the Session archived. */
  readonly archived: boolean
  /** False when the Session catalog is known and has no row for the Session. */
  readonly available: boolean
}

/**
 * Session id → live identity, plus whether the Session list itself is known.
 *
 * The flag matters: with a known Session list, *absence* of a row means the
 * Session is gone (the unavailable badge); without one, absence means nothing.
 */
export interface Catalog {
  readonly entries: ReadonlyMap<string, CatalogEntry>
  /** True when the Session catalog snapshot was supplied. */
  readonly sessionsKnown: boolean
}

/** No catalog information: every label falls back to the stored snapshot. */
export const EMPTY_CATALOG: Catalog = { entries: new Map<string, CatalogEntry>(), sessionsKnown: false }

/** Catalog sources, either of which may be missing. */
export interface CatalogSources {
  readonly sessions?: SessionCatalogState | undefined
  readonly workspaces?: WorkspaceCatalogState | undefined
}

/** Mutable accumulator of one catalog entry. */
interface MutableCatalogEntry {
  title: string | undefined
  workspaceId: string | undefined
  workspacePath: string | undefined
  archived: boolean
  available: boolean
}

/** First non-empty title of a Session catalog row. */
function titleOfRow(row: SessionCatalogRow | undefined): string | undefined {
  if (row === undefined) return undefined
  if (row.title !== undefined && row.title !== '') return row.title
  if (row.displayTitle !== undefined && row.displayTitle !== '') return row.displayTitle
  return undefined
}

/**
 * Merge the Session and Workspace catalog snapshots into one lookup.
 *
 * The Session list decides availability: when it is known and has no row for a
 * Session, that Session is gone. The Workspace list contributes identity (which
 * workspace a Session sits in) and the archive set. Either source may be
 * missing; the result is then partial and labels fall back to stored snapshots.
 * @param sources - the two catalog snapshots, as the platform hooks see them.
 * @returns Session id → live identity.
 */
export function buildCatalog(sources: CatalogSources): Catalog {
  const entries = new Map<string, MutableCatalogEntry>()
  const sessions = sources.sessions
  // An unfinished list (phase 'pending', or an empty list before its first
  // read) must not brand live rows unavailable: absence is only evidence once
  // the list has arrived.
  const known = sessions !== undefined && sessions.phase !== 'pending'
  const entryOf = (sessionId: string): MutableCatalogEntry => {
    let entry = entries.get(sessionId)
    if (entry === undefined) {
      entry = { title: undefined, workspaceId: undefined, workspacePath: undefined, archived: false, available: !known }
      entries.set(sessionId, entry)
    }
    return entry
  }

  if (sessions !== undefined) {
    for (const [sessionId, row] of Object.entries(sessions.byId)) {
      const entry = entryOf(String(sessionId))
      entry.available = true
      entry.title = titleOfRow(row)
    }
  }

  const workspaces = sources.workspaces
  if (workspaces !== undefined) {
    for (const workspace of workspaces.items) {
      const workspaceId = String(workspace.workspaceId)
      for (const rawId of workspace.sessionIds ?? []) {
        const entry = entryOf(String(rawId))
        entry.workspaceId = workspaceId
        entry.workspacePath = workspace.path
      }
    }
    for (const rawId of workspaces.archivedSessionIds) {
      entryOf(String(rawId)).archived = true
    }
  }

  return { entries, sessionsKnown: known }
}

/**
 * Live identity of one Session; an absent row resolves to the stored-snapshot
 * fallback rather than inventing values.
 * @param catalog - catalog lookup.
 * @param sessionId - owning Session.
 * @returns the catalog entry, or a neutral one when the catalog knows nothing.
 */
export function catalogEntryOf(catalog: Catalog, sessionId: string): CatalogEntry {
  return catalog.entries.get(String(sessionId)) ?? {
    title: undefined,
    workspaceId: undefined,
    workspacePath: undefined,
    archived: false,
    // A known Session list that has no row for this Session means it is gone.
    available: !catalog.sessionsKnown,
  }
}

/**
 * Whether the catalog reports one Session archived.
 * @param catalog - catalog lookup.
 * @param sessionId - owning Session.
 * @returns true when archived (reveal is disabled in that case).
 */
export function isSessionArchived(catalog: Catalog, sessionId: string): boolean {
  return catalogEntryOf(catalog, sessionId).archived
}

/**
 * Whether one Session no longer exists in the catalog.
 * @param catalog - catalog lookup.
 * @param sessionId - owning Session.
 * @returns true when the Session catalog is known and has no row.
 */
export function isSessionUnavailable(catalog: Catalog, sessionId: string): boolean {
  return !catalogEntryOf(catalog, sessionId).available
}

/* ------------------------------------------------------------------------- *
 * Record provenance (schema v2 `author`, read through its default)
 * ------------------------------------------------------------------------- */

/**
 * Quiet author chip text, present only for an agent-authored row.
 *
 * The reader's own rows stay unlabelled: a "You" chip on every row would be
 * noise, so only the exceptional author earns a chip.
 * @param t - Page translate function.
 * @param record - stored record.
 * @returns the agent label, or undefined for the reader's own rows.
 */
export function authorLabelOf(t: PageTranslate, record: HighlightRecord): string | undefined {
  return authorOf(record) === 'agent' ? t('meta.author.agent') : undefined
}

/** Dictionary key per cursor state. */
const STATE_LABEL_KEYS = {
  new: 'meta.state.new',
  kept: 'meta.state.kept',
  compiled: 'meta.state.compiled',
} as const

/**
 * Localised name of one processing state.
 * @param t - Page translate function.
 * @param state - cursor value.
 * @returns the human label (New, Kept, Compiled).
 */
export function stateLabel(t: PageTranslate, state: RecordState): string {
  return t(STATE_LABEL_KEYS[state])
}

/** One workspace entry of the filter row. */
export interface WorkspaceFacet {
  /** {@link workspaceKeyOf} of the grouping. */
  readonly key: string
  /** Display name: last path segment, the id, or {@link UNKNOWN_WORKSPACE}. */
  readonly label: string
  /** Number of records in the workspace. */
  readonly count: number
}

/** One tag entry of the filter row. */
export interface TagFacet {
  readonly tag: string
  readonly count: number
}

/** Filter-row options derived from the whole record set. */
export interface PageFacets {
  readonly workspaces: readonly WorkspaceFacet[]
  /** Count-descending, then alphabetical. */
  readonly tags: readonly TagFacet[]
}

/** One session group: its records in transcript order. */
export interface SessionGroup {
  readonly sessionId: string
  /** Live catalog title, then the newest stored snapshot; absent = no title known. */
  readonly title: string | undefined
  readonly records: readonly HighlightRecord[]
  /** Newest `updatedAt` among the session's records. */
  readonly newestUpdatedAt: number
}

/** One workspace group: its sessions, newest first. */
export interface WorkspaceGroup {
  /** Grouping identity ({@link workspaceKeyOf}): a path or an id, never rendered. */
  readonly key: string
  /** Display name: the last path segment, the id, or {@link UNKNOWN_WORKSPACE}. */
  readonly label: string
  readonly sessions: readonly SessionGroup[]
  /** Number of records in the workspace. */
  readonly count: number
  /** Newest `updatedAt` among the workspace's records. */
  readonly newestUpdatedAt: number
}

/** Collapse-state key of a workspace group. */
export function workspaceGroupKey(workspace: string): string {
  return `workspace:${workspace}`
}

/** Collapse-state key of a session group. */
export function sessionGroupKey(sessionId: string): string {
  return `session:${sessionId}`
}

/**
 * Grouping key of one record's workspace: the live catalog path first, then the
 * live workspace id, then the stored path/id snapshots.
 * @param record - Stored record.
 * @param catalog - live catalog lookup.
 * @returns the workspace path or id when known, else {@link UNKNOWN_WORKSPACE}.
 */
export function workspaceKeyOf(record: HighlightRecord, catalog: Catalog = EMPTY_CATALOG): string {
  const entry = catalogEntryOf(catalog, record.sessionId)
  return entry.workspacePath
    ?? entry.workspaceId
    ?? record.workspacePath
    ?? record.workspaceId
    ?? UNKNOWN_WORKSPACE
}

/**
 * Last path segment of a workspace path (both separators accepted).
 * @param path - Workspace path or label.
 * @returns the final segment, or the input when it has none.
 */
export function workspaceBasename(path: string): string {
  const parts = path.split(/[\\/]/u).filter(part => part !== '')
  return parts[parts.length - 1] ?? path
}

/**
 * Display name of one workspace grouping key.
 *
 * A path reduces to its last segment (the workspace's name); an id or the
 * unknown label is already a name and passes through.
 * @param key - workspace grouping key.
 * @returns the name the heading renders.
 */
export function workspaceDisplayName(key: string): string {
  return key === UNKNOWN_WORKSPACE ? key : workspaceBasename(key)
}

/**
 * Display label of one record's workspace (name, never the absolute path).
 * @param record - Stored record.
 * @param catalog - live catalog lookup.
 * @returns the workspace name, its id, or {@link UNKNOWN_WORKSPACE}.
 */
export function workspaceLabelOf(record: HighlightRecord, catalog: Catalog = EMPTY_CATALOG): string {
  return workspaceDisplayName(workspaceKeyOf(record, catalog))
}

/**
 * Display label of one record's session: the live catalog title first, then the
 * stored snapshot; absent when neither knows a title.
 * @param record - Stored record.
 * @param catalog - live catalog lookup.
 * @returns the session title, or undefined.
 */
export function sessionLabelOf(record: HighlightRecord, catalog: Catalog = EMPTY_CATALOG): string | undefined {
  const live = catalogEntryOf(catalog, record.sessionId).title
  if (live !== undefined) return live
  const stored = record.sessionTitle
  return stored === undefined || stored === '' ? undefined : stored
}

/**
 * Whether a record matches the free-text query (quote, note or tags).
 * @param record - Stored record.
 * @param query - Raw query text; surrounding space is ignored.
 * @returns true when the query is empty or appears case-insensitively.
 */
export function matchesQuery(record: HighlightRecord, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  if (record.anchor.quote.toLowerCase().includes(needle)) return true
  if (record.note !== undefined && record.note.toLowerCase().includes(needle)) return true
  return record.tags.some(tag => tag.toLowerCase().includes(needle))
}

/**
 * Apply the filter set to the stored records.
 * @param records - Stored records (tombstones are dropped).
 * @param filters - Current filter combination.
 * @param orphanedIds - Records whose anchor cannot currently resolve.
 * @param catalog - live catalog lookup (workspace filters match live identity).
 * @returns the records that pass, preserving store order.
 */
export function filterRecords(
  records: readonly HighlightRecord[],
  filters: PageFilters,
  orphanedIds: ReadonlySet<string>,
  catalog: Catalog = EMPTY_CATALOG,
): HighlightRecord[] {
  return records.filter(record => {
    if (record.deletedAt !== undefined) return false
    if (!filters.showUnanchored && orphanedIds.has(record.id)) return false
    if (filters.starredOnly && !record.starred) return false
    if (filters.author !== undefined && authorOf(record) !== filters.author) return false
    if (filters.colorId !== undefined && record.colorId !== filters.colorId) return false
    if (filters.workspace !== undefined && workspaceKeyOf(record, catalog) !== filters.workspace) return false
    if (filters.tag !== undefined && !record.tags.includes(filters.tag)) return false
    return matchesQuery(record, filters.query)
  })
}

/**
 * Whether any filter (search included) is narrowing the list.
 * @param filters - Current filter combination.
 * @returns true when clearing the filters would show more records.
 */
export function hasActiveFilters(filters: PageFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.workspace !== undefined ||
    filters.tag !== undefined ||
    filters.colorId !== undefined ||
    filters.starredOnly ||
    filters.author !== undefined ||
    !filters.showUnanchored
  )
}

/**
 * Derive the filter-row options from the whole (unfiltered) record set.
 * @param records - Stored records; tombstones are ignored.
 * @param catalog - live catalog lookup (labels use the workspace name).
 * @returns workspaces and tags with their counts.
 */
export function deriveFacets(records: readonly HighlightRecord[], catalog: Catalog = EMPTY_CATALOG): PageFacets {
  const workspaces = new Map<string, { label: string; count: number }>()
  const tags = new Map<string, number>()
  for (const record of records) {
    if (record.deletedAt !== undefined) continue
    const key = workspaceKeyOf(record, catalog)
    const workspace = workspaces.get(key) ?? { label: workspaceDisplayName(key), count: 0 }
    workspace.count += 1
    workspaces.set(key, workspace)
    for (const tag of record.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1)
  }
  return {
    workspaces: [...workspaces.entries()]
      .map(([key, workspace]) => ({ key, label: workspace.label, count: workspace.count }))
      .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key)),
    tags: [...tags.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag)),
  }
}

/** Mutable accumulator for one session while grouping. */
interface SessionAccumulator {
  sessionId: string
  title: string | undefined
  newestUpdatedAt: number
  records: HighlightRecord[]
}

/** Mutable accumulator for one workspace while grouping. */
interface WorkspaceAccumulator {
  key: string
  sessions: Map<string, SessionAccumulator>
}

/**
 * Group filtered records by workspace and, inside it, by session.
 *
 * Workspace identity is the live catalog path/id with the stored snapshot as
 * fallback; the heading label is its name. Sessions sort by their newest
 * record's `updatedAt` (newest first) and the records inside one session by
 * transcript position, so the page reads like the conversation itself. Titles
 * resolve live from the catalog; the newest stored snapshot is the fallback.
 * @param records - Records to group, in any order.
 * @param catalog - live catalog lookup.
 * @returns workspace groups in newest-first order.
 */
export function groupRecords(records: readonly HighlightRecord[], catalog: Catalog = EMPTY_CATALOG): WorkspaceGroup[] {
  const workspaces = new Map<string, WorkspaceAccumulator>()
  for (const record of records) {
    const key = workspaceKeyOf(record, catalog)
    let workspace = workspaces.get(key)
    if (workspace === undefined) {
      workspace = { key, sessions: new Map() }
      workspaces.set(key, workspace)
    }
    let session = workspace.sessions.get(record.sessionId)
    if (session === undefined) {
      session = {
        sessionId: record.sessionId,
        title: sessionLabelOf(record, catalog),
        newestUpdatedAt: Number.NEGATIVE_INFINITY,
        records: [],
      }
      workspace.sessions.set(record.sessionId, session)
    } else if (record.updatedAt > session.newestUpdatedAt) {
      // The newest record carries the freshest stored title snapshot.
      session.title = sessionLabelOf(record, catalog)
    }
    if (record.updatedAt > session.newestUpdatedAt) session.newestUpdatedAt = record.updatedAt
    session.records.push(record)
  }

  return [...workspaces.values()]
    .map(workspace => {
      const sessions = [...workspace.sessions.values()]
        .map(session => ({
          sessionId: session.sessionId,
          title: session.title,
          records: [...session.records].sort(comparePosition),
          newestUpdatedAt: session.newestUpdatedAt,
        }))
        .sort(
          (left, right) =>
            right.newestUpdatedAt - left.newestUpdatedAt || left.sessionId.localeCompare(right.sessionId),
        )
      return {
        key: workspace.key,
        label: workspaceDisplayName(workspace.key),
        sessions,
        count: sessions.reduce((total, session) => total + session.records.length, 0),
        newestUpdatedAt: sessions.reduce((newest, session) => Math.max(newest, session.newestUpdatedAt), Number.NEGATIVE_INFINITY),
      }
    })
    .sort(
      (left, right) =>
        right.newestUpdatedAt - left.newestUpdatedAt ||
        left.label.localeCompare(right.label) ||
        left.key.localeCompare(right.key),
    )
}

/** Bucket sizes of {@link formatRelativeTime}. */
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

/**
 * Compact relative time for a row's metadata line.
 *
 * The bucket boundaries already match the platform's shared relative-time
 * helper. Words travel through `t` when a translate function is supplied;
 * without one the English defaults keep the pure derivation testable alone.
 * @param at - Epoch ms of the dated moment.
 * @param now - Current epoch ms (injected so rendering stays pure).
 * @param t - Optional page translate function.
 * @returns a short label such as `3h ago`.
 */
export function formatRelativeTime(at: number, now: number, t?: PageTranslate): string {
  const elapsed = Math.max(0, now - at)
  if (elapsed < MINUTE_MS) return t?.('time.now') ?? 'just now'
  if (elapsed < HOUR_MS) {
    const count = Math.floor(elapsed / MINUTE_MS)
    return t?.('time.minutes', { count }) ?? `${String(count)}m ago`
  }
  if (elapsed < DAY_MS) {
    const count = Math.floor(elapsed / HOUR_MS)
    return t?.('time.hours', { count }) ?? `${String(count)}h ago`
  }
  if (elapsed < MONTH_MS) {
    const count = Math.floor(elapsed / DAY_MS)
    return t?.('time.days', { count }) ?? `${String(count)}d ago`
  }
  if (elapsed < YEAR_MS) {
    const count = Math.floor(elapsed / MONTH_MS)
    return t?.('time.months', { count }) ?? `${String(count)}mo ago`
  }
  const count = Math.floor(elapsed / YEAR_MS)
  return t?.('time.years', { count }) ?? `${String(count)}y ago`
}

/* ------------------------------------------------------------------------- *
 * "Worth another look" (M4 resurfacing, free of model tokens)
 *
 * The invariant: a row appears only with a reason, and the reasons are exactly
 * the four the plan allows — no speculative scoring, no "never revisited"
 * (visits are not tracked).
 * ------------------------------------------------------------------------- */

/** Why one record resurfaced. */
export type WorthReason = 'starredNew' | 'keptUncompiled' | 'textChanged' | 'staleNew'

/** Rows the block shows before the reader asks for the rest. */
export const WORTH_LIMIT = 3

/** Age after which an untouched `new` item is worth surfacing. */
const WORTH_MONTH_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Deterministic precedence of the reasons: the plan's order.
 *
 * A record can satisfy several predicates; it carries exactly one reason, the
 * first match below, so the block can never show two reasons for one row.
 */
const WORTH_PRECEDENCE: Readonly<Record<WorthReason, number>> = {
  starredNew: 0,
  keptUncompiled: 1,
  textChanged: 2,
  staleNew: 3,
}

/** Dictionary key of each reason line. */
export const WORTH_REASON_KEYS: Readonly<Record<WorthReason, 'worth.reason.starredNew' | 'worth.reason.keptUncompiled' | 'worth.reason.textChanged' | 'worth.reason.staleNew'>> = {
  starredNew: 'worth.reason.starredNew',
  keptUncompiled: 'worth.reason.keptUncompiled',
  textChanged: 'worth.reason.textChanged',
  staleNew: 'worth.reason.staleNew',
}

/** One resurfaced row: the record plus the one reason it is here. */
export interface WorthCandidate {
  readonly record: HighlightRecord
  /** The single predicate that surfaced this record. */
  readonly reason: WorthReason
}

/**
 * The one reason a record surfaces, or undefined when it does not.
 *
 * Predicates, in precedence order (first match wins):
 * 1. starred and still `new` — the reader flagged it, then never moved it;
 * 2. `kept` but not `compiled` — the cursor's promised next step;
 * 3. text changed — the anchor does not resolve in its own session;
 * 4. older than 30 days and still `new` — captured, never triaged.
 * @param record - stored record.
 * @param orphanedIds - record ids whose anchor no longer resolves.
 * @param now - render clock.
 * @returns the reason, or undefined.
 */
function worthReasonOf(
  record: HighlightRecord,
  orphanedIds: ReadonlySet<string>,
  now: number,
): WorthReason | undefined {
  const state = stateOf(record)
  if (record.starred && state === 'new') return 'starredNew'
  if (state === 'kept') return 'keptUncompiled'
  if (orphanedIds.has(record.id)) return 'textChanged'
  if (state === 'new' && now - record.updatedAt > WORTH_MONTH_MS) return 'staleNew'
  return undefined
}

/**
 * Pick the records worth another look, one reason each, in a deterministic order.
 *
 * Order is reason precedence, then most recently touched, then id — so the same
 * data always renders the same block (no reshuffle on a clock tick).
 * @param records - stored records (tombstones are dropped).
 * @param orphanedIds - record ids whose anchor no longer resolves.
 * @param now - render clock.
 * @returns the candidates, capped by the caller for display.
 */
export function worthReview(
  records: readonly HighlightRecord[],
  orphanedIds: ReadonlySet<string>,
  now: number,
): WorthCandidate[] {
  const candidates: WorthCandidate[] = []
  for (const record of records) {
    if (record.deletedAt !== undefined) continue
    const reason = worthReasonOf(record, orphanedIds, now)
    if (reason !== undefined) candidates.push({ record, reason })
  }
  return candidates.sort(
    (left, right) =>
      WORTH_PRECEDENCE[left.reason] - WORTH_PRECEDENCE[right.reason] ||
      right.record.updatedAt - left.record.updatedAt ||
      left.record.id.localeCompare(right.record.id),
  )
}
