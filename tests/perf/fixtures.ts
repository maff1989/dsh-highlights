/**
 * Deterministic fixtures for the migration's structural and performance tests.
 *
 * These are deliberately dependency-free: they build records and a transcript
 * DOM that the resolution/paint/observation code can consume under jsdom. Live
 * (browser) fixtures are documented in `tests/perf/README.md`; this module is the
 * part CI can run.
 */
import type { HighlightAnchor, HighlightRecord } from '../../src/shared/schema'

/** Session id used by the default fixture transcript. */
export const FIXTURE_SESSION = 'session-perf-fixture'

/** Node key shape Chat puts on a transcript row. */
export function nodeKeyFor(turn: number, step: number, kind = 'assistant'): string {
  return `${kind.length}:${kind}${turn}:${step}`
}

/** Build a schema-valid anchor for a text highlight. */
export function makeTextAnchor(input?: {
  readonly turn?: number
  readonly step?: number
  readonly sourceIndex?: number
  readonly quote?: string
  readonly prefix?: string
  readonly suffix?: string
}): HighlightAnchor {
  const turn = input?.turn ?? 1
  const step = input?.step ?? 1
  const quote = input?.quote ?? 'highlighted span'
  const prefix = input?.prefix ?? 'prefix '
  const suffix = input?.suffix ?? ' suffix'
  return {
    nodeKey: nodeKeyFor(turn, step),
    groupPart: 'response',
    kind: 'text',
    sourceIndex: input?.sourceIndex ?? 0,
    quote,
    prefix,
    suffix,
    start: prefix.length,
    end: prefix.length + quote.length,
    projection: 1,
    turn,
    step,
  }
}

/** Build a schema-valid message-mark anchor. */
export function makeMessageAnchor(input?: { readonly turn?: number; readonly step?: number }): HighlightAnchor {
  const turn = input?.turn ?? 1
  const step = input?.step ?? 1
  const quote = 'whole assistant reply'
  return {
    nodeKey: nodeKeyFor(turn, step),
    groupPart: 'response',
    kind: 'message',
    sourceIndex: 0,
    quote,
    prefix: '',
    suffix: '',
    start: 0,
    end: quote.length,
    projection: 1,
    turn,
    step,
  }
}

let recordSequence = 0

/** Build one valid record; override any field. */
export function makeRecord(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
  recordSequence += 1
  const turn = overrides.anchor?.turn ?? recordSequence
  const anchor = overrides.anchor ?? makeTextAnchor({ turn, step: 1 })
  return {
    schemaVersion: 1,
    id: `0190a000-0000-7000-8000-${String(recordSequence).padStart(12, '0')}`,
    sessionId: FIXTURE_SESSION,
    origin: '01a1cc12-0000-7000-8000-000000000001',
    anchor,
    colorId: 1,
    tags: [],
    starred: false,
    createdAt: 1_700_000_000_000 + recordSequence,
    updatedAt: 1_700_000_000_000 + recordSequence,
    version: 1,
    ...overrides,
  }
}

/** `count` records for one session, one per turn. */
export function seedRecords(count: number, input: { readonly sessionId?: string; readonly kind?: 'text' | 'message' } = {}): HighlightRecord[] {
  const sessionId = input.sessionId ?? FIXTURE_SESSION
  const records: HighlightRecord[] = []
  for (let index = 1; index <= count; index += 1) {
    const anchor = input.kind === 'message'
      ? makeMessageAnchor({ turn: index, step: 1 })
      : makeTextAnchor({ turn: index, step: 1 })
    records.push(makeRecord({ sessionId, anchor }))
  }
  return records
}

/** One mounted transcript fixture. */
export interface TranscriptFixture {
  /** `[data-conversation-session]` root. */
  readonly conversation: HTMLElement
  /** `[data-conversation-scroll]` scroller. */
  readonly scroller: HTMLElement
  /** `[data-chat-flow]` content root. */
  readonly flow: HTMLElement
  /** One row per record (same order). */
  readonly rows: HTMLElement[]
}

/**
 * Build a transcript DOM for the given records.
 * @param records - records whose anchors become `[data-chat-node-key]` rows.
 * @param documentRoot - document to build in (defaults to the global one).
 */
export function makeTranscript(records: readonly HighlightRecord[], documentRoot: Document = document): TranscriptFixture {
  const conversation = documentRoot.createElement('div')
  conversation.dataset.conversationSession = records[0]?.sessionId ?? FIXTURE_SESSION
  const scroller = documentRoot.createElement('div')
  scroller.dataset.conversationScroll = ''
  const flow = documentRoot.createElement('div')
  flow.dataset.chatFlow = ''
  scroller.append(flow)
  conversation.append(scroller)
  documentRoot.body.append(conversation)

  const rows: HTMLElement[] = []
  for (const record of records) {
    const row = documentRoot.createElement('div')
    row.dataset.chatNodeKey = record.anchor.nodeKey
    const source = documentRoot.createElement('span')
    source.dataset.textInteractionSource = ''
    source.textContent = `${record.anchor.prefix}${record.anchor.quote}${record.anchor.suffix}`
    row.append(source)
    flow.append(row)
    rows.push(row)
  }
  return { conversation, scroller, flow, rows }
}

/** Remove a fixture transcript from the document. */
export function disposeTranscript(fixture: TranscriptFixture): void {
  fixture.conversation.remove()
}

/** A streamable text row for mutation-driven repaint tests. */
export function appendStreamingRow(fixture: TranscriptFixture, text: string): HTMLElement {
  const row = fixture.conversation.ownerDocument.createElement('div')
  row.dataset.chatNodeKey = nodeKeyFor(999, 1)
  row.textContent = text
  fixture.flow.append(row)
  return row
}
