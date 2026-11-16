/**
 * Observation contract: who owns DOM watching, visibility and paint scheduling.
 *
 * Replaces the per-session observer/rAF soup previously owned by
 * `ui/SessionBridge.tsx` and `ui/SelectionAffordance.tsx`. One app-scoped
 * service owns the observers; sessions register their roots; every callback is
 * gated on `active && visible`.
 */
import type { Disposer, ReadonlySignal, SessionHandle, SessionScope } from './scope'

/** Which product surface currently owns the screen. */
export type SurfaceId = 'conversation' | 'page' | 'panel' | 'card' | 'hidden'

/** Why a paint pass was requested (for diagnostics and coalescing priority). */
export type PaintReason = 'mount' | 'mutate' | 'resize' | 'store' | 'reveal' | 'show'

/** Roots a session registers once mounted. */
export interface SessionRoots {
  /** `[data-conversation-session]` root getter. */
  readonly conversationRoot: () => HTMLElement | null
  /** `[data-chat-flow]` transcript content root getter. */
  readonly transcriptRoot: () => HTMLElement | null
}

/** App-scoped observation service. */
export interface ObservationService {
  /**
   * Register one mounted session.
   * @param input - session id plus nullable root getters.
   * @returns the handle; dispose it when the bridge unmounts.
   */
  registerSession(input: { readonly sessionId: string } & SessionRoots): SessionHandle
  /** Current surface. */
  readonly activeSurface: ReadonlySignal<SurfaceId>
  /** Whether the document/tab is visible. */
  readonly documentVisible: ReadonlySignal<boolean>
  /**
   * Whether a session may do DOM/paint work now.
   * @param sessionId - session to test.
   */
  isVisible(sessionId: string): boolean
  /**
   * Ask for one paint pass, coalesced to a frame.
   * @param sessionId - session to paint.
   * @param reason - what changed.
   */
  requestPaint(sessionId: string, reason: PaintReason): void
  /**
   * Observe paint frames.
   * @param listener - invoked with the session id and paint epoch.
   * @returns disposer.
   */
  onPaintFrame(listener: (sessionId: string, epoch: number) => void): Disposer
  /** Whether a reveal is in flight (the plugin is quiescent). */
  readonly revealPending: ReadonlySignal<boolean>
  /** Dispose the service and every registered session. */
  dispose(): void
}

/** Convenience: one session scope narrowed to an observation handle. */
export type ObservedSession = SessionScope & SessionHandle
