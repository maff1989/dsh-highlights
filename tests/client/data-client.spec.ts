/**
 * `HighlightsClient` — the browser-side snapshot store.
 *
 * The transport is faked with hand-controlled promises so every transition
 * (loading, ready, error, optimistic write, supersede) can be observed at the
 * exact moment it happens. This suite runs in the Node project: the store has
 * no DOM dependency apart from the `CSS.highlights` capability probe.
 */
import { describe, expect, it, vi } from 'vitest'

import { HighlightsClient, type HighlightsSnapshot } from '../../src/client/data/client'
import type { HighlightsTransport } from '../../src/client/data/transport'
import type { HelloValue, ListValue, WriteValue } from '../../src/shared/protocol'
import type { HighlightRecord } from '../../src/shared/schema'

/** One promise the test resolves or rejects by hand. */
interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

/** Build a hand-controlled promise. */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A queue of pending transport calls of one kind. */
class CallQueue<T> {
  private readonly pending: Array<Deferred<T>> = []

  /** Start one pending call and return its promise. */
  call(): Promise<T> {
    const entry = deferred<T>()
    this.pending.push(entry)
    return entry.promise
  }

  /** Settle the oldest pending call. */
  take(): Deferred<T> {
    const entry = this.pending.shift()
    if (entry === undefined) throw new Error('no pending transport call')
    return entry
  }

  /** Number of calls not settled yet. */
  get size(): number {
    return this.pending.length
  }
}

/** The controllable transport. */
class FakeTransport implements HighlightsTransport {
  readonly hellos = new CallQueue<HelloValue>()
  readonly lists = new CallQueue<ListValue>()
  readonly creates = new CallQueue<HighlightRecord>()

  hello(): Promise<HelloValue> {
    return this.hellos.call()
  }

  list(): Promise<ListValue> {
    return this.lists.call()
  }

  create(): Promise<HighlightRecord> {
    return this.creates.call()
  }

  update(): Promise<WriteValue> {
    return Promise.reject(new Error('not used'))
  }

  reanchor(): Promise<WriteValue> {
    return Promise.reject(new Error('not used'))
  }

  remove(): Promise<WriteValue> {
    return Promise.reject(new Error('not used'))
  }

  query(): Promise<{ items: readonly never[]; total: number }> {
    return Promise.resolve({ items: [], total: 0 })
  }

  restore(): Promise<WriteValue> {
    return Promise.reject(new Error('not used'))
  }
}

/** The standard hello value. */
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

/** Flush queued microtasks plus one macrotask, so a re-read can spawn calls. */
function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/** Drive one complete successful read. */
async function readOk(
  client: HighlightsClient,
  transport: FakeTransport,
  revision: number,
  records: readonly HighlightRecord[],
  hello: HelloValue = HELLO,
): Promise<void> {
  const pending = client.refresh()
  transport.hellos.take().resolve(hello)
  transport.lists.take().resolve({ revision, records: [...records] })
  await pending
}

/** Collect listener invocations. */
function listen(client: HighlightsClient): ReturnType<typeof vi.fn> {
  const listener = vi.fn()
  client.source.subscribe(listener)
  return listener
}

describe('initial state', () => {
  it('starts idle with an empty snapshot and performs no I/O', () => {
    const transport = new FakeTransport()
    const snapshot = new HighlightsClient(transport).getSnapshot()

    expect(snapshot.status).toBe('idle')
    expect(snapshot.records).toEqual([])
    expect(snapshot.paintEpoch).toBe(0)
    expect(snapshot.hello).toBeUndefined()
    expect(snapshot.error).toBeUndefined()
    expect(snapshot.offline).toBe(false)
    expect(snapshot.stale.size).toBe(0)
    expect(snapshot.byId.size).toBe(0)
    expect(transport.hellos.size).toBe(0)
    expect(transport.lists.size).toBe(0)
  })

  it('reports paint support from the CSS.highlights capability', () => {
    expect(new HighlightsClient(new FakeTransport()).getSnapshot().paintSupported).toBe(false)

    const scope = globalThis as { CSS?: unknown }
    const original = scope.CSS
    try {
      scope.CSS = { highlights: {} }
      expect(new HighlightsClient(new FakeTransport()).getSnapshot().paintSupported).toBe(true)
    } finally {
      if (original === undefined) delete scope.CSS
      else scope.CSS = original
    }
  })
})

