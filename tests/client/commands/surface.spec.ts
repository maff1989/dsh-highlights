/**
 * Surface command adapter: legacy-shaped results from controller outcomes.
 */
import { describe, expect, it, vi } from 'vitest'

import { createActionSurface, createCommandSurface } from '../../../src/client/commands/surface'
import type { CommandTable } from '../../../src/client/commands/definitions'
import type { CommandController, CommandOutcome } from '../../../src/client/contracts/commands'
import type { HighlightRecord } from '../../../src/shared/schema'

/** Minimal record. */
const record: HighlightRecord = {
  schemaVersion: 1,
  id: '0190a000-0000-7000-8000-000000000001',
  sessionId: 'session-1',
  origin: 'test',
  anchor: { nodeKey: '9:assistant1:1', kind: 'text', sourceIndex: 0, quote: 'q', prefix: '', suffix: '', start: 0, end: 1, projection: 1 },
  colorId: 1,
  tags: [],
  starred: false,
  createdAt: 1,
  updatedAt: 1,
  version: 1,
}

/** A controller stub that returns the queued outcomes. */
function controllerWith(outcomes: CommandOutcome<unknown>[]): CommandController {
  return {
    execute: vi.fn(async () => outcomes.shift() ?? { status: 'error', code: 'x', message: 'none', retryable: true }),
    inFlight: () => new Set<string>(),
    onOutcome: () => () => undefined,
  } as unknown as CommandController
}

/** A command table stub (commands are only identity carriers here). */
const table = new Proxy({}, { get: () => ({ id: 'x', capability: 'update', label: 'x', run: async () => undefined }) }) as unknown as CommandTable

describe('command surface', () => {
  it('maps ok, conflict and failure outcomes to legacy write values', async () => {
    const controller = controllerWith([
      { status: 'ok', value: { status: 'written', record } },
      { status: 'ok', value: { status: 'conflict', record: { ...record, version: 2 } } },
      { status: 'error', code: 'x', message: 'route unreachable', retryable: true },
      { status: 'duplicate' },
    ])
    const surface = createCommandSurface(controller, table)
    await expect(surface.update(record.id, { starred: true })).resolves.toEqual({ status: 'written', record })
    await expect(surface.update(record.id, { starred: true })).resolves.toEqual({ status: 'conflict', record: { ...record, version: 2 } })
    await expect(surface.remove(record.id)).resolves.toEqual({ status: 'error', error: 'route unreachable' })
    await expect(surface.remove(record.id)).resolves.toEqual({ status: 'error', error: 'busy' })
  })

  it('maps non-write commands to their legacy shapes', async () => {
    const controller = controllerWith([
      { status: 'ok', value: true },
      { status: 'ok', value: 'revealed' },
      { status: 'ok', value: 'inserted' },
      { status: 'ok', value: undefined },
    ])
    const surface = createCommandSurface(controller, table)
    await expect(surface.copy(record)).resolves.toBe(true)
    await expect(surface.reveal(record)).resolves.toBe('revealed')
    await expect(surface.insert(record, { kind: 'new' })).resolves.toBe('inserted')
    await expect(surface.openPanel(record)).resolves.toBeUndefined()
  })
})

describe('action surface', () => {
  it('delegates to the action face', async () => {
    const actions = {
      update: vi.fn(async () => ({ status: 'written' as const, record })),
      remove: vi.fn(async () => ({ status: 'written' as const, record })),
      restore: vi.fn(async () => ({ status: 'written' as const, record })),
      copyQuote: vi.fn(async () => true),
      reveal: vi.fn(async () => 'revealed' as const),
      insert: vi.fn(async () => 'inserted' as const),
      openPanelTab: vi.fn(),
      refresh: vi.fn(),
    }
    const surface = createActionSurface(actions)
    await surface.star(record.id, true)
    expect(actions.update).toHaveBeenCalledWith(record.id, { starred: true })
    await surface.openPanel(record)
    expect(actions.openPanelTab).toHaveBeenCalledWith(record)
  })
})
