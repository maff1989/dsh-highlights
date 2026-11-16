/**
 * Pure list logic for the session panel: transcript order, search, and filters.
 *
 * Kept out of the component so the ordering and matching rules can be tested
 * without a renderer, and so the panel's render body stays about layout. Every
 * function here is a pure projection of its arguments — no store, no clock.
 */
import { MAX_TAGS, MAX_TAG_CHARS } from '../../../shared/constants'
import type { ColorId, HighlightRecord } from '../../../shared/schema'
import { authorOf, type Author } from '../../../shared/provenance'

/** Palette slot ids in display order (fixed themed palette, see shared/constants). */
export const PANEL_COLOR_IDS: readonly ColorId[] = [1, 2, 3, 4, 5]

/** One derived tag filter chip. */
export interface TagCount {
  /** Normalised tag text. */
  readonly tag: string
  /** How many session records carry it. */
  readonly count: number
}

/** Everything the panel filters by, in one value so state moves atomically. */
export interface PanelFilter {
  /** Case-insensitive substring over quote, note, and tags; empty means no search. */
  readonly query: string
  /** Selected palette slots; empty means every colour. */
  readonly colorIds: ReadonlySet<ColorId>
  /** Show starred records only. */
  readonly starredOnly: boolean
  /** Author narrowing; `undefined` means every author (All is the default). */
  readonly author: Author | undefined
  /** Selected tags; empty means every tag. A record matches when it carries all of them. */
  readonly tags: ReadonlySet<string>
}

/**
 * A filter that admits every record.
 * @returns a fresh, empty filter.
 */
export function createEmptyFilter(): PanelFilter {
  return { query: '', colorIds: new Set(), starredOnly: false, author: undefined, tags: new Set() }
}

/**
 * Whether any narrowing is in force (drives the Clear affordance and the
 * "no matches" state).
 * @param filter - filter to inspect.
 * @returns true when the filter would drop at least one record class.
 */
export function isEmptyFilter(filter: PanelFilter): boolean {
  return filter.query.trim() === ''
    && filter.colorIds.size === 0
    && !filter.starredOnly
    && filter.author === undefined
    && filter.tags.size === 0
}

/**
 * Add or remove one value, returning a fresh set on change.
 * @param set - set to derive from (never mutated).
 * @param value - value to toggle.
 * @returns the new set.
 */
export function toggleInSet<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set)
  if (next.delete(value)) return next
  next.add(value)
  return next
}

/**
 * Compare two possibly absent position ordinals.
 * @param left - left ordinal.
 * @param right - right ordinal.
 * @returns the relative order, treating absence as "+infinity" (after every known value).
 */
function compareOrdinal(left: number | undefined, right: number | undefined): number {
  const l = left ?? Number.POSITIVE_INFINITY
  const r = right ?? Number.POSITIVE_INFINITY
  if (l === r) return 0
  return l < r ? -1 : 1
}

/**
 * Transcript order of two records: turn, step, block, offset, creation time.
 *
 * An absent turn or step sorts after every known position, so anchored records
 * read exactly like the session does and unknown positions fall to the end.
 * The id tiebreak keeps the order total (and so stable across engines).
 * @param left - left record.
 * @param right - right record.
 * @returns negative when left comes first.
 */
function compareRecords(left: HighlightRecord, right: HighlightRecord): number {
  return (
    compareOrdinal(left.anchor.turn, right.anchor.turn) ||
    compareOrdinal(left.anchor.step, right.anchor.step) ||
    compareOrdinal(left.anchor.sourceIndex, right.anchor.sourceIndex) ||
    compareOrdinal(left.anchor.start, right.anchor.start) ||
    compareOrdinal(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  )
}

/**
 * Sort records into transcript order without mutating the input.
 * @param records - records to order.
 * @returns a new, ordered array.
 */
function sortRecords(records: readonly HighlightRecord[]): HighlightRecord[] {
  return [...records].sort(compareRecords)
}

/**
 * Whether one record matches the search text.
 * @param record - record to test.
 * @param query - raw search text (leading/trailing space ignored).
 * @returns true when the quote, note, or any tag contains the text.
 */
function matchesQuery(record: HighlightRecord, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  if (record.anchor.quote.toLowerCase().includes(needle)) return true
  if (record.note !== undefined && record.note.toLowerCase().includes(needle)) return true
  return record.tags.some(tag => tag.toLowerCase().includes(needle))
}

/**
 * Whether one record survives the filter: every axis AND the search must match.
 * @param record - record to test.
 * @param filter - active filter.
 * @returns true when the record belongs in the list.
 */
function matchesFilter(record: HighlightRecord, filter: PanelFilter): boolean {
  if (filter.colorIds.size > 0 && !filter.colorIds.has(record.colorId)) return false
  if (filter.starredOnly && !record.starred) return false
  if (filter.author !== undefined && authorOf(record) !== filter.author) return false
  for (const tag of filter.tags) {
    if (!record.tags.includes(tag)) return false
  }
  return matchesQuery(record, filter.query)
}

/**
 * Project a session's records to the visible list: filtered, then in transcript order.
 * @param records - the session's records, in any order.
 * @param filter - active filter.
 * @returns a new, ordered array of the records that match.
 */
export function selectRecords(records: readonly HighlightRecord[], filter: PanelFilter): HighlightRecord[] {
  return sortRecords(records.filter(record => matchesFilter(record, filter)))
}

/**
 * Tags carried by a record set, most used first, then alphabetically.
 * @param records - records to scan.
 * @returns one entry per distinct tag.
 */
export function collectTags(records: readonly HighlightRecord[]): TagCount[] {
  const counts = new Map<string, number>()
  for (const record of records) {
    for (const tag of record.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
}

/**
 * Normalise one typed tag the way the Host will, so the optimistic edit and the
 * stored record agree. (The browser imports the shared schema as types only, so
 * the rule is mirrored rather than re-exported; the Host remains authoritative.)
 * @param raw - tag text as typed, possibly with a leading `#` and whitespace.
 * @returns the normalised tag, or an empty string when nothing usable remains.
 */
function normalizeTagInput(raw: string): string {
  return raw
    .replace(/^#+/u, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase()
    .slice(0, MAX_TAG_CHARS)
}

/**
 * Add a typed tag to a record's tag list.
 * @param tags - current tags.
 * @param raw - tag text as typed.
 * @returns the new list, or `undefined` when the tag is unusable, already present, or full.
 */
export function addTag(tags: readonly string[], raw: string): string[] | undefined {
  const tag = normalizeTagInput(raw)
  if (tag === '' || tags.includes(tag) || tags.length >= MAX_TAGS) return undefined
  return [...tags, tag]
}

/**
 * Read the `highlightId` navigation parameter out of an unvalidated params value.
 *
 * Navigation params are JSON-shaped by convention and are not validated at
 * runtime, so a body has to narrow them itself.
 * @param params - `tab.navigation.params` as delivered.
 * @returns the record id to focus, when the opener supplied one.
 */
export function highlightIdOf(params: unknown): string | undefined {
  if (typeof params !== 'object' || params === null) return undefined
  const candidate = (params as { readonly highlightId?: unknown }).highlightId
  return typeof candidate === 'string' && candidate !== '' ? candidate : undefined
}