describe('refresh lifecycle', () => {
  it('moves idle → loading → ready and publishes hello, records, byId', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)
    const listener = listen(client)
    const first = record()

    const pending = client.refresh()
    expect(client.getSnapshot().status).toBe('loading')
    expect(transport.hellos.size).toBe(1)
    expect(transport.lists.size).toBe(1)

    transport.hellos.take().resolve(HELLO)
    expect(client.getSnapshot().status).toBe('loading')

    transport.lists.take().resolve({ revision: 7, records: [first] })
    await pending

    const snapshot = client.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.hello).toEqual(HELLO)
    expect(snapshot.records).toEqual([first])
    expect(snapshot.byId.get(first.id)).toEqual(first)
    expect(snapshot.error).toBeUndefined()
    expect(snapshot.offline).toBe(false)
    expect(listener).toHaveBeenCalled()
  })

  it('shares one read between concurrent refreshes', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)

    const first = client.refresh()
    const second = client.refresh()
    expect(transport.hellos.size).toBe(1)
    expect(transport.lists.size).toBe(1)

    transport.hellos.take().resolve(HELLO)
    transport.lists.take().resolve({ revision: 1, records: [] })
    await Promise.all([first, second])

    expect(client.getSnapshot().status).toBe('ready')
    expect(transport.hellos.size).toBe(0)
  })

  it('skips a refresh inside the freshness window and honours force', async () => {
    const transport = new FakeTransport()
    let clock = 1_000
    const client = new HighlightsClient(transport, () => clock)

    const first = client.refresh()
    transport.hellos.take().resolve(HELLO)
    transport.lists.take().resolve({ revision: 1, records: [] })
    await first

    clock = 2_000
    await client.refresh()
    expect(transport.hellos.size).toBe(0)

    clock = 3_000
    const forced = client.refresh(true)
    expect(transport.hellos.size).toBe(1)
    transport.hellos.take().resolve(HELLO)
    transport.lists.take().resolve({ revision: 2, records: [] })
    await forced
  })

  it('turns a failed first read into the error state', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)
    const listener = listen(client)

    const pending = client.refresh()
    transport.hellos.take().resolve(HELLO)
    transport.lists.take().reject(new Error('route unreachable'))
    await pending

    const snapshot = client.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.error).toBe('route unreachable')
    expect(snapshot.offline).toBe(true)
    expect(snapshot.records).toEqual([])
    expect(listener).toHaveBeenCalled()
  })

  it('stringifies a non-Error rejection', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)

    const pending = client.refresh()
    transport.hellos.take().reject('refused')
    transport.lists.take().resolve({ revision: 1, records: [] })
    await pending

    expect(client.getSnapshot().error).toBe('refused')
    expect(client.getSnapshot().status).toBe('error')
  })

  it('keeps the last successful records when a later read fails', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)
    const first = record()
    await readOk(client, transport, 3, [first])

    const pending = client.refresh(true)
    transport.hellos.take().resolve(HELLO)
    transport.lists.take().reject(new Error('boom'))
    await pending

    const snapshot = client.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.records).toEqual([first])
    expect(snapshot.offline).toBe(true)
  })
})

describe('optimistic mutations', () => {
  it('applies an optimistic record and replaces it with the confirmed one', () => {
    const client = new HighlightsClient(new FakeTransport())
    client.applyRecords([record()])
    const listener = listen(client)

    const optimistic = record({ version: 1, starred: true })
    client.upsert(optimistic)
    expect(client.getSnapshot().records).toEqual([optimistic])

    const confirmed = record({ version: 2, colorId: 4, tags: ['release'] })
    client.upsert(confirmed)

    const snapshot = client.getSnapshot()
    expect(snapshot.records).toEqual([confirmed])
    expect(snapshot.byId.get(confirmed.id)).toEqual(confirmed)
    expect(snapshot.byId.size).toBe(1)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('appends a new record and filters by session', () => {
    const client = new HighlightsClient(new FakeTransport())
    const first = record()
    const second = record({
      id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02',
      sessionId: 'session-2',
    })
    client.applyRecords([first])
    client.upsert(second)

    expect(client.getSnapshot().records).toEqual([first, second])
    expect(client.forSession('session-1')).toEqual([first])
    expect(client.forSession('session-2')).toEqual([second])
    expect(client.forSession('session-3')).toEqual([])
  })

  it('evicts one record by id', () => {
    const client = new HighlightsClient(new FakeTransport())
    const first = record()
    const second = record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02' })
    client.applyRecords([first, second])

    client.evict(first.id)
    expect(client.getSnapshot().records).toEqual([second])
    expect(client.getSnapshot().byId.get(first.id)).toBeUndefined()

    expect(() => client.evict('missing')).not.toThrow()
  })

  it('creates through the transport, then publishes the confirmed record', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)
    const confirmed = record({ version: 1 })

    const pending = client.createRecord({
      id: confirmed.id,
      sessionId: confirmed.sessionId,
      origin: confirmed.origin,
      anchor: confirmed.anchor,
      colorId: confirmed.colorId,
      tags: [...confirmed.tags],
      starred: confirmed.starred,
    })
    transport.creates.take().resolve(confirmed)

    await expect(pending).resolves.toEqual(confirmed)
    expect(client.getSnapshot().byId.get(confirmed.id)).toEqual(confirmed)
  })

  it('propagates a refused create without touching the snapshot', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)
    const request = client.createRecord({
      id: record().id,
      sessionId: 'session-1',
      origin: 'install-1',
      anchor: record().anchor,
      colorId: 1,
      tags: [],
      starred: false,
    })
    transport.creates.take().reject(new Error('limit reached'))

    await expect(request).rejects.toThrow('limit reached')
    expect(client.getSnapshot().records).toEqual([])
  })
})

