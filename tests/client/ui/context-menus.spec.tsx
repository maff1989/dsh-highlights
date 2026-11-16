/**
 * Context-menu data actions (S4).
 *
 * The menu itself lives in `ui-context-menu`; this plugin only contributes
 * actions. The tests therefore call the contribution's `resolve` exactly as the
 * registry would, then invoke a resolved action's `run` — no popup, no React.
 * The store is a plain snapshot so each assertion is about the action contract:
 * which rows exist, when they are disabled, what the copy text contains, what
 * the brief is allowed to see, and that resolution never throws.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'

import { en } from '../../../src/client/locales'
import type { HighlightsSnapshot } from '../../../src/client/data/client'
import type { HighlightRecord } from '../../../src/shared/schema'
import type { ColorId } from '../../../src/shared/schema'
import type { RecordState } from '../../../src/shared/provenance'
import type { HighlightContextMenuDeps } from '../../../src/client/ui/menus/deps'
import type {
  HighlightContextMenuTargets,
  HighlightMenuAction,
} from '../../../src/client/ui/menus/contracts'
import { copyText } from '../../../src/client/ui/menus/clipboard'
import { buildSessionMarkdown, COPY_ITEM_LIMIT } from '../../../src/client/ui/menus/markdown'
import {
  BRIEF_ACTION_ID,
  COPY_ACTION_ID,
  OPEN_ACTION_ID,
  SESSION_CONTRIBUTION_ID,
  TAB_CONTRIBUTION_ID,
  registerHighlightContextMenus,
} from '../../../src/client/ui/menus/register'

afterEach(() => {
  // The clipboard tests stub globals; always put the environment back.
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'clipboard')
  Reflect.deleteProperty(document as unknown as Record<string, unknown>, 'execCommand')
  document.body.replaceChildren()
})

/** Translate function backed by the real English dictionary. */
const t = (key: string): string => (en as Record<string, string>)[key] ?? key

/** One stored record; only the fields the actions read. */
function record(seed: {
  readonly id: string
  readonly sessionId?: string
  readonly turn?: number
  readonly step?: number
  readonly quote?: string
  readonly note?: string
  readonly visibility?: 'agent' | 'private'
  readonly state?: RecordState
  readonly colorId?: ColorId
  readonly deletedAt?: number
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
      ...(seed.step === undefined ? {} : { step: seed.step }),
    },
    colorId: seed.colorId ?? 1,
    tags: [],
    ...(seed.note === undefined ? {} : { note: seed.note }),
    starred: false,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    ...(seed.visibility === undefined ? {} : { visibility: seed.visibility }),
    ...(seed.state === undefined ? {} : { state: seed.state }),
    ...(seed.deletedAt === undefined ? {} : { deletedAt: seed.deletedAt }),
  }
}

/** Build the client snapshot the actions read. */
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

/** Deps face over a fixed record list, with recording side effects. */
function harness(records: readonly HighlightRecord[] = []) {
  const deps = {
    snapshot: () => snapshotOf(records),
    openPanel: vi.fn((_sessionId: string) => undefined),
    brief: vi.fn(async (_sessionId: string, _records: readonly HighlightRecord[]): Promise<unknown> => 'inserted'),
    copy: vi.fn(async (_text: string): Promise<boolean> => true),
    t,
  } satisfies HighlightContextMenuDeps
  return deps
}

/** One captured contribution. */
interface Contribution<K extends keyof HighlightContextMenuTargets = keyof HighlightContextMenuTargets> {
  readonly id: string
  readonly target: K
  readonly order: number
  readonly resolve: (
    target: HighlightContextMenuTargets[K],
    signal: AbortSignal,
  ) => readonly HighlightMenuAction[] | Promise<readonly HighlightMenuAction[]>
}

