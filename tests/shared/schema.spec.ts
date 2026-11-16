/**
 * Record, anchor, and tag-normalisation contracts from `src/shared/schema.ts`.
 *
 * These are Host-authoritative: the browser bundles only the types, so any
 * drift between the constants and the zod declarations is a data-integrity bug
 * that must fail here rather than at the route.
 */
import { describe, expect, it } from 'vitest'

import {
  CONTEXT_CHARS,
  MAX_NOTE_CHARS,
  MAX_QUOTE_CHARS,
  MAX_TAGS,
  MAX_TAG_CHARS,
  PROJECTION_VERSION,
  SCHEMA_VERSION,
} from '../../src/shared/constants'
import {
  AnchorSchema,
  ColorIdSchema,
  DraftRecordSchema,
  HighlightRecordSchema,
  InstallRecordSchema,
  UpdatePatchSchema,
  normalizeTag,
  normalizeTags,
  type HighlightRecord,
} from '../../src/shared/schema'

/** A UUID-shaped id (the schema validates shape, not the version nibble). */
const RECORD_ID = '018f0a3e-7b1c-7c2d-8a9b-0c1d2e3f4a5b'

/** A complete, valid anchor. */
function anchor(overrides: Partial<HighlightRecord['anchor']> = {}): HighlightRecord['anchor'] {
  return {
    nodeKey: '13:assistant-step4:2',
    kind: 'text',
    sourceIndex: 0,
    quote: 'the migration must land',
    prefix: '',
    suffix: '',
    start: 0,
    end: 23,
    projection: PROJECTION_VERSION,
    ...overrides,
  }
}

/** A complete, valid record. */
function record(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: RECORD_ID,
    sessionId: 'session-1',
    origin: 'install-1',
    anchor: anchor(),
    colorId: 1,
    tags: [],
    starred: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    version: 1,
    ...overrides,
  }
}

/** A complete, valid create draft (server-managed fields absent). */
function draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const { schemaVersion: _schemaVersion, version: _version, createdAt: _createdAt, updatedAt: _updatedAt, deletedAt: _deletedAt, ...rest } = record()
  return { ...rest, ...overrides }
}

describe('normalizeTag', () => {
  it('strips a leading hash, trims, collapses whitespace, and lowercases', () => {
    expect(normalizeTag('#Release')).toBe('release')
    expect(normalizeTag('##release')).toBe('release')
    expect(normalizeTag('release ')).toBe('release')
    expect(normalizeTag('migration\t  plan\ncleanup')).toBe('migration plan cleanup')
    expect(normalizeTag('Mixed CASE Tag')).toBe('mixed case tag')
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(normalizeTag('')).toBe('')
    expect(normalizeTag('   ')).toBe('')
    expect(normalizeTag('#')).toBe('')
    expect(normalizeTag('###')).toBe('')
  })

  it('caps the result at MAX_TAG_CHARS characters', () => {
    const long = 'x'.repeat(MAX_TAG_CHARS + 12)
    expect(normalizeTag(long)).toHaveLength(MAX_TAG_CHARS)
  })

  it('is idempotent', () => {
    const samples = ['#Release', '  Multi  Word  ', 'UPPER', '###']
    for (const sample of samples) {
      const once = normalizeTag(sample)
      expect(normalizeTag(once)).toBe(once)
    }
  })
})

describe('normalizeTags', () => {
  it('normalises every entry and keeps first-use order', () => {
    expect(normalizeTags(['#Beta', ' alpha ', 'Beta', ''])).toEqual(['beta', 'alpha'])
  })

  it('de-duplicates only after normalisation', () => {
    expect(normalizeTags(['Tag', 'tag', 'TAG', '#tag'])).toEqual(['tag'])
    expect(normalizeTags(['a b', 'a   b'])).toEqual(['a b'])
  })

  it('drops empty results and preserves the input array', () => {
    const input = ['', '  ', 'real']
    const output = normalizeTags(input)
    expect(output).toEqual(['real'])
    expect(input).toEqual(['', '  ', 'real'])
  })

  it('caps the list at MAX_TAGS entries', () => {
    const input = Array.from({ length: MAX_TAGS + 5 }, (_value, index) => `tag-${index}`)
    expect(normalizeTags(input)).toHaveLength(MAX_TAGS)
  })

  it('handles an empty input', () => {
    expect(normalizeTags([])).toEqual([])
  })
})

describe('ColorIdSchema', () => {
  it('accepts exactly the five palette slots', () => {
    for (const colorId of [1, 2, 3, 4, 5]) {
      expect(ColorIdSchema.safeParse(colorId).success).toBe(true)
    }
  })

  it.each([0, 6, -1, 2.5, '1', null, undefined])('rejects %j', value => {
    expect(ColorIdSchema.safeParse(value).success).toBe(false)
  })
})

