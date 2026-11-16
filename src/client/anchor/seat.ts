/**
 * Chat renders one assistant step as one or two DOM "seats".
 *
 * In the flat/detailed transcript an assistant step is a single row, but in the
 * grouped transcript Chat splits it into a reasoning row (inside the Turn's
 * process disclosure) and a response row. Both rows carry the *same*
 * `data-chat-node-key` (the Conversation key `${kind.length}:${kind}${turn}:${step}`),
 * so a plain `querySelector('[data-chat-node-key="…"]')` returns the reasoning
 * row first and any anchor resolution against it is guaranteed to fail: the
 * reasoning body is excluded and its only source sits under
 * `[data-variant="think"]`.
 *
 * Chat distinguishes the two rows:
 * - `data-chat-group-part="reasoning" | "response"` (absent on flat rows), and
 * - `data-chat-anchor-key`, which equals the node key on the response/flat row
 *   and is `JSON.stringify([nodeKey, 'reasoning'])` on the reasoning row
 *   (`ui-chat/src/client/chat/ChatNodeSeat.tsx`, flowKey).
 *
 * This module is the single place that turns a node key into the seat a record
 * belongs to. It never mutates the transcript and never throws.
 */

/** Which occurrence of a Chat node a seat renders. */
export type SeatGroupPart = 'reasoning' | 'response'

/** Escape a value for use inside an attribute selector. */
function cssEscape(value: string): string {
  const escape = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS?.escape
  if (typeof escape === 'function') return escape(value)
  return value.replace(/["\\]/gu, '\\$&')
}

/**
 * All rendered seats for one Chat node key, in DOM order.
 * @param nodeKey - Chat's `data-chat-node-key`.
 * @param scope - subtree to search; defaults to the whole document.
 * @returns every seat element carrying that key (reasoning seat first when split).
 */
export function findNodeSeats(nodeKey: string, scope: ParentNode = document): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(`[data-chat-node-key="${cssEscape(nodeKey)}"]`)]
}

/**
 * Pick the seat one record belongs to.
 *
 * Preference order:
 * 1. an explicit `groupPart` when the caller knows it and that seat is rendered
 *    (an old record from a split transcript, or a reasoning anchor if one exists);
 * 2. the row whose `data-chat-anchor-key` equals the node key — Chat's stable
 *    anchor for the response/flat row, which is the only row a highlight can paint;
 * 3. a row whose `data-chat-group-part` is absent or `response`;
 * 4. `null`: the node is rendered only as a reasoning row (or not at all), which
 *    callers treat as stale/absent. We deliberately do not fall back to
 *    "the first seat" — that is the reasoning row and would scroll the thinking
 *    block (or resolve against an empty reply source list).
 *
 * A `groupPart` that is not present in the current DOM (mode change) falls
 * through to 2/3 rather than failing, so old records keep resolving.
 * @param nodeKey - Chat's `data-chat-node-key`.
 * @param groupPart - recorded occurrence, when the anchor has one.
 * @param scope - subtree to search; defaults to the whole document.
 * @returns the seat to use, or null when no response/flat seat is rendered.
 */
export function findNodeSeat(
  nodeKey: string,
  groupPart?: SeatGroupPart,
  scope: ParentNode = document,
): HTMLElement | null {
  return pickNodeSeat(findNodeSeats(nodeKey, scope), nodeKey, groupPart)
}

/**
 * Pick the seat one record belongs to from already-collected seats.
 *
 * This is {@link findNodeSeat} without the DOM query: a resolve pass that
 * indexes every rendered seat once ([`resolveAll`](../resolve.ts)) hands the
 * per-key list in here, so repainting does not run one attribute-selector scan
 * per record. The preference order is exactly `findNodeSeat`'s.
 * @param seats - every rendered seat for this node key, in DOM order.
 * @param nodeKey - Chat's `data-chat-node-key`.
 * @param groupPart - recorded occurrence, when the anchor has one.
 * @returns the seat to use, or null when no response/flat seat is rendered.
 */
export function pickNodeSeat(
  seats: readonly HTMLElement[],
  nodeKey: string,
  groupPart?: SeatGroupPart,
): HTMLElement | null {
  if (seats.length === 0) return null

  if (groupPart !== undefined) {
    const exact = seats.find(seat => seat.dataset.chatGroupPart === groupPart)
    if (exact !== undefined) return exact
  }

  const anchored = seats.find(seat => seat.dataset.chatAnchorKey === nodeKey)
  if (anchored !== undefined) return anchored

  const response = seats.find(seat => {
    const part = seat.dataset.chatGroupPart
    return part === undefined || part === 'response'
  })
  return response ?? null
}
