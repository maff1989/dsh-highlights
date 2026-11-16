// @vitest-environment jsdom
/**
 * Interaction test for the floating selection affordance.
 *
 * Chat admits only one plugin to its selection surface, so this component draws
 * its own action. The test stubs range geometry (jsdom reports none), makes a
 * real DOM selection inside an assistant node, dispatches the pointerup that
 * follows the gesture, and asserts the toolbar and the saved anchor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => await import('./primitives-mock'))
import type { ReactElement } from 'react'

import type { HighlightAnchor } from '../../../src/shared/schema'
import type { HighlightDraft } from '../../../src/client/data/actions'
import type { HighlightsClient } from '../../../src/client/data/client'
import { SelectionAffordance, isChatSurfaceOpen } from '../../../src/client/ui/SelectionAffordance'
import { createSelectionGesture } from '../../../src/client/selection/gesture'
import type { SelectionGesture } from '../../../src/client/contracts/selection'

/** A rectangle jsdom would otherwise refuse to provide. */
const RECT = { width: 120, height: 20, top: 120, bottom: 140, left: 40, right: 160, x: 40, y: 120 }

/** Minimal translate stub: returns the key so assertions can match copy. */
const t = (key: string): string => key

/** Fake Chat snapshot: resolves the durable ids for our node. */
const chat = {
  nodes: {
    get: (key: string) => (key === '14:assistant-step4:2'
      ? { anchorSeq: 42, data: { finalNode: { messageId: 'm-1' } } }
      : undefined),
  },
}

/** Fake client: the affordance only reads `getSnapshot` through props it ignores in practice. */
const client = { getSnapshot: () => ({ records: [] }) } as unknown as HighlightsClient

/** Collected saves. */
const saves: { anchor: HighlightAnchor; sessionId: string; draft: HighlightDraft }[] = []

/** Texts handed to the injected clipboard callback. */
const copied: string[] = []

/** Notices handed to the injected announce callback. */
const announced: string[] = []

/** Whether the injected clipboard callback should report success. */
let copySucceeds = true

/** Render the affordance under test. */
function renderAffordance(revealPending?: () => boolean, visible = true, gesture?: SelectionGesture, sessionId = 'session-1'): ReactElement {
  return (
    <SelectionAffordance
      t={t}
      sessionId={sessionId}
      defaultColor={() => 3}
      tagSuggestions={() => ['release']}
      createSelection={(anchor, sessionId, draft) => { saves.push({ anchor, sessionId, draft }) }}
      chat={chat}
      client={client}
      copy={async text => { copied.push(text); return copySucceeds }}
      announce={text => { announced.push(text) }}
      visible={visible}
      {...(revealPending === undefined ? {} : { revealPending })}
      {...(gesture === undefined ? {} : { gesture })}
    />
  )
}

/** Select one text range inside the assistant source. */
function select(range: Range): void {
  const selection = window.getSelection()
  if (selection === null) throw new Error('jsdom selection missing')
  selection.removeAllRanges()
  selection.addRange(range)
}

/** Mount an assistant reply and select part of its text (without opening the bar). */
function selectReplyText(): Range {
  const source = document.createElement('div')
  source.setAttribute('data-text-interaction-source', '')
  source.textContent = 'The migration must land before the release.'
  const node = document.createElement('div')
  node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
  node.setAttribute('data-chat-group-part', 'response')
  node.append(source)
  const conversation = document.createElement('div')
  conversation.setAttribute('data-conversation-session', 'session-1')
  conversation.append(node)
  document.body.append(conversation)
  const text = source.firstChild
  if (text === null) throw new Error('fixture text missing')
  const range = document.createRange()
  range.setStart(text, 4)
  range.setEnd(text, 21)
  select(range)
  return range
}


/** One assistant reply inside a session-scoped conversation, with a live selection. */
interface ReplyFixture {
  readonly conversation: HTMLElement
  readonly source: HTMLElement
  readonly range: Range
}

/**
 * Mount one assistant reply inside a conversation wrapper and select part of
 * its text. The right-click path requires the session marker and the assistant
 * node identity that `captureSelection` checks.
 * @param text - reply text.
 * @returns the conversation, its source element, and the selected range.
 */
function buildReply(text = 'The migration must land before the release.'): ReplyFixture {
  const conversation = document.createElement('div')
  conversation.setAttribute('data-conversation-session', 'session-1')
  const node = document.createElement('div')
  node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
  node.setAttribute('data-chat-group-part', 'response')
  const source = document.createElement('div')
  source.setAttribute('data-text-interaction-source', '')
  source.textContent = text
  node.append(source)
  conversation.append(node)
  document.body.append(conversation)
  const textNode = source.firstChild
  if (textNode === null) throw new Error('fixture text missing')
  const range = document.createRange()
  range.setStart(textNode, 4)
  range.setEnd(textNode, 21)
  select(range)
  return { conversation, source, range }
}

/**
 * Dispatch one real contextmenu event at viewport coordinates.
 * @param target - element the right-click lands on.
 * @param options - coordinates and the Shift bypass.
 * @returns the dispatched event (its `defaultPrevented` is the assertion surface).
 */
