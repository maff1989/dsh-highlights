/**
 * Structural contract for the client-wide shortcut service.
 *
 * The service is mounted by the web composition (the `dsh-web-app` bundle's
 * `shortcuts` row), so it exists at runtime, but
 * `@deepseek-ai/dsh-client-shortcuts` is not a dependency of this package and
 * its declaration is therefore not in this program. This file declares the
 * subset this plugin uses so the composition root stays type-checked.
 *
 * Replaced by the real import the day the package is added as a dependency.
 *
 * workaround: W15 — see `docs/workaround-ledger.md`.
 */
import type { Context } from '@deepseek-ai/cordis'

/** One runtime/platform default binding. */
export interface ShortcutBinding {
  /** Physical key code, e.g. `KeyH`. */
  readonly code: string
  /** Modifier names, e.g. `primary`, `shift`. */
  readonly modifiers: readonly string[]
}

/** Local input owner resolved before an application command. */
export type ShortcutRegion = 'page' | 'editable' | 'terminal'

/** Synchronous DOM context handed to {@link ShortcutCommand.resolve}. */
export interface ShortcutContext {
  /** Original input element, or null when no document target is available. */
  readonly target: Element | null
  /** Which region owns the keystroke. */
  readonly region: ShortcutRegion
  /** Open modal identifier, if any. */
  readonly modal: string | null
}

/** The resolver outcome: run now, refuse with a reason, or let another owner take it. */
export type ShortcutResolution =
  | { readonly status: 'handled'; run(): void }
  | { readonly status: 'blocked'; readonly reason: string }
  | { readonly status: 'pass' }

/** One command contribution. */
export interface ShortcutCommand {
  /** Unique command id. */
  readonly id: string
  /** Localised label shown in the shortcut reference. */
  readonly label: () => string
  /** Extra search terms. */
  readonly aliases: readonly string[]
  /** Default bindings keyed by `<runtime>:<platform>`. */
  readonly defaults: Readonly<Record<string, ShortcutBinding>>
  /** Regions where the command may fire. */
  readonly regions: readonly ShortcutRegion[]
  /** Modal identifiers allowed to receive the command. */
  readonly modals: readonly string[]
  /**
   * Resolve one gesture against current state.
   * @param context - synchronous DOM context at the keystroke.
   * @returns whether to run, refuse, or pass.
   */
  resolve(context: ShortcutContext): ShortcutResolution
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Window-local application commands and effective keycap catalog. */
    shortcuts: {
      register(command: ShortcutCommand): () => void
    }
  }
}
