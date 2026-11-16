/**
 * Revealing a highlight in the conversation.
 *
 * DSH has no public "reveal this message" API, so the plugin composes the
 * public pieces: select the session, return to the Conversation panel, wait for
 * React to commit the target session's conversation, page history back until
 * the node's sequence is loaded, wait for the response row, scroll it into
 * view, and flash the resolved range. The flash is a second CSS highlight, so
 * revealing never mutates the transcript either.
 *
 * Sequencing matters for correctness, not just for timing: `openSession` only
 * changes the layout selection synchronously, while the new transcript commits
 * later. Chat node keys are per-session (turn/step), so the previous session can
 * still be mounted with an identical `data-chat-node-key`. Everything below is
 * therefore scoped to `[data-conversation-session="<target>"]`: the old
 * conversation is never searched, never scrolled and never resolved. All waits
 * are bounded `setTimeout` polls (not `requestAnimationFrame`, which a hidden
 * tab can suspend), so a reveal always returns.
 */
import type { Context } from '@deepseek-ai/cordis'

import type { HighlightRecord } from '../shared/schema'
import type { RevealOutcome } from './data/actions'
import { resolveRecord } from './anchor/resolve'
import { findNodeSeat } from './anchor/seat'
import type { HighlightsPainter } from './paint/adapters/css-highlights'

/** How long each wait phase may take, and how often it polls. */
export interface RevealTiming {
  /** Wait for the target session's conversation to be committed. */
  readonly session: number
  /** Wait for the response row after it is loaded. */
  readonly seat: number
  /** Upper bound for the history paging call. */
  readonly load: number
  /** Poll interval for the waits above. */
  readonly poll: number
}

/** Default bounds: a reveal settles (or gives up) in a few seconds. */
export const DEFAULT_REVEAL_TIMING: RevealTiming = {
  session: 2_500,
  seat: 2_500,
  load: 2_500,
  poll: 50,
}

/** Attribute Chat puts on the conversation root once a session is committed. */
const CONVERSATION_SESSION_ATTRIBUTE = 'data-conversation-session'

/** Dependencies the reveal routine needs from the plugin. */
export interface RevealDeps {
  readonly ctx: Context
  readonly painter: HighlightsPainter
  /** Test/embedding override for the waits; production uses the defaults. */
  readonly timing?: Partial<RevealTiming>
}

/** The mounted conversation root for one session, when committed. */
function conversationFor(sessionId: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(`[${CONVERSATION_SESSION_ATTRIBUTE}]`)) {
    if (element.dataset.conversationSession === sessionId) return element
  }
  return null
}

/** The session of the conversation currently mounted, when any. */
function activeConversationSession(): string | undefined {
  return document.querySelector<HTMLElement>(`[${CONVERSATION_SESSION_ATTRIBUTE}]`)?.dataset.conversationSession
}

/** One macrotask, used to poll without depending on animation frames. */
function sleep(milliseconds: number): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(resolve, Math.max(1, milliseconds))
  })
}

/**
 * Poll until a predicate holds, the budget elapses, or the caller aborts.
 * @param predicate - Condition to wait for.
 * @param timeoutMs - Budget for this phase.
 * @param pollMs - Poll interval.
 * @param aborted - Extra stop condition (selection changed).
 * @returns whether the predicate held.
 */
async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  pollMs: number,
  aborted: () => boolean,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (predicate()) return true
    if (aborted()) return false
    const remaining = deadline - Date.now()
    if (remaining <= 0) return predicate()
    await sleep(Math.min(pollMs, remaining))
  }
}

