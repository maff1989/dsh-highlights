/**
 * Provenance, cursor, intent and visibility — the schema-v1 optional fields,
 * defined without zod.
 *
 * Why a second module: the browser half may read these helpers at runtime, and
 * importing `shared/schema.ts` for a value would inline the whole zod schema
 * tree into the client bundle (every record schema is constructed at module
 * load). Host code imports the zod schemas; both halves import these pure
 * helpers from here, so there is exactly one definition of each default.
 */
export type Author = 'user' | 'agent'
export type RecordState = 'new' | 'kept' | 'compiled'
export type Intent = 'note' | 'dispute' | 'direct' | 'remember'
export type Visibility = 'agent' | 'private'

/** Author enum values, in declaration order. */
export const AUTHOR_VALUES = ['user', 'agent'] as const

/** Cursor enum values, in declaration order. */
export const RECORD_STATE_VALUES = ['new', 'kept', 'compiled'] as const

/** Intent enum values, in declaration order. */
export const INTENT_VALUES = ['note', 'dispute', 'direct', 'remember'] as const

/** Visibility enum values, in declaration order. */
export const VISIBILITY_VALUES = ['agent', 'private'] as const

/** Minimal record shape the helpers read. */
interface Provenanced {
  readonly author?: Author | undefined
  readonly state?: RecordState | undefined
  readonly intent?: Intent | undefined
  readonly visibility?: Visibility | undefined
}

/**
 * Author of one record.
 * @param record - any stored record.
 * @returns `user` when the optional field is absent.
 */
export function authorOf(record: Pick<Provenanced, 'author'>): Author {
  return record.author ?? 'user'
}

/**
 * Processing state of one record.
 * @param record - any stored record.
 * @returns `new` when the optional field is absent.
 */
export function stateOf(record: Pick<Provenanced, 'state'>): RecordState {
  return record.state ?? 'new'
}

/**
 * Speech act of one record.
 * @param record - any stored record.
 * @returns `note` when the optional field is absent.
 */
export function intentOf(record: Pick<Provenanced, 'intent'>): Intent {
  return record.intent ?? 'note'
}

/**
 * Model visibility of one record.
 * @param record - any stored record.
 * @returns `agent` when the optional field is absent.
 */
export function visibilityOf(record: Pick<Provenanced, 'visibility'>): Visibility {
  return record.visibility ?? 'agent'
}

/**
 * Whether a record may be read by the agent surface.
 * @param record - any stored record.
 * @returns false only for an explicitly private item.
 */
export function agentVisible(record: Pick<Provenanced, 'visibility'>): boolean {
  return visibilityOf(record) !== 'private'
}
