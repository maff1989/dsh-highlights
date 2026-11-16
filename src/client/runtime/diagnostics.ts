/**
 * Dev-only counters for the migration gates.
 *
 * Counting is unconditional and cheap (an integer increment); exposure is
 * guarded. The client bundle's `vm` activation check evaluates module scope in a
 * sandbox without a document, so nothing here touches the DOM at import time.
 *
 * The live harness reads `globalThis.__dshhlDiag` after installing it with
 * {@link installDiagnostics}; reproduction scripts can compare these counters
 * across presses without a CPU profile.
 */

/** Counters the migration phases assert against. */
export const DIAGNOSTIC_COUNTERS = [
  'paintPasses',
  'paintSkippedHidden',
  'registryWrites',
  'overlayBoxWrites',
  'observerCallbacks',
  'repaintRequests',
  'rafTicks',
  'visibilityChanges',
  'sessionRegistrations',
  'commandOutcomes',
] as const

/** One counter name. */
export type DiagnosticCounter = (typeof DIAGNOSTIC_COUNTERS)[number]

/** Immutable counter snapshot. */
export type DiagnosticSnapshot = Readonly<Record<DiagnosticCounter, number>>

const counters: Record<DiagnosticCounter, number> = {
  paintPasses: 0,
  paintSkippedHidden: 0,
  registryWrites: 0,
  overlayBoxWrites: 0,
  observerCallbacks: 0,
  repaintRequests: 0,
  rafTicks: 0,
  visibilityChanges: 0,
  sessionRegistrations: 0,
  commandOutcomes: 0,
}

/** Global handle installed by {@link installDiagnostics}. */
export const DIAGNOSTICS_GLOBAL = '__dshhlDiag' as const

/** Increment one counter. */
export function count(counter: DiagnosticCounter, amount = 1): void {
  counters[counter] += amount
}

/** Read the current counters. */
export function diagnostics(): DiagnosticSnapshot {
  return { ...counters }
}

/** Reset every counter (test teardown and between measurement runs). */
export function resetDiagnostics(): void {
  for (const counter of DIAGNOSTIC_COUNTERS) counters[counter] = 0
}

/**
 * Expose the counters on a global for the live harness.
 * @param scope - global object to install on (defaults to `globalThis`).
 * @returns disposer removing the handle.
 */
export function installDiagnostics(scope: object = globalThis): () => void {
  const target = scope as Record<string, unknown>
  const handle = {
    snapshot: diagnostics,
    reset: resetDiagnostics,
    count,
  }
  target[DIAGNOSTICS_GLOBAL] = handle
  return () => {
    delete target[DIAGNOSTICS_GLOBAL]
  }
}
