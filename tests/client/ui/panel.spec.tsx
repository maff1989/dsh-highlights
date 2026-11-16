/**
 * Behavioural tests for the right-panel Highlights tab (surface S4).
 *
 * The component is exercised against a fake snapshot and the fake action face,
 * so the tests pin what the body renders and what it asks the store to do,
 * without a Cordis context or a transport.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type {
  HighlightsActions,
  InsertOutcome,
  RevealOutcome,
  UpdatePatch,
  WriteOutcome,
} from '../../../src/client/data/actions'
import type { HighlightsSnapshot } from '../../../src/client/data/client'
import type { ColorId, HighlightRecord } from '../../../src/shared/schema'
import { HighlightsPanel } from '../../../src/client/ui/panel/HighlightsPanel'
import type { HighlightsPanelProps } from '../../../src/client/ui/panel/HighlightsPanel'
import type { SessionCatalogState, WorkspaceCatalogState } from '../../../src/client/ui/page/grouping'

// The primitives package is a shell-provided platform module for the plugin
// bundle; its own file pulls `clsx`, which this package never installs. The
// tests assert on accessible names, so the artwork stands in as an empty glyph.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => await import('./primitives-mock'))

/** Session every fixture record belongs to. */
const SESSION = 'session-1'

/** Fixture clock: rows are "just now" unless a test dates them itself. */
const NOW = Date.now()

/** Options a fixture record may override. */
interface RecordOptions {
  readonly turn?: number
  readonly step?: number
  readonly sourceIndex?: number
  readonly start?: number
  readonly createdAt?: number
  readonly quote?: string
  readonly colorId?: ColorId
  readonly tags?: readonly string[]
  readonly note?: string
  readonly starred?: boolean
  readonly sessionId?: string
  readonly author?: 'user' | 'agent'
  readonly state?: 'new' | 'kept' | 'compiled'
  readonly visibility?: 'agent' | 'private'
}

/**
 * Build one valid record.
 * @param id - record identity.
 * @param options - field overrides.
 * @returns the fixture record.
 */
function makeRecord(id: string, options: RecordOptions = {}): HighlightRecord {
  return {
    schemaVersion: 1,
    id,
    sessionId: options.sessionId ?? SESSION,
    origin: 'test-origin',
    anchor: {
      nodeKey: '13:assistant-step1:1',
      kind: 'text',
      turn: options.turn,
      step: options.step,
      sourceIndex: options.sourceIndex ?? 0,
      quote: options.quote ?? `quote ${id}`,
      prefix: '',
      suffix: '',
      start: options.start ?? 0,
      end: 5,
      projection: 1,
    },
    colorId: options.colorId ?? 3,
    tags: [...(options.tags ?? [])],
    note: options.note,
    starred: options.starred ?? false,
    author: options.author,
    state: options.state,
    visibility: options.visibility,
    createdAt: options.createdAt ?? NOW,
    updatedAt: options.createdAt ?? NOW,
    version: 1,
  }
}

/**
 * Build a store snapshot around a record set.
 * @param records - records the store holds.
 * @param overrides - snapshot field overrides.
 * @returns the fixture snapshot.
 */
function makeSnapshot(records: readonly HighlightRecord[], overrides: Partial<HighlightsSnapshot> = {}): HighlightsSnapshot {
  return {
    status: 'ready',
    records,
    byId: new Map(records.map(record => [record.id, record])),
    hello: undefined,
    error: undefined,
    offline: false,
    paintSupported: true,
    stale: new Set<string>(),
    recordsBySession: new Map(
      [...new Set(records.map(record => record.sessionId))].map(sessionId => [
        sessionId,
        records.filter(record => record.sessionId === sessionId),
      ]),
    ),
    staleBySession: new Map(),
    paintEpoch: 0,
    inFlight: new Set(),
    ...overrides,
  }
}

/** Outcomes the fake Host reports for one test. */
interface PanelOutcomes {
  readonly update?: WriteOutcome
  readonly remove?: WriteOutcome
  readonly restore?: WriteOutcome
  readonly copy?: boolean
  readonly reveal?: RevealOutcome
  readonly insert?: InsertOutcome
  readonly brief?: InsertOutcome
}

