/**
 * One app-scoped observation service: observers, visibility and paint frames.
 *
 * Replaces the per-session observer/rAF ownership that used to live in
 * `ui/SessionBridge.tsx` and the duplicate whole-body observers in the selection
 * affordance. A session registers its roots; the service watches the transcript,
 * re-attaches it across keep-alive show/hide, and schedules one coalesced paint
 * per session per frame. Everything is gated on visibility: while the
 * Conversation is hidden (a global page is open) no observer callback, paint or
 * measurement runs.
 */
import type { ObservationService, PaintReason, SurfaceId } from '../contracts/observation'
import type { SessionHandle } from '../contracts/scope'
import { count } from '../runtime/diagnostics'
import { createFrameScheduler, type FrameScheduler, type FrameSchedulerOptions } from '../runtime/scheduler'
import { createSignal, type WritableSignal } from '../runtime/signal'
import { createVisibilityModel, type PanelInfoLike, type VisibilityModel } from '../runtime/visibility'

/** What a session registration holds. */
interface Entry {
  readonly sessionId: string
  readonly conversationRoot: () => HTMLElement | null
  readonly transcriptRoot: () => HTMLElement | null
  readonly visible: WritableSignal<boolean>
  readonly active: WritableSignal<boolean>
  readonly epoch: WritableSignal<number>
  handle: SessionHandle | null
  observer: MutationObserver | null
  resizeObserver: ResizeObserver | null
  observedRoot: HTMLElement | null
  /** Bounded visibility re-checks scheduled right after registration. */
  recheckTimers: ReturnType<typeof setTimeout>[]
}

/** Injection points for tests and non-browser hosts. */
export interface ObservationServiceOptions extends FrameSchedulerOptions {
  /** `ctx.layout.panelInfo`; absent means "Conversation, tab visible". */
  readonly panelInfo?: PanelInfoLike
  /** Document to probe; defaults to the global one. */
  readonly document?: Document
  /** Root probe override (tests). */
  readonly elementVisible?: (element: HTMLElement) => boolean
}

/** Observation service plus the internal quiescence hook. */
export interface ObservationServiceHandle extends ObservationService {
  /** Set while a reveal is in flight; selection detection stands down. */
  setRevealPending(pending: boolean): void
}

/** Selector matching mutations that must never wake a repaint. */
const IGNORED_MUTATION_SELECTOR = [
  '[data-dshhl-highlight-host]',
  '[data-dshhl-card]',
  '[data-dshhl-affordance]',
  '[data-composer-seat]',
  'textarea',
  'input',
  '[contenteditable="true"]',
].join(', ')

/** Whether one node belongs to plugin-owned or composer DOM. */
function isIgnoredNode(node: Node): boolean {
  const element = node.nodeType === 1 ? node as Element : node.parentElement
  if (element === null) return false
  return element.closest(IGNORED_MUTATION_SELECTOR) !== null
}

/**
 * Whether a mutation record cannot affect highlight geometry.
 *
 * For childList records the target is the parent, so the added/removed nodes
 * must be inspected too: our own overlay host and the composer are appended to
 * the transcript and must never wake a repaint loop.
 */
function isIgnoredMutation(record: MutationRecord): boolean {
  if (isIgnoredNode(record.target)) return true
  const nodes: Node[] = [...record.addedNodes, ...record.removedNodes]
  return nodes.length > 0 && nodes.every(node => isIgnoredNode(node))
}

/**
 * Create the observation service.
 * @param options - layout/document/scheduler injection.
 */
