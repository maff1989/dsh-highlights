/**
 * One coalescing frame scheduler for paint work.
 *
 * Keys make the coalescing explicit: a repaint requested for a session replaces
 * an earlier pending request for that session, while different sessions keep
 * their own frames (a hidden session can be cancelled without touching a
 * visible one).
 *
 * The default implementation uses `requestAnimationFrame`; tests inject a
 * manual scheduler so a spec can step frames deterministically.
 */

/** A scheduled frame callback. */
export type FrameCallback = (time: number) => void

/** Injection points for tests / non-browser hosts. */
export interface FrameSchedulerOptions {
  /** Frame scheduler; defaults to `requestAnimationFrame` or a timeout fallback. */
  readonly schedule?: (callback: FrameCallback) => number
  /** Frame cancel; defaults to `cancelAnimationFrame` or `clearTimeout`. */
  readonly cancel?: (handle: number) => void
}

/** Coalescing scheduler face. */
export interface FrameScheduler {
  /** Request one run for a key, coalescing with any pending request. */
  request(key: string, callback: FrameCallback): void
  /** Cancel one key. */
  cancel(key: string): void
  /** Whether a key has a pending frame. */
  has(key: string): boolean
  /** Run every pending frame now (tests only; no-op for an empty queue). */
  flush(time?: number): void
  /** Cancel every pending frame and stop accepting new ones. */
  dispose(): void
}

/** Resolve the default frame API, tolerating non-browser evaluation. */
function defaultFrameApi(): { schedule: (callback: FrameCallback) => number; cancel: (handle: number) => void } {
  const global = globalThis as {
    requestAnimationFrame?: (callback: FrameCallback) => number
    cancelAnimationFrame?: (handle: number) => void
  }
  if (typeof global.requestAnimationFrame === 'function') {
    return {
      schedule: callback => global.requestAnimationFrame?.(callback) ?? 0,
      cancel: handle => global.cancelAnimationFrame?.(handle),
    }
  }
  return {
    schedule: callback => setTimeout(() => { callback(Date.now()) }, 16) as unknown as number,
    cancel: handle => { clearTimeout(handle as unknown as ReturnType<typeof setTimeout>) },
  }
}

/**
 * Create a coalescing frame scheduler.
 * @param options - injected frame API for tests.
 */
export function createFrameScheduler(options: FrameSchedulerOptions = {}): FrameScheduler {
  const fallback = defaultFrameApi()
  const schedule = options.schedule ?? fallback.schedule
  const cancel = options.cancel ?? fallback.cancel
  interface Pending {
    readonly handle: number
    readonly callback: FrameCallback
  }
  const pending = new Map<string, Pending>()
  let disposed = false

  /** Run one key's callback and clear it. */
  function run(key: string, time: number): void {
    const entry = pending.get(key)
    if (entry === undefined) return
    pending.delete(key)
    entry.callback(time)
  }

  return {
    request(key, callback) {
      if (disposed) return
      const existing = pending.get(key)
      if (existing !== undefined) cancel(existing.handle)
      const handle = schedule(time => { run(key, time) })
      pending.set(key, { handle, callback })
    },
    cancel(key) {
      const entry = pending.get(key)
      if (entry === undefined) return
      cancel(entry.handle)
      pending.delete(key)
    },
    has: key => pending.has(key),
    flush(time = 0) {
      for (const key of [...pending.keys()]) run(key, time)
    },
    dispose() {
      disposed = true
      for (const [key, entry] of [...pending]) {
        cancel(entry.handle)
        pending.delete(key)
      }
    },
  }
}
