/**
 * Unit tests of the page's pure derivations.
 *
 * The component suite covers the rendered result; these pin the ordering and
 * bucket edges that are hard to see through the DOM (unpositioned anchors,
 * newest-first session order, unknown workspace fallback, relative-time
 * boundaries).
 */
import { describe, expect, it } from 'vitest'

import type { HighlightRecord } from '../../../src/client/data/actions'
import { authorOf } from '../../../src/shared/provenance'
import {
  UNKNOWN_WORKSPACE,
  COLOR_IDS,
  authorLabelOf,
  buildCatalog,
  catalogEntryOf,
  colorLabel,
  deriveFacets,
  filterRecords,
  formatRelativeTime,
  groupRecords,
  hasActiveFilters,
  EMPTY_FILTERS,
  sessionLabelOf,
  stateLabel,
  worthReview,
  workspaceBasename,
  workspaceDisplayName,
  workspaceKeyOf,
  type PageTranslate,
} from '../../../src/client/ui/page/grouping'

const BASE_TIME = Date.UTC(2026, 10, 11, 12, 0, 0)
const HOUR = 3_600_000

/**
 * Minimal record fixture; only the fields a grouping test reads.
 * @param id - record id.
 * @param overrides - fields that differ from the defaults.
 * @returns a stored record.
 */
function record(id: string, overrides: Partial<HighlightRecord> = {}): HighlightRecord {
  return {
    schemaVersion: 1,
    id,
    sessionId: 'session-a',
    origin: 'test-install',
    anchor: {
      nodeKey: '13:assistant-step1:0',
      kind: 'text',
      sourceIndex: 0,
      quote: `quote ${id}`,
      prefix: '',
      suffix: '',
      start: 0,
      end: 5,
      projection: 1,
    },
    colorId: 1,
    tags: [],
    starred: false,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    version: 1,
    ...overrides,
  }
}

describe('workspace identity', () => {
  it('prefers the stored path, then the id, then the unknown label', () => {
    expect(workspaceKeyOf(record('a', { workspacePath: '/w/one', workspaceId: 'id-1' }))).toBe('/w/one')
    expect(workspaceKeyOf(record('b', { workspaceId: 'id-2' }))).toBe('id-2')
    expect(workspaceKeyOf(record('c'))).toBe(UNKNOWN_WORKSPACE)
    expect(sessionLabelOf(record('d', { sessionTitle: 'Title' }))).toBe('Title')
    // A session with no resolvable title is unnamed, never rendered as its id.
    expect(sessionLabelOf(record('e'))).toBeUndefined()
    expect(workspaceBasename('/home/me/work/alpha')).toBe('alpha')
    expect(workspaceBasename('C:\\work\\beta')).toBe('beta')
    // The heading names the workspace; the path stays grouping identity only.
    expect(workspaceDisplayName('/home/me/work/alpha')).toBe('alpha')
    expect(workspaceDisplayName('ws-42')).toBe('ws-42')
    expect(workspaceDisplayName(UNKNOWN_WORKSPACE)).toBe(UNKNOWN_WORKSPACE)
  })
})

describe('groupRecords', () => {
  it('orders workspaces and sessions by newest record and records by position', () => {
    const groups = groupRecords([
      record('late', { workspacePath: '/w', sessionId: 's1', updatedAt: BASE_TIME + 1 * HOUR, anchor: { ...record('x').anchor, turn: 2 } }),
      record('unpositioned', { workspacePath: '/w', sessionId: 's1', updatedAt: BASE_TIME + 2 * HOUR }),
      record('early', { workspacePath: '/w', sessionId: 's1', updatedAt: BASE_TIME + 1 * HOUR, anchor: { ...record('x').anchor, turn: 1 } }),
      record('other-session', { workspacePath: '/w', sessionId: 's2', updatedAt: BASE_TIME + 9 * HOUR }),
      record('other-workspace', { workspacePath: '/z', updatedAt: BASE_TIME + 20 * HOUR }),
    ])

    expect(groups.map(group => group.key)).toEqual(['/z', '/w'])
    expect(groups.map(group => group.label)).toEqual(['z', 'w'])
    expect(groups[1]?.count).toBe(4)

    const sessions = groups[1]?.sessions ?? []
    expect(sessions.map(session => session.sessionId)).toEqual(['s2', 's1'])
    // Positioned records come first, in (turn, step, sourceIndex, start) order;
    // an anchor without a turn sorts last instead of first.
    expect(sessions[1]?.records.map(item => item.id)).toEqual(['early', 'late', 'unpositioned'])
  })

  it('keeps the freshest stored session title', () => {
    const groups = groupRecords([
      record('old', { sessionId: 's1', sessionTitle: 'Old title', updatedAt: BASE_TIME }),
      record('new', { sessionId: 's1', sessionTitle: 'New title', updatedAt: BASE_TIME + HOUR }),
    ])
    expect(groups[0]?.sessions[0]?.title).toBe('New title')
  })
})

