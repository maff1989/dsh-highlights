/**
 * Passive resurfacing surfaces (T4.2 sidebar kept badge + hover preview; T4.3
 * turn-tail digest).
 *
 * Every test renders a component against a mutable fake snapshot store, so the
 * assertions are about what a user sees in the seat: the badge appears only
 * when the row's own Session has kept items, the hover lists the top two, the
 * digest narrows to its own turn and opens the panel on click, and an unknown
 * Session/turn or an empty snapshot is inert instead of throwing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'

import { en } from '../../../src/client/locales'
import type { HighlightsSnapshot } from '../../../src/client/data/client'
import type { HighlightRecord } from '../../../src/shared/schema'
import type { ColorId } from '../../../src/shared/schema'
import type { RecordState } from '../../../src/shared/provenance'
import type { SessionSurfacesDeps } from '../../../src/client/ui/surfaces/deps'
import { KeptBadge, type KeptBadgeProps } from '../../../src/client/ui/surfaces/KeptBadge'
import { SessionHover, type SessionHoverProps } from '../../../src/client/ui/surfaces/SessionHover'
import { TurnDigest, type TurnDigestProps } from '../../../src/client/ui/surfaces/TurnDigest'
import {
  KEPT_BADGE_ID,
  KEPT_HOVER_ID,
  TURN_DIGEST_ID,
  registerSessionSurfaces,
} from '../../../src/client/ui/surfaces/register'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const shared = await import('./primitives-mock')
  return {
    ...shared,
    IconCheckCircleOutlineRegular(): null {
      return null
    },
    /** Always-mounted stand-in: the preview content sits in the DOM for assertions. */
    HoverCard({ anchor, content }: { anchor: ReactNode; content: ReactNode }) {
      return (
        <>
          {anchor}
          <div data-testid="hover-preview">{content}</div>
        </>
      )
    },
  }
})

afterEach(() => {
  cleanup()
})

/** Translate function backed by the real English dictionary. */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = (en as Record<string, string>)[key] ?? String(key)
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => String(params?.[name] ?? ''))
}) as unknown as KeptBadgeProps['t']

/** One stored record; only the fields the surfaces read. */
function record(seed: {
  readonly id: string
  readonly sessionId?: string
  readonly turn?: number
  readonly nodeSeq?: number
  readonly state?: RecordState
  readonly quote?: string
  readonly colorId?: ColorId
  readonly updatedAt?: number
}): HighlightRecord {
  return {
    schemaVersion: 1,
    id: seed.id,
    sessionId: seed.sessionId ?? 'session-1',
    origin: 'install-1',
    anchor: {
      nodeKey: '1:assistant-step1:0',
      kind: 'text',
      sourceIndex: 0,
      quote: seed.quote ?? 'the migration must land',
      prefix: '',
      suffix: '',
      start: 0,
      end: 23,
      projection: 1,
      ...(seed.turn === undefined ? {} : { turn: seed.turn }),
      ...(seed.nodeSeq === undefined ? {} : { nodeSeq: seed.nodeSeq }),
    },
    colorId: seed.colorId ?? 1,
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: seed.updatedAt ?? 1,
    version: 1,
    ...(seed.state === undefined ? {} : { state: seed.state }),
  }
}

/** Build the client snapshot the surfaces read (per-session projection included). */
function snapshotOf(records: readonly HighlightRecord[]): HighlightsSnapshot {
  const grouped = new Map<string, HighlightRecord[]>()
  for (const item of records) {
    const bucket = grouped.get(item.sessionId)
    if (bucket === undefined) grouped.set(item.sessionId, [item])
    else bucket.push(item)
  }
  return {
    status: 'ready',
    records,
    byId: new Map(records.map(item => [item.id, item])),
    hello: undefined,
    error: undefined,
    offline: false,
    paintSupported: true,
    stale: new Set(),
    recordsBySession: grouped,
    staleBySession: new Map(),
    paintEpoch: 0,
    inFlight: new Set(),
  }
}

/** Mutable fake store behind the injected deps face. */
function fakeStore(initial: readonly HighlightRecord[] = []) {
  let snapshot = snapshotOf(initial)
  const listeners = new Set<() => void>()
  const deps: SessionSurfacesDeps = {
    snapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    openPanel: vi.fn(),
  }
  return {
    deps,
    publish(records: readonly HighlightRecord[]) {
      snapshot = snapshotOf(records)
      for (const listener of [...listeners]) listener()
    },
  }
}

