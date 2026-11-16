// @vitest-environment jsdom
/**
 * The painter owns the CSS Custom Highlight registry.
 *
 * Text highlights are painted under their colour names; whole-message marks are
 * deliberately NOT registered there — the overlay draws a single band behind the
 * reply instead, so a marked message does not look like selected text. The glow
 * remains a no-op while disabled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HighlightRecord } from '../../../src/shared/schema'
import { HighlightsPainter } from '../../../src/client/paint/adapters/css-highlights'

/** One stored record for a text or message anchor. */
function makeRecord(kind: 'text' | 'message', id: string): HighlightRecord {
  return {
    schemaVersion: 1,
    id,
    sessionId: 'session-1',
    origin: 'test',
    anchor: {
      nodeKey: '14:assistant-step4:2',
      kind,
      sourceIndex: 0,
      quote: 'The migration must land before the release.',
      prefix: '',
      suffix: '',
      start: 0,
      end: 44,
      projection: 1,
    },
    colorId: 3,
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: 2,
    version: 1,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('HighlightsPainter.flash', () => {
  it('does not paint any glow while the effect is disabled', () => {
    const painter = new HighlightsPainter()
    painter.flash(document.createRange())
    expect(document.querySelector('[data-dshhl-flash]')).toBeNull()
    vi.advanceTimersByTime(2_000)
    expect(document.querySelector('[data-dshhl-flash]')).toBeNull()
    painter.dispose()
  })
})

describe('HighlightsPainter.paint', () => {
  it('paints text colours but leaves whole-message marks to the band overlay', () => {
    const registry = new Map<string, unknown>()
    const previousCSS = Object.getOwnPropertyDescriptor(globalThis, 'CSS')
    const previousHighlight = Object.getOwnPropertyDescriptor(globalThis, 'Highlight')
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: {
        highlights: {
          set: (name: string, value: unknown) => { registry.set(name, value) },
          delete: (name: string) => registry.delete(name),
        },
      },
    })
    /** Minimal stand-in for the browser's Highlight constructor. */
    class FakeHighlight {
      readonly ranges: Range[]
      constructor(...ranges: Range[]) { this.ranges = ranges }
    }
    Object.defineProperty(globalThis, 'Highlight', { configurable: true, value: FakeHighlight })
    try {
      const painter = new HighlightsPainter()
      const textRange = document.createRange()
      const messageRange = document.createRange()
      const text = makeRecord('text', '11111111-2222-4333-8444-555555555555')
      const message = makeRecord('message', '99999999-8888-4777-8666-555555555555')

      painter.paint([text, message], new Map([[text.id, textRange], [message.id, messageRange]]), [])

      expect(registry.has('dsh-hl-3')).toBe(true)
      expect(registry.has('dsh-hl-message')).toBe(false)
      // The range is still kept for hit-testing/card opening.
      expect(painter.resolved.get(message.id)).toBe(messageRange)
      painter.dispose()
      expect(registry.size).toBe(0)
    } finally {
      if (previousCSS === undefined) delete (globalThis as { CSS?: unknown }).CSS
      else Object.defineProperty(globalThis, 'CSS', previousCSS)
      if (previousHighlight === undefined) delete (globalThis as { Highlight?: unknown }).Highlight
      else Object.defineProperty(globalThis, 'Highlight', previousHighlight)
    }
  })
})
