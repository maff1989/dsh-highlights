/**
 * Settings: Host-side store semantics and the two route endpoints.
 *
 * The settings record is security-relevant (agent access gates model-facing
 * behaviour), so these tests pin the properties the rest of the feature relies
 * on: synchronous Host reads, a Host-enforced consent invariant, compare-and-set
 * writes, and full Host-side validation of every browser payload.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { Logger } from '@deepseek-ai/cordis'

import { createHighlightsRoute, HIGHLIGHTS_ROUTE_PATH } from '../../src/host/route'
import {
  HighlightStore,
  SettingsInvariantError,
  highlightsDomain,
  type HighlightsDomain,
} from '../../src/host/store'
import type { SettingsRecord } from '../../src/shared/protocol'
import type { HighlightRecord, InstallRecord } from '../../src/shared/schema'

/** In-memory `KvTable` over one map, mirroring the domain contract. */
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

/** The durable state one fake domain opens over. */
interface Backend {
  readonly records: Map<string, HighlightRecord>
  readonly meta: Map<string, InstallRecord>
  readonly settings: Map<string, SettingsRecord>
}

/** A fake domain over one backend. */
function domainOf(state: Backend) {
  const tables = new Map<string, FakeTable<unknown>>([
    ['records', new FakeTable(state.records)],
    ['meta', new FakeTable(state.meta)],
    ['settings', new FakeTable(state.settings)],
  ])
  const domain = {
    name: 'highlights',
    table: (name: string) => tables.get(name),
    close: async () => {},
  } as unknown as Domain<HighlightsDomain>
  return domain
}

/** A context whose storageDomain opens the given fake domain. */
function contextOf(domain: Domain<HighlightsDomain>): Context {
  return { storageDomain: { open: async () => domain } } as unknown as Context
}

/**
 * Open a real store over an in-memory backend.
 * @returns the store plus the durable maps to assert against.
 */
async function openStore(): Promise<{ store: HighlightStore; state: Backend }> {
  const state: Backend = { records: new Map(), meta: new Map(), settings: new Map() }
  const store = await HighlightStore.open(contextOf(domainOf(state)), { maxRecords: 10_000, tombstoneDays: 30 })
  return { store, state }
}

describe('store settings', () => {
  it('serves the consent-off defaults synchronously without materialising a record', async () => {
    const { store, state } = await openStore()
    expect(store.settings()).toEqual({
      version: 0,
      agentAccess: 'off',
      agentScope: 'session',
      defaultColorId: 3,
      createdAt: 0,
      updatedAt: 0,
    })
    expect(store.agentAccess).toBe('off')
    expect(store.agentScope).toBe('session')
    expect(store.tombstoneRetentionDays).toBe(30)
    expect(state.settings.size).toBe(0)
    await store.close()
  })

  it('writes the first record with the read version and reads it back synchronously', async () => {
    const { store, state } = await openStore()
    const result = await store.setSettings(0, { agentAccess: 'read' }, 1_000)
    expect(result.status).toBe('written')
    expect(result.settings).toMatchObject({
      version: 1,
      agentAccess: 'read',
      agentScope: 'session',
      defaultColorId: 3,
      createdAt: 1_000,
    })
    // Synchronous Host read: no await, and the write already landed in memory.
    expect(store.agentAccess).toBe('read')
    expect(state.settings.get('settings')?.agentAccess).toBe('read')
    await store.close()
  })

  it('increments the version and keeps unspecified fields', async () => {
    const { store } = await openStore()
    await store.setSettings(0, { agentAccess: 'read', agentScope: 'workspace' }, 1_000)
    const second = await store.setSettings(1, { defaultColorId: 5 }, 2_000)
    expect(second.status).toBe('written')
    expect(second.settings).toMatchObject({ version: 2, agentAccess: 'read', agentScope: 'workspace', defaultColorId: 5 })
    await store.close()
  })

  it('returns a conflict with the live record for a stale version', async () => {
    const { store } = await openStore()
    await store.setSettings(0, { agentAccess: 'read' })
    const result = await store.setSettings(0, { agentAccess: 'read-write' })
    expect(result).toEqual({ status: 'conflict', settings: expect.objectContaining({ version: 1, agentAccess: 'read' }) })
    expect(store.agentAccess).toBe('read')
    await store.close()
  })

  it('narrows the scope to session when access is turned off', async () => {
    const { store } = await openStore()
    await store.setSettings(0, { agentAccess: 'read', agentScope: 'all' })
    const off = await store.setSettings(1, { agentAccess: 'off' })
    expect(off.settings).toMatchObject({ agentAccess: 'off', agentScope: 'session' })
    await store.close()
  })

  it('refuses to widen the scope while access is off', async () => {
    const { store } = await openStore()
    await expect(store.setSettings(0, { agentScope: 'workspace' })).rejects.toBeInstanceOf(SettingsInvariantError)
    expect(store.settings().agentScope).toBe('session')
    await store.close()
  })

  it('validates the merged record before the durable write', async () => {
    const { store, state } = await openStore()
    await expect(store.setSettings(0, { defaultColorId: 9 as unknown as 1 })).rejects.toThrow()
    expect(state.settings.size).toBe(0)
    await store.close()
  })

  it('serialises concurrent first writes so only one record lands', async () => {
    const { store, state } = await openStore()
    const first = await Promise.all([
      store.setSettings(0, { agentAccess: 'read' }),
      store.setSettings(0, { agentAccess: 'read-write' }),
    ])
    expect(first.filter(result => result.status === 'written')).toHaveLength(1)
    expect(first.filter(result => result.status === 'conflict')).toHaveLength(1)
    expect(state.settings.size).toBe(1)
    await store.close()
  })
})

