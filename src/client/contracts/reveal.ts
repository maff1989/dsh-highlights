/**
 * Reveal contract: one cancellable, single-flight reveal for the plugin.
 *
 * Today the port is record-addressed and wraps the plugin's composed poll/scroll
 * routine. When DSH ships a public reveal capability (UA-2), only the adapter
 * changes; callers keep this contract.
 */
import type { ReadonlySignal } from './scope'
import type { HighlightRecord } from '../../shared/schema'

/** Typed result of one reveal attempt. */
export type RevealResult =
  | { readonly status: 'revealed'; readonly element: HTMLElement | null }
  | { readonly status: 'folded'; readonly ownerKey: string }
  | { readonly status: 'unavailable'; readonly reason: 'archived' | 'missing' | 'not-loaded' }
  | { readonly status: 'cancelled' }

/** Why an in-flight reveal was cancelled. */
export type RevealCancelReason = 'unmount' | 'superseded' | 'session-switch'

/** The port every surface calls through the command layer. */
export interface RevealPort {
  /**
   * Reveal one record, superseding any in-flight reveal.
   * @param record - the record whose anchor should be shown.
   * @param options - optional external cancellation.
   */
  reveal(record: HighlightRecord, options?: { readonly signal?: AbortSignal }): Promise<RevealResult>
  /** Cancel the in-flight reveal, if any. */
  cancelAll(reason: RevealCancelReason): void
  /** Whether a reveal is in flight. */
  readonly pending: ReadonlySignal<boolean>
  /** Release quiescence/listeners. */
  dispose(): void
}
