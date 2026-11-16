/**
 * App-level outcome banner (T1.4), registered on the frame-wide `shell.overlay`
 * seat.
 *
 * The notice channel itself is app-scoped (`createNoticeService` in the
 * composition root); this component is only its renderer. Rendering it on the
 * frame overlay instead of inside the per-Session bridge is what makes an
 * outcome survive a Session switch or the bridge unmounting, and the banner is
 * the shell's shared `Toast`, not bespoke chrome.
 */
import type { ReactNode } from 'react'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context } from '@deepseek-ai/cordis'

import type { Notice, NoticeService } from '../contracts/notice'
import { NOTICE_TOAST_HOLD_MS } from '../notice/service'
import { useSignalValue } from '../runtime/use-signal'
import type { ReadonlySignal } from '../contracts/scope'

/** What the composition root injects into the overlay. */
export interface NoticeOverlayInjected {
  /** The app-scoped notice signal; one current notice at a time. */
  readonly notice: ReadonlySignal<Notice | undefined>
  /** Dismiss one notice by id (idempotent once it is no longer current). */
  readonly dismiss: (id?: number) => void
}

/** Props the renderer assembles for this registration. */
export type NoticeOverlayProps = PropsRuntime<'shell.overlay'> & InjectFace<NoticeOverlayInjected>

/**
 * Render the current notice as a toast, or nothing.
 * @param props - the notice signal and its dismissal path.
 * @returns the floating banner, or null when no notice is current.
 */
export function NoticeOverlay({ notice, dismiss }: NoticeOverlayProps): ReactNode {
  const current = useSignalValue(notice)
  if (current === undefined) return null
  return (
    // Keyed by the notice sequence: re-showing the same text restarts the
    // Toast cycle instead of inheriting the previous banner's fade.
    <Toast
      key={current.id}
      text={current.text}
      {...(current.warn
        ? { icon: <IconWarningOutlineRegular /> }
        : { tone: 'success' as const })}
      holdMs={NOTICE_TOAST_HOLD_MS}
      onDone={() => { dismiss(current.id) }}
    />
  )
}

/** Registration id of the overlay entry inside `shell.overlay`. */
export const NOTICE_OVERLAY_ID = 'highlights.notice'

/**
 * Register the notice overlay on the frame's floating layer.
 *
 * Lives beside the component so the composition root names no slot mechanics:
 * the registration id and order stay with the surface they place, and this
 * file's types prove the component fits the seat.
 * @param ctx - client root context owning the registration.
 * @param service - the app-scoped notice channel.
 */
export function registerNoticeOverlay(ctx: Context, service: NoticeService): void {
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: NOTICE_OVERLAY_ID,
    order: 10,
    inject: () => ({
      notice: service.state,
      dismiss: (id?: number) => { service.dismiss(id) },
    }),
  }, NoticeOverlay)), 'highlights: notice overlay')
}
