/**
 * Shared fixtures for the anchor/seat/reveal tests.
 *
 * The shapes mirror the installed rc.1 Chat DOM: a single assistant node can be
 * rendered as one flat seat or as a reasoning seat plus a response seat that
 * both carry the same `data-chat-node-key`. `data-chat-anchor-key` equals the
 * node key on the response/flat seat and is a JSON pair on the reasoning seat
 * (see `ui-chat/src/client/chat/ChatNodeSeat.tsx` flowKey).
 *
 * Not a spec file: imported by `seat.spec.ts`, `resolve.spec.ts` and
 * `tests/client/ui/reveal.spec.tsx`.
 */
import type { HighlightAnchor, HighlightRecord } from '../../../src/shared/schema'

/** A real rc.1 assistant key: `${kind.length}:${kind}${turn}:${step}`. */
export const NODE_KEY = '14:assistant-step4:2'

/** Default response text used by the fixtures. */
export const RESPONSE_TEXT = 'The migration must land before the release.'

/** Default selected span inside {@link RESPONSE_TEXT}. */
export const QUOTE_START = 4
export const QUOTE_END = 21

/** Default quote, matching the span above. */
export const QUOTE = RESPONSE_TEXT.slice(QUOTE_START, QUOTE_END)

/** Reasoning text that must never be selected by the resolver. */
export const REASONING_TEXT = 'I should think about the migration order first.'

/** What a record may override on top of the fixture defaults. */
export interface RecordOptions {
  readonly id?: string
  readonly sessionId?: string
  readonly kind?: 'text' | 'message'
  readonly nodeKey?: string
  readonly groupPart?: 'reasoning' | 'response'
  readonly sourceIndex?: number
  /** Text the anchor was captured from; the quote/offsets default to it. */
  readonly text?: string
  readonly start?: number
  readonly end?: number
  readonly quote?: string
  readonly prefix?: string
  readonly suffix?: string
  readonly nodeSeq?: number
}

/**
 * Build one stored record (schema-valid shape).
 * @param options - overrides for the anchor/record fields.
 * @returns the record.
 */
export function makeRecord(options: RecordOptions = {}): HighlightRecord {
  const nodeKey = options.nodeKey ?? NODE_KEY
  const text = options.text ?? RESPONSE_TEXT
  const start = options.start ?? QUOTE_START
  const end = options.end ?? QUOTE_END
  const quote = options.quote ?? text.slice(start, end)
  const anchor: HighlightAnchor = {
    nodeKey,
    ...options.groupPart === undefined ? {} : { groupPart: options.groupPart },
    kind: options.kind ?? 'text',
    sourceIndex: options.sourceIndex ?? 0,
    quote,
    prefix: options.prefix ?? '',
    suffix: options.suffix ?? '',
    start,
    end,
    projection: 1,
    turn: 4,
    step: 2,
    ...options.nodeSeq === undefined ? {} : { nodeSeq: options.nodeSeq },
  }
  return {
    schemaVersion: 1,
    id: options.id ?? '00000000-0000-4000-8000-000000000001',
    sessionId: options.sessionId ?? 'session-a',
    origin: 'test',
    anchor,
    colorId: 1,
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
  }
}

/** Options for {@link appendSeat}. */
export interface SeatOptions {
  readonly nodeKey?: string
  readonly groupPart?: 'reasoning' | 'response'
  /** Override the anchor key, or `null` to omit the attribute entirely. */
  readonly anchorKey?: string | null
  readonly text?: string
  /** Nest the source under `[data-variant="think"]` (the reasoning body). */
  readonly thinking?: boolean
}

/** One rendered seat plus its selection source and text node. */
export interface SeatFixture {
  readonly seat: HTMLElement
  readonly source: HTMLElement
  readonly textNode: Text
}

/**
 * Append one Chat seat to a parent.
 * @param parent - element to append to.
 * @param options - seat shape.
 * @returns the seat, its source and its text node.
 */
export function appendSeat(parent: ParentNode, options: SeatOptions = {}): SeatFixture {
  const nodeKey = options.nodeKey ?? NODE_KEY
  const seat = document.createElement('div')
  seat.setAttribute('data-chat-node-key', nodeKey)
  seat.setAttribute('data-chat-flow-kind', 'assistant-step')
  seat.setAttribute('data-chat-turn', '4')
  if (options.groupPart !== undefined) seat.setAttribute('data-chat-group-part', options.groupPart)
  const anchorKey = options.anchorKey === null
    ? null
    : options.anchorKey ?? (options.groupPart === 'reasoning'
      ? JSON.stringify([nodeKey, 'reasoning'])
      : nodeKey)
  if (anchorKey !== null) seat.setAttribute('data-chat-anchor-key', anchorKey)

  const source = document.createElement('div')
  source.setAttribute('data-text-interaction-source', '')
  const textNode = document.createTextNode(options.text ?? (options.thinking === true ? REASONING_TEXT : RESPONSE_TEXT))
  source.append(textNode)
  if (options.thinking === true) {
    const think = document.createElement('div')
    think.setAttribute('data-variant', 'think')
    think.append(source)
    seat.append(think)
  } else {
    seat.append(source)
  }
  parent.append(seat)
  return { seat, source, textNode }
}

/** A mounted conversation root. */
export interface ConversationFixture {
  readonly root: HTMLElement
  readonly scroll: HTMLElement
}

/**
 * Mount one conversation root the way Chat does: `[data-conversation-session]`
 * wraps `[data-conversation-scroll]`.
 * @param sessionId - session the conversation belongs to.
 * @param parent - parent node; defaults to `document.body`.
 * @returns the root and scroll containers.
 */
export function appendConversation(sessionId: string, parent: ParentNode = document.body): ConversationFixture {
  const root = document.createElement('div')
  root.setAttribute('data-conversation-session', sessionId)
  const scroll = document.createElement('div')
  scroll.setAttribute('data-conversation-scroll', '')
  root.append(scroll)
  parent.append(root)
  return { root, scroll }
}

/**
 * Mount a conversation whose response seat renders the default text.
 * @param sessionId - session id.
 * @returns the conversation plus the rendered response seat.
 */
export function appendResponseConversation(sessionId: string): ConversationFixture & SeatFixture {
  const conversation = appendConversation(sessionId)
  const seat = appendSeat(conversation.scroll, { groupPart: 'response' })
  return { ...conversation, ...seat }
}
