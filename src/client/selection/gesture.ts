/**
 * App-scoped selection gesture: owns the reducer state and exposes dispatch.
 */
import type { ReadonlySignal } from '../contracts/scope'
import type { DismissReason, SelectionAction, SelectionGesture, SelectionState } from '../contracts/selection'
import { createSignal } from '../runtime/signal'
import { IDLE_SELECTION, reduceSelection } from './reducer'

/** Options for the gesture service. */
export interface SelectionGestureOptions {
  /** Whether a reveal is in flight (read at dispatch time). */
  readonly revealPending: () => boolean
}

/**
 * Create the app-scoped selection gesture.
 * @param options - reveal quiescence probe.
 */
export function createSelectionGesture(options: SelectionGestureOptions): SelectionGesture & { readonly state: ReadonlySignal<SelectionState> } {
  const signal = createSignal<SelectionState>(IDLE_SELECTION)
  return {
    state: signal,
    dispatch(action: SelectionAction) {
      signal.set(reduceSelection(signal.get(), action, { revealPending: options.revealPending() }))
    },
    dismiss(reason: DismissReason) {
      signal.set(reduceSelection(signal.get(), { type: 'dismiss', reason }))
    },
  }
}
