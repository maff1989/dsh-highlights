/**
 * Record and anchor schemas, shared by both halves.
 *
 * The Host owns validation: every write is parsed here before it touches the
 * storage domain, and the domain re-validates on open, so a corrupted file
 * surfaces as an error instead of bad data reaching the UI. The browser half
 * imports these as types only — it never bundles a second zod runtime.
 */
import { z } from 'zod'

import {
  AUTHOR_VALUES,
  INTENT_VALUES,
  RECORD_STATE_VALUES,
  VISIBILITY_VALUES,
  type Author,
  type Intent,
  type RecordState,
  type Visibility,
} from './provenance'

import {
  CONTEXT_CHARS,
  MAX_NOTE_CHARS,
  MAX_QUOTE_CHARS,
  MAX_TAG_CHARS,
  MAX_TAGS,
  PROJECTION_VERSION,
  SCHEMA_VERSION,
} from './constants'

/** Stable record identity (UUID text; v7-shaped so ids sort by creation time). */
export type HighlightId = string

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Fixed themed palette slot. */
export const ColorIdSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])

/** One palette slot. */
export type ColorId = z.infer<typeof ColorIdSchema>

/** Which occurrence of a Chat node a highlight was captured from. */
export const GroupPartSchema = z.enum(['reasoning', 'response'])

/**
 * Who authored the item (schema v1 field, optional; absent means `user`).
 *
 * Two authors share one object: the user marks their own reading, and the agent
 * may annotate its own output. Provenance is what lets the UI say whose
 * judgement a row is, without a second store.
 */
/** Author field schema (`user` when absent). */
export const AuthorSchema = z.enum(AUTHOR_VALUES)

/**
 * Processing cursor schema (optional; absent means `new`).
 *
 * The category's default failure is a list with no next action; the cursor is
 * the cheapest one that fits on every row.
 */
export const RecordStateSchema = z.enum(RECORD_STATE_VALUES)

/**
 * Speech-act schema (optional; absent means `note`).
 *
 * A note is a message to a present author, and the four acts map to different
 * agent behaviour: assert, dispute, direct, commit.
 */
export const IntentSchema = z.enum(INTENT_VALUES)

/**
 * Model-visibility schema (optional; absent means `agent`).
 *
 * Consent is per item as well as per install: a note is more sensitive than a
 * quote, so an item can be excluded from the agent-read surface on its own.
 */
export const VisibilitySchema = z.enum(VISIBILITY_VALUES)

export type { Author, Intent, RecordState, Visibility } from './provenance'

/**
 * Anchor: the durable identity of the highlighted span.
 *
 * `nodeKey` is Chat's `data-chat-node-key` (`${kind.length}:${kind}${turn}:${step}`),
 * derived from the append-only session log, so it survives reload and re-render.
 * `quote` + `prefix`/`suffix` form a Web Annotation TextQuoteSelector;
 * `start`/`end` are a TextPosition hint inside our own projection of the source
 * element, versioned by `projection`.
 */
export const AnchorSchema = z.object({
  /** `data-chat-node-key` of the assistant node, e.g. `14:assistant-step4:2` (definition kind `assistant-step`, id `turn:step`). */
  nodeKey: z.string().min(3).max(96),
  /** Which group occurrence the source belongs to. */
  groupPart: GroupPartSchema.optional(),
  /** `text` = selected span inside one block; `message` = the whole reply. */
  kind: z.enum(['text', 'message']),
  /** Durable message id when resolvable from the Chat snapshot. */
  messageId: z.string().min(1).max(128).optional(),
  /** Session event sequence of the node when resolvable. */
  nodeSeq: z.number().int().nonnegative().optional(),
  /** Turn number carried by the DOM. */
  turn: z.number().int().nonnegative().optional(),
  /** Step index inside the turn. */
  step: z.number().int().nonnegative().optional(),
  /** Nth selection source inside the node's response part (0-based DOM order). */
  sourceIndex: z.number().int().nonnegative(),
  /** The highlighted text, verbatim. */
  quote: z.string().min(1).max(MAX_QUOTE_CHARS),
  /** Up to CONTEXT_CHARS of text before the span. */
  prefix: z.string().max(CONTEXT_CHARS),
  /** Up to CONTEXT_CHARS of text after the span. */
  suffix: z.string().max(CONTEXT_CHARS),
  /** Start offset in our projection of the source element. */
  start: z.number().int().nonnegative(),
  /** End offset in our projection of the source element. */
  end: z.number().int().nonnegative(),
  /** Projection version the offsets belong to. */
  projection: z.literal(PROJECTION_VERSION),
})

