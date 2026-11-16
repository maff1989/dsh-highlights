/**
 * Dependency face the composition root wires into the passive surfaces.
 *
 * Both surfaces subscribe to the already-loaded record store; nothing here
 * fetches. `openPanel` is the one interaction: a turn digest opens the
 * right-panel Highlights tab for the current Session.
 */
import type { HighlightsSnapshot } from '../../data/client'

/** Injection face of `registerSessionSurfaces`. */
export interface SessionSurfacesDeps {
  /** Read the current client snapshot synchronously. */
  readonly snapshot: () => HighlightsSnapshot
  /** Subscribe to client-snapshot changes; returns the release function. */
  readonly subscribe: (listener: () => void) => () => void
  /** Open the right-panel Highlights tab for the current Session. */
  readonly openPanel: () => void
}
