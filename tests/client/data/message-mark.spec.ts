// @vitest-environment jsdom
/**
 * Whole-message marks (P0-1 support): resolve the response seat (never the
 * reasoning seat sharing the node key), create once per session+node, and
 * report whether the call created anything.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

import { HighlightsActionsImpl, type ActionsDeps } from '../../../src/client/data/actions-impl'
import { HighlightsClient } from '../../../src/client/data/client'
import type { HighlightsTransport } from '../../../src/client/data/transport'
import { InsertService } from '../../../src/client/services/insert'
import type { HighlightsPainter } from '../../../src/client/paint/adapters/css-highlights'
import type { HelloValue, ListValue, WriteValue } from '../../../src/shared/protocol'
import type { HighlightRecord } from '../../../src/shared/schema'

const HELLO: HelloValue = {
  protocol: 1,
  domainVersion: 1,
  installId: 'install-1',
  count: 0,
  maxRecords: 10_000,
  insertionAttribution: true,
  pollIntervalMs: 0,
}

const NODE_KEY = '14:assistant-step4:2'

/** A transport whose create fills in the Host-owned fields. */
function makeHarness(): {
  actions: HighlightsActionsImpl
  client: HighlightsClient
  create: ReturnType<typeof vi.fn>
} {
  const create = vi.fn(async (record: Parameters<HighlightsTransport['create']>[0]): Promise<HighlightRecord> => ({
    ...record,
    schemaVersion: 1,
    version: 1,
    createdAt: 10,
    updatedAt: 10,
  }))
  const transport: HighlightsTransport = {
    hello: async () => HELLO,
    list: async (): Promise<ListValue> => ({ revision: 1, records: [] }),
    create,
    update: async (): Promise<WriteValue> => { throw new Error('not used') },
    reanchor: async (): Promise<WriteValue> => { throw new Error('not used') },
    remove: async (): Promise<WriteValue> => { throw new Error('not used') },
    restore: async (): Promise<WriteValue> => { throw new Error('not used') },
    query: async () => ({ items: [], total: 0 }),
  }
  const client = new HighlightsClient(transport)
  const deps: ActionsDeps = {
    ctx: { layout: {}, sessions: {}, uiWorkspace: {}, sidebarRight: {} } as unknown as ClientContext,
    client,
    transport,
    painter: { supported: true } as unknown as HighlightsPainter,
    insert: new InsertService(),
    translate: key => key,
  }
  return { actions: new HighlightsActionsImpl(deps), client, create }
}

/** Append one seat element to the document. */
function addSeat(options: { key: string; part?: 'reasoning' | 'response'; text: string }): HTMLElement {
  const seat = document.createElement('div')
  seat.dataset.chatNodeKey = options.key
  seat.dataset.chatTurn = '4'
  if (options.part === 'reasoning') {
    seat.dataset.chatAnchorKey = JSON.stringify([options.key, 'reasoning'])
    const think = document.createElement('div')
    think.dataset.variant = 'think'
    const source = document.createElement('div')
    source.dataset.textInteractionSource = ''
    source.textContent = options.text
    think.append(source)
    seat.append(think)
  } else {
    seat.dataset.chatAnchorKey = options.key
    seat.dataset.chatFlowKind = 'assistant-step'
    if (options.part === 'response') seat.dataset.chatGroupPart = 'response'
    const source = document.createElement('div')
    source.dataset.textInteractionSource = ''
    source.textContent = options.text
    seat.append(source)
  }
  document.body.append(seat)
  return seat
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('createMessageMark', () => {
  it('captures the response seat text when reasoning and response share the node key', async () => {
    addSeat({ key: NODE_KEY, part: 'reasoning', text: 'thinking about the answer' })
    addSeat({ key: NODE_KEY, part: 'response', text: 'The answer text.' })
    const { actions, create } = makeHarness()

    const mark = await actions.createMessageMark(NODE_KEY, 'message-1', 7, { sessionId: 'session-1' }, 'install-1')

    expect(mark).not.toBeNull()
    expect(mark?.created).toBe(true)
    expect(mark?.record.anchor.kind).toBe('message')
    expect(mark?.record.anchor.quote).toBe('The answer text.')
    expect(mark?.record.anchor.groupPart).toBe('response')
    expect(mark?.record.anchor.messageId).toBe('message-1')
    expect(mark?.record.anchor.nodeSeq).toBe(7)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('dedupes a second save on the same reply instead of creating a duplicate', async () => {
    addSeat({ key: NODE_KEY, part: 'response', text: 'The answer text.' })
    const { actions, create } = makeHarness()

    const first = await actions.createMessageMark(NODE_KEY, 'message-1', 7, { sessionId: 'session-1' }, 'install-1')
    const second = await actions.createMessageMark(NODE_KEY, 'message-1', 7, { sessionId: 'session-1' }, 'install-1')

    expect(second).not.toBeNull()
    expect(second?.created).toBe(false)
    expect(second?.record.id).toBe(first?.record.id)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('does not confuse another session marking the same node', async () => {
    addSeat({ key: NODE_KEY, part: 'response', text: 'The answer text.' })
    const { actions, create } = makeHarness()

    await actions.createMessageMark(NODE_KEY, 'message-1', 7, { sessionId: 'session-1' }, 'install-1')
    const other = await actions.createMessageMark(NODE_KEY, 'message-1', 7, { sessionId: 'session-2' }, 'install-1')

    expect(other?.created).toBe(true)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('returns null when only the reasoning seat is rendered', async () => {
    addSeat({ key: NODE_KEY, part: 'reasoning', text: 'thinking about the answer' })
    const { actions, create } = makeHarness()

    expect(await actions.createMessageMark(NODE_KEY, 'message-1', 7, { sessionId: 'session-1' }, 'install-1')).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('returns null when the node is not rendered at all', async () => {
    const { actions, create } = makeHarness()

    expect(await actions.createMessageMark(NODE_KEY, 'message-1', 7, { sessionId: 'session-1' }, 'install-1')).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
})
