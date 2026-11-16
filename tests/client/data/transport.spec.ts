/**
 * Transport status mapping and bounded read retry (Phase 2 residuals).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HighlightsClient } from '../../../src/client/data/client'
import { createTransport, HighlightsRpcError, type HighlightsTransport } from '../../../src/client/data/transport'
import type { HelloValue, ListValue } from '../../../src/shared/protocol'

const HELLO: HelloValue = {
  protocol: 1,
  domainVersion: 1,
  installId: 'install-1',
  count: 0,
  maxRecords: 10_000,
  insertionAttribution: true,
  pollIntervalMs: 0,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('transport status mapping', () => {
  /** A transport whose fetch returns one status. */
  function withStatus(status: number): ReturnType<typeof createTransport> {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })))
    return createTransport()
  }

  it('maps auth and route refusals to typed codes', async () => {
    await expect(withStatus(403).hello()).rejects.toMatchObject({ code: 'forbidden' })
    await expect(withStatus(401).hello()).rejects.toMatchObject({ code: 'forbidden' })
    await expect(withStatus(404).hello()).rejects.toMatchObject({ code: 'not-found' })
    await expect(withStatus(400).hello()).rejects.toMatchObject({ code: 'bad-request' })
    await expect(withStatus(500).hello()).rejects.toMatchObject({ code: 'transport' })
  })
})

describe('read retry', () => {
  /** A transport stub with scripted reads. */
  function transport(): HighlightsTransport & { readonly list: ReturnType<typeof vi.fn>; readonly hello: ReturnType<typeof vi.fn> } {
    return {
      hello: vi.fn(async () => HELLO),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      reanchor: vi.fn(),
      remove: vi.fn(),
      restore: vi.fn(),
      query: vi.fn(),
    } as unknown as HighlightsTransport & { readonly list: ReturnType<typeof vi.fn>; readonly hello: ReturnType<typeof vi.fn> }
  }

  it('retries transient transport failures, then publishes the read', async () => {
    const stub = transport()
    stub.list
      .mockRejectedValueOnce(new HighlightsRpcError('transport', 'network down'))
      .mockRejectedValueOnce(new HighlightsRpcError('transport', 'network down'))
      .mockResolvedValueOnce({ revision: 1, records: [] } satisfies ListValue)
    const client = new HighlightsClient(stub, Date.now, { retryDelays: [0, 0] })

    await client.refresh(true)
    expect(client.getSnapshot().status).toBe('ready')
    expect(stub.list).toHaveBeenCalledTimes(3)
  })

  it('does not retry a typed refusal', async () => {
    const stub = transport()
    stub.list.mockRejectedValue(new HighlightsRpcError('forbidden', 'no access'))
    const client = new HighlightsClient(stub, Date.now, { retryDelays: [0, 0, 0] })

    await client.refresh(true)
    expect(client.getSnapshot().status).toBe('error')
    expect(stub.list).toHaveBeenCalledTimes(1)
  })
})
