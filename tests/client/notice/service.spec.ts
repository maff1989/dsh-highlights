/**
 * Notice channel: one current notice, one TTL, one dismissal path.
 */
import { describe, expect, it, vi } from 'vitest'

import { createNoticeService } from '../../../src/client/notice/service'

/** Manual timers so TTLs can be stepped. */
function timedNotice() {
  const scheduled = new Map<number, () => void>()
  let sequence = 0
  const service = createNoticeService({
    setTimeout: callback => { sequence += 1; scheduled.set(sequence, callback); return sequence },
    clearTimeout: handle => { scheduled.delete(handle) },
    ttlMs: 4_000,
  })
  return { service, scheduled }
}

describe('notice service', () => {
  it('replaces the current notice and dismisses on its own timer', () => {
    const { service, scheduled } = timedNotice()
    const first = service.notify('saved')
    expect(service.state.get()).toEqual({ id: first, text: 'saved', warn: false })
    const second = service.notify('conflict', { warn: true })
    expect(service.state.get()).toMatchObject({ id: second, warn: true })
    expect(scheduled.size).toBe(1)
    for (const callback of [...scheduled.values()]) callback()
    expect(service.state.get()).toBeUndefined()
  })

  it('honours an explicit TTL and ignores stale dismissal by id', () => {
    const { service, scheduled } = timedNotice()
    const id = service.notify('queued', { ttlMs: 10 })
    service.notify('newer')
    service.dismiss(id) // stale id: current notice must stay
    expect(service.state.get()?.text).toBe('newer')
    expect(scheduled.size).toBe(1)
    service.dismiss()
    expect(service.state.get()).toBeUndefined()
  })

  it('disposes timers and state', () => {
    const { service, scheduled } = timedNotice()
    service.notify('x')
    service.dispose()
    expect(service.state.get()).toBeUndefined()
    expect(scheduled.size).toBe(0)
  })
})
