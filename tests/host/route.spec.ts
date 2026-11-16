/**
 * `/api/highlights` route contract.
 *
 * The route owns the JSON envelope, endpoint dispatch, and error mapping; the
 * store is faked so each assertion is about the wire contract, not storage.
 * Business outcomes (conflict, not-found, limit) arrive as `{ ok: false }`
 * values with HTTP 200 — a lost compare-and-set race is not a transport error.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Logger } from '@deepseek-ai/cordis'

import { createHighlightsRoute, HIGHLIGHTS_ROUTE_PATH } from '../../src/host/route'
import { LimitError, NotFoundError, type HighlightStore } from '../../src/host/store'
import { RPC_PROTOCOL } from '../../src/shared/constants'
import type { DraftRecord, HighlightRecord, UpdatePatch } from '../../src/shared/schema'
import type { WriteValue } from '../../src/shared/protocol'

/** A valid record the fake store hands back. */
const RECORD: HighlightRecord = {
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
  colorId: 2,
  tags: ['release'],
  starred: false,
  createdAt: 1,
  updatedAt: 1,
  version: 1,
}

/** A valid create draft. */
function draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RECORD.id,
    sessionId: RECORD.sessionId,
    origin: RECORD.origin,
    anchor: RECORD.anchor,
    colorId: RECORD.colorId,
    tags: RECORD.tags,
    starred: RECORD.starred,
    ...overrides,
  }
}

/** The fake store surface the route consumes. */
function fakeStore() {
  return {
    installId: 'install-abc',
    countLive: vi.fn(() => 7),
    list: vi.fn((_includeTombstones?: boolean) => ({ revision: 12, records: [RECORD] })),
    create: vi.fn(async (_record: DraftRecord): Promise<HighlightRecord> => RECORD),
    update: vi.fn(async (_id: string, _expectedVersion: number, _patch: UpdatePatch): Promise<WriteValue> => ({ status: 'written', record: RECORD })),
    reanchor: vi.fn(async (_id: string, _expectedVersion: number, _anchor: HighlightRecord['anchor']): Promise<WriteValue> => ({ status: 'written', record: RECORD })),
    remove: vi.fn(async (_id: string, _expectedVersion: number): Promise<WriteValue> => ({ status: 'written', record: { ...RECORD, deletedAt: 5 } })),
    restore: vi.fn(async (_id: string, _expectedVersion: number): Promise<WriteValue> => ({ status: 'written', record: RECORD })),
  }
}

