// @vitest-environment jsdom
/**
 * Composer dock strip: the pending-insertion queue, visible.
 *
 * A quote waiting for a busy composer used to be invisible until it landed (or
 * expired after 24 h). The strip subscribes to the queue and shows the count for
 * one session, and owns no retry logic of its own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => await import('./primitives-mock'))

import { PendingInsertStrip } from '../../../src/client/ui/PendingInsertStrip'
import { InsertService } from '../../../src/client/services/insert'
import type { HighlightRecord } from '../../../src/shared/schema'
import type { HighlightsKey } from '../../../src/client/locales'

const t = (key: HighlightsKey, params?: Record<string, string | number>): string =>
  (params === undefined ? key : `${key}(${Object.values(params).join(',')})`)

/**
 * Build one stored record.
 * @param id - record id.
 * @returns the record.
 */
function record(id: string): HighlightRecord {
  return {
    schemaVersion: 1,
    id,
    sessionId: 'session-1',
    origin: 'test',
    anchor: {
      nodeKey: '14:assistant-step1:1',
      kind: 'text',
      sourceIndex: 0,
      quote: `quote ${id}`,
      prefix: '',
      suffix: '',
      start: 0,
      end: 8,
      projection: 1,
    },
    colorId: 1,
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
  }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('PendingInsertStrip', () => {
  it('renders nothing while the queue is empty', () => {
    const insert = new InsertService(() => 1)
    const { container } = render(<PendingInsertStrip t={t} insert={insert} sessionId="session-1" />)
    expect(container.textContent).toBe('')
    insert.dispose()
  })

  it('shows the queued count for its own session only', async () => {
    const insert = new InsertService(() => 1)
    render(<PendingInsertStrip t={t} insert={insert} sessionId="session-1" />)
    insert.enqueue('session-1', record('aaaaaaaa-1111-4111-8111-111111111111'), 'summary')
    await waitFor(() => { expect(screen.getByText('insert.pending.one')).toBeTruthy() })
    insert.enqueue('session-2', record('bbbbbbbb-2222-4222-8222-222222222222'), 'summary')
    // The other session's entry must not be counted here.
    expect(screen.getByText('insert.pending.one')).toBeTruthy()
    insert.dispose()
  })

  it('updates to the plural count as more entries queue', async () => {
    const insert = new InsertService(() => 1)
    render(<PendingInsertStrip t={t} insert={insert} sessionId="session-1" />)
    insert.enqueue('session-1', record('aaaaaaaa-1111-4111-8111-111111111111'), 'summary')
    insert.enqueue('session-1', record('bbbbbbbb-2222-4222-8222-222222222222'), 'summary')
    await waitFor(() => { expect(screen.getByText('insert.pending.other(2)')).toBeTruthy() })
    insert.dispose()
  })

  it('keeps rendering after the component unmounts and the queue changes', () => {
    const insert = new InsertService(() => 1)
    const { unmount } = render(<PendingInsertStrip t={t} insert={insert} sessionId="session-1" />)
    unmount()
    // A leaked subscription would throw here.
    expect(() => { insert.enqueue('session-1', record('cccccccc-3333-4333-8333-333333333333'), 'summary') }).not.toThrow()
    insert.dispose()
  })
})