describe('AnchorSchema', () => {
  it('accepts a text anchor and a whole-message anchor', () => {
    expect(AnchorSchema.safeParse(anchor()).success).toBe(true)
    expect(AnchorSchema.safeParse(anchor({ kind: 'message', start: 0, end: 900 })).success).toBe(true)
  })

  it('keeps the durable and best-effort identity fields', () => {
    const parsed = AnchorSchema.parse(anchor({
      groupPart: 'response',
      messageId: 'msg-1',
      nodeSeq: 42,
      turn: 4,
      step: 2,
    }))
    expect(parsed).toMatchObject({ groupPart: 'response', messageId: 'msg-1', nodeSeq: 42, turn: 4, step: 2 })
  })

  it.each([
    ['nodeKey too short', anchor({ nodeKey: 'ab' })],
    ['nodeKey too long', anchor({ nodeKey: 'n'.repeat(97) })],
    ['unknown kind', anchor({ kind: 'mark' as never })],
    ['unknown groupPart', anchor({ groupPart: 'tool' as never })],
    ['empty quote', anchor({ quote: '' })],
    ['quote over cap', anchor({ quote: 'q'.repeat(MAX_QUOTE_CHARS + 1) })],
    ['prefix over cap', anchor({ prefix: 'p'.repeat(CONTEXT_CHARS + 1) })],
    ['suffix over cap', anchor({ suffix: 's'.repeat(CONTEXT_CHARS + 1) })],
    ['negative start', anchor({ start: -1 })],
    ['fractional end', anchor({ end: 1.5 })],
    ['future projection', anchor({ projection: 2 as never })],
    ['negative sourceIndex', anchor({ sourceIndex: -1 })],
    ['negative nodeSeq', anchor({ nodeSeq: -1 })],
    ['empty messageId', anchor({ messageId: '' })],
  ])('rejects %s', (_name, value) => {
    expect(AnchorSchema.safeParse(value).success).toBe(false)
  })

  it('accepts values exactly at the caps', () => {
    expect(AnchorSchema.safeParse(anchor({ quote: 'q'.repeat(MAX_QUOTE_CHARS) })).success).toBe(true)
    expect(AnchorSchema.safeParse(anchor({ prefix: 'p'.repeat(CONTEXT_CHARS) })).success).toBe(true)
    expect(AnchorSchema.safeParse(anchor({ suffix: 's'.repeat(CONTEXT_CHARS) })).success).toBe(true)
    expect(AnchorSchema.safeParse(anchor({ nodeKey: 'n'.repeat(96) })).success).toBe(true)
  })
})

