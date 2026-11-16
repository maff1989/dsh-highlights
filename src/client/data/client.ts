/**
 * Browser-side record store: the single source every surface reads.
 *
 * One snapshot object, one subscription source, and one refresh path — lists,
 * painter, and card all project the same state, so a write updates every
 * surface without cross-notification. Writes are applied optimistically and
 * then replaced by the Host's authoritative record, which also keeps a slow
 * read from overwriting a confirmed write (the catalog-source supersede rule).
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

import type { HighlightRecord } from '../../shared/schema'
import type { HelloValue, QueryInput, QueryValue } from '../../shared/protocol'
import { HighlightsRpcError, type HighlightsTransport } from './transport'

/** Load state of the record set. */
export type RecordsStatus = 'idle' | 'loading' | 'ready' | 'error'

/** What every surface observes. */
export interface HighlightsSnapshot {
  readonly status: RecordsStatus
  readonly records: readonly HighlightRecord[]
  readonly byId: ReadonlyMap<string, HighlightRecord>
  readonly hello: HelloValue | undefined
  /** Set while the last read failed; the previous records stay rendered. */
  readonly error: string | undefined
  /** True when a transport failure suggests the Host is unreachable. */
  readonly offline: boolean
  /** True when the browser cannot paint highlights at all. */
  readonly paintSupported: boolean
  
/** Records whose anchor could not be resolved in the current transcript. */
  readonly stale: ReadonlySet<string>
  /** Identity-stable record arrays per session (see `recordsForSession`). */
  readonly recordsBySession: ReadonlyMap<string, readonly HighlightRecord[]>
  /** Stale ids per session; the page-level `stale` remains the compatibility union. */
  readonly staleBySession: ReadonlyMap<string, ReadonlySet<string>>
  /** Monotonic paint signal: increments only when records or stale state changed. */
  readonly paintEpoch: number
  /** Record ids with an optimistic write or an in-flight command. */
  readonly inFlight: ReadonlySet<string>
}

/** Shared empty arrays for selectors (stable identity). */
export const EMPTY_RECORDS: readonly HighlightRecord[] = Object.freeze([])
export const EMPTY_STALE: ReadonlySet<string> = Object.freeze(new Set<string>())

/**
 * Group records by session while preserving each session's previous array when
 * its member records did not change. This is what makes a session selector
 * element-wise stable across unrelated writes.
 * @param records - next record set.
 * @param previous - previous grouping, if any.
 */
function groupBySession(
  records: readonly HighlightRecord[],
  previous: ReadonlyMap<string, readonly HighlightRecord[]>,
): ReadonlyMap<string, readonly HighlightRecord[]> {
  const grouped = new Map<string, HighlightRecord[]>()
  for (const record of records) {
    const bucket = grouped.get(record.sessionId)
    if (bucket === undefined) grouped.set(record.sessionId, [record])
    else bucket.push(record)
  }
  const result = new Map<string, readonly HighlightRecord[]>()
  for (const [sessionId, next] of grouped) {
    const before = previous.get(sessionId)
    const unchanged = before !== undefined
      && before.length === next.length
      && next.every((record, index) => record === before[index])
    result.set(sessionId, unchanged ? before : next)
  }
  return result
}

/** The client store: snapshot holder plus optimistic mutation helpers. */
export class HighlightsClient {
  private snapshot: HighlightsSnapshot
  private readonly listeners = new Set<() => void>()
  private inflight: Promise<void> | undefined
  private readAbort: AbortController | undefined
  private lastReadAt = 0
  /**
   * Counts local authoritative writes (creates, confirmed updates, deletes).
   * A read that started before a write must not publish its stale snapshot —
   * the read re-runs instead.
   */
  private writeOrdinal = 0
  /** Paint epoch; see `HighlightsSnapshot.paintEpoch`. */
  private paintEpoch = 0
  /** Per-session stale ids; `stale` stays the union for page-level filters. */
  private readonly staleBySession = new Map<string, ReadonlySet<string>>()
  /** Record ids with work in flight. */
  private readonly inFlight = new Set<string>()

  /** Observable source handed to slot `hooks`. */
  readonly source: ObservableSnapshot<HighlightsSnapshot>

  /** Delays between read retries for transport failures (tests pass `[]`). */
  private readonly retryDelays: readonly number[]

