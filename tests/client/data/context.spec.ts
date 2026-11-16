/**
 * Session display context (P0-4): title and workspace come from the client
 * catalog + workspace projections, never from the Session snapshot (which has
 * no title or cwd at all).
 */
import { describe, expect, it } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

import { sessionContext } from '../../../src/client/data/context'

/** One catalog row. */
interface SummaryFixture {
  readonly title?: string
  readonly displayTitle: string
  readonly cwd?: string
}

/** One workspace row. */
interface WorkspaceFixture {
  readonly workspaceId: string
  readonly path: string
  readonly sessionIds: readonly string[]
}

/** Build a fake client context with the two catalog projections. */
function ctxOf(options: {
  summaries?: Record<string, SummaryFixture>
  workspaces?: WorkspaceFixture[]
} = {}): ClientContext {
  const summaries = options.summaries ?? {}
  const workspaces = options.workspaces ?? []
  return {
    sessions: {
      list: {
        getSnapshot: () => ({ byId: summaries }),
      },
    },
    workspaces: {
      list: {
        getSnapshot: () => ({ items: workspaces }),
      },
    },
  } as unknown as ClientContext
}

describe('sessionContext', () => {
  it('reads the title, workspace id, and workspace path from the catalog projections', () => {
    const ctx = ctxOf({
      summaries: {
        'session-1': { title: 'Release plan', displayTitle: 'Release plan', cwd: '/work/alpha' },
      },
      workspaces: [{ workspaceId: 'ws-1', path: '/work/alpha', sessionIds: ['session-1'] }],
    })

    expect(sessionContext(ctx, 'session-1')).toEqual({
      sessionId: 'session-1',
      sessionTitle: 'Release plan',
      workspaceId: 'ws-1',
      workspacePath: '/work/alpha',
    })
  })

  it('falls back to displayTitle when the durable title is not projected', () => {
    const ctx = ctxOf({
      summaries: { 'session-2': { displayTitle: 'alpha', cwd: '/work/alpha' } },
    })

    expect(sessionContext(ctx, 'session-2')).toMatchObject({ sessionTitle: 'alpha', workspacePath: '/work/alpha' })
  })

  it('keeps the cwd as the path when the workspace row does not account for the session', () => {
    const ctx = ctxOf({
      summaries: { 'session-3': { title: 'Detached', displayTitle: 'Detached', cwd: '/tmp/detached' } },
      workspaces: [{ workspaceId: 'ws-1', path: '/work/alpha', sessionIds: ['other'] }],
    })

    const context = sessionContext(ctx, 'session-3')

    expect(context.workspaceId).toBeUndefined()
    expect(context.workspacePath).toBe('/tmp/detached')
  })

  it('returns only the session id when the catalog row is absent', () => {
    expect(sessionContext(ctxOf(), 'session-missing')).toEqual({ sessionId: 'session-missing' })
  })

  it('tolerates a missing workspace service (tests, degraded boot)', () => {
    const ctx = { sessions: { list: { getSnapshot: () => ({ byId: {} }) } } } as unknown as ClientContext
    expect(sessionContext(ctx, 'session-1')).toEqual({ sessionId: 'session-1' })
  })

  it('never invents an empty title or path', () => {
    const ctx = ctxOf({
      summaries: { 'session-4': { title: '', displayTitle: '', cwd: '' } },
      workspaces: [{ workspaceId: 'ws-1', path: '', sessionIds: ['session-4'] }],
    })

    expect(sessionContext(ctx, 'session-4')).toEqual({ sessionId: 'session-4', workspaceId: 'ws-1' })
  })

  it('does not read the session snapshot at all (the old bug)', () => {
    let bindingReads = 0
    const ctx = {
      sessions: {
        list: { getSnapshot: () => ({ byId: { 'session-1': { title: 'Catalog title', displayTitle: 'Catalog title' } } }) },
        binding: () => { bindingReads += 1; return undefined },
      },
      workspaces: { list: { getSnapshot: () => ({ items: [] }) } },
    } as unknown as ClientContext

    expect(sessionContext(ctx, 'session-1').sessionTitle).toBe('Catalog title')
    expect(bindingReads).toBe(0)
  })
})
