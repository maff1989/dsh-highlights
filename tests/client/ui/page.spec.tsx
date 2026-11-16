/**
 * Component tests of the global Highlights page (surface S5).
 *
 * The page is a projection: every test renders it against a hand-built
 * `HighlightsSnapshot` and a recording action face, then drives it through the
 * DOM only (no internals). The platform primitives package is mocked because it
 * ships CSS-module imports the headless test runner cannot evaluate; production
 * loads it as an external from the shell.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'

import type {
  HighlightsActions,
  HighlightRecord,
  InsertOutcome,
  RevealOutcome,
  WriteOutcome,
} from '../../../src/client/data/actions'
import type { HighlightsSnapshot } from '../../../src/client/data/client'
import type { UpdatePatch } from '../../../src/shared/schema'
import type { HighlightAnchor } from '../../../src/shared/schema'
import type { ColorId } from '../../../src/shared/schema'
import { en } from '../../../src/client/locales'
import { HighlightsPage, type HighlightsPageProps } from '../../../src/client/ui/page/HighlightsPage'
import { disableUndoPrompt, resetUndoPrompt } from '../../../src/client/ui/undoPrompt'
import { setCaptureChordLabel } from '../../../src/client/ui/shortcutHint'
import { createNoticeService } from '../../../src/client/notice/service'
import type { NoticeService } from '../../../src/client/contracts/notice'
import { constantSignal, createSignal } from '../../../src/client/runtime/signal'
import type { PageTranslate, SessionCatalogState, WorkspaceCatalogState } from '../../../src/client/ui/page/grouping'
import { pageStore } from '../../../src/client/ui/page/pageStore'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => await import('./primitives-mock'))

afterEach(() => {
  cleanup()
  // The page store is app-scoped: every test starts from the initial view.
  pageStore.reset()
})

/** Fixed clock of the fixtures: 2026-11-11T12:00:00Z. */
const BASE_TIME = Date.UTC(2026, 10, 11, 12, 0, 0)
const HOUR = 3_600_000

/** Translate function backed by the real English dictionary. */
const t: PageTranslate = (key, params) => {
  const template = (en as Record<string, string>)[key as string] ?? String(key)
  return template.replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params?.[name] ?? ''))
}

/** Seed of a record fixture; only the fields a test cares about. */
interface RecordSeed {
  readonly id: string
  readonly quote?: string
  readonly sessionId?: string
  readonly sessionTitle?: string
  readonly workspacePath?: string
  readonly workspaceId?: string
  readonly colorId?: ColorId
  readonly tags?: readonly string[]
  readonly note?: string
  readonly starred?: boolean
  readonly author?: 'user' | 'agent'
  readonly state?: 'new' | 'kept' | 'compiled'
  readonly visibility?: 'agent' | 'private'
  readonly turn?: number
  readonly step?: number
  readonly sourceIndex?: number
  readonly start?: number
  readonly createdAt?: number
  readonly updatedAt?: number
}

/**
 * Build one stored record.
 * @param seed - the fields under test, defaulted like a real capture.
 * @returns a complete record fixture.
 */
function makeRecord(seed: RecordSeed): HighlightRecord {
  const anchor: HighlightAnchor = {
    nodeKey: '13:assistant-step1:0',
    kind: 'text',
    sourceIndex: seed.sourceIndex ?? 0,
    quote: seed.quote ?? 'quoted text',
    prefix: '',
    suffix: '',
    start: seed.start ?? 0,
    end: 12,
    projection: 1,
    turn: seed.turn,
    step: seed.step,
  }
  return {
    schemaVersion: 1,
    id: seed.id,
    sessionId: seed.sessionId ?? 'session-a',
    workspacePath: seed.workspacePath,
    workspaceId: seed.workspaceId,
    sessionTitle: seed.sessionTitle,
    origin: 'test-install',
    anchor,
    colorId: seed.colorId ?? 1,
    tags: [...(seed.tags ?? [])],
    note: seed.note,
    starred: seed.starred ?? false,
    author: seed.author,
    state: seed.state,
    visibility: seed.visibility,
    createdAt: seed.createdAt ?? BASE_TIME,
    updatedAt: seed.updatedAt ?? BASE_TIME,
    version: 1,
  }
}

/**
 * Build one store snapshot.
 * @param records - the visible records.
 * @param patch - snapshot fields a test overrides.
 * @returns a complete snapshot fixture.
 */
function makeSnapshot(records: readonly HighlightRecord[], patch: Partial<HighlightsSnapshot> = {}): HighlightsSnapshot {
  return {
    status: 'ready',
    records,
    byId: new Map(records.map(record => [record.id, record])),
    hello: undefined,
    error: undefined,
    offline: false,
    paintSupported: true,
    stale: new Set<string>(),
    recordsBySession: new Map(),
    staleBySession: new Map(),
    paintEpoch: 0,
    inFlight: new Set(),
    ...patch,
  }
}

/** Recorded action calls of one rendered page. */
interface ActionCalls {
  readonly refresh: Array<boolean | undefined>
  readonly update: Array<{ readonly id: string; readonly patch: UpdatePatch; readonly expectedVersion?: number }>
  readonly remove: string[]
  readonly restore: string[]
  readonly copyQuote: HighlightRecord[]
  readonly reveal: HighlightRecord[]
  readonly openPanelTab: HighlightRecord[]
  readonly brief: Array<{ readonly sessionId: string; readonly records: readonly HighlightRecord[] }>
}

/** Outcomes the fake Host reports for one test. */
interface ActionOutcomes {
  readonly update?: WriteOutcome
  readonly remove?: WriteOutcome
  readonly copy?: boolean
  readonly reveal?: RevealOutcome
  readonly insert?: InsertOutcome
  readonly brief?: InsertOutcome
}

/**
 * Recording action face.
 * @param outcomes - Host outcomes the fake returns (default: success).
 * @returns the actions and the arrays they append to.
 */
