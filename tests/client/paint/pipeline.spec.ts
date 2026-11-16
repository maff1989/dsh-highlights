/**
 * Decoration pipeline contract: resolve once, emit descriptors, adapters write.
 */
import { describe, expect, it, vi } from 'vitest'

import type { DecorationAdapter, DecorationPass } from '../../../src/client/contracts/paint'
import { createDecorationPipeline } from '../../../src/client/paint/pipeline'
import type { Author, HighlightRecord } from '../../../src/shared/schema'

/** One record. */
function record(id: string, kind: 'text' | 'message' = 'text', colorId = 2, author?: Author): HighlightRecord {
  return {
    schemaVersion: 1,
    id,
    sessionId: 'session-1',
    origin: 'test',
    anchor: {
      nodeKey: '9:assistant1:1',
      kind,
      sourceIndex: 0,
      quote: 'q',
      prefix: '',
      suffix: '',
      start: 0,
      end: 1,
      projection: 1,
    },
    colorId: colorId as HighlightRecord['colorId'],
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    ...(author === undefined ? {} : { author }),
  }
}

/** Fake range object (the pipeline never touches DOM APIs itself). */
const range = { toString: () => 'range' } as unknown as Range

describe('decoration pipeline', () => {
  it('resolves once, emits descriptors and hands one pass to each adapter', () => {
    const apply = vi.fn<(pass: DecorationPass) => void>()
    const adapter: DecorationAdapter = { apply, dispose: vi.fn() }
    const resolve = vi.fn(() => ({
      ranges: new Map<string, Range>([['a', range], ['b', range]]),
      stale: new Map<string, string>([['c', 'node-absent']]),
    }))
    const pipeline = createDecorationPipeline({ adapters: [adapter], resolve })
    const result = pipeline.paint({ sessionId: 'session-1', records: [record('a'), record('b', 'message', 3), record('c')] })

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(result.descriptors.map(descriptor => descriptor.recordId)).toEqual(['a', 'b'])
    expect(result.descriptors[1]?.kind).toBe('message')
    expect(result.stale).toEqual(['c'])
    expect(apply.mock.calls[0]?.[0].stale).toEqual(['c'])
  })

  it('carries schema-v2 provenance and defaults an absent author to the user', () => {
    const pipeline = createDecorationPipeline({
      adapters: [],
      resolve: () => ({ ranges: new Map([['a', range], ['b', range]]), stale: new Map() }),
    })
    const result = pipeline.paint({
      sessionId: 's',
      records: [record('a'), record('b', 'text', 2, 'agent')],
    })
    expect(result.descriptors.map(descriptor => descriptor.author)).toEqual(['user', 'agent'])
    pipeline.dispose()
  })

  it('notifies descriptor listeners and stops after dispose', () => {
    const listener = vi.fn()
    const adapter: DecorationAdapter = { apply: vi.fn(), dispose: vi.fn() }
    const pipeline = createDecorationPipeline({
      adapters: [adapter],
      resolve: () => ({ ranges: new Map([['a', range]]), stale: new Map() }),
    })
    pipeline.onDescriptors(listener)
    pipeline.paint({ sessionId: 's', records: [record('a')] })
    expect(listener).toHaveBeenCalledTimes(1)
    pipeline.dispose()
    pipeline.paint({ sessionId: 's', records: [record('a')] })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(adapter.dispose).toHaveBeenCalledTimes(1)
  })
})