describe('supersede rule', () => {
  it('a slow read cannot overwrite a newer optimistic record', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)
    const created = record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', version: 1 })

    const pending = client.refresh()
    // The user saves a highlight while the initial list is still in flight.
    client.upsert(created)

    // The in-flight read answers from before the write.
    transport.hellos.take().resolve(HELLO)
    transport.lists.take().resolve({ revision: 1, records: [] })
    await tick()

    // The store must re-read instead of publishing the stale list.
    expect(transport.hellos.size).toBe(1)
    expect(transport.lists.size).toBe(1)
    transport.hellos.take().resolve(HELLO)
    transport.lists.take().resolve({ revision: 2, records: [created] })
    await pending

    const snapshot = client.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.records).toEqual([created])
  })

  it('a slow read cannot resurrect a record evicted by a local delete', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)
    const first = record()
    await readOk(client, transport, 5, [first])

    const pending = client.refresh(true)
    client.evict(first.id)
    transport.hellos.take().resolve(HELLO)
    transport.lists.take().resolve({ revision: 5, records: [first] })
    await tick()

    expect(transport.lists.size).toBe(1)
    transport.hellos.take().resolve(HELLO)
    transport.lists.take().resolve({ revision: 6, records: [] })
    await pending

    expect(client.getSnapshot().records).toEqual([])
  })

  it('re-reads at most three times, then publishes the last answer', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)

    const pending = client.refresh()
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) await tick()
      expect(transport.hellos.size).toBe(1)
      expect(transport.lists.size).toBe(1)
      // A write lands during every read, so the ordinal check keeps failing.
      client.upsert(record())
      transport.hellos.take().resolve(HELLO)
      transport.lists.take().resolve({ revision: attempt + 1, records: [] })
    }
    await pending

    // attempt 0..2 re-read; attempt 3 publishes its (stale) answer.
    expect(client.getSnapshot().records).toEqual([])
  })
})

describe('auxiliary setters', () => {
  it('stores the hello snapshot without changing the load status', () => {
    const client = new HighlightsClient(new FakeTransport())
    client.setHello(HELLO)
    expect(client.getSnapshot().hello).toEqual(HELLO)
    expect(client.getSnapshot().status).toBe('idle')
  })

  it('marks the host offline while keeping the status and data', async () => {
    const transport = new FakeTransport()
    const client = new HighlightsClient(transport)
    const first = record()
    await readOk(client, transport, 1, [first])

    client.markOffline('host unreachable')
    const snapshot = client.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.offline).toBe(true)
    expect(snapshot.error).toBe('host unreachable')
    expect(snapshot.records).toEqual([first])
  })

  it('marks an idle client offline as an error', () => {
    const client = new HighlightsClient(new FakeTransport())
    client.markOffline('host unreachable')
    expect(client.getSnapshot().status).toBe('error')
  })

  it('publishes the stale-id set only when it changes', () => {
    const client = new HighlightsClient(new FakeTransport())
    const listener = listen(client)

    client.setStale(['a', 'b'])
    expect(client.getSnapshot().stale).toEqual(new Set(['a', 'b']))
    expect(listener).toHaveBeenCalledTimes(1)

    client.setStale(['b', 'a'])
    expect(listener).toHaveBeenCalledTimes(1)

    client.setStale(['a'])
    expect(client.getSnapshot().stale).toEqual(new Set(['a']))
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('subscription source', () => {
  it('notifies subscribers and stops after unsubscribe', () => {
    const client = new HighlightsClient(new FakeTransport())
    const listener = vi.fn()
    const unsubscribe = client.source.subscribe(listener)
    const before = client.getSnapshot()

    client.applyRecords([])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(client.getSnapshot()).not.toBe(before)
    expect(client.source.getSnapshot()).toBe(client.getSnapshot())

    unsubscribe()
    client.applyRecords([])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('hands out the same snapshot object until something changes', () => {
    const client = new HighlightsClient(new FakeTransport())
    const first = client.getSnapshot()
    const second: HighlightsSnapshot = client.getSnapshot()
    expect(second).toBe(first)
  })
})

describe('bounded query', () => {
  it('delegates a page request to the transport without touching the snapshot', async () => {
    const transport = new FakeTransport()
    const query = vi.fn(async () => ({ items: [], total: 0 }))
    transport.query = query
    const client = new HighlightsClient(transport)
    const page = await client.query({ sessionId: 'session-1', limit: 10 })
    expect(page).toEqual({ items: [], total: 0 })
    expect(query).toHaveBeenCalledWith({ sessionId: 'session-1', limit: 10 }, undefined)
    expect(client.getSnapshot().status).toBe('idle')
  })
})
