// @vitest-environment jsdom
/**
 * Clipboard action (P0-6): the async Clipboard API works on HTTPS/localhost,
 * the plain-HTTP LAN GUI falls back to a hidden textarea + execCommand, and the
 * boolean is true only when a copy actually happened.
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

/** Build a valid record. */
function record(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
  return {
    schemaVersion: 1,
    id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a5b',
    sessionId: 'session-1',
    origin: 'install-1',
    anchor: {
      nodeKey: '13:assistant-step4:2',
      kind: 'text',
      sourceIndex: 0,
      quote: 'the migration must land',
      prefix: '',
      suffix: '',
      start: 0,
      end: 23,
      projection: 1,
    },
    colorId: 1,
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    ...overrides,
  }
}

/** Minimal transport/context for the action object. */
function makeActions(hello: HelloValue = HELLO): { actions: HighlightsActionsImpl; client: HighlightsClient } {
  const transport: HighlightsTransport = {
    hello: async () => hello,
    list: async (): Promise<ListValue> => ({ revision: 1, records: [] }),
    create: async () => { throw new Error('not used') },
    update: async (): Promise<WriteValue> => { throw new Error('not used') },
    reanchor: async (): Promise<WriteValue> => { throw new Error('not used') },
    remove: async (): Promise<WriteValue> => { throw new Error('not used') },
    restore: async (): Promise<WriteValue> => { throw new Error('not used') },
    query: async () => ({ items: [], total: 0 }),
  }
  const client = new HighlightsClient(transport)
  client.setHello(hello)
  const deps: ActionsDeps = {
    ctx: { layout: {}, sessions: {}, uiWorkspace: {}, sidebarRight: {} } as unknown as ClientContext,
    client,
    transport,
    painter: { supported: true } as unknown as HighlightsPainter,
    insert: new InsertService(),
    translate: key => key,
  }
  return { actions: new HighlightsActionsImpl(deps), client }
}

/** Install one `document.execCommand` implementation (jsdom has none). */
function stubExecCommand(result: boolean | 'throw' | undefined): void {
  if (result === undefined) {
    delete (document as { execCommand?: unknown }).execCommand
    return
  }
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: vi.fn(() => {
      if (result === 'throw') throw new Error('denied')
      return result
    }),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  stubExecCommand(undefined)
  document.body.innerHTML = ''
})

describe('copyQuote', () => {
  it('returns true when the Clipboard API accepts the text', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { actions } = makeActions()

    await expect(actions.copyQuote(record())).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('the migration must land')
  })

  it('falls back to the textarea when the Clipboard API is unavailable on insecure HTTP', async () => {
    vi.stubGlobal('navigator', {})
    stubExecCommand(true)
    const { actions } = makeActions()

    await expect(actions.copyQuote(record())).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    // The hidden textarea is removed again.
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('falls back to the textarea when the Clipboard API rejects', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('not allowed') }) } })
    stubExecCommand(true)
    const { actions } = makeActions()

    await expect(actions.copyQuote(record())).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('reports false when both clipboard paths fail', async () => {
    vi.stubGlobal('navigator', {})
    stubExecCommand(false)
    const { actions } = makeActions()

    await expect(actions.copyQuote(record())).resolves.toBe(false)
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('reports false when there is no clipboard implementation at all', async () => {
    vi.stubGlobal('navigator', {})
    stubExecCommand(undefined)
    const { actions } = makeActions()

    await expect(actions.copyQuote(record())).resolves.toBe(false)
  })

  it('reports false when execCommand throws', async () => {
    vi.stubGlobal('navigator', {})
    stubExecCommand('throw')
    const { actions } = makeActions()

    await expect(actions.copyQuote(record())).resolves.toBe(false)
  })

  it('adds the attribution line for a titled session when the Host enables it', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { actions } = makeActions()

    await actions.copyQuote(record({ sessionTitle: 'Release plan' }))

    expect(writeText).toHaveBeenCalledWith('the migration must land\n\ninsert.attribution')
  })

  it('omits the attribution line when the Host disables it', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { actions } = makeActions({ ...HELLO, insertionAttribution: false })

    await actions.copyQuote(record({ sessionTitle: 'Release plan' }))

    expect(writeText).toHaveBeenCalledWith('the migration must land')
  })
})
