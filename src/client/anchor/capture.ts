/**
 * Turning a live DOM selection into a durable anchor.
 *
 * Runs synchronously inside the Chat text-interaction dispatch, which is the
 * only moment the browser Selection is still valid. Everything the anchor keeps
 * comes from the DOM or from the node the selection sits in: the durable
 * `data-chat-node-key` (Turn and Step), the source element, and offsets in the
 * plugin's own projection.
 */
import type { HighlightAnchor } from '../../shared/schema'
import { MAX_QUOTE_CHARS, PROJECTION_VERSION } from '../../shared/constants'
import { projectSource } from './projection'

/** Where a candidate selection lives, once validated. */
export interface SelectionCandidate {
  /** The assistant node element the selection sits inside. */
  readonly node: HTMLElement
  /** The source element that owns the selected span. */
  readonly source: HTMLElement
  /** Chat's node identity of the assistant step. */
  readonly nodeKey: string
  /** Group occurrence, when the node is split by the transcript mode. */
  readonly groupPart: 'reasoning' | 'response' | undefined
  /** Which side of the message the selected text belongs to. */
  readonly kind: 'text' | 'reasoning'
  /** Nth matching source inside the node. */
  readonly sourceIndex: number
  /** Turn number carried by the DOM. */
  readonly turn: number | undefined
  /** Step index parsed from the node key. */
  readonly step: number | undefined
  /** The anchor itself, ready to store. */
  readonly anchor: HighlightAnchor
}

/** Climb from a node to its element. */
function elementOf(node: Node): HTMLElement | null {
  if (node.nodeType === 1) return node as HTMLElement
  return node.parentElement
}

/**
 * Identity of an assistant node, or null when the element is not one.
 *
 * Chat's `data-chat-node-key` is `${definitionKind.length}:${definitionKind}${id}`,
 * where the assistant definition kind is `assistant-step` and the id is
 * `${turn}:${step}` — so a real key reads `14:assistant-step4:2`. The same
 * spelling appears in `data-chat-flow-kind`. Capture also accepts the older
 * `\d+:assistant…` shape so a future rename of either signal cannot silently
 * disable capture, and a non-assistant node (a user message key such as
 * `4:user3:1`) is rejected.
 * @param node - Candidate node element.
 * @returns the key plus its Turn and Step, or null when this is not an assistant node.
 */
function assistantIdentity(node: HTMLElement): { nodeKey: string; turn?: number; step?: number } | null {
  const nodeKey = node.dataset.chatNodeKey ?? ''
  const flowKind = node.dataset.chatFlowKind
  const isAssistant = flowKind === 'assistant-step' || /^\d+:assistant/u.test(nodeKey)
  if (!isAssistant) return null
  const match = /(\d+):(\d+)$/u.exec(nodeKey)
  const turnAttribute = node.dataset.chatTurn
  const turnFromAttribute = turnAttribute !== undefined && /^\d+$/u.test(turnAttribute)
    ? Number(turnAttribute)
    : undefined
  const turn = turnFromAttribute ?? (match === null ? undefined : Number(match[1]))
  const step = match === null ? undefined : Number(match[2])
  return {
    nodeKey,
    ...(turn === undefined || !Number.isFinite(turn) ? {} : { turn }),
    ...(step === undefined || !Number.isFinite(step) ? {} : { step }),
  }
}

/** Collect the selection sources of one assistant node, in DOM order. */
function sourcesOf(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>('[data-text-interaction-source]')]
}

/** True when the source belongs to the reasoning (thinking) body. */
function isReasoningSource(source: HTMLElement): boolean {
  return source.closest('[data-variant="think"]') !== null
}

/** A selection normalized to exactly one text-interaction source. */
interface NormalizedSelection {
  readonly source: HTMLElement
  readonly range: Range
}

/**
 * Whether the text between two range boundaries is whitespace only.
 * @param start - range start container.
 * @param startOffset - range start offset.
 * @param end - range end container.
 * @param endOffset - range end offset.
 * @returns whether the slice contains no visible text, or cannot be built.
 */
function whitespaceBetween(start: Node, startOffset: number, end: Node, endOffset: number): boolean {
  try {
    const probe = document.createRange()
    probe.setStart(start, startOffset)
    probe.setEnd(end, endOffset)
    return probe.toString().trim() === ''
  } catch {
    return false
  }
}