/**
 * Build the action face as spied substitutes.
 * @param outcomes - Host outcomes the fake returns (default: success).
 * @returns the fake actions.
 */
function makeActions(outcomes: PanelOutcomes = {}): HighlightsActions {
  const written: WriteOutcome = { status: 'written', record: makeRecord('written') }
  return {
    refresh: vi.fn(),
    update: vi.fn(async (_id: string, _patch: UpdatePatch, _expectedVersion?: number) => outcomes.update ?? written),
    remove: vi.fn(async (_id: string) => outcomes.remove ?? written),
    restore: vi.fn(async (_id: string) => outcomes.restore ?? written),
    copyQuote: vi.fn(async () => outcomes.copy ?? true),
    reveal: vi.fn(async () => outcomes.reveal ?? 'revealed'),
    insert: vi.fn(async () => outcomes.insert ?? 'inserted'),
    briefSession: vi.fn(async (_sessionId: string, _records: readonly HighlightRecord[]) => outcomes.brief ?? 'inserted'),
    openPanelTab: vi.fn(),
    paintSupported: vi.fn(() => true),
  }
}

/**
 * Namespace-bound copy substitute: keys stand in for text, except the few
 * templates whose interpolation the tests read back.
 * @param key - dictionary key.
 * @param params - template parameters.
 * @returns the stand-in string.
 */
function translate(key: string, params?: Record<string, unknown>): string {
  if (key === 'meta.author.agent') return 'Agent'
  if (key === 'meta.state.new') return 'New'
  if (key === 'meta.state.kept') return 'Kept'
  if (key === 'meta.state.compiled') return 'Compiled'
  if (key === 'cursor.label') return `Status: ${String(params?.['state'])}`
  if (key === 'cursor.failed') return 'Could not change the status.'
  if (key === 'page.filter.mine') return 'Mine'
  if (key === 'page.filter.agent') return "Agent's"
  if (key === 'position.label') return `Turn ${String(params?.['turn'])} · step ${String(params?.['step'])}`
  if (key === 'position.fallback') return 'Position unknown'
  if (key === 'page.count.one') return `${String(params?.['count'])} highlight`
  if (key === 'page.count.other') return `${String(params?.['count'])} highlights`
  return key
}

/** What one test's render call may configure. */
interface RenderOptions {
  readonly records?: readonly HighlightRecord[]
  readonly snapshot?: Partial<HighlightsSnapshot>
  readonly params?: unknown
  readonly revision?: number
  readonly visible?: boolean
  readonly actions?: HighlightsActions
  /** Live Session catalog (absent = rows resolve from stored snapshots). */
  readonly sessions?: SessionCatalogState
  /** Live Workspace catalog (absent = same fallback). */
  readonly workspaces?: WorkspaceCatalogState
}

/**
 * Build the tab-actions stub the panel binds its refresh command on.
 * @returns a spy that returns the disposer the panel's effect expects.
 */
function makeBindCommands() {
  return vi.fn((_commands: { refresh?: () => void }) => () => undefined)
}

/**
 * Assemble the fake framework seats for one render.
 * @param options - fixtures for the snapshot, navigation params, and actions.
 * @param actions - the fake action face to hand the panel.
 * @param bindCommands - the tab-actions spy the panel binds its refresh command on.
 * @returns props the panel reads.
 */
function panelProps(
  options: RenderOptions,
  actions: HighlightsActions,
  bindCommands: ReturnType<typeof makeBindCommands>,
): HighlightsPanelProps {
  const snapshot = makeSnapshot(options.records ?? [], options.snapshot)
  const tab = {
    id: 'tab-1',
    kind: 'highlights',
    visible: options.visible ?? true,
    navigation: {
      address: 'sidebar://highlights',
      params: options.params,
      revision: options.revision ?? 0,
    },
    actions: { bindCommands },
  }
  const sessions = options.sessions
  const workspaces = options.workspaces
  return {
    t: translate,
    useSnap: (selector: (value: HighlightsSnapshot) => unknown) => selector(snapshot),
    useTabInfo: () => ({ tab }),
    actions,
    sessionId: SESSION,
    ...(sessions === undefined
      ? {}
      : { useSessions: <S,>(selector: (state: SessionCatalogState) => S): S => selector(sessions) }),
    ...(workspaces === undefined
      ? {}
      : { useWorkspaces: <S,>(selector: (state: WorkspaceCatalogState) => S): S => selector(workspaces) }),
  } as unknown as HighlightsPanelProps
}

