/**
 * Command definitions: one declaration per action, delegating to the action face.
 */
import { describe, expect, it, vi } from 'vitest'

import { createCommandTable } from '../../../src/client/commands/definitions'
import type { CommandActions } from '../../../src/client/commands/definitions'
import type { WriteOutcome } from '../../../src/client/data/actions'
import type { HighlightRecord } from '../../../src/shared/schema'

/** A record for argument passing. */
const record: HighlightRecord = {
  schemaVersion: 1,
  id: '0190a000-0000-7000-8000-000000000001',
  sessionId: 'session-1',
  origin: 'test',
  anchor: { nodeKey: '9:assistant1:1', kind: 'text', sourceIndex: 0, quote: 'q', prefix: '', suffix: '', start: 0, end: 1, projection: 1 },
  colorId: 2,
  tags: [],
  starred: false,
  createdAt: 1,
  updatedAt: 1,
  version: 1,
}

/** Action-face stub. */
function actions(): CommandActions {
  return {
    update: vi.fn(async (): Promise<WriteOutcome> => ({ status: 'written', record })),
    remove: vi.fn(async (): Promise<WriteOutcome> => ({ status: 'written', record })),
    restore: vi.fn(async (): Promise<WriteOutcome> => ({ status: 'written', record })),
    copyQuote: vi.fn(async () => true),
    reveal: vi.fn(async () => 'revealed' as const),
    insert: vi.fn(async () => 'inserted' as const),
    openPanelTab: vi.fn(),
    refresh: vi.fn(),
  }
}

describe('command definitions', () => {
  it('declares one command per user-visible mutation with the expected capability', () => {
    const table = createCommandTable(actions())
    expect(Object.keys(table).sort()).toEqual(['copy', 'insert', 'openPanel', 'remove', 'restore', 'reveal', 'star', 'update'])
    expect(table.update.capability).toBe('update')
    expect(table.remove.capability).toBe('remove')
    expect(table.star.capability).toBe('star')
  })

  it('star is the same update path with a starred patch', async () => {
    const face = actions()
    const table = createCommandTable(face)
    await table.star.run({ id: record.id, starred: true, expectedVersion: 3 }, {})
    expect(face.update).toHaveBeenCalledWith(record.id, { starred: true }, 3)
  })

  it('open-panel delegates synchronously and insert passes the destination', async () => {
    const face = actions()
    const table = createCommandTable(face)
    await table.openPanel.run({ record }, {})
    expect(face.openPanelTab).toHaveBeenCalledWith(record)
    await table.insert.run({ record, target: { kind: 'new' }, currentSessionId: 'session-1' }, {})
    expect(face.insert).toHaveBeenCalledWith(record, { kind: 'new' }, 'session-1')
  })
})
