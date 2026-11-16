/**
 * Wire contract of the `/highlights` Connection RPC channel.
 *
 * The Host validates every payload with the zod schemas declared here; the
 * browser half imports only the resulting types, so no validation runtime is
 * duplicated in the bundle. Results travel in the Connection envelope
 * (`{ ok, value }` / `{ ok, error }`), so business outcomes such as a lost
 * compare-and-set race are *values*, not transport errors.
 */
import { z } from 'zod'

import { AnchorSchema, ColorIdSchema, DraftRecordSchema, UpdatePatchSchema, type ColorId, type HighlightRecord } from './schema'

/** Endpoint names handled on the channel. */
export const RPC_ENDPOINTS = [
  'hello',
  'list',
  'query',
  'create',
  'update',
  'reanchor',
  'remove',
  'restore',
  'getSettings',
  'setSettings',
] as const

/** One endpoint name. */
export type RpcEndpoint = (typeof RPC_ENDPOINTS)[number]

/** Stable failure codes surfaced to the browser half. */
export type RpcErrorCode =
  | 'bad-request'
  | 'unknown-endpoint'
  | 'not-found'
  | 'limit-exceeded'
  | 'forbidden'
  | 'internal'

/** Failure payload carried inside the Connection envelope's `error`. */
export interface RpcFailure {
  /** Stable machine-readable code. */
  readonly code: RpcErrorCode
  /** Human-readable explanation (already localisation-neutral English). */
  readonly message: string
}

/** `hello` result: protocol and host limits used by every highlights surface. */
export interface HelloValue {
  readonly protocol: number
  readonly domainVersion: number
  readonly installId: string
  readonly count: number
  readonly maxRecords: number
  /** Whether an inserted quote carries the "— from <session> · <date>" line. */
  readonly insertionAttribution: boolean
  /** Optional visibility poll interval for the record set; 0 disables it. */
  readonly pollIntervalMs: number
  /**
   * Current agent-access level, so a surface can state the truth about model
   * visibility without a second round trip or a guess.
   *
   * Optional because a browser half can be newer than the running Host half
   * (the client bundle hot-reloads; the Host needs a restart). An absent value
   * means "unknown", and callers fall back to the shipped default: `off`.
   */
  readonly agentAccess?: AgentAccess
}

/** `list` result. */
export interface ListValue {
  /** Monotonic per-process write counter; the browser compares it for staleness. */
  readonly revision: number
  readonly records: HighlightRecord[]
}

/** Result of a write endpoint; a lost CAS race returns `conflict` with the live record. */
export interface WriteValue {
  readonly status: 'written' | 'conflict'
  readonly record: HighlightRecord
}

/** Default and maximum page sizes of the `query` endpoint. */
export const QUERY_DEFAULT_LIMIT = 100
export const QUERY_MAX_LIMIT = 500

/** One list row without the byte-heavy anchor context. */
export interface HighlightSummary {
  readonly id: HighlightRecord['id']
  readonly sessionId: string
  readonly workspaceId?: string
  readonly workspacePath?: string
  readonly sessionTitle?: string
  readonly colorId: HighlightRecord['colorId']
  readonly tags: readonly string[]
  readonly note?: string
  readonly starred: boolean
  readonly createdAt: number
  readonly updatedAt: number
  readonly version: number
  readonly deletedAt?: number
  readonly anchor: {
    readonly nodeKey: string
    readonly groupPart?: HighlightRecord['anchor']['groupPart']
    readonly kind: HighlightRecord['anchor']['kind']
    readonly messageId?: string
    readonly nodeSeq?: number
    readonly turn?: number
    readonly step?: number
    readonly sourceIndex: number
    readonly quote: string
    readonly start: number
    readonly end: number
    readonly projection: number
  }
}

/** `query` input: the server-side list contract (additive to `list`). */
export interface QueryInput {
  readonly sessionId?: string
  readonly workspaceId?: string
  /** Case-insensitive substring over quote, note and tags. */
  readonly q?: string
  /** Exact tag match after normalisation. */
  readonly tag?: string
  readonly starred?: boolean
  /** Opaque cursor from a previous page. */
  readonly cursor?: string
  readonly limit?: number
  readonly include?: 'summary' | 'body'
}

/** `query` result. */
export interface QueryValue {
  readonly items: readonly (HighlightSummary | HighlightRecord)[]
  readonly nextCursor?: string
  /** Number of records matching the filters before pagination. */
  readonly total: number
}

/*
 * Consent and preference settings.
 *
 * The source of truth is the plugin's own storage domain, not the profile
 * config: `agentAccess` is security-relevant (the Host registers model-facing
 * tools on it, see WP-C / spike G5), so the Host must read a value it wrote and
 * validated itself rather than trust the browser. Writes travel through the
 * same exact Fetch route and carry the compare-and-set version they read; a
 * lost race is a `conflict` value, never a transport error.
 *
 * The profile config keeps the deployment knobs (`maxRecords`, retention,
 * attribution, poll interval); the record keeps what the user owns.
 */

/** Agent access levels, narrowest first. `off` preserves the shipped promise. */
export const AGENT_ACCESS_LEVELS = ['off', 'read', 'read-write'] as const