/**
 * Render the panel with fake framework seats.
 * @param options - fixtures for the snapshot, navigation params, and actions.
 * @returns the fake actions the render used and a re-render with new fixtures.
 */
function renderPanel(options: RenderOptions = {}): {
  readonly actions: HighlightsActions
  readonly bindCommands: ReturnType<typeof makeBindCommands>
  readonly rerender: (next: RenderOptions) => void
} {
  const actions = options.actions ?? makeActions()
  const bindCommands = makeBindCommands()
  const view = render(<HighlightsPanel {...panelProps(options, actions, bindCommands)} />)
  return {
    actions,
    bindCommands,
    rerender: next => { view.rerender(<HighlightsPanel {...panelProps(next, actions, bindCommands)} />) },
  }
}

/** Panel rows in DOM order (the resurfacing block has list items too). */
function panelRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.dshhl-panel__row')]
}

/** Quotes of the rendered panel rows, in DOM order. */
function renderedQuotes(): string[] {
  return panelRows().map(node => node.querySelector('.dshhl-panel__quote')?.textContent ?? '')
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('HighlightsPanel states', () => {
  it('shows the session-empty state with a zero count', () => {
    renderPanel()

    expect(screen.getByText('panel.empty.title')).toBeTruthy()
    expect(screen.getByText('panel.empty.hint')).toBeTruthy()
    expect(screen.getByText('0 highlights')).toBeTruthy()
  })

  it('shows the loading state before the first read', () => {
    renderPanel({ snapshot: { status: 'loading' } })

    expect(screen.getByText('state.loading')).toBeTruthy()
  })

  it('shows the error state with a retry that forces a read', () => {
    const { actions } = renderPanel({ snapshot: { status: 'error', error: 'boom' } })

    expect(screen.getByText('state.error')).toBeTruthy()
    expect(screen.getByText('boom')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'state.retry' }))
    expect(actions.refresh).toHaveBeenCalledWith(true)
  })

  it('binds the tab refresh command to a forced read', () => {
    const { actions, bindCommands } = renderPanel()

    expect(bindCommands).toHaveBeenCalledTimes(1)
    bindCommands.mock.calls[0]?.[0]?.refresh?.()
    expect(actions.refresh).toHaveBeenCalledWith(true)
  })

  it('shows the offline and paint-support notices', () => {
    renderPanel({ snapshot: { offline: true, paintSupported: false } })

    expect(screen.getByText('state.offline')).toBeTruthy()
    expect(screen.getByText('state.unsupported')).toBeTruthy()
  })
})

