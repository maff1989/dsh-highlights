/**
 * Composed reveal adapter: wraps the plugin's existing reveal routine behind
 * the RevealPort so lifecycle/cancellation is owned in one place.
 *
 * Until DSH exposes a public reveal capability (UA-2), cancellation is a race:
 * the port resolves `cancelled` immediately, while the bounded routine finishes
 * its current wait and exits. The routine is already bounded (2.5 s per phase),
 * so no detached work can run for long.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { HighlightRecord } from '../../shared/schema'
import type { HighlightsPainter } from '../paint/adapters/css-highlights'
import { revealRecord } from '../reveal'
import type { RevealRoutine } from './port'

/**
 * Build the routine over the current reveal implementation.
 * @param deps - Host context and painter.
 */
export function createComposedReveal(deps: { readonly ctx: Context; readonly painter: HighlightsPainter }): RevealRoutine {
  return async (record: HighlightRecord, control) => {
    if (control.signal.aborted) return { status: 'cancelled' }
    const abort = new Promise<'aborted'>(resolve => {
      const listener = (): void => { resolve('aborted') }
      if (control.signal.aborted) {
        resolve('aborted')
        return
      }
      control.signal.addEventListener('abort', listener, { once: true })
    })
    const outcome = await Promise.race([
      revealRecord(record, { ctx: deps.ctx, painter: deps.painter }),
      abort,
    ])
    if (outcome === 'aborted') return { status: 'cancelled' }
    if (outcome === 'revealed') return { status: 'revealed', element: null }
    return { status: 'unavailable', reason: 'not-loaded' }
  }
}
