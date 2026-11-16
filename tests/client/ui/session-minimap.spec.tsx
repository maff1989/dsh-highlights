// @vitest-environment jsdom
/**
 * Session mini-map (T4.4): a rail of marks in the session header, ordered by
 * transcript position, capped with an aggregate tail, and inert when there is
 * nothing worth showing.
 *
 * The component is pure: order and spacing come from record data alone, so the
 * tests pin the ordering contract (turn → step → nodeSeq → id), the cap, the
 * accessible names, and the two click targets.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { en } from '../../../src/client/locales'
import type { HighlightRecord } from '../../../src/shared/schema'
import {
  MINIMAP_MAX_MARKS,
  SessionMiniMap,
  orderRecords,
} from '../../../src/client/ui/SessionMiniMap'

/** Translate stub over the real English dictionary, with locale-service interpolation. */
const t = (key: string, params: Record<string, string | number> = {}): string =>
  String(en[key as keyof typeof en] ?? key)
    .replace(/\{(\w+)\}/gu, (_match, name: string) => String(params[name] ?? `{${name}}`))

/** One stored record with the anchor ordinals the rail orders by. */
function record(
  id: string,
  options: {
    readonly turn?: number
    readonly step?: number
    readonly nodeSeq?: number
    readonly quote?: string
    readonly colorId?: 1 | 2 | 3 | 4 | 5
  } = {},
): HighlightRecord {
  return {
    schemaVersion: 1,
    id,
    sessionId: 'session-1',
    origin: 'test',
    anchor: {
      nodeKey: `14:assistant-step${String(options.step ?? 1)}:2`,
      kind: 'text',
      sourceIndex: 0,
      quote: options.quote ?? `quote ${id}`,
      prefix: '',
      suffix: '',
      start: 0,
      end: 10,
      projection: 1,
      ...(options.turn === undefined ? {} : { turn: options.turn }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.nodeSeq === undefined ? {} : { nodeSeq: options.nodeSeq }),
    },
    colorId: options.colorId ?? 3,
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: 2,
    version: 1,
  }
}

/** Render the rail with spies for its two actions. */
function setup(records: readonly HighlightRecord[]): {
  readonly onReveal: ReturnType<typeof vi.fn>
  readonly onOpenPanel: ReturnType<typeof vi.fn>
  readonly container: HTMLElement
} {
  const onReveal = vi.fn()
  const onOpenPanel = vi.fn()
  const { container } = render(
    <SessionMiniMap records={records} t={t} onReveal={onReveal} onOpenPanel={onOpenPanel} />,
  )
  return { onReveal, onOpenPanel, container }
}

/** The record ids of the rendered marks, in DOM order (excludes the overflow mark). */
function markIds(): (string | null)[] {
  return screen.getAllByRole('button')
    .map(button => button.getAttribute('data-record-id'))
    .filter(id => id !== null)
}

afterEach(() => {
  cleanup()
})

describe('SessionMiniMap visibility', () => {
  it('renders nothing for zero or one annotation', () => {
    const empty = setup([])
    expect(empty.container.querySelector('[data-dshhl-minimap]')).toBeNull()

    cleanup()
    const single = setup([record('only-1', { turn: 1, step: 1, nodeSeq: 1 })])
    expect(single.container.querySelector('[data-dshhl-minimap]')).toBeNull()
    cleanup()
  })
})

describe('SessionMiniMap ordering', () => {
  // Input order is deliberately scrambled: the rail must not depend on array order.
  const scrambled = [
    record('a', { turn: 2, step: 1, nodeSeq: 10 }),
    record('b', { turn: 1, step: 5, nodeSeq: 3 }),
    record('c', { turn: 1, step: 2, nodeSeq: 9 }),
    record('d', { turn: 1, step: 2, nodeSeq: 4 }),
  ]

  it('orders by turn, then step, then nodeSeq', () => {
    setup(scrambled)
    expect(markIds()).toEqual(['d', 'c', 'b', 'a'])
  })

  it('is deterministic regardless of the input array order', () => {
    setup(scrambled)
    const first = markIds()
    cleanup()
    setup([...scrambled].reverse())
    expect(markIds()).toEqual(first)
  })

  it('breaks exact ties by id and sorts records without ordinals last', () => {
    const tied = [
      record('z', { turn: 1, step: 1, nodeSeq: 1 }),
      record('m', { turn: 1, step: 1, nodeSeq: 1 }),
      record('a', { turn: 1, step: 1, nodeSeq: 1 }),
      record('unknown', {}),
    ]
    expect(orderRecords(tied).map(item => item.id)).toEqual(['a', 'm', 'z', 'unknown'])

    setup(tied)
    expect(markIds()).toEqual(['a', 'm', 'z', 'unknown'])
  })

  it('clicking a mark reveals the record at that transcript position', () => {
    const { onReveal } = setup(scrambled)
    fireEvent.click(screen.getByRole('button', { name: 'quote b' }))
    expect(onReveal).toHaveBeenCalledTimes(1)
    expect((onReveal.mock.calls[0]?.[0] as HighlightRecord).id).toBe('b')
  })
})

