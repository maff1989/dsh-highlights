// @vitest-environment jsdom
/**
 * Insertion queue routing and reliability (P0-5).
 *
 * A queued insertion names its destination session explicitly, drains only into
 * that session's bridge, is bounded to one retry timer per session with a 10 s
 * deadline, and prunes expired/corrupt persisted entries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InsertService, type PendingInsertion } from '../../../src/client/services/insert'
import {
  PENDING_INSERTION_TTL_MS,
  QUEUE_STORAGE_KEY,
} from '../../../src/shared/constants'
import type { HighlightRecord } from '../../../src/shared/schema'

/** Build a valid record. */
function record(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
  return {
    schemaVersion: 1,
    id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a5b',
    sessionId: 'source-session',
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

/** One bridge whose composer accepts or refuses by test control. */
function makeBridge(accept: () => boolean): {
  insertQuote: ReturnType<typeof vi.fn>
  insertText: ReturnType<typeof vi.fn>
} {
  return {
    insertQuote: vi.fn(() => accept()),
    insertText: vi.fn(() => true),
  }
}

/** The persisted queue as JSON. */
function storedQueue(): PendingInsertion[] {
  return JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) ?? '[]') as PendingInsertion[]
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('InsertService routing', () => {
  it('drains a queued insertion into the destination bridge only', () => {
    const service = new InsertService()
    const source = makeBridge(() => true)
    const destination = makeBridge(() => true)
    service.registerBridge('source-session', source)
    service.registerBridge('destination-session', destination)

    service.enqueue('destination-session', record(), 'summary', 'attribution')

    expect(destination.insertQuote).toHaveBeenCalledWith('the migration must land', 'summary')
    expect(destination.insertText).toHaveBeenCalledWith('\nattribution')
    expect(source.insertQuote).not.toHaveBeenCalled()
    expect(service.pendingFor('destination-session')).toHaveLength(0)
  })

  it('queues while the destination composer is absent and drains on registration', () => {
    const service = new InsertService()

    service.enqueue('destination-session', record(), 'summary')

    expect(service.pendingFor('destination-session')).toHaveLength(1)
    expect(storedQueue()).toHaveLength(1)

    const destination = makeBridge(() => true)
    service.registerBridge('destination-session', destination)

    expect(destination.insertQuote).toHaveBeenCalledTimes(1)
    expect(service.pendingFor('destination-session')).toHaveLength(0)
    expect(storedQueue()).toHaveLength(0)
  })

  it('inserts directly when the bridge accepts (no queue entry left)', () => {
    const service = new InsertService()
    const destination = makeBridge(() => true)
    service.registerBridge('destination-session', destination)

    expect(service.insert('destination-session', 'quote', 'summary', undefined)).toBe(true)
    expect(destination.insertQuote).toHaveBeenCalledWith('quote', 'summary')
    expect(service.pendingFor('destination-session')).toHaveLength(0)
  })

  it('returns false from insert when no bridge is mounted', () => {
    expect(new InsertService().insert('missing', 'quote', 'summary')).toBe(false)
  })

  it('consumes a pending queued entry when a direct insert succeeds before the retry', () => {
    const service = new InsertService()
    let accept = false
    const destination = {
      insertQuote: vi.fn(() => accept),
      insertText: vi.fn(() => true),
    }
    service.registerBridge('destination-session', destination)

    service.enqueue('destination-session', record(), 'summary')
    expect(service.pendingFor('destination-session')).toHaveLength(1)

    accept = true
    const inserted = service.insert('destination-session', record().anchor.quote, 'summary', undefined, record().id)

    expect(inserted).toBe(true)
    expect(service.pendingFor('destination-session')).toHaveLength(0)
    vi.advanceTimersByTime(2_500)
    // One refusal from enqueue + one successful direct insert; the retry must not fire again.
    expect(destination.insertQuote).toHaveBeenCalledTimes(2)
  })

  it('does not enqueue the same record twice for one destination', () => {
    const service = new InsertService()
    service.enqueue('destination-session', record(), 'summary')
    service.enqueue('destination-session', record(), 'summary')

    expect(service.pendingFor('destination-session')).toHaveLength(1)
    expect(storedQueue()).toHaveLength(1)
  })
})

describe('InsertService retry bound', () => {
  it('retries a refusing composer every 2 s and stops at the 10 s deadline', () => {
    const service = new InsertService()
    const refusing = makeBridge(() => false)
    service.registerBridge('destination-session', refusing)
    service.enqueue('destination-session', record(), 'summary')

    expect(refusing.insertQuote).toHaveBeenCalledTimes(1)
    for (let attempt = 0; attempt < 5; attempt += 1) vi.advanceTimersByTime(2_000)
    // Initial attempt + one per 2 s up to and including the 10 s deadline.
    expect(refusing.insertQuote).toHaveBeenCalledTimes(6)

    vi.advanceTimersByTime(60_000)
    expect(refusing.insertQuote).toHaveBeenCalledTimes(6)
    expect(service.pendingFor('destination-session')).toHaveLength(1)
  })

  it('keeps one retry timer per destination session and clears it on unregister', () => {
    const service = new InsertService()
    const first = makeBridge(() => false)
    const second = makeBridge(() => false)
    const disposeFirst = service.registerBridge('session-a', first)
    service.registerBridge('session-b', second)

    service.enqueue('session-a', record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' }), 'summary')
    service.enqueue('session-b', record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02' }), 'summary')
    disposeFirst()

    vi.advanceTimersByTime(60_000)
    // A stopped retrying when its bridge left; B kept its bounded retry loop.
    expect(first.insertQuote).toHaveBeenCalledTimes(1)
    expect(second.insertQuote).toHaveBeenCalledTimes(6)
  })
})

describe('InsertService persisted payloads', () => {
  it('drops entries older than the 24 h TTL when the bridge mounts', () => {
    const service = new InsertService()
    service.enqueue('destination-session', record(), 'summary')
    expect(service.pendingFor('destination-session')).toHaveLength(1)

    vi.setSystemTime(Date.now() + PENDING_INSERTION_TTL_MS + 60_000)
    const destination = makeBridge(() => true)
    service.registerBridge('destination-session', destination)

    expect(destination.insertQuote).not.toHaveBeenCalled()
    expect(service.pendingFor('destination-session')).toHaveLength(0)
    expect(storedQueue()).toHaveLength(0)
  })

  it('prunes corrupt entries and rewrites the queue on construction', () => {
    const now = Date.now()
    const good: PendingInsertion = {
      id: 'good:A',
      sessionId: 'session-a',
      quote: 'quote',
      summary: 'summary',
      attribution: undefined,
      createdAt: now,
    }
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify([
      { id: 1 },
      { id: '', sessionId: 'x', quote: 'q', summary: 's', createdAt: now },
      { id: 'expired:A', sessionId: 'session-a', quote: 'q', summary: 's', createdAt: now - PENDING_INSERTION_TTL_MS - 1 },
      { id: 'bad-quote:A', sessionId: 'session-a', quote: '', summary: 's', createdAt: now },
      good,
    ]))

    const service = new InsertService()

    expect(service.pendingFor('session-a')).toEqual([good])
    expect(storedQueue()).toEqual([good])
  })

  it('keeps the old queue shape readable (same fields, same storage key)', () => {
    const stored = {
      id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a5b:A',
      sessionId: 'session-a',
      quote: 'old entry',
      summary: 'summary',
      createdAt: Date.now(),
    }
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify([stored]))

    const service = new InsertService()

    expect(service.pendingFor('session-a')).toHaveLength(1)
    expect(service.pendingFor('session-a')[0]?.quote).toBe('old entry')
  })

  it('treats unreadable storage as an empty queue', () => {
    localStorage.setItem(QUEUE_STORAGE_KEY, '{not json')
    const service = new InsertService()
    expect(service.pendingFor('session-a')).toHaveLength(0)
    expect(storedQueue()).toEqual([])
  })
})
