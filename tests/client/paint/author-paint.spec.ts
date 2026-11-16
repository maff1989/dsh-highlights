// @vitest-environment jsdom
/**
 * Agent-authored paint (schema v2 provenance, plan T3.3).
 *
 * A user's judgement and the agent's annotation share one store but must not
 * share one visual language: user items keep the shipped `dsh-hl-<slot>` wash,
 * agent items paint under `dsh-hl-agent-<slot>` so the stylesheet can add a
 * provenance mark (dotted underline) without touching the user's paint. A record
 * written before schema v2 has no `author` field and must still paint as user.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DecorationAdapter } from '../../../src/client/contracts/paint'
import { createCssHighlightAdapter } from '../../../src/client/paint/adapters'
import { HighlightsPainter } from '../../../src/client/paint/adapters/css-highlights'
import { createDecorationPipeline } from '../../../src/client/paint/pipeline'
import { GLOBAL_STYLES } from '../../../src/client/styles'
import type { Author, HighlightRecord } from '../../../src/shared/schema'

/** One stored record; `author` omitted models a schema-v1 record. */
function record(id: string, options: { author?: Author; colorId?: 1 | 2 | 3 | 4 | 5; kind?: 'text' | 'message' } = {}): HighlightRecord {
  return {
    schemaVersion: 1,
    id,
    sessionId: 'session-1',
    origin: 'test',
    anchor: {
      nodeKey: '14:assistant-step4:2',
      kind: options.kind ?? 'text',
      sourceIndex: 0,
      quote: 'The migration must land before the release.',
      prefix: '',
      suffix: '',
      start: 0,
      end: 44,
      projection: 1,
    },
    colorId: options.colorId ?? 2,
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: 2,
    version: 1,
    ...(options.author === undefined ? {} : { author: options.author }),
  }
}

/** Range-like fixture: the fake resolve stage never touches the browser. */
function fakeRange(id: string): Range {
  return { toString: () => id } as unknown as Range
}

/** Install a fake CSS.highlights registry backed by a Map. */
function fakeRegistry(): { readonly names: Map<string, unknown>; restore(): void } {
  const names = new Map<string, unknown>()
  const previousCSS = Object.getOwnPropertyDescriptor(globalThis, 'CSS')
  const previousHighlight = Object.getOwnPropertyDescriptor(globalThis, 'Highlight')
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: {
      highlights: {
        set: (name: string, value: unknown) => { names.set(name, value) },
        delete: (name: string) => names.delete(name),
      },
    },
  })
  /** Minimal Highlight stand-in (the painter spreads ranges as constructor args). */
  class FakeHighlight {
    readonly ranges: readonly Range[]
    constructor(...ranges: Range[]) { this.ranges = ranges }
  }
  Object.defineProperty(globalThis, 'Highlight', { configurable: true, value: FakeHighlight })
  return {
    names,
    restore() {
      if (previousCSS === undefined) delete (globalThis as { CSS?: unknown }).CSS
      else Object.defineProperty(globalThis, 'CSS', previousCSS)
      if (previousHighlight === undefined) delete (globalThis as { Highlight?: unknown }).Highlight
      else Object.defineProperty(globalThis, 'Highlight', previousHighlight)
    },
  }
}

/** Resolve stage that answers every record with a fresh range. */
const resolveAllRecords = (records: readonly HighlightRecord[]) => ({
  ranges: new Map(records.map(item => [item.id, fakeRange(item.id)])),
  stale: new Map<string, unknown>(),
})

/** The declaration block of one selector in the global sheet. */
function rule(selector: string): string {
  const start = GLOBAL_STYLES.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`selector not found: ${selector}`)
  const end = GLOBAL_STYLES.indexOf('}', start)
  return GLOBAL_STYLES.slice(start, end + 1)
}

/** The registry installed for the current test. */
let registry: { readonly names: Map<string, unknown>; restore(): void }

beforeEach(() => {
  registry = fakeRegistry()
})

afterEach(() => {
  registry.restore()
})

