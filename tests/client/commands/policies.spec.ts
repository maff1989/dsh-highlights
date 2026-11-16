/**
 * Undo/star policy prototypes: both candidate policies are coherent and
 * inspectable; the owner decision selects one (Phase 4 gate).
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_POLICY, POLICY_A, POLICY_B, showsUndo, starPersistsImmediately } from '../../../src/client/commands/policies'

describe('action policies', () => {
  it('policy A offers Undo everywhere and immediate star', () => {
    expect(showsUndo(POLICY_A)).toBe(true)
    expect(starPersistsImmediately(POLICY_A)).toBe(true)
  })

  it('policy B has no Undo and keeps the card star as a draft', () => {
    expect(showsUndo(POLICY_B)).toBe(false)
    expect(starPersistsImmediately(POLICY_B)).toBe(false)
  })

  it('the working default is policy A until the owner records a decision', () => {
    expect(DEFAULT_POLICY.name).toBe('A')
  })
})
