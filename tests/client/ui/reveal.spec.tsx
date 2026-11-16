// @vitest-environment jsdom
/**
 * Reveal sequencing tests.
 *
 * Chat node keys are per-session (turn/step), and `openSession` only changes the
 * layout selection synchronously, so the previous session's transcript can
 * still be mounted with an identical `data-chat-node-key` when reveal runs. The
 * routine must wait for the target session's `[data-conversation-session]`,
 * scope every lookup to it, page history only when the row is really absent,
 * and give up (bounded) instead of hanging or flashing the wrong conversation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_REVEAL_TIMING, revealRecord } from '../../../src/client/reveal'
import type { RevealDeps } from '../../../src/client/reveal'
import {
  appendConversation,
  appendResponseConversation,
  appendSeat,
  makeRecord,
} from '../anchor/fixtures'

/** Short waits keep the suite fast; production uses the exported defaults. */
const TIMING = { session: 60, seat: 60, load: 60, poll: 5 } as const

/** Record the elements reveal scrolled. */
let scrolled: Element[]

/** Build a fake Cordis context + painter for the reveal routine. */
function makeDeps(options: {
  readonly openSession?: (sessionId: string) => void
  readonly loadThrough?: (seq: number) => Promise<void>
} = {}): {
  deps: RevealDeps
  openSession: ReturnType<typeof vi.fn>
  selectPanel: ReturnType<typeof vi.fn>
  loadThrough: ReturnType<typeof vi.fn>
  binding: ReturnType<typeof vi.fn>
  flash: ReturnType<typeof vi.fn>
} {
  const openSession = vi.fn((sessionId: string) => { options.openSession?.(sessionId) })
  const selectPanel = vi.fn()
  const loadThrough = vi.fn((seq: number) => options.loadThrough?.(seq) ?? Promise.resolve())
  const binding = vi.fn(() => ({ session: { loadThrough } }))
  const ctx = {
    uiWorkspace: { openSession },
    layout: { selectPanel },
    sessions: { binding },
  } as unknown as RevealDeps['ctx']
  const flash = vi.fn()
  const painter = { flash, supported: true } as unknown as RevealDeps['painter']
  return { deps: { ctx, painter, timing: TIMING }, openSession, selectPanel, loadThrough, binding, flash }
}

beforeEach(() => {
  document.body.innerHTML = ''
  scrolled = []
  // jsdom has no layout and no scrollIntoView; record the calls reveal makes.
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(function (this: Element) { scrolled.push(this) }),
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect
  vi.restoreAllMocks()
})