/** Minimal composition-root context: `inject` resolves at once and registrations are recorded. */
function fakeContext() {
  const contributions: Contribution[] = []
  const disposers: (() => void)[] = []
  const ctx = {
    inject: (_deps: string[], callback: (context: Context) => void) => { callback(ctx as unknown as Context) },
    effect: (effect: () => (() => void) | void) => {
      const dispose = effect()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    contextMenus: {
      register: (contribution: Contribution) => {
        contributions.push(contribution)
        return () => {}
      },
    },
  } as unknown as Context
  return { ctx, contributions, disposers }
}

/** Register the menus and return the contributions. */
function registered(deps: HighlightContextMenuDeps) {
  const { ctx, contributions } = fakeContext()
  registerHighlightContextMenus(ctx, deps)
  return contributions
}

/** Resolve one target through its contribution, as the registry does. */
async function resolve(
  contributions: readonly Contribution[],
  target: 'session' | 'tab',
  value: HighlightContextMenuTargets['session'] | HighlightContextMenuTargets['tab'],
): Promise<readonly HighlightMenuAction[]> {
  const contribution = contributions.find(entry => entry.target === target)
  if (contribution === undefined) throw new Error(`no ${target} contribution`)
  const signal = new AbortController().signal
  return await (contribution.resolve as (target: unknown, signal: AbortSignal) => readonly HighlightMenuAction[] | Promise<readonly HighlightMenuAction[]>)(value, signal)
}

/** Find one action by id. */
function action(list: readonly HighlightMenuAction[], id: string): HighlightMenuAction {
  const found = list.find(entry => entry.id === id)
  if (found === undefined) throw new Error(`missing action ${id}`)
  return found
}

const SESSION_TARGET: HighlightContextMenuTargets['session'] = { sessionId: 'session-1', displayTitle: 'Migration' }

/** A tab target with the given tab kind. */
function tabTarget(kind: string): HighlightContextMenuTargets['tab'] {
  return {
    sessionId: 'session-1',
    paneId: 'pane-1',
    tab: { id: 'tab-1', kind, contentId: 'content-1', title: 'A tab' },
  }
}

describe('registration', () => {
  it('contributes one provider to each target family', () => {
    const { ctx, contributions } = fakeContext()
    registerHighlightContextMenus(ctx, harness())
    expect(contributions.map(entry => entry.target)).toEqual(['session', 'tab'])
    expect(contributions.map(entry => entry.id)).toEqual([SESSION_CONTRIBUTION_ID, TAB_CONTRIBUTION_ID])
    expect(contributions.map(entry => entry.order)).toEqual([40, 40])
  })

  it('waits for the menu service instead of reading it eagerly', () => {
    const requested: string[][] = []
    let ran = false
    const ctx = {
      inject: (deps: string[], callback: (context: Context) => void) => {
        requested.push(deps)
        ran = true
        callback(ctx as unknown as Context)
      },
      effect: (effect: () => (() => void) | void) => { effect(); return () => {} },
      contextMenus: { register: () => () => {} },
    } as unknown as Context
    registerHighlightContextMenus(ctx, harness())
    expect(requested).toEqual([['contextMenus']])
    expect(ran).toBe(true)
  })
})

describe('session family', () => {
  it('offers copy, open and brief for a session with annotations', async () => {
    const deps = harness([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' })])
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    expect(actions.map(entry => entry.id)).toEqual([COPY_ACTION_ID, OPEN_ACTION_ID, BRIEF_ACTION_ID])
    expect(actions.map(entry => entry.label)).toEqual([
      'Copy this session’s highlights',
      'Open Highlights',
      'Brief the agent',
    ])
    expect(actions.every(entry => entry.disabled !== true)).toBe(true)
    // Only refusable operations carry a recovery note; Open cannot fail.
    expect(action(actions, COPY_ACTION_ID).failureLabel).toBe('Could not copy the highlights')
    expect(action(actions, BRIEF_ACTION_ID).failureLabel).toBe('Could not brief the agent')
    expect(action(actions, OPEN_ACTION_ID).failureLabel).toBeUndefined()
    // Brief is visually grouped away from the two read actions.
    expect(action(actions, BRIEF_ACTION_ID).separatorBefore).toBe(true)
  })

  it('keeps a stable action set but disables what cannot act on an empty session', async () => {
    const deps = harness()
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    expect(actions.map(entry => entry.id)).toEqual([COPY_ACTION_ID, OPEN_ACTION_ID, BRIEF_ACTION_ID])
    expect(action(actions, COPY_ACTION_ID).disabled).toBe(true)
    expect(action(actions, BRIEF_ACTION_ID).disabled).toBe(true)
    // Opening the panel is harmless and still useful.
    expect(action(actions, OPEN_ACTION_ID).disabled).toBe(false)
  })

  it('opens the panel for the clicked session', async () => {
    const deps = harness([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' })])
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    await action(actions, OPEN_ACTION_ID).run?.()
    expect(deps.openPanel).toHaveBeenCalledWith('session-1')
  })
})

describe('copy action', () => {
  it('writes Markdown in transcript order, with notes, through the injected clipboard', async () => {
    const deps = harness([
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', turn: 2, step: 0, quote: 'second quote' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', turn: 1, step: 0, quote: 'first quote', note: 'note one' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03', turn: 1, step: 1, quote: 'second in turn one' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a04', sessionId: 'session-2', quote: 'other session' }),
    ])
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    await action(actions, COPY_ACTION_ID).run?.()
    expect(deps.copy).toHaveBeenCalledTimes(1)
    expect(deps.copy.mock.calls[0]?.[0]).toBe([
      '- “first quote”',
      '  — note one',
      '- “second in turn one”',
      '- “second quote”',
    ].join('\n'))
  })

  it('collapses soft wrapping so every item stays one Markdown line', async () => {
    const deps = harness([record({
      id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01',
      quote: 'a quote that\nwrapped  in   the source',
      note: 'a note\nwith a line break',
    })])
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    await action(actions, COPY_ACTION_ID).run?.()
    expect(deps.copy.mock.calls[0]?.[0]).toBe('- “a quote that wrapped in the source”\n  — a note with a line break')
  })

  it('caps the export at the item limit', async () => {
    const many = Array.from({ length: COPY_ITEM_LIMIT + 5 }, (_unused, index) => record({
      id: `018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4${String(index).padStart(3, '0')}`,
      turn: index,
      step: 0,
      quote: `quote ${String(index)}`,
    }))
    const markdown = buildSessionMarkdown(many)
    expect(markdown.split('\n').filter(line => line.startsWith('- '))).toHaveLength(COPY_ITEM_LIMIT)
  })

  it('surfaces a refused clipboard write as the action’s failure label', async () => {
    const deps = harness([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' })])
    deps.copy.mockResolvedValueOnce(false)
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    const copy = action(actions, COPY_ACTION_ID)
    await expect(copy.run?.()).rejects.toThrow(/clipboard refused/u)
    expect(copy.failureLabel).toBe('Could not copy the highlights')
  })

  it('propagates a rejected clipboard write', async () => {
    const deps = harness([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' })])
    deps.copy.mockRejectedValueOnce(new Error('denied'))
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    await expect(action(actions, COPY_ACTION_ID).run?.()).rejects.toThrow(/denied/u)
  })
})

describe('brief action', () => {
  it('passes only non-private records to the existing brief action', async () => {
    const deps = harness([
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', turn: 1, step: 0, visibility: 'agent' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', turn: 1, step: 1, visibility: 'private' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03', turn: 2, step: 0 }),
    ])
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    await action(actions, BRIEF_ACTION_ID).run?.()
    expect(deps.brief).toHaveBeenCalledTimes(1)
    const call = deps.brief.mock.calls[0]
    expect(call?.[0]).toBe('session-1')
    expect((call?.[1] ?? []).map(item => item.id)).toEqual([
      '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01',
      '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a03',
    ])
  })

  it('is disabled when every record in the session is private', async () => {
    const deps = harness([
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', visibility: 'private' }),
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a02', visibility: 'private' }),
    ])
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    expect(action(actions, BRIEF_ACTION_ID).disabled).toBe(true)
    // Copying is the user's own export, so private items are still copied.
    expect(action(actions, COPY_ACTION_ID).disabled).toBe(false)
  })

  it('reports a refused insert as the action’s failure label', async () => {
    const deps = harness([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' })])
    deps.brief.mockResolvedValueOnce('failed')
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    const brief = action(actions, BRIEF_ACTION_ID)
    await expect(brief.run?.()).rejects.toThrow(/brief insert failed/u)
    expect(brief.failureLabel).toBe('Could not brief the agent')
  })
})

describe('tab family', () => {
  it('offers the same session actions for a tab target', async () => {
    const deps = harness([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' })])
    const actions = await resolve(registered(deps), 'tab', tabTarget('files'))
    expect(actions.map(entry => entry.id)).toEqual([COPY_ACTION_ID, OPEN_ACTION_ID, BRIEF_ACTION_ID])
    expect(action(actions, OPEN_ACTION_ID).disabled).toBe(false)
  })

  it('disables Open on the Highlights tab and refuses to run it', async () => {
    const deps = harness([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' })])
    const actions = await resolve(registered(deps), 'tab', tabTarget('highlights'))
    const open = action(actions, OPEN_ACTION_ID)
    expect(open.disabled).toBe(true)
    await open.run?.()
    expect(deps.openPanel).not.toHaveBeenCalled()
  })

  it('opens the panel for a different tab', async () => {
    const deps = harness([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01' })])
    const actions = await resolve(registered(deps), 'tab', tabTarget('terminal'))
    await action(actions, OPEN_ACTION_ID).run?.()
    expect(deps.openPanel).toHaveBeenCalledWith('session-1')
  })
})

describe('robustness', () => {
  it('resolves to no actions when the snapshot lacks the session', async () => {
    const deps = harness([record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', sessionId: 'session-2' })])
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    // Unknown session means an empty set, never a thrown resolution.
    expect(actions.map(entry => entry.id)).toEqual([COPY_ACTION_ID, OPEN_ACTION_ID, BRIEF_ACTION_ID])
    expect(action(actions, COPY_ACTION_ID).disabled).toBe(true)
  })

  it('never throws when the snapshot itself is unavailable', async () => {
    const deps = harness()
    deps.snapshot = () => { throw new Error('store unavailable') }
    const contributions = registered(deps)
    await expect(resolve(contributions, 'session', SESSION_TARGET)).resolves.toEqual([])
    await expect(resolve(contributions, 'tab', tabTarget('highlights'))).resolves.toEqual([])
  })

  it('offers nothing for a target without a session id', async () => {
    const contributions = registered(harness())
    await expect(resolve(contributions, 'session', { sessionId: '', displayTitle: '' })).resolves.toEqual([])
    await expect(resolve(contributions, 'tab', { sessionId: '', paneId: 'p', tab: { id: 't', kind: 'files', contentId: 'c', title: 'T' } })).resolves.toEqual([])
  })

  it('ignores soft-deleted records in both actions', async () => {
    const deps = harness([
      record({ id: '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a01', deletedAt: 5 }),
    ])
    const actions = await resolve(registered(deps), 'session', SESSION_TARGET)
    expect(action(actions, COPY_ACTION_ID).disabled).toBe(true)
    expect(action(actions, BRIEF_ACTION_ID).disabled).toBe(true)
  })
})


describe('clipboard helper', () => {
  /** Install a stubbed asynchronous Clipboard API. */
  function stubClipboard(writeText: (value: string) => Promise<void>): void {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  }

  it('uses the Clipboard API when the browser provides it', async () => {
    const writeText = vi.fn(async (_value: string) => undefined)
    stubClipboard(writeText)
    await expect(copyText('- “quoted”')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('- “quoted”')
  })

  it('falls back to the hidden-textarea copy command when the API is refused', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => true), configurable: true })
    await expect(copyText('fallback text')).resolves.toBe(true)
    // The temporary field left no trace behind.
    expect(document.body.querySelector('textarea')).toBeNull()
  })

  it('reports false instead of throwing when neither path works', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    await expect(copyText('nowhere')).resolves.toBe(false)
    expect(document.body.querySelector('textarea')).toBeNull()
  })
})
