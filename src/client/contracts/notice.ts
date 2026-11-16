/**
 * Notice contract: one outcome/notice channel.
 *
 * Replaces the five per-surface channels (page notice, panel notices, row
 * status, editor saveError, card status). A surface renders the current notice;
 * it does not own its own timer or copy of the failure state.
 */
import type { ReadonlySignal } from './scope'

/** One visible notice. */
export interface Notice {
  readonly id: number
  readonly text: string
  /** True when the outcome is a warning/failure rather than informational. */
  readonly warn: boolean
}

/** One outcome/notice service. */
export interface NoticeService {
  /** Current notice, if any. */
  readonly state: ReadonlySignal<Notice | undefined>
  /**
   * Show one notice, replacing the current one.
   * @param text - localised copy.
   * @param options - warning flag and optional TTL override.
   * @returns the notice id.
   */
  notify(text: string, options?: { readonly warn?: boolean; readonly ttlMs?: number }): number
  /** Dismiss one notice by id (or the current notice when id is omitted). */
  dismiss(id?: number): void
  /** Release timers. */
  dispose(): void
}