function rightClick(target: Element, options: { readonly clientX: number; readonly clientY: number; readonly shiftKey?: boolean }): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX,
    clientY: options.clientY,
    ...(options.shiftKey === true ? { shiftKey: true } : {}),
  })
  fireEvent(target, event)
  return event
}

/**
 * Open the bar the way the product does. A pointer selection never opens it
 * (the bar is right-click-gated), so tests right-click the centre of the first
 * mocked selection rect.
 * @returns the contextmenu event, whose `defaultPrevented` is the claim signal.
 */
function openBarByRightClick(): MouseEvent {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) throw new Error('no live selection')
  const range = selection.getRangeAt(0)
  const container = range.startContainer
  const element = container.nodeType === Node.ELEMENT_NODE ? container as Element : container.parentElement
  const source = element?.closest('[data-text-interaction-source]')
  if (source === null || source === undefined) throw new Error('selection is not inside a text source')
  const rect = range.getClientRects()[0]
  if (rect === undefined) throw new Error('mocked range rect missing')
  return rightClick(source, { clientX: (rect.left + rect.right) / 2, clientY: (rect.top + rect.bottom) / 2 })
}

/** Reads of `document.activeElement`; the poll's focus check is the only reader here. */
interface FocusReads {
  readonly state: { count: number }
  reset(): void
  restore(): void
}

/**
 * Count reads of `document.activeElement` for one test.
 * @returns the counter plus teardown; call `restore()` before the test ends.
 */
function instrumentActiveElement(): FocusReads {
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')
  if (descriptor === undefined || typeof descriptor.get !== 'function' || descriptor.configurable !== true) {
    throw new Error('jsdom activeElement accessor is not configurable')
  }
  const original = descriptor.get
  const state = { count: 0 }
  Object.defineProperty(Document.prototype, 'activeElement', {
    ...descriptor,
    get(this: Document): Element | null {
      state.count += 1
      return original.call(this) as Element | null
    },
  })
  return {
    state,
    reset: () => { state.count = 0 },
    restore: () => { Object.defineProperty(Document.prototype, 'activeElement', descriptor) },
  }
}

beforeEach(() => {
  saves.length = 0
  copied.length = 0
  announced.length = 0
  copySucceeds = true
  // jsdom implements Range but has no client-rectangle support at all, so the
  // geometry is defined rather than spied on.
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [RECT],
  })
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.restoreAllMocks()
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects
  window.getSelection()?.removeAllRanges()
})