function makeActions(outcomes: ActionOutcomes = {}): { actions: HighlightsActions; calls: ActionCalls } {
  const calls: ActionCalls = { refresh: [], update: [], remove: [], restore: [], copyQuote: [], reveal: [], openPanelTab: [], brief: [] }
  const written = makeRecord({ id: 'written' })
  const actions: HighlightsActions = {
    refresh: force => {
      calls.refresh.push(force)
    },
    update: async (id, patch, expectedVersion) => {
      calls.update.push({ id, patch, ...(expectedVersion === undefined ? {} : { expectedVersion }) })
      return outcomes.update ?? { status: 'written', record: written }
    },
    remove: async id => {
      calls.remove.push(id)
      return outcomes.remove ?? { status: 'written', record: written }
    },
    restore: async id => {
      calls.restore.push(id)
      return { status: 'written', record: written }
    },
    copyQuote: async record => {
      calls.copyQuote.push(record)
      return outcomes.copy ?? true
    },
    reveal: async record => {
      calls.reveal.push(record)
      return outcomes.reveal ?? 'revealed'
    },
    insert: async () => outcomes.insert ?? 'inserted',
    briefSession: async (sessionId, records) => {
      calls.brief.push({ sessionId, records })
      return outcomes.brief ?? 'inserted'
    },
    openPanelTab: record => {
      calls.openPanelTab.push(record)
    },
    paintSupported: () => true,
  }
  return { actions, calls }
}

/** Optional shares one test hands the page besides the store snapshot. */
interface RenderOptions {
  readonly commands?: import('../../../src/client/commands/surface').CommandSurface
  /** Live Session catalog snapshot (absent = the page renders from stored snapshots). */
  readonly sessions?: SessionCatalogState
  /** Live Workspace catalog snapshot (absent = same fallback). */
  readonly workspaces?: WorkspaceCatalogState
  /** Shared notice channel; the frame-wide overlay renders it in the real app. */
  readonly notice?: NoticeService
}

/**
 * Render the page as the slot renderer would.
 * @param snapshot - the store snapshot the `useSnap` selector sees.
 * @param actions - the injected action face.
 * @param options - optional command face and live catalog snapshots.
 * @returns the render result.
 */
function renderPage(snapshot: HighlightsSnapshot, actions: HighlightsActions, options: RenderOptions = {}) {
  // The slot framework also supplies runtime shares this component never reads,
  // so the harness builds only the shares it does read and casts the rest away.
  const useSnap = <S,>(selector: (value: HighlightsSnapshot) => S): S => selector(snapshot)
  const sessions = options.sessions
  const workspaces = options.workspaces
  const props = {
    t,
    useSnap,
    actions,
    commands: options.commands,
    notice: options.notice,
    ...(sessions === undefined
      ? {}
      : { useSessions: <S,>(selector: (state: SessionCatalogState) => S): S => selector(sessions) }),
    ...(workspaces === undefined
      ? {}
      : { useWorkspaces: <S,>(selector: (state: WorkspaceCatalogState) => S): S => selector(workspaces) }),
  } as unknown as HighlightsPageProps
  return render(<HighlightsPage {...props} />)
}

/**
 * Disclosure toggle inside the heading with the given text.
 * @param level - heading level (2 = workspace, 3 = session).
 * @param label - text the heading must contain.
 * @returns the toggle button.
 */
function groupToggle(level: 2 | 3, label: string): HTMLElement {
  const heading = screen
    .getAllByRole('heading', { level })
    .find(candidate => candidate.textContent?.includes(label) ?? false)
  if (heading === undefined) throw new Error(`no level-${String(level)} heading containing ${label}`)
  return within(heading).getByRole('button')
}

/**
 * Quotes of the rendered rows in document order.
 * @returns the accessible names of every row article.
 */
function renderedQuotes(): Array<string | null> {
  return screen.getAllByRole('article').map(row => row.getAttribute('aria-label'))
}

/** A page with two workspaces, three sessions and positionally unordered records. */
function groupedFixture(): HighlightRecord[] {
  return [
    makeRecord({
      id: 'alpha-late',
      quote: 'alpha turn two',
      workspacePath: '/work/alpha',
      sessionId: 'alpha-1',
      sessionTitle: 'Alpha one',
      turn: 2,
      step: 0,
      updatedAt: BASE_TIME + 3 * HOUR,
    }),
    makeRecord({
      id: 'beta',
      quote: 'beta text',
      workspacePath: '/work/beta',
      sessionId: 'beta-1',
      sessionTitle: 'Beta one',
      turn: 1,
      step: 0,
      updatedAt: BASE_TIME + 9 * HOUR,
    }),
    makeRecord({
      id: 'alpha-early',
      quote: 'alpha turn one',
      workspacePath: '/work/alpha',
      sessionId: 'alpha-1',
      sessionTitle: 'Alpha one',
      turn: 1,
      step: 0,
      updatedAt: BASE_TIME + 1 * HOUR,
    }),
    makeRecord({
      id: 'alpha-other',
      quote: 'alpha other session',
      workspacePath: '/work/alpha',
      sessionId: 'alpha-2',
      sessionTitle: 'Alpha two',
      turn: 1,
      step: 1,
      updatedAt: BASE_TIME + 5 * HOUR,
    }),
  ]
}

describe('HighlightsPage states', () => {
  it('renders the empty state when no record exists', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot([]), actions)

    expect(screen.getByText('No highlights yet')).toBeTruthy()
    // The hint names the control that exists (Annotate), not a nonexistent one.
    expect(screen.getByText(/choose Annotate/u)).toBeTruthy()
    expect(screen.getByText('0 highlights')).toBeTruthy()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('renders the loading state before the first read resolves', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot([], { status: 'loading' }), actions)

    expect(screen.getByText('Loading highlights…')).toBeTruthy()
  })

  it('renders the error state and retries through the action face', () => {
    const { actions, calls } = makeActions()
    renderPage(makeSnapshot([], { status: 'error', error: 'host unreachable' }), actions)

    expect(screen.getByText('Could not load highlights.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(calls.refresh).toContain(true)
  })

  it('shows the offline and no-paint notices', () => {
    const { actions } = makeActions()
    const records = [makeRecord({ id: 'one', quote: 'one' })]
    renderPage(makeSnapshot(records, { offline: true, paintSupported: false }), actions)

    expect(screen.getByText(/Highlights are offline/u)).toBeTruthy()
    expect(screen.getByText(/cannot paint highlights/u)).toBeTruthy()
  })

  it('reports the total count with plural copy', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot([makeRecord({ id: 'a' }), makeRecord({ id: 'b' })]), actions)

    expect(screen.getByText('2 highlights')).toBeTruthy()
  })
})