describe('agent paint names', () => {
  it('keeps the user wash on the shipped names and namespaces agent items', () => {
    const painter = new HighlightsPainter()
    const adapter = createCssHighlightAdapter(painter)
    const pipeline = createDecorationPipeline({ adapters: [adapter], resolve: resolveAllRecords })

    const user = record('user-1', { colorId: 2 })
    const agent = record('agent-1', { author: 'agent', colorId: 2 })
    const legacy = record('legacy-1', { colorId: 2 })
    pipeline.paint({ sessionId: 'session-1', records: [user, agent, legacy] })

    expect(registry.names.has('dsh-hl-2')).toBe(true)
    expect(registry.names.has('dsh-hl-agent-2')).toBe(true)
    // User and pre-schema records share the user bucket; only the agent differs.
    const userBucket = registry.names.get('dsh-hl-2') as { ranges: readonly Range[] }
    expect(userBucket.ranges).toHaveLength(2)
    const agentBucket = registry.names.get('dsh-hl-agent-2') as { ranges: readonly Range[] }
    expect(agentBucket.ranges).toHaveLength(1)

    // Dropping the agent record from the pass must clear its registry entry.
    pipeline.paint({ sessionId: 'session-1', records: [user, legacy] })
    expect(registry.names.has('dsh-hl-agent-2')).toBe(false)
    expect(registry.names.has('dsh-hl-2')).toBe(true)
    pipeline.dispose()
  })

  it('paints one agent item under the agent name for its own palette slot', () => {
    const painter = new HighlightsPainter()
    const adapter = createCssHighlightAdapter(painter)
    const pipeline = createDecorationPipeline({ adapters: [adapter], resolve: resolveAllRecords })

    pipeline.paint({ sessionId: 'session-1', records: [record('agent-3', { author: 'agent', colorId: 4 })] })
    expect(registry.names.has('dsh-hl-agent-4')).toBe(true)
    expect(registry.names.has('dsh-hl-4')).toBe(false)
    pipeline.dispose()
  })

  it('keeps the legacy painter.paint path author-aware too', () => {
    const painter = new HighlightsPainter()
    const user = record('user-1', { colorId: 3 })
    const agent = record('agent-1', { author: 'agent', colorId: 3 })
    const ranges = new Map([[user.id, fakeRange(user.id)], [agent.id, fakeRange(agent.id)]])

    painter.paint([user, agent], ranges, [])
    expect(registry.names.has('dsh-hl-3')).toBe(true)
    expect(registry.names.has('dsh-hl-agent-3')).toBe(true)
    painter.dispose()
    expect(registry.names.size).toBe(0)
  })

  it('leaves the user paint byte-identical: same name, colour variable and no decoration', () => {
    const painter = new HighlightsPainter()
    const adapter: DecorationAdapter = createCssHighlightAdapter(painter)
    const pipeline = createDecorationPipeline({ adapters: [adapter], resolve: resolveAllRecords })

    pipeline.paint({ sessionId: 'session-1', records: [record('legacy-1', { colorId: 5 })] })
    expect([...registry.names.keys()]).toEqual(['dsh-hl-5'])

    // The user CSS rule still carries only the text colour — no underline, so
    // the user's own wash is unchanged by provenance support.
    expect(rule('::highlight(dsh-hl-5)')).toBe('::highlight(dsh-hl-5) { color: var(--dsw-alias-label-primary); }')
    pipeline.dispose()
  })
})

describe('agent paint stylesheet contract', () => {
  it('marks every agent highlight name with a dotted tertiary-label underline', () => {
    for (let slot = 1; slot <= 5; slot += 1) {
      const agentRule = rule(`::highlight(dsh-hl-agent-${String(slot)})`)
      expect(agentRule).toContain('text-decoration: underline dotted var(--dsw-alias-label-tertiary)')
      expect(agentRule).toContain('color: var(--dsw-alias-label-primary)')
      // The user rule for the same slot stays undecorated.
      expect(rule(`::highlight(dsh-hl-${String(slot)})`)).not.toContain('text-decoration')
    }
  })

  it('outlines an agent whole-message band without changing the user band', () => {
    const agentBand = rule(".dshhl-message-band[data-dshhl-author='agent']")
    expect(agentBand).toContain('outline: 1px dashed var(--dsw-alias-label-tertiary)')
    const userBand = rule('.dshhl-message-band')
    expect(userBand).not.toContain('outline')
  })
})