describe('filterRecords', () => {
  it('matches quote, note and tags case-insensitively and composes filters', () => {
    const records = [
      record('quote', { anchor: { ...record('x').anchor, quote: 'Migration plan' } }),
      record('note', { note: 'about migration' }),
      record('tag', { tags: ['migration', 'design'], starred: true, colorId: 4 }),
    ]
    const filters = { ...EMPTY_FILTERS, query: 'MIGRATION' }
    expect(filterRecords(records, filters, new Set()).map(item => item.id)).toEqual(['quote', 'note', 'tag'])

    /* Multiple filters AND together; a tag chip plus a colour keep the third. */
    const composed = { ...EMPTY_FILTERS, tag: 'design', colorId: 4 as const, starredOnly: true }
    expect(filterRecords(records, composed, new Set()).map(item => item.id)).toEqual(['tag'])
    expect(hasActiveFilters(composed)).toBe(true)
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })

  it('narrows by author and counts that narrowing as active', () => {
    const records = [record('mine'), record('agent', { author: 'agent' })]
    expect(filterRecords(records, { ...EMPTY_FILTERS, author: 'agent' }, new Set()).map(item => item.id)).toEqual(['agent'])
    expect(filterRecords(records, { ...EMPTY_FILTERS, author: 'user' }, new Set()).map(item => item.id)).toEqual(['mine'])
    expect(hasActiveFilters({ ...EMPTY_FILTERS, author: 'agent' })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, author: undefined })).toBe(false)
  })

  it('drops tombstones and hidden unanchored records', () => {
    const records = [
      record('deleted', { deletedAt: BASE_TIME }),
      record('orphan'),
      record('live'),
    ]
    expect(filterRecords(records, EMPTY_FILTERS, new Set(['orphan'])).map(item => item.id)).toEqual(['orphan', 'live'])
    expect(
      filterRecords(records, { ...EMPTY_FILTERS, showUnanchored: false }, new Set(['orphan'])).map(item => item.id),
    ).toEqual(['live'])
  })
})

describe('record provenance', () => {
  it('defaults an absent author to the reader and labels only the agent', () => {
    const t: PageTranslate = (key) => key
    const mine = record('mine')
    const agent = record('agent', { author: 'agent' })

    expect(authorOf(mine)).toBe('user')
    expect(authorOf(agent)).toBe('agent')
    // Only the exceptional author earns a chip; the reader's own rows stay plain.
    expect(authorLabelOf(t, mine)).toBeUndefined()
    expect(authorLabelOf(t, agent)).toBe('meta.author.agent')
    expect(stateLabel(t, 'new')).toBe('meta.state.new')
    expect(stateLabel(t, 'kept')).toBe('meta.state.kept')
    expect(stateLabel(t, 'compiled')).toBe('meta.state.compiled')
  })
})

describe('worthReview', () => {
  const NOW = Date.UTC(2026, 10, 13, 12, 0, 0)
  const DAY = 24 * 60 * 60 * 1000

  it('returns exactly one reason per candidate, in the plan precedence order', () => {
    const candidates = worthReview(
      [
        record('starred', { starred: true }),
        record('kept', { state: 'kept' }),
        record('drifted', { state: 'compiled' }),
        record('old-new', { updatedAt: NOW - 40 * DAY }),
        record('plain', { state: 'compiled' }),
      ],
      new Set(['drifted']),
      NOW,
    )

    expect(candidates.map(candidate => [candidate.record.id, candidate.reason])).toEqual([
      ['starred', 'starredNew'],
      ['kept', 'keptUncompiled'],
      ['drifted', 'textChanged'],
      ['old-new', 'staleNew'],
    ])
  })

  it('first match wins when several predicates apply', () => {
    const candidates = worthReview(
      [
        record('starred-drifted', { starred: true }),
        record('kept-drifted', { state: 'kept' }),
        record('plain-drifted', { state: 'compiled' }),
      ],
      new Set(['starred-drifted', 'kept-drifted', 'plain-drifted']),
      NOW,
    )

    expect(candidates.map(candidate => candidate.reason)).toEqual(['starredNew', 'keptUncompiled', 'textChanged'])
  })

  it('drops tombstones and orders deterministically within one reason', () => {
    const candidates = worthReview(
      [
        record('b-new', { starred: true, updatedAt: NOW - DAY }),
        record('a-new', { starred: true, updatedAt: NOW - DAY }),
        record('newer-new', { starred: true, updatedAt: NOW }),
        record('deleted', { starred: true, deletedAt: NOW }),
        record('fresh', { state: 'compiled' }),
      ],
      new Set(),
      NOW,
    )

    // Most recently touched first; equal ages fall back to the id.
    expect(candidates.map(candidate => candidate.record.id)).toEqual(['newer-new', 'a-new', 'b-new'])
  })

  it('reads an absent state as new (back-compat)', () => {
    const candidates = worthReview([record('legacy', { starred: true })], new Set(), NOW)
    expect(candidates.map(candidate => candidate.reason)).toEqual(['starredNew'])
  })
})

