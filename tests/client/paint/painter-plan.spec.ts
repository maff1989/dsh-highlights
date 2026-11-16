// @vitest-environment jsdom
/**
 * Registry diff: a repaint with unchanged ranges must not touch CSS.highlights.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { HighlightsPainter } from '../../../src/client/paint/adapters/css-highlights'
import { diagnostics, resetDiagnostics } from '../../../src/client/runtime/diagnostics'

/** Install a fake CSS.highlights registry and return its write counter. */
function fakeRegistry() {
  const writes = { set: 0, delete: 0 }
  const previousCSS = Object.getOwnPropertyDescriptor(globalThis, 'CSS')
  const previousHighlight = Object.getOwnPropertyDescriptor(globalThis, 'Highlight')
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: {
      highlights: {
        set: () => { writes.set += 1 },
        delete: () => { writes.delete += 1 },
      },
    },
  })
  /** Minimal Highlight constructor. */
  class FakeHighlight {
    constructor(public readonly ranges: readonly Range[]) {}
  }
  Object.defineProperty(globalThis, 'Highlight', { configurable: true, value: FakeHighlight })
  return {
    writes,
    restore() {
      if (previousCSS === undefined) delete (globalThis as { CSS?: unknown }).CSS
      else Object.defineProperty(globalThis, 'CSS', previousCSS)
      if (previousHighlight === undefined) delete (globalThis as { Highlight?: unknown }).Highlight
      else Object.defineProperty(globalThis, 'Highlight', previousHighlight)
    },
  }
}

/** A range-like object with the offsets the diff compares. */
function fakeRange(start: number, end: number): Range {
  return { startOffset: start, endOffset: end } as unknown as Range
}

beforeEach(() => {
  resetDiagnostics()
})

afterEach(() => {
  resetDiagnostics()
})

describe('HighlightsPainter.paintPlan', () => {
  it('writes the registry once, then skips an unchanged repaint', () => {
    const registry = fakeRegistry()
    try {
      const painter = new HighlightsPainter()
      const buckets = new Map([['dsh-hl-1', [fakeRange(0, 4)]]])
      painter.paintPlan(new Map(), buckets, [])
      expect(registry.writes.set).toBe(1)
      const firstPassWrites = diagnostics().registryWrites
      expect(firstPassWrites).toBeGreaterThan(0)

      painter.paintPlan(new Map(), new Map([['dsh-hl-1', [fakeRange(0, 4)]]]), [])
      expect(registry.writes.set).toBe(1)
      expect(diagnostics().registryWrites).toBe(firstPassWrites)

      painter.paintPlan(new Map(), new Map([['dsh-hl-1', [fakeRange(0, 5)]]]), [])
      expect(registry.writes.set).toBe(2)
      expect(diagnostics().registryWrites).toBeGreaterThan(firstPassWrites)
      painter.dispose()
    } finally {
      registry.restore()
    }
  })
})