/**
 * Clamp a range to one source's content boundaries.
 *
 * A block selection (Chromium triple-click) ends at the next block boundary; on
 * the last block of a source that endpoint lies outside the source, in the turn
 * tail's action-row chrome, even though the visible selection is exactly the
 * reply text. Only a **whitespace** spill is clamped: text selected outside the
 * source is a different gesture and stays rejected.
 * @param range - raw selection range.
 * @param source - the source to clamp into.
 * @returns the intersected range, or null when it does not safely intersect the source.
 */
function clampToSource(range: Range, source: HTMLElement): Range | null {
  const bounds = document.createRange()
  bounds.selectNodeContents(source)
  const clamped = bounds.cloneRange()
  const startsOutside = range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0
  const endsOutside = range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0
  if (!startsOutside && !endsOutside) return range.collapsed ? null : range
  if (startsOutside) {
    if (!whitespaceBetween(range.startContainer, range.startOffset, bounds.startContainer, bounds.startOffset)) return null
  } else {
    if (!source.contains(range.startContainer)) return null
    clamped.setStart(range.startContainer, range.startOffset)
  }
  if (endsOutside) {
    if (!whitespaceBetween(bounds.endContainer, bounds.endOffset, range.endContainer, range.endOffset)) return null
  } else {
    if (!source.contains(range.endContainer)) return null
    clamped.setEnd(range.endContainer, range.endOffset)
  }
  return clamped.collapsed ? null : clamped
}

/**
 * Normalize a raw range to one source.
 *
 * Both endpoints in the same source is the normal path. A selection with exactly
 * one endpoint inside a source and the other endpoint outside every source — the
 * triple-click spill into the block boundary / message chrome — is clamped to
 * that source's boundaries. Endpoints in two different sources stay rejected:
 * one anchor cannot describe both.
 * @param range - the live (cloned) selection range.
 * @returns the source and range to project, or null when out of scope.
 */
function normalizeSelection(range: Range): NormalizedSelection | null {
  const startElement = elementOf(range.startContainer)
  const endElement = elementOf(range.endContainer)
  if (startElement === null || endElement === null) return null
  const startSource = startElement.closest<HTMLElement>('[data-text-interaction-source]')
  const endSource = endElement.closest<HTMLElement>('[data-text-interaction-source]')
  if (startSource !== null && startSource === endSource) {
    const inside = (node: Node): boolean => sourceContains(startSource, node)
    return inside(range.startContainer) && inside(range.endContainer) ? { source: startSource, range } : null
  }
  if (startSource !== null && endSource === null) {
    const clamped = clampToSource(range, startSource)
    return clamped === null ? null : { source: startSource, range: clamped }
  }
  if (startSource === null && endSource !== null) {
    const clamped = clampToSource(range, endSource)
    return clamped === null ? null : { source: endSource, range: clamped }
  }
  return null
}

/**
 * Whether one node sits inside a source element (the element itself included).
 * @param source - the source element.
 * @param node - the node to test.
 * @returns whether the node belongs to the source's content.
 */
function sourceContains(source: HTMLElement, node: Node): boolean {
  return node === source || source.contains(node)
}

/**
 * Validate a live selection and turn it into an anchor.
 *
 * Rejects everything outside the plugin's stated scope: non-assistant nodes,
 * reasoning text (thinking is not highlightable), tool output, user messages,
 * collapsed selections, and selections whose two endpoints do not share one
 * source element.
 * @param selection - The browser selection captured at dispatch time.
 * @returns the candidate, or null when the selection is not highlightable.
 */
export function captureSelection(selection: Selection | null): SelectionCandidate | null {
  if (selection === null || selection.rangeCount !== 1 || selection.isCollapsed) return null
  const normalized = normalizeSelection(selection.getRangeAt(0).cloneRange())
  if (normalized === null) return null
  const { source, range } = normalized

  const node = source.closest<HTMLElement>('[data-chat-node-key]')
  if (node === null) return null
  const identity = assistantIdentity(node)
  if (identity === null) return null
  const nodeKey = identity.nodeKey

  const reasoning = isReasoningSource(source)
  // Reasoning is out of scope for this plugin: only the reply text is marked.
  if (reasoning) return null

  const groupPartValue = node.dataset.chatGroupPart
  const groupPart = groupPartValue === 'reasoning' || groupPartValue === 'response' ? groupPartValue : undefined
  const sources = sourcesOf(node).filter(candidate => !isReasoningSource(candidate))
  const sourceIndex = sources.indexOf(source)
  if (sourceIndex < 0) return null

  const projection = projectSource(source)
  const start = projection.offsetOf(range.startContainer, range.startOffset)
  const end = projection.offsetOf(range.endContainer, range.endOffset)
  if (start === null || end === null || end <= start) return null

  const quote = projection.text.slice(start, end).slice(0, MAX_QUOTE_CHARS)
  if (quote.trim().length === 0) return null

  const anchor: HighlightAnchor = {
    nodeKey,
    ...(groupPart === undefined ? {} : { groupPart }),
    kind: 'text',
    sourceIndex,
    quote,
    prefix: projection.text.slice(Math.max(0, start - 48), start),
    suffix: projection.text.slice(end, Math.min(projection.text.length, end + 48)),
    start,
    end,
    projection: PROJECTION_VERSION,
    ...(identity.turn === undefined ? {} : { turn: identity.turn }),
    ...(identity.step === undefined ? {} : { step: identity.step }),
  }

  return { node, source, nodeKey, groupPart, kind: 'text', sourceIndex, turn: identity.turn, step: identity.step, anchor }
}

