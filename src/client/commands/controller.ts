/**
 * CommandController: single-flight, typed outcomes, notices and counters.
 *
 * The controller is deliberately transport-agnostic: a command's `run` is the
 * one implementation of the action (wrapping the existing action face while
 * surfaces migrate). The controller adds the properties the review found
 * missing: duplicate clicks are rejected instead of double-firing, every
 * failure is one typed outcome and one notice, and in-flight keys are visible
 * to surfaces for busy state.
 */
import type { Command, CommandContext, CommandController, CommandOutcome } from '../contracts/commands'
import type { NoticeService } from '../contracts/notice'
import { count } from '../runtime/diagnostics'
import { createSignal } from '../runtime/signal'

/** Options for the controller. */
export interface CommandControllerOptions {
  /** One notice channel; failures are reported here, not per surface. */
  readonly notice?: NoticeService
  /** Translate an error into a stable code/message pair. */
  readonly describeError?: (error: unknown) => { readonly code: string; readonly message: string; readonly retryable: boolean }
}

/** Default error description. */
function defaultDescribe(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof Error) {
    return { code: 'command-failed', message: error.message, retryable: true }
  }
  return { code: 'command-failed', message: String(error), retryable: true }
}

/**
 * Create the command controller.
 * @param options - notice channel and error mapping.
 */
export function createCommandController(options: CommandControllerOptions = {}): CommandController {
  const inFlight = new Set<string>()
  const busy = createSignal<ReadonlySet<string>>(new Set())
  const listeners = new Set<(event: { command: string; recordId?: string; status: CommandOutcome<unknown>['status'] }) => void>()
  const describe = options.describeError ?? defaultDescribe

  /** Publish one outcome to listeners. */
  function emit(command: string, recordId: string | undefined, status: CommandOutcome<unknown>['status']): void {
    count('commandOutcomes')
    for (const listener of [...listeners]) listener({ command, recordId, status })
  }

  return {
    async execute(command, args, exec = {}) {
      const key = `${command.id}:${exec.recordId ?? ''}`
      if (inFlight.has(key)) {
        emit(command.id, exec.recordId, 'duplicate')
        return { status: 'duplicate' }
      }
      inFlight.add(key)
      busy.set(new Set(inFlight))
      const context: CommandContext = {
        ...(exec.recordId === undefined ? {} : { recordId: exec.recordId }),
        ...(exec.signal === undefined ? {} : { signal: exec.signal }),
      }
      try {
        if (context.signal?.aborted === true) {
          emit(command.id, exec.recordId, 'cancelled')
          return { status: 'cancelled' }
        }
        const value = await command.run(args, context)
        emit(command.id, exec.recordId, 'ok')
        return { status: 'ok', value }
      } catch (error) {
        const described = describe(error)
        emit(command.id, exec.recordId, 'error')
        options.notice?.notify(`${command.label}: ${described.message}`, { warn: true })
        return { status: 'error', ...described }
      } finally {
        inFlight.delete(key)
        busy.set(new Set(inFlight))
      }
    },
    inFlight: () => new Set(inFlight),
    busy,
    onOutcome(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
