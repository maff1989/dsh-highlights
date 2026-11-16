/**
 * Server-side query: filtering, ordering, cursor pagination and summaries.
 *
 * Additive to the frozen `list` endpoint (ADR-002/ADR-027). The Host still owns
 * the whole record set in memory; this module bounds what crosses the wire, so a
 * 10 000-record store no longer means a 52–294 MiB `list` payload.
 */
import { comparePosition, positionKey } from '../shared/position'
import type { HighlightRecord } from '../shared/schema'
import type { HighlightSummary, QueryInput, QueryValue } from '../shared/protocol'
import { QUERY_DEFAULT_LIMIT, QUERY_MAX_LIMIT } from '../shared/protocol'

/** Hard byte bound for one query page's `items` array. */
export const QUERY_MAX_ITEMS_BYTES = 2 * 1024 * 1024

/** One decoded cursor: the last item's position plus an id tie-break. */
interface Cursor {
  readonly p: readonly number[]
  readonly id: string
}

/** Encode the cursor of one record. */
function encodeCursor(record: HighlightRecord): string {
  const payload: Cursor = { p: positionKey(record), id: record.id }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/** Decode a cursor, returning undefined for malformed input. */
function decodeCursor(value: string | undefined): Cursor | undefined {
  if (value === undefined || value === '') return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>
    if (!Array.isArray(parsed.p) || typeof parsed.id !== 'string') return undefined
    return { p: parsed.p, id: parsed.id }
  } catch {
    return undefined
  }
}

/** Compare a record against the cursor position. */
function isAfter(record: HighlightRecord, cursor: Cursor): boolean {
  const key = positionKey(record)
  const limit = Math.min(key.length, cursor.p.length)
  for (let index = 0; index < limit; index += 1) {
    const one = key[index] ?? 0
    const other = cursor.p[index] ?? 0
    if (one === other) continue
    return one > other
  }
  return record.id > cursor.id
}

/** Whether a record matches every filter. */
function matches(record: HighlightRecord, input: QueryInput): boolean {
  if (record.deletedAt !== undefined) return false
  if (input.sessionId !== undefined && record.sessionId !== input.sessionId) return false
  if (input.workspaceId !== undefined && record.workspaceId !== input.workspaceId) return false
  if (input.starred !== undefined && record.starred !== input.starred) return false
  if (input.tag !== undefined && !record.tags.includes(input.tag.toLowerCase())) return false
  if (input.q !== undefined && input.q !== '') {
    const needle = input.q.toLowerCase()
    const haystack = [record.anchor.quote, record.note ?? '', ...record.tags].join('\n').toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

/** Project one record to the summary wire shape. */
export function summarize(record: HighlightRecord): HighlightSummary {
  const anchor = record.anchor
  return {
    id: record.id,
    sessionId: record.sessionId,
    ...(record.workspaceId === undefined ? {} : { workspaceId: record.workspaceId }),
    ...(record.workspacePath === undefined ? {} : { workspacePath: record.workspacePath }),
    ...(record.sessionTitle === undefined ? {} : { sessionTitle: record.sessionTitle }),
    colorId: record.colorId,
    tags: [...record.tags],
    ...(record.note === undefined ? {} : { note: record.note }),
    starred: record.starred,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
    anchor: {
      nodeKey: anchor.nodeKey,
      ...(anchor.groupPart === undefined ? {} : { groupPart: anchor.groupPart }),
      kind: anchor.kind,
      ...(anchor.messageId === undefined ? {} : { messageId: anchor.messageId }),
      ...(anchor.nodeSeq === undefined ? {} : { nodeSeq: anchor.nodeSeq }),
      ...(anchor.turn === undefined ? {} : { turn: anchor.turn }),
      ...(anchor.step === undefined ? {} : { step: anchor.step }),
      sourceIndex: anchor.sourceIndex,
      quote: anchor.quote,
      start: anchor.start,
      end: anchor.end,
      projection: anchor.projection,
    },
  }
}

/**
 * Run one query over a record set.
 * @param records - every stored record (tombstones included; they are filtered).
 * @param input - validated query input.
 * @returns one bounded page plus an opaque continuation cursor.
 */
export function queryRecords(records: readonly HighlightRecord[], input: QueryInput): QueryValue {
  const matching = records.filter(record => matches(record, input))
  matching.sort(comparePosition)
  const cursor = decodeCursor(input.cursor)
  const afterCursor = cursor === undefined ? matching : matching.filter(record => isAfter(record, cursor))
  const requested = input.limit ?? QUERY_DEFAULT_LIMIT
  const limit = Math.min(Math.max(requested, 1), QUERY_MAX_LIMIT)
  const page = afterCursor.slice(0, limit)
  const include = input.include ?? 'summary'
  let items: (HighlightSummary | HighlightRecord)[] = page.map(record => include === 'summary' ? summarize(record) : record)
  let nextCursor = afterCursor.length > page.length && page.length > 0
    ? encodeCursor(page[page.length - 1] as HighlightRecord)
    : undefined

  // Honour the byte bound even for body pages by shrinking the page.
  while (items.length > 1 && Buffer.byteLength(JSON.stringify(items), 'utf8') > QUERY_MAX_ITEMS_BYTES) {
    items = items.slice(0, -1)
    const last = page[items.length - 1]
    nextCursor = last === undefined ? undefined : encodeCursor(last)
  }
  return {
    items,
    ...(nextCursor === undefined ? {} : { nextCursor }),
    total: matching.length,
  }
}
