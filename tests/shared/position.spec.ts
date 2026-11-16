/**
 * Transcript-position ordering from `src/shared/position.ts`.
 *
 * Ordering is positional, not chronological: page and panel list a session's
 * items by where the highlighted text sits in the conversation, with creation
 * time only as the final tie-break. The comparator must therefore be a total
 * order over records that may lack turn/step (an anchor that never resolved).
 */
import { describe, expect, it } from 'vitest'

import {
  comparePosition,
  positionKey,
  sortByPosition,
} from '../../src/shared/position'
import type { HighlightRecord } from '../../src/shared/schema'

/** Build a record whose anchor carries the given position fields. */
function at(
  position: {
    turn?: number
    step?: number
    sourceIndex?: number
    start?: number
    createdAt?: number
  } = {},
): HighlightRecord {
  const { turn, step, sourceIndex = 0, start = 0, createdAt = 1 } = position
  return {
    schemaVersion: 1,
    id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a5b',
    sessionId: 'session-1',
    origin: 'install-1',
    anchor: {
      nodeKey: '13:assistant-step4:2',
      kind: 'text',
      sourceIndex,
      quote: 'the migration must land',
      prefix: '',
      suffix: '',
      start,
      end: start + 23,
      projection: 1,
      ...(turn === undefined ? {} : { turn }),
      ...(step === undefined ? {} : { step }),
    },
    colorId: 1,
    tags: [],
    starred: false,
    createdAt,
    updatedAt: createdAt,
    version: 1,
  }
}

describe('positionKey', () => {
  it('is (turn, step, sourceIndex, start, createdAt)', () => {
    const record = at({ turn: 4, step: 2, sourceIndex: 3, start: 120, createdAt: 1_700_000_000_000 })
    expect(positionKey(record)).toEqual([4, 2, 3, 120, 1_700_000_000_000])
  })

  it('uses +Infinity for an unresolved turn or step so it sorts last', () => {
    const key = positionKey(at({ sourceIndex: 1, start: 5, createdAt: 9 }))
    expect(key[0]).toBe(Number.POSITIVE_INFINITY)
    expect(key[1]).toBe(Number.POSITIVE_INFINITY)
    expect(key).toEqual([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 1, 5, 9])
  })
})

describe('comparePosition', () => {
  it('orders by turn first', () => {
    expect(comparePosition(at({ turn: 1, step: 1 }), at({ turn: 2, step: 1 }))).toBeLessThan(0)
    expect(comparePosition(at({ turn: 2, step: 1 }), at({ turn: 1, step: 1 }))).toBeGreaterThan(0)
  })

  it('orders by step inside a turn', () => {
    expect(comparePosition(at({ turn: 3, step: 1 }), at({ turn: 3, step: 2 }))).toBeLessThan(0)
  })

  it('orders by source order, then character offset inside a step', () => {
    expect(comparePosition(
      at({ turn: 1, step: 1, sourceIndex: 0, start: 900 }),
      at({ turn: 1, step: 1, sourceIndex: 1, start: 0 }),
    )).toBeLessThan(0)
    expect(comparePosition(
      at({ turn: 1, step: 1, sourceIndex: 0, start: 10 }),
      at({ turn: 1, step: 1, sourceIndex: 0, start: 20 }),
    )).toBeLessThan(0)
  })

  it('falls back to creation time only when the position is identical', () => {
    expect(comparePosition(
      at({ turn: 1, step: 1, createdAt: 100 }),
      at({ turn: 1, step: 1, createdAt: 200 }),
    )).toBeLessThan(0)
  })

  it('sorts an explicitly anchored record before one with no turn', () => {
    expect(comparePosition(at({ turn: 1000, step: 1 }), at())).toBeLessThan(0)
    expect(comparePosition(at(), at({ turn: 1000, step: 1 }))).toBeGreaterThan(0)
  })

  it('still compares the remaining keys when both turns and steps are absent', () => {
    // Regression: subtraction of two `Infinity` values produced NaN and made
    // the loop bail out, so step-less records fell back to input order.
    expect(comparePosition(
      at({ sourceIndex: 0, start: 0 }),
      at({ sourceIndex: 1, start: 0 }),
    )).toBeLessThan(0)
    expect(comparePosition(
      at({ start: 10 }),
      at({ start: 20 }),
    )).toBeLessThan(0)
    expect(comparePosition(
      at({ start: 10, createdAt: 100 }),
      at({ start: 10, createdAt: 200 }),
    )).toBeLessThan(0)
  })

  it('returns exactly 0 for identical positions instead of NaN', () => {
    const a = at({ turn: 2, step: 3, sourceIndex: 1, start: 50, createdAt: 70 })
    const b = at({ turn: 2, step: 3, sourceIndex: 1, start: 50, createdAt: 70 })
    const result = comparePosition(a, b)
    expect(Number.isNaN(result)).toBe(false)
    expect(result).toBe(0)
  })

  it('returns exactly 0 for two unresolved positions instead of NaN', () => {
    const a = at()
    const b = at()
    const result = comparePosition(a, b)
    expect(Number.isNaN(result)).toBe(false)
    expect(result).toBe(0)
  })

  it('is antisymmetric', () => {
    const samples = [
      at({ turn: 1, step: 1, start: 5 }),
      at({ turn: 1, step: 2, start: 0 }),
      at({ turn: 2, step: 1 }),
      at({ sourceIndex: 2 }),
      at(),
    ]
    for (const left of samples) {
      for (const right of samples) {
        const forward = Math.sign(comparePosition(left, right))
        const backward = Math.sign(comparePosition(right, left))
        // Sum rather than negate: Math.sign(0) is 0 and toBe distinguishes -0.
        expect(forward + backward).toBe(0)
      }
    }
  })

  it('orders a mixed set deterministically', () => {
    const ordered = [
      at({ turn: 1, step: 1, sourceIndex: 0, start: 0 }),
      at({ turn: 1, step: 2, sourceIndex: 0, start: 0 }),
      at({ turn: 2, step: 1, sourceIndex: 0, start: 0 }),
      at({ sourceIndex: 0, start: 0, createdAt: 1 }),
      at({ sourceIndex: 0, start: 10, createdAt: 2 }),
    ]
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const earlier = ordered[index]
      const later = ordered[index + 1]
      expect(earlier).toBeDefined()
      expect(later).toBeDefined()
      if (earlier === undefined || later === undefined) continue
      expect(comparePosition(earlier, later)).toBeLessThan(0)
    }
  })
})

describe('sortByPosition', () => {
  it('returns a new positionally ordered array without mutating the input', () => {
    const first = at({ turn: 1, step: 1, start: 0 })
    const second = at({ turn: 1, step: 2, start: 0 })
    const third = at({ turn: 3, step: 1, start: 0 })
    const unresolved = at({ sourceIndex: 4, start: 0 })
    const input = [third, unresolved, first, second]
    const sorted = sortByPosition(input)

    expect(sorted).not.toBe(input)
    expect(sorted.map(record => record.anchor.turn ?? 'unresolved')).toEqual([1, 1, 3, 'unresolved'])
    expect(input[0]).toBe(third)
  })

  it('orders two unresolved records by source offset and duration time', () => {
    const late = at({ sourceIndex: 2, start: 0, createdAt: 1 })
    const early = at({ sourceIndex: 1, start: 30, createdAt: 2 })
    const sameSource = at({ sourceIndex: 1, start: 10, createdAt: 3 })
    expect(sortByPosition([late, sameSource, early])).toEqual([sameSource, early, late])
  })

  it('handles an empty list', () => {
    expect(sortByPosition([])).toEqual([])
  })
})
