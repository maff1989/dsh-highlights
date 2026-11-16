/**
 * Pure selection reducer. One rule: any dismissal clears the candidate and the
 * draft together; a new input supersedes a pending/editing/dismissed state;
 * work arriving while a reveal is in flight is ignored (the reader cannot be
 * selecting mid-jump).
 */
import type { SelectionAction, SelectionState } from '../contracts/selection'

/** The empty/idle state. */
export const IDLE_SELECTION: SelectionState = { candidate: null, draft: null, phase: 'idle' }

/**
 * Reduce one action.
 * @param state - current state.
 * @param action - action to apply.
 * @param context - environment facts the reducer must respect.
 */
export function reduceSelection(
  state: SelectionState,
  action: SelectionAction,
  context: { readonly revealPending?: boolean } = {},
): SelectionState {
  switch (action.type) {
    case 'input':
      if (context.revealPending === true) return state
      return { candidate: action.candidate, draft: null, phase: 'pending' }
    case 'draft':
      return state.candidate === null ? state : { ...state, draft: action.draft, phase: 'editing' }
    case 'edit':
      return state.candidate === null ? state : { ...state, phase: 'editing' }
    case 'saving':
      return state.candidate === null ? state : { ...state, phase: 'saving' }
    case 'saved':
    case 'dismiss':
      return { candidate: null, draft: null, phase: action.type === 'saved' ? 'idle' : 'dismissed' }
    default:
      return state
  }
}
