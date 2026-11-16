/**
 * The action implementation every Highlights surface calls.
 *
 * One object keeps the concerns together: record mutations through the
 * transport with truthful compare-and-set outcomes, clipboard copy with a real
 * success signal and an insecure-context fallback, reveal via the public
 * session navigation, and composer insertion through the per-session queue.
 * Surfaces depend on the {@link HighlightsActions} interface; tests and the
 * page/panel get this object injected.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

import type { HighlightAnchor, HighlightRecord, UpdatePatch } from '../../shared/schema'
import { MAX_QUOTE_CHARS, PALETTE_SIZE } from '../../shared/constants'
import { comparePosition } from '../../shared/position'
import { stateOf, visibilityOf } from '../../shared/provenance'
import type { HighlightDraft, HighlightsActions, InsertOutcome, InsertTarget, RevealOutcome, WriteOutcome } from './actions'
import type { HighlightsClient } from './client'
import type { SessionContext } from './context'
import type { HighlightsTransport } from './transport'
import { captureMessageAnchor } from '../anchor/capture'
import { findNodeSeat } from '../anchor/seat'
import { newRecordId } from './random-id'
import type { HighlightsPainter } from '../paint/adapters/css-highlights'
import type { RevealPort } from '../contracts/reveal'
import { revealRecord } from '../reveal'
import type { InsertService } from '../services/insert'

/** Storage key of the browser-local UI preferences. */
const PREFS_KEY = 'dsh.highlights.prefs.v1'

/** Browser-local preferences: last colour used, independent of records. */
interface Prefs {
  lastColorId: number
}

/** Read the preferences, defaulting when absent or unreadable. */
function readPrefs(): Prefs {
  try {
    const raw = globalThis.localStorage?.getItem(PREFS_KEY)
    if (raw === null || raw === undefined) return { lastColorId: 3 }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    const color = typeof parsed.lastColorId === 'number' && parsed.lastColorId >= 1 && parsed.lastColorId <= PALETTE_SIZE
      ? parsed.lastColorId
      : 3
    return { lastColorId: color }
  } catch {
    return { lastColorId: 3 }
  }
}

/** Persist the preferences, ignoring storage failures. */
function writePrefs(prefs: Prefs): void {
  try {
    globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Preferences are a convenience; failing to persist them changes nothing.
  }
}

/** Human-readable failure text from an unknown rejection. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Most items one briefing carries (the plan's cap). */
const BRIEF_ITEM_LIMIT = 10

/**
 * Excerpt length per item.
 *
 * The record id is the payload — the agent resolves the full quote with
 * `get_highlight` — so the excerpt only has to make the row recognisable.
 */
const BRIEF_EXCERPT_CHARS = 120

/**
 * Collapse a quote to one safe packet line.
 * @param quote - stored quote (may contain newlines).
 * @returns one line, capped with an ellipsis.
 */
function briefExcerpt(quote: string): string {
  const collapsed = quote.replace(/\s+/gu, ' ').trim()
  if (collapsed.length <= BRIEF_EXCERPT_CHARS) return collapsed
  return `${collapsed.slice(0, BRIEF_EXCERPT_CHARS - 1)}…`
}

/**
 * Build the one-packet briefing text.
 *
 * Shape (the composer receives it verbatim):
 * `Highlight briefing — “{session}”, {n} items:` then one
 * `{i}. “{excerpt}” — highlight {id} · {state}` per record. Items are dropped
 * from the end when the packet would exceed the insertion cap — an identifier
 * is never cut in half.
 * @param sessionLabel - session title (stored snapshot) or id.
 * @param records - briefable records, already ordered and capped.
 * @returns the packet text.
 */
