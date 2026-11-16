// @vitest-environment jsdom
/**
 * Anchor resolution tests.
 *
 * These pin the P0-1 behaviour: a text anchor captured from the response row of
 * a split assistant step must resolve against that row, never against the
 * reasoning row that shares its `data-chat-node-key`; resolution must be
 * scopeable so a colliding key in another session cannot win.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveAll, resolveRecord } from '../../../src/client/anchor/resolve'
import {
  NODE_KEY,
  QUOTE,
  QUOTE_END,
  QUOTE_START,
  RESPONSE_TEXT,
  appendConversation,
  appendSeat,
  makeRecord,
} from './fixtures'

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

/** The seat a resolved range starts inside. */
function seatOfRange(range: Range): HTMLElement | null {
  const container = range.startContainer
  return (container.nodeType === 1 ? container as HTMLElement : container.parentElement)
    ?.closest<HTMLElement>('[data-chat-node-key]') ?? null
}

/** The text the resolved range covers. */
function textOfRange(range: Range): string {
  return String(range.startContainer.textContent).slice(range.startOffset, range.endOffset)
}

/** A host exposing `querySelectorAll`, so the Element/Document prototypes can be wrapped. */
interface QueryHost {
  querySelectorAll(selector: string): NodeListOf<Element>
}

/** The `querySelectorAll` calls recorded by {@link instrumentQueries}. */
interface QueryLog {
  readonly selectors: string[]
  reset(): void
  restore(): void
}

/**
 * Record every `querySelectorAll` call made through the Element and Document
 * prototypes.
 *
 * A resolve pass runs several unrelated selector scans (reply sources, the
 * conversation root); the seat-index assertion counts only the ones that look
 * up Chat's node keys, so the test pins "one node-key walk per pass" without
 * forbidding the legitimately per-node source queries.
 * @returns the log plus teardown; call `restore()` before the test ends.
 */
function instrumentQueries(): QueryLog {
  const selectors: string[] = []
  const undo: (() => void)[] = []
  const wrap = (host: QueryHost): void => {
    const original = host.querySelectorAll
    host.querySelectorAll = function (this: QueryHost, selector: string): NodeListOf<Element> {
      selectors.push(selector)
      return original.call(this, selector)
    }
    undo.push(() => { host.querySelectorAll = original })
  }
  wrap(Element.prototype as unknown as QueryHost)
  wrap(Document.prototype as unknown as QueryHost)
  return {
    selectors,
    reset: () => { selectors.length = 0 },
    restore: () => {
      while (undo.length > 0) undo.pop()?.()
    },
  }
}


describe('resolveRecord on a split assistant step', () => {
  it('resolves a text anchor against the response seat, not the reasoning seat', () => {
    appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    const response = appendSeat(document.body, { groupPart: 'response' })

    const resolution = resolveRecord(makeRecord({ groupPart: 'response' }))
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) throw new Error('expected resolution')
    expect(seatOfRange(resolution.range)).toBe(response.seat)
    expect(textOfRange(resolution.range)).toBe(QUOTE)
  })

  it('resolves an old record with no group part against the response seat', () => {
    appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    const response = appendSeat(document.body, { groupPart: 'response' })

    const resolution = resolveRecord(makeRecord())
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) throw new Error('expected resolution')
    expect(seatOfRange(resolution.range)).toBe(response.seat)
  })

  it('resolves when the transcript is flat and the recorded group part is stale', () => {
    const flat = appendSeat(document.body, { anchorKey: NODE_KEY })
    const resolution = resolveRecord(makeRecord({ groupPart: 'reasoning' }))
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) throw new Error('expected resolution')
    expect(seatOfRange(resolution.range)).toBe(flat.seat)
  })

  it('resolves sourceIndex inside the response seat when the step has several text blocks', () => {
    appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    const response = appendSeat(document.body, { groupPart: 'response' })
    const firstText = 'The migration must land before the release.'
    // appendSeat already rendered the default text as the first source; add a second.
    const secondSource = document.createElement('div')
    secondSource.setAttribute('data-text-interaction-source', '')
    secondSource.textContent = 'Second block: roll back if the deploy fails.'
    response.seat.append(secondSource)

    const resolution = resolveRecord(makeRecord({
      groupPart: 'response',
      sourceIndex: 1,
      text: 'Second block: roll back if the deploy fails.',
      start: 0,
      end: 10,
    }))
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) throw new Error('expected resolution')
    expect(textOfRange(resolution.range)).toBe('Second blo')
    expect(firstText.length).toBeGreaterThan(0)
  })
})