describe('SelectionAffordance', () => {
  it('shows the toolbar for a selection inside assistant reply text', async () => {
    render(renderAffordance())
    const source = document.createElement('div')
    source.setAttribute('data-text-interaction-source', '')
    source.textContent = 'The migration must land before the release.'
    const node = document.createElement('div')
    node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
    node.setAttribute('data-chat-group-part', 'response')
    node.append(source)
    const conversation = document.createElement('div')
    conversation.setAttribute('data-conversation-session', 'session-1')
    conversation.append(node)
    document.body.append(conversation)

    const text = source.firstChild
    if (text === null) throw new Error('fixture text missing')
    const range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, 21)
    select(range)

    openBarByRightClick()
    await waitFor(() => expect(screen.getByRole('toolbar')).toBeTruthy())
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(6)
  })

  it('does not open the bar from a pointer selection (right-click gated)', async () => {
    render(renderAffordance())
    selectReplyText()

    fireEvent.pointerDown(document, { button: 0 })
    fireEvent.pointerUp(document)
    await new Promise(resolve => { setTimeout(resolve, 250) })
    expect(screen.queryByRole('toolbar'), 'a drag selection must stay bar-less').toBeNull()

    // The gate, not the selection, is what keeps it closed: right-click still opens it.
    openBarByRightClick()
    expect(await screen.findByRole('toolbar')).toBeTruthy()
  })

  it('does not open the bar from a double/triple-click selection', async () => {
    render(renderAffordance())
    selectReplyText()

    // Chromium reports the click count on the press; a block selection is still
    // right-click-gated and must not pop the bar.
    fireEvent.mouseDown(document, { button: 0, detail: 3 })
    fireEvent.pointerUp(document)
    await new Promise(resolve => { setTimeout(resolve, 250) })
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.mouseDown(document, { button: 0, detail: 1 })
  })

  it('places the bar below the selection, aligned left, and follows scroll', async () => {
    render(renderAffordance())
    let rects: DOMRect[] = [{ width: 120, height: 20, top: 120, bottom: 140, left: 40, right: 160, x: 40, y: 120, toJSON: () => ({}) }]
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => rects,
    })

    const source = document.createElement('div')
    source.setAttribute('data-text-interaction-source', '')
    source.textContent = 'The migration must land before the release.'
    const node = document.createElement('div')
    node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
    node.append(source)
    const scroller = document.createElement('div')
    scroller.setAttribute('data-conversation-scroll', '')
    scroller.setAttribute('data-conversation-session', 'session-1')
    scroller.getBoundingClientRect = () => ({
      width: 600, height: 600, top: 0, bottom: 600, left: 0, right: 600, x: 0, y: 0, toJSON: () => ({}),
    })
    scroller.append(node)
    document.body.append(scroller)

    const text = source.firstChild
    if (text === null) throw new Error('fixture text missing')
    const range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, 21)
    select(range)
    openBarByRightClick()

    const toolbar = await screen.findByRole('toolbar')
    const bar = toolbar.closest('.dshhl-affordance') as HTMLElement
    bar.getBoundingClientRect = () => ({
      width: 300, height: 34, top: 0, bottom: 34, left: 0, right: 300, x: 0, y: 0, toJSON: () => ({}),
    })
    await new Promise<void>(resolve => { setTimeout(resolve, 30) })

    expect(bar.style.visibility).toBe('visible')
    // Below the selection (bottom 140 + gap 8), left-aligned to selection left 40.
    expect(bar.style.top).toBe('148px')
    expect(bar.style.left).toBe('40px')

    // Scrolling shifts the range; the bar follows without being dismissed.
    rects = [{ width: 120, height: 20, top: 220, bottom: 240, left: 60, right: 180, x: 60, y: 220, toJSON: () => ({}) }]
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => { setTimeout(resolve, 40) })
    expect(bar.style.top).toBe('248px')
    expect(bar.style.left).toBe('60px')

    // Near the *conversation pane* right edge it aligns its right edge with the
    // selection's right edge and stays out of the right sidebar.
    rects = [{ width: 120, height: 20, top: 220, bottom: 240, left: 300, right: 590, x: 300, y: 220, toJSON: () => ({}) }]
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => { setTimeout(resolve, 40) })
    expect(bar.style.left).toBe('290px')
  })

  it('stays above the composer and hides when the selection is behind it', async () => {
    render(renderAffordance())
    let rects: DOMRect[] = [{ width: 120, height: 20, top: 350, bottom: 370, left: 40, right: 160, x: 40, y: 350, toJSON: () => ({}) }]
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => rects })

    const scroller = document.createElement('div')
    scroller.setAttribute('data-conversation-scroll', '')
    scroller.setAttribute('data-conversation-session', 'session-1')
    scroller.getBoundingClientRect = () => ({
      width: 600, height: 600, top: 0, bottom: 600, left: 0, right: 600, x: 0, y: 0, toJSON: () => ({}),
    })
    const composer = document.createElement('div')
    composer.setAttribute('data-composer-seat', '')
    composer.getBoundingClientRect = () => ({
      width: 600, height: 200, top: 400, bottom: 600, left: 0, right: 600, x: 0, y: 400, toJSON: () => ({}),
    })
    scroller.append(composer)
    const source = document.createElement('div')
    source.setAttribute('data-text-interaction-source', '')
    source.textContent = 'The migration must land before the release.'
    const node = document.createElement('div')
    node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
    node.append(source)
    scroller.append(node)
    document.body.append(scroller)

    const text = source.firstChild
    if (text === null) throw new Error('fixture text missing')
    const range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, 21)
    select(range)
    openBarByRightClick()

    const toolbar = await screen.findByRole('toolbar')
    const bar = toolbar.closest('.dshhl-affordance') as HTMLElement
    bar.getBoundingClientRect = () => ({
      width: 300, height: 36, top: 0, bottom: 36, left: 0, right: 300, x: 0, y: 0, toJSON: () => ({}),
    })
    await new Promise<void>(resolve => { setTimeout(resolve, 30) })
    // No room below (composer top 400), so it flips above the selection; the
    // H36 bar leaves 350 - 8 (gap) - 36 (height).
    expect(bar.style.visibility).toBe('visible')
    expect(bar.style.top).toBe('306px')

    // Selection scrolled under the composer: no floating surface.
    rects = [{ width: 120, height: 20, top: 500, bottom: 520, left: 40, right: 160, x: 40, y: 500, toJSON: () => ({}) }]
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => { setTimeout(resolve, 40) })
    expect(bar.style.visibility).toBe('hidden')
  })

  it('saves the captured anchor with the chosen colour', async () => {
    render(renderAffordance())
    const source = document.createElement('div')
    source.setAttribute('data-text-interaction-source', '')
    source.textContent = 'The migration must land before the release.'
    const node = document.createElement('div')
    node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
    node.append(source)
    const scroller = document.createElement('div')
    scroller.setAttribute('data-conversation-scroll', '')
    scroller.setAttribute('data-conversation-session', 'session-1')
    scroller.getBoundingClientRect = () => ({
      width: 600, height: 600, top: 0, bottom: 600, left: 0, right: 600, x: 0, y: 0, toJSON: () => ({}),
    })
    scroller.append(node)
    document.body.append(scroller)

    const text = source.firstChild
    if (text === null) throw new Error('fixture text missing')
    const range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, 21)
    select(range)
    openBarByRightClick()

    const dot = await screen.findByLabelText('color.1')
    fireEvent.click(dot)

    await waitFor(() => expect(saves).toHaveLength(1))
    const saved = saves[0]
    expect(saved?.anchor.quote).toBe('migration must la')
    expect(saved?.anchor.nodeKey).toBe('14:assistant-step4:2')
    expect(saved?.anchor.turn).toBe(4)
    expect(saved?.anchor.step).toBe(2)
    expect(saved?.sessionId).toBe('session-1')
    expect(saved?.draft.colorId).toBe(1)
    // Durable ids arrive from the Chat snapshot, not the DOM.
    expect(saved?.anchor.messageId).toBe('m-1')
    expect(saved?.anchor.nodeSeq).toBe(42)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('opens the editor and saves tags and a note', async () => {
    render(renderAffordance())
    const source = document.createElement('div')
    source.setAttribute('data-text-interaction-source', '')
    source.textContent = 'Release notes must be written before tagging.'
    const node = document.createElement('div')
    node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
    node.append(source)
    const scroller = document.createElement('div')
    scroller.setAttribute('data-conversation-scroll', '')
    scroller.setAttribute('data-conversation-session', 'session-1')
    scroller.getBoundingClientRect = () => ({
      width: 600, height: 600, top: 0, bottom: 600, left: 0, right: 600, x: 0, y: 0, toJSON: () => ({}),
    })
    scroller.append(node)
    document.body.append(scroller)

    const text = source.firstChild
    if (text === null) throw new Error('fixture text missing')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 7)
    select(range)
    openBarByRightClick()

    fireEvent.click(await screen.findByRole('button', { name: 'action.annotate' }))
    // The note field is progressive: it appears only when asked for.
    fireEvent.click(await screen.findByRole('button', { name: /editor.addNote/ }))
    const tagInput = await screen.findByLabelText('editor.tags')
    fireEvent.change(tagInput, { target: { value: 'release' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    const note = screen.getByLabelText('action.note')
    fireEvent.change(note, { target: { value: 'check with ops' } })
    fireEvent.click(screen.getByRole('button', { name: 'action.save' }))

    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0]?.draft.tags).toEqual(['release'])
    expect(saves[0]?.draft.note).toBe('check with ops')
  })

  it('reads Chat’s own text-interaction surface marker as the open signal', () => {
    expect(isChatSurfaceOpen()).toBe(false)
    const surface = document.createElement('div')
    surface.setAttribute('data-text-interaction-surface', '')
    surface.setAttribute('aria-hidden', 'true')
    document.body.append(surface)
    expect(isChatSurfaceOpen()).toBe(false)
    surface.setAttribute('aria-hidden', 'false')
    expect(isChatSurfaceOpen()).toBe(true)
  })

  it('stands down while Chat’s own text-interaction surface is open', async () => {
    render(renderAffordance())
    const surface = document.createElement('div')
    surface.setAttribute('data-text-interaction-surface', '')
    surface.setAttribute('aria-hidden', 'false')
    document.body.append(surface)
    await waitFor(() => { expect(isChatSurfaceOpen()).toBe(true) })

    selectReplyText()
    openBarByRightClick()
    await new Promise(resolve => { setTimeout(resolve, 60) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('does not resurrect a stale bar when Chat’s surface closes', async () => {
    render(renderAffordance())
    const surface = document.createElement('div')
    surface.setAttribute('data-text-interaction-surface', '')
    surface.setAttribute('aria-hidden', 'false')
    document.body.append(surface)
    selectReplyText()
    openBarByRightClick()
    await new Promise(resolve => { setTimeout(resolve, 60) })
    expect(screen.queryByRole('toolbar')).toBeNull()

    // The platform dismissed its surface (Escape/outside press) over the still
    // live selection: the plugin must not pop up then.
    surface.setAttribute('aria-hidden', 'true')
    await new Promise(resolve => { setTimeout(resolve, 60) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('moves focus into the bar for a keyboard-extended selection', async () => {
    render(renderAffordance())
    selectReplyText()
    openBarByRightClick()
    const toolbar = await screen.findByRole('toolbar')
    expect(toolbar.closest('[data-dshhl-affordance]')?.contains(document.activeElement)).toBe(false)

    // Extend the selection with Shift held, then release it: a keyboard gesture.
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0) throw new Error('fixture selection missing')
    const range = selection.getRangeAt(0)
    const end = range.endContainer
    if (end.nodeType !== Node.TEXT_NODE) throw new Error('fixture text node missing')
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    range.setEnd(end, Math.min((end as Text).data.length, range.endOffset + 1))
    selection.removeAllRanges()
    selection.addRange(range)
    fireEvent.keyUp(document, { key: 'Shift', shiftKey: false })

    await waitFor(() => {
      expect(toolbar.closest('[data-dshhl-affordance]')?.contains(document.activeElement)).toBe(true)
    })
  })

  it('stays hidden when the selection is not assistant reply text', async () => {
    render(renderAffordance())
    const plain = document.createElement('p')
    plain.textContent = 'User message text that is not a selection source.'
    document.body.append(plain)
    const text = plain.firstChild
    if (text === null) throw new Error('fixture text missing')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 4)
    select(range)

    const event = rightClick(plain, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})

describe('SelectionAffordance reveal stand-down', () => {
  it('does not measure or open for a selection while a reveal is in flight', async () => {
    // Fake only the timer APIs the poll/debounce use; keep rAF (bar positioning)
    // and React's scheduler on real time.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    let geometryReads = 0
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => {
        geometryReads += 1
        return [RECT]
      },
    })
    let inFlight = false
    render(renderAffordance(() => inFlight))
    selectReplyText()
    // A keyboard extension is the only selection path that opens the bar.
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0) throw new Error('fixture selection missing')
    const range = selection.getRangeAt(0)
    const end = range.endContainer
    if (end.nodeType !== Node.TEXT_NODE) throw new Error('fixture text node missing')
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    range.setEnd(end, Math.min((end as Text).data.length, range.endOffset + 1))
    selection.removeAllRanges()
    selection.addRange(range)

    inFlight = true
    try {
      expect(inFlight).toBe(true)
      // Releasing Shift while the reveal is pending schedules nothing.
      fireEvent.keyUp(document, { key: 'Shift', shiftKey: false })
      await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      expect(geometryReads, 'a reveal was in flight, so nothing may measure the selection').toBe(0)
      expect(screen.queryByRole('toolbar')).toBeNull()
    } finally {
      inFlight = false
    }
    expect(inFlight).toBe(false)

    // The reveal returned: the ordinary debounce detects the live keyboard selection.
    fireEvent(document, new Event('selectionchange'))
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.getByRole('toolbar')).toBeTruthy()
  })

  it('keeps an open bar through a reveal, then closes it normally once the reveal returns', async () => {
    let inFlight = false
    render(renderAffordance(() => inFlight))
    selectReplyText()
    openBarByRightClick()
    await waitFor(() => expect(screen.getByRole('toolbar')).toBeTruthy())

    inFlight = true
    try {
      // A collapsed selection normally dismisses the bar; mid-reveal it must not.
      window.getSelection()?.removeAllRanges()
      fireEvent(document, new Event('selectionchange'))
      expect(screen.queryByRole('toolbar'), 'the bar must not change while a reveal is in flight').not.toBeNull()
    } finally {
      inFlight = false
    }

    // Reveal over: the same selectionchange behaves normally and dismisses it.
    fireEvent(document, new Event('selectionchange'))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

})

describe('SelectionAffordance right-click gesture', () => {
  it('claims a right-click inside a highlightable selection and anchors the bar to it', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(true)

    const toolbar = await screen.findByRole('toolbar')
    const bar = toolbar.closest('.dshhl-affordance') as HTMLElement
    bar.getBoundingClientRect = () => ({
      width: 300, height: 36, top: 0, bottom: 36, left: 0, right: 300, x: 0, y: 0, toJSON: () => ({}),
    })
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => { setTimeout(resolve, 40) })
    expect(bar.style.visibility).toBe('visible')
    // Below the selection (bottom 140 + gap 8), left-aligned to selection left 40.
    expect(bar.style.top).toBe('148px')
    expect(bar.style.left).toBe('40px')
  })

  it('leaves Shift + right-click to the browser menu', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    const event = rightClick(source, { clientX: 60, clientY: 130, shiftKey: true })
    expect(event.defaultPrevented).toBe(false)
    await new Promise(resolve => { setTimeout(resolve, 40) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('leaves the keyboard context-menu key to the browser menu', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    const event = rightClick(source, { clientX: 0, clientY: 0 })
    expect(event.defaultPrevented).toBe(false)
    await new Promise(resolve => { setTimeout(resolve, 40) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('leaves a right-click outside the selection to the browser menu', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    const event = rightClick(source, { clientX: 400, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    await new Promise(resolve => { setTimeout(resolve, 40) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('leaves a right-click with no selection to the browser menu', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    window.getSelection()?.removeAllRanges()
    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    await new Promise(resolve => { setTimeout(resolve, 40) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('leaves a right-click on a menu-owning target to the browser menu', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    const link = document.createElement('a')
    link.href = '#docs'
    link.textContent = 'docs'
    source.append(link)
    const event = rightClick(link, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    await new Promise(resolve => { setTimeout(resolve, 40) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('leaves a right-click on user-message text to the browser menu', async () => {
    render(renderAffordance())
    const conversation = document.createElement('div')
    conversation.setAttribute('data-conversation-session', 'session-1')
    const node = document.createElement('div')
    node.setAttribute('data-chat-node-key', '4:user3:1')
    const source = document.createElement('div')
    source.setAttribute('data-text-interaction-source', '')
    source.textContent = 'What is the latest?'
    node.append(source)
    conversation.append(node)
    document.body.append(conversation)
    const text = source.firstChild
    if (text === null) throw new Error('fixture text missing')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 4)
    select(range)

    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    await new Promise(resolve => { setTimeout(resolve, 40) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('leaves a right-click on its own bar to the browser menu', async () => {
    render(renderAffordance())
    buildReply()
    openBarByRightClick()
    const swatch = await screen.findByLabelText('color.1')
    const event = rightClick(swatch, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    expect(screen.getByRole('toolbar')).toBeTruthy()
  })

  it('leaves a right-click on its own More menu to the browser menu', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    rightClick(source, { clientX: 60, clientY: 130 })
    await screen.findByRole('toolbar')
    fireEvent.click(screen.getByLabelText('status.menu'))
    const menu = await screen.findByRole('menu')
    const event = rightClick(menu, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
  })

  it('dismisses the bar on a Shift right-press even when contextmenu reports no Shift', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    // Open the bar with a plain right-click first.
    rightClick(source, { clientX: 60, clientY: 130 })
    await screen.findByRole('toolbar')

    // A browser that opens its own menu from the press may deliver no modifier
    // on the contextmenu event: the press itself must dismiss the bar and hand
    // the next contextmenu to the browser.
    fireEvent(source, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, shiftKey: true, clientX: 60, clientY: 130 }))
    await waitFor(() => { expect(screen.queryByRole('toolbar')).toBeNull() })

    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryByRole('toolbar')).toBeNull()

    // The one-shot arm is spent: the next plain right-click claims again.
    const next = rightClick(source, { clientX: 60, clientY: 130 })
    expect(next.defaultPrevented).toBe(true)
    expect(await screen.findByRole('toolbar')).toBeTruthy()
  })

  it('bypasses from the tracked Shift state when a tap-style right-press omits it', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    // Open the bar first, as a previous right-click would.
    rightClick(source, { clientX: 60, clientY: 130 })
    await screen.findByRole('toolbar')

    // A trackpad tap can deliver the press and contextmenu without the modifier.
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    fireEvent(source, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, shiftKey: false, clientX: 60, clientY: 130 }))
    await waitFor(() => { expect(screen.queryByRole('toolbar')).toBeNull() })

    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('bypasses when a tap secondary click only delivers mousedown', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    rightClick(source, { clientX: 60, clientY: 130 })
    await screen.findByRole('toolbar')

    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    fireEvent(source, new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2, shiftKey: false, clientX: 60, clientY: 130 }))
    await waitFor(() => { expect(screen.queryByRole('toolbar')).toBeNull() })

    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('clears the tracked Shift state when another key arrives without Shift', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    // Shift keydown whose keyup is never seen (e.g. consumed by a native menu).
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    fireEvent.keyDown(document, { key: 'a', shiftKey: false })
    fireEvent.keyUp(document, { key: 'a' })

    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(true)
    expect(await screen.findByRole('toolbar')).toBeTruthy()
  })

  it('consumes a tracked Shift press so a swallowed keyup cannot block later right-clicks', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    // Shift keydown whose keyup never reaches the page (native menu consumed it).
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })

    // First right-click is the bypass: not prevented, no bar.
    const first = rightClick(source, { clientX: 60, clientY: 130 })
    expect(first.defaultPrevented).toBe(false)
    expect(screen.queryByRole('toolbar')).toBeNull()

    // The track was consumed: the next plain right-click claims again.
    const second = rightClick(source, { clientX: 60, clientY: 130 })
    expect(second.defaultPrevented).toBe(true)
    expect(await screen.findByRole('toolbar')).toBeTruthy()
  })

  it('reconciles a tracked Shift press on the next primary click without Shift', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    // A trusted primary click reads the physical modifier: no Shift, so the
    // tracked bypass must drop even if the Shift keyup was lost.
    fireEvent(source, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, shiftKey: false, clientX: 60, clientY: 130 }))

    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(true)
    expect(await screen.findByRole('toolbar')).toBeTruthy()
  })

  it('expires a tracked Shift press that never reports a keyup', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      render(renderAffordance())
      const { source } = buildReply()
      fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
      await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
      const event = rightClick(source, { clientX: 60, clientY: 130 })
      expect(event.defaultPrevented).toBe(true)
      expect(screen.getByRole('toolbar')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('claims again after Shift is released, when the modifier is reported', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    fireEvent.keyUp(document, { key: 'Shift', shiftKey: false })

    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(true)
    expect(await screen.findByRole('toolbar')).toBeTruthy()
  })

  it('dismisses the bar when the window loses focus', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    rightClick(source, { clientX: 60, clientY: 130 })
    expect(await screen.findByRole('toolbar')).toBeTruthy()

    fireEvent(window, new Event('blur'))
    await waitFor(() => { expect(screen.queryByRole('toolbar')).toBeNull() })
  })

  it('does not show a second bar from a right-button pointerup', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    rightClick(source, { clientX: 60, clientY: 130 })
    await screen.findByRole('toolbar')
    fireEvent(document, new MouseEvent('pointerup', { bubbles: true, button: 2 }))
    await new Promise(resolve => { setTimeout(resolve, 40) })
    expect(screen.getAllByRole('toolbar')).toHaveLength(1)
  })
})

describe('SelectionAffordance Shift release', () => {
  /**
   * Recreate the real pre-gesture state: a live selection exists while Chat's
   * own Quote surface owns the floating seat, and the right-press that starts
   * the gesture dismisses that surface. The plugin bar therefore stands down
   * before the Shift interaction begins.
   * @returns the selected reply source.
   */
  async function selectUnderChatSurface(): Promise<HTMLElement> {
    const surface = document.createElement('div')
    surface.setAttribute('data-text-interaction-surface', '')
    surface.setAttribute('aria-hidden', 'false')
    document.body.append(surface)
    const { source } = buildReply()
    await new Promise(resolve => { setTimeout(resolve, 200) })
    expect(screen.queryByRole('toolbar')).toBeNull()
    surface.setAttribute('aria-hidden', 'true')
    await new Promise(resolve => { setTimeout(resolve, 40) })
    return source
  }

  it('does not surface the bar from a Shift release that changed nothing', async () => {
    render(renderAffordance())
    await selectUnderChatSurface()
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    fireEvent.keyUp(document, { key: 'Shift', shiftKey: false })
    await new Promise(resolve => { setTimeout(resolve, 250) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('keeps the bar closed after a Shift + right-click hand-back', async () => {
    render(renderAffordance())
    const source = await selectUnderChatSurface()
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    const event = rightClick(source, { clientX: 60, clientY: 130, shiftKey: true })
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryByRole('toolbar')).toBeNull()

    // Releasing Shift afterwards must not resurrect the bar the hand-back avoided.
    fireEvent.keyUp(document, { key: 'Shift', shiftKey: false })
    await new Promise(resolve => { setTimeout(resolve, 250) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('dismisses an open editor instead of replacing it on a plain right-click', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    rightClick(source, { clientX: 60, clientY: 130 })
    await screen.findByRole('toolbar')
    fireEvent.click(await screen.findByRole('button', { name: 'action.annotate' }))
    expect(await screen.findByRole('button', { name: 'action.save' })).toBeTruthy()

    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'action.save' })).toBeNull() })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('dismisses an open bar on a Shift + right-click even while it holds focus', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    // Open the bar, then move focus inside it, as the editor/swatch interaction does.
    rightClick(source, { clientX: 60, clientY: 130 })
    await screen.findByRole('toolbar')
    fireEvent.click(screen.getByLabelText('status.menu'))
    const menu = await screen.findByRole('menu')
    expect(menu).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    const swatch = screen.getByLabelText('color.1')
    ;(swatch as HTMLElement).focus()

    const event = rightClick(source, { clientX: 60, clientY: 130, shiftKey: true })
    expect(event.defaultPrevented).toBe(false)
    await waitFor(() => { expect(screen.queryByRole('toolbar')).toBeNull() })
  })

  it('still captures a selection the Shift press actually extended', async () => {
    render(renderAffordance())
    await selectUnderChatSurface()
    // Extend the selection while Shift is held, as Shift+Arrow would.
    const text = document.querySelector('[data-text-interaction-source]')?.firstChild
    if (text === null || text === undefined) throw new Error('fixture text missing')
    const range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, 27)
    select(range)
    fireEvent(document, new Event('selectionchange'))
    fireEvent.keyUp(document, { key: 'Shift', shiftKey: false })

    const toolbar = await screen.findByRole('toolbar')
    await waitFor(() => {
      expect(toolbar.closest('[data-dshhl-affordance]')?.contains(document.activeElement)).toBe(true)
    })
  })
})

describe('SelectionAffordance right-click menu', () => {
  it('offers Copy selection and Browser menu', async () => {
    render(renderAffordance())
    buildReply()
    openBarByRightClick()
    await screen.findByRole('toolbar')
    fireEvent.click(screen.getByLabelText('status.menu'))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'action.copySelection' })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: 'action.browserMenu' })).toBeTruthy()
  })

  it('copies the selected quote and keeps the bar open', async () => {
    render(renderAffordance())
    buildReply()
    openBarByRightClick()
    await screen.findByRole('toolbar')
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'action.copySelection' }))
    await waitFor(() => { expect(copied).toEqual(['migration must la']) })
    expect(announced).toEqual([])
    expect(screen.getByRole('toolbar')).toBeTruthy()
  })

  it('copies the whole selection even past the stored-quote cap', async () => {
    render(renderAffordance())
    const long = 'a'.repeat(2400)
    const { source } = buildReply(long)
    const text = source.firstChild
    if (text === null) throw new Error('fixture text missing')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 2400)
    select(range)

    rightClick(source, { clientX: 60, clientY: 130 })
    await screen.findByRole('toolbar')
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'action.copySelection' }))
    await waitFor(() => { expect(copied).toHaveLength(1) })
    // The anchor quote is capped for storage; a copy must carry the selection.
    expect(copied[0]).toHaveLength(2400)
  })

  it('reports a refused copy without closing the bar', async () => {
    copySucceeds = false
    render(renderAffordance())
    buildReply()
    openBarByRightClick()
    await screen.findByRole('toolbar')
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'action.copySelection' }))
    await waitFor(() => { expect(announced).toEqual(['action.copyFailed']) })
    expect(screen.getByRole('toolbar')).toBeTruthy()
  })

  it('hands the next right-click back to the browser from Browser menu', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    openBarByRightClick()
    await screen.findByRole('toolbar')
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'action.browserMenu' }))
    expect(announced).toEqual(['hint.browserMenuPending'])
    await waitFor(() => { expect(screen.queryByRole('toolbar')).toBeNull() })

    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('keeps the bar for the Escape that closes the menu, and closes it on the next one', async () => {
    render(renderAffordance())
    buildReply()
    openBarByRightClick()
    await screen.findByRole('toolbar')
    fireEvent.click(screen.getByLabelText('status.menu'))
    await screen.findByRole('menu')

    // The menu is a layer above the bar: the first Escape belongs to it.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('toolbar')).toBeTruthy()

    // The stand-in menu has no keyboard handling, so close it the way the
    // primitive's owner does before the next Escape.
    fireEvent.click(screen.getByLabelText('status.menu'))
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull() })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('toolbar')).toBeNull() })
  })
})

