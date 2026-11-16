/**
 * `HighlightStore` semantics over a fake storage domain.
 *
 * The real domain is an in-memory KV with a durable write chain; faking it at
 * the `Domain` interface keeps these tests about store policy (CAS, tombstones,
 * caps, purge, uuidv7) and fast enough to run per change.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'

import {
  HighlightStore,
  LimitError,
  NotFoundError,
  highlightsDomain,
  uuidv7,
  type HighlightsDomain,
  type StoreLimits,
} from '../../src/host/store'
import type { HighlightRecord, InstallRecord } from '../../src/shared/schema'
import type { SettingsRecord } from '../../src/shared/protocol'

const DAY_MS = 24 * 60 * 60 * 1000

/** One record, valid, at version 1. */
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

/** A create draft derived from {@link record}. */
function draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const {
    schemaVersion: _schemaVersion,
    version: _version,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    ...rest
  } = record()
  return { ...rest, ...overrides }
}

/** In-memory `KvTable` over a shared map, mirroring the domain contract. */
class FakeTable<V> implements KvTable<string, V> {
  constructor(private readonly map: Map<string, V>) {}

  get(key: string): V | undefined {
    return this.map.get(key)
  }

  *entries(): IterableIterator<[string, V]> {
    yield* [...this.map.entries()]
  }

  *keys(): IterableIterator<string> {
    yield* [...this.map.keys()]
  }

  get size(): number {
    return this.map.size
  }

  async put(key: string, value: V): Promise<void> {
    this.map.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.map.delete(key)
  }

  async deleteMany(keys: readonly string[]): Promise<number> {
    let removed = 0
    for (const key of keys) if (this.map.delete(key)) removed += 1
    return removed
  }

  async update(key: string, fn: (current: V) => V): Promise<V> {
    const current = this.map.get(key)
    if (current === undefined) throw new Error(`missing-key: ${key}`)
    const next = fn(current)
    this.map.set(key, next)
    return next
  }
}

/** The durable state a domain opens over; shared across reopen tests. */
interface Backend {
  readonly records: Map<string, HighlightRecord>
  readonly meta: Map<string, InstallRecord>
  readonly settings: Map<string, SettingsRecord>
}

/** Build an empty backend, optionally seeded. */
function backend(seed: Partial<{ records: HighlightRecord[]; install: InstallRecord; settings: SettingsRecord }> = {}): Backend {
  return {
    records: new Map((seed.records ?? []).map(item => [item.id, item])),
    meta: new Map(seed.install === undefined ? [] : [['install', seed.install]]),
    settings: new Map(seed.settings === undefined ? [] : [['settings', seed.settings]]),
  }
}

/** A fake domain over one backend. */
function domainOf(state: Backend) {
  const tables = new Map<string, FakeTable<unknown>>([
    ['records', new FakeTable(state.records)],
    ['meta', new FakeTable(state.meta)],
    ['settings', new FakeTable(state.settings)],
  ])
  const close = vi.fn(async () => {})
  const domain = {
    name: 'highlights',
    table: (name: string) => tables.get(name),
    close,
  } as unknown as Domain<HighlightsDomain>
  return { domain, close, tables }
}

/** A context whose storageDomain opens the given fake domain. */
function contextOf(domain: Domain<HighlightsDomain>): Context {
  return {
    storageDomain: { open: vi.fn(async () => domain) },
  } as unknown as Context
}

/** Open a store over a backend; `open` also ensures the install id and purges. */
async function openStore(
  state: Backend = backend(),
  limits: StoreLimits = { maxRecords: 10_000, tombstoneDays: 30 },
): Promise<{ store: HighlightStore; state: Backend; close: ReturnType<typeof vi.fn> }> {
  const { domain, close } = domainOf(state)
  const store = await HighlightStore.open(contextOf(domain), limits)
  return { store, state, close }
}