describe('resolveRecord stale reasons', () => {
  it('reports node-absent when no seat for the node is rendered', () => {
    const resolution = resolveRecord(makeRecord())
    expect(resolution).toEqual({ ok: false, reason: 'node-absent' })
  })

  it('reports source-absent when only the reasoning row is rendered', () => {
    appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    const resolution = resolveRecord(makeRecord())
    expect(resolution).toEqual({ ok: false, reason: 'source-absent' })
  })

  it('reports text-mismatch when the response text no longer contains the quote', () => {
    appendSeat(document.body, { groupPart: 'response', text: 'A completely different reply about packaging.' })
    const resolution = resolveRecord(makeRecord({ groupPart: 'response' }))
    expect(resolution.ok).toBe(false)
  })
})

describe('resolution scope', () => {
  it('resolves against the scoped conversation when two sessions render the same node key', () => {
    const first = appendConversation('session-first')
    appendSeat(first.scroll, { groupPart: 'response', text: 'First session still shows the same quote here.' })
    const second = appendConversation('session-second')
    const secondSeat = appendSeat(second.scroll, { groupPart: 'response', text: RESPONSE_TEXT })

    const record = makeRecord({ sessionId: 'session-second', groupPart: 'response' })
    const scoped = resolveRecord(record, second.scroll)
    expect(scoped.ok).toBe(true)
    if (!scoped.ok) throw new Error('expected resolution')
    expect(seatOfRange(scoped.range)).toBe(secondSeat.seat)

    // The first session's DOM does not contain the recorded quote, so the
    // unscoped document search must not silently pick it either.
    const other = resolveRecord(record, first.scroll)
    expect(other.ok).toBe(false)
  })

  it('resolveAll maps ranges and stale ids within the given scope', () => {
    const first = appendConversation('session-first')
    appendSeat(first.scroll, { groupPart: 'response', text: 'First session still shows the same quote here.' })
    const second = appendConversation('session-second')
    appendSeat(second.scroll, { groupPart: 'response', text: RESPONSE_TEXT })

    const resolvedRecord = makeRecord({ id: '00000000-0000-4000-8000-00000000000a', sessionId: 'session-second', groupPart: 'response' })
    const staleRecord = makeRecord({ id: '00000000-0000-4000-8000-00000000000b', sessionId: 'session-second', groupPart: 'response', quote: 'not in this reply' })

    const scoped = resolveAll([resolvedRecord, staleRecord], second.scroll)
    expect(scoped.ranges.has(resolvedRecord.id)).toBe(true)
    expect(scoped.stale.get(staleRecord.id)).toBe('text-mismatch')

    const wrongScope = resolveAll([resolvedRecord], first.scroll)
    expect(wrongScope.ranges.size).toBe(0)
    expect(wrongScope.stale.has(resolvedRecord.id)).toBe(true)
  })

  it('resolveRecord defaults to the document', () => {
    const conversation = appendConversation('session-a')
    appendSeat(conversation.scroll, { groupPart: 'response' })
    const resolution = resolveRecord(makeRecord())
    expect(resolution.ok).toBe(true)
  })
})