describe('HighlightRecordSchema', () => {
  it('accepts a minimal record', () => {
    const parsed = HighlightRecordSchema.parse(record())
    expect(parsed.id).toBe(RECORD_ID)
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('accepts a fully populated record', () => {
    const full = record({
      workspaceId: 'ws-1',
      workspacePath: '/home/user/work',
      sessionTitle: 'Refactor plan',
      tags: ['release', 'migration'],
      note: 'check this later',
      starred: true,
      deletedAt: 1_700_000_100_000,
    })
    expect(HighlightRecordSchema.safeParse(full).success).toBe(true)
  })

  it('rejects a non-UUID id', () => {
    expect(HighlightRecordSchema.safeParse(record({ id: 'not-a-uuid' })).success).toBe(false)
  })

  it('accepts an upper-case UUID (case-insensitive shape check)', () => {
    expect(HighlightRecordSchema.safeParse(record({ id: RECORD_ID.toUpperCase() })).success).toBe(true)
  })

  it.each([
    ['wrong schemaVersion', record({ schemaVersion: 2 as never })],
    ['version zero', record({ version: 0 })],
    ['fractional version', record({ version: 1.5 })],
    ['empty sessionId', record({ sessionId: '' })],
    ['sessionId over cap', record({ sessionId: 's'.repeat(129) })],
    ['empty origin', record({ origin: '' })],
    ['negative createdAt', record({ createdAt: -1 })],
    ['non-integer updatedAt', record({ updatedAt: 1.5 })],
    ['too many tags', record({ tags: Array.from({ length: MAX_TAGS + 1 }, (_v, i) => `t${i}`) })],
    ['empty tag', record({ tags: [''] })],
    ['tag over cap', record({ tags: ['t'.repeat(MAX_TAG_CHARS + 1)] })],
    ['note over cap', record({ note: 'n'.repeat(MAX_NOTE_CHARS + 1) })],
    ['starred not boolean', record({ starred: 'yes' as never })],
    ['invalid colour', record({ colorId: 9 as never })],
    ['negative deletedAt', record({ deletedAt: -1 })],
    ['invalid anchor', record({ anchor: anchor({ quote: '' }) })],
  ])('rejects %s', (_name, value) => {
    expect(HighlightRecordSchema.safeParse(value).success).toBe(false)
  })

  it('accepts tags and notes exactly at the caps', () => {
    const atCap = record({
      tags: Array.from({ length: MAX_TAGS }, (_v, i) => `t${i}`),
      note: 'n'.repeat(MAX_NOTE_CHARS),
    })
    expect(HighlightRecordSchema.safeParse(atCap).success).toBe(true)
  })

  it('strips unknown top-level keys rather than rejecting them', () => {
    const parsed = HighlightRecordSchema.parse({ ...record(), extra: true })
    expect('extra' in parsed).toBe(false)
  })
})

describe('DraftRecordSchema', () => {
  it('accepts a draft with the client-minted id', () => {
    expect(DraftRecordSchema.safeParse(draft()).success).toBe(true)
  })

  it('requires the id', () => {
    const noId = draft()
    delete noId.id
    expect(DraftRecordSchema.safeParse(noId).success).toBe(false)
  })

  it('strips server-managed fields, so a client cannot dictate them', () => {
    const parsed = DraftRecordSchema.parse({
      ...draft(),
      schemaVersion: 2,
      version: 99,
      createdAt: 1,
      updatedAt: 2,
      deletedAt: 3,
    })
    expect('schemaVersion' in parsed).toBe(false)
    expect('version' in parsed).toBe(false)
    expect('createdAt' in parsed).toBe(false)
    expect('updatedAt' in parsed).toBe(false)
    expect('deletedAt' in parsed).toBe(false)
  })

  it('still validates the presentation fields', () => {
    expect(DraftRecordSchema.safeParse(draft({ colorId: 6 })).success).toBe(false)
    expect(DraftRecordSchema.safeParse(draft({ tags: [''] })).success).toBe(false)
    expect(DraftRecordSchema.safeParse(draft({ starred: 1 })).success).toBe(false)
  })
})

describe('UpdatePatchSchema', () => {
  it('accepts an empty patch and each single field', () => {
    expect(UpdatePatchSchema.safeParse({}).success).toBe(true)
    expect(UpdatePatchSchema.safeParse({ colorId: 5 }).success).toBe(true)
    expect(UpdatePatchSchema.safeParse({ tags: ['a'] }).success).toBe(true)
    expect(UpdatePatchSchema.safeParse({ starred: true }).success).toBe(true)
    expect(UpdatePatchSchema.safeParse({ note: 'hello' }).success).toBe(true)
  })

  it('accepts null to remove a note', () => {
    expect(UpdatePatchSchema.parse({ note: null })).toEqual({ note: null })
  })

  it.each([
    ['invalid colour', { colorId: 0 }],
    ['too many tags', { tags: Array.from({ length: MAX_TAGS + 1 }, (_v, i) => `t${i}`) }],
    ['tag over cap', { tags: ['t'.repeat(MAX_TAG_CHARS + 1)] }],
    ['note over cap', { note: 'n'.repeat(MAX_NOTE_CHARS + 1) }],
    ['starred not boolean', { starred: 'yes' }],
  ])('rejects %s', (_name, patch) => {
    expect(UpdatePatchSchema.safeParse(patch).success).toBe(false)
  })

  it('strips unknown keys', () => {
    expect(UpdatePatchSchema.parse({ colorId: 2, anchor: {} })).toEqual({ colorId: 2 })
  })
})

describe('InstallRecordSchema', () => {
  it('accepts an install identity', () => {
    expect(InstallRecordSchema.safeParse({ installId: '01a1-abc', createdAt: 1 }).success).toBe(true)
  })

  it('rejects an empty installId or a negative timestamp', () => {
    expect(InstallRecordSchema.safeParse({ installId: '', createdAt: 1 }).success).toBe(false)
    expect(InstallRecordSchema.safeParse({ installId: 'x', createdAt: -1 }).success).toBe(false)
  })
})

describe('constants and schema agreement', () => {
  it('pins the schema and projection versions', () => {
    expect(SCHEMA_VERSION).toBe(1)
    expect(PROJECTION_VERSION).toBe(1)
  })

  it('exposes the caps the schema enforces', () => {
    expect(MAX_QUOTE_CHARS).toBe(2000)
    expect(MAX_NOTE_CHARS).toBe(2000)
    expect(MAX_TAGS).toBe(8)
    expect(MAX_TAG_CHARS).toBe(32)
    expect(CONTEXT_CHARS).toBe(48)
  })
})
