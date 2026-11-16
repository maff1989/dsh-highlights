/**
 * Layer-neutral primitives shared by every client contract.
 *
 * Type-only: this module imports nothing and has no runtime footprint, so any
 * layer (including the bundle's `contracts/` boundary) may depend on it without
 * creating an upward edge.
 */

/** Removes one listener/registration. */
export type Disposer = () => void

/** Read-side observable used for app/session signals. */
export interface Signal<T> {
  /** Current value; always the latest published value. */
  get(): T
  /**
   * Observe changes.
   * @param listener - invoked with the new value after each publish.
   * @returns disposer removing the listener.
   */
  subscribe(listener: (value: T) => void): Disposer
}

/** A signal a consumer may only read. */
export type ReadonlySignal<T> = Signal<T>

/** Something with an explicit lifetime parent. */
export interface Disposable {
  /** Release every resource owned by this object. Idempotent. */
  dispose(): void
}

/**
 * One mounted session's scope.
 *
 * The DOM getters are nullable on purpose: the bridge can register before Chat
 * commits either root, and roots are replaced across a keep-alive show/hide.
 */
export interface SessionScope {
  /** Durable Session id this scope belongs to. */
  readonly sessionId: string
  /** The `[data-conversation-session]` root, when committed. */
  readonly conversationRoot: () => HTMLElement | null
  /** The `[data-chat-flow]` transcript content root, when committed. */
  readonly transcriptRoot: () => HTMLElement | null
  /** Whether this session is visible (conversation shown, tab visible). */
  readonly visible: ReadonlySignal<boolean>
  /** Whether this session is the active conversation. */
  readonly active: ReadonlySignal<boolean>
  /** Monotonic paint epoch; increments only when paint inputs changed. */
  readonly paintEpoch: ReadonlySignal<number>
}

/** A created session registration. */
export interface SessionHandle extends SessionScope, Disposable {}