describe('resolveAll seat indexing', () => {
  it('resolves a whole record set from one node-key DOM walk', () => {
    const conversation = appendConversation('session-a')
    const SPLIT_KEY = '14:assistant-step4:2'
    const FLAT_KEY = '14:assistant-step5:1'
    const REASONING_ONLY_KEY = '14:assistant-step6:1'
    const ABSENT_KEY = '14:assistant-step9:9'

    // A split step (reasoning row first, response row second), a flat row, and a
    // step rendered only as reasoning: the three shapes seat resolution handles.
    appendSeat(conversation.scroll, { nodeKey: SPLIT_KEY, groupPart: 'reasoning', thinking: true })
    const response = appendSeat(conversation.scroll, { nodeKey: SPLIT_KEY, groupPart: 'response' })
    const flat = appendSeat(conversation.scroll, { nodeKey: FLAT_KEY, anchorKey: FLAT_KEY })
    appendSeat(conversation.scroll, { nodeKey: REASONING_ONLY_KEY, groupPart: 'reasoning', thinking: true })

    const splitRecord = makeRecord({ id: '00000000-0000-4000-8000-00000000000a', sessionId: 'session-a', nodeKey: SPLIT_KEY, groupPart: 'response' })
    const flatRecord = makeRecord({ id: '00000000-0000-4000-8000-00000000000b', sessionId: 'session-a', nodeKey: FLAT_KEY })
    const reasoningOnly = makeRecord({ id: '00000000-0000-4000-8000-00000000000c', sessionId: 'session-a', nodeKey: REASONING_ONLY_KEY, groupPart: 'response' })
    const absent = makeRecord({ id: '00000000-0000-4000-8000-00000000000d', sessionId: 'session-a', nodeKey: ABSENT_KEY, groupPart: 'response' })
    const records = [splitRecord, flatRecord, reasoningOnly, absent]

    const queries = instrumentQueries()
    try {
      const { ranges, stale } = resolveAll(records, conversation.scroll)

      // The whole pass must resolve every record from one seat index: one
      // `[data-chat-node-key]` selector call, not one scan per record (nor an
      // extra one to classify each absent node).
      const nodeKeyQueries = queries.selectors.filter(selector => selector.includes('data-chat-node-key'))
      expect(
        nodeKeyQueries,
        `resolveAll ran ${String(nodeKeyQueries.length)} node-key scans for ${String(records.length)} records: ${nodeKeyQueries.join(' | ')}`,
      ).toHaveLength(1)

      // Behaviour is unchanged: split steps resolve against the response row.
      const splitRange = ranges.get(splitRecord.id)
      expect(splitRange, 'the split-step record must resolve').toBeDefined()
      if (splitRange === undefined) throw new Error('expected split record resolution')
      expect(seatOfRange(splitRange)).toBe(response.seat)
      expect(textOfRange(splitRange)).toBe(QUOTE)

      const flatRange = ranges.get(flatRecord.id)
      expect(flatRange, 'the flat record must resolve').toBeDefined()
      if (flatRange === undefined) throw new Error('expected flat record resolution')
      expect(seatOfRange(flatRange)).toBe(flat.seat)

      // Stale reasons stay distinct without a fallback scan per record.
      expect(stale.get(reasoningOnly.id)).toBe('source-absent')
      expect(stale.get(absent.id)).toBe('node-absent')
    } finally {
      queries.restore()
    }
  })
})

describe('message anchors', () => {
  it('resolves a whole-response mark against the response seat', () => {
    appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    const response = appendSeat(document.body, { groupPart: 'response' })
    const resolution = resolveRecord(makeRecord({
      kind: 'message',
      groupPart: 'response',
      text: RESPONSE_TEXT,
      start: 0,
      end: RESPONSE_TEXT.length,
      quote: RESPONSE_TEXT,
    }))
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) throw new Error('expected resolution')
    expect(seatOfRange(resolution.range)).toBe(response.seat)
    expect(textOfRange(resolution.range)).toBe(RESPONSE_TEXT)
  })

  it('does not resolve a whole-response mark when only the reasoning row exists', () => {
    appendSeat(document.body, { groupPart: 'reasoning', thinking: true })
    const resolution = resolveRecord(makeRecord({
      kind: 'message',
      groupPart: 'response',
      text: RESPONSE_TEXT,
      start: 0,
      end: RESPONSE_TEXT.length,
      quote: RESPONSE_TEXT,
    }))
    expect(resolution).toEqual({ ok: false, reason: 'source-absent' })
  })
})

describe('offset constants', () => {
  it('keeps the fixture quote aligned with the fixture offsets', () => {
    expect(RESPONSE_TEXT.slice(QUOTE_START, QUOTE_END)).toBe(QUOTE)
    expect(NODE_KEY).toBe('14:assistant-step4:2')
  })
})
