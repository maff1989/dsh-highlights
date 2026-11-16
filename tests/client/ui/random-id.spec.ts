// @vitest-environment jsdom
/**
 * The record-id mint must work in an insecure context, where a Harness GUI
 * served over plain HTTP on a LAN address loses `crypto.randomUUID()`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { newRecordId } from '../../../src/client/data/random-id'

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newRecordId', () => {
  it('prefers crypto.randomUUID when the context provides it', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555')
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() })
    expect(newRecordId()).toBe('11111111-2222-4333-8444-555555555555')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('assembles a UUID from getRandomValues when randomUUID is absent', () => {
    // This is the LAN-over-HTTP case: randomUUID is missing, getRandomValues works.
    let counter = 0
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) {
          counter += 1
          bytes[index] = (counter * 37 + 11) % 256
        }
        return bytes
      },
    })
    const first = newRecordId()
    const second = newRecordId()
    expect(first).toMatch(UUID_SHAPE)
    expect(second).toMatch(UUID_SHAPE)
    expect(first).not.toBe(second)
  })

  it('still returns a UUID when no Web Crypto exists at all', () => {
    vi.stubGlobal('crypto', undefined)
    expect(newRecordId()).toMatch(UUID_SHAPE)
  })
})
