/**
 * Action-layer write outcomes (P0-3): conflicts are values, never silent, and a
 * non-written delete never hides the record.
 */
import { describe, expect, it, vi } from 'vitest'
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

/** One controllable transport. */
class StubTransport implements HighlightsTransport {
  readonly hello = vi.fn(async (): Promise<HelloValue> => HELLO)
  readonly list = vi.fn(async (): Promise<ListValue> => ({ revision: 1, records: [] }))
  readonly create = vi.fn(async (record: Parameters<HighlightsTransport['create']>[0]): Promise<HighlightRecord> => ({
    ...record,
    schemaVersion: 1,
    version: 1,
    createdAt: 10,
    updatedAt: 10,
  }))
  readonly update = vi.fn(async (): Promise<WriteValue> => { throw new Error('update not configured') })
  readonly reanchor = vi.fn(async (): Promise<WriteValue> => { throw new Error('reanchor not configured') })
  readonly remove = vi.fn(async (): Promise<WriteValue> => { throw new Error('remove not configured') })
  readonly restore = vi.fn(async (): Promise<WriteValue> => { throw new Error('restore not configured') })
  readonly query = vi.fn(async (): Promise<{ items: readonly never[]; total: number }> => ({ items: [], total: 0 }))
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

/** Fake client context with only the faces the action object touches. */
function makeCtx(create: () => Promise<string> = async () => 'new-session'): ClientContext {
  return {
    sessions: { create: vi.fn(create) },
    uiWorkspace: { openSession: vi.fn() },
    layout: { selectPanel: vi.fn() },
    sidebarRight: { openTab: vi.fn() },
  } as unknown as ClientContext
}

/** Build the action object over a real store and stub transport. */
function harness(options: { create?: () => Promise<string>; records?: HighlightRecord[] } = {}): {
  actions: HighlightsActionsImpl
  client: HighlightsClient
  transport: StubTransport
  insert: InsertService
  ctx: ClientContext
} {
  const transport = new StubTransport()
  const client = new HighlightsClient(transport)
  client.applyRecords(options.records ?? [record()])
  const ctx = makeCtx(options.create)
  const insert = new InsertService()
  const deps: ActionsDeps = {
    ctx,
    client,
    transport,
    painter: { supported: true } as unknown as HighlightsPainter,
    insert,
    translate: key => key,
  }
  return { actions: new HighlightsActionsImpl(deps), client, transport, insert, ctx }
}

/** Let a fire-and-forget refresh issue its transport calls. */
function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('update', () => {
  it('writes with the snapshot version and publishes the confirmed record', async () => {
    const { actions, client, transport } = harness()
    const live = record({ version: 2, starred: true })
    transport.update.mockResolvedValueOnce({ status: 'written', record: live })

    const outcome = await actions.update(live.id, { starred: true })

    expect(outcome).toEqual({ status: 'written', record: live })
    expect(transport.update).toHaveBeenCalledWith(live.id, 1, { starred: true })
    expect(client.getSnapshot().byId.get(live.id)).toEqual(live)
  })

  it('passes an explicit overwrite version instead of the snapshot version', async () => {
    const { actions, transport } = harness()
    const live = record({ version: 4 })
    transport.update.mockResolvedValueOnce({ status: 'written', record: live })

    await actions.update(live.id, { note: 'mine' }, 4)

    expect(transport.update).toHaveBeenCalledWith(live.id, 4, { note: 'mine' })
  })

  it('optimistically applies the patch, then publishes the authoritative conflict record', async () => {
    const { actions, client, transport } = harness()
    const local = record({ version: 1, note: 'my draft' })
    const live = record({ version: 3, note: 'other tab' })
    transport.update.mockResolvedValueOnce({ status: 'conflict', record: live })

    const outcome = await actions.update(local.id, { note: 'my draft' })

    expect(outcome).toEqual({ status: 'conflict', record: live })
    // The store holds the Host's live value; the editing surface keeps its draft.
    expect(client.getSnapshot().byId.get(local.id)).toEqual(live)
  })

  it('rolls the optimistic patch back on transport failure without a full re-read', async () => {
    const { actions, client, transport } = harness()
    const original = record()
    transport.update.mockRejectedValueOnce(new Error('route unreachable'))

    const outcome = await actions.update(original.id, { starred: true })
    await tick()

    expect(outcome).toEqual({ status: 'error', error: 'route unreachable' })
    expect(client.getSnapshot().byId.get(original.id)).toEqual(original)
    // A failed write is not a reason to re-read the whole store.
    expect(transport.list).not.toHaveBeenCalled()
  })

  it('errors when the record is not in the snapshot', async () => {
    const { actions } = harness({ records: [] })
    expect(await actions.update(record().id, { starred: true })).toEqual({ status: 'error', error: 'error.notFound' })
  })
})

describe('remove', () => {
  it('hides the record only after a written result and keeps it for Undo', async () => {
    const { actions, client, transport } = harness()
    const tombstone = record({ version: 2, deletedAt: 20 })
    transport.remove.mockResolvedValueOnce({ status: 'written', record: tombstone })

    const outcome = await actions.remove(tombstone.id)

    expect(outcome).toEqual({ status: 'written', record: tombstone })
    expect(client.getSnapshot().byId.get(tombstone.id)).toBeUndefined()
  })

  it('restores a conflicted delete and offers no fabricated undo', async () => {
    const { actions, client, transport } = harness()
    const live = record({ version: 5 })
    transport.remove.mockResolvedValueOnce({ status: 'conflict', record: live })

    const outcome = await actions.remove(live.id)

    expect(outcome).toEqual({ status: 'conflict', record: live })
    // The optimistic hide is rolled back to the Host's live record.
    expect(client.getSnapshot().byId.get(live.id)).toEqual(live)
    // No removed entry was created, so restore cannot fabricate a write.
    expect(await actions.restore(live.id)).toEqual({ status: 'error', error: 'error.notFound' })
  })

  it('rolls an optimistic delete back when the transport fails', async () => {
    const { actions, client, transport } = harness()
    const original = record()
    transport.remove.mockRejectedValueOnce(new Error('route unreachable'))

    const outcome = await actions.remove(original.id)

    expect(outcome).toEqual({ status: 'error', error: 'route unreachable' })
    expect(client.getSnapshot().byId.get(original.id)).toEqual(original)
    expect(transport.list).not.toHaveBeenCalled()
  })
})

describe('restore', () => {
  it('restores with the tombstone version and republishes the record', async () => {
    const { actions, client, transport } = harness()
    const tombstone = record({ version: 2, deletedAt: 20 })
    transport.remove.mockResolvedValueOnce({ status: 'written', record: tombstone })
    await actions.remove(tombstone.id)
    const restored = record({ version: 3 })
    transport.restore.mockResolvedValueOnce({ status: 'written', record: restored })

    const outcome = await actions.restore(tombstone.id)

    expect(outcome).toEqual({ status: 'written', record: restored })
    expect(transport.restore).toHaveBeenCalledWith(tombstone.id, 2)
    expect(client.getSnapshot().byId.get(tombstone.id)).toEqual(restored)
  })

  it('treats a record another surface already restored as live, without a version bump', async () => {
    const { actions, client, transport } = harness()
    const tombstone = record({ version: 2, deletedAt: 20 })
    transport.remove.mockResolvedValueOnce({ status: 'written', record: tombstone })
    await actions.remove(tombstone.id)
    // A background read republished a newer live version: the Undo is already satisfied.
    const live = record({ version: 7 })
    client.upsert(live)

    const outcome = await actions.restore(tombstone.id)

    expect(outcome).toEqual({ status: 'written', record: live })
    expect(transport.restore).not.toHaveBeenCalled()
  })

  it('reports a restore conflict without touching the snapshot', async () => {
    const { actions, transport } = harness()
    const tombstone = record({ version: 2, deletedAt: 20 })
    transport.remove.mockResolvedValueOnce({ status: 'written', record: tombstone })
    await actions.remove(tombstone.id)
    const live = record({ version: 9 })
    transport.restore.mockResolvedValueOnce({ status: 'conflict', record: live })

    expect(await actions.restore(tombstone.id)).toEqual({ status: 'conflict', record: live })
  })
})

describe('insert routing', () => {
  it('inserts into the on-screen session for `current`, not the record session', async () => {
    const { actions, insert } = harness()
    const spy = vi.spyOn(insert, 'insert').mockReturnValue(true)

    const outcome = await actions.insert(record({ sessionId: 'record-session' }), { kind: 'current' }, 'on-screen')

    expect(outcome).toBe('inserted')
    expect(spy).toHaveBeenCalledWith('on-screen', 'the migration must land', expect.any(String), undefined, expect.any(String))
  })

  it('queues for the on-screen session when its composer is unavailable', async () => {
    const { actions, insert } = harness()
    vi.spyOn(insert, 'insert').mockReturnValue(false)
    const enqueue = vi.spyOn(insert, 'enqueue').mockImplementation(() => undefined)

    const outcome = await actions.insert(record({ sessionId: 'record-session' }), { kind: 'current' }, 'on-screen')

    expect(outcome).toBe('queued')
    expect(enqueue).toHaveBeenCalledWith('on-screen', expect.objectContaining({ sessionId: 'record-session' }), expect.any(String), undefined)
  })

  it('creates a session and queues only for the new id for `new`', async () => {
    const { actions, insert, ctx } = harness({ create: async () => 'created-session' })
    const enqueue = vi.spyOn(insert, 'enqueue').mockImplementation(() => undefined)

    const outcome = await actions.insert(record({ sessionId: 'record-session', workspaceId: 'ws-1' }), { kind: 'new' })

    expect(outcome).toBe('queued')
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue.mock.calls[0]?.[0]).toBe('created-session')
    expect(ctx.sessions.create).toHaveBeenCalledWith({ workspaceId: 'ws-1' })
    expect(ctx.uiWorkspace.openSession).toHaveBeenCalledWith('created-session')
    expect(enqueue.mock.calls[0]?.[0]).not.toBe('record-session')
  })

  it('fails without queuing when session creation fails', async () => {
    const { actions, insert } = harness({ create: async () => { throw new Error('no workspace') } })
    const enqueue = vi.spyOn(insert, 'enqueue').mockImplementation(() => undefined)

    const outcome = await actions.insert(record(), { kind: 'new' })

    expect(outcome).toBe('failed')
    expect(enqueue).not.toHaveBeenCalled()
  })
})