describe('HighlightsPanel list', () => {
  it('renders this session only, in transcript order, with unknown positions last', () => {
    renderPanel({
      records: [
        makeRecord('c', { turn: 3, step: 0, quote: 'third', createdAt: 3 }),
        makeRecord('a', { turn: 1, step: 2, quote: 'first', createdAt: 1 }),
        makeRecord('b', { turn: 1, step: 1, quote: 'second', createdAt: 2 }),
        makeRecord('d', { quote: 'unpositioned', createdAt: 0 }),
        makeRecord('e', { turn: 2, step: 0, quote: 'other session', sessionId: 'session-2' }),
      ],
    })

    expect(renderedQuotes()).toEqual(['second', 'first', 'third', 'unpositioned'])
    expect(screen.getByText('4 highlights')).toBeTruthy()
  })

  it('dates rows relatively instead of rendering transcript ordinals', () => {
    renderPanel({ records: [makeRecord('a', { turn: 4, step: 2 })] })

    const row = panelRows()[0] as HTMLElement
    expect(row.textContent).not.toContain('Turn')
    expect(row.textContent).not.toContain('step')
    expect(row.querySelector('.dshhl-panel__time')).toBeTruthy()
  })

  it('names archived and no-longer-available sessions and disables reveal', () => {
    renderPanel({
      records: [makeRecord('a', { quote: 'alpha' })],
      sessions: { byId: { [SESSION]: { title: 'Session' } } },
      workspaces: { items: [], archivedSessionIds: [SESSION] },
    })
    expect(screen.getByText('badge.archived')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'action.reveal' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    renderPanel({ records: [makeRecord('a', { quote: 'alpha' })], sessions: { byId: {} } })
    expect(screen.getByText('badge.unavailable')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'action.reveal' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('marks a record whose anchor no longer resolves', () => {
    renderPanel({
      records: [makeRecord('a', { quote: 'alpha' }), makeRecord('b', { quote: 'beta' })],
      snapshot: { stale: new Set(['b']) },
    })

    const rows = panelRows()
    expect(rows[0]?.textContent).not.toContain('badge.orphaned')
    expect(rows[1]?.textContent).toContain('badge.orphaned')
  })

  it('chips an agent-authored row and leaves the reader’s own rows plain', () => {
    renderPanel({
      records: [
        makeRecord('a', { quote: 'agent row', author: 'agent', createdAt: 1 }),
        makeRecord('b', { quote: 'my row', createdAt: 2 }),
      ],
    })

    const rows = panelRows()
    expect(within(rows[0] as HTMLElement).getByText('Agent')).toBeTruthy()
    expect(within(rows[1] as HTMLElement).queryByText('Agent')).toBeNull()
    expect(document.querySelectorAll('.dshhl-metaChip')).toHaveLength(1)
  })

  it('narrows to the agent’s rows and back to everyone', () => {
    renderPanel({
      records: [
        makeRecord('a', { quote: 'agent row', author: 'agent', createdAt: 1 }),
        makeRecord('b', { quote: 'my row', createdAt: 2 }),
      ],
    })

    const agentChip = screen.getByRole('button', { name: "Agent's" })
    fireEvent.click(agentChip)
    expect(renderedQuotes()).toEqual(['agent row'])
    expect(agentChip.getAttribute('aria-pressed')).toBe('true')

    // Clicking the active chip returns to All, not to the other author.
    fireEvent.click(agentChip)
    expect(renderedQuotes()).toEqual(['agent row', 'my row'])

    const mineChip = screen.getByRole('button', { name: 'Mine' })
    fireEvent.click(mineChip)
    expect(renderedQuotes()).toEqual(['my row'])
    expect(mineChip.getAttribute('aria-pressed')).toBe('true')

    // The header Clear control covers the author axis too.
    fireEvent.click(screen.getByRole('button', { name: 'page.filter.clear' }))
    expect(renderedQuotes()).toEqual(['agent row', 'my row'])
    expect(mineChip.getAttribute('aria-pressed')).toBe('false')
  })

  it('cycles the processing cursor and reports a failed write inline', async () => {
    const record = makeRecord('a', { quote: 'cursor row' })
    const actions = makeActions()
    renderPanel({ records: [record], actions })

    fireEvent.click(screen.getByRole('button', { name: 'Status: New' }))
    await waitFor(() => { expect(actions.update).toHaveBeenCalledWith(record.id, { state: 'kept' }, 1) })
    // Optimistic: the row shows the next step before the store republishes.
    expect(screen.getByRole('button', { name: 'Status: Kept' })).toBeTruthy()
  })

  it('rolls the cursor back and says so when the write does not land', async () => {
    const record = makeRecord('a', { quote: 'cursor row' })
    const live = { ...record, state: 'kept' as const, version: 9 }
    renderPanel({ records: [record], actions: makeActions({ update: { status: 'conflict', record: live } }) })

    fireEvent.click(screen.getByRole('button', { name: 'Status: New' }))
    await waitFor(() => { expect(screen.getByText('Could not change the status.')).toBeTruthy() })
    // Back on the stored value, not stuck optimistically.
    expect(screen.getByRole('button', { name: 'Status: New' })).toBeTruthy()
  })

  it('shows the resurfacing block with a reason per row and opens the item', async () => {
    const kept = makeRecord('kept', { quote: 'kept row', state: 'kept' })
    const { actions } = renderPanel({ records: [kept, makeRecord('plain', { quote: 'plain row' })] })

    const block = screen.getByRole('region', { name: 'worth.title' })
    expect(within(block).getByText('worth.reason.keptUncompiled')).toBeTruthy()
    expect(within(block).queryByText('plain row')).toBeNull()

    fireEvent.click(within(block).getByRole('button'))
    await waitFor(() => { expect(actions.reveal).toHaveBeenCalledWith(kept) })
  })

  it('hides the resurfacing block while a filter is active', () => {
    renderPanel({ records: [makeRecord('kept', { quote: 'kept row', state: 'kept' })] })
    expect(screen.getByRole('region', { name: 'worth.title' })).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kept' } })
    expect(screen.queryByRole('region', { name: 'worth.title' })).toBeNull()
  })

  it('filters by search over quote, note, and tags', () => {
    renderPanel({
      records: [
        makeRecord('a', { quote: 'alpha quote' }),
        makeRecord('b', { quote: 'beta quote', note: 'alpha note' }),
        makeRecord('c', { quote: 'gamma quote', tags: ['alpha-tag'] }),
        makeRecord('d', { quote: 'delta quote' }),
      ],
    })

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } })

    expect(renderedQuotes()).toEqual(['alpha quote', 'beta quote', 'gamma quote'])
  })

  it('filters by colour, starred, and tag, and clears them all', () => {
    renderPanel({
      records: [
        makeRecord('a', { quote: 'alpha', colorId: 1, starred: true, tags: ['work'] }),
        makeRecord('b', { quote: 'beta', colorId: 2, tags: ['home'] }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'color.2' }))
    expect(renderedQuotes()).toEqual(['beta'])

    fireEvent.click(screen.getByRole('button', { name: 'page.filter.clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'page.filter.starred' }))
    expect(renderedQuotes()).toEqual(['alpha'])

    fireEvent.click(screen.getByRole('button', { name: 'page.filter.clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'work' }))
    expect(renderedQuotes()).toEqual(['alpha'])
  })

  it('offers a clear affordance when filters match nothing', () => {
    renderPanel({ records: [makeRecord('a', { quote: 'alpha' })] })

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })

    expect(screen.getByText('page.empty.filtered')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'page.filter.clear' }))
    expect(renderedQuotes()).toEqual(['alpha'])
  })
})

describe('HighlightsPanel scale', () => {
  it('caps the rendered rows and reveals the next page on demand', () => {
    const records = Array.from({ length: 250 }, (_, index) => makeRecord(`r${String(index)}`, { quote: `quote ${String(index)}` }))
    renderPanel({ records })

    expect(document.querySelectorAll('.dshhl-panel__row')).toHaveLength(200)
    fireEvent.click(screen.getByRole('button', { name: 'page.showMore' }))
    expect(document.querySelectorAll('.dshhl-panel__row')).toHaveLength(250)
  })
})

describe('HighlightsPanel row actions', () => {
  it('keeps two inline actions and puts the rest in the overflow menu', async () => {
    const record = makeRecord('a', { quote: 'alpha' })
    const { actions } = renderPanel({ records: [record] })
    /** Let one row action settle (each one disables the row while in flight). */
    const settle = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)) }
    // Density guard: two inline actions plus the overflow anchor.
    // Two inline actions, the cursor control and the overflow anchor.
    expect(within(panelRows()[0] as HTMLElement).getAllByRole('button')).toHaveLength(4)
    /** Open the row's `⋯` menu and pick one entry. */
    const pick = (name: string): void => {
      fireEvent.click(screen.getByRole('button', { name: 'status.menu' }))
      fireEvent.click(screen.getByRole('menuitem', { name }))
    }

    fireEvent.click(screen.getByRole('button', { name: 'action.reveal' }))
    expect(actions.reveal).toHaveBeenCalledWith(record)
    await settle()

    fireEvent.click(screen.getByRole('button', { name: 'action.insertCurrent' }))
    expect(actions.insert).toHaveBeenCalledWith(record, { kind: 'current' }, SESSION)
    await settle()

    pick('action.copy')
    expect(actions.copyQuote).toHaveBeenCalledWith(record)
    await waitFor(() => { expect(screen.getByText('action.copied')).toBeTruthy() })

    pick('action.star')
    expect(actions.update).toHaveBeenCalledWith(record.id, { starred: true })
    await settle()

    pick('action.delete')
    expect(actions.remove).toHaveBeenCalledWith(record.id)
  })

  it('offers insert into a new session behind the menu', async () => {
    const record = makeRecord('a', { quote: 'alpha' })
    const { actions } = renderPanel({ records: [record] })

    fireEvent.click(screen.getByRole('button', { name: 'status.menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.insertNew' }))
    await waitFor(() => { expect(actions.insert).toHaveBeenCalledWith(record, { kind: 'new' }, SESSION) })
  })

  it('reports queued and failed insertions instead of staying silent', async () => {
    const record = makeRecord('a', { quote: 'alpha' })
    const queued = renderPanel({ records: [record], actions: makeActions({ insert: 'queued' }) })
    fireEvent.click(screen.getByRole('button', { name: 'action.insertCurrent' }))
    await waitFor(() => { expect(screen.getByText('insert.queued')).toBeTruthy() })
    expect(queued.actions.insert).toHaveBeenCalledTimes(1)
    cleanup()

    renderPanel({ records: [record], actions: makeActions({ insert: 'failed' }) })
    fireEvent.click(screen.getByRole('button', { name: 'action.insertCurrent' }))
    await waitFor(() => { expect(screen.getByText('insert.failed')).toBeTruthy() })
  })

  it('reports a failed copy and a reveal that could not find the text', async () => {
    const record = makeRecord('a', { quote: 'alpha' })
    renderPanel({ records: [record], actions: makeActions({ copy: false, reveal: 'not-found' }) })

    fireEvent.click(screen.getByRole('button', { name: 'status.menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.copy' }))
    await waitFor(() => { expect(screen.getByText('action.copyFailed')).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: 'action.reveal' }))
    await waitFor(() => { expect(screen.getByText('reveal.failed')).toBeTruthy() })
  })

  it('keeps a refused delete visible and offers no Undo', async () => {
    const record = makeRecord('a', { quote: 'alpha' })
    const live = { ...record, version: 9 }
    renderPanel({ records: [record], actions: makeActions({ remove: { status: 'conflict', record: live } }) })

    fireEvent.click(screen.getByRole('button', { name: 'status.menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.delete' }))
    await waitFor(() => { expect(screen.getByText('conflict.title')).toBeTruthy() })
    // No fabricated undo, and the row is still there.
    expect(screen.queryByText('action.delete.tombstone')).toBeNull()
    expect(screen.getByText('alpha')).toBeTruthy()
  })

  it('keeps the draft and prompts when a row save loses the version race', async () => {
    const record = makeRecord('a', { quote: 'alpha', note: 'mine' })
    const live = { ...record, note: 'theirs', version: 4 }
    const actions = makeActions({ update: { status: 'conflict', record: live } })
    renderPanel({ records: [record], actions })

    fireEvent.click(screen.getByRole('button', { name: 'status.menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.edit' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'action.note' }), { target: { value: 'my note' } })
    fireEvent.click(screen.getByRole('button', { name: 'action.saveChanges' }))

    await waitFor(() => { expect(screen.getByText('conflict.title')).toBeTruthy() })
    expect((screen.getByRole('textbox', { name: 'action.note' }) as HTMLTextAreaElement).value).toBe('my note')

    fireEvent.click(screen.getByRole('button', { name: 'conflict.overwrite' }))
    await waitFor(() => { expect(actions.update).toHaveBeenCalledWith(record.id, expect.anything(), 4) })
  })

  it('keeps the removed record for an inline undo once the Host confirms it', async () => {
    const record = makeRecord('a', { quote: 'alpha' })
    const { actions } = renderPanel({ records: [record] })

    fireEvent.click(screen.getByRole('button', { name: 'status.menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.delete' }))
    await waitFor(() => { expect(screen.getByText('action.delete.tombstone')).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: 'action.undo' }))
    expect(actions.restore).toHaveBeenCalledWith(record.id)
    await waitFor(() => { expect(screen.queryByText('action.delete.tombstone')).toBeNull() })
  })

  it('saves colour, tags, and note through one update patch', async () => {
    const record = makeRecord('a', { quote: 'alpha', colorId: 1, tags: ['work'], note: 'old note' })
    const { actions } = renderPanel({ records: [record] })

    fireEvent.click(screen.getByRole('button', { name: 'status.menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.edit' }))
    // The filter pills share the names; scope to the row's editor swatch.
    fireEvent.click(within(panelRows()[0] as HTMLElement).getByRole('button', { name: 'color.4' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'action.note' }), { target: { value: 'new note' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'action.addTag' }), { target: { value: '#Ideas' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'action.addTag' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'action.saveChanges' }))

    await waitFor(() => {
      expect(actions.update).toHaveBeenCalledWith(record.id, {
        colorId: 4,
        tags: ['work', 'ideas'],
        note: 'new note',
        starred: false,
      })
    })
  })
})

