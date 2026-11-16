/**
 * Diagnostics counter contract tests.
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  DIAGNOSTICS_GLOBAL,
  count,
  diagnostics,
  installDiagnostics,
  resetDiagnostics,
} from '../../../src/client/runtime/diagnostics'

afterEach(() => {
  resetDiagnostics()
})

describe('runtime/diagnostics', () => {
  it('starts at zero and counts increments', () => {
    expect(diagnostics().paintPasses).toBe(0)
    count('paintPasses')
    count('paintPasses', 2)
    count('observerCallbacks')
    expect(diagnostics().paintPasses).toBe(3)
    expect(diagnostics().observerCallbacks).toBe(1)
  })

  it('returns an immutable snapshot', () => {
    const snapshot = diagnostics()
    count('rafTicks')
    expect(snapshot.rafTicks).toBe(0)
    expect(diagnostics().rafTicks).toBe(1)
  })

  it('installs and removes a global handle', () => {
    const scope: Record<string, unknown> = {}
    const dispose = installDiagnostics(scope)
    expect(scope[DIAGNOSTICS_GLOBAL]).toBeDefined()
    dispose()
    expect(scope[DIAGNOSTICS_GLOBAL]).toBeUndefined()
  })
})
