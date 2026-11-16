// @vitest-environment jsdom
/**
 * P0-2 regression at the bridge level:
 * - the item card must not dismiss itself when a press lands on its own portal;
 * - outside presses and Escape still close it;
 * - a right-button press never opens or closes the card (the contextmenu
 *   gesture owns right-presses).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type { HighlightRecord } from '../../../src/shared/schema'
import type { HighlightDraft, WriteOutcome } from '../../../src/client/data/actions'
import { SessionBridge, type SessionBridgeProps } from '../../../src/client/ui/SessionBridge'

// The primitives package is a shell-provided platform module and pulls `clsx`,
// which this browser-only dependency tree does not install: stand the glyph in.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => await import('./primitives-mock'))

/** Translate stub that echoes keys. */
const t = (key: string): string => key

/** One stored record whose painted range the bridge serves. */
const record: HighlightRecord = {
  schemaVersion: 1,
  id: '11111111-2222-4333-8444-555555555555',
  sessionId: 'session-1',
  origin: 'test',
  anchor: {
    nodeKey: '14:assistant-step4:2',
    kind: 'text',
    sourceIndex: 0,
    quote: 'migration must land',
    prefix: '',
    suffix: '',
    start: 4,
    end: 21,
    projection: 1,
  },
  colorId: 3,
  tags: [],
  starred: false,
  createdAt: 1,
  updatedAt: 2,
  version: 1,
}

/** What the card fixture's painted range covers. */
let paintedRange: Range

/** Recorded action calls. */
interface Calls {
  readonly update: ReturnType<typeof vi.fn>
  readonly remove: ReturnType<typeof vi.fn>
  readonly reveal: ReturnType<typeof vi.fn>
  readonly insert: ReturnType<typeof vi.fn>
  readonly copyQuote: ReturnType<typeof vi.fn>
  readonly createSelection: ReturnType<typeof vi.fn>
  readonly openTab: ReturnType<typeof vi.fn>
  readonly copy: (text: string) => Promise<boolean>
}

/** The transcript fixture: one assistant node with one text source. */
function buildTranscript(): HTMLElement {
  const scroller = document.createElement('div')
  scroller.setAttribute('data-conversation-scroll', '')
  const node = document.createElement('div')
  node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
  node.setAttribute('data-chat-group-part', 'response')
  const source = document.createElement('div')
  source.setAttribute('data-text-interaction-source', '')
  source.textContent = 'The migration must land before the release.'
  node.append(source)
  scroller.append(node)
  document.body.append(scroller)

  const text = source.firstChild
  if (text === null) throw new Error('fixture text missing')
  paintedRange = document.createRange()
  paintedRange.setStart(text, 4)
  paintedRange.setEnd(text, 21)
  return source
}

/**
 * Render the bridge with fake slots/actions.
 * @param extraRecords - additional records in the same session (mini-map tests).
 * @returns recorded calls.
 */