/** Race an async operation against a timeout, never rejecting. */
async function settleWithin(operation: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>(resolve => {
    timer = setTimeout(resolve, Math.max(1, timeoutMs))
  })
  try {
    await Promise.race([operation.then(() => undefined, () => undefined), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Scroll the resolved text range into view in one instant landing.
 *
 * Chat owns its scrollport, paging and reading/follow state. Animating a DOM
 * scroll through it produces a long stream of scroll events that re-enters
 * Chat's reading, history and resize machinery (and can trigger history
 * prefetch). The plugin therefore pages first (`loadThrough`, public API), then
 * lands once by writing the final offset directly. The transcript jumps to the
 * text instead of animating through history.
 */
function scrollRangeIntoView(range: Range, conversation: HTMLElement, seat: HTMLElement): void {
  // jsdom (and any non-layout host) may not implement range geometry.
  let rect: DOMRect | undefined
  try {
    if (typeof range.getBoundingClientRect === 'function') rect = range.getBoundingClientRect()
  } catch {
    rect = undefined
  }
  if (rect === undefined || (rect.width === 0 && rect.height === 0)) {
    // No layout information: the row is the best target.
    seat.scrollIntoView({ block: 'center', behavior: 'instant' })
    return
  }
  const scroller = conversation.querySelector<HTMLElement>('[data-conversation-scroll]')
  if (scroller !== null && (rect.width > 0 || rect.height > 0)
    && scroller.scrollHeight > scroller.clientHeight) {
    const viewport = scroller.getBoundingClientRect()
    const delta = rect.top - viewport.top - viewport.height / 2 + rect.height / 2
    if (Number.isFinite(delta) && Math.abs(delta) > 1) {
      const target = scroller.scrollTop + delta
      try {
        if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: target, behavior: 'instant' })
        else scroller.scrollTop = target
      } catch {
        scroller.scrollTop = target
      }
      return
    }
  }
  const parent = range.startContainer instanceof Element
    ? range.startContainer
    : range.startContainer.parentElement
  if (parent !== null && typeof parent.scrollIntoView === 'function') {
    parent.scrollIntoView({ block: 'center', behavior: 'instant' })
    return
  }
  seat.scrollIntoView({ block: 'center', behavior: 'instant' })
}

/**
 * Reveal one record.
 *
 * Best effort by design: a folded Turn can keep the row from existing at all,
 * in which case the session is opened and `not-found` is returned so the caller
 * can show its fallback. Nothing here throws and nothing here waits forever.
 * @param record - The record to reveal.
 * @param deps - Plugin context, painter, and optional wait bounds.
 * @returns whether the anchored text was located and revealed.
 */
export async function revealRecord(record: HighlightRecord, deps: RevealDeps): Promise<RevealOutcome> {
  const { ctx, painter } = deps
  const timing: RevealTiming = { ...DEFAULT_REVEAL_TIMING, ...deps.timing }
  const sessionId = record.sessionId
  const previousSession = activeConversationSession()
  /**
   * Once the target conversation is committed, any change to the mounted
   * session means the reader navigated elsewhere: abort instead of acting on a
   * different transcript. Before it commits, the previous session (or a moment
   * with no conversation) is the expected state.
   */
  let targetSeen = false
  const locateConversation = (): HTMLElement | null => {
    const conversation = conversationFor(sessionId)
    if (conversation !== null) targetSeen = true
    return conversation
  }
  const locateSeat = (): HTMLElement | null => {
    const conversation = locateConversation()
    if (conversation === null) return null
    return findNodeSeat(record.anchor.nodeKey, record.anchor.groupPart, conversation)
  }
  const aborted = (): boolean => {
    const active = activeConversationSession()
    if (active === undefined || active === sessionId) return false
    return targetSeen || (previousSession !== undefined && active !== previousSession)
  }

  // Quiescence is owned by RevealPort (which sets the observation signal the
  // selection affordance reads); this routine stays lifecycle-free.
  try {
    // openSession returns to the Conversation panel on its own (its 'reveal'
    // path calls layout.selectPanel(null) inside replaceMain); the extra
    // selectPanel(null) this used to call aborted layout navigation a second
    // time for no effect.
    ctx.uiWorkspace.openSession(sessionId as never)

    // 1) Wait for the target session's conversation; the previous session's DOM
    //    is never a candidate even when it renders the same node key.
    if (!await waitUntil(() => locateConversation() !== null, timing.session, timing.poll, aborted)) {
      return 'not-found'
    }

    // 2) The node may be windowed out of history; page through only then.
    let seat = locateSeat()
    if (seat === null) {
      const seq = record.anchor.nodeSeq
      const binding = seq === undefined ? undefined : ctx.sessions.binding(sessionId as never)
      if (seq !== undefined && binding !== undefined) {
        await settleWithin(binding.session.loadThrough(seq as never), timing.load)
      }
      if (!await waitUntil(() => locateSeat() !== null, timing.seat, timing.poll, aborted)) {
        return 'not-found'
      }
      seat = locateSeat()
    }
    if (seat === null || aborted()) return 'not-found'

    // 3) Reveal the anchored characters, not just their row: resolve first, then
    //    scroll the actual range into the transcript viewport and flash it.
    const conversation = locateConversation()
    if (conversation === null) return 'not-found'
    const resolution = resolveRecord(record, conversation)
    if (!resolution.ok) {
      seat.scrollIntoView({ block: 'center', behavior: 'instant' })
      return 'not-found'
    }
    scrollRangeIntoView(resolution.range, conversation, seat)
    if (aborted()) return 'not-found'
    // The flash is currently disabled in the painter; the call stays for a future
    // quiet effect. The landing itself is instant (no scroll animation).
    painter.flash(resolution.range)
    return 'revealed'
  } catch {
    // A reveal is an affordance, never an error path: the item stays listed and
    // the caller can surface its "could not reveal" copy.
    return 'not-found'
  }
}
