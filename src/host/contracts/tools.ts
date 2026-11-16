/**
 * Structural contract for the DSH tool registry, declared locally.
 *
 * The service is mounted by `dsh-base` (`ctx.tools`) and is present in the
 * installed runtime, but `@deepseek-ai/dsh-tools` is not a dependency of this
 * package, so its declaration is not in this program. This file restates only
 * the subset the plugin calls, exactly like `src/client/contracts/shortcuts.ts`
 * does for the shortcut service: `register()`'s shape, the definition/output
 * contract, and the calling-agent fields scope enforcement reads.
 *
 * Authoritative shapes (rc.2 checkout; rc.1 runtime has the same subset — the
 * only field that changed between them is `presentationMeta`, which exists in
 * both):
 * - `.dsh-src/repo/packages/core/tools/src/index.ts` — `ToolsService.register`
 *   (`:128,151`): `(definition, { when? }) => exact disposer`.
 * - `.dsh-src/repo/packages/core/tools/src/contracts.ts` — `ToolDefinition`,
 *   `ToolOutputDefinition`, `ToolRunContext`, `ToolExecutionInput`.
 * - `.dsh-src/repo/packages/core/tools/src/schema.ts` — `defineTool` options,
 *   which compile to this same `ToolDefinition` (`:555`).
 * - installed rc.1: `.../node_modules/@deepseek-ai/dsh-tools/lib/types/{index,contracts,schema,json-schema}.d.ts`.
 *
 * Replaced by the real imports the day the package is added as a dependency.
 *
 * workaround: W16 — see `docs/workaround-ledger.md`.
 */
import type { Context } from '@deepseek-ai/cordis'

/**
 * One text content block.
 *
 * `@deepseek-ai/dsh-llm` `TextBlock` is exactly `{ type: 'text'; text: string }`
 * (installed rc.1 `dsh-llm/lib/types/types.d.ts:53`).
 */
export interface ToolTextBlock {
  readonly type: 'text'
  readonly text: string
}

/** Content block subset this plugin emits from `output.render`. */
export type ToolContentBlock = ToolTextBlock

/**
 * One raw JSON Schema node in the runtime's enforced subset.
 *
 * The subset is deliberately closed (`dsh-tools` `lib/types/json-schema.d.ts`):
 * a single `type`, `oneOf`, object `properties`/`required`/boolean
 * `additionalProperties`, array `items`, scalar `enum`/`const`, plus
 * `description`/`title`/`default`/`examples` annotations. Numeric bounds such
 * as `minimum`/`maximum` are unsupported — the tool descriptions state the
 * ranges and `execute` enforces them.
 */
export interface ToolJsonSchema {
  readonly type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  readonly oneOf?: readonly ToolJsonSchema[]
  readonly properties?: Readonly<Record<string, ToolJsonSchema>>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean
  readonly items?: ToolJsonSchema
  readonly enum?: readonly (string | number | boolean | null)[]
  readonly const?: string | number | boolean | null
  readonly description?: string
  readonly title?: string
}

/**
 * The calling Agent fields a tool body may read.
 *
 * `Agent` in the installed rc.1 exposes `id` (`dsh-agent/lib/types/types.d.ts`);
 * the live runtime face augments it with `session` (`dsh-agent/lib/types/
 * runtime-types.d.ts:168`), and `Session.header.cwd` is the session's validated
 * workspace path (`dsh-session/lib/types/types.d.ts`). All fields are optional
 * here because a tool must behave safely when the executor supplies no caller
 * identity.
 */
export interface ToolCallingAgent {
  /** Session-backed agent identity (the Session id). */
  readonly id?: string
  /** The live Session this agent drives. */
  readonly session?: {
    readonly id?: string
    readonly header?: { readonly cwd?: string }
  }
}

/**
 * Execution context handed to {@link ToolDefinition.execute}.
 *
 * The full rc.1 `ToolRunContext` extends `ToolExecution` (call identity,
 * arguments, signal, `deferContext()`, `concludeTurn()`). These read tools use
 * only the calling agent; the rest is intentionally not restated.
 */
export interface ToolRunContext {
  /** The Agent on whose behalf the call runs (set by the agent loop). */
  readonly agent?: ToolCallingAgent
  /** Caller cancellation; unused by synchronous store reads. */
  readonly signal?: AbortSignal
}

/** One registered tool's output contract (`ToolOutputDefinition`). */
export interface ToolOutputDefinition {
  /** Raw JSON Schema enforced against every successful canonical value. */
  readonly schema: ToolJsonSchema
  /**
   * Pure projection from validated arguments and canonical value to
   * model-facing content. Must be total and side-effect free.
   * @param args - validated model arguments.
   * @param value - canonical value produced by {@link ToolDefinition.execute}.
   * @returns the model-facing content blocks.
   */
  render(args: unknown, value: unknown): ToolContentBlock[]
  /**
   * Pure replayable presentation projection persisted as `tool/result.meta`
   * and read by the Web `tool.call.toolview` card. Optional in the runtime;
   * when declared it MUST return lossless JSON (rc.1 pipeline throws on an
   * `undefined` projection), so the plugin always returns an object here.
   * @param args - validated model arguments.
   * @param value - canonical value produced by {@link ToolDefinition.execute}.
   * @returns the UI metadata payload.
   */
  presentationMeta?(args: unknown, value: unknown): unknown
}

/**
 * One registry-ready tool (`ToolDefinition`), minus the fields this plugin
 * does not use (`projectContent`, `finalizeContent`, `presentCall`,
 * `presentResult`, `timeoutMs`, `deferLoading`).
 */
export interface ToolDefinition {
  /** Unique model-facing tool name, lowercase `snake_case`. */
  readonly name: string
  /** Model-facing description; owns per-tool semantics. */
  readonly description: string
  /** Raw JSON Schema for the implicit open parameter object. */
  readonly parameters: ToolJsonSchema
  /** Canonical output declaration. */
  readonly output: ToolOutputDefinition
  /**
   * Pure overlap classifier; the read tools are always safe to run together.
   * @param args - validated model arguments.
   * @returns whether the call may join a parallel group.
   */
  isConcurrencySafe?(args: unknown): boolean
  /**
   * Run one accepted call and return its canonical JSON value.
   * @param args - model arguments, validated by the tool itself.
   * @param exec - execution identity (only `agent` is read).
   * @returns the canonical value declared by `output.schema`.
   */
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
}

/** One step-time activation condition (`ToolRegistrationOptions.when`). */
export interface ToolActivationContext {
  /** Agent preparing the step. */
  readonly agent: unknown
}

/** Registration options accepted by {@link ToolService.register}. */
export interface ToolRegistrationOptions {
  /** Optional step-time condition; deliberately unused (see `tools.ts`). */
  readonly when?: (context: ToolActivationContext) => boolean | Promise<boolean>
}

/**
 * The registry methods this plugin calls.
 *
 * `register()` returns the exact disposer that unregisters the tool
 * (`dsh-tools` `src/index.ts:151`).
 */
export interface ToolService {
  /**
   * Register a tool globally or in the calling scope.
   * @param definition - schema, output contract and execution.
   * @param options - optional step-time activation condition.
   * @returns the exact disposer that unregisters the tool.
   */
  register(definition: ToolDefinition, options?: ToolRegistrationOptions): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Agent tool registry mounted by the `dsh-base` composition. */
    tools: ToolService
  }
}