  constructor(
    private readonly transport: HighlightsTransport,
    private readonly now: () => number = Date.now,
    options: { readonly retryDelays?: readonly number[] } = {},
  ) {
    this.retryDelays = options.retryDelays ?? [300, 900]
    this.snapshot = {
      status: 'idle',
      records: [],
      byId: new Map(),
      hello: undefined,
      error: undefined,
      offline: false,
      paintSupported: typeof CSS !== 'undefined' && 'highlights' in CSS,
      stale: new Set<string>(),
      recordsBySession: new Map(),
      staleBySession: new Map(),
      paintEpoch: 0,
      inFlight: new Set(),
    }
    this.source = {
      getSnapshot: () => this.snapshot,
      subscribe: listener => {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      },
    }
  }

  /** Current snapshot (synchronous). */
  getSnapshot(): HighlightsSnapshot {
    return this.snapshot
  }

  /**
   * Ask the Host for one bounded page (filter/pagination/compression).
   * Surfaces migrate to this in Phase 6; `list` remains for compatibility.
   * @param input - validated query input.
   * @param signal - optional cancellation.
   */
  async query(input: QueryInput, signal?: AbortSignal): Promise<QueryValue> {
    return this.transport.query(input, signal)
  }

  /**
   * Live records for one session, with identity stability.
   *
   * Returns the same array until that session's records actually change, so a
   * selector can compare with `Object.is` and an unrelated write does not
   * re-render every surface.
   * @param sessionId - owning session.
   */
  recordsForSession(sessionId: string): readonly HighlightRecord[] {
    return this.snapshot.recordsBySession.get(sessionId) ?? EMPTY_RECORDS
  }

  /** Compatibility alias: the old name of {@link recordsForSession}. */
  forSession(sessionId: string): readonly HighlightRecord[] {
    return this.recordsForSession(sessionId)
  }



  /**
   * Read `hello` and the record set. Concurrent calls share one read.
   * @param force - Ignore the freshness window.
   * @returns completion of the read.
   */
  async refresh(force = false): Promise<void> {
    if (this.inflight !== undefined) {
      if (!force) return this.inflight
      // A forced refresh supersedes an in-flight background read.
      this.readAbort?.abort()
      await this.inflight.catch(() => undefined)
    }
    if (!force && this.snapshot.status === 'ready' && this.now() - this.lastReadAt < 2_000) return
    this.inflight = this.read()
    try {
      await this.inflight
    } finally {
      this.inflight = undefined
    }
  }

  /** Replace the whole set (used by a read or after a write). */
  applyRecords(records: readonly HighlightRecord[]): void {
    this.set({
      status: 'ready',
      records,
      byId: new Map(records.map(record => [record.id, record])),
      error: undefined,
      offline: false,
    })
    this.lastReadAt = this.now()
  }

  /** Insert or replace one record, preserving snapshots' object identity when unchanged. */
  upsert(record: HighlightRecord): void {
    this.writeOrdinal += 1
    const records = this.mergeOne(record)
    this.set({
      records,
      byId: new Map(records.map(item => [item.id, item])),
    })
  }

  /** Drop one record from the visible set (a tombstone arrives through a refresh). */
  evict(id: string): void {
    this.writeOrdinal += 1
    const records = this.snapshot.records.filter(record => record.id !== id)
    this.set({
      records,
      byId: new Map(records.map(item => [item.id, item])),
    })
  }

  /**
   * Record the ids that could not be resolved in the transcript.
   * @param ids - Stale record ids.
   */
  setStale(ids: readonly string[]): void {
    const next = new Set(ids)
    const current = this.snapshot.stale
    if (next.size === current.size && [...next].every(id => current.has(id))) return
    this.set({ stale: next })
  }

  /**
   * Publish stale ids for one session.
   * @param sessionId - owning session.
   * @param ids - ids that failed to resolve in that session's transcript.
   */
  setStaleForSession(sessionId: string, ids: readonly string[]): void {
    const next = new Set(ids)
    const previous = this.staleBySession.get(sessionId)
    if (previous !== undefined && previous.size === next.size && [...next].every(id => previous.has(id))) return
    if (next.size === 0) this.staleBySession.delete(sessionId)
    else this.staleBySession.set(sessionId, next)
    // Keep the page-level union honest without making it the owner of session state.
    const union = new Set<string>()
    for (const set of this.staleBySession.values()) for (const id of set) union.add(id)
    this.set({ stale: union, staleBySession: new Map(this.staleBySession) })
  }

