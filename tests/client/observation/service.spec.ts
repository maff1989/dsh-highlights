// @vitest-environment jsdom
/**
 * Phase-1 contract: the observation service owns DOM watching and visibility.
 *
 * Proves the keep-alive class directly: while a global page is shown (panelInfo
 * non-null, transcript hidden by an ancestor), a streaming mutation produces no
 * observer callback, no paint and no measurement; on re-show exactly one paint
 * runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createObservationService } from '../../../src/client/observation/service'
import { diagnostics, resetDiagnostics } from '../../../src/client/runtime/diagnostics'

/** A fake layout store with one selection field. */
function layoutStore() {
  let activePanelId: string | null = null
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => ({ activePanelId }),
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(panelId: string | null): void {
      activePanelId = panelId
      for (const listener of [...listeners]) listener()
    },
  }
}

/** Manual frame scheduler: frames run only when the test flushes. */
function manualScheduler() {
  let sequence = 0
  const pending = new Map<number, (time: number) => void>()
  return {
    schedule(callback: (time: number) => void): number {
      sequence += 1
      pending.set(sequence, callback)
      return sequence
    },
    cancel(handle: number): void {
      pending.delete(handle)
    },
    flush(time = 0): void {
      for (const [handle, callback] of [...pending]) {
        pending.delete(handle)
        callback(time)
      }
    },
    get size(): number {
      return pending.size
    },
  }
}

/** Build a mounted conversation transcript. */
function transcript(): { conversation: HTMLElement; flow: HTMLElement; scroller: HTMLElement } {
  const conversation = document.createElement('div')
  conversation.dataset.conversationSession = 'session-1'
  const scroller = document.createElement('div')
  scroller.dataset.conversationScroll = ''
  const flow = document.createElement('div')
  flow.dataset.chatFlow = ''
  const row = document.createElement('div')
  row.dataset.chatNodeKey = '9:assistant1:1'
  row.textContent = 'first reply'
  flow.append(row)
  scroller.append(flow)
  conversation.append(scroller)
  document.body.append(conversation)
  return { conversation, flow, scroller }
}

/** Wait for MutationObserver microtasks. */
async function settle(): Promise<void> {
  await new Promise<void>(resolve => { setTimeout(resolve, 0) })
}

beforeEach(() => {
  resetDiagnostics()
})

afterEach(() => {
  document.body.replaceChildren()
  resetDiagnostics()
})