describe('HighlightsPanel brief the agent', () => {
  /** The records one briefing call was handed. */
  function briefedRecords(actions: HighlightsActions): readonly HighlightRecord[] {
    const call = (actions.briefSession as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    return (call?.[1] ?? []) as readonly HighlightRecord[]
  }

  it('briefs the shown items from the tab header', () => {
    const first = makeRecord('a', { quote: 'alpha', createdAt: 1 })
    const second = makeRecord('b', { quote: 'beta', createdAt: 2 })
    const { actions } = renderPanel({ records: [second, first] })

    fireEvent.click(screen.getByRole('button', { name: 'brief.action' }))

    expect(actions.briefSession).toHaveBeenCalled()
    const call = (actions.briefSession as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    expect(call?.[0]).toBe(SESSION)
    expect(briefedRecords(actions).map(record => record.id)).toEqual(['a', 'b'])
  })

  it('briefs only the filtered items while a filter is active', () => {
    const { actions } = renderPanel({
      records: [
        makeRecord('a', { quote: 'alpha', colorId: 1, createdAt: 1 }),
        makeRecord('b', { quote: 'beta', colorId: 2, createdAt: 2 }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'color.2' }))
    fireEvent.click(screen.getByRole('button', { name: 'brief.action' }))

    expect(briefedRecords(actions).map(record => record.id)).toEqual(['b'])
  })

  it('hides the control when nothing is briefable', () => {
    renderPanel({ records: [makeRecord('p', { visibility: 'private' })] })
    expect(screen.queryByRole('button', { name: 'brief.action' })).toBeNull()
    cleanup()

    renderPanel({ records: [makeRecord('a', { quote: 'alpha' })] })
    expect(screen.getByRole('button', { name: 'brief.action' })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.queryByRole('button', { name: 'brief.action' })).toBeNull()
  })

  it('reports queued and failed briefings on the tab notice line', async () => {
    renderPanel({
      records: [makeRecord('a', { quote: 'alpha' })],
      actions: makeActions({ brief: 'queued' }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'brief.action' }))
    await waitFor(() => { expect(screen.getByText('insert.queued')).toBeTruthy() })
    cleanup()

    renderPanel({
      records: [makeRecord('a', { quote: 'alpha' })],
      actions: makeActions({ brief: 'failed' }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'brief.action' }))
    await waitFor(() => { expect(screen.getByText('insert.failed')).toBeTruthy() })
  })
})

describe('HighlightsPanel navigation target', () => {
  it('renders without a navigation target', () => {
    renderPanel({ records: [makeRecord('a', { quote: 'alpha' })] })

    expect(renderedQuotes()).toEqual(['alpha'])
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('ignores params that carry no highlight id', () => {
    renderPanel({
      records: [makeRecord('a', { quote: 'alpha' })],
      params: { file: { line: 3 } },
    })

    expect(renderedQuotes()).toEqual(['alpha'])
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls the target row into view and flashes it once', () => {
    renderPanel({
      records: [makeRecord('a', { quote: 'first' }), makeRecord('b', { quote: 'second' })],
      params: { highlightId: 'b' },
      })

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
    const flashed = document.querySelectorAll('.dshhl-panel__row--flash')
    expect(flashed).toHaveLength(1)
    expect(flashed[0]?.textContent).toContain('second')
  })

  it('clears a narrowing filter so the target row is present', () => {
    const records = [makeRecord('a', { quote: 'alpha' }), makeRecord('b', { quote: 'beta' })]
    const { rerender } = renderPanel({ records })

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } })
    expect(renderedQuotes()).toEqual(['alpha'])

    rerender({ records, params: { highlightId: 'b' }, revision: 1 })
    expect(renderedQuotes()).toEqual(['alpha', 'beta'])
  })
})