/**
 * Explain why a selection is not highlightable, for diagnostics.
 *
 * The capture path returns null for several distinct reasons; a one-line reason
 * makes a field report actionable instead of a guess.
 * @param selection - The live browser selection.
 * @returns the first failing condition, or null when capture would succeed.
 */
export function explainCaptureFailure(selection: Selection | null): string | null {
  if (selection === null || selection.rangeCount !== 1) return 'no selection'
  if (selection.isCollapsed) return 'collapsed selection'
  const raw = selection.getRangeAt(0)
  const startElement = elementOf(raw.startContainer)
  const endElement = elementOf(raw.endContainer)
  if (startElement === null || endElement === null) return 'selection endpoints outside the document'
  const startSource = startElement.closest<HTMLElement>('[data-text-interaction-source]')
  const endSource = endElement.closest<HTMLElement>('[data-text-interaction-source]')
  const normalized = normalizeSelection(raw.cloneRange())
  if (normalized === null) {
    if (startSource === null && endSource === null) return 'selection is not inside a text-interaction source'
    if (startSource !== null && endSource !== null && startSource !== endSource) return 'selection spans two sources'
    return 'selection could not be clamped to one source'
  }
  const { source, range } = normalized
  const node = source.closest<HTMLElement>('[data-chat-node-key]')
  if (node === null) return 'source is not inside a chat node'
  if (assistantIdentity(node) === null) return `node is not an assistant step (key ${String(node.dataset.chatNodeKey)})`
  if (isReasoningSource(source)) return 'selection is reasoning text'
  const projection = projectSource(source)
  const start = projection.offsetOf(range.startContainer, range.startOffset)
  const end = projection.offsetOf(range.endContainer, range.endOffset)
  if (start === null || end === null) return 'selection endpoints could not be projected'
  if (end <= start) return 'empty projection range'
  if (projection.text.slice(start, end).trim().length === 0) return 'selected text is whitespace'
  return null
}

/**
 * Build a whole-message anchor from an assistant node element.
 * @param node - The assistant node element.
 * @param messageId - Durable message id, when known.
 * @param nodeSeq - Session event sequence of the node, when known.
 * @returns the anchor, or null when the node has no response source.
 */
export function captureMessageAnchor(
  node: HTMLElement,
  messageId?: string,
  nodeSeq?: number,
): HighlightAnchor | null {
  const identity = assistantIdentity(node)
  if (identity === null) return null
  const nodeKey = identity.nodeKey
  const sources = sourcesOf(node).filter(candidate => !isReasoningSource(candidate))
  const first = sources[0]
  if (first === undefined) return null
  const groupPartValue = node.dataset.chatGroupPart
  const groupPart = groupPartValue === 'reasoning' || groupPartValue === 'response' ? groupPartValue : undefined
  const projection = projectSource(first)
  if (projection.text.trim().length === 0) return null
  const quote = projection.text.slice(0, MAX_QUOTE_CHARS)
  return {
    nodeKey,
    ...(groupPart === undefined ? {} : { groupPart }),
    kind: 'message',
    sourceIndex: 0,
    quote,
    prefix: '',
    suffix: '',
    start: 0,
    end: projection.text.length,
    projection: PROJECTION_VERSION,
    ...(messageId === undefined ? {} : { messageId }),
    ...(nodeSeq === undefined ? {} : { nodeSeq }),
    ...(identity.turn === undefined ? {} : { turn: identity.turn }),
    ...(identity.step === undefined ? {} : { step: identity.step }),
  }
}