describe('HighlightsPage grouping', () => {
  it('groups by workspace then session, newest session first, records in transcript order', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot(groupedFixture()), actions)

    expect(renderedQuotes()).toEqual(['beta text', 'alpha other session', 'alpha turn one', 'alpha turn two'])

    const workspaces = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(workspaces).toHaveLength(2)
    // The heading names the workspace (last path segment), never the absolute path.
    expect(workspaces[0]).toContain('beta')
    expect(workspaces[1]).toContain('alpha')
    expect(workspaces[0]).not.toContain('/work/')

    // Document order: the beta session first, then alpha's two sessions newest-first.
    const sessions = screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    expect(sessions[0]).toContain('Beta one')
    expect(sessions[1]).toContain('Alpha two')
    expect(sessions[2]).toContain('Alpha one')
  })

  it('falls back to the workspace id and to an unknown workspace label', () => {
    const { actions } = makeActions()
    const records = [
      makeRecord({ id: 'id-only', quote: 'by id', workspaceId: 'ws-42', sessionId: 's-42', updatedAt: BASE_TIME + HOUR }),
      makeRecord({ id: 'none', quote: 'orphan workspace', sessionId: 'unknown-session' }),
    ]
    renderPage(makeSnapshot(records), actions)

    const workspaces = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(workspaces[0]).toContain('ws-42')
    expect(workspaces[1]).toContain('Unknown workspace')
    // A session with no resolvable title is named, not shown by its id.
    const sessions = screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    // The heading also hosts the briefing control; match the label itself.
    expect(sessions.some(text => (text ?? '').includes('Untitled session'))).toBe(true)
  })

  it('collapses and expands a workspace group', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot(groupedFixture()), actions)

    const betaToggle = groupToggle(2, 'beta')
    expect(betaToggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(betaToggle)

    expect(betaToggle.getAttribute('aria-expanded')).toBe('false')
    expect(renderedQuotes()).toEqual(['alpha other session', 'alpha turn one', 'alpha turn two'])

    fireEvent.click(betaToggle)
    expect(renderedQuotes()).toContain('beta text')
  })
})

describe('HighlightsPage filtering', () => {
  /** Records that each filter can distinguish: quote, note and tag matches plus flags. */
  function filterFixture(): HighlightRecord[] {
    return [
      makeRecord({
        id: 'quote',
        quote: 'The migration must land before the release',
        sessionTitle: 'Plan',
        updatedAt: BASE_TIME + 4 * HOUR,
      }),
      makeRecord({ id: 'note', quote: 'second item', note: 'migration notes', updatedAt: BASE_TIME + 3 * HOUR }),
      makeRecord({ id: 'tag', quote: 'third item', tags: ['migration', 'design'], updatedAt: BASE_TIME + 2 * HOUR }),
      makeRecord({ id: 'star', quote: 'fourth item', starred: true, colorId: 3, updatedAt: BASE_TIME + HOUR }),
      makeRecord({ id: 'other', quote: 'fifth item', colorId: 5 }),
    ]
  }

  it('filters case-insensitively over quote, note and tags', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot(filterFixture()), actions)

    fireEvent.change(screen.getByPlaceholderText('Search quotes, notes, and tags'), {
      target: { value: 'MIGRATION' },
    })

    expect(renderedQuotes()).toEqual([
      'The migration must land before the release',
      'second item',
      'third item',
    ])
    expect(screen.getByText('Showing 3 of 5')).toBeTruthy()
  })

  it('filters by tag chip', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot(filterFixture()), actions)

    fireEvent.click(screen.getByRole('button', { name: '#design' }))
    expect(renderedQuotes()).toEqual(['third item'])

    // Clicking the active chip clears that filter.
    fireEvent.click(screen.getByRole('button', { name: '#design' }))
    expect(renderedQuotes()).toHaveLength(5)
  })

  it('filters by colour swatch', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot(filterFixture()), actions)

    // The swatches carry their names: slot 3 is the violet accent, slot 4 blue.
    fireEvent.click(screen.getByRole('button', { name: 'Violet' }))
    expect(renderedQuotes()).toEqual(['fourth item'])
    expect(screen.getByRole('button', { name: 'Violet' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Blue' }))
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    expect(renderedQuotes()).toEqual(['fifth item'])
  })

  it('filters by starred, then clears every filter', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot(filterFixture()), actions)

    fireEvent.click(screen.getByRole('button', { name: 'Starred' }))
    expect(renderedQuotes()).toEqual(['fourth item'])

    fireEvent.change(screen.getByPlaceholderText('Search quotes, notes, and tags'), {
      target: { value: 'nothing matches this' },
    })
    expect(screen.getByText('No highlights match these filters.')).toBeTruthy()

    // The header owns the single Clear control; the empty body does not repeat it.
    const clears = screen.getAllByRole('button', { name: 'Clear filters' })
    expect(clears).toHaveLength(1)
    fireEvent.click(clears[0] as HTMLElement)
    expect(renderedQuotes()).toHaveLength(5)
  })

  it('hides and shows unanchored records', () => {
    const { actions } = makeActions()
    const records = [makeRecord({ id: 'broken', quote: 'broken anchor' }), makeRecord({ id: 'live', quote: 'live anchor' })]
    renderPage(makeSnapshot(records, { stale: new Set(['broken']) }), actions)

    expect(screen.getByText('Unanchored')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: 'Show unanchored' })
    fireEvent.click(toggle)
    expect(renderedQuotes()).toEqual(['live anchor'])

    fireEvent.click(toggle)
    expect(renderedQuotes()).toHaveLength(2)
  })

  it('narrows to the agent’s rows and back to everyone', () => {
    const { actions } = makeActions()
    const records = [
      makeRecord({ id: 'agent-a', quote: 'agent item', author: 'agent' }),
      makeRecord({ id: 'mine-a', quote: 'my item', author: 'user' }),
    ]
    renderPage(makeSnapshot(records), actions)

    const agentChip = screen.getByRole('button', { name: "Agent's" })
    fireEvent.click(agentChip)
    expect(renderedQuotes()).toEqual(['agent item'])
    expect(agentChip.getAttribute('aria-pressed')).toBe('true')

    // Clicking the active chip returns to All, not to the other author.
    fireEvent.click(agentChip)
    expect(renderedQuotes()).toHaveLength(2)
    expect(agentChip.getAttribute('aria-pressed')).toBe('false')

    const mineChip = screen.getByRole('button', { name: 'Mine' })
    fireEvent.click(mineChip)
    expect(renderedQuotes()).toEqual(['my item'])
    expect(mineChip.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Showing 1 of 2')).toBeTruthy()
  })

})

