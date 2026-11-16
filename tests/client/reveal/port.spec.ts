/**
 * RevealPort lifecycle: single-flight, supersede, cancellation, quiescence.
 */
import { describe, expect, it, vi } from 'vitest'

import type { RevealResult } from '../../../src/client/contracts/reveal'
import { createRevealPort } from '../../../src/client/reveal/port'
import type { HighlightRecord } from '../../../src/shared/schema'

/** One record. */
const record: HighlightRecord = {
  schemaVersion: 1,
  id: '0190a000-0000-7000-8000-000000000001',
  sessionId: 'session-1',
  origin: 'test',
  anchor: { nodeKey: '9:assistant1:1', kind: 'text', sourceIndex: 0, quote: 'q', prefix: '', suffix: '', start: 0, end: 1, projection: 1 },
  colorId: 1,
  tags: [],
  starred: false,
  createdAt: 1,
  updatedAt: 1,
  version: 1,
}

/** A routine whose result the test resolves manually. */
function deferredRoutine() {
  const controls: AbortSignal[] = []
  const resolvers: ((result: RevealResult) => void)[] = []
  const run = vi.fn((_record: HighlightRecord, control: { signal: AbortSignal }) => {
    controls.push(control.signal)
    return new Promise<RevealResult>(resolve => { resolvers.push(resolve) })
  })
  return { run, controls, resolvers }
}

describe('reveal port', () => {
  it('supersedes an in-flight reveal and reports the older one as cancelled', async () => {
    const routine = deferredRoutine()
    const pendingChanges: boolean[] = []
    const port = createRevealPort({ run: routine.run, onPendingChange: value => pendingChanges.push(value) })

    const first = port.reveal(record)
    expect(port.pending.get()).toBe(true)
    const second = port.reveal(record)
    expect(routine.controls[0]?.aborted).toBe(true)
    routine.resolvers[0]?.({ status: 'cancelled' })
    routine.resolvers[1]?.({ status: 'revealed', element: null })

    await expect(first).resolves.toEqual({ status: 'cancelled' })
    await expect(second).resolves.toEqual({ status: 'revealed', element: null })
    expect(port.pending.get()).toBe(false)
    expect(pendingChanges).toEqual([true, true, false])
  })

  it('cancels through cancelAll and through an external signal', async () => {
    const routine = deferredRoutine()
    const port = createRevealPort({ run: routine.run })
    const controller = new AbortController()
    const first = port.reveal(record, { signal: controller.signal })
    controller.abort()
    routine.resolvers[0]?.({ status: 'cancelled' })
    await expect(first).resolves.toEqual({ status: 'cancelled' })
    expect(port.pending.get()).toBe(false)

    const second = port.reveal(record)
    port.cancelAll('unmount')
    routine.resolvers[1]?.({ status: 'cancelled' })
    await expect(second).resolves.toEqual({ status: 'cancelled' })
    expect(port.pending.get()).toBe(false)
  })

  it('reports unavailable when the routine throws and no longer accepts work after dispose', async () => {
    const port = createRevealPort({ run: async () => { throw new Error('boom') } })
    await expect(port.reveal(record)).resolves.toEqual({ status: 'unavailable', reason: 'missing' })
    port.dispose()
    await expect(port.reveal(record)).resolves.toEqual({ status: 'cancelled' })
  })
})
