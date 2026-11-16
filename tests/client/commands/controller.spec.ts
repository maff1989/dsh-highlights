/**
 * CommandController: typed outcomes, single-flight duplicate suppression,
 * notices and in-flight visibility.
 */
import { describe, expect, it, vi } from 'vitest'

import { createCommandController } from '../../../src/client/commands/controller'
import type { Command } from '../../../src/client/contracts/commands'
import type { NoticeService } from '../../../src/client/contracts/notice'
import { createSignal } from '../../../src/client/runtime/signal'

/** A command whose result the test controls. */
function deferredCommand() {
  let resolve!: (value: string) => void
  let reject!: (error: unknown) => void
  const command: Command<{ readonly id: string }, string> = {
    id: 'test',
    capability: 'update',
    label: 'Test command',
    run: () => new Promise<string>((res, rej) => { resolve = res; reject = rej }),
  }
  return { command, resolve: (value: string) => { resolve(value) }, reject: (error: unknown) => { reject(error) } }
}

/** A fake notice service that records notifications. */
function fakeNotice(): NoticeService & { readonly calls: string[] } {
  const state = createSignal<undefined>(undefined)
  const calls: string[] = []
  return {
    state,
    calls,
    notify(text: string): number { calls.push(text); return calls.length },
    dismiss: vi.fn(),
    dispose: vi.fn(),
  }
}

describe('command controller', () => {
  it('returns one typed outcome and suppresses a duplicate click while in flight', async () => {
    const notice = fakeNotice()
    const controller = createCommandController({ notice })
    const deferred = deferredCommand()
    const first = controller.execute(deferred.command, { id: 'r1' }, { recordId: 'r1' })
    expect(controller.inFlight().has('test:r1')).toBe(true)
    const duplicate = await controller.execute(deferred.command, { id: 'r1' }, { recordId: 'r1' })
    expect(duplicate).toEqual({ status: 'duplicate' })
    deferred.resolve('done')
    await expect(first).resolves.toEqual({ status: 'ok', value: 'done' })
    expect(controller.inFlight().size).toBe(0)
    expect(notice.calls).toEqual([])
  })

  it('maps failures to one typed error and one notice', async () => {
    const notice = fakeNotice()
    const controller = createCommandController({ notice })
    const deferred = deferredCommand()
    const outcome = controller.execute(deferred.command, { id: 'r1' }, { recordId: 'r1' })
    deferred.reject(new Error('route unreachable'))
    await expect(outcome).resolves.toEqual({ status: 'error', code: 'command-failed', message: 'route unreachable', retryable: true })
    expect(notice.calls).toEqual(['Test command: route unreachable'])
  })

  it('short-circuits an already-aborted signal and emits outcome events', async () => {
    const controller = createCommandController()
    const deferred = deferredCommand()
    const events: string[] = []
    controller.onOutcome(event => events.push(event.status))
    const abort = new AbortController()
    abort.abort()
    const outcome = await controller.execute(deferred.command, { id: 'r1' }, { recordId: 'r1', signal: abort.signal })
    expect(outcome).toEqual({ status: 'cancelled' })
    expect(events).toEqual(['cancelled'])
  })
})

describe('controller busy signal', () => {
  it('publishes in-flight keys while a command runs', async () => {
    const controller = createCommandController()
    const { command, resolve } = deferredCommand()
    const pending = controller.execute(command, { id: 'r1' }, { recordId: 'r1' })

    expect(controller.busy.get().has('test:r1')).toBe(true)
    resolve('done')
    await pending
    expect(controller.busy.get().size).toBe(0)
  })
})