describe('HighlightsPage row actions', () => {
  it('keeps two inline actions and copies through the overflow menu', () => {
    const { actions, calls } = makeActions()
    const record = makeRecord({ id: 'row', quote: 'row quote' })
    renderPage(makeSnapshot([record]), actions)

    const row = screen.getByRole('article')
    // Density guard: two quick actions, the cursor control and the overflow
    // anchor — never a wall of icon buttons.
    expect(within(row).getAllByRole('button')).toHaveLength(4)
    fireEvent.click(within(row).getByRole('button', { name: 'Star' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Show in conversation' }))
    fireEvent.click(within(row).getByLabelText('More highlights views'))
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Copy quote' }))

    expect(calls.update).toEqual([{ id: 'row', patch: { starred: true } }])
    expect(calls.copyQuote).toEqual([record])
    expect(calls.reveal).toEqual([record])
  })

  it('portals the overflow menu out of the content-visibility row', () => {
    const { actions } = makeActions()
    const record = makeRecord({ id: 'menu', quote: 'menu quote' })
    renderPage(makeSnapshot([record]), actions)

    const row = screen.getByRole('article')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(within(row).getByLabelText('More highlights views'))

    // Rows set `content-visibility: auto` (paint containment + a stacking
    // context), so an in-place list is clipped and painted under the following
    // rows. The real primitive must therefore render the list into
    // document.body; the primitives mock keeps it in place (every other test
    // queries items within their row) and exposes the portal flag instead.
    expect(screen.getByRole('menu').getAttribute('data-portal')).toBe('true')
  })

  it('stars down a starred record and opens its panel tab', () => {
    const { actions, calls } = makeActions()
    const record = makeRecord({ id: 'starred', quote: 'starred quote', starred: true })
    renderPage(makeSnapshot([record]), actions)

    const row = screen.getByRole('article')
    fireEvent.click(within(row).getByRole('button', { name: 'Unstar' }))
    fireEvent.click(within(row).getByLabelText('More highlights views'))
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Show session highlights' }))

    expect(calls.update).toEqual([{ id: 'starred', patch: { starred: false } }])
    expect(calls.openPanelTab).toEqual([record])
  })

  it('deletes through the overflow menu and offers Undo (policy A)', async () => {
    const { actions, calls } = makeActions()
    const record = makeRecord({ id: 'doomed', quote: 'delete me' })
    renderPage(makeSnapshot([record]), actions)

    const row = screen.getByRole('article')
    fireEvent.click(within(row).getByLabelText('More highlights views'))
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Delete' }))

    expect(calls.remove).toEqual(['doomed'])
    await waitFor(() => { expect(screen.getByText('Highlight deleted')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => { expect(calls.restore).toEqual(['doomed']) })
  })

  it('routes row mutations through the injected command surface', async () => {
    const { actions, calls } = makeActions()
    const record = makeRecord({ id: 'via-command', quote: 'command routed' })
    const busy = createSignal<ReadonlySet<string>>(new Set())
    const commands = {
      update: vi.fn(async () => ({ status: 'written' as const, record })),
      star: vi.fn(async () => ({ status: 'written' as const, record: { ...record, starred: true } })),
      remove: vi.fn(async () => ({ status: 'written' as const, record })),
      restore: vi.fn(async () => ({ status: 'written' as const, record })),
      copy: vi.fn(async () => true),
      reveal: vi.fn(async () => 'revealed' as const),
      insert: vi.fn(async () => 'inserted' as const),
      openPanel: vi.fn(async () => undefined),
      refresh: vi.fn(),
      busy,
    }
    renderPage(makeSnapshot([record]), actions, { commands })
    fireEvent.click(within(screen.getByRole('article')).getByLabelText('Star'))
    await waitFor(() => { expect(commands.star).toHaveBeenCalledWith('via-command', true) })
    expect(calls.update).toEqual([])
    // In-flight state from the command layer renders as aria-busy on the surface.
    busy.set(new Set(['update:via-command']))
    await waitFor(() => { expect(document.querySelector('.dshhl-page')?.getAttribute('aria-busy')).toBe('true') })
  })

  it('suppresses the undo strip after “Don\'t ask again”', async () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot([makeRecord({ id: 'doomed', quote: 'delete me' })]), actions)
    const row = screen.getByRole('article')
    fireEvent.click(within(row).getByLabelText('More highlights views'))
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => { expect(screen.getByText('Highlight deleted')).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: "Don't ask again" }))
    expect(screen.queryByText('Highlight deleted')).toBeNull()
    expect(window.localStorage.getItem('dsh.highlights.undoPrompt.v1')).toBe('off')
    resetUndoPrompt()
  })

  it('edits colour, tags and note in place', () => {
    const { actions, calls } = makeActions()
    const record = makeRecord({ id: 'edited', quote: 'edit me', note: 'old note', tags: ['design'] })
    renderPage(makeSnapshot([record]), actions)

    const row = screen.getByRole('article')
    fireEvent.click(within(row).getByLabelText('More highlights views'))
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Edit' }))

    fireEvent.click(within(row).getByRole('button', { name: 'Green' }))
    fireEvent.change(within(row).getByLabelText('Note'), { target: { value: 'updated note' } })
    fireEvent.change(within(row).getByLabelText('Add tag'), { target: { value: '#release' } })
    fireEvent.keyDown(within(row).getByLabelText('Add tag'), { key: 'Enter' })
    fireEvent.click(within(row).getByRole('button', { name: 'Save changes' }))

    expect(calls.update).toHaveLength(1)
    expect(calls.update[0]?.id).toBe('edited')
    expect(calls.update[0]?.patch).toEqual({ colorId: 2, tags: ['design', 'release'], note: 'updated note' })
  })

  it('reports a failed copy instead of claiming success', async () => {
    const { actions } = makeActions({ copy: false })
    const notice = createNoticeService()
    renderPage(makeSnapshot([makeRecord({ id: 'copy-row', quote: 'copy me' })]), actions, { notice })

    fireEvent.click(screen.getByLabelText('More highlights views'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy quote' }))
    // The notice channel is the contract; the frame-wide overlay renders it.
    await waitFor(() => {
      expect(notice.state.get()?.text).toBe('Could not copy the quote.')
    })
    notice.dispose()
  })

  it('reports a reveal that could not find the text', async () => {
    const { actions } = makeActions({ reveal: 'not-found' })
    const notice = createNoticeService()
    renderPage(makeSnapshot([makeRecord({ id: 'reveal-row', quote: 'reveal me' })]), actions, { notice })

    fireEvent.click(screen.getByRole('button', { name: 'Show in conversation' }))
    await waitFor(() => {
      expect(notice.state.get()?.text).toBe('Could not find that text in the conversation.')
    })
    notice.dispose()
  })

  it('keeps the draft and prompts when the page editor loses the version race', async () => {
    const { actions, calls } = makeActions()
    const record = makeRecord({ id: 'conflicted', quote: 'race me', note: 'mine' })
    const live = { ...record, note: 'theirs', version: 7, updatedAt: record.updatedAt + 1 }
    let attempt = 0
    actions.update = async (id, patch, expectedVersion) => {
      calls.update.push({ id, patch, ...(expectedVersion === undefined ? {} : { expectedVersion }) })
      attempt += 1
      return attempt === 1 ? { status: 'conflict', record: live } : { status: 'written', record: live }
    }
    renderPage(makeSnapshot([record]), actions)

    const row = screen.getByRole('article')
    fireEvent.click(within(row).getByLabelText('More highlights views'))
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Edit' }))
    fireEvent.change(within(row).getByLabelText('Note'), { target: { value: 'my newer note' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => { expect(row.querySelector('.dshhl-conflict')).toBeTruthy() })
    // The editor (and its draft) stayed open.
    expect((within(row).getByLabelText('Note') as HTMLTextAreaElement).value).toBe('my newer note')

    // Overwrite retries with the stored version as the CAS precondition.
    fireEvent.click(within(row).getByRole('button', { name: 'Overwrite' }))
    await waitFor(() => { expect(calls.update[1]?.expectedVersion).toBe(7) })
    await waitFor(() => { expect(row.querySelector('.dshhl-conflict')).toBeNull() })
  })

  it('adopts the stored version when the page editor reloads after a conflict', async () => {
    const { actions } = makeActions()
    const record = makeRecord({ id: 'reload-row', quote: 'race me', note: 'mine' })
    const live = { ...record, note: 'theirs', version: 7 }
    actions.update = async () => ({ status: 'conflict', record: live })
    renderPage(makeSnapshot([record]), actions)

    const row = screen.getByRole('article')
    fireEvent.click(within(row).getByLabelText('More highlights views'))
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Edit' }))
    fireEvent.change(within(row).getByLabelText('Note'), { target: { value: 'my newer note' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => { expect(row.querySelector('.dshhl-conflict')).toBeTruthy() })

    fireEvent.click(within(row).getByRole('button', { name: 'Reload' }))
    expect(row.querySelector('.dshhl-conflict')).toBeNull()
    expect((within(row).getByLabelText('Note') as HTMLTextAreaElement).value).toBe('theirs')
  })

  it('closes the editor without writing when cancelled', () => {
    const { actions, calls } = makeActions()
    const record = makeRecord({ id: 'cancelled', quote: 'leave me alone' })
    renderPage(makeSnapshot([record]), actions)

    const row = screen.getByRole('article')
    fireEvent.click(within(row).getByLabelText('More highlights views'))
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Edit' }))
    expect(within(row).getByLabelText('Note')).toBeTruthy()

    fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
    expect(within(row).queryByLabelText('Note')).toBeNull()
    expect(calls.update).toHaveLength(0)
  })
})

describe('HighlightsPage vocabulary', () => {
  it('dates rows relatively and never renders transcript ordinals or absolute paths', () => {
    const { actions } = makeActions()
    const record = makeRecord({
      id: 'meta',
      quote: 'metadata row',
      sessionTitle: 'Session one',
      workspacePath: '/home/matthew/work/alpha',
      turn: 8,
      step: 9,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    })
    renderPage(makeSnapshot([record]), actions)

    const row = screen.getByRole('article')
    expect(row.textContent).not.toContain('Turn')
    expect(row.textContent).not.toContain('step')
    expect(row.textContent).not.toContain('/home')
    // The colour is named for assistive tech; the date is relative.
    expect(within(row).getByText('Amber')).toBeTruthy()
    expect(within(row).getByText(/ago|just now/u)).toBeTruthy()
  })

  it('chips an agent-authored row and leaves the reader’s own rows plain', () => {
    const { actions } = makeActions()
    const records = [
      makeRecord({ id: 'agent-a', quote: 'agent row', author: 'agent' }),
      makeRecord({ id: 'mine-a', quote: 'my row', author: 'user' }),
    ]
    renderPage(makeSnapshot(records), actions)

    const rows = screen.getAllByRole('article')
    expect(within(rows[0] as HTMLElement).getByText('Agent')).toBeTruthy()
    // The reader's own row carries no author chip at all — no "You" noise.
    expect(within(rows[1] as HTMLElement).queryByText('Agent')).toBeNull()
    expect(within(rows[1] as HTMLElement).queryByText('You')).toBeNull()
    expect(document.querySelectorAll('.dshhl-metaChip')).toHaveLength(1)
  })

  it('shows the processing cursor on the metadata line and reads absent state as new', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot([makeRecord({ id: 'plain', quote: 'plain row' })]), actions)

    // Back-compat: a record written before schema v2 reads as New.
    expect(screen.getByRole('button', { name: 'Status: New' })).toBeTruthy()
  })
})

describe('HighlightsPage processing cursor', () => {
  it('cycles new → kept → compiled → new, one CAS write per step', async () => {
    const { actions, calls } = makeActions()
    const record = makeRecord({ id: 'cursor', quote: 'cursor row' })
    renderPage(makeSnapshot([record]), actions)

    fireEvent.click(screen.getByRole('button', { name: 'Status: New' }))
    await waitFor(() => { expect(calls.update).toHaveLength(1) })
    expect(calls.update[0]).toEqual({ id: 'cursor', patch: { state: 'kept' }, expectedVersion: 1 })
    // Optimistic: the label moved before the store republished the record.
    expect(screen.getByRole('button', { name: 'Status: Kept' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Status: Kept' }))
    await waitFor(() => { expect(calls.update).toHaveLength(2) })
    expect(calls.update[1]).toEqual({ id: 'cursor', patch: { state: 'compiled' }, expectedVersion: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'Status: Compiled' }))
    await waitFor(() => { expect(calls.update).toHaveLength(3) })
    expect(calls.update[2]).toEqual({ id: 'cursor', patch: { state: 'new' }, expectedVersion: 1 })
  })

  it('is single-flight per row: a double click writes once', async () => {
    const { actions } = makeActions()
    let settle: ((outcome: WriteOutcome) => void) | undefined
    const update = vi.fn(async () => await new Promise<WriteOutcome>(resolve => { settle = resolve }))
    actions.update = update as unknown as HighlightsActions['update']
    renderPage(makeSnapshot([makeRecord({ id: 'double', quote: 'double row' })]), actions)

    const chip = screen.getByRole('button', { name: 'Status: New' })
    fireEvent.click(chip)
    fireEvent.click(chip)
    expect(update).toHaveBeenCalledTimes(1)

    settle?.({ status: 'written', record: makeRecord({ id: 'double', quote: 'double row', state: 'kept' }) })
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Status: Kept' })).toBeTruthy() })
  })

  it('moves with ← / → while the chip has focus, and stops at new going back', async () => {
    const { actions, calls } = makeActions()
    renderPage(makeSnapshot([makeRecord({ id: 'keys', quote: 'keyboard row' })]), actions)

    const chip = screen.getByRole('button', { name: 'Status: New' })
    chip.focus()
    fireEvent.keyDown(chip, { key: 'ArrowLeft' })
    expect(calls.update).toHaveLength(0)

    fireEvent.keyDown(chip, { key: 'ArrowRight' })
    await waitFor(() => { expect(calls.update).toHaveLength(1) })
    expect(calls.update[0]?.patch).toEqual({ state: 'kept' })

    fireEvent.keyDown(screen.getByRole('button', { name: 'Status: Kept' }), { key: 'ArrowLeft' })
    await waitFor(() => { expect(calls.update).toHaveLength(2) })
    expect(calls.update[1]?.patch).toEqual({ state: 'new' })
  })

  it('rolls back and says so when the write does not land', async () => {
    const { actions, calls } = makeActions()
    actions.update = async (id, patch, expectedVersion) => {
      calls.update.push({ id, patch, ...(expectedVersion === undefined ? {} : { expectedVersion }) })
      return { status: 'conflict', record: makeRecord({ id, quote: 'cursor row' }) }
    }

    const notice = createNoticeService()
    renderPage(makeSnapshot([makeRecord({ id: 'fail', quote: 'cursor row' })]), actions, { notice })

    fireEvent.click(screen.getByRole('button', { name: 'Status: New' }))
    // The notice channel is the contract; the frame-wide overlay renders it.
    await waitFor(() => { expect(notice.state.get()?.text).toBe('Could not change the status.') })
    // The chip is back on the stored value, not stuck optimistically.
    expect(screen.getByRole('button', { name: 'Status: New' })).toBeTruthy()
    expect(calls.update).toHaveLength(1)
    notice.dispose()
  })
})

describe('HighlightsPage worth another look', () => {
  const DAY = 24 * 60 * 60 * 1000
  const NOW_MS = Date.now()

  /** One record per predicate plus a record that must never surface. */
  function worthFixture(): HighlightRecord[] {
    return [
      makeRecord({ id: 'starred-new', quote: 'starred and new', starred: true, updatedAt: NOW_MS }),
      makeRecord({ id: 'kept', quote: 'kept but not compiled', state: 'kept', updatedAt: NOW_MS }),
      makeRecord({ id: 'drifted', quote: 'text changed', state: 'compiled', updatedAt: NOW_MS }),
      makeRecord({ id: 'old-new', quote: 'old and still new', state: 'new', updatedAt: NOW_MS - 40 * DAY }),
      makeRecord({ id: 'plain', quote: 'just triaged', state: 'compiled', updatedAt: NOW_MS }),
    ]
  }

  it('shows one reason per candidate, in a deterministic order, and never a bare row', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot(worthFixture(), { stale: new Set(['drifted']) }), actions)

    const block = screen.getByRole('region', { name: 'Worth another look' })
    const excerpts = [...block.querySelectorAll('.dshhl-worth__excerpt')].map(node => node.textContent)
    // Precedence order; the fourth candidate is behind the cap.
    expect(excerpts).toEqual(['starred and new', 'kept but not compiled', 'text changed'])
    expect(within(block).getByText('Starred, still new')).toBeTruthy()
    expect(within(block).getByText('Kept, not compiled yet')).toBeTruthy()
    expect(within(block).getByText('The text changed')).toBeTruthy()
    // A record with no predicate never appears.
    expect(within(block).queryByText('just triaged')).toBeNull()

    // Every rendered row states a reason from the allowed set.
    const allowed = ['Starred, still new', 'Kept, not compiled yet', 'The text changed', 'Still new after a month']
    for (const row of block.querySelectorAll('.dshhl-worth__row')) {
      const reason = row.querySelector('.dshhl-worth__reason')?.textContent ?? ''
      expect(allowed).toContain(reason)
    }

    fireEvent.click(within(block).getByRole('button', { name: 'Show 1 more' }))
    expect(within(block).getByText('Still new after a month')).toBeTruthy()
    fireEvent.click(within(block).getByRole('button', { name: 'Show fewer' }))
    expect(within(block).queryByText('Still new after a month')).toBeNull()
  })

  it('opens the item with the page reveal path', () => {
    const { actions, calls } = makeActions()
    renderPage(makeSnapshot(worthFixture(), { stale: new Set(['drifted']) }), actions)

    const block = screen.getByRole('region', { name: 'Worth another look' })
    fireEvent.click(within(block).getAllByRole('button')[0] as HTMLElement)
    expect(calls.reveal[0]?.id).toBe('starred-new')
  })

  it('is silent when nothing qualifies', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot([makeRecord({ id: 'plain', quote: 'just triaged', state: 'compiled', updatedAt: NOW_MS })]), actions)

    expect(screen.queryByRole('region', { name: 'Worth another look' })).toBeNull()
  })

  it('is suppressed while a filter narrows the page', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot(worthFixture(), { stale: new Set(['drifted']) }), actions)
    expect(screen.getByRole('region', { name: 'Worth another look' })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Search quotes, notes, and tags'), { target: { value: 'starred' } })
    expect(screen.queryByRole('region', { name: 'Worth another look' })).toBeNull()
  })
})

describe('HighlightsPage brief the agent', () => {
  it('briefs one session from its group header with the shown records', () => {
    const { actions, calls } = makeActions()
    renderPage(makeSnapshot(groupedFixture()), actions)

    fireEvent.click(screen.getByRole('button', { name: 'Brief the agent on “Alpha one”' }))

    expect(calls.brief).toHaveLength(1)
    expect(calls.brief[0]?.sessionId).toBe('alpha-1')
    expect(calls.brief[0]?.records.map(record => record.anchor.quote)).toEqual([
      'alpha turn one',
      'alpha turn two',
    ])
  })

  it('hides the control for a session whose shown records are all private', () => {
    const { actions } = makeActions()
    renderPage(makeSnapshot([
      makeRecord({
        id: 'private-one',
        quote: 'private one',
        sessionId: 's-private',
        sessionTitle: 'Private session',
        visibility: 'private',
        updatedAt: BASE_TIME + HOUR,
      }),
      makeRecord({
        id: 'public-one',
        quote: 'public one',
        sessionId: 's-public',
        sessionTitle: 'Public session',
        updatedAt: BASE_TIME,
      }),
    ]), actions)

    expect(screen.queryByRole('button', { name: 'Brief the agent on “Private session”' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Brief the agent on “Public session”' })).toBeTruthy()
  })

  it('briefs only the shown records when a filter narrows the page', () => {
    const { actions, calls } = makeActions()
    renderPage(makeSnapshot(groupedFixture()), actions)

    fireEvent.change(screen.getByPlaceholderText('Search quotes, notes, and tags'), {
      target: { value: 'alpha turn one' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Brief the agent on “Alpha one”' }))

    expect(calls.brief[0]?.records.map(record => record.anchor.quote)).toEqual(['alpha turn one'])
  })

  it('reports a queued briefing through the notice channel', async () => {
    const { actions } = makeActions({ brief: 'queued' })
    const notice = createNoticeService()
    renderPage(makeSnapshot(groupedFixture()), actions, { notice })

    fireEvent.click(screen.getByRole('button', { name: 'Brief the agent on “Beta one”' }))
    await waitFor(() => {
      expect(notice.state.get()?.text).toBe('Opening that session to insert the highlight…')
    })
    notice.dispose()
  })

  it('reports a failed briefing through the notice channel as a warning', async () => {
    const { actions } = makeActions({ brief: 'failed' })
    const notice = createNoticeService()
    renderPage(makeSnapshot(groupedFixture()), actions, { notice })

    fireEvent.click(screen.getByRole('button', { name: 'Brief the agent on “Beta one”' }))
    await waitFor(() => {
      expect(notice.state.get()?.text).toBe('Could not insert the highlight. Copy it instead?')
    })
    expect(notice.state.get()?.warn).toBe(true)
    notice.dispose()
  })
})

describe('HighlightsPage live catalog', () => {
  it('names the workspace and session from the live catalog, not the stored snapshot', () => {
    const { actions } = makeActions()
    const record = makeRecord({
      id: 'live',
      quote: 'live row',
      sessionId: 's1',
      sessionTitle: 'Stale stored title',
      workspacePath: '/home/matthew/work/old-name',
      updatedAt: BASE_TIME,
    })
    renderPage(makeSnapshot([record]), actions, {
      sessions: { byId: { s1: { title: 'Renamed session' } } },
      workspaces: {
        items: [{ workspaceId: 'w1', path: '/home/matthew/work/new-name', sessionIds: ['s1'] }],
        archivedSessionIds: [],
      },
    })

    const workspaces = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(workspaces[0]).toContain('new-name')
    expect(workspaces[0]).not.toContain('old-name')
    const sessions = screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    expect(sessions[0]).toContain('Renamed session')
    expect(sessions[0]).not.toContain('Stale stored title')
  })

  it('badges an archived session and an unavailable one, and disables reveal', () => {
    const { actions, calls } = makeActions()
    const archived = makeRecord({
      id: 'archived',
      quote: 'archived row',
      sessionId: 's-archived',
      updatedAt: BASE_TIME + HOUR,
    })
    const gone = makeRecord({ id: 'gone', quote: 'gone row', sessionId: 's-gone', updatedAt: BASE_TIME })
    renderPage(makeSnapshot([archived, gone]), actions, {
      sessions: { byId: { 's-archived': { title: 'Old session' } } },
      workspaces: { items: [], archivedSessionIds: ['s-archived'] },
    })

    expect(screen.getByText('Archived')).toBeTruthy()
    expect(screen.getByText('Unavailable')).toBeTruthy()
    const revealButtons = screen.getAllByRole('button', { name: 'Show in conversation' })
    expect(revealButtons).toHaveLength(2)
    for (const button of revealButtons) expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(revealButtons[0] as HTMLElement)
    expect(calls.reveal).toEqual([])
  })
})

describe('HighlightsPage view state', () => {
  it('restores search, folds and scroll after leaving and returning', () => {
    const { actions } = makeActions()
    const records = groupedFixture()
    const first = renderPage(makeSnapshot(records), actions)

    fireEvent.change(screen.getByPlaceholderText('Search quotes, notes, and tags'), {
      target: { value: 'alpha' },
    })
    fireEvent.click(groupToggle(2, 'alpha'))
    expect(screen.queryAllByRole('article')).toHaveLength(0)

    const scroller = document.querySelector('.dshhl-page__scroll') as HTMLElement
    scroller.scrollTop = 240
    fireEvent.scroll(scroller)
    first.unmount()

    renderPage(makeSnapshot(records), actions)
    expect((screen.getByPlaceholderText('Search quotes, notes, and tags') as HTMLInputElement).value).toBe('alpha')
    expect(groupToggle(2, 'alpha').getAttribute('aria-expanded')).toBe('false')
    const restored = document.querySelector('.dshhl-page__scroll') as HTMLElement
    expect(restored.scrollTop).toBe(240)
  })

  it('keeps the author narrowing across a remount', () => {
    const { actions } = makeActions()
    const records = [
      makeRecord({ id: 'agent-a', quote: 'agent item', author: 'agent' }),
      makeRecord({ id: 'mine-a', quote: 'my item', author: 'user' }),
    ]
    const first = renderPage(makeSnapshot(records), actions)

    fireEvent.click(screen.getByRole('button', { name: 'Mine' }))
    expect(renderedQuotes()).toEqual(['my item'])
    first.unmount()

    renderPage(makeSnapshot(records), actions)
    expect(screen.getByRole('button', { name: 'Mine' }).getAttribute('aria-pressed')).toBe('true')
    expect(renderedQuotes()).toEqual(['my item'])
  })
})

describe('HighlightsPage scale', () => {
  it('renders 200 records across sessions', () => {
    const { actions } = makeActions()
    const records = Array.from({ length: 200 }, (_unused, index) =>
      makeRecord({
        id: `bulk-${String(index)}`,
        quote: `bulk quote ${String(index)}`,
        sessionId: `bulk-session-${String(index % 4)}`,
        sessionTitle: `Bulk session ${String(index % 4)}`,
        workspacePath: index % 8 === 0 ? '/work/other' : '/work/main',
        turn: index % 12,
        step: index % 3,
        updatedAt: BASE_TIME + index * 1_000,
      }),
    )

    renderPage(makeSnapshot(records), actions)

    expect(screen.getByText('200 highlights')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(200)
  })

  it('caps the rendered rows and reveals the next page on demand', () => {
    const { actions } = makeActions()
    const records = Array.from({ length: 260 }, (_unused, index) =>
      makeRecord({
        id: `bulk-${String(index)}`,
        quote: `bulk quote ${String(index)}`,
        sessionId: `bulk-session-${String(index % 4)}`,
        sessionTitle: `Bulk session ${String(index % 4)}`,
        workspacePath: '/work/main',
        turn: index,
      }),
    )

    renderPage(makeSnapshot(records), actions)
    expect(screen.getAllByRole('article')).toHaveLength(200)

    fireEvent.click(screen.getByRole('button', { name: /Show more/u }))
    expect(screen.getAllByRole('article')).toHaveLength(260)
  })
})

describe('HighlightsPage first run', () => {
  afterEach(() => { setCaptureChordLabel(null) })

  it('explains the gesture and states that agent access is off', () => {
    renderPage(makeSnapshot([]), makeActions().actions)
    expect(screen.getByText(t('page.empty.title'))).toBeTruthy()
    expect(screen.getByText(t('firstRun.capture.noChord'))).toBeTruthy()
    expect(screen.getByText(t('firstRun.agentOff'))).toBeTruthy()
  })

  it('names the chord that actually registered', () => {
    setCaptureChordLabel('Ctrl+Shift+H')
    renderPage(makeSnapshot([]), makeActions().actions)
    expect(screen.getByText(t('firstRun.capture', { chord: 'Ctrl+Shift+H' }))).toBeTruthy()
  })

  it('stops advertising agent access once it is on', () => {
    const snapshot = makeSnapshot([], {
      hello: {
        protocol: 1,
        domainVersion: 1,
        installId: 'install-1',
        count: 0,
        maxRecords: 10_000,
        insertionAttribution: true,
        pollIntervalMs: 0,
        agentAccess: 'read',
      },
    })
    renderPage(snapshot, makeActions().actions)
    expect(screen.queryByText(t('firstRun.agentOff'))).toBeNull()
  })
})