describe('observation service', () => {
  it('paints once on registration and coalesces mutations to one frame', async () => {
    const layout = layoutStore()
    const scheduler = manualScheduler()
    const service = createObservationService({
      panelInfo: layout,
      document,
      schedule: callback => scheduler.schedule(callback),
      cancel: handle => scheduler.cancel(handle),
    })
    const fixture = transcript()
    const frames: string[] = []
    service.onPaintFrame(sessionId => frames.push(sessionId))
    const handle = service.registerSession({
      sessionId: 'session-1',
      conversationRoot: () => fixture.conversation,
      transcriptRoot: () => fixture.flow,
    })
    expect(handle.visible.get()).toBe(true)
    expect(scheduler.size).toBe(1)
    scheduler.flush()
    expect(frames).toEqual(['session-1'])
    expect(diagnostics().paintPasses).toBe(1)

    fixture.flow.append(document.createElement('div'))
    fixture.flow.append(document.createElement('div'))
    await settle()
    expect(diagnostics().observerCallbacks).toBeGreaterThanOrEqual(1)
    scheduler.flush()
    expect(diagnostics().paintPasses).toBe(2)
    service.dispose()
  })

  it('does no work while a global page is shown, then paints once on re-show', async () => {
    const layout = layoutStore()
    const scheduler = manualScheduler()
    const service = createObservationService({
      panelInfo: layout,
      document,
      schedule: callback => scheduler.schedule(callback),
      cancel: handle => scheduler.cancel(handle),
    })
    const fixture = transcript()
    const handle = service.registerSession({
      sessionId: 'session-1',
      conversationRoot: () => fixture.conversation,
      transcriptRoot: () => fixture.flow,
    })
    scheduler.flush() // initial paint
    const afterMount = diagnostics().paintPasses
    const afterMountRequests = diagnostics().repaintRequests

    layout.set('highlights') // global page shown; keep-alive keeps the DOM mounted
    expect(handle.visible.get()).toBe(false)
    expect(service.isVisible('session-1')).toBe(false)

    // Streaming mutates the hidden transcript: no observer, no paint.
    for (let index = 0; index < 5; index += 1) fixture.flow.append(document.createElement('div'))
    await settle()
    scheduler.flush()
    expect(diagnostics().paintPasses).toBe(afterMount)
    expect(diagnostics().observerCallbacks).toBe(0)
    expect(diagnostics().repaintRequests).toBe(afterMountRequests)

    // A direct request is dropped too (the layer's safety net).
    service.requestPaint('session-1', 'mutate')
    scheduler.flush()
    expect(diagnostics().paintPasses).toBe(afterMount)
    expect(diagnostics().paintSkippedHidden).toBe(1)

    // Re-show: exactly one paint for the session.
    layout.set(null)
    expect(handle.visible.get()).toBe(true)
    scheduler.flush()
    expect(diagnostics().paintPasses).toBe(afterMount + 1)
    service.dispose()
  })

  it('ignores plugin-owned and composer mutations', async () => {
    const layout = layoutStore()
    const scheduler = manualScheduler()
    const service = createObservationService({
      panelInfo: layout,
      document,
      schedule: callback => scheduler.schedule(callback),
      cancel: handle => scheduler.cancel(handle),
    })
    const fixture = transcript()
    service.registerSession({
      sessionId: 'session-1',
      conversationRoot: () => fixture.conversation,
      transcriptRoot: () => fixture.flow,
    })
    scheduler.flush()
    const passes = diagnostics().paintPasses
    const host = document.createElement('div')
    host.dataset.dshhlHighlightHost = ''
    fixture.flow.append(host)
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    fixture.flow.append(editor)
    await settle()
    scheduler.flush()
    expect(diagnostics().observerCallbacks).toBe(0)
    expect(diagnostics().paintPasses).toBe(passes)
    service.dispose()
  })

  it('stops observing after dispose and unregisters the session', async () => {
    const layout = layoutStore()
    const scheduler = manualScheduler()
    const service = createObservationService({
      panelInfo: layout,
      document,
      schedule: callback => scheduler.schedule(callback),
      cancel: handle => scheduler.cancel(handle),
    })
    const fixture = transcript()
    const handle = service.registerSession({
      sessionId: 'session-1',
      conversationRoot: () => fixture.conversation,
      transcriptRoot: () => fixture.flow,
    })
    scheduler.flush()
    const passes = diagnostics().paintPasses
    handle.dispose()
    fixture.flow.append(document.createElement('div'))
    await settle()
    service.requestPaint('session-1', 'mutate')
    scheduler.flush()
    expect(diagnostics().paintPasses).toBe(passes)
    service.dispose()
  })

  it('recovers visibility when the transcript root appears after registration', async () => {
    // Cold-load race: the bridge can register before Chat renders the transcript,
    // and a permanently false `visible` leaves the gesture layer uninstalled.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const layout = layoutStore()
      const scheduler = manualScheduler()
      const service = createObservationService({
        panelInfo: layout,
        document,
        schedule: callback => scheduler.schedule(callback),
        cancel: handle => scheduler.cancel(handle),
      })
      const conversation = document.createElement('div')
      conversation.dataset.conversationSession = 'session-1'
      document.body.append(conversation)
      let flow: HTMLElement | null = null
      const handle = service.registerSession({
        sessionId: 'session-1',
        conversationRoot: () => conversation,
        transcriptRoot: () => flow,
      })
      expect(handle.visible.get()).toBe(false)

      // Chat commits the transcript root well after registration (cold history
      // read); the bounded re-check must still recover without an external event.
      flow = document.createElement('div')
      flow.dataset.chatFlow = ''
      conversation.append(flow)
      await vi.advanceTimersByTimeAsync(1200)
      expect(handle.visible.get()).toBe(true)
      service.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