/** A logger that records calls. */
function fakeLogger() {
  return { name: 'test', error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}

/** Build the route under test plus its fakes. */
function harness() {
  const store = fakeStore()
  const log = fakeLogger()
  const route = createHighlightsRoute(
    store as unknown as HighlightStore,
    { maxRecords: 10_000, insertionAttribution: true, pollIntervalMs: 0 },
    log as unknown as Logger,
  )
  return { store, log, route }
}

/** POST one body (string or JSON-serialisable) to the route. */
async function post(route: ReturnType<typeof harness>['route'], body: unknown): Promise<Response> {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  return await route.fetch(new Request(`http://localhost${HIGHLIGHTS_ROUTE_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  }))
}

/** Parsed envelope. */
type Envelope =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } }

/** Read one JSON envelope and assert the shared reply headers. */
async function envelopeOf(response: Response): Promise<Envelope> {
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(response.headers.get('cache-control')).toBe('no-store')
  return await response.json() as Envelope
}

/** Assert a successful reply and return its value. */
function valueOf(envelope: Envelope): unknown {
  expect(envelope.ok).toBe(true)
  if (envelope.ok !== true) throw new Error('expected ok envelope')
  return envelope.value
}

/** Assert a failed reply and return its error. */
function errorOf(envelope: Envelope): { code: string; message: string } {
  expect(envelope.ok).toBe(false)
  if (envelope.ok !== false) throw new Error('expected error envelope')
  return envelope.error
}

describe('route definition', () => {
  it('owns exactly one POST path below /api with a buffered body', () => {
    const { route } = harness()
    expect(route.path).toBe('/api/highlights')
    expect(route.methods).toEqual(['POST'])
    expect(route.requestBody).toBe('buffered')
  })
})

describe('hello', () => {
  it('reports the protocol, domain version, install id, live count, and cap', async () => {
    const { route, store } = harness()
    const response = await post(route, { endpoint: 'hello' })
    const value = valueOf(await envelopeOf(response))
    expect(value).toEqual({
      protocol: RPC_PROTOCOL,
      domainVersion: 1,
      installId: 'install-abc',
      count: 7,
      maxRecords: 10_000,
      insertionAttribution: true,
      pollIntervalMs: 0,
    })
    expect(store.countLive).toHaveBeenCalledTimes(1)
  })
})

describe('list', () => {
  it('returns the revision and the live records', async () => {
    const { route, store } = harness()
    const value = valueOf(await envelopeOf(await post(route, { endpoint: 'list', payload: {} })))
    expect(value).toEqual({ revision: 12, records: [RECORD] })
    expect(store.list).toHaveBeenCalledWith(false)
  })

  it('forwards includeTombstones', async () => {
    const { route, store } = harness()
    await post(route, { endpoint: 'list', payload: { includeTombstones: true } })
    expect(store.list).toHaveBeenCalledWith(true)
  })

  it('treats a missing payload as an empty payload', async () => {
    const { route, store } = harness()
    const value = valueOf(await envelopeOf(await post(route, { endpoint: 'list' })))
    expect(store.list).toHaveBeenCalledWith(false)
    expect(value).toEqual({ revision: 12, records: [RECORD] })
  })

  it('rejects a non-boolean includeTombstones', async () => {
    const { route, store } = harness()
    const error = errorOf(await envelopeOf(await post(route, {
      endpoint: 'list',
      payload: { includeTombstones: 'yes' },
    })))
    expect(error.code).toBe('bad-request')
    expect(error.message).toContain('includeTombstones')
    expect(store.list).not.toHaveBeenCalled()
  })
})

describe('create', () => {
  it('validates the draft and returns the stored record', async () => {
    const { route, store } = harness()
    const value = valueOf(await envelopeOf(await post(route, {
      endpoint: 'create',
      payload: { record: draft() },
    })))
    expect(value).toEqual(RECORD)
    expect(store.create).toHaveBeenCalledTimes(1)
    const passed = store.create.mock.calls[0]?.[0]
    expect(passed).toMatchObject({ id: RECORD.id, colorId: 2 })
  })

  it('strips unknown draft fields before the store sees them', async () => {
    const { route, store } = harness()
    await post(route, {
      endpoint: 'create',
      payload: { record: draft({ version: 99, schemaVersion: 2 }) },
    })
    const passed = store.create.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    expect(passed).toBeDefined()
    expect(passed?.['version']).toBeUndefined()
    expect(passed?.['schemaVersion']).toBeUndefined()
  })

  it('rejects an invalid colour with a bad-request path', async () => {
    const { route, store } = harness()
    const error = errorOf(await envelopeOf(await post(route, {
      endpoint: 'create',
      payload: { record: draft({ colorId: 9 }) },
    })))
    expect(error.code).toBe('bad-request')
    expect(error.message).toContain('record.colorId')
    expect(store.create).not.toHaveBeenCalled()
  })

  it('rejects unknown payload keys', async () => {
    const { route } = harness()
    const error = errorOf(await envelopeOf(await post(route, {
      endpoint: 'create',
      payload: { record: draft(), extra: true },
    })))
    expect(error.code).toBe('bad-request')
  })
})

describe('update', () => {
  it('forwards the compare-and-set inputs and returns the write result', async () => {
    const { route, store } = harness()
    const value = valueOf(await envelopeOf(await post(route, {
      endpoint: 'update',
      payload: {
        id: RECORD.id,
        expectedVersion: 1,
        patch: { colorId: 5, tags: ['Release', 'release'], note: null, starred: true },
      },
    })))
    expect(value).toEqual({ status: 'written', record: RECORD })
    expect(store.update).toHaveBeenCalledTimes(1)
    const call = store.update.mock.calls[0]
    expect(call?.[0]).toBe(RECORD.id)
    expect(call?.[1]).toBe(1)
    // Tags are normalised by the store, not the route: the raw patch travels.
    expect(call?.[2]).toEqual({ colorId: 5, tags: ['Release', 'release'], note: null, starred: true })
  })

  it('surfaces a conflict as a successful reply value', async () => {
    const { route, store } = harness()
    store.update.mockResolvedValueOnce({ status: 'conflict', record: { ...RECORD, version: 4 } })
    const value = valueOf(await envelopeOf(await post(route, {
      endpoint: 'update',
      payload: { id: RECORD.id, expectedVersion: 1, patch: { starred: true } },
    })))
    expect(value).toEqual({ status: 'conflict', record: { ...RECORD, version: 4 } })
  })

  it.each([
    ['non-UUID id', { id: 'nope', expectedVersion: 1, patch: {} }],
    ['zero version', { id: RECORD.id, expectedVersion: 0, patch: {} }],
    ['invalid patch colour', { id: RECORD.id, expectedVersion: 1, patch: { colorId: 0 } }],
  ])('rejects %s', async (_name, payload) => {
    const { route, store } = harness()
    const error = errorOf(await envelopeOf(await post(route, { endpoint: 'update', payload })))
    expect(error.code).toBe('bad-request')
    expect(store.update).not.toHaveBeenCalled()
  })
})

describe('reanchor', () => {
  it('forwards the replacement anchor', async () => {
    const { route, store } = harness()
    const anchor = { ...RECORD.anchor, start: 100, end: 123 }
    const value = valueOf(await envelopeOf(await post(route, {
      endpoint: 'reanchor',
      payload: { id: RECORD.id, expectedVersion: 2, anchor },
    })))
    expect(value).toEqual({ status: 'written', record: RECORD })
    expect(store.reanchor).toHaveBeenCalledWith(RECORD.id, 2, anchor)
  })

  it('rejects a malformed anchor', async () => {
    const { route, store } = harness()
    const error = errorOf(await envelopeOf(await post(route, {
      endpoint: 'reanchor',
      payload: { id: RECORD.id, expectedVersion: 1, anchor: { ...RECORD.anchor, quote: '' } },
    })))
    expect(error.code).toBe('bad-request')
    expect(store.reanchor).not.toHaveBeenCalled()
  })
})

describe('remove and restore', () => {
  it('removes by expected version', async () => {
    const { route, store } = harness()
    const value = valueOf(await envelopeOf(await post(route, {
      endpoint: 'remove',
      payload: { id: RECORD.id, expectedVersion: 3 },
    })))
    expect(value).toEqual({ status: 'written', record: { ...RECORD, deletedAt: 5 } })
    expect(store.remove).toHaveBeenCalledWith(RECORD.id, 3)
  })

  it('restores by expected version', async () => {
    const { route, store } = harness()
    const value = valueOf(await envelopeOf(await post(route, {
      endpoint: 'restore',
      payload: { id: RECORD.id, expectedVersion: 4 },
    })))
    expect(value).toEqual({ status: 'written', record: RECORD })
    expect(store.restore).toHaveBeenCalledWith(RECORD.id, 4)
  })

  it('maps a missing record to not-found', async () => {
    const { route, store } = harness()
    store.remove.mockRejectedValueOnce(new NotFoundError(RECORD.id))
    const error = errorOf(await envelopeOf(await post(route, {
      endpoint: 'remove',
      payload: { id: RECORD.id, expectedVersion: 1 },
    })))
    expect(error.code).toBe('not-found')
    expect(error.message).toContain(RECORD.id)
  })
})

describe('failure mapping', () => {
  it('maps the live-record cap to limit-exceeded', async () => {
    const { route, store } = harness()
    store.create.mockRejectedValueOnce(new LimitError(10_000))
    const error = errorOf(await envelopeOf(await post(route, {
      endpoint: 'create',
      payload: { record: draft() },
    })))
    expect(error.code).toBe('limit-exceeded')
    expect(error.message).toContain('10000')
  })

  it('maps an unexpected store failure to internal and logs it', async () => {
    const { route, store, log } = harness()
    store.list.mockImplementationOnce(() => {
      throw new Error('disk on fire')
    })
    const error = errorOf(await envelopeOf(await post(route, { endpoint: 'list', payload: {} })))
    expect(error.code).toBe('internal')
    expect(error.message).toBe('disk on fire')
    expect(log.error).toHaveBeenCalledWith(
      'highlights endpoint %s failed: %s',
      'list',
      'disk on fire',
    )
  })

  it('stringifies a non-Error rejection', async () => {
    const { route, store } = harness()
    store.restore.mockRejectedValueOnce('nope')
    const error = errorOf(await envelopeOf(await post(route, {
      endpoint: 'restore',
      payload: { id: RECORD.id, expectedVersion: 1 },
    })))
    expect(error.code).toBe('internal')
    expect(error.message).toBe('nope')
  })

  it('does not log validation failures', async () => {
    const { route, log } = harness()
    await post(route, { endpoint: 'create', payload: { record: draft({ colorId: 9 }) } })
    expect(log.error).not.toHaveBeenCalled()
  })
})

describe('envelope handling', () => {
  it('rejects a non-JSON body with bad-request', async () => {
    const { route, store } = harness()
    const error = errorOf(await envelopeOf(await post(route, '{not json')))
    expect(error.code).toBe('bad-request')
    expect(error.message).toBe('request body must be JSON')
    expect(store.countLive).not.toHaveBeenCalled()
  })

  it('rejects an unknown endpoint', async () => {
    const { route } = harness()
    const error = errorOf(await envelopeOf(await post(route, { endpoint: 'delete-everything', payload: {} })))
    expect(error.code).toBe('unknown-endpoint')
    expect(error.message).toContain('delete-everything')
  })

  it('rejects a missing endpoint as unknown', async () => {
    const { route } = harness()
    const error = errorOf(await envelopeOf(await post(route, { payload: {} })))
    expect(error.code).toBe('unknown-endpoint')
  })

  it('rejects a non-string endpoint as unknown', async () => {
    const { route } = harness()
    const error = errorOf(await envelopeOf(await post(route, { endpoint: 42 })))
    expect(error.code).toBe('unknown-endpoint')
  })
})

describe('query', () => {
  it('serves a bounded page over the store list without changing the envelope', async () => {
    const { route, store } = harness()
    const response = await post(route, { endpoint: 'query', payload: { limit: 10, include: 'summary' } })
    const value = valueOf(await envelopeOf(response)) as { total: number; items: unknown[] }
    expect(store.list).toHaveBeenCalledWith(true)
    expect(value.total).toBe(1)
    expect(value.items).toHaveLength(1)
  })

  it('rejects an invalid query payload with bad-request', async () => {
    const { route } = harness()
    const error = errorOf(await envelopeOf(await post(route, { endpoint: 'query', payload: { limit: 0 } })))
    expect(error.code).toBe('bad-request')
  })
})