describe('SelectionAffordance gesture ownership', () => {
  it('cancels a pending detection when Shift+right-click hands the gesture back', async () => {
    render(renderAffordance())
    const { source } = buildReply()
    // The programmatic selection schedules the 140 ms selectionchange capture.
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    const event = rightClick(source, { clientX: 60, clientY: 130, shiftKey: true })
    expect(event.defaultPrevented).toBe(false)

    // The queued capture must not resurrect the bar beside the browser menu.
    await new Promise(resolve => { setTimeout(resolve, 320) })
    expect(screen.queryByRole('toolbar')).toBeNull()

    // Releasing Shift hands the state back; a later primary right-click claims.
    fireEvent.keyUp(document, { key: 'Shift', shiftKey: false })
    const next = rightClick(source, { clientX: 60, clientY: 130 })
    expect(next.defaultPrevented).toBe(true)
    expect(await screen.findByRole('toolbar')).toBeTruthy()
  })

  it('renders nothing and drops the candidate when the conversation is hidden', async () => {
    const view = render(renderAffordance())
    const { source } = buildReply()
    rightClick(source, { clientX: 60, clientY: 130 })
    expect(await screen.findByRole('toolbar')).toBeTruthy()

    view.rerender(renderAffordance(undefined, false))
    await waitFor(() => { expect(screen.queryByRole('toolbar')).toBeNull() })
  })

  it('still claims for a rendered conversation when the visibility signal is false', async () => {
    // Cold load measured `visible=false` while the transcript was rendered; the
    // gesture layer must not be gated on that signal.
    render(renderAffordance(undefined, false))
    const { source } = buildReply()
    const event = rightClick(source, { clientX: 60, clientY: 130 })
    expect(event.defaultPrevented).toBe(true)
    expect(await screen.findByRole('toolbar')).toBeTruthy()
  })

  it('dismisses the bar when the conversation stops being rendered', async () => {
    render(renderAffordance())
    const { conversation, source } = buildReply()
    rightClick(source, { clientX: 60, clientY: 130 })
    expect(await screen.findByRole('toolbar')).toBeTruthy()

    // The keep-alive shape: the conversation stays mounted but is hidden when a
    // global page opens. No visibility prop change and no scroll event.
    conversation.style.display = 'none'
    await waitFor(() => { expect(screen.queryByRole('toolbar')).toBeNull() })
  })

  it('never draws another session’s pending candidate', async () => {
    const gesture = createSelectionGesture({ revealPending: () => false })
    gesture.dispatch({
      type: 'input',
      candidate: {
        nodeKey: '14:assistant-step4:2',
        sourceIndex: 0,
        kind: 'text',
        range: document.createRange(),
        sessionId: 'session-1',
        anchor: {
          nodeKey: '14:assistant-step4:2',
          kind: 'text',
          sourceIndex: 0,
          quote: 'migration must la',
          prefix: '',
          suffix: '',
          start: 4,
          end: 21,
          projection: 1,
        },
      },
    })
    render(renderAffordance(undefined, true, gesture, 'session-2'))
    await new Promise(resolve => { setTimeout(resolve, 40) })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('registers its document listeners exactly once across parent re-renders', async () => {
    const add = vi.spyOn(document, 'addEventListener')
    const view = render(renderAffordance(() => false))
    const countFor = (type: string, capture = true): number => add.mock.calls
      .filter(([event, , options]) => event === type && (options === true || (typeof options === 'object' && options?.capture === true)) === capture)
      .length
    expect(countFor('contextmenu')).toBe(1)
    expect(countFor('pointerdown')).toBe(2)
    expect(countFor('mousedown')).toBe(1)

    // A new revealPending identity from the parent must not re-register the set.
    view.rerender(renderAffordance(() => false))
    expect(countFor('contextmenu')).toBe(1)
    expect(countFor('pointerdown')).toBe(2)
    expect(countFor('mousedown')).toBe(1)
    add.mockRestore()
  })
})