  /** Stale ids for one session. */
  staleForSession(sessionId: string): ReadonlySet<string> {
    return this.staleBySession.get(sessionId) ?? new Set<string>()
  }

  /** Mark a record as having work in flight (optimistic write or command). */
  beginInFlight(id: string): void {
    if (this.inFlight.has(id)) return
    this.inFlight.add(id)
    this.set({ inFlight: new Set(this.inFlight) })
  }

  /** Clear a record's in-flight marker. */
  endInFlight(id: string): void {
    if (!this.inFlight.delete(id)) return
    this.set({ inFlight: new Set(this.inFlight) })
  }

  /**
   * Create one record through the Host and publish it.
   * @param draft - Create payload from a capture.
   * @param transport - Transport to write through.
   * @returns the confirmed record.
   */
  async createRecord(draft: Parameters<HighlightsTransport['create']>[0]): Promise<HighlightRecord> {
    // The provisional record carries version 0: it exists only in this snapshot
    // and is replaced by the Host's answer, so no write can be based on it.
    const provisional: HighlightRecord = {
      ...draft,
      schemaVersion: 1,
      version: 0,
      createdAt: this.now(),
      updatedAt: this.now(),
    }
    this.upsert(provisional)
    try {
      const created = await this.transport.create(draft)
      this.upsert(created)
      return created
    } catch (error) {
      this.evict(provisional.id)
      throw error
    }
  }

  /** Mark the Host as unreachable while keeping the last successful data. */
  markOffline(message: string): void {
    this.set({ status: this.snapshot.status === 'idle' ? 'error' : this.snapshot.status, error: message, offline: true })
  }

  /** Store the protocol/limits snapshot. */
  setHello(hello: HelloValue): void {
    this.set({ hello })
  }

  private mergeOne(record: HighlightRecord): HighlightRecord[] {
    const next = this.snapshot.records.filter(item => item.id !== record.id)
    next.push(record)
    return next
  }

  private set(patch: Partial<HighlightsSnapshot>): void {
    // Records or stale state changed ⇒ bump the paint signal. Other patches
    // (hello, status, inFlight) must not wake paint.
    const paintChanged = patch.records !== undefined || patch.stale !== undefined
    const grouped = patch.records === undefined
      ? {}
      : { recordsBySession: groupBySession(patch.records, this.snapshot.recordsBySession) }
    const nextPatch: Partial<HighlightsSnapshot> = paintChanged
      ? { ...patch, ...grouped, paintEpoch: this.paintEpoch + 1 }
      : { ...patch, ...grouped }
    this.snapshot = { ...this.snapshot, ...nextPatch }
    if (paintChanged) this.paintEpoch += 1
    for (const listener of this.listeners) listener()
  }

  private async read(attempt = 0): Promise<void> {
    if (this.snapshot.status === 'idle') this.set({ status: 'loading' })
    const startOrdinal = this.writeOrdinal
    const controller = new AbortController()
    this.readAbort = controller
    try {
      let hello: Awaited<ReturnType<HighlightsTransport['hello']>> | undefined
      let list: Awaited<ReturnType<HighlightsTransport['list']>> | undefined
      // Retry only transient transport failures, with bounded backoff. A typed
      // refusal (forbidden/not-found/bad-request) is final.
      for (let attempt = 0; ; attempt += 1) {
        try {
          const pair = await Promise.all([
            this.transport.hello(controller.signal),
            this.transport.list(undefined, controller.signal),
          ])
          hello = pair[0]
          list = pair[1]
          break
        } catch (error) {
          const retryable = error instanceof HighlightsRpcError && error.code === 'transport'
          const delay = this.retryDelays[attempt]
          if (!retryable || delay === undefined || controller.signal.aborted) throw error
          await new Promise<void>(resolve => { setTimeout(resolve, delay) })
          if (controller.signal.aborted) throw error
        }
      }
      if (hello !== undefined) this.set({ hello })
      if (this.writeOrdinal !== startOrdinal && attempt < 3) {
        // A write landed while this read was in flight: publishing the read
        // would resurrect the pre-write snapshot. Re-read instead.
        return await this.read(attempt + 1)
      }
      if (list !== undefined) this.applyRecords(list.records)
    } catch (error) {
      // A superseded read is not a failure: the newer read owns the snapshot.
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
      this.set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        offline: true,
      })
    } finally {
      if (this.readAbort === controller) this.readAbort = undefined
    }
  }
}
