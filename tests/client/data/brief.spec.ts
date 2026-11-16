/**
 * T2.6 — "Brief the agent": the one-packet handoff.
 *
 * The packet is the contract the agent resolves: every item carries a record id
 * (`get_highlight` takes it), a short excerpt for orientation, and the current
 * cursor state. Private records must never leave the device, the cap keeps one
 * insertion inside the composer/queue limit, and a session whose composer is
 * not on screen is queued for and then opened rather than dropped.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

import { HighlightsActionsImpl, type ActionsDeps } from '../../../src/client/data/actions-impl'
import type { HighlightsClient } from '../../../src/client/data/client'
import type { HighlightsTransport } from '../../../src/client/data/transport'
import { InsertService } from '../../../src/client/services/insert'
import type { HighlightsPainter } from '../../../src/client/paint/adapters/css-highlights'
import { MAX_QUOTE_CHARS } from '../../../src/shared/constants'
import type { HighlightRecord } from '../../../src/shared/schema'

/** Session every fixture record belongs to. */
const SESSION = 'session-1'

/** Stored session title the packet header should carry. */
const TITLE = 'Session one'

/** Options one fixture record may override. */
interface RecordOptions {
  readonly quote?: string
  readonly turn?: number
  readonly state?: 'new' | 'kept' | 'compiled'
  readonly visibility?: 'agent' | 'private'
  readonly deletedAt?: number
}

/**
 * Build one stored record in transcript order (turn = position).
 * @param id - record identity (the packet's payload).
 * @param options - field overrides.
 * @returns the fixture record.
 */
function record(id: string, options: RecordOptions = {}): HighlightRecord {
  return {
    schemaVersion: 1,
    id,
    sessionId: SESSION,
    sessionTitle: TITLE,
    origin: 'install-1',
    anchor: {
      nodeKey: '13:assistant-step1:0',
      kind: 'text',
      sourceIndex: 0,
      quote: options.quote ?? `quote ${id}`,
      prefix: '',
      suffix: '',
      start: 0,
      end: 5,
      projection: 1,
      turn: options.turn ?? 1,
      step: 0,
    },
    colorId: 1,
    tags: [],
    starred: false,
    state: options.state,
    visibility: options.visibility,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    ...(options.deletedAt === undefined ? {} : { deletedAt: options.deletedAt }),
  }
}

/** One composer bridge as the InsertService contract sees it. */
interface BridgeSpy {
  readonly insertQuote: ReturnType<typeof vi.fn<(text: string, summary?: string) => boolean>>
  readonly insertText: ReturnType<typeof vi.fn<(text: string) => boolean>>
}

/**
 * Build the action object over stubs, with an optional mounted composer.
 * @param mounted - whether a composer for {@link SESSION} is on screen.
 * @returns the action, the queue, the open-session spy, and the bridge.
 */
function harness(mounted: boolean): {
  actions: HighlightsActionsImpl
  insert: InsertService
  openSession: ReturnType<typeof vi.fn>
  bridge: BridgeSpy
} {
  const insert = new InsertService()
  const bridge: BridgeSpy = {
    insertQuote: vi.fn((_text: string, _summary?: string) => true),
    insertText: vi.fn((_text: string) => true),
  }
  if (mounted) insert.registerBridge(SESSION, bridge)
  const openSession = vi.fn()
  const deps = {
    ctx: { uiWorkspace: { openSession } } as unknown as ClientContext,
    client: { getSnapshot: () => ({ records: [], byId: new Map(), stale: new Set() }) } as unknown as HighlightsClient,
    transport: {} as HighlightsTransport,
    painter: { supported: true } as unknown as HighlightsPainter,
    insert,
    translate: (key: string, params?: Record<string, string | number>) => (
      params?.['count'] === undefined ? key : `${key}:${String(params['count'])}`
    ),
  } satisfies ActionsDeps
  return { actions: new HighlightsActionsImpl(deps), insert, openSession, bridge }
}

