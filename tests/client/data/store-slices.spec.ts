/**
 * Phase-2A store contract: per-session slices are identity-stable, paint epochs
 * only move when paint inputs change, and in-flight markers are observable.
 */
import { describe, expect, it } from 'vitest'

import { HighlightsClient } from '../../../src/client/data/client'
import type { HighlightsTransport } from '../../../src/client/data/transport'
import type { HighlightRecord } from '../../../src/shared/schema'

/** Transport stub: these tests never perform a read. */
const transport = {} as unknown as HighlightsTransport

/** One record in one session. */
function record(id: string, sessionId: string, version = 1): HighlightRecord {
  return {
    schemaVersion: 1,
    id,
    sessionId,
    origin: 'test',
    anchor: {
      nodeKey: '9:assistant1:1',
      kind: 'text',
      sourceIndex: 0,
      quote: 'quote',
      prefix: '',
      suffix: '',
      start: 0,
      end: 5,
      projection: 1,
    },
    colorId: 1,
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: 1,
    version,
  }
}

/** Two sessions with one record each. */
function seeded(): { client: HighlightsClient; a: HighlightRecord; b: HighlightRecord } {
  const client = new HighlightsClient(transport)
  const a = record('0190a000-0000-7000-8000-000000000001', 'session-a')
  const b = record('0190a000-0000-7000-8000-000000000002', 'session-b')
  client.applyRecords([a, b])
  return { client, a, b }
}

describe('store slices', () => {
  it('keeps a session slice identical across an unrelated session write', () => {
    const { client, a, b } = seeded()
    const before = client.recordsForSession('session-a')
    expect(before).toEqual([a])

    client.upsert({ ...b, starred: true, version: 2 })
    expect(client.recordsForSession('session-b')).toEqual([{ ...b, starred: true, version: 2 }])
    // Same array object: a selector comparing by Object.is does not re-render.
    expect(client.recordsForSession('session-a')).toBe(before)
  })

  it('replaces a session slice when that session changes', () => {
    const { client, a } = seeded()
    const before = client.recordsForSession('session-a')
    client.upsert({ ...a, starred: true, version: 2 })
    const after = client.recordsForSession('session-a')
    expect(after).not.toBe(before)
    expect(after[0]?.starred).toBe(true)
  })

  it('bumps paintEpoch only for records/stale changes', () => {
    const { client } = seeded()
    const start = client.getSnapshot().paintEpoch

    client.setHello({ protocol: 1 } as never)
    expect(client.getSnapshot().paintEpoch).toBe(start)

    client.beginInFlight('0190a000-0000-7000-8000-000000000001')
    expect(client.getSnapshot().paintEpoch).toBe(start)
    client.endInFlight('0190a000-0000-7000-8000-000000000001')

    client.setStaleForSession('session-a', ['0190a000-0000-7000-8000-000000000001'])
    expect(client.getSnapshot().paintEpoch).toBeGreaterThan(start)
  })

  it('keeps stale per session and the page union in sync', () => {
    const { client } = seeded()
    client.setStaleForSession('session-a', ['0190a000-0000-7000-8000-000000000001'])
    expect([...client.staleForSession('session-a')]).toEqual(['0190a000-0000-7000-8000-000000000001'])
    expect([...client.staleForSession('session-b')]).toEqual([])
    expect([...client.getSnapshot().stale]).toEqual(['0190a000-0000-7000-8000-000000000001'])

    client.setStaleForSession('session-a', [])
    expect([...client.getSnapshot().stale]).toEqual([])
  })

  it('exposes in-flight ids as an immutable snapshot', () => {
    const { client, a } = seeded()
    client.beginInFlight(a.id)
    expect(client.getSnapshot().inFlight.has(a.id)).toBe(true)
    client.endInFlight(a.id)
    expect(client.getSnapshot().inFlight.has(a.id)).toBe(false)
  })
})
