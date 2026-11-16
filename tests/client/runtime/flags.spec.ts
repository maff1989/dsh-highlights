/**
 * Feature-flag contract tests: defaults, overrides, storage, sanitisation.
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  FLAG_STORAGE_KEY,
  flagMode,
  flags,
  next,
  resetFlagsForTest,
  setFlagOverrides,
} from '../../../src/client/runtime/flags'

/** Install a minimal localStorage and return a restore function. */
function stubStorage(initial: Record<string, string> = {}): () => void {
  const data = new Map(Object.entries(initial))
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string): string | null => data.get(key) ?? null,
      setItem: (key: string, value: string): void => { data.set(key, value) },
      removeItem: (key: string): void => { data.delete(key) },
    },
  })
  return () => {
    if (before === undefined) delete (globalThis as { localStorage?: unknown }).localStorage
    else Object.defineProperty(globalThis, 'localStorage', before)
  }
}

afterEach(() => {
  resetFlagsForTest()
})

describe('runtime/flags', () => {
  it('defaults every layer to the legacy implementation', () => {
    const resolved = flags()
    for (const layer of ['obs', 'store', 'paint', 'reveal', 'cmd', 'sel', 'surfaces'] as const) {
      expect(resolved[layer]).toBe('legacy')
      expect(next(layer)).toBe(false)
    }
  })

  it('applies explicit overrides per layer', () => {
    setFlagOverrides({ obs: 'next', paint: 'next' })
    expect(flagMode('obs')).toBe('next')
    expect(next('paint')).toBe(true)
    expect(next('store')).toBe(false)
  })

  it('reads a developer override from localStorage', () => {
    const restore = stubStorage({ [FLAG_STORAGE_KEY]: JSON.stringify({ reveal: 'next' }) })
    try {
      expect(next('reveal')).toBe(true)
    } finally {
      restore()
    }
  })

  it('ignores malformed or unknown storage values', () => {
    const restore = stubStorage({ [FLAG_STORAGE_KEY]: '{"obs":"bogus","nope":"next"}' })
    try {
      expect(flags().obs).toBe('legacy')
      expect(Object.keys(flags())).not.toContain('nope')
    } finally {
      restore()
    }
  })

  it('tolerates blocked storage', () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('blocked') },
    })
    try {
      expect(flags().obs).toBe('legacy')
    } finally {
      if (before === undefined) delete (globalThis as { localStorage?: unknown }).localStorage
      else Object.defineProperty(globalThis, 'localStorage', before)
    }
  })

  it('clears overrides on reset', () => {
    setFlagOverrides({ cmd: 'next' })
    resetFlagsForTest()
    expect(next('cmd')).toBe(false)
  })
})