function buildBriefingPacket(sessionLabel: string, records: readonly HighlightRecord[]): string {
  const items = records.map((record, index) => (
    `${String(index + 1)}. “${briefExcerpt(record.anchor.quote)}” — highlight ${record.id} · ${stateOf(record)}`
  ))
  for (;;) {
    const header = `Highlight briefing — “${sessionLabel}”, ${String(items.length)} items:`
    const packet = [header, ...items].join('\n')
    if (packet.length <= MAX_QUOTE_CHARS || items.length <= 1) return packet
    items.pop()
  }
}

/**
 * Queue stand-in for one briefing packet.
 *
 * `InsertService.enqueue` is record-shaped because every other insertion is one
 * quote; a briefing is one packet, so it rides the same queue as a transient
 * record whose anchor quote is the packet. The id names the queue entry only
 * (it never reaches the Host) and dedupes an identical pending packet while
 * letting changed content enqueue.
 * @param record - first record of the briefing (template for the queue entry).
 * @param sessionId - destination session.
 * @param packet - packet text.
 * @returns the transient record handed to the queue.
 */
function briefingQueueRecord(record: HighlightRecord, sessionId: string, packet: string): HighlightRecord {
  return {
    ...record,
    id: `brief:${sessionId}:${String(packet.length)}:${record.id}`,
    anchor: { ...record.anchor, quote: packet, prefix: '', suffix: '' },
  }
}

/** One removed record kept for the Undo affordance. */
interface RemovedEntry {
  readonly record: HighlightRecord
}

/**
 * Apply a presentation patch locally (the optimistic half of a write).
 * @param current - authoritative record before the write.
 * @param patch - presentation fields.
 * @param now - local timestamp for `updatedAt`.
 */
function applyPatchOptimistically(current: HighlightRecord, patch: UpdatePatch, now: number): HighlightRecord {
  return {
    ...current,
    ...(patch.colorId === undefined ? {} : { colorId: patch.colorId }),
    ...(patch.tags === undefined ? {} : { tags: [...patch.tags] }),
    ...(patch.note === undefined ? {} : patch.note === null ? { note: undefined } : { note: patch.note }),
    ...(patch.starred === undefined ? {} : { starred: patch.starred }),
    updatedAt: now,
  }
}

/** Options accepted by the session-creation provider. */
type SessionCreateOptions = NonNullable<Parameters<ClientContext['sessions']['create']>[0]>

/** Dependencies the action object needs. */
export interface ActionsDeps {
  readonly ctx: ClientContext
  readonly client: HighlightsClient
  readonly transport: HighlightsTransport
  readonly painter: HighlightsPainter
  readonly insert: InsertService
  readonly translate: (key: string, params?: Record<string, string | number>) => string
  /** Single-flight cancellable reveal; absent only in legacy unit harnesses. */
  readonly reveal?: RevealPort
}

/** The concrete action object. */
export class HighlightsActionsImpl implements HighlightsActions {
  private readonly removed = new Map<string, RemovedEntry>()
  private prefs = readPrefs()
  /** Single-flight keys: a double-click is rejected, not sent twice. */
  private readonly busy = new Set<string>()
  /** Recently briefed packet per session: a double click must not brief twice. */
  private readonly recentBriefs = new Map<string, { readonly signature: string; readonly at: number }>()

  /** Claim a single-flight key. */
  private start(key: string): boolean {
    if (this.busy.has(key)) return false
    this.busy.add(key)
    return true
  }

  /** Release a single-flight key. */
  private end(key: string): void {
    this.busy.delete(key)
  }

  constructor(private readonly deps: ActionsDeps) {}

  /** Colour the last highlight used (defaults to the third palette slot). */
  lastColorId(): number {
    return this.prefs.lastColorId
  }

