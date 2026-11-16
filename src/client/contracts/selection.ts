/**
 * Selection contract: one state owner, one dismissal rule, one placement owner.
 *
 * The reducer is framework-free; React surfaces render its state. `dispatch`
 * is the only input path (the plugin-owned contextmenu gesture and the
 * affordance's pointer/keyboard detection paths), and every dismissal reason
 * resolves the same way.
 */
import type { ReadonlySignal } from './scope'
import type { HighlightAnchor } from '../../shared/schema'

/** Minimal candidate shape the reducer owns (the capture module supplies it). */
export interface SelectionCandidateLike {
  readonly nodeKey: string
  readonly sourceIndex: number
  readonly kind: 'text' | 'reasoning'
  readonly range: Range
  /** Full anchor, carried by the capture adapter (typed structurally). */
  readonly anchor?: HighlightAnchor
  /** Owning session of the captured selection. */
  readonly sessionId?: string
}

/** Phase of one selection gesture. */
export type SelectionPhase = 'idle' | 'pending' | 'editing' | 'saving' | 'dismissed'

/** One draft's presentation fields (mirrors the editor's shape). */
export interface SelectionDraftLike {
  readonly colorId: number
  readonly tags: readonly string[]
  readonly note: string | undefined
  readonly starred: boolean
}

/** The single selection state. */
export interface SelectionState {
  readonly candidate: SelectionCandidateLike | null
  readonly draft: SelectionDraftLike | null
  readonly phase: SelectionPhase
}

/** Every reason a selection may be dismissed (all map to one rule). */
export type DismissReason = 'outside-press' | 'escape' | 'surface-lost' | 'session-switch' | 'saved' | 'reset'

/** Inputs the reducer accepts. Nothing writes state outside this union. */
export type SelectionAction =
  | { readonly type: 'input'; readonly candidate: SelectionCandidateLike }
  | { readonly type: 'draft'; readonly draft: SelectionDraftLike }
  | { readonly type: 'edit' }
  | { readonly type: 'saving' }
  | { readonly type: 'saved' }
  | { readonly type: 'dismiss'; readonly reason: DismissReason }

/** What the gesture exposes to surfaces. */
export interface SelectionGesture {
  /** Current state. */
  readonly state: ReadonlySignal<SelectionState>
  /** Feed one action through the reducer. */
  dispatch(action: SelectionAction): void
  /** Dismiss for one reason (the single rule). */
  dismiss(reason: DismissReason): void
}
