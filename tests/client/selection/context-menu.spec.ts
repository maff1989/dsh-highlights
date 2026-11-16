// @vitest-environment jsdom
/**
 * Right-click admission rules: which contextmenu gestures belong to the plugin.
 *
 * The component owns the gesture, so these predicates decide when the browser
 * menu is replaced by the selection-anchored bar and when it is left alone.
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  AFFORDANCE_MENU_CLASS,
  CONTEXT_MENU_BLOCKED_SELECTOR,
  contextMenuSource,
  isKeyboardContextMenu,
  isNativeMenuGesture,
  pointInsideRange,
  selectionIsVisible,
} from '../../../src/client/selection/context-menu'

/** A viewport rectangle (jsdom reports none by default). */
const RECT = { width: 120, height: 20, top: 120, bottom: 140, left: 40, right: 160, x: 40, y: 120 }

/** Override the range geometry for one test. */
function withRects(rects: readonly (typeof RECT)[]): void {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => rects,
  })
}

/** One contextmenu event at viewport coordinates. */
function contextMenuEvent(options: { readonly clientX?: number; readonly clientY?: number; readonly shiftKey?: boolean } = {}): MouseEvent {
  return new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 60,
    clientY: options.clientY ?? 130,
    ...(options.shiftKey === true ? { shiftKey: true } : {}),
  })
}

/** One assistant reply source inside a session-scoped conversation. */
function buildSource(sessionId = 'session-1'): HTMLElement {
  const conversation = document.createElement('div')
  conversation.setAttribute('data-conversation-session', sessionId)
  const node = document.createElement('div')
  node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
  const source = document.createElement('div')
  source.setAttribute('data-text-interaction-source', '')
  source.textContent = 'The migration must land before the release.'
  node.append(source)
  conversation.append(node)
  document.body.append(conversation)
  return source
}

/** A live selection over part of one source. */
function selectIn(source: HTMLElement): Range {
  const text = source.firstChild
  if (text === null) throw new Error('fixture text missing')
  const range = document.createRange()
  range.setStart(text, 4)
  range.setEnd(text, 21)
  const selection = window.getSelection()
  if (selection === null) throw new Error('jsdom selection missing')
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

afterEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects
})

describe('context-menu predicates', () => {
  it('blocks targets that own their own menu', () => {
    for (const selector of ['a[href]', '[data-context-menu-trigger]', 'button', 'input', 'select', 'textarea', '[contenteditable="true"]', '[data-text-interaction-exclude]']) {
      expect(CONTEXT_MENU_BLOCKED_SELECTOR.split(', ')).toContain(selector)
    }
    expect(CONTEXT_MENU_BLOCKED_SELECTOR).toContain(`.${AFFORDANCE_MENU_CLASS}`)
  })

  it('recognizes the keyboard context-menu key from its origin', () => {
    expect(isKeyboardContextMenu(contextMenuEvent({ clientX: 0, clientY: 0 }))).toBe(true)
    expect(isKeyboardContextMenu(contextMenuEvent())).toBe(false)
  })

  it('treats Shift as the browser-menu bypass and nothing else', () => {
    expect(isNativeMenuGesture(contextMenuEvent({ shiftKey: true }))).toBe(true)
    expect(isNativeMenuGesture(contextMenuEvent())).toBe(false)
  })

  it('accepts the leading between two selected lines but not outside the range', () => {
    // 16 px line boxes on a 24 px pitch: dy 1..7 below a box is the line gap.
    withRects([
      { ...RECT, top: 120, bottom: 136 },
      { ...RECT, top: 144, bottom: 160 },
    ])
    const source = buildSource()
    const range = selectIn(source)
    expect(pointInsideRange(range, 60, 136)).toBe(true)
    for (const y of [137, 140, 144, 160]) expect(pointInsideRange(range, 60, y), `y=${String(y)}`).toBe(true)
    // Outside the whole range's vertical span stays strict.
    expect(pointInsideRange(range, 60, 112)).toBe(false)
    expect(pointInsideRange(range, 60, 168)).toBe(false)
    // Outside a line horizontally stays strict.
    expect(pointInsideRange(range, 20, 140)).toBe(false)
  })

  it('hit-tests the point against the range line boxes', () => {
    withRects([RECT])
    const source = buildSource()
    const range = selectIn(source)
    expect(pointInsideRange(range, 60, 130)).toBe(true)
    expect(pointInsideRange(range, 20, 130)).toBe(false)
    expect(pointInsideRange(range, 60, 10)).toBe(false)
  })

  it('resolves the source for this session only', () => {
    const source = buildSource()
    const event = contextMenuEvent()
    source.dispatchEvent(event)
    expect(contextMenuSource(event, 'session-1')).toBe(source)
    expect(contextMenuSource(event, 'session-2')).toBeNull()
  })

  it('leaves menu-owning targets and non-source text to the browser', () => {
    const source = buildSource()
    const link = document.createElement('a')
    link.href = '#docs'
    link.textContent = 'docs'
    source.append(link)
    const linkEvent = contextMenuEvent()
    link.dispatchEvent(linkEvent)
    expect(contextMenuSource(linkEvent, 'session-1')).toBeNull()

    const plain = document.createElement('p')
    plain.textContent = 'not a source'
    document.body.append(plain)
    const plainEvent = contextMenuEvent()
    plain.dispatchEvent(plainEvent)
    expect(contextMenuSource(plainEvent, 'session-1')).toBeNull()
  })

  it('reports whether the selection is inside the visible transcript', () => {
    const source = buildSource()
    const range = selectIn(source)
    withRects([RECT])
    expect(selectionIsVisible(range)).toBe(true)
    // Scrolled above the viewport: the bar could only hide, so the menu stays the browser's.
    withRects([{ ...RECT, top: -80, bottom: -60 }])
    expect(selectionIsVisible(range)).toBe(false)
  })
})
