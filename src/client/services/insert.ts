/**
 * Pending composer insertions and the per-session bridge that drains them.
 *
 * A quote can only be inserted where a composer is mounted, so an insertion
 * aimed at a session that is not on screen is queued (persisted in
 * localStorage, expiring after a day) and applied by that session's bridge as
 * soon as its composer accepts the quote. The bridge also owns the painter
 * lifecycle, because both only make sense while a session is on screen.
 *
 * A queue entry always names its own destination session: the caller (the
 * action layer) resolves `current` to the on-screen session and `new` to the
 * created session id, so a queued insertion can never drift into the session
 * the record was captured in.
 */
import {
  MAX_QUOTE_CHARS,
  PENDING_INSERTION_TTL_MS,
  QUEUE_STORAGE_KEY,
} from '../../shared/constants'
import type { HighlightRecord } from '../../shared/schema'

/** Delay between two drain attempts for one session. */
const RETRY_INTERVAL_MS = 2_000

/** How long retries keep following one session's queue before giving up. */
const RETRY_DEADLINE_MS = 10_000

/** Caps that keep a corrupted or forged queue entry bounded. */
const MAX_ID_CHARS = 512
const MAX_SUMMARY_CHARS = 512
const MAX_ATTRIBUTION_CHARS = 512

/** A queued insertion. */
export interface PendingInsertion {
  readonly id: string
  /** Destination session whose composer should receive the quote. */
  readonly sessionId: string
  readonly quote: string
  readonly summary: string
  readonly attribution: string | undefined
  readonly createdAt: number
}

/** Composer operations the bridge exposes for one session. */
export interface ComposerBridge {
  /** Insert an atomic quote (returns false when the composer refused). */
  insertQuote(text: string, summary?: string): boolean
  /** Append plain text in one undo step. */
  insertText(text: string): boolean
}

/** Narrow one unknown value to a queued insertion, dropping anything malformed. */
function isPendingInsertion(entry: unknown, cutoff: number): entry is PendingInsertion {
  if (typeof entry !== 'object' || entry === null) return false
  const candidate = entry as Record<string, unknown>
  return typeof candidate.id === 'string' && candidate.id.length > 0 && candidate.id.length <= MAX_ID_CHARS
    && typeof candidate.sessionId === 'string' && candidate.sessionId.length > 0 && candidate.sessionId.length <= MAX_ID_CHARS
    && typeof candidate.quote === 'string' && candidate.quote.length > 0 && candidate.quote.length <= MAX_QUOTE_CHARS
    && typeof candidate.summary === 'string' && candidate.summary.length <= MAX_SUMMARY_CHARS
    && (candidate.attribution === undefined
      || (typeof candidate.attribution === 'string' && candidate.attribution.length <= MAX_ATTRIBUTION_CHARS))
    && typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt) && candidate.createdAt >= cutoff
}

/**
 * Read the persisted queue, dropping expired and malformed entries.
 * @param now - Current clock, injectable for tests.
 * @returns the usable entries and whether the persisted form needs a rewrite.
 */
export function readQueue(now: number = Date.now()): { queue: PendingInsertion[]; pruned: boolean } {
  try {
    const raw = globalThis.localStorage?.getItem(QUEUE_STORAGE_KEY)
    if (raw === null || raw === undefined) return { queue: [], pruned: false }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return { queue: [], pruned: true }
    const cutoff = now - PENDING_INSERTION_TTL_MS
    const queue = parsed.filter((entry): entry is PendingInsertion => isPendingInsertion(entry, cutoff))
    return { queue, pruned: queue.length !== parsed.length }
  } catch {
    return { queue: [], pruned: true }
  }
}

/** Persist the queue, ignoring storage failures (private mode, quota). */
function writeQueue(queue: readonly PendingInsertion[]): void {
  try {
    globalThis.localStorage?.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // A queue that cannot persist still works for the current session.
  }
}

/** Owns the queue and the registered composer bridges. */
export class InsertService {
  private queue: PendingInsertion[]
  /** Observers of queue changes (the composer-strip surface reads this). */
  private readonly listeners = new Set<() => void>()
  private readonly bridges = new Map<string, ComposerBridge>()
  /** One pending retry timer per destination session. */
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** First retry instant per destination session, for the bounded deadline. */
  private readonly retryStarted = new Map<string, number>()

  constructor(private readonly now: () => number = Date.now) {
    const { queue, pruned } = readQueue(this.now())
    this.queue = queue
    if (pruned) writeQueue(this.queue)
  }