describe('uuidv7', () => {
  const SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  it('is a v7 UUID with the RFC variant bits', () => {
    for (const now of [0, 1_700_000_000_000, 2 ** 40]) {
      expect(uuidv7(now)).toMatch(SHAPE)
    }
  })

  it('embeds the millisecond timestamp big-endian in the first 48 bits', () => {
    for (const now of [0, 1, 1_000, 1_700_000_000_000, 2 ** 40]) {
      const hex = uuidv7(now).replace(/-/gu, '').slice(0, 12)
      expect(Number.parseInt(hex, 16)).toBe(now)
    }
  })

  it('sorts lexicographically by timestamp', () => {
    const times = [0, 1, 1_000, 2 ** 40, 1_700_000_000_000]
    for (let index = 0; index < times.length - 1; index += 1) {
      const earlier = times[index]
      const later = times[index + 1]
      if (earlier === undefined || later === undefined) continue
      expect(uuidv7(earlier) < uuidv7(later)).toBe(true)
    }
  })

  it('is unique across calls in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uuidv7(1_700_000_000_000)))
    expect(ids.size).toBe(200)
  })

  it('defaults to the current clock', () => {
    const before = Date.now()
    const decoded = Number.parseInt(uuidv7().replace(/-/gu, '').slice(0, 12), 16)
    const after = Date.now()
    expect(decoded).toBeGreaterThanOrEqual(before)
    expect(decoded).toBeLessThanOrEqual(after)
  })
})