function renderBridge(extraRecords: readonly HighlightRecord[] = []): Calls {
  const allRecords = [record, ...extraRecords]
  const calls: Calls = {
    update: vi.fn(async (_id: string, _patch: unknown, _expectedVersion?: number): Promise<WriteOutcome> => ({ status: 'written', record })),
    remove: vi.fn(async (_id: string): Promise<WriteOutcome> => ({ status: 'written', record })),
    reveal: vi.fn(async () => 'revealed' as const),
    insert: vi.fn(async () => 'inserted' as const),
    copyQuote: vi.fn(async () => true),
    createSelection: vi.fn(),
    openTab: vi.fn(),
    copy: async () => true,
  }
  const snapshot = {
    status: 'ready',
    records: allRecords,
    byId: new Map(allRecords.map(item => [item.id, item])),
    hello: undefined,
    error: undefined,
    offline: false,
    paintSupported: true,
    stale: new Set<string>(),
    recordsBySession: new Map([['session-1', allRecords]]),
    staleBySession: new Map(),
    paintEpoch: 0,
    inFlight: new Set<string>(),
  }
  const actions = {
    lastColorId: () => 3,
    tagSuggestions: () => [],
    update: calls.update,
    remove: calls.remove,
    reveal: calls.reveal,
    insert: calls.insert,
    copyQuote: calls.copyQuote,
  }
  const props = {
    t,
    sessionId: 'session-1',
    useSnap: <S,>(selector: (value: typeof snapshot) => S): S => selector(snapshot),
    useChat: <S,>(selector: (value: object) => S): S => selector({}),
    inputActions: {
      insertQuote: vi.fn(() => true),
      insertText: vi.fn(() => true),
      captureInsertion: vi.fn(() => ({})),
    },
    actions,
    painter: {
      resolved: new Map([[record.id, paintedRange]]),
      paint: vi.fn(),
      paintPlan: vi.fn(),
      dispose: vi.fn(),
      supported: true,
    },
    copy: calls.copy,
    insert: { registerBridge: vi.fn(() => () => undefined) },
    client: {
      forSession: () => allRecords,
      getSnapshot: () => ({ byId: new Map(allRecords.map(item => [item.id, item])), revision: 0 }),
      setStale: vi.fn(),
      setStaleForSession: vi.fn(),
    },
    observation: {
      registerSession: () => {
        const signal = { get: () => true, subscribe: () => () => undefined }
        return {
          sessionId: 'session-1',
          conversationRoot: () => null,
          transcriptRoot: () => null,
          visible: signal,
          active: signal,
          paintEpoch: signal,
          dispose: vi.fn(),
        }
      },
      onPaintFrame: () => () => undefined,
      isVisible: () => true,
      requestPaint: vi.fn(),
      dispose: vi.fn(),
      activeSurface: { get: () => 'conversation', subscribe: () => () => undefined },
      documentVisible: { get: () => true, subscribe: () => () => undefined },
      revealPending: { get: () => false, subscribe: () => () => undefined },
    },
    openTab: calls.openTab,
    createSelection: calls.createSelection,
  } as unknown as SessionBridgeProps
  render(<SessionBridge {...props} />)
  return calls
}

/** Dispatch a bubbling pointerup on one element. */
function pointerUp(target: Element): void {
  target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }))
}

/** Open the item card by pressing the painted text. */
async function openCard(source: HTMLElement): Promise<HTMLElement> {
  pointerUp(source)
  await waitFor(() => expect(document.querySelector('[data-dshhl-card]')).toBeTruthy())
  return document.querySelector('[data-dshhl-card]') as HTMLElement
}

/** Remove the fake transcript/fixture between tests. */
function clearDom(): void {
  document.body.innerHTML = ''
  delete (document as unknown as Record<string, unknown>).caretRangeFromPoint
}

beforeEach(() => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 120, height: 20, top: 120, bottom: 140, left: 40, right: 160, x: 40, y: 120 }),
  })
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [{ width: 120, height: 20, top: 120, bottom: 140, left: 40, right: 160, x: 40, y: 120 }],
  })
  // jsdom has no point hit-testing; answer with the painted range.
  ;(document as Document & { caretRangeFromPoint: () => Range }).caretRangeFromPoint = () => paintedRange
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects
  delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect
  window.getSelection()?.removeAllRanges()
  clearDom()
})