describe('KeptBadge (sidebar.session.row.trailing)', () => {
  it('renders nothing for a session with no kept items', () => {
    const store = fakeStore([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' })])
    const { container } = render(<KeptBadge {...({ sessionId: 'session-1', ...store.deps, t } as unknown as KeptBadgeProps)} />)
    expect(container.querySelector('[data-kept-count]')).toBeNull()
  })

  it('counts kept items of its own session only', () => {
    const store = fakeStore([
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', sessionId: 'session-1', state: 'kept' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', sessionId: 'session-1', state: 'kept' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03', sessionId: 'session-1', state: 'new' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a04', sessionId: 'session-2', state: 'kept' }),
    ])
    const { container } = render(<KeptBadge {...({ sessionId: 'session-1', ...store.deps, t } as unknown as KeptBadgeProps)} />)
    expect(container.querySelector('[data-kept-count="2"]')).not.toBeNull()
    // The full sentence rides the hidden label; visible glyph/count are decorative.
    expect(screen.getByText('2 kept highlights in this session')).toBeTruthy()
  })

  it('updates when the store changes and disappears when nothing is kept', () => {
    const store = fakeStore([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', state: 'kept' })])
    const { container } = render(<KeptBadge {...({ sessionId: 'session-1', ...store.deps, t } as unknown as KeptBadgeProps)} />)
    expect(container.querySelector('[data-kept-count="1"]')).not.toBeNull()
    act(() => {
      store.publish([
        record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', state: 'kept' }),
        record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', state: 'kept' }),
        record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03', state: 'kept' }),
      ])
    })
    expect(container.querySelector('[data-kept-count="3"]')).not.toBeNull()
    act(() => { store.publish([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', state: 'new' })]) })
    expect(container.querySelector('[data-kept-count]')).toBeNull()
  })

  it('is inert for an unknown session and for an empty snapshot', () => {
    const store = fakeStore()
    const { container } = render(<KeptBadge {...({ sessionId: 'missing', ...store.deps, t } as unknown as KeptBadgeProps)} />)
    expect(container.querySelector('[data-kept-count]')).toBeNull()
    // Missing owner id (future owner contract change) must not throw either.
    expect(() => render(<KeptBadge {...({ sessionId: undefined, ...store.deps, t } as unknown as KeptBadgeProps)} />)).not.toThrow()
  })
})

describe('SessionHover (sidebar.session.row.hover)', () => {
  it('lists the top two, kept items first, and the omission line', () => {
    const store = fakeStore([
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', state: 'new', quote: 'newer note', updatedAt: 50 }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', state: 'kept', quote: 'kept older', updatedAt: 10 }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03', state: 'kept', quote: 'kept newer', updatedAt: 30 }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a04', sessionId: 'session-2', state: 'kept', quote: 'other session' }),
    ])
    const { container } = render(<SessionHover {...({ sessionId: 'session-1', ...store.deps, t } as unknown as SessionHoverProps)} />)
    expect(screen.getByText('Highlights')).toBeTruthy()
    const rows = [...container.querySelectorAll('.dshhl-preview__text')].map(node => node.textContent)
    expect(rows).toEqual(['kept newer', 'kept older'])
    // Three session-1 records, two shown: one omitted.
    expect(screen.getByText('1 more')).toBeTruthy()
    expect(container.textContent).not.toContain('newer note')
    expect(container.textContent).not.toContain('other session')
  })

  it('renders nothing without records or for an unknown session', () => {
    const store = fakeStore([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', sessionId: 'session-2' })])
    const { container } = render(<SessionHover {...({ sessionId: 'session-1', ...store.deps, t } as unknown as SessionHoverProps)} />)
    expect(container.querySelector('[data-session-highlights-hover]')).toBeNull()
  })

  it('excerpts long quotes on a single line budget', () => {
    const store = fakeStore([record({
      id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01',
      quote: `${'word '.repeat(80)}end`,
    })])
    const { container } = render(<SessionHover {...({ sessionId: 'session-1', ...store.deps, t } as unknown as SessionHoverProps)} />)
    const text = container.querySelector('.dshhl-preview__text')?.textContent ?? ''
    expect(text.endsWith('…')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(96)
  })
})

describe('TurnDigest (conversation.chat.turnTail)', () => {
  /** Render the digest for one turn. */
  function renderDigest(store: ReturnType<typeof fakeStore>, turn: unknown, sessionId = 'session-1') {
    return render(<TurnDigest {...({
      turn,
      sessionId,
      ...store.deps,
      t,
    } as unknown as TurnDigestProps)} />)
  }

  it('shows the counts of its own turn only', () => {
    const store = fakeStore([
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', turn: 3, state: 'kept' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', turn: 3, state: 'new' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03', turn: 4, state: 'kept' }),
    ])
    renderDigest(store, { turn: 3, status: 'closed' })
    expect(screen.getByRole('button', { name: '2 highlights · 1 kept — open Highlights' })).toBeTruthy()
    cleanup()
    renderDigest(store, { turn: 4, status: 'closed' })
    expect(screen.getByRole('button', { name: '1 highlight · 1 kept — open Highlights' })).toBeTruthy()
  })

  it('renders nothing for an empty, open, or missing turn', () => {
    const store = fakeStore([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', turn: 3, state: 'kept' })])
    const { container } = renderDigest(store, { turn: 9, status: 'closed' })
    expect(container.querySelector('.dshhl-digest')).toBeNull()
    cleanup()
    const open = renderDigest(store, { turn: 3, status: 'open' })
    expect(open.container.querySelector('.dshhl-digest')).toBeNull()
    cleanup()
    const missing = renderDigest(store, undefined)
    expect(missing.container.querySelector('.dshhl-digest')).toBeNull()
  })

  it('falls back to the turn event bounds when the anchor has no turn number', () => {
    const store = fakeStore([
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', nodeSeq: 15, state: 'kept' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', nodeSeq: 25 }),
    ])
    renderDigest(store, { turn: 2, status: 'closed', start: { seq: 10 }, end: { seq: 20 } })
    expect(screen.getByRole('button', { name: '1 highlight · 1 kept — open Highlights' })).toBeTruthy()
  })

  it('opens the Highlights panel on click', () => {
    const store = fakeStore([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', turn: 1, state: 'kept' })])
    renderDigest(store, { turn: 1, status: 'closed' })
    fireEvent.click(screen.getByRole('button', { name: /open Highlights/u }))
    expect(store.deps.openPanel).toHaveBeenCalledTimes(1)
  })

  it('previews the turn’s annotations in the hover card', () => {
    const store = fakeStore([
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', turn: 1, state: 'kept', quote: 'first one' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', turn: 1, quote: 'second one', updatedAt: 2 }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03', turn: 1, quote: 'third one', updatedAt: 3 }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a04', turn: 1, quote: 'fourth one', updatedAt: 4 }),
    ])
    renderDigest(store, { turn: 1, status: 'closed' })
    const preview = screen.getByTestId('hover-preview')
    // Kept first, then most recently touched; three shown, one omitted.
    expect(preview.textContent).toContain('first one')
    expect(preview.textContent).toContain('fourth one')
    expect(preview.textContent).toContain('third one')
    expect(preview.textContent).not.toContain('second one')
    expect(preview.textContent).toContain('1 more')
  })

  it('does not throw on an empty snapshot or a foreign session', () => {
    const store = fakeStore()
    expect(() => renderDigest(store, { turn: 1, status: 'closed' })).not.toThrow()
    cleanup()
    const foreign = fakeStore([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', turn: 1, sessionId: 'session-2' })])
    const { container } = renderDigest(foreign, { turn: 1, status: 'closed' })
    expect(container.querySelector('.dshhl-digest')).toBeNull()
  })
})

describe('registerSessionSurfaces', () => {
  /** Minimal composition-root context recording registrations. */
  function fakeContext() {
    const registrations: {
      readonly name: string
      readonly options: { readonly id?: string; readonly order?: number; readonly locale?: string; readonly inject?: (sessionId?: string) => Record<string, unknown> }
    }[] = []
    const effects: (() => void)[] = []
    const ctx = {
      effect(effect: () => (() => void) | void) {
        const dispose = effect()
        effects.push(() => { if (typeof dispose === 'function') dispose() })
        return () => {}
      },
      slots: {
        inject: (_name: string, callback: () => () => void) => callback(),
        register: (options: { readonly id?: string; readonly order?: number; readonly locale?: string; readonly inject?: (sessionId?: string) => Record<string, unknown> }, _component: unknown) => {
          registrations.push({ name: (options as { name?: string }).name ?? '', options })
          return () => {}
        },
      },
    } as unknown as Context
    return { ctx, registrations, effects }
  }

  it('registers the badge, the hover section and the turn digest on their seats', () => {
    const { ctx, registrations } = fakeContext()
    const store = fakeStore()
    registerSessionSurfaces(ctx, store.deps)
    expect(registrations.map(entry => entry.name)).toEqual([
      'sidebar.session.row.trailing',
      'sidebar.session.row.hover',
      'conversation.chat.turnTail',
    ])
    expect(registrations.map(entry => entry.options.id)).toEqual([KEPT_BADGE_ID, KEPT_HOVER_ID, TURN_DIGEST_ID])
    expect(registrations.map(entry => entry.options.order)).toEqual([20, 20, 30])
    expect(registrations.every(entry => entry.options.locale === 'highlights')).toBe(true)
  })

  it('injects the same store face into the sidebar seats and the session scope into the digest', () => {
    const { ctx, registrations } = fakeContext()
    const store = fakeStore()
    registerSessionSurfaces(ctx, store.deps)
    const badgeFace = registrations[0]?.options.inject?.() ?? {}
    const hoverFace = registrations[1]?.options.inject?.() ?? {}
    const digestFace = registrations[2]?.options.inject?.('session-7') ?? {}
    expect(badgeFace.snapshot).toBe(store.deps.snapshot)
    expect(hoverFace.snapshot).toBe(store.deps.snapshot)
    expect(digestFace.sessionId).toBe('session-7')
    expect(digestFace.openPanel).toBe(store.deps.openPanel)
  })

  it('injects its stylesheet and removes it on teardown', () => {
    const before = document.head.querySelectorAll('style[data-plugin-css-part="surfaces"]').length
    const { ctx, effects } = fakeContext()
    registerSessionSurfaces(ctx, fakeStore().deps)
    expect(document.head.querySelectorAll('style[data-plugin-css-part="surfaces"]').length).toBe(before + 1)
    for (const dispose of effects) dispose()
    expect(document.head.querySelectorAll('style[data-plugin-css-part="surfaces"]').length).toBe(before)
  })
})
