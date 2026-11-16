/**
 * The single notice channel: one current notice, one TTL timer, one signal.
 */
import type { Notice, NoticeService } from '../contracts/notice'
import { createSignal, type WritableSignal } from '../runtime/signal'

/** Default visible duration. */
export const NOTICE_TTL_MS = 4_000

/**
 * Full-opacity hold handed to the shell's shared `Toast` (T1.4): the banner
 * fades for one second, so the hold is the TTL minus that fade — the banner
 * unmounts as it reaches the end of its fade instead of vanishing mid-fade.
 */
export const NOTICE_TOAST_HOLD_MS = NOTICE_TTL_MS - 1_000

/** Injection points for tests. */
export interface NoticeServiceOptions {
  /** Timer API (defaults to global setTimeout/clearTimeout). */
  readonly setTimeout?: (callback: () => void, ms: number) => number
  readonly clearTimeout?: (handle: number) => void
  /** Default TTL. */
  readonly ttlMs?: number
}

/**
 * Create the notice service.
 * @param options - timer injection.
 */
export function createNoticeService(options: NoticeServiceOptions = {}): NoticeService {
  const state: WritableSignal<Notice | undefined> = createSignal(undefined)
  const schedule = options.setTimeout ?? ((callback: () => void, ms: number) => setTimeout(callback, ms) as unknown as number)
  const cancel = options.clearTimeout ?? ((handle: number) => { clearTimeout(handle as unknown as ReturnType<typeof setTimeout>) })
  const defaultTtl = options.ttlMs ?? NOTICE_TTL_MS
  let timer: number | undefined
  let sequence = 0

  /** Clear the pending dismissal timer. */
  function clearTimer(): void {
    if (timer === undefined) return
    cancel(timer)
    timer = undefined
  }

  return {
    state,
    notify(text, notifyOptions = {}) {
      sequence += 1
      const notice: Notice = { id: sequence, text, warn: notifyOptions.warn === true }
      state.set(notice)
      clearTimer()
      timer = schedule(() => {
        timer = undefined
        if (state.get()?.id === notice.id) state.set(undefined)
      }, notifyOptions.ttlMs ?? defaultTtl)
      return notice.id
    },
    dismiss(id) {
      if (id !== undefined && state.get()?.id !== id) return
      clearTimer()
      state.set(undefined)
    },
    dispose() {
      clearTimer()
      state.set(undefined)
    },
  }
}
