/**
 * Local structural contract for the shared Web context-menu registry.
 *
 * Why a local declaration: the registry service and its `ContextMenuTargetMap`
 * live in `@deepseek-ai/dsh-client-ui-context-menu`, a package this plugin does
 * not depend on (adding it would be a new dependency), and no type-only
 * re-export of the relevant shapes is available from a package we do own. The
 * runtime declares and renders the family from the shipped Web composition, so
 * this is a *type-level* restatement only — no value import, no slot, no
 * duplicate registration: we contribute data actions and `ui-context-menu`
 * renders them.
 *
 * The shapes mirror the installed rc.1 declarations
 * (`lib/types/client/types.d.ts`: `MenuContribution`, `MenuAction`,
 * `ContextMenuTargetMap.session`, `.tab`). The `tab` owner passes a dockkit
 * `TabRecord`, whose fields are restated here because dockkit is a platform
 * module too.
 *
 * // workaround: W15 — see docs/workaround-ledger.md (ask #12).
 */

/** Client presentation plus callbacks of one contributed menu action. */
export interface HighlightMenuAction {
  /** Unique within one target's resolved set. */
  readonly id: string
  /** Localized menu-row text. */
  readonly label: string
  /** Refuses selection while true; the row stays visible. */
  readonly disabled?: boolean
  /** Destructive tint (none of this plugin's actions need it today). */
  readonly danger?: boolean
  /** Draw a divider above this row. */
  readonly separatorBefore?: boolean
  /** Ordered nested rows, when an action needs a submenu. */
  readonly children?: readonly HighlightMenuAction[]
  /** Localized operation + recovery note shown when `run` rejects. */
  readonly failureLabel?: string
  /** Execute against the captured target; reject for a visible failure. */
  readonly run?: () => void | Promise<void>
}

/** `session` target family: one sidebar Session row was context-clicked. */
export interface SessionMenuTarget {
  readonly sessionId: string
  readonly displayTitle: string
}

/** `tab` target family: one right-sidebar tab was context-clicked. */
export interface TabMenuTarget {
  readonly sessionId: string
  readonly paneId: string
  /** dockkit `TabRecord`; `kind` is the tab type kind (`highlights` for ours). */
  readonly tab: {
    readonly id: string
    readonly kind: string
    readonly contentId: string
    readonly title: string
  }
}

/** Owner share per target family. */
export interface HighlightContextMenuTargets {
  readonly session: SessionMenuTarget
  readonly tab: TabMenuTarget
}

/** One contribution to one target family. */
export interface HighlightMenuContribution<K extends keyof HighlightContextMenuTargets> {
  /** Namespaced provider id; duplicate ids within one target fail. */
  readonly id: string
  /** Target family this contribution answers. */
  readonly target: K
  /** Position within the family. */
  readonly order: number
  /**
   * Available actions for the captured target.
   * @param target - clicked object (immutable for the menu's lifetime).
   * @param signal - aborted on dismissal, unload, or a newer resolution.
   */
  readonly resolve: (
    target: HighlightContextMenuTargets[K],
    signal: AbortSignal,
  ) => readonly HighlightMenuAction[] | Promise<readonly HighlightMenuAction[]>
}

/** The slice of the registry service this plugin uses. */
export interface HighlightContextMenus {
  /** Register for subsequent openings; returns the unregister disposer. */
  register<K extends keyof HighlightContextMenuTargets>(contribution: HighlightMenuContribution<K>): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Shared Web context-menu registry (declared locally; see the module note). */
    contextMenus: HighlightContextMenus
  }
}

export {}