  /** Every tag currently in use, ordered by frequency then name. */
  tagSuggestions(): readonly string[] {
    const counts = new Map<string, number>()
    for (const record of this.deps.client.getSnapshot().records) {
      for (const tag of record.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag)
  }

  refresh(force = false): void {
    void this.deps.client.refresh(force)
  }

  /**
   * Patch presentation fields with compare-and-set.
   *
   * A conflict is returned as a value and leaves the local snapshot untouched so
   * the editing surface can keep the draft and offer Reload/Overwrite. An
   * Overwrite passes the live version from the returned conflict record as
   * `expectedVersion`.
   * @param id - record id.
   * @param patch - presentation fields.
   * @param expectedVersion - explicit compare-and-set version; omitted uses the snapshot version.
   * @returns what happened to the write.
   */
  async update(id: string, patch: UpdatePatch, expectedVersion?: number): Promise<WriteOutcome> {
    const key = `update:${id}`
    if (!this.start(key)) return { status: 'error', error: this.deps.translate('error.busy') }
    try {
      return await this.updateOnce(id, patch, expectedVersion)
    } finally {
      this.end(key)
    }
  }

  /** The update body (guarded by {@link update}). */
  private async updateOnce(id: string, patch: UpdatePatch, expectedVersion?: number): Promise<WriteOutcome> {
    const client = this.deps.client
    const current = client.getSnapshot().byId.get(id)
    const version = expectedVersion ?? current?.version
    if (version === undefined) return { status: 'error', error: this.deps.translate('error.notFound') }
    if (current !== undefined) client.upsert(applyPatchOptimistically(current, patch, Date.now()))
    client.beginInFlight(id)
    try {
      const result = await this.deps.transport.update(id, version, patch)
      if (result.status !== 'written') {
        // The live record is authoritative; the editor keeps its draft.
        client.upsert(result.record)
        return { status: 'conflict', record: result.record }
      }
      client.upsert(result.record)
      if (patch.colorId !== undefined) this.rememberColor(patch.colorId)
      return { status: 'written', record: result.record }
    } catch (error) {
      // Roll back the optimistic presentation; never re-read the whole store.
      if (current !== undefined) client.upsert(current)
      return { status: 'error', error: messageOf(error) }
    } finally {
      client.endInFlight(id)
    }
  }

  /**
   * Soft-delete one record. The record is hidden and kept for Undo only when the
   * Host confirms the write; a conflict leaves it visible.
   * @param id - record id.
   * @returns what happened to the write.
   */
  async remove(id: string): Promise<WriteOutcome> {
    const key = `remove:${id}`
    if (!this.start(key)) return { status: 'error', error: this.deps.translate('error.busy') }
    try {
      return await this.removeOnce(id)
    } finally {
      this.end(key)
    }
  }

  /** The delete body (guarded by {@link remove}). */
  private async removeOnce(id: string): Promise<WriteOutcome> {
    const client = this.deps.client
    const current = client.getSnapshot().byId.get(id)
    if (current === undefined) return { status: 'error', error: this.deps.translate('error.notFound') }
    client.evict(id)
    client.beginInFlight(id)
    try {
      const result = await this.deps.transport.remove(id, current.version)
      if (result.status !== 'written') {
        client.upsert(result.record)
        return { status: 'conflict', record: result.record }
      }
      this.removed.set(id, { record: result.record })
      return { status: 'written', record: result.record }
    } catch (error) {
      client.upsert(current)
      return { status: 'error', error: messageOf(error) }
    } finally {
      client.endInFlight(id)
    }
  }

  /**
   * Undo a soft delete. Uses the live record's version when it is still in the
   * snapshot (another tab may have touched it), otherwise the tombstone version
   * captured by {@link remove}.
   * @param id - record id.
   * @returns what happened to the write.
   */
  async restore(id: string): Promise<WriteOutcome> {
    const key = `restore:${id}`
    if (!this.start(key)) return { status: 'error', error: this.deps.translate('error.busy') }
    try {
      return await this.restoreOnce(id)
    } finally {
      this.end(key)
    }
  }

  /** The restore body (guarded by {@link restore}). */
  private async restoreOnce(id: string): Promise<WriteOutcome> {
    const entry = this.removed.get(id)
    const live = this.deps.client.getSnapshot().byId.get(id)
    // Restore only un-does an actual deletion: a conflict never creates the
    // removed entry, so a visible live record must not be "restored" (which
    // would bump its version for no user-visible reason).
    if (entry === undefined && (live === undefined || live.deletedAt === undefined)) {
      return { status: 'error', error: this.deps.translate('error.notFound') }
    }
    // Another writer may have restored the row while our Undo entry lingered;
    // do not send a restore for an already-live record (it would only bump the
    // version for no user-visible reason).
    if (entry !== undefined && live !== undefined && live.deletedAt === undefined) {
      this.removed.delete(id)
      return { status: 'written', record: live }
    }
    const expectedVersion = live?.version ?? entry?.record.version
    if (expectedVersion === undefined) return { status: 'error', error: this.deps.translate('error.notFound') }
    const client = this.deps.client
    if (entry !== undefined) {
      const optimistic: HighlightRecord = { ...entry.record, updatedAt: Date.now() }
      const { deletedAt: _deletedAt, ...restored } = optimistic
      void _deletedAt
      client.upsert(restored)
    }
    client.beginInFlight(id)
    try {
      const result = await this.deps.transport.restore(id, expectedVersion)
      if (result.status !== 'written') {
        if (entry !== undefined) client.evict(id)
        if (live !== undefined) client.upsert(live)
        return { status: 'conflict', record: result.record }
      }
      this.removed.delete(id)
      client.upsert(result.record)
      return { status: 'written', record: result.record }
    } catch (error) {
      if (entry !== undefined) client.evict(id)
      if (live !== undefined) client.upsert(live)
      return { status: 'error', error: messageOf(error) }
    } finally {
      client.endInFlight(id)
    }
  }

  /**
   * Save a selection highlight.
   * @param anchor - Captured anchor.
   * @param draft - Presentation fields.
   * @param context - Owning session and display snapshots.
   * @param origin - Install id of this browser session's Host.
   * @returns the created record, or null on failure.
   */
  async createFromAnchor(
    anchor: HighlightAnchor,
    draft: HighlightDraft,
    context: SessionContext,
    origin: string,
  ): Promise<HighlightRecord | null> {
    const id = newRecordId()
    try {
      const created = await this.deps.client.createRecord({
        id,
        sessionId: context.sessionId,
        ...(context.workspaceId === undefined ? {} : { workspaceId: context.workspaceId }),
        ...(context.workspacePath === undefined ? {} : { workspacePath: context.workspacePath }),
        ...(context.sessionTitle === undefined ? {} : { sessionTitle: context.sessionTitle }),
        origin,
        anchor,
        colorId: draft.colorId as HighlightRecord['colorId'],
        ...(draft.author === undefined ? {} : { author: draft.author }),
        ...(draft.state === undefined ? {} : { state: draft.state }),
        ...(draft.intent === undefined ? {} : { intent: draft.intent }),
        ...(draft.visibility === undefined ? {} : { visibility: draft.visibility }),
        tags: [...draft.tags],
        ...(draft.note === undefined ? {} : { note: draft.note }),
        starred: draft.starred,
      })
      this.rememberColor(draft.colorId)
      return created
    } catch {
      return null
    }
  }

  /**
   * Save a whole-message mark.
   *
   * Resolves the response seat (never the reasoning seat that shares the same
   * node key), dedupes against an existing whole-message mark for the same
   * session and node, and reports whether anything new was created.
   * @param nodeKey - Assistant node identity.
   * @param messageId - Durable message id.
   * @param nodeSeq - Session event sequence, when known.
   * @param context - Owning session and display snapshots.
   * @param origin - Install id of this browser session's Host.
   * @returns the mark and whether this call created it, or null when the node is absent.
   */
  async createMessageMark(
    nodeKey: string,
    messageId: string,
    nodeSeq: number | undefined,
    context: SessionContext,
    origin: string,
  ): Promise<{ record: HighlightRecord; created: boolean } | null> {
    const existing = this.deps.client.getSnapshot().records.find(record => (
      record.anchor.kind === 'message'
      && record.sessionId === context.sessionId
      && record.anchor.nodeKey === nodeKey
      && record.deletedAt === undefined
    ))
    if (existing !== undefined) return { record: existing, created: false }
    const seat = findNodeSeat(nodeKey, 'response')
    if (seat === null) return null
    const anchor = captureMessageAnchor(seat, messageId, nodeSeq)
    if (anchor === null) return null
    const record = await this.createFromAnchor(
      anchor,
      { colorId: this.prefs.lastColorId as HighlightRecord['colorId'], tags: [], note: undefined, starred: false },
      context,
      origin,
    )
    return record === null ? null : { record, created: true }
  }

  /**
   * Copy the quote (plus its citation when enabled) to the clipboard.
   *
   * The async Clipboard API is unavailable on a plain-HTTP LAN GUI (insecure
   * context), so a hidden-textarea `execCommand('copy')` fallback keeps the
   * action working; the boolean is true only when a copy actually happened.
   * @param record - record to copy.
   * @returns whether the text reached the clipboard.
   */
  async copyQuote(record: HighlightRecord): Promise<boolean> {
    const attribution = this.attribution(record)
    const text = attribution === undefined ? record.anchor.quote : `${record.anchor.quote}\n\n${attribution}`
    try {
      const clipboard = (globalThis as { navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } } }).navigator?.clipboard
      if (clipboard?.writeText !== undefined) {
        await clipboard.writeText(text)
        return true
      }
    } catch {
      // Fall through to the legacy path: a refused Clipboard API is not fatal.
    }
    return this.copyWithTextarea(text)
  }

  /**
   * Open the owning session and reveal the anchored text.
   * @param record - record to reveal.
   * @returns whether the anchored text was found.
   */
  async reveal(record: HighlightRecord): Promise<RevealOutcome> {
    if (this.deps.reveal !== undefined) {
      const result = await this.deps.reveal.reveal(record)
      return result.status === 'revealed' ? 'revealed' : 'not-found'
    }
    return revealRecord(record, { ctx: this.deps.ctx, painter: this.deps.painter })
  }

  /**
   * Insert the quote into a composer.
   *
   * `current` targets the on-screen session (not the record's owning session),
   * `new` creates a session and queues for that id. The queue entry names its
   * destination, so a new-session insertion can never drain into the source
   * conversation.
   * @param record - source record.
   * @param target - current composer or a new session.
   * @param currentSessionId - the session whose composer is on screen.
   * @returns what happened to the insertion request.
   */
  async insert(record: HighlightRecord, target: InsertTarget, currentSessionId?: string): Promise<InsertOutcome> {
    const summary = this.deps.translate('insert.summary', { session: record.sessionTitle ?? record.sessionId })
    const attribution = this.attribution(record)
    if (target.kind === 'current') {
      const destination = currentSessionId ?? record.sessionId
      if (this.deps.insert.insert(destination, record.anchor.quote, summary, attribution, record.id)) return 'inserted'
      this.deps.insert.enqueue(destination, record, summary, attribution)
      return 'queued'
    }
    const created = await this.createSessionFor(record)
    if (created === undefined) return 'failed'
    this.deps.insert.enqueue(created, record, summary, attribution)
    this.deps.ctx.uiWorkspace.openSession(created)
    return 'queued'
  }

  /**
   * Brief the agent on one session with one insertable packet.
   *
   * Private records never leave the device, records are capped and kept in
   * transcript order, and every item names its record id so the agent can
   * resolve it with `get_highlight`. Insert path: a session whose composer is
   * on screen receives the packet immediately; otherwise it is queued for that
   * session and the session is opened so the queue drains on mount.
   * @param sessionId - session whose composer should receive the packet.
   * @param records - candidate records (the surface's own filtering is kept).
   * @returns inserted when a composer took it, queued when it was queued, failed
   * when there was nothing briefable or the insertion could not be staged.
   */
  async briefSession(sessionId: string, records: readonly HighlightRecord[]): Promise<InsertOutcome> {
    const briefable = records
      .filter(record => record.deletedAt === undefined && visibilityOf(record) !== 'private')
      .sort(comparePosition)
      .slice(0, BRIEF_ITEM_LIMIT)
    const first = briefable[0]
    if (first === undefined) return 'failed'
    const packet = buildBriefingPacket(first.sessionTitle ?? sessionId, briefable)
    // The insertion path is synchronous, so a single-flight key would be freed
    // before the next click lands; a short-lived signature dedupes the actual
    // double click: the same packet for the same session is inserted once.
    const signature = `${String(packet.length)}:${briefable.map(record => record.id).join(',')}`
    const now = Date.now()
    const recent = this.recentBriefs.get(sessionId)
    if (recent !== undefined && recent.signature === signature && now - recent.at < 1_000) return 'inserted'
    this.recentBriefs.set(sessionId, { signature, at: now })
    const summary = this.deps.translate('brief.summary', { count: briefable.length })
    try {
      if (this.deps.insert.insert(sessionId, packet, summary)) return 'inserted'
      this.deps.insert.enqueue(sessionId, briefingQueueRecord(first, sessionId, packet), summary)
      this.deps.ctx.uiWorkspace.openSession(sessionId as SessionId)
      return 'queued'
    } catch {
      // A failed staging must not mask the next attempt as a duplicate.
      this.recentBriefs.delete(sessionId)
      return 'failed'
    }
  }

  openPanelTab(record: HighlightRecord): void {
    this.deps.ctx.layout.selectPanel(null)
    this.deps.ctx.uiWorkspace.openSession(record.sessionId as SessionId)
    this.deps.ctx.sidebarRight.openTab('highlights', { params: { highlightId: record.id } })
  }

  /** Stale record ids reported by the painter. */
  staleIds(): ReadonlySet<string> {
    return this.deps.client.getSnapshot().stale
  }

  paintSupported(): boolean {
    return this.deps.painter.supported
  }

  /** Create a blank session in the record's workspace, when possible. */
  private async createSessionFor(record: HighlightRecord): Promise<SessionId | undefined> {
    try {
      const options: SessionCreateOptions = {}
      if (record.workspaceId !== undefined) {
        options.workspaceId = record.workspaceId as NonNullable<SessionCreateOptions['workspaceId']>
      }
      return await this.deps.ctx.sessions.create(options)
    } catch {
      return undefined
    }
  }

  /** Copy through a hidden textarea; the insecure-context fallback. */
  private copyWithTextarea(text: string): boolean {
    const doc = (globalThis as { document?: Document }).document
    if (doc === undefined || doc.body === null) return false
    const previous = doc.activeElement
    const textarea = doc.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-1000px'
    textarea.style.opacity = '0'
    doc.body.append(textarea)
    try {
      // Focus must move to the textarea for select() to take effect in some
      // browsers; the previously focused control is restored afterwards so the
      // editing surface does not lose focus to the copy action.
      textarea.focus()
      textarea.select()
      textarea.setSelectionRange(0, text.length)
      return typeof doc.execCommand === 'function' && doc.execCommand('copy') === true
    } catch {
      return false
    } finally {
      textarea.remove()
      const focusable = previous as { focus?: () => void } | null
      focusable?.focus?.()
    }
  }

  /** Citation line for copied/inserted text, when the Host enables it. */
  private attribution(record: HighlightRecord): string | undefined {
    if (this.deps.client.getSnapshot().hello?.insertionAttribution === false) return undefined
    if (record.sessionTitle === undefined) return undefined
    const date = new Date(record.createdAt).toISOString().slice(0, 10)
    return this.deps.translate('insert.attribution', { session: record.sessionTitle, date })
  }

  /** Remember the colour for the next highlight. */
  private rememberColor(colorId: number): void {
    this.prefs = { lastColorId: colorId }
    writePrefs(this.prefs)
  }
}
