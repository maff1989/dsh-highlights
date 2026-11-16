// @vitest-environment jsdom
/**
 * Undo prompt preference: "Don't ask again" persists and suppresses the strip.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { disableUndoPrompt, resetUndoPrompt, undoPromptEnabled, UNDO_PROMPT_KEY } from '../../../src/client/ui/undoPrompt'

afterEach(() => {
  resetUndoPrompt()
})

describe('undo prompt preference', () => {
  it('defaults to enabled', () => {
    expect(undoPromptEnabled()).toBe(true)
  })

  it('persists the disabled choice', () => {
    disableUndoPrompt()
    expect(window.localStorage.getItem(UNDO_PROMPT_KEY)).toBe('off')
    expect(undoPromptEnabled()).toBe(false)
  })

  it('can be reset', () => {
    disableUndoPrompt()
    resetUndoPrompt()
    expect(undoPromptEnabled()).toBe(true)
  })

  it('falls back to enabled when storage is blocked', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('blocked') },
    })
    try {
      expect(undoPromptEnabled()).toBe(true)
    } finally {
      if (descriptor === undefined) delete (globalThis as { localStorage?: unknown }).localStorage
      else Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })
})