/** A store fake surface used by the settings endpoints. */
function fakeStore(seed: SettingsRecord) {
  const current = { value: seed }
  return {
    settings: vi.fn(() => current.value),
    tombstoneRetentionDays: 30,
    setSettings: vi.fn(async (expectedVersion: number, patch: { agentAccess?: string; agentScope?: string; defaultColorId?: number }) => {
      if (expectedVersion !== current.value.version) return { status: 'conflict' as const, settings: current.value }
      current.value = { ...current.value, ...patch } as SettingsRecord
      return { status: 'written' as const, settings: current.value }
    }),
  }
}

/** A logger that records calls. */
function fakeLogger() {
  return { name: 'test', error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}

/** POST one payload to the route under test. */
async function post(route: ReturnType<typeof createHighlightsRoute>, endpoint: string, payload: unknown): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }> {
  const response = await route.fetch(new Request(`http://localhost${HIGHLIGHTS_ROUTE_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint, payload }),
  }))
  expect(response.status).toBe(200)
  return await response.json() as { ok: boolean; value?: unknown; error?: { code: string; message: string } }
}

/** Route harness over the fake store. */
function harness() {
  const store = fakeStore({
    version: 1,
    agentAccess: 'off',
    agentScope: 'session',
    defaultColorId: 3,
    createdAt: 1,
    updatedAt: 1,
  })
  const route = createHighlightsRoute(store as unknown as HighlightStore, { maxRecords: 10_000, insertionAttribution: true, pollIntervalMs: 0 }, fakeLogger() as unknown as Logger)
  return { store, route }
}

describe('route settings endpoints', () => {
  it('getSettings returns the record with the deployment retention', async () => {
    const { store, route } = harness()
    const reply = await post(route, 'getSettings', {})
    expect(reply.ok).toBe(true)
    expect(reply.value).toEqual({
      settings: expect.objectContaining({ agentAccess: 'off', agentScope: 'session' }),
      retentionDays: 30,
    })
    expect(store.settings).toHaveBeenCalled()
  })

  it('setSettings validates the payload and returns the Host record', async () => {
    const { store, route } = harness()
    const reply = await post(route, 'setSettings', { expectedVersion: 1, patch: { agentAccess: 'read' } })
    expect(reply.ok).toBe(true)
    expect(store.setSettings).toHaveBeenCalledWith(1, { agentAccess: 'read' })
    expect(reply.value).toMatchObject({ status: 'written', settings: { agentAccess: 'read' } })
  })

  it('rejects an unknown field as bad-request', async () => {
    const { store, route } = harness()
    const reply = await post(route, 'setSettings', { expectedVersion: 1, patch: { agentAccess: 'read', admin: true } })
    expect(reply.ok).toBe(false)
    expect(reply.error?.code).toBe('bad-request')
    expect(store.setSettings).not.toHaveBeenCalled()
  })

  it('rejects an invalid access level and a negative version', async () => {
    const { store, route } = harness()
    expect((await post(route, 'setSettings', { expectedVersion: 1, patch: { agentAccess: 'write' } })).error?.code).toBe('bad-request')
    expect((await post(route, 'setSettings', { expectedVersion: -1, patch: {} })).error?.code).toBe('bad-request')
    expect(store.setSettings).not.toHaveBeenCalled()
  })

  it('reports the consent invariant as bad-request', async () => {
    const { route } = harness()
    const store = fakeStore({
      version: 0,
      agentAccess: 'off',
      agentScope: 'session',
      defaultColorId: 3,
      createdAt: 0,
      updatedAt: 0,
    })
    store.setSettings.mockRejectedValueOnce(new SettingsInvariantError('agent scope cannot widen while agent access is off'))
    const tolerant = createHighlightsRoute(store as unknown as HighlightStore, { maxRecords: 10_000, insertionAttribution: true, pollIntervalMs: 0 }, fakeLogger() as unknown as Logger)
    const reply = await post(tolerant, 'setSettings', { expectedVersion: 0, patch: { agentScope: 'all' } })
    expect(reply.error?.code).toBe('bad-request')
    // The harness route itself is still valid and untouched.
    expect((await post(route, 'getSettings', {})).ok).toBe(true)
  })

  it('returns a conflict value for a stale version', async () => {
    const { store, route } = harness()
    const reply = await post(route, 'setSettings', { expectedVersion: 0, patch: { agentAccess: 'read' } })
    expect(reply.ok).toBe(true)
    expect(reply.value).toMatchObject({ status: 'conflict' })
    expect(store.setSettings).toHaveBeenCalledWith(0, { agentAccess: 'read' })
  })
})