describe('single-flight mutations', () => {
  it('rejects a second update while the first is still in flight', async () => {
    const { actions, transport } = harness()
    const live = record({ starred: true })
    let resolveWrite!: (value: WriteValue) => void
    transport.update.mockImplementationOnce(() => new Promise<WriteValue>(resolve => { resolveWrite = resolve }))

    const first = actions.update(record().id, { starred: true })
    const second = await actions.update(record().id, { starred: false })

    expect(second).toEqual({ status: 'error', error: 'error.busy' })
    resolveWrite({ status: 'written', record: live })
    await expect(first).resolves.toEqual({ status: 'written', record: live })
    expect(transport.update).toHaveBeenCalledTimes(1)
  })

  it('rejects a second delete while the first is in flight', async () => {
    const { actions, transport } = harness()
    let resolveWrite!: (value: WriteValue) => void
    transport.remove.mockImplementationOnce(() => new Promise<WriteValue>(resolve => { resolveWrite = resolve }))

    const first = actions.remove(record().id)
    const second = await actions.remove(record().id)
    expect(second).toEqual({ status: 'error', error: 'error.busy' })
    resolveWrite({ status: 'written', record: record({ deletedAt: 5 }) })
    await expect(first).resolves.toEqual({ status: 'written', record: record({ deletedAt: 5 }) })
    expect(transport.remove).toHaveBeenCalledTimes(1)
  })
})
