// @vitest-environment jsdom
/**
 * Seat resolution tests.
 *
 * Chat renders a settled assistant step with reasoning as two rows that share
 * one `data-chat-node-key`. A plain node-key query returns the reasoning row
 * first, which is why every anchor/reveal path must go through this helper.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findNodeSeat, findNodeSeats } from '../../../src/client/anchor/seat'
import { NODE_KEY, appendConversation, appendSeat } from './fixtures'

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('findNodeSeats', () => {
  it('returns both seats for one key in DOM order', () => {
    const reasoning = appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    const response = appendSeat(document.body, { groupPart: 'response' })
    const seats = findNodeSeats(NODE_KEY)
    expect(seats).toHaveLength(2)
    expect(seats[0]).toBe(reasoning.seat)
    expect(seats[1]).toBe(response.seat)
  })

  it('ignores other node keys', () => {
    appendSeat(document.body, { groupPart: 'response' })
    expect(findNodeSeats('14:assistant-step5:1')).toHaveLength(0)
  })

  it('finds seats only inside the given scope', () => {
    const first = appendConversation('session-1')
    appendSeat(first.scroll, { groupPart: 'response' })
    const second = appendConversation('session-2')
    const other = appendSeat(second.scroll, { groupPart: 'response' })
    expect(findNodeSeats(NODE_KEY).length).toBe(2)
    expect(findNodeSeats(NODE_KEY, second.scroll)).toEqual([other.seat])
  })
})

describe('findNodeSeat', () => {
  it('prefers the response seat even though the reasoning seat is first in the DOM', () => {
    appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    const response = appendSeat(document.body, { groupPart: 'response' })
    expect(findNodeSeat(NODE_KEY)).toBe(response.seat)
  })

  it('prefers the data-chat-anchor-key match over DOM order when group parts are absent', () => {
    const staleFirst = appendSeat(document.body, { anchorKey: JSON.stringify([NODE_KEY, 'reasoning']) })
    const response = appendSeat(document.body, { anchorKey: NODE_KEY })
    expect(findNodeSeat(NODE_KEY)).toBe(response.seat)
    expect(staleFirst.seat).not.toBe(response.seat)
  })

  it('honours a recorded reasoning group part when that seat is present', () => {
    const reasoning = appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    appendSeat(document.body, { groupPart: 'response' })
    expect(findNodeSeat(NODE_KEY, 'reasoning')).toBe(reasoning.seat)
  })

  it('falls back to the response row when the recorded group part is gone (mode change)', () => {
    const flat = appendSeat(document.body, { anchorKey: NODE_KEY })
    expect(findNodeSeat(NODE_KEY, 'reasoning')).toBe(flat.seat)
  })

  it('returns a flat single seat without group part or anchor key', () => {
    const flat = appendSeat(document.body, { anchorKey: null })
    expect(findNodeSeat(NODE_KEY)).toBe(flat.seat)
  })

  it('returns null when the node renders only its reasoning row', () => {
    appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    expect(findNodeSeat(NODE_KEY)).toBeNull()
  })

  it('returns null when nothing matches', () => {
    appendSeat(document.body, { groupPart: 'response', nodeKey: '14:assistant-step5:1' })
    expect(findNodeSeat(NODE_KEY)).toBeNull()
    expect(findNodeSeat(NODE_KEY, 'response', document.body)).toBeNull()
  })

  it('respects the scope of one conversation', () => {
    const first = appendConversation('session-1')
    const firstSeat = appendSeat(first.scroll, { groupPart: 'response', text: 'first session text' })
    const second = appendConversation('session-2')
    const secondSeat = appendSeat(second.scroll, { groupPart: 'response', text: 'second session text' })
    expect(findNodeSeat(NODE_KEY, undefined, first.scroll)).toBe(firstSeat.seat)
    expect(findNodeSeat(NODE_KEY, undefined, second.scroll)).toBe(secondSeat.seat)
  })

  it('escapes selector metacharacters in the node key', () => {
    const key = 'odd"key\\with:chars'
    const seat = appendSeat(document.body, { groupPart: 'response', nodeKey: key })
    expect(findNodeSeat(key)).toBe(seat.seat)
  })
})
