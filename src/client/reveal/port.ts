/**
 * RevealPort implementation: single-flight, cancellation and quiescence.
 *
 * The adapter-owned routine is the plugin's composed reveal (session select,
 * bounded waits, history paging, scroll). This port owns the lifecycle around
 * it — the part the review found missing: one reveal at a time, a superseded
 * reveal resolves `cancelled` instead of racing, and unmount cancels instead of
 * leaving a detached routine scrolling a hidden transcript.
 */
import type { RevealCancelReason, RevealPort, RevealResult } from '../contracts/reveal'
import type { HighlightRecord } from '../../shared/schema'
import { createSignal, type WritableSignal } from '../runtime/signal'

/** The plugin-composed reveal routine the adapter supplies. */
export type RevealRoutine = (record: HighlightRecord, control: { readonly signal: AbortSignal }) => Promise<RevealResult>

/** Options for the port. */
export interface RevealPortOptions {
  /** Routine invoked for each accepted request. */
  readonly run: RevealRoutine
  /** Called when quiescence starts/ends (selection detection stands down). */
  readonly onPendingChange?: (pending: boolean) => void
}

/** One in-flight reveal. */
interface InFlight {
  readonly controller: AbortController
  readonly promise: Promise<RevealResult>
}

/**
 * Create the reveal port.
 * @param options - routine plus pending observer.
 */
export function createRevealPort(options: RevealPortOptions): RevealPort {
  const pending: WritableSignal<boolean> = createSignal(false)
  let inflight: InFlight | undefined
  let disposed = false

  /** Publish quiescence and notify. */
  function setPending(value: boolean): void {
    pending.set(value)
    options.onPendingChange?.(value)
  }

  return {
    reveal(record, revealOptions) {
      if (disposed) return Promise.resolve({ status: 'cancelled' })
      // Supersede: the newer request owns the landing.
      if (inflight !== undefined) {
        inflight.controller.abort()
      }
      const controller = new AbortController()
      const forward = (): void => { controller.abort() }
      revealOptions?.signal?.addEventListener('abort', forward, { once: true })
      const promise = (async (): Promise<RevealResult> => {
        try {
          return await options.run(record, { signal: controller.signal })
        } catch {
          return controller.signal.aborted ? { status: 'cancelled' } : { status: 'unavailable', reason: 'missing' }
        } finally {
          revealOptions?.signal?.removeEventListener('abort', forward)
          if (inflight?.controller === controller) {
            inflight = undefined
            setPending(false)
          }
        }
      })()
      inflight = { controller, promise }
      setPending(true)
      return promise
    },
    cancelAll(_reason: RevealCancelReason) {
      if (inflight === undefined) return
      inflight.controller.abort()
      inflight = undefined
      setPending(false)
    },
    pending,
    dispose() {
      disposed = true
      inflight?.controller.abort()
      inflight = undefined
      setPending(false)
    },
  }
}