/** Anchor data contract. */
export type HighlightAnchor = z.infer<typeof AnchorSchema>

/** One stored item (highlight or message mark). */
export const HighlightRecordSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().regex(UUID_RE, 'id must be a UUID'),
  /** Owning session. Records are keyed by it so forks never inherit items. */
  sessionId: z.string().min(1).max(128),
  /** Display snapshots; live values win when they resolve. */
  workspaceId: z.string().max(128).optional(),
  workspacePath: z.string().max(4096).optional(),
  sessionTitle: z.string().max(512).optional(),
  /** Install id of the creating device; sync-ready, never rendered. */
  origin: z.string().min(1).max(128),
  anchor: AnchorSchema,
  colorId: ColorIdSchema,
  tags: z.array(z.string().min(1).max(MAX_TAG_CHARS)).max(MAX_TAGS),
  note: z.string().max(MAX_NOTE_CHARS).optional(),
  /** Optional in schema v1; absent means user-authored. */
  author: AuthorSchema.optional(),
  /** Optional in schema v1; absent means `new`. */
  state: RecordStateSchema.optional(),
  /** Optional in schema v1; absent means `note`. */
  intent: IntentSchema.optional(),
  /** Optional in schema v1; absent means visible to the agent-read surface. */
  visibility: VisibilitySchema.optional(),
  starred: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  /** Compare-and-set counter; starts at 1 and increments per successful write. */
  version: z.number().int().positive(),
  /** Tombstone; a future syncer merges on it. Purged after the retention window. */
  deletedAt: z.number().int().nonnegative().optional(),
})

/** Stored item contract. */
export type HighlightRecord = z.infer<typeof HighlightRecordSchema>

/** Everything a client may propose when creating an item. */
export const DraftRecordSchema = HighlightRecordSchema.omit({
  schemaVersion: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
}).extend({
  /** Client-minted provisional id so the optimistic row is stable. */
  id: z.string().regex(UUID_RE, 'id must be a UUID'),
})

/** Create payload contract. */
export type DraftRecord = z.infer<typeof DraftRecordSchema>

/** Presentation fields a caller may patch in place. */
export const UpdatePatchSchema = z.object({
  colorId: ColorIdSchema.optional(),
  tags: z.array(z.string().min(1).max(MAX_TAG_CHARS)).max(MAX_TAGS).optional(),
  note: z.string().max(MAX_NOTE_CHARS).nullable().optional(),
  starred: z.boolean().optional(),
  /** The processing cursor is patchable in place. */
  state: RecordStateSchema.optional(),
  /** The speech act is patchable until the item is compiled. */
  intent: IntentSchema.optional(),
  /** Per-item consent is patchable at any time. */
  visibility: VisibilitySchema.optional(),
})

/** Patch payload contract. */
export type UpdatePatch = z.infer<typeof UpdatePatchSchema>

/** Per-install metadata record. */
export const InstallRecordSchema = z.object({
  installId: z.string().min(1).max(128),
  createdAt: z.number().int().nonnegative(),
})

/** Install metadata contract. */
export type InstallRecord = z.infer<typeof InstallRecordSchema>

/**
 * Normalise one user-entered tag.
 * @param tag - Raw tag text (may include a leading `#` and surrounding space).
 * @returns the normalised tag, or an empty string when nothing usable remains.
 */
export function normalizeTag(tag: string): string {
  return tag
    .replace(/^#+/u, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase()
    .slice(0, MAX_TAG_CHARS)
}

/**
 * Normalise a tag list: drop empties, de-duplicate, keep first-use order, cap length.
 * @param tags - Raw tag text list.
 * @returns the normalised list.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const raw of tags) {
    const tag = normalizeTag(raw)
    if (tag === '' || seen.has(tag)) continue
    seen.add(tag)
    next.push(tag)
    if (next.length >= MAX_TAGS) break
  }
  return next
}

/* ------------------------------------------------------------------ *
 * Schema-v1 optional fields — defined once in the zod-free module.
 * ------------------------------------------------------------------ */

export { agentVisible, authorOf, intentOf, stateOf, visibilityOf } from './provenance'
