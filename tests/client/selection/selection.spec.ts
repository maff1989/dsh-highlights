// @vitest-environment jsdom
/**
 * Phase-5 selection plane: reducer (one dismissal rule), gesture quiescence,
 * shared positioner (diffed writes) and focus contract.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SelectionCandidateLike } from '../../../src/client/contracts/selection'
import { createFloatingPositioner } from '../../../src/client/selection/placement'
import { captureFocus, trapFocus } from '../../../src/client/selection/focus'
import { createSelectionGesture } from '../../../src/client/selection/gesture'
import { IDLE_SELECTION, reduceSelection } from '../../../src/client/selection/reducer'
import type { ConversationBounds } from '../../../src/client/selection/bounds'

/** A candidate with a throwaway range. */
function candidate(nodeKey = '9:assistant1:1'): SelectionCandidateLike {
  return { nodeKey, sourceIndex: 0, kind: 'text', range: document.createRange() }
}

/** A plain rect usable by the positioner. */
function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return { left, top, right, bottom, width: right - left, height: bottom - top } as DOMRect
}

const BOUNDS: ConversationBounds = { left: 0, right: 800, top: 0, bottom: 600 }

afterEach(() => {
  document.body.replaceChildren()
})

describe('selection reducer', () => {
  it('has one dismissal rule and a new input supersedes it', () => {
    const pending = reduceSelection(IDLE_SELECTION, { type: 'input', candidate: candidate() })
    expect(pending.phase).toBe('pending')
    const edited = reduceSelection(pending, { type: 'draft', draft: { colorId: 2, tags: [], note: undefined, starred: false } })
    expect(edited.phase).toBe('editing')
    const dismissed = reduceSelection(edited, { type: 'dismiss', reason: 'outside-press' })
    expect(dismissed).toEqual({ candidate: null, draft: null, phase: 'dismissed' })
    expect(reduceSelection(dismissed, { type: 'input', candidate: candidate('other') }).candidate?.nodeKey).toBe('other')
  })

  it('ignores input while a reveal is in flight', () => {
    const state = reduceSelection(IDLE_SELECTION, { type: 'input', candidate: candidate() }, { revealPending: true })
    expect(state).toBe(IDLE_SELECTION)
  })
})

describe('selection gesture', () => {
  it('reads reveal quiescence at dispatch time and exposes one state signal', () => {
    let pending = false
    const gesture = createSelectionGesture({ revealPending: () => pending })
    gesture.dispatch({ type: 'input', candidate: candidate() })
    expect(gesture.state.get().phase).toBe('pending')
    gesture.dismiss('escape')
    expect(gesture.state.get().phase).toBe('dismissed')
    pending = true
    gesture.dispatch({ type: 'input', candidate: candidate() })
    expect(gesture.state.get().phase).toBe('dismissed')
  })
})

describe('shared floating positioner', () => {
  it('writes on first placement and skips an unchanged second placement', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const positioner = createFloatingPositioner()
    const writes: string[] = []
    positioner.setWriteListener((_element, property) => writes.push(property))
    const request = { element, rects: [rect(100, 100, 200, 120)], bounds: BOUNDS, width: 210, height: 34 }
    positioner.place(request)
    const first = writes.length
    expect(first).toBeGreaterThan(0)
    positioner.place(request)
    expect(writes.length).toBe(first)
    positioner.place({ ...request, rects: [rect(120, 300, 220, 320)] })
    expect(writes.length).toBeGreaterThan(first)
  })
})

describe('focus contract', () => {
  it('traps Tab inside the container and routes Escape', () => {
    const container = document.createElement('div')
    const first = document.createElement('button')
    const last = document.createElement('button')
    container.append(first, last)
    document.body.append(container)
    const onEscape = vi.fn()
    const dispose = trapFocus(container, { onEscape })
    last.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    last.dispatchEvent(tab)
    expect(document.activeElement).toBe(first)
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onEscape).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('returns focus to the element that had it', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const restore = captureFocus(document)
    const other = document.createElement('button')
    document.body.append(other)
    other.focus()
    expect(document.activeElement).toBe(other)
    restore()
    expect(document.activeElement).toBe(trigger)
  })
})
