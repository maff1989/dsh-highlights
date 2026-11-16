/**
 * Local slot-contract declaration for `tool.call.toolview` — the keyed slot the
 * transcript dispatches every atomic tool call through.
 *
 * The runtime declares it (the shipped Web composition mounts `ui-tool`) but the
 * contract type lives in `@deepseek-ai/dsh-client-ui-tool`, a package this
 * plugin does not depend on. As with the Settings seats, the published contract
 * is restated here: one session-scoped keyed slot whose owner props are the
 * call identity plus the stage-specific block.
 *
 * Only the fields this plugin reads are declared. A field added upstream is
 * therefore invisible here rather than wrongly typed, and the drift is caught by
 * the live card rendering instead of a compile error.
 *
 * // workaround: W15 — see docs/workaround-ledger.md (ask #12).
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** One content block as the recorded result carries it (only text is read). */
export interface HighlightToolTextBlock {
  readonly type: string
  readonly text?: string | undefined
}

/** Recorded result block: what this row reads off a settled call. */
export interface HighlightToolResultBlock {
  /** Rendered model-facing content (the UI does not parse it for structure). */
  readonly content: readonly HighlightToolTextBlock[]
  /** True when the executor recorded a failure. */
  readonly isError: boolean
  /** Typed failure identity when `isError`. */
  readonly error?: {
    readonly name?: string | undefined
    readonly code?: string | undefined
    readonly reason?: string | undefined
  } | undefined
  /** `output.presentationMeta` value — the supported UI-metadata channel. */
  readonly meta?: unknown
}

/** Owner props of one atomic highlight-tool call, per stage. */
export type HighlightToolOwnerProps =
  | { readonly callId: string; readonly toolName: string; readonly phase: 'preparing'; readonly block: unknown }
  | { readonly callId: string; readonly toolName: string; readonly phase: 'start'; readonly block: unknown }
  | { readonly callId: string; readonly toolName: string; readonly phase: 'result'; readonly block: HighlightToolResultBlock }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One atomic tool call's row, dispatched by wire tool name. */
    'tool.call.toolview': {
      kind: 'keyed'
      scope: 'session'
      owner: HighlightToolOwnerProps
    }
  }
}

/** One agent proposal as the card hands it to the composition root. */
export interface ToolProposal {
  readonly quote: string
  readonly note?: string | undefined
  readonly tags: readonly string[]
  readonly colorId: number
  readonly intent?: 'note' | 'dispute' | 'direct' | 'remember' | undefined
}

/** What happened when the user kept a proposal. */
export type ProposalOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'not-found' }
  | { readonly status: 'failed' }

/** Business share injected by the composition root (the card owns no services). */
export interface HighlightToolBusiness {
  /**
   * Create a real highlight from a proposal: resolve the quote in the current
   * transcript, capture its anchor, and write it as an agent-authored item.
   * @param proposal - the proposal the user kept.
   * @returns the outcome to surface on the row.
   */
  readonly keepProposal?: (proposal: ToolProposal) => Promise<ProposalOutcome>
}

/** Props of a registered highlight tool view (framework shares + locale + business). */
export type HighlightToolViewProps =
  PropsRuntime<'tool.call.toolview'> & PropsLocale<'highlights'> & HighlightToolBusiness

export {}
