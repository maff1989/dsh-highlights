/**
 * Undo / star policy prototypes (Phase 4 decision gate).
 *
 * The owner asked for the two candidate policies to be prototyped before the
 * command plane hard-codes one. Both shapes are declared here; the composition
 * root selects one and the owner's decision is recorded in STATUS/plan §10.
 *
 * Policy A (default for the prototype): Undo on every delete surface with one
 * TTL, and starring persists immediately on every surface.
 * Policy B: no Undo surface, and the item card keeps `starred` as a draft field.
 */

/** How delete recovery behaves across surfaces. */
export type UndoPolicy = 'undo-everywhere' | 'no-undo'

/** How starring behaves across surfaces. */
export type StarPolicy = 'immediate' | 'draft'

/** One coherent policy pair. */
export interface ActionPolicy {
  readonly name: 'A' | 'B'
  readonly undo: UndoPolicy
  readonly star: StarPolicy
  readonly description: string
}

/** Policy A: consistent Undo + immediate star (recommended). */
export const POLICY_A: ActionPolicy = {
  name: 'A',
  undo: 'undo-everywhere',
  star: 'immediate',
  description: 'Undo on every delete surface with one TTL; star persists immediately everywhere.',
}

/** Policy B: no Undo, card star stays a draft. */
export const POLICY_B: ActionPolicy = {
  name: 'B',
  undo: 'no-undo',
  star: 'draft',
  description: 'No Undo surface; the card edits starred locally until Save.',
}

/** Prototype default until the owner records a choice. */
export const DEFAULT_POLICY: ActionPolicy = POLICY_A

/** Whether a surface may render an Undo affordance under a policy. */
export function showsUndo(policy: ActionPolicy): boolean {
  return policy.undo === 'undo-everywhere'
}

/** Whether a star click must persist immediately under a policy. */
export function starPersistsImmediately(policy: ActionPolicy): boolean {
  return policy.star === 'immediate'
}