/** One agent access level. */
export type AgentAccess = (typeof AGENT_ACCESS_LEVELS)[number]

/** Ranges the agent may read when access is on, narrowest first. */
export const AGENT_SCOPES = ['session', 'workspace', 'all'] as const

/** One agent read range. */
export type AgentScope = (typeof AGENT_SCOPES)[number]

/** Schema of one access level. */
export const AgentAccessSchema = z.enum(AGENT_ACCESS_LEVELS)

/** Schema of one read range. */
export const AgentScopeSchema = z.enum(AGENT_SCOPES)

/** Consent defaults: nothing becomes model-visible until the user asks. */
export const DEFAULT_AGENT_ACCESS: AgentAccess = 'off'
export const DEFAULT_AGENT_SCOPE: AgentScope = 'session'
/** Palette slot a one-click save starts with (the third, violet, slot). */
export const DEFAULT_SETTINGS_COLOR_ID: ColorId = 3

/**
 * Durable settings record (one per install, in the domain's `settings` table).
 *
 * `version` is the compare-and-set counter: 0 while no record has been written
 * (the defaults are served without materialising a file), 1 after the first
 * write, incrementing on every accepted write.
 */
export const SettingsRecordSchema = z.object({
  /** Compare-and-set counter; 0 means "serving defaults, nothing stored yet". */
  version: z.number().int().nonnegative(),
  agentAccess: AgentAccessSchema,
  agentScope: AgentScopeSchema,
  /** Preferred palette slot for quick capture. */
  defaultColorId: ColorIdSchema,
  /** When the record was first written; 0 for the unstored defaults. */
  createdAt: z.number().int().nonnegative(),
  /** When the record last changed; 0 for the unstored defaults. */
  updatedAt: z.number().int().nonnegative(),
})

/** Durable settings contract. */
export type SettingsRecord = z.infer<typeof SettingsRecordSchema>

/** `getSettings` result. Retention is deployment config, shown read-only. */
export interface SettingsValue {
  readonly settings: SettingsRecord
  /** Tombstone retention the Host applies, in days. */
  readonly retentionDays: number
}

/** Fields a caller may change; the Host fills the rest. */
export const SettingsPatchSchema = z.object({
  agentAccess: AgentAccessSchema.optional(),
  agentScope: AgentScopeSchema.optional(),
  defaultColorId: ColorIdSchema.optional(),
}).strict()

/** Patch contract. */
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

/** `setSettings` input: the version the caller read plus its fields. */
export interface SetSettingsInput {
  readonly expectedVersion: number
  readonly patch: SettingsPatch
}

/** `setSettings` result; a lost race returns `conflict` with the live record. */
export interface SettingsWriteValue {
  readonly status: 'written' | 'conflict'
  readonly settings: SettingsRecord
}

/** `create` input. */
export interface CreateInput {
  readonly record: z.infer<typeof DraftRecordSchema>
}

/** `update` input. */
export interface UpdateInput {
  readonly id: string
  readonly expectedVersion: number
  readonly patch: z.infer<typeof UpdatePatchSchema>
}

/** `reanchor` input. */
export interface ReanchorInput {
  readonly id: string
  readonly expectedVersion: number
  readonly anchor: z.infer<typeof AnchorSchema>
}

/** `remove` / `restore` input. */
export interface VersionedIdInput {
  readonly id: string
  readonly expectedVersion: number
}

/** `list` input. */
export interface ListInput {
  readonly includeTombstones?: boolean
}

const idSchema = z.string().uuid()
const versionSchema = z.number().int().positive()

/** Payload schema per endpoint, keyed by endpoint name. */
export const InputSchemas = {
  hello: z.object({}).loose(),
  list: z.object({ includeTombstones: z.boolean().optional() }).loose(),
  query: z.object({
    sessionId: z.string().min(1).max(128).optional(),
    workspaceId: z.string().min(1).max(128).optional(),
    q: z.string().max(200).optional(),
    tag: z.string().min(1).max(32).optional(),
    starred: z.boolean().optional(),
    cursor: z.string().max(512).optional(),
    limit: z.number().int().min(1).max(QUERY_MAX_LIMIT).optional(),
    include: z.enum(['summary', 'body']).optional(),
  }).strict(),
  create: z.object({ record: DraftRecordSchema }).strict(),
  update: z.object({
    id: idSchema,
    expectedVersion: versionSchema,
    patch: UpdatePatchSchema,
  }).strict(),
  reanchor: z.object({
    id: idSchema,
    expectedVersion: versionSchema,
    anchor: AnchorSchema,
  }).strict(),
  remove: z.object({ id: idSchema, expectedVersion: versionSchema }).strict(),
  restore: z.object({ id: idSchema, expectedVersion: versionSchema }).strict(),
  getSettings: z.object({}).loose(),
  setSettings: z.object({
    expectedVersion: z.number().int().nonnegative(),
    patch: SettingsPatchSchema,
  }).strict(),
} as const satisfies Record<RpcEndpoint, z.ZodType>

/** Input type per endpoint, derived from the payload schemas. */
export type InputOf<E extends RpcEndpoint> = z.infer<(typeof InputSchemas)[E]>
