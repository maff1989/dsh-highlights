/**
 * Surface command adapter: the typed face a surface calls.
 *
 * Two implementations:
 * - {@link createCommandSurface} routes every user action through the
 *   `CommandController` (single-flight, typed outcomes, one notice on failure);
 * - {@link createActionSurface} wraps the legacy action face and is used as the
 *   test/fallback path while a surface has not been migrated.
 *
 * The shapes are deliberately the legacy ones (`WriteOutcome`, boolean,
 * `InsertOutcome`, reveal outcome) so surfaces do not branch on which adapter
 * they received.
 */
import type { CommandController } from '../contracts/commands'
import type { InsertOutcome, InsertTarget, WriteOutcome } from '../data/actions'
import type { HighlightRecord } from '../../shared/schema'
import type { CommandPatch, CommandTable } from './definitions'
import type { ReadonlySignal } from '../contracts/scope'
import { constantSignal } from '../runtime/signal'
import type { CommandActions } from './definitions'

/** What one surface may call. */
export interface CommandSurface {
  /** Patch presentation fields with CAS. */
  update(id: string, patch: CommandPatch, expectedVersion?: number): Promise<WriteOutcome>
  /** Soft-delete. */
  remove(id: string): Promise<WriteOutcome>
  /** Undo a soft delete. */
  restore(id: string): Promise<WriteOutcome>
  /** Star/unstar immediately. */
  star(id: string, starred: boolean, expectedVersion?: number): Promise<WriteOutcome>
  /** Copy the quote (+ citation). */
  copy(record: HighlightRecord): Promise<boolean>
  /** Reveal the anchored text. */
  reveal(record: HighlightRecord): Promise<'revealed' | 'not-found'>
  /** Insert the quote into a composer. */
  insert(record: HighlightRecord, target: InsertTarget, currentSessionId?: string): Promise<InsertOutcome>
  /** Open the highlights tab for one record. */
  openPanel(record: HighlightRecord): Promise<void>
  /** Refresh the record set (explicit user retry only). */
  refresh(force?: boolean): void
  /** Reactive in-flight keys, for surface busy/aria-busy state. */
  readonly busy: ReadonlySignal<ReadonlySet<string>>
}

/** Map a non-ok controller outcome to the legacy write failure value. */
function failedWrite(outcome: { readonly status: 'duplicate' | 'cancelled' } | { readonly status: 'error'; readonly message: string }): WriteOutcome {
  if (outcome.status === 'error') return { status: 'error', error: outcome.message }
  return { status: 'error', error: 'busy' }
}

/** Route every mutation through the command controller. */
export function createCommandSurface(controller: CommandController, commands: CommandTable): CommandSurface {
  return {
    async update(id, patch, expectedVersion) {
      const outcome = await controller.execute(commands.update, { id, patch, ...(expectedVersion === undefined ? {} : { expectedVersion }) }, { recordId: id })
      return outcome.status === 'ok' ? outcome.value : failedWrite(outcome)
    },
    async remove(id) {
      const outcome = await controller.execute(commands.remove, { id }, { recordId: id })
      return outcome.status === 'ok' ? outcome.value : failedWrite(outcome)
    },
    async restore(id) {
      const outcome = await controller.execute(commands.restore, { id }, { recordId: id })
      return outcome.status === 'ok' ? outcome.value : failedWrite(outcome)
    },
    async star(id, starred, expectedVersion) {
      const outcome = await controller.execute(commands.star, { id, starred, ...(expectedVersion === undefined ? {} : { expectedVersion }) }, { recordId: id })
      return outcome.status === 'ok' ? outcome.value : failedWrite(outcome)
    },
    async copy(record) {
      const outcome = await controller.execute(commands.copy, { record }, { recordId: record.id })
      return outcome.status === 'ok' ? outcome.value : false
    },
    async reveal(record) {
      const outcome = await controller.execute(commands.reveal, { record }, { recordId: record.id })
      return outcome.status === 'ok' ? outcome.value : 'not-found'
    },
    async insert(record, target, currentSessionId) {
      const outcome = await controller.execute(commands.insert, { record, target, ...(currentSessionId === undefined ? {} : { currentSessionId }) }, { recordId: record.id })
      return outcome.status === 'ok' ? outcome.value : 'failed'
    },
    async openPanel(record) {
      await controller.execute(commands.openPanel, { record }, { recordId: record.id })
    },
    refresh(force = false) {
      // Refresh is not a mutation command; the action face owns the read path.
      void force
    },
    busy: controller.busy,
  }
}

/** No in-flight work for the legacy adapter (the action face owns any local busy). */
const IDLE = constantSignal<ReadonlySet<string>>(new Set())

/**
 * Legacy adapter over the action face (tests and not-yet-migrated surfaces).
 * @param actions - the shared action face.
 */
export function createActionSurface(actions: CommandActions): CommandSurface {
  return {
    update: (id, patch, expectedVersion) => expectedVersion === undefined
      ? actions.update(id, patch)
      : actions.update(id, patch, expectedVersion),
    remove: id => actions.remove(id),
    restore: id => actions.restore(id),
    star: (id, starred, expectedVersion) => expectedVersion === undefined
      ? actions.update(id, { starred })
      : actions.update(id, { starred }, expectedVersion),
    copy: record => actions.copyQuote(record),
    reveal: record => actions.reveal(record),
    insert: (record, target, currentSessionId) => actions.insert(record, target, currentSessionId),
    openPanel: async record => { actions.openPanelTab(record) },
    refresh: force => { actions.refresh(force) },
    busy: IDLE,
  }
}