describe('deriveFacets', () => {
  it('counts workspaces and tags, tags by frequency', () => {
    const facets = deriveFacets([
      record('a', { workspacePath: '/w/one', tags: ['design', 'perf'] }),
      record('b', { workspacePath: '/w/one', tags: ['design'] }),
      record('c', { workspaceId: 'id-2', tags: ['review'] }),
    ])
    // Options are name-sorted, so "id-2" precedes "one".
    expect(facets.workspaces.map(workspace => [workspace.label, workspace.count])).toEqual([
      ['id-2', 1],
      ['one', 2],
    ])
    expect(facets.tags.map(facet => facet.tag)).toEqual(['design', 'perf', 'review'])
  })
})

describe('formatRelativeTime', () => {
  it('buckets elapsed time', () => {
    expect(formatRelativeTime(BASE_TIME, BASE_TIME + 30_000)).toBe('just now')
    expect(formatRelativeTime(BASE_TIME, BASE_TIME + 5 * 60_000)).toBe('5m ago')
    expect(formatRelativeTime(BASE_TIME, BASE_TIME + 3 * HOUR)).toBe('3h ago')
    expect(formatRelativeTime(BASE_TIME, BASE_TIME + 2 * 24 * HOUR)).toBe('2d ago')
    expect(formatRelativeTime(BASE_TIME, BASE_TIME + 60 * 24 * HOUR)).toBe('2mo ago')
    expect(formatRelativeTime(BASE_TIME, BASE_TIME + 800 * 24 * HOUR)).toBe('2y ago')
    // A clock skew must not render a negative age.
    expect(formatRelativeTime(BASE_TIME + HOUR, BASE_TIME)).toBe('just now')
  })

  it('uses the dictionary when a translate function is supplied', () => {
    const t: PageTranslate = (key, params) => `${key}:${String(params?.['count'] ?? '')}`
    expect(formatRelativeTime(BASE_TIME, BASE_TIME + 30_000, t)).toBe('time.now:')
    expect(formatRelativeTime(BASE_TIME, BASE_TIME + 3 * HOUR, t)).toBe('time.hours:3')
    expect(formatRelativeTime(BASE_TIME, BASE_TIME + 2 * 24 * HOUR, t)).toBe('time.days:2')
  })

  it("names the palette slots in the page vocabulary", () => {
    const t: PageTranslate = (key) => key
    expect(colorLabel(t, 3)).toBe('color.3')
    expect(COLOR_IDS).toEqual([1, 2, 3, 4, 5])
  })
})

describe('live catalog', () => {
  it('resolves titles, workspace identity, archive and availability', () => {
    const catalog = buildCatalog({
      sessions: { byId: { s1: { title: 'Live title' }, s2: { displayTitle: 'Display title' } } },
      workspaces: {
        items: [{ workspaceId: 'w1', path: '/home/me/work/alpha', sessionIds: ['s1'] }],
        archivedSessionIds: ['s2'],
      },
    })

    expect(catalogEntryOf(catalog, 's1')).toMatchObject({
      title: 'Live title',
      workspaceId: 'w1',
      workspacePath: '/home/me/work/alpha',
      archived: false,
      available: true,
    })
    // A known Session list means absence is evidence: the session is gone.
    expect(catalogEntryOf(catalog, 's3').available).toBe(false)
    // Archived is a catalog fact even for a session with no row.
    expect(catalogEntryOf(buildCatalog({ workspaces: { items: [], archivedSessionIds: ['s9'] } }), 's9').archived).toBe(true)
    // Without a Session list, absence proves nothing.
    expect(catalogEntryOf(buildCatalog({}), 's1').available).toBe(true)
    // Neither does an unfinished one: a pending list has not seen the Session yet.
    expect(catalogEntryOf(buildCatalog({ sessions: { byId: {}, phase: 'pending' } }), 's1').available).toBe(true)
    expect(catalogEntryOf(catalog, 's2').title).toBe('Display title')
  })

  it('groups by live workspace, live title and archived state', () => {
    const records = [
      record('a', { sessionId: 's1', sessionTitle: 'Stale title', workspacePath: '/old/path' }),
      record('b', { sessionId: 's1', sessionTitle: 'Stale title', workspacePath: '/old/path' }),
    ]
    const catalog = buildCatalog({
      sessions: { byId: { s1: { title: 'Live title' } } },
      workspaces: {
        items: [{ workspaceId: 'w1', path: '/home/me/work/alpha', sessionIds: ['s1'] }],
        archivedSessionIds: [],
      },
    })
    const groups = groupRecords(records, catalog)
    expect(groups[0]?.key).toBe('/home/me/work/alpha')
    expect(groups[0]?.label).toBe('alpha')
    expect(groups[0]?.sessions[0]?.title).toBe('Live title')

    // The workspace filter follows the live identity too.
    expect(filterRecords(records, { ...EMPTY_FILTERS, workspace: '/home/me/work/alpha' }, new Set(), catalog)).toHaveLength(2)
    expect(filterRecords(records, { ...EMPTY_FILTERS, workspace: '/old/path' }, new Set(), catalog)).toHaveLength(0)
  })
})
