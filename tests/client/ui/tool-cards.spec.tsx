/**
 * Tool-result rows for the agent's highlight tools.
 *
 * The row must render in every phase and survive a malformed or missing result:
 * it lives inside the transcript, where a throw would break the conversation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => await import('./primitives-mock'))

import { HighlightToolRow } from '../../../src/client/ui/tools/HighlightToolRow'

type RowProps = Parameters<typeof HighlightToolRow>[0]

/** Translation that returns the key, with `{name}` interpolation for asserts. */
const t = (key: string, params?: Record<string, string | number>): string =>
  (params === undefined ? key : `${key}(${Object.values(params).join(',')})`)

/**
 * Build the props a settled call would carry.
 * @param meta - presentation metadata of the tool result.
 * @param overrides - extra owner fields.
 * @returns the props object the slot would pass.
 */
function propsFor(meta: unknown, overrides: Record<string, unknown> = {}): RowProps {
  return {
    t,
    callId: 'call-1',
    toolName: 'list_highlights',
    phase: 'result',
    block: { content: [{ type: 'text', text: 'model-facing text' }], isError: false, meta },
    ...overrides,
  } as unknown as RowProps
}

/** One metadata item. */
const item = (id: string, excerpt: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, excerpt, colorId: 2, anchored: true, ...extra,
})

afterEach(() => { cleanup() })

describe('HighlightToolRow', () => {
  it('renders a running line before the result arrives', () => {
    render(<HighlightToolRow {...propsFor(undefined, { phase: 'start', block: undefined })} />)
    expect(screen.getByRole('status').textContent).toContain('tool.running')
  })

  it('renders the consulted count and up to three items from list metadata', () => {
    const meta = {
      kind: 'highlights.list',
      shown: 4,
      total: 12,
      items: [item('a', 'first excerpt'), item('b', 'second excerpt'), item('c', 'third excerpt'), item('d', 'fourth excerpt')],
    }
    render(<HighlightToolRow {...propsFor(meta)} />)
    expect(screen.getByText('tool.consulted.other(4)')).toBeTruthy()
    expect(screen.getByText('tool.ofTotal(12)')).toBeTruthy()
    expect(screen.getByText('first excerpt')).toBeTruthy()
    expect(screen.queryByText('fourth excerpt')).toBeNull()
    expect(screen.getByText('tool.more(1)')).toBeTruthy()
  })

  it('expands to the remaining items and collapses again', () => {
    const meta = {
      kind: 'highlights.list',
      shown: 4,
      total: 4,
      items: [item('a', 'e1'), item('b', 'e2'), item('c', 'e3'), item('d', 'e4')],
    }
    render(<HighlightToolRow {...propsFor(meta)} />)
    const toggle = screen.getByRole('button', { name: 'tool.expand' })
    fireEvent.click(toggle)
    expect(screen.getByText('e4')).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.queryByText('e4')).toBeNull()
  })

  it('renders a single detail item as a read count', () => {
    const meta = { kind: 'highlights.item', item: item('a', 'only excerpt', { sessionTitle: 'Session A' }) }
    render(<HighlightToolRow {...propsFor(meta, { toolName: 'get_highlight' })} />)
    expect(screen.getByText('tool.read.one')).toBeTruthy()
    expect(screen.getByText('only excerpt')).toBeTruthy()
    expect(screen.getByText('Session A')).toBeTruthy()
  })

  it('marks an unanchored item and an agent-authored one', () => {
    const meta = {
      kind: 'highlights.item',
      item: item('a', 'drifted', { anchored: false, author: 'agent' }),
    }
    render(<HighlightToolRow {...propsFor(meta, { toolName: 'get_highlight' })} />)
    expect(screen.getByText('tool.unanchored')).toBeTruthy()
    expect(screen.getByText('meta.author.agent')).toBeTruthy()
  })

  it('renders a settled failure as one error line', () => {
    render(<HighlightToolRow {...propsFor(undefined, {
      block: { content: [], isError: true, error: { name: 'Error', code: 'limit-exceeded' } },
    })} />)
    expect(screen.getByText(/tool\.failed/)).toBeTruthy()
    expect(screen.getByText(/limit-exceeded/)).toBeTruthy()
  })

  it('renders safely without presentation metadata', () => {
    render(<HighlightToolRow {...propsFor(undefined)} />)
    expect(screen.getByText('tool.consulted.other(0)')).toBeTruthy()
  })

  it('ignores malformed metadata instead of throwing', () => {
    render(<HighlightToolRow {...propsFor({ kind: 'highlights.list', items: [null, 3, { excerpt: null }] })} />)
    expect(screen.getByText('tool.consulted.other(0)')).toBeTruthy()
  })

  it('renders agent proposals and keeps one through the injected handler', async () => {
    const kept: unknown[] = []
    const meta = {
      kind: 'highlights.proposed',
      proposals: [
        { quote: 'first proposed passage', tags: ['release'], colorId: 2, intent: 'direct' },
        { quote: 'second proposed passage', note: 'worth verifying', tags: [], colorId: 4 },
      ],
    }
    render(<HighlightToolRow {...propsFor(meta, {
      toolName: 'highlight_write',
      keepProposal: async (proposal: unknown) => { kept.push(proposal); return { status: 'saved' } },
    })} />)
    expect(screen.getByText('tool.proposed.other(2)')).toBeTruthy()
    expect(screen.getByText('first proposed passage')).toBeTruthy()
    expect(screen.getByText('worth verifying')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'tool.propose.keep' })[0] as HTMLElement)
    await waitFor(() => { expect(screen.getByText('tool.propose.saved')).toBeTruthy() })
    expect(kept).toEqual([{ quote: 'first proposed passage', tags: ['release'], colorId: 2, intent: 'direct' }])
  })

  it('reports a proposal whose text cannot be located', async () => {
    const meta = { kind: 'highlights.proposed', proposals: [{ quote: 'ghost passage', tags: [], colorId: 1 }] }
    render(<HighlightToolRow {...propsFor(meta, {
      toolName: 'highlight_write',
      keepProposal: async () => ({ status: 'not-found' }),
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'tool.propose.keep' }))
    await waitFor(() => { expect(screen.getByText('tool.propose.notFound')).toBeTruthy() })
  })

  it('dismisses a proposal without keeping it', () => {
    const meta = { kind: 'highlights.proposed', proposals: [{ quote: 'dismiss me', tags: [], colorId: 1 }] }
    render(<HighlightToolRow {...propsFor(meta, { toolName: 'highlight_write' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'tool.propose.dismiss' }))
    expect(screen.queryByText('dismiss me')).toBeNull()
    expect(screen.getByText('tool.propose.dismissed')).toBeTruthy()
  })

  it('paints each colour dot through the shared palette variable', () => {
    const meta = { kind: 'highlights.item', item: item('a', 'coloured', { colorId: 4 }) }
    const { container } = render(<HighlightToolRow {...propsFor(meta, { toolName: 'get_highlight' })} />)
    const dot = container.querySelector('.dshhl-tool__dot') as HTMLElement
    expect(dot.style.getPropertyValue('--dshhl-tool-color')).toBe('var(--dsh-hl-4)')
  })
})
