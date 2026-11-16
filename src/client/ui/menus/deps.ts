/**
 * Dependency face the composition root wires into the context menus.
 *
 * The menus are data actions: no React, no rendering, no fetch. They read the
 * already-loaded record store, delegate the two side effects that already have
 * an owner (`briefSession`, the clipboard write) to the action face, and only
 * open the panel themselves.
 */
import type { HighlightsSnapshot } from '../../data/client'
import type { HighlightRecord } from '../../../shared/schema'

/** Injection face of `registerHighlightContextMenus`. */
export interface HighlightContextMenuDeps {
  /** Read the current client snapshot synchronously. */
  readonly snapshot: () => HighlightsSnapshot
  /** Open the right-panel Highlights tab for one Session. */
  readonly openPanel: (sessionId: string) => void
  /**
   * The existing `briefSession` action: builds the resolvable packet and
   * inserts it into that Session's composer. Resolves to an `InsertOutcome`.
   */
  readonly brief: (sessionId: string, records: readonly HighlightRecord[]) => Promise<unknown>
  /** The plugin's clipboard write (Clipboard API with the textarea fallback). */
  readonly copy: (text: string) => Promise<boolean>
  /** Bind a locale key; menus carry no counts today. */
  readonly t: (key: string) => string
}
