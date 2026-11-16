/**
 * `query` endpoint contract (Phase 2B): filtering, ordering, cursor pagination,
 * summaries and the byte bound that replaces the unbounded `list` payload.
 */
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { QUERY_MAX_ITEMS_BYTES, queryRecords, summarize } from '../../src/host/query'
import { QUERY_MAX_LIMIT } from '../../src/shared/protocol'
import type { HighlightRecord } from '../../src/shared/schema'

let sequence = 0

/** Build one valid record. */
function record(overrides: Partial<HighlightRecord> & { readonly turn?: number; readonly sessionId?: string } = {}): HighlightRecord {
  sequence += 1
  const turn = overrides.turn ?? sequence
  return {
    schemaVersion: 1,
    id: `0190a000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
    sessionId: overrides.sessionId ?? 'session-a',
    origin: 'install',
    anchor: {
      nodeKey: `9:assistant${turn}:1`,
      kind: 'text',
      sourceIndex: 0,
      quote: `quote ${String(sequence)}`,
      prefix: 'prefix text that must not cross the wire in summaries',
      suffix: 'suffix text that must not cross the wire in summaries',
      start: 11,
      end: 11 + `quote ${String(sequence)}`.length,
      projection: 1,
      turn,
      step: 1,
    },
    colorId: ((sequence % 5) + 1) as HighlightRecord['colorId'],
    tags: sequence % 3 === 0 ? ['release', 'dev'] : [],
    ...(sequence % 7 === 0 ? { note: 'a note' } : {}),
    starred: sequence % 4 === 0,
    createdAt: 1_700_000_000_000 + sequence,
    updatedAt: 1_700_000_000_000 + sequence,
    version: 1,
    ...overrides,
  }
}

describe('host query', () => {
  it('filters by session, tag, starred and search text', () => {
    const records = [
      record({ sessionId: 'session-a' }),
      record({ sessionId: 'session-b' }),
      record({ sessionId: 'session-a', starred: true }),
      record({ sessionId: 'session-a', tags: ['release'] }),
      record({ sessionId: 'session-a', note: 'needle' }),
    ]
    const sessions = queryRecords(records, { sessionId: 'session-a' })
    expect(sessions.total).toBe(4)
    expect(sessions.items.every(item => item.sessionId === 'session-a')).toBe(true)

    expect(queryRecords(records, { tag: 'release' }).total).toBeGreaterThanOrEqual(1)
    expect(queryRecords(records, { starred: true }).items.every(item => item.starred)).toBe(true)
    expect(queryRecords(records, { q: 'needle' }).total).toBe(1)
  })

  it('orders by transcript position and pages with an opaque cursor', () => {
    const records = Array.from({ length: 250 }, (_, index) => record({ turn: 250 - index }))
    const first = queryRecords(records, { limit: 100 })
    expect(first.items).toHaveLength(100)
    expect(first.total).toBe(250)
    const firstTurn = (first.items[0] as HighlightRecord).anchor.turn
    expect(firstTurn).toBe(1)

    const second = queryRecords(records, { limit: 100, cursor: first.nextCursor })
    const third = queryRecords(records, { limit: 100, cursor: second.nextCursor })
    expect(second.items).toHaveLength(100)
    expect(third.items).toHaveLength(50)
    expect(third.nextCursor).toBeUndefined()

    const seen = new Set([...first.items, ...second.items, ...third.items].map(item => item.id))
    expect(seen.size).toBe(250)
  })

  it('treats a malformed cursor as the start of the list', () => {
    const records = [record(), record()]
    const page = queryRecords(records, { cursor: 'not-a-real-cursor', limit: 10 })
    expect(page.items).toHaveLength(2)
  })

  it('summaries omit the anchor context but keep the recognition fields', () => {
    const summary = summarize(record({ tags: ['release'], note: 'n' }))
    expect(summary.anchor.quote).toContain('quote')
    expect(summary.anchor).not.toHaveProperty('prefix')
    expect(summary.anchor).not.toHaveProperty('suffix')
    expect(summary).not.toHaveProperty('origin')
    expect(summary.tags).toEqual(['release'])
  })

  it('caps limit and keeps a 10k page under the byte bound', () => {
    const records = Array.from({ length: 10_000 }, () => record())
    const page = queryRecords(records, { limit: 10_000 })
    expect(page.items).toHaveLength(QUERY_MAX_LIMIT)
    const bytes = Buffer.byteLength(JSON.stringify({ items: page.items }), 'utf8')
    expect(bytes).toBeLessThanOrEqual(QUERY_MAX_ITEMS_BYTES)
    // The old failure mode was a multi-hundred-MiB list; a bounded page compresses well.
    expect(gzipSync(JSON.stringify(page)).byteLength).toBeLessThan(2 * 1024 * 1024)
  })

  it('returns full records when include is body', () => {
    const source = record({ note: 'with note' })
    const page = queryRecords([source], { include: 'body' })
    const item = page.items[0] as HighlightRecord
    expect(item.anchor.prefix).toBe(source.anchor.prefix)
    expect(item.note).toBe('with note')
  })
})
