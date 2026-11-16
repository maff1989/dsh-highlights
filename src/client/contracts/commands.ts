/**
 * Command contract: one typed entry point for every mutation.
 *
 * A command is identified, capability-gated, single-flight per (command, record)
 * and returns a typed outcome. The controller owns the side effects around it:
 * in-flight state, duplicate suppression, notice reporting and counters.
 */
import type { Disposer, ReadonlySignal } from './scope'

/** Capabilities a surface may hold. */
export type Capability = 'update' | 'remove' | 'restore' | 'create' | 'copy' | 'reveal' | 'insert' | 'open-panel' | 'star'

/** Typed result of one command attempt. */
export type CommandOutcome<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'error'; readonly code: string; readonly message: string; readonly retryable: boolean }
  | { readonly status: 'duplicate' }
  | { readonly status: 'cancelled' }

/** Execution context passed to a command. */
export interface CommandContext {
  /** Record the command operates on, when it has one. */
  readonly recordId?: string
  /** External cancellation. */
  readonly signal?: AbortSignal
}

/** One command declaration. */
export interface Command<A, T> {
  /** Stable id; the single-flight key is `${id}:${recordId ?? ''}`. */
  readonly id: string
  /** Capability this command requires. */
  readonly capability: Capability
  /** Human-readable label used for notices. */
  readonly label: string
  /** Run the command. */
  run(args: A, context: CommandContext): Promise<T>
}

/** Controller face. */
export interface CommandController {
  /** Execute one command with single-flight + notice handling. */
  execute<A, T>(command: Command<A, T>, args: A, options?: { readonly recordId?: string; readonly signal?: AbortSignal }): Promise<CommandOutcome<T>>
  /** Keys with a command in flight. */
  inFlight(): ReadonlySet<string>
  /** Reactive in-flight keys, for surface busy/aria-busy state. */
  readonly busy: ReadonlySignal<ReadonlySet<string>>
  /** Observe outcomes (notices/diagnostics/UI busy state). */
  onOutcome(listener: (event: { readonly command: string; readonly recordId?: string; readonly status: CommandOutcome<unknown>['status'] }) => void): Disposer
}