describe('SessionBridge item card', () => {
  it('keeps the card open when a press lands on its own controls', async () => {
    const source = buildTranscript()
    renderBridge()
    const card = await openCard(source)

    const save = within(card).getByRole('button', { name: 'action.saveChanges' })
    pointerUp(save)
    pointerUp(card)

    expect(document.querySelector('[data-dshhl-card]')).toBeTruthy()
  })

  it('draws rounded overlay boxes for resolved text highlights', async () => {
    const source = buildTranscript()
    renderBridge()
    await waitFor(() => {
      expect(document.querySelectorAll('.dshhl-highlight-box').length).toBeGreaterThan(0)
    })
    const box = document.querySelector('.dshhl-highlight-box') as HTMLElement
    expect(box.style.height).not.toBe('')
    expect(box.style.background).toContain('var(--dsh-hl-3)')
    expect(source.isConnected).toBe(true)

    // The boxes are ordinary scroll content inside the scroller, so native scroll
    // moves them with the text (no fixed overlay chasing the scroll).
    const host = box.closest('.dshhl-highlight-host') as HTMLElement | null
    const scroller = document.querySelector('[data-conversation-scroll]') as HTMLElement
    expect(host?.parentElement).toBe(scroller)
  })

  it('opens the card below the painted range instead of over it', async () => {
    const source = buildTranscript()
    renderBridge()
    const card = await openCard(source)

    const wrapper = card.parentElement as HTMLElement
    // Fixture range bottom is 140; the card is anchored 8px below it.
    expect(wrapper.style.top).toBe('148px')
    expect(wrapper.style.bottom).toBe('')
    expect(Number.parseFloat(wrapper.style.maxHeight)).toBeGreaterThan(0)
  })

  it('places the card above a highlight when the composer leaves no room below', async () => {
    const source = buildTranscript()
    const scroller = document.querySelector('[data-conversation-scroll]') as HTMLElement
    scroller.getBoundingClientRect = () => ({
      width: 600, height: 600, top: 0, bottom: 600, left: 0, right: 600, x: 0, y: 0, toJSON: () => ({}),
    })
    const composer = document.createElement('div')
    composer.setAttribute('data-composer-seat', '')
    composer.getBoundingClientRect = () => ({
      width: 600, height: 200, top: 400, bottom: 600, left: 0, right: 600, x: 0, y: 400, toJSON: () => ({}),
    })
    scroller.append(composer)
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 120, height: 20, top: 350, bottom: 370, left: 40, right: 160, x: 40, y: 350 }),
    })
    renderBridge()
    const card = await openCard(source)
    const wrapper = card.parentElement as HTMLElement
    // No room below (composer top 400): the card's bottom edge sits directly
    // above the range (768 - 350 + 8) and its height is capped above it.
    expect(wrapper.style.top).toBe('')
    expect(wrapper.style.bottom).toBe('426px')
    expect(wrapper.style.maxHeight).toBe('334px')
  })

  it('hides the card while its highlight scrolls offscreen, then restores it', async () => {
    const source = buildTranscript()
    renderBridge()
    const card = await openCard(source)
    const wrapper = card.parentElement as HTMLElement
    expect(wrapper.style.visibility).toBe('visible')

    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 120, height: 20, top: 900, bottom: 920, left: 40, right: 160, x: 40, y: 900 }),
    })
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => { setTimeout(resolve, 40) })
    expect(wrapper.style.visibility).toBe('hidden')

    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 120, height: 20, top: 120, bottom: 140, left: 40, right: 160, x: 40, y: 120 }),
    })
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => { setTimeout(resolve, 40) })
    expect(wrapper.style.visibility).toBe('visible')
  })

  it('right-aligns the card to a highlight near the conversation pane edge', async () => {
    const source = buildTranscript()
    const scroller = document.querySelector('[data-conversation-scroll]') as HTMLElement
    scroller.getBoundingClientRect = () => ({
      width: 600, height: 600, top: 0, bottom: 600, left: 0, right: 600, x: 0, y: 0, toJSON: () => ({}),
    })
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 140, height: 20, top: 120, bottom: 140, left: 450, right: 590, x: 450, y: 120 }),
    })
    renderBridge()
    const card = await openCard(source)

    // 590 - 272 (card width) = 318, inside the pane's 12px gutter.
    expect((card.parentElement as HTMLElement).style.left).toBe('318px')
  })

  it('keeps the card attached to its highlight while the transcript scrolls', async () => {
    const source = buildTranscript()
    renderBridge()
    const card = await openCard(source)
    const wrapper = card.parentElement as HTMLElement
    expect(wrapper.style.top).toBe('148px')

    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 120, height: 20, top: 220, bottom: 240, left: 40, right: 160, x: 40, y: 220 }),
    })
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => { setTimeout(resolve, 40) })

    expect(wrapper.style.top).toBe('248px')
  })

  it('persists an edit made after the card survives the press', async () => {
    const source = buildTranscript()
    const calls = renderBridge()
    const card = await openCard(source)

    const star = card.querySelector('button[aria-label="action.star"]') as HTMLElement
    pointerUp(star)
    fireEvent.click(star)
    pointerUp(card)
    fireEvent.click(within(card).getByRole('button', { name: 'action.saveChanges' }))

    await waitFor(() => { expect(calls.update).toHaveBeenCalledTimes(1) })
    const draft = calls.update.mock.calls[0]?.[1] as { starred: boolean }
    expect(draft.starred).toBe(true)
  })

  it('returns focus to the element that had it before the card opened', async () => {
    const source = buildTranscript()
    renderBridge()
    const before = document.createElement('button')
    before.textContent = 'before'
    document.body.append(before)
    before.focus()

    await openCard(source)
    const card = document.querySelector('[data-dshhl-card]') as HTMLElement
    expect(card.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(document.querySelector('[data-dshhl-card]')).toBeNull() })
    expect(document.activeElement).toBe(before)
  })

  it('closes only the open More menu on the first Escape, then the card', async () => {
    const source = buildTranscript()
    renderBridge()
    const card = await openCard(source)
    fireEvent.click(within(card).getByLabelText('status.menu'))
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(card.getAttribute('data-dshhl-menu-open')).toBe('')

    // Nested Escape closes one layer: the Menu primitive handles its own
    // Escape; the card must stay for that first press (F13).
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('[data-dshhl-card]')).toBeTruthy()

    // The primitive's own Escape path closes the menu (the test mock does not
    // wire it, so the trigger toggles it here); the next Escape closes the card.
    fireEvent.click(within(card).getByLabelText('status.menu'))
    await waitFor(() => { expect(card.getAttribute('data-dshhl-menu-open')).toBeNull() })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(document.querySelector('[data-dshhl-card]')).toBeNull() })
  })

  it('still closes on an outside press and on Escape', async () => {
    const source = buildTranscript()
    renderBridge()
    await openCard(source)

    const outside = document.createElement('div')
    document.body.append(outside)
    pointerUp(outside)
    await waitFor(() => { expect(document.querySelector('[data-dshhl-card]')).toBeNull() })

    await openCard(source)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(document.querySelector('[data-dshhl-card]')).toBeNull() })
  })

  it('ignores a right-button press on painted text', async () => {
    const source = buildTranscript()
    renderBridge()
    source.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 2, clientX: 10, clientY: 10 }))
    await new Promise<void>(resolve => { setTimeout(resolve, 40) })
    expect(document.querySelector('[data-dshhl-card]')).toBeNull()
  })
})

describe('SessionBridge session mini-map', () => {
  /** A second annotation later in the same transcript. */
  const second: HighlightRecord = {
    ...record,
    id: '11111111-2222-4333-8444-555555555556',
    anchor: { ...record.anchor, turn: 5, step: 1, nodeSeq: 9, quote: 'second anchored text' },
  }

  it('renders the rail from the current session and reveals a clicked mark', async () => {
    const calls = renderBridge([second])
    const rail = await screen.findByRole('group', { name: 'minimap.label' })
    expect(within(rail).getAllByRole('button')).toHaveLength(2)

    fireEvent.click(within(rail).getByRole('button', { name: 'second anchored text' }))
    await waitFor(() => { expect(calls.reveal).toHaveBeenCalledTimes(1) })
    expect((calls.reveal.mock.calls[0]?.[0] as HighlightRecord).id).toBe(second.id)
  })

  it('renders no rail for a session with a single annotation', () => {
    renderBridge()
    expect(screen.queryByRole('group', { name: 'minimap.label' })).toBeNull()
  })
})