export function createObservationService(options: ObservationServiceOptions = {}): ObservationServiceHandle {
  const doc = options.document ?? (globalThis as { document?: Document }).document
  const visibility: VisibilityModel = createVisibilityModel({
    ...(options.panelInfo === undefined ? {} : { panelInfo: options.panelInfo }),
    ...(doc === undefined ? {} : { document: doc }),
    ...(options.elementVisible === undefined ? {} : { elementVisible: options.elementVisible }),
  })
  const scheduler: FrameScheduler = createFrameScheduler({
    ...(options.schedule === undefined ? {} : { schedule: options.schedule }),
    ...(options.cancel === undefined ? {} : { cancel: options.cancel }),
  })
  const activeSurface = createSignal<SurfaceId>(visibility.surface())
  const documentVisibleSignal = createSignal(visibility.documentVisible())
  const revealPendingSignal = createSignal(false)
  const entries = new Map<string, Entry>()
  const paintListeners = new Set<(sessionId: string, epoch: number) => void>()
  let disposed = false

  const MutationObserverCtor = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver
  const ResizeObserverCtor = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver

  /** Cancel one entry's pending visibility re-checks. */
  function clearRechecks(entry: Entry): void {
    for (const timer of entry.recheckTimers) clearTimeout(timer)
    entry.recheckTimers = []
  }

  /** Re-check budget: short intervals first, then a slower loop (≈ 40 s total). */
  const RECHECK_SHORT_INTERVAL_MS = 150
  const RECHECK_SHORT_ATTEMPTS = 10
  const RECHECK_LONG_INTERVAL_MS = 500
  const RECHECK_MAX_ATTEMPTS = 90

  /**
   * Poll visibility, bounded, until the session becomes visible.
   *
   * On a cold load the bridge registers before Chat has rendered the transcript
   * root (`[data-chat-flow]` only appears after the history read), which used to
   * leave `visible=false` and the whole gesture layer uninstalled until an
   * unrelated event (audit S1; measured live: five cache-disabled loads, four of
   * them stuck). The first re-checks are frequent, then slow down; they stop as
   * soon as the roots are visible and are cleared on dispose.
   */
  function scheduleRechecks(entry: Entry): void {
    let attempts = 0
    const tick = (): void => {
      if (disposed || entries.get(entry.sessionId) !== entry) return
      if (entry.visible.get()) return
      recompute()
      attempts += 1
      if (entry.visible.get() || attempts >= RECHECK_MAX_ATTEMPTS) return
      const delay = attempts < RECHECK_SHORT_ATTEMPTS ? RECHECK_SHORT_INTERVAL_MS : RECHECK_LONG_INTERVAL_MS
      const timer = setTimeout(tick, delay)
      entry.recheckTimers.push(timer)
    }
    const first = setTimeout(tick, 0)
    entry.recheckTimers.push(first)
  }

  /** Disconnect one entry's observers. */
  function detach(entry: Entry): void {
    entry.observer?.disconnect()
    entry.observer = null
    entry.resizeObserver?.disconnect()
    entry.resizeObserver = null
    entry.observedRoot = null
  }

  /** Attach observers to the current roots (idempotent while roots are stable). */
  function attach(entry: Entry): void {
    const root = entry.transcriptRoot()
    if (root === null) {
      detach(entry)
      return
    }
    if (entry.observedRoot === root) return
    detach(entry)
    entry.observedRoot = root
    if (MutationObserverCtor !== undefined) {
      const observer = new MutationObserverCtor(records => {
        const relevant = records.filter(record => !isIgnoredMutation(record))
        if (relevant.length === 0) return
        count('observerCallbacks', relevant.length)
        requestPaint(entry.sessionId, 'mutate')
      })
      observer.observe(root, { childList: true, subtree: true, characterData: true })
      entry.observer = observer
    }
    const conversation = entry.conversationRoot()
    if (ResizeObserverCtor !== undefined && conversation !== null) {
      const resize = new ResizeObserverCtor(() => { requestPaint(entry.sessionId, 'resize') })
      resize.observe(conversation)
      entry.resizeObserver = resize
    }
  }

  /** Recompute visibility for every registered session. */
  function recompute(): void {
    if (disposed) return
    const surface = visibility.surface()
    activeSurface.set(surface)
    documentVisibleSignal.set(visibility.documentVisible())
    for (const entry of entries.values()) {
      const visible = visibility.sessionVisible({
        conversationRoot: entry.conversationRoot,
        transcriptRoot: entry.transcriptRoot,
      })
      const was = entry.visible.get()
      entry.active.set(surface === 'conversation')
      if (visible !== was) {
        entry.visible.set(visible)
        count('visibilityChanges')
        if (visible) {
          attach(entry)
          requestPaint(entry.sessionId, 'show')
        } else {
          detach(entry)
          scheduler.cancel(`paint:${entry.sessionId}`)
        }
      } else if (visible) {
        attach(entry)
      }
    }
  }

  /** Request one coalesced paint for one session. */
  function requestPaint(sessionId: string, reason: PaintReason): void {
    if (disposed) return
    const entry = entries.get(sessionId)
    if (entry === undefined) return
    if (!entry.visible.get()) {
      count('paintSkippedHidden')
      return
    }
    count('repaintRequests')
    void reason
    scheduler.request(`paint:${sessionId}`, () => {
      count('rafTicks')
      if (disposed || !entry.visible.get()) {
        count('paintSkippedHidden')
        return
      }
      count('paintPasses')
      const epoch = entry.epoch.get() + 1
      entry.epoch.set(epoch)
      for (const listener of [...paintListeners]) listener(sessionId, epoch)
    })
  }

  const unsubscribeVisibility = visibility.subscribe(() => { recompute() })

  return {
    registerSession(input) {
      if (disposed) throw new Error('observation service is disposed')
      const existing = entries.get(input.sessionId)
      if (existing !== undefined) {
        clearRechecks(existing)
        detach(existing)
        entries.delete(input.sessionId)
      }
      count('sessionRegistrations')
      const entry: Entry = {
        sessionId: input.sessionId,
        conversationRoot: input.conversationRoot,
        transcriptRoot: input.transcriptRoot,
        visible: createSignal(false),
        active: createSignal(false),
        epoch: createSignal(0),
        handle: null,
        observer: null,
        resizeObserver: null,
        observedRoot: null,
        recheckTimers: [],
      }
      const handle: SessionHandle = {
        sessionId: input.sessionId,
        conversationRoot: input.conversationRoot,
        transcriptRoot: input.transcriptRoot,
        visible: entry.visible,
        active: entry.active,
        paintEpoch: entry.epoch,
        dispose: () => {
          clearRechecks(entry)
          detach(entry)
          scheduler.cancel(`paint:${entry.sessionId}`)
          if (entries.get(entry.sessionId) === entry) entries.delete(entry.sessionId)
        },
      }
      entry.handle = handle
      entries.set(input.sessionId, entry)
      recompute()
      scheduleRechecks(entry)
      return handle
    },
    activeSurface,
    documentVisible: documentVisibleSignal,
    isVisible: sessionId => entries.get(sessionId)?.visible.get() ?? false,
    requestPaint,
    onPaintFrame(listener) {
      paintListeners.add(listener)
      return () => { paintListeners.delete(listener) }
    },
    revealPending: revealPendingSignal,
    setRevealPending(pending) {
      revealPendingSignal.set(pending)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const entry of entries.values()) {
        clearRechecks(entry)
        detach(entry)
      }
      entries.clear()
      paintListeners.clear()
      scheduler.dispose()
      unsubscribeVisibility()
      visibility.dispose()
    },
  }
}