  /**
   * Subscribe to queue changes.
   * @param listener - called after the pending set changes.
   * @returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Notify observers after a queue mutation. */
  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  /**
   * Queue an insertion for one destination session and attempt a drain.
   *
   * The destination is the caller's explicit choice: the on-screen session for
   * `current`, or the freshly created session for `new`. Re-queueing the same
   * record for the same destination is a no-op (no duplicate inserts).
   * @param destinationSessionId - session whose composer should receive the quote.
   * @param record - source record.
   * @param summary - composer chip/plain summary.
   * @param attribution - optional attribution line.
   */
  enqueue(destinationSessionId: string, record: HighlightRecord, summary: string, attribution?: string): void {
    const id = `${record.id}:${destinationSessionId}`
    if (!this.queue.some(entry => entry.id === id)) {
      const insertion: PendingInsertion = {
        id,
        sessionId: destinationSessionId,
        quote: record.anchor.quote,
        summary,
        attribution,
        createdAt: this.now(),
      }
      this.queue = [...this.queue, insertion]
      writeQueue(this.queue)
      this.notify()
    }
    this.drain(destinationSessionId)
  }

  /** Register the composer bridge of one session; returns the disposer. */
  registerBridge(sessionId: string, bridge: ComposerBridge): () => void {
    this.bridges.set(sessionId, bridge)
    this.drain(sessionId)
    return () => {
      if (this.bridges.get(sessionId) !== bridge) return
      this.bridges.delete(sessionId)
      this.clearRetry(sessionId)
    }
  }

  /**
   * Insert into the mounted bridge of a session.
   * @param sessionId - destination session.
   * @param text - quote text.
   * @param summary - composer summary.
   * @param attribution - optional attribution line.
   * @param recordId - source record id; when given, a queued entry for the same
   * destination is consumed on success so the retry timer cannot insert it again.
   * @returns whether the composer accepted the quote.
   */
  insert(sessionId: string, text: string, summary: string, attribution?: string, recordId?: string): boolean {
    const bridge = this.bridges.get(sessionId)
    if (bridge === undefined) return false
    const inserted = bridge.insertQuote(text, summary)
    if (!inserted) return false
    if (attribution !== undefined) bridge.insertText(`\n${attribution}`)
    if (recordId !== undefined) this.consume(sessionId, recordId)
    return true
  }

  /** Drop one record's queued entry after a successful direct insert. */
  private consume(sessionId: string, recordId: string): void {
    const id = `${recordId}:${sessionId}`
    if (!this.queue.some(entry => entry.id === id)) return
    this.queue = this.queue.filter(entry => entry.id !== id)
    this.notify()
    writeQueue(this.queue)
    if (!this.queue.some(entry => entry.sessionId === sessionId)) this.clearRetry(sessionId)
  }

  /** Whether a composer for this session is currently mounted. */
  hasBridge(sessionId: string): boolean {
    return this.bridges.has(sessionId)
  }

  /** Pending entries for one destination session (queue introspection for tests/diagnostics). */
  pendingFor(sessionId: string): readonly PendingInsertion[] {
    return this.queue.filter(entry => entry.sessionId === sessionId)
  }

  /** Apply every queued insertion this session's composer can accept. */
  drain(sessionId: string): void {
    const cutoff = this.now() - PENDING_INSERTION_TTL_MS
    const live = this.queue.filter(entry => entry.createdAt >= cutoff)
    let changed = live.length !== this.queue.length
    const bridge = this.bridges.get(sessionId)
    if (bridge === undefined) {
      if (changed) {
        this.queue = live
        writeQueue(this.queue)
        this.notify()
      }
      this.clearRetry(sessionId)
      return
    }
    const remaining: PendingInsertion[] = []
    for (const insertion of live) {
      if (insertion.sessionId !== sessionId) {
        remaining.push(insertion)
        continue
      }
      const inserted = bridge.insertQuote(insertion.quote, insertion.summary)
      if (inserted) {
        if (insertion.attribution !== undefined) bridge.insertText(`\n${insertion.attribution}`)
        changed = true
      } else {
        remaining.push(insertion)
      }
    }
    if (changed || remaining.length !== this.queue.length) {
      this.queue = remaining
      writeQueue(this.queue)
      this.notify()
    }
    if (remaining.some(entry => entry.sessionId === sessionId)) this.scheduleRetry(sessionId)
    else this.clearRetry(sessionId)
  }

  /** Schedule the single bounded retry timer for one destination session. */
  private scheduleRetry(sessionId: string): void {
    if (this.retryTimers.has(sessionId)) return
    const started = this.retryStarted.get(sessionId) ?? this.now()
    this.retryStarted.set(sessionId, started)
    if (this.now() - started >= RETRY_DEADLINE_MS) {
      this.clearRetry(sessionId)
      return
    }
    const timer = setTimeout(() => {
      this.retryTimers.delete(sessionId)
      this.drain(sessionId)
    }, RETRY_INTERVAL_MS)
    this.retryTimers.set(sessionId, timer)
  }

  /** Release every retry timer and bridge; called when the plugin unloads. */
  dispose(): void {
    for (const timer of this.retryTimers.values()) clearTimeout(timer)
    this.retryTimers.clear()
    this.retryStarted.clear()
    this.bridges.clear()
  }

  /** Stop retrying one session (drained, bridge unregistered, or deadline spent). */
  private clearRetry(sessionId: string): void {
    const timer = this.retryTimers.get(sessionId)
    if (timer !== undefined) clearTimeout(timer)
    this.retryTimers.delete(sessionId)
    this.retryStarted.delete(sessionId)
  }
}