describe('revealRecord', () => {
  it('defaults to bounded waits', () => {
    expect(DEFAULT_REVEAL_TIMING.session).toBeGreaterThan(0)
    expect(DEFAULT_REVEAL_TIMING.seat).toBeGreaterThan(0)
    expect(DEFAULT_REVEAL_TIMING.poll).toBeGreaterThan(0)
  })

  it('reveals the response row of the already-open session without paging history', async () => {
    const conversation = appendResponseConversation('session-a')
    const { deps, openSession, selectPanel, binding, loadThrough, flash } = makeDeps()

    const outcome = await revealRecord(
      makeRecord({ sessionId: 'session-a', groupPart: 'response', nodeSeq: 42 }),
      deps,
    )

    expect(outcome).toBe('revealed')
    expect(openSession).toHaveBeenCalledWith('session-a')
    // The panel switch belongs to openSession (its 'reveal' path calls
    // layout.selectPanel(null)); this test's openSession mock does not switch panels.
    expect(selectPanel).not.toHaveBeenCalled()
    expect(loadThrough).not.toHaveBeenCalled()
    expect(binding).not.toHaveBeenCalled()
    expect(scrolled).toEqual([conversation.seat])
    expect(flash).toHaveBeenCalledTimes(1)
    const range = flash.mock.calls[0]?.[0] as Range
    expect(conversation.root.contains(range.startContainer)).toBe(true)
  })

  it('lands on the resolved highlight range in one instant scroll', async () => {
    const conversation = appendResponseConversation('session-a')
    const scrollTo = vi.fn((options: { top?: number }) => {
      conversation.scroll.scrollTop = options.top ?? 0
    })
    conversation.scroll.scrollTo = scrollTo as unknown as typeof conversation.scroll.scrollTo
    Object.defineProperty(conversation.scroll, 'scrollHeight', { configurable: true, value: 2_000 })
    Object.defineProperty(conversation.scroll, 'clientHeight', { configurable: true, value: 600 })
    conversation.scroll.getBoundingClientRect = () => ({
      width: 800, height: 600, top: 0, bottom: 600, left: 0, right: 800, x: 0, y: 0, toJSON: () => ({}),
    })
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 100, height: 20, top: 1_000, bottom: 1_020, left: 40, right: 140, x: 40, y: 1_000, toJSON: () => ({}) }),
    })
    const { deps, flash } = makeDeps()

    const outcome = await revealRecord(makeRecord({ sessionId: 'session-a', groupPart: 'response' }), deps)

    expect(outcome).toBe('revealed')
    // 1000 - 0 - 600/2 + 20/2 = 710: one instant landing, never a smooth animation.
    expect(scrollTo).toHaveBeenCalledWith({ top: 710, behavior: 'instant' })
    expect(conversation.scroll.scrollTop).toBe(710)
    expect(flash).toHaveBeenCalledTimes(1)
  })

  it('ignores a previous session that renders the same node key', async () => {
    appendResponseConversation('session-old')
    const { deps, openSession, flash } = makeDeps()

    const started = Date.now()
    const outcome = await revealRecord(
      makeRecord({ sessionId: 'session-new', groupPart: 'response', nodeSeq: 42 }),
      deps,
    )
    const elapsed = Date.now() - started

    expect(outcome).toBe('not-found')
    expect(openSession).toHaveBeenCalledWith('session-new')
    expect(scrolled).toEqual([])
    expect(flash).not.toHaveBeenCalled()
    // Bounded: the old session is never acted on, and the wait gives up.
    expect(elapsed).toBeLessThan(TIMING.session + 500)
  })

  it('waits for the newly opened session to commit before scrolling and flashing', async () => {
    appendResponseConversation('session-old')
    let newRoot: HTMLElement | undefined
    const { deps, flash } = makeDeps({
      openSession: () => {
        setTimeout(() => {
          document.body.innerHTML = ''
          const mounted = appendResponseConversation('session-new')
          newRoot = mounted.root
        }, 5)
      },
    })

    const outcome = await revealRecord(
      makeRecord({ sessionId: 'session-new', groupPart: 'response', nodeSeq: 42 }),
      deps,
    )

    expect(outcome).toBe('revealed')
    expect(scrolled).toHaveLength(1)
    expect(newRoot?.contains(scrolled[0] ?? null)).toBe(true)
    const range = flash.mock.calls[0]?.[0] as Range
    expect(newRoot?.contains(range.startContainer)).toBe(true)
  })

  it('aborts when the reader navigates to a third session before the target commits', async () => {
    appendResponseConversation('session-old')
    const { deps, flash } = makeDeps({
      openSession: () => {
        document.body.innerHTML = ''
        appendResponseConversation('session-other')
      },
    })

    const started = Date.now()
    const outcome = await revealRecord(
      makeRecord({ sessionId: 'session-new', groupPart: 'response', nodeSeq: 42 }),
      deps,
    )

    expect(outcome).toBe('not-found')
    expect(scrolled).toEqual([])
    expect(flash).not.toHaveBeenCalled()
    expect(Date.now() - started).toBeLessThan(TIMING.session + 500)
  })

  it('pages history when the response row is absent and the node sequence is known', async () => {
    const conversation = appendConversation('session-a')
    const { deps, loadThrough, flash } = makeDeps({
      loadThrough: () => {
        setTimeout(() => { appendSeat(conversation.scroll, { groupPart: 'response' }) }, 5)
        return Promise.resolve()
      },
    })

    const outcome = await revealRecord(
      makeRecord({ sessionId: 'session-a', groupPart: 'response', nodeSeq: 42 }),
      deps,
    )

    expect(outcome).toBe('revealed')
    expect(loadThrough).toHaveBeenCalledWith(42)
    expect(scrolled).toHaveLength(1)
    expect(flash).toHaveBeenCalledTimes(1)
  })

  it('does not page history when the node sequence is unknown and reports not-found bounded', async () => {
    appendConversation('session-a')
    const { deps, binding, loadThrough, flash } = makeDeps()

    const started = Date.now()
    const outcome = await revealRecord(makeRecord({ sessionId: 'session-a', groupPart: 'response' }), deps)
    const elapsed = Date.now() - started

    expect(outcome).toBe('not-found')
    expect(binding).not.toHaveBeenCalled()
    expect(loadThrough).not.toHaveBeenCalled()
    expect(scrolled).toEqual([])
    expect(flash).not.toHaveBeenCalled()
    expect(elapsed).toBeLessThan(TIMING.seat + 500)
  })

  it('never scrolls or flashes a reasoning-only seat', async () => {
    const conversation = appendConversation('session-a')
    appendSeat(conversation.scroll, { groupPart: 'reasoning', thinking: true })
    const { deps, flash } = makeDeps()

    const outcome = await revealRecord(makeRecord({ sessionId: 'session-a', groupPart: 'response' }), deps)

    expect(outcome).toBe('not-found')
    expect(scrolled).toEqual([])
    expect(flash).not.toHaveBeenCalled()
  })

  it('a history paging call that never settles cannot hang the reveal', async () => {
    appendConversation('session-a')
    const { deps, loadThrough, flash } = makeDeps({
      loadThrough: () => new Promise<void>(() => {}),
    })

    const started = Date.now()
    const outcome = await revealRecord(
      makeRecord({ sessionId: 'session-a', groupPart: 'response', nodeSeq: 42 }),
      deps,
    )

    expect(outcome).toBe('not-found')
    expect(loadThrough).toHaveBeenCalledTimes(1)
    expect(scrolled).toEqual([])
    expect(flash).not.toHaveBeenCalled()
    expect(Date.now() - started).toBeLessThan(TIMING.load + TIMING.seat + 1_000)
  })

  it('aborts when the session changes mid-reveal (after the target was committed)', async () => {
    appendConversation('session-a')
    const { deps, flash } = makeDeps({
      loadThrough: async () => {
        document.body.innerHTML = ''
        appendResponseConversation('session-other')
      },
    })

    const outcome = await revealRecord(
      makeRecord({ sessionId: 'session-a', groupPart: 'response', nodeSeq: 42 }),
      deps,
    )

    expect(outcome).toBe('not-found')
    expect(scrolled).toEqual([])
    expect(flash).not.toHaveBeenCalled()
  })

  it('returns not-found instead of throwing when the session lookup fails', async () => {
    appendConversation('session-a')
    const openSession = vi.fn(() => { throw new Error('archived session') })
    const ctx = {
      uiWorkspace: { openSession },
      layout: { selectPanel: vi.fn() },
      sessions: { binding: vi.fn() },
    } as unknown as RevealDeps['ctx']
    const flash = vi.fn()
    const deps: RevealDeps = {
      ctx,
      painter: { flash, supported: true } as unknown as RevealDeps['painter'],
      timing: TIMING,
    }

    const outcome = await revealRecord(makeRecord({ sessionId: 'session-a' }), deps)
    expect(outcome).toBe('not-found')
    expect(flash).not.toHaveBeenCalled()
  })
})
