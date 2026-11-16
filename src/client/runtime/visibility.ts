/**
 * Visibility model: which surface owns the screen, and whether one session may
 * do DOM/paint work.
 *
 * Three inputs are combined:
 * 1. `ctx.layout.panelInfo.activePanelId` — `null` means the Conversation is the
 *    central panel; a non-null id means a global page is shown (with the DSH
 *    keep-alive patch the Conversation stays mounted but hidden).
 * 2. `document.visibilityState` — a background tab suspends painting.
 * 3. A DOM probe of the registered roots — a root can be detached, or hidden by
 *    an ancestor's `display:none` (the keep-alive shape). jsdom reports every
 *    rect as zero, so this probe deliberately uses computed styles and
 *    connectivity, not geometry.
 *
 * The model is environment-injectable so tests can drive panel/tab changes
 * without a live DSH shell.
 */
import type { Disposer } from '../contracts/scope'
import type { SurfaceId } from '../contracts/observation'

/** Minimal shape of `ctx.layout.panelInfo` (HostObservable<PanelInfo>). */
export interface PanelInfoLike {
  /** Current layout selection. */
  getSnapshot(): { readonly activePanelId: unknown | null }
  /** Invalidate on layout change. */
  subscribe(listener: () => void): () => void
}

/** Injection points. */
export interface VisibilityDeps {
  /** Layout selection source; absent in unit tests that only check the DOM. */
  readonly panelInfo?: PanelInfoLike
  /** Document to observe; defaults to the global one. */
  readonly document?: Document
  /** Root probe override (tests). */
  readonly elementVisible?: (element: HTMLElement) => boolean
}

/** Read-side visibility face used by the observation service. */
export interface VisibilityModel {
  /** Which surface currently owns the screen. */
  surface(): SurfaceId
  /** Whether the document/tab is visible. */
  documentVisible(): boolean
  /** Whether one session's roots are rendered and the Conversation is shown. */
  sessionVisible(roots: { readonly conversationRoot: () => HTMLElement | null; readonly transcriptRoot: () => HTMLElement | null }): boolean
  /** Recompute and notify; called by the service on registration changes too. */
  refresh(): void
  /** Observe recomputations. */
  subscribe(listener: () => void): Disposer
  /** Release DOM listeners. */
  dispose(): void
}

/**
 * Whether an element is rendered, walking ancestors for the keep-alive shape.
 * @param element - root to test.
 * @param doc - owning document.
 */
export function isElementRendered(element: HTMLElement | null, doc: Document | undefined): boolean {
  if (element === null || doc === undefined) return false
  if (!element.isConnected) return false
  const view = doc.defaultView
  let node: Element | null = element
  while (node !== null && node !== doc.documentElement) {
    if (view !== null) {
      const style = view.getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    if (node.getAttribute('aria-hidden') === 'true') return false
    node = node.parentElement
  }
  return true
}

/** Resolve the global document, tolerating non-browser evaluation. */
function resolveDocument(doc: Document | undefined): Document | undefined {
  if (doc !== undefined) return doc
  const global = globalThis as { document?: Document }
  return global.document
}

/**
 * Create the visibility model.
 * @param deps - layout source, document, and test overrides.
 */
export function createVisibilityModel(deps: VisibilityDeps = {}): VisibilityModel {
  const doc = resolveDocument(deps.document)
  const listeners = new Set<() => void>()
  /** Cached surface; recomputed on refresh. */
  let current: SurfaceId = 'conversation'
  const disposers: Disposer[] = []

  /** Notify every subscriber. */
  function notify(): void {
    for (const listener of [...listeners]) listener()
  }

  /** Compute the surface without touching listeners. */
  function computeSurface(): SurfaceId {
    if (!isDocumentVisible()) return 'hidden'
    const active = deps.panelInfo?.getSnapshot().activePanelId ?? null
    return active === null ? 'conversation' : 'page'
  }

  /** Whether the document/tab is visible. */
  function isDocumentVisible(): boolean {
    if (doc === undefined) return true
    return doc.visibilityState !== 'hidden'
  }

  /** Recompute the surface and notify (roots can change without a layout event). */
  function refresh(): void {
    current = computeSurface()
    notify()
  }

  if (deps.panelInfo !== undefined) {
    disposers.push(deps.panelInfo.subscribe(() => { refresh() }))
  }
  if (doc !== undefined && typeof doc.addEventListener === 'function') {
    const onChange = (): void => { refresh() }
    doc.addEventListener('visibilitychange', onChange)
    disposers.push(() => { doc.removeEventListener('visibilitychange', onChange) })
  }
  current = computeSurface()

  return {
    surface: () => computeSurface(),
    documentVisible: isDocumentVisible,
    sessionVisible(roots) {
      if (computeSurface() !== 'conversation') return false
      const conversation = roots.conversationRoot()
      const transcript = roots.transcriptRoot()
      const probe = deps.elementVisible ?? ((element: HTMLElement) => isElementRendered(element, doc))
      return conversation !== null && transcript !== null && probe(conversation) && probe(transcript)
    },
    refresh,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      for (const dispose of disposers) dispose()
      disposers.length = 0
      listeners.clear()
    },
  }
}