describe('briefSession packet', () => {
  it('builds one packet in transcript order with every id and state', async () => {
    const { actions, bridge } = harness(true)
    const records = [
      record('id-c', { quote: 'third quote', turn: 3, state: 'compiled' }),
      record('id-a', { quote: 'first quote', turn: 1 }),
      record('id-b', { quote: 'second quote', turn: 2, state: 'kept' }),
    ]

    const outcome = await actions.briefSession(SESSION, records)

    expect(outcome).toBe('inserted')
    expect(bridge.insertQuote).toHaveBeenCalledTimes(1)
    const [text, summary] = bridge.insertQuote.mock.calls[0] as [string, string]
    expect(text).toBe([
      'Highlight briefing — “Session one”, 3 items:',
      '1. “first quote” — highlight id-a · new',
      '2. “second quote” — highlight id-b · kept',
      '3. “third quote” — highlight id-c · compiled',
    ].join('\n'))
    expect(summary).toBe('brief.summary:3')
    // Exactly one insert: the packet is not a quote-per-record stream.
    expect(bridge.insertText).not.toHaveBeenCalled()
  })

  it('never includes private records and skips tombstones', async () => {
    const { actions, bridge } = harness(true)
    const records = [
      record('id-public', { quote: 'visible' }),
      record('id-private', { quote: 'secret', visibility: 'private' }),
      record('id-deleted', { quote: 'gone', deletedAt: 5 }),
      record('id-kept', { quote: 'kept one', state: 'kept' }),
    ]

    await actions.briefSession(SESSION, records)

    const [text] = bridge.insertQuote.mock.calls[0] as [string, string]
    expect(text).toContain('highlight id-public')
    expect(text).toContain('highlight id-kept')
    expect(text).not.toContain('id-private')
    expect(text).not.toContain('id-deleted')
    expect(text).toContain('“Session one”, 2 items:')
  })

  it('fails without touching the composer when nothing is briefable', async () => {
    const { actions, bridge, insert } = harness(true)
    const outcome = await actions.briefSession(SESSION, [
      record('id-private', { visibility: 'private' }),
      record('id-deleted', { deletedAt: 1 }),
    ])

    expect(outcome).toBe('failed')
    expect(bridge.insertQuote).not.toHaveBeenCalled()
    expect(insert.pendingFor(SESSION)).toHaveLength(0)
  })

  it('caps at ten items and keeps the first ten in transcript order', async () => {
    const { actions, bridge } = harness(true)
    const records = Array.from({ length: 12 }, (_unused, index) => (
      record(`id-${String(index)}`, { turn: index + 1, quote: `quote ${String(index)}` })
    ))

    await actions.briefSession(SESSION, records)

    const [text] = bridge.insertQuote.mock.calls[0] as [string, string]
    expect(text).toContain('“Session one”, 10 items:')
    for (let index = 0; index < 10; index += 1) expect(text).toContain(`highlight id-${String(index)}`)
    for (const index of [10, 11]) expect(text).not.toContain(`highlight id-${String(index)}`)
  })

  it('stays inside the insertion cap even with very long quotes', async () => {
    const { actions, bridge } = harness(true)
    const records = Array.from({ length: 10 }, (_unused, index) => (
      record(`id-${String(index)}`, { turn: index + 1, quote: `${'x'.repeat(5_000)}-${String(index)}` })
    ))

    await actions.briefSession(SESSION, records)

    const [text] = bridge.insertQuote.mock.calls[0] as [string, string]
    expect(text.length).toBeLessThanOrEqual(MAX_QUOTE_CHARS)
    // An identifier is never cut in half; the packet may drop trailing items.
    expect(text).toContain('highlight id-0')
    expect(text.split('\n').length).toBeLessThanOrEqual(11)
  })

  it('inserts once for a double click on the same packet', async () => {
    const { actions, bridge } = harness(true)
    const records = [record('id-a')]

    expect(await actions.briefSession(SESSION, records)).toBe('inserted')
    expect(await actions.briefSession(SESSION, records)).toBe('inserted')

    expect(bridge.insertQuote).toHaveBeenCalledTimes(1)
  })
})

describe('briefSession destination', () => {
  it('inserts directly when that session has a mounted composer', async () => {
    const { actions, bridge, insert, openSession } = harness(true)

    const outcome = await actions.briefSession(SESSION, [record('id-a')])

    expect(outcome).toBe('inserted')
    expect(bridge.insertQuote).toHaveBeenCalledTimes(1)
    expect(insert.pendingFor(SESSION)).toHaveLength(0)
    expect(openSession).not.toHaveBeenCalled()
  })

  it('queues for that session and opens it when no composer is mounted', async () => {
    const { actions, insert, openSession } = harness(false)

    const outcome = await actions.briefSession(SESSION, [record('id-a')])

    expect(outcome).toBe('queued')
    const pending = insert.pendingFor(SESSION)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.quote).toContain('highlight id-a')
    expect(pending[0]?.summary).toBe('brief.summary:1')
    expect(openSession).toHaveBeenCalledWith(SESSION)
  })
})
