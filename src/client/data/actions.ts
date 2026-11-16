/**
 * The action face every Highlights surface calls, and the one place UI code
 * learns what it may do. Kept separate from the store so panels can be built
 * (and tested) against this interface without importing the transport.
 */
import type { HighlightRecord, UpdatePatch } from '../../shared/schema'

/** Where an inserted quote should land. */
export type InsertTarget =
  | { readonly kind: 'current' }
  | { readonly kind: 'new' }

/** Result of one write through the Host's compare-and-set contract. */
export type WriteOutcome =
  | { readonly status: 'written'; readonly record: HighlightRecord }
  /** The Host refused the stale version; `record` is the live value. */
  | { readonly status: 'conflict'; readonly record: HighlightRecord }
  | { readonly status: 'error'; readonly error: string }

/** What happened to one insertion request. */
export type InsertOutcome = 'inserted' | 'queued' | 'failed'

/** Whether a reveal found and flashed the anchored text. */
export type RevealOutcome = 'revealed' | 'not-found'

/** Actions the global page and the session panel share. */
export interface HighlightsActions {
  /** Re-read the record set; `force` skips the freshness window. */
  refresh(force?: boolean): void
  /**
   * Patch one record.
   * @param id - record id.
   * @param patch - presentation fields to change.
   * @param expectedVersion - explicit compare-and-set version (overwrite path);
   * omitted uses the store's current version.
   */
  update(id: string, patch: UpdatePatch, expectedVersion?: number): Promise<WriteOutcome>
  /** Soft-delete one record. A conflict never hides the record. */
  remove(id: string): Promise<WriteOutcome>
  /** Undo a soft delete. */
  restore(id: string): Promise<WriteOutcome>
  /** Copy the quote plus its citation to the clipboard. Resolves true only on a real copy. */
  copyQuote(record: HighlightRecord): Promise<boolean>
  /** Open the owning session and reveal the anchored text. */
  reveal(record: HighlightRecord): Promise<RevealOutcome>
  /**
   * Insert the quote into a composer.
   * @param record - source record.
   * @param target - current composer or a new Session.
   * @param currentSessionId - the Session whose composer is on screen (required
   * for `current`, so a card opened from another Session's record still inserts
   * into the open conversation).
   */
  insert(record: HighlightRecord, target: InsertTarget, currentSessionId?: string): Promise<InsertOutcome>
  /**
   * Brief the agent on one session: build one packet (quote + record id + state)
   * from the given records and insert it into that session's composer, opening
   * the session when it is not the one on screen. The record ids are what makes
   * the handoff resolvable — the agent can call `get_highlight` on each.
   * Private records are never included.
   * @param sessionId - session whose composer should receive the packet.
   * @param records - candidate records (already filtered by the surface's own filters).
   * @returns what happened to the insertion request.
   */
  briefSession(sessionId: string, records: readonly HighlightRecord[]): Promise<InsertOutcome>
  /** Open (and focus) the session panel tab for one record. */
  openPanelTab(record: HighlightRecord): void
  /** Read the paint capability of this browser. */
  paintSupported(): boolean
}

/** What an editor needs to save an edit of presentation fields. */
export interface HighlightDraft {
  readonly colorId: number
  readonly tags: readonly string[]
  readonly note: string | undefined
  readonly starred: boolean
  /** Provenance; absent means the user authored it. */
  readonly author?: 'user' | 'agent'
  /** Processing cursor; absent means `new`. */
  readonly state?: 'new' | 'kept' | 'compiled'
  /** Speech act; absent means `note`. */
  readonly intent?: 'note' | 'dispute' | 'direct' | 'remember'
  /** Model visibility; absent means visible to the agent-read surface. */
  readonly visibility?: 'agent' | 'private'
}

/** Re-exported so UI modules depend on one path. */
export type { HighlightRecord, UpdatePatch }