describe('SessionMiniMap cap and aggregate', () => {
  /** Twelve annotations in transcript order, one per turn. */
  const many = Array.from({ length: 12 }, (_, index) => record(`r${String(index + 1)}`, {
    turn: index + 1,
    step: 1,
    nodeSeq: index + 1,
  }))

  it('shows MINIMAP_MAX_MARKS positions and aggregates the tail into “N more”', () => {
    const { onReveal, onOpenPanel } = setup(many)
    const buttons = screen.getAllByRole('button')

    expect(buttons).toHaveLength(MINIMAP_MAX_MARKS)
    // The first (MAX - 1) transcripts keep their own mark; the rest aggregate.
    expect(markIds()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'])
    const more = buttons.at(-1)
    if (more === null || more === undefined) throw new Error('overflow mark missing')
    expect(more.getAttribute('aria-label')).toBe('5 more')
    expect(more.getAttribute('title')).toBe('5 more')
    expect(more.getAttribute('data-record-id')).toBeNull()

    // The aggregate mark opens the panel, not a transcript position.
    fireEvent.click(more)
    expect(onOpenPanel).toHaveBeenCalledTimes(1)
    expect(onReveal).not.toHaveBeenCalled()
  })

  it('spaces marks deterministically across the bounded rail', () => {
    setup(many)
    const buttons = screen.getAllByRole('button')
    const first = buttons[0]
    const last = buttons.at(-1)
    if (first === undefined || last === undefined) throw new Error('marks missing')
    // RAIL_WIDTH 120 − MARK_WIDTH 14: centres run from 7px to 113px.
    expect(first.style.left).toBe('7px')
    expect(last.style.left).toBe('113px')
  })

  it('shows every mark when the count fits the rail exactly', () => {
    setup(many.slice(0, MINIMAP_MAX_MARKS))
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(MINIMAP_MAX_MARKS)
    expect(markIds()).toHaveLength(MINIMAP_MAX_MARKS)
    expect(buttons.some(button => button.getAttribute('data-record-id') === null)).toBe(false)
  })
})

describe('SessionMiniMap accessibility', () => {
  it('names every mark and the rail, and uses the record palette variable for its dot', () => {
    setup([
      record('a', { turn: 1, step: 1, nodeSeq: 1, quote: 'first anchored sentence', colorId: 2 }),
      record('b', { turn: 1, step: 2, nodeSeq: 2, quote: 'second anchored sentence', colorId: 4 }),
    ])

    expect(screen.getByRole('group', { name: 'Highlight positions in this session' })).toBeTruthy()
    const first = screen.getByRole('button', { name: 'first anchored sentence' })
    expect(first.getAttribute('title')).toBe('first anchored sentence')
    const dot = first.querySelector<HTMLElement>('.dshhl-minimap__dot')
    expect(dot?.style.background).toContain('var(--dsh-hl-2)')
    const second = screen.getByRole('button', { name: 'second anchored sentence' })
    expect(second.querySelector<HTMLElement>('.dshhl-minimap__dot')?.style.background)
      .toContain('var(--dsh-hl-4)')
  })

  it('collapses whitespace and caps a long excerpt in the mark name', () => {
    const longQuote = `  First line\nsecond   line ${'x'.repeat(120)}  `
    setup([
      record('a', { turn: 1, step: 1, nodeSeq: 1, quote: longQuote }),
      record('b', { turn: 1, step: 2, nodeSeq: 2, quote: 'short' }),
    ])
    const name = screen.getAllByRole('button')[0]?.getAttribute('aria-label') ?? ''
    expect(name).not.toContain('\n')
    expect(name).not.toMatch(/\s{2,}/u)
    expect(name.length).toBeLessThanOrEqual(80)
    expect(name.endsWith('…')).toBe(true)
  })

  it('keeps the marks in the natural tab order', () => {
    setup([
      record('a', { turn: 1, step: 1, nodeSeq: 1 }),
      record('b', { turn: 1, step: 2, nodeSeq: 2 }),
      record('c', { turn: 1, step: 3, nodeSeq: 3 }),
    ])
    // Every mark is a real button in DOM order, so Tab visits them in transcript
    // order; no roving tabindex state is involved.
    const buttons = screen.getAllByRole('button')
    expect(buttons.every(button => button.tabIndex === 0)).toBe(true)
    expect(buttons.map(button => button.getAttribute('data-record-id'))).toEqual(['a', 'b', 'c'])
  })
})
