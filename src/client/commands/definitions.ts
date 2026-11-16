/**
 * Command definitions: one declaration per user-visible mutation.
 *
 * During the migration each command wraps the existing action face (which stays
 * the write adapter). Surfaces migrate from `actions.*` to `commands.execute`
 * across Phases 4–6; when the last surface has moved, the action methods become
 * private to these definitions.
 */
import type { Command } from '../contracts/commands'
import type { InsertOutcome, InsertTarget, WriteOutcome } from '../data/actions'
import type { HighlightDraft } from '../data/actions'
import type { HighlightAnchor, HighlightRecord, UpdatePatch } from '../../shared/schema'

/** The action face commands delegate to while surfaces migrate. */
export interface CommandActions {
  update(id: string, patch: UpdatePatch, expectedVersion?: number): Promise<WriteOutcome>
  remove(id: string): Promise<WriteOutcome>
  restore(id: string): Promise<WriteOutcome>
  copyQuote(record: HighlightRecord): Promise<boolean>
  reveal(record: HighlightRecord): Promise<'revealed' | 'not-found'>
  insert(record: HighlightRecord, target: InsertTarget, currentSessionId?: string): Promise<InsertOutcome>
  openPanelTab(record: HighlightRecord): void
  refresh(force?: boolean): void
}

/** One update patch alias. */
export type CommandPatch = Parameters<CommandActions['update']>[1]

/** Update presentation fields (one implementation of the CAS editor path). */
export function updateCommand(actions: CommandActions): Command<{
  readonly id: string
  readonly patch: CommandPatch
  readonly expectedVersion?: number
}, WriteOutcome> {
  return {
    id: 'update',
    capability: 'update',
    label: 'Update highlight',
    run: args => actions.update(args.id, args.patch, args.expectedVersion),
  }
}

/** Delete one record (Undo is a separate restore command). */
export function removeCommand(actions: CommandActions): Command<{ readonly id: string }, WriteOutcome> {
  return {
    id: 'remove',
    capability: 'remove',
    label: 'Delete highlight',
    run: args => actions.remove(args.id),
  }
}

/** Restore a soft-deleted record. */
export function restoreCommand(actions: CommandActions): Command<{ readonly id: string }, WriteOutcome> {
  return {
    id: 'restore',
    capability: 'restore',
    label: 'Undo delete',
    run: args => actions.restore(args.id),
  }
}

/** Copy a quote plus its citation. */
export function copyCommand(actions: CommandActions): Command<{ readonly record: HighlightRecord }, boolean> {
  return {
    id: 'copy',
    capability: 'copy',
    label: 'Copy quote',
    run: args => actions.copyQuote(args.record),
  }
}

/** Reveal one record. */
export function revealCommand(actions: CommandActions): Command<{ readonly record: HighlightRecord }, 'revealed' | 'not-found'> {
  return {
    id: 'reveal',
    capability: 'reveal',
    label: 'Show in conversation',
    run: args => actions.reveal(args.record),
  }
}

/** Insert a quote into a composer. */
export function insertCommand(actions: CommandActions): Command<{
  readonly record: HighlightRecord
  readonly target: InsertTarget
  readonly currentSessionId?: string
}, InsertOutcome> {
  return {
    id: 'insert',
    capability: 'insert',
    label: 'Insert quote',
    run: args => actions.insert(args.record, args.target, args.currentSessionId),
  }
}

/** Open the highlights panel for one record. */
export function openPanelCommand(actions: CommandActions): Command<{ readonly record: HighlightRecord }, void> {
  return {
    id: 'open-panel',
    capability: 'open-panel',
    label: 'Open highlights',
    run: async args => { actions.openPanelTab(args.record) },
  }
}

/** Star (part of the update command; kept as a named capability for surfaces). */
export function starCommand(actions: CommandActions): Command<{
  readonly id: string
  readonly starred: boolean
  readonly expectedVersion?: number
}, WriteOutcome> {
  return {
    id: 'star',
    capability: 'star',
    label: 'Star highlight',
    run: args => actions.update(args.id, { starred: args.starred }, args.expectedVersion),
  }
}

/** Create is implemented by the selection/message path; this keeps the id table complete. */
export function createCommand(create: (anchor: HighlightAnchor, draft: HighlightDraft, ids: { messageId?: string; nodeSeq?: number }) => Promise<HighlightRecord | null>): Command<{
  readonly anchor: HighlightAnchor
  readonly draft: HighlightDraft
  readonly ids: { messageId?: string; nodeSeq?: number }
}, HighlightRecord | null> {
  return {
    id: 'create',
    capability: 'create',
    label: 'Save highlight',
    run: args => create(args.anchor, args.draft, args.ids),
  }
}

/** The command table one composition root builds. */
export interface CommandTable {
  readonly update: ReturnType<typeof updateCommand>
  readonly remove: ReturnType<typeof removeCommand>
  readonly restore: ReturnType<typeof restoreCommand>
  readonly copy: ReturnType<typeof copyCommand>
  readonly reveal: ReturnType<typeof revealCommand>
  readonly insert: ReturnType<typeof insertCommand>
  readonly openPanel: ReturnType<typeof openPanelCommand>
  readonly star: ReturnType<typeof starCommand>
}

/** Build the standard command table around an action face. */
export function createCommandTable(actions: CommandActions): CommandTable {
  return {
    update: updateCommand(actions),
    remove: removeCommand(actions),
    restore: restoreCommand(actions),
    copy: copyCommand(actions),
    reveal: revealCommand(actions),
    insert: insertCommand(actions),
    openPanel: openPanelCommand(actions),
    star: starCommand(actions),
  }
}
