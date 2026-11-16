/**
 * Minimal synchronous signals used by the runtime/observation contracts.
 *
 * Deliberately not a framework: no batching, no async, no derived graph — the
 * plugin's needs are "read the latest value" and "notify on change". React
 * subscribes through `useSignalValue`.
 */
import type { Disposer, Signal } from '../contracts/scope'

/** A signal a runtime owner may write. */
export interface WritableSignal<T> extends Signal<T> {
  /** Publish a value; equal (`Object.is`) values do not notify. */
  set(value: T): void
  /** Update from the current value and publish. */
  update(update: (value: T) => T): void
}

/**
 * Create a writable signal.
 * @param initial - starting value.
 */
export function createSignal<T>(initial: T): WritableSignal<T> {
  let value = initial
  const listeners = new Set<(value: T) => void>()
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return
      value = next
      for (const listener of [...listeners]) listener(value)
    },
    update(update) {
      this.set(update(value))
    },
    subscribe(listener: (next: T) => void): Disposer {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** A signal that never changes (`false`); useful as a stable React fallback. */
export function constantSignal<T>(value: T): Signal<T> {
  return {
    get: () => value,
    subscribe: () => () => undefined,
  }
}