describe('open', () => {
  it('mints and persists an install identity and reports the cap', async () => {
    const state = backend()
    const { store, close } = await openStore(state, { maxRecords: 42, tombstoneDays: 30 })

    expect(store.installId).toMatch(/^[0-9a-f-]{36}$/u)
    expect(store.maxRecords).toBe(42)
    expect(state.meta.get('install')?.installId).toBe(store.installId)
    expect(state.meta.get('install')?.createdAt).toBeTypeOf('number')

    await store.close()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('reuses the stored install identity on reopen', async () => {
    const state = backend()
    const first = await openStore(state)
    const installId = first.store.installId
    await first.store.close()

    const second = await openStore(state)
    expect(second.store.installId).toBe(installId)
    await second.store.close()
  })

  it('purges tombstoned records older than the retention window', async () => {
    const now = Date.now()
    const expired = record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', deletedAt: now - 31 * DAY_MS })
    const fresh = record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', deletedAt: now - 1 * DAY_MS })
    const live = record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03' })
    const state = backend({ records: [expired, fresh, live] })

    const { store } = await openStore(state)
    expect(state.records.has(expired.id)).toBe(false)
    expect(state.records.has(fresh.id)).toBe(true)
    expect(state.records.has(live.id)).toBe(true)
    expect(store.list().records.map(item => item.id)).toEqual([live.id])
    expect(store.list(true).records.map(item => item.id).sort()).toEqual([fresh.id, live.id].sort())
    await store.close()
  })
})

describe('create', () => {
  it('stamps identity, timestamps, version 1, and normalised tags', async () => {
    const { store, state } = await openStore()
    const created = await store.create(draft({ tags: ['#Release', ' release ', 'Migration'] }) as never, 1_700_000_000_000)

    expect(created).toMatchObject({
      id: record().id,
      schemaVersion: 1,
      version: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      tags: ['release', 'migration'],
      starred: false,
    })
    expect(created.note).toBeUndefined()
    expect(state.records.get(created.id)).toEqual(created)
    await store.close()
  })

  it('keeps an optional note when one is proposed', async () => {
    const { store } = await openStore()
    const created = await store.create(draft({ note: 'follow up' }) as never, 5)
    expect(created.note).toBe('follow up')
    await store.close()
  })

  it('refuses a write at the live-record cap', async () => {
    const { store } = await openStore(backend(), { maxRecords: 2, tombstoneDays: 30 })
    await store.create(draft({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' }) as never)
    await store.create(draft({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02' }) as never)

    await expect(store.create(draft({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03' }) as never))
      .rejects.toBeInstanceOf(LimitError)
    expect(store.countLive()).toBe(2)
    await store.close()
  })

  it('counts only live records against the cap', async () => {
    const { store } = await openStore(backend(), { maxRecords: 1, tombstoneDays: 30 })
    const created = await store.create(draft({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' }) as never)
    await store.remove(created.id, created.version)
    await expect(store.create(draft({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02' }) as never))
      .resolves.toMatchObject({ version: 1 })
    await store.close()
  })
})

describe('list and revision', () => {
  it('advances the revision on every durable change', async () => {
    const { store } = await openStore()
    expect(store.list().revision).toBe(1)

    const created = await store.create(draft() as never, 10)
    expect(store.list().revision).toBe(2)

    const updated = await store.update(created.id, created.version, { starred: true }, 11)
    expect(updated.status).toBe('written')
    expect(store.list().revision).toBe(3)

    const removed = await store.remove(created.id, 2, 12)
    expect(removed.status).toBe('written')
    expect(store.list().revision).toBe(4)
    await store.close()
  })

  it('hides tombstones unless asked for them', async () => {
    const { store } = await openStore()
    const created = await store.create(draft() as never, 10)
    await store.remove(created.id, created.version, 20)

    expect(store.list().records).toEqual([])
    const tombstones = store.list(true).records
    expect(tombstones).toHaveLength(1)
    expect(tombstones[0]?.deletedAt).toBe(20)
    await store.close()
  })
})

describe('update', () => {
  it('patches presentation fields and bumps the version', async () => {
    const { store } = await openStore()
    const created = await store.create(draft({ note: 'old' }) as never, 10)

    const result = await store.update(created.id, 1, {
      colorId: 4,
      tags: ['#Alpha', 'alpha', 'Beta'],
      note: null,
      starred: true,
    }, 20)
    expect(result.status).toBe('written')
    const written = result.record
    expect(written).toMatchObject({
      colorId: 4,
      tags: ['alpha', 'beta'],
      starred: true,
      version: 2,
      createdAt: 10,
      updatedAt: 20,
    })
    expect(written.note).toBeUndefined()
    await store.close()
  })

  it('keeps the note when the patch omits it', async () => {
    const { store } = await openStore()
    const created = await store.create(draft({ note: 'keep me' }) as never, 10)
    const result = await store.update(created.id, 1, { starred: true }, 20)
    expect(result.status).toBe('written')
    expect(result.record.note).toBe('keep me')
    await store.close()
  })

  it('returns the live record on a stale expected version without writing', async () => {
    const { store } = await openStore()
    const created = await store.create(draft() as never, 10)
    await store.update(created.id, 1, { starred: true }, 20)
    const revision = store.list().revision

    const stale = await store.update(created.id, 1, { colorId: 5 }, 30)
    expect(stale).toEqual({ status: 'conflict', record: expect.objectContaining({ version: 2, colorId: 1 }) })
    expect(store.list().revision).toBe(revision)
    await store.close()
  })

  it('rejects unknown or tombstoned ids', async () => {
    const { store } = await openStore()
    await expect(store.update('00000000-0000-7000-8000-000000000000', 1, { starred: true }))
      .rejects.toBeInstanceOf(NotFoundError)

    const created = await store.create(draft() as never, 10)
    await store.remove(created.id, 1, 20)
    await expect(store.update(created.id, 2, { starred: true })).rejects.toBeInstanceOf(NotFoundError)
    await store.close()
  })
})

describe('reanchor', () => {
  it('replaces the anchor and bumps the version', async () => {
    const { store } = await openStore()
    const created = await store.create(draft() as never, 10)
    const anchor = { ...created.anchor, start: 100, end: 123, nodeSeq: 9 }

    const result = await store.reanchor(created.id, 1, anchor, 20)
    expect(result.status).toBe('written')
    expect(result.record.anchor).toEqual(anchor)
    expect(result.record.version).toBe(2)
    expect(result.record.updatedAt).toBe(20)
    await store.close()
  })

  it('returns a conflict for a stale expected version', async () => {
    const { store } = await openStore()
    const created = await store.create(draft() as never, 10)
    const stale = await store.reanchor(created.id, 7, created.anchor, 20)
    expect(stale).toEqual({ status: 'conflict', record: expect.objectContaining({ version: 1 }) })
    await store.close()
  })
})

describe('remove and restore', () => {
  it('tombstones a live record and can restore it', async () => {
    const { store } = await openStore()
    const created = await store.create(draft() as never, 10)

    const removed = await store.remove(created.id, 1, 20)
    expect(removed.status).toBe('written')
    expect(removed.record).toMatchObject({ deletedAt: 20, version: 2 })
    expect(store.list().records).toEqual([])

    const restored = await store.restore(created.id, 2, 30)
    expect(restored.status).toBe('written')
    expect(restored.record.deletedAt).toBeUndefined()
    expect(restored.record.version).toBe(3)
    expect(store.list().records.map(item => item.id)).toEqual([created.id])
    await store.close()
  })

  it('does not tombstone on a stale remove', async () => {
    const { store } = await openStore()
    const created = await store.create(draft() as never, 10)
    await store.update(created.id, 1, { starred: true }, 20)

    const stale = await store.remove(created.id, 1, 30)
    expect(stale).toEqual({ status: 'conflict', record: expect.objectContaining({ version: 2 }) })
    expect(store.list().records).toHaveLength(1)
    await store.close()
  })

  it('rejects removing a missing or already-tombstoned record', async () => {
    const { store } = await openStore()
    await expect(store.remove('00000000-0000-7000-8000-000000000000', 1))
      .rejects.toBeInstanceOf(NotFoundError)

    const created = await store.create(draft() as never, 10)
    await store.remove(created.id, 1, 20)
    await expect(store.remove(created.id, 2, 30)).rejects.toBeInstanceOf(NotFoundError)
    await store.close()
  })

  it('returns a conflict on a stale restore', async () => {
    const { store } = await openStore()
    const created = await store.create(draft() as never, 10)
    await store.remove(created.id, 1, 20)
    const stale = await store.restore(created.id, 1, 30)
    expect(stale).toEqual({ status: 'conflict', record: expect.objectContaining({ version: 2 }) })
    await store.close()
  })

  it('rejects restoring a missing record', async () => {
    const { store } = await openStore()
    await expect(store.restore('00000000-0000-7000-8000-000000000000', 1))
      .rejects.toBeInstanceOf(NotFoundError)
    await store.close()
  })
})

describe('purgeTombstones', () => {
  it('deletes only tombstones older than the retention window', async () => {
    const { store, state } = await openStore(backend(), { maxRecords: 100, tombstoneDays: 30 })
    const old = await store.create(draft({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' }) as never, 0)
    const recent = await store.create(draft({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02' }) as never, 0)
    await store.remove(old.id, old.version, 0)
    await store.remove(recent.id, recent.version, 20 * DAY_MS)

    const purged = await store.purgeTombstones(31 * DAY_MS)
    expect(purged).toBe(1)
    expect(state.records.has(old.id)).toBe(false)
    expect(state.records.has(recent.id)).toBe(true)
    await store.close()
  })

  it('does nothing when no tombstone has expired', async () => {
    const { store } = await openStore()
    const created = await store.create(draft() as never, 0)
    await store.remove(created.id, 1, 0)
    const revision = store.list().revision

    expect(await store.purgeTombstones(DAY_MS)).toBe(0)
    expect(store.list().revision).toBe(revision)
    await store.close()
  })
})

describe('hardening (Phase 2B)', () => {
  it('declares backup-and-skip so one invalid record cannot disable the domain', () => {
    expect((highlightsDomain as { invalidRecords?: string }).invalidRecords).toBe('backup-and-skip')
  })

  it('stamps the Host install id as origin instead of trusting the draft', async () => {
    const { store } = await openStore()
    const created = await store.create(draft({ origin: 'someone-else' }) as never)
    expect(created.origin).toBe(store.installId)
  })

  it('refuses a reused id (put-if-absent)', async () => {
    const { store } = await openStore()
    await store.create(draft() as never)
    await expect(store.create(draft() as never)).rejects.toThrow(/already exists/u)
  })

  it('keeps quote and kind immutable across a re-anchor', async () => {
    const { store } = await openStore(backend({ records: [record()] }))
    await expect(store.reanchor(record().id, 1, { ...record().anchor, quote: 'different text' })).rejects.toThrow(/quote is immutable/u)
    await expect(store.reanchor(record().id, 1, { ...record().anchor, kind: 'message' })).rejects.toThrow(/kind is immutable/u)
  })

  it('moves updatedAt monotonically even when the clock does not advance', async () => {
    const { store } = await openStore(backend({ records: [record()] }))
    const first = await store.update(record().id, 1, { starred: true }, 5)
    expect(first.record.updatedAt).toBeGreaterThan(record().updatedAt)
    const second = await store.update(record().id, first.record.version, { starred: false }, 5)
    expect(second.record.updatedAt).toBeGreaterThan(first.record.updatedAt)
  })
})
