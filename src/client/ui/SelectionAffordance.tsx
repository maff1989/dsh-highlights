/**
 * The selection affordance (S2).
 *
 * Chat arbitrates its floating text surface by registration order: the first
 * handler that calls `open()` wins, and the shipped Quote plugin registers
 * before any profile plugin, so a second consumer cannot share that surface.
 *
 * The platform's surface always wins the primary drag/keyboard gesture, so this
 * component stands down whenever that surface is open and renders its own bar
 * only when Chat is not already offering one (the one-floating-surface rule;
 * F1).
 *
 * The right-click gesture is plugin-owned: Chat anchors a contextmenu surface at
 * the pointer by design and the plugin cannot reposition the entry it renders
 * inside it, so this component listens for `contextmenu` itself. It suppresses
 * the browser menu only over a highlightable selection whose line boxes contain
 * the point, and always keeps a way back to that menu: `Shift` + right-click and
 * the keyboard context-menu key bypass the plugin, and the bar's More menu can
 * hand the next right-click back to the browser. Every other right-click is the
 * browser's.
 *
 * A pointer selection (drag, double-click, triple-click) never opens the bar:
 * Chat's own surface owns that gesture and the bar is right-click-gated. The only
 * selection-driven path that may show it is a keyboard-extended selection, whose
 * focus is moved into the bar (the bar is portalled away from the reader's tab
 * order). The contextmenu gesture owns every other show, captures the anchor
 * synchronously while the browser selection is still live, and stands down while
 * Chat's own surface is open.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconEllipsisOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { createPortal } from 'react-dom'

import { PALETTE_SIZE } from '../../shared/constants'
import type { HighlightAnchor } from '../../shared/schema'
import { captureSelection } from '../anchor/capture'
import type { HighlightDraft } from '../data/actions'
import type { HighlightsClient } from '../data/client'
import { HighlightEditor } from './HighlightEditor'
import { conversationBoundsForRange } from '../selection/bounds'
import {
  AFFORDANCE_MENU_CLASS,
  contextMenuSource,
  isKeyboardContextMenu,
  isNativeMenuGesture,
  pointInsideRange,
  selectionIsVisible,
} from '../selection/context-menu'
import { createFloatingPositioner } from '../selection/placement'
import { isElementRendered } from '../runtime/visibility'
import type { SelectionGesture } from '../contracts/selection'
import { createSelectionGesture } from '../selection/gesture'
import { useSignalValue } from '../runtime/use-signal'

/** The minimal Chat snapshot shape used to enrich a capture with durable ids. */
interface ChatSnapshotLike {
  readonly nodes?: {
    get(key: string): {
      readonly anchorSeq?: number
      readonly data?: { readonly finalNode?: { readonly messageId?: string } }
    } | undefined
  }
}

/** One selection awaiting a decision, anchored to its live Range. */
interface PendingSelection {
  readonly anchor: HighlightAnchor
  readonly sessionId: string
  /**
   * The selected text as the browser reports it at capture time. The anchor
   * quote is capped for storage; a copy action must carry the whole selection.
   */
  readonly text: string
  /**
   * Cloned range of the selection. The bar re-reads its client rects every
   * frame, so it follows the text when the transcript scrolls or reflows just
   * like Chat's own Quote surface does.
   */
  readonly range: Range
}

/** Props of the affordance. */
export interface SelectionAffordanceProps {
  /** Namespace-bound translate function. */
  readonly t: (key: string, params?: Record<string, string | number>) => string
  /** Session that owns the transcript being read. */
  readonly sessionId: string
  /** Colour the last highlight used. */
  readonly defaultColor: () => number
  /** Tags already in use, for the editor's suggestions. */
  readonly tagSuggestions: () => readonly string[]
  /** Persist one captured selection. */
  readonly createSelection: (
    anchor: HighlightAnchor,
    sessionId: string,
    draft: HighlightDraft,
    ids: { messageId?: string; nodeSeq?: number },
  ) => void
  /** Chat snapshot, used to resolve the durable message id and sequence. */
  readonly chat: ChatSnapshotLike
  /** Record store, read for the editor's tag suggestions. */
  readonly client: HighlightsClient
  /** Copy one text to the clipboard; true when it reached it. */
  readonly copy: (text: string) => Promise<boolean>
  /** Show one app-level notice with already-localised copy. */
  readonly announce: (text: string) => void
  /** Whether this session's conversation is on screen (observers stand down when false). */
  readonly visible: boolean
  /** Whether a reveal is in flight (the app supplies the RevealPort signal). */
  readonly revealPending?: () => boolean
  /** App-scoped selection gesture (fallback created per instance in tests). */
  readonly gesture?: SelectionGesture
}

/** Toolbar footprint used for placement decisions (the CSS box is H36). */
const TOOLBAR_HEIGHT = 36

/**
 * Chat's own text-interaction surface. ChatView always renders the container
 * and flips `aria-hidden` when the surface opens — the platform's own client
 * test asserts this exact marker, and installed 0.2.2-rc.1 renders
 * `<div data-text-interaction-surface="" aria-hidden={active === null}>`.
 *
 * workaround: W2 — the platform exposes no "another selection surface is open"
 * API; this DOM marker is the interim signal that lets the plugin stand down.
 * Delete with W1 once the selection surface accepts additive children.
 */
const CHAT_SURFACE_SELECTOR = '[data-text-interaction-surface]'
/** The same container while the platform surface is open. */
const CHAT_SURFACE_OPEN_SELECTOR = `${CHAT_SURFACE_SELECTOR}[aria-hidden="false"]`

/**
 * True while Chat's own text-interaction surface is open.
 * @returns whether the platform surface currently owns the floating seat.
 */
export function isChatSurfaceOpen(): boolean {
  return document.querySelector(CHAT_SURFACE_OPEN_SELECTOR) !== null
}

/** Gap between the selection (or Chat's surface) and the toolbar. */
const GAP = 8

/** Debounce for selectionchange-driven capture. */
const SELECTION_DEBOUNCE_MS = 140

/** Marker attribute so an outside press can be told from a press on the bar. */
const BAR_ATTRIBUTE = 'data-dshhl-affordance'

/** How long a tracked physical Shift press stays trusted without a key state change. */
const SHIFT_TRACK_TTL_MS = 3_000

/** How long a browser-menu hand-back stays armed after the reader asks for it. */
const NATIVE_MENU_ARM_MS = 5_000

/** How long an arm from a Shift right-press survives when no contextmenu follows. */
const NATIVE_MENU_PRESS_ARM_MS = 1_500

/**
 * Everything this component positions itself: the bar, its portalled More menu
 * (a press there is interaction, not an outside press), and the item card.
 */
const OWN_SURFACE_SELECTOR = `[${BAR_ATTRIBUTE}], .${AFFORDANCE_MENU_CLASS}`

/**
 * Render the floating highlight action for a text selection.
 * @param props - copy, colour state, the save callback, Chat snapshot, clipboard
 * and notice callbacks, and the reveal/visibility gates.
 * @returns a portal while a highlightable selection exists, else null.
 */
export function SelectionAffordance({ t, sessionId, defaultColor, tagSuggestions, createSelection, chat, client, copy, announce, visible, revealPending, gesture: injectedGesture }: SelectionAffordanceProps): ReactNode {
  const revealProbe = useRef(revealPending)
  revealProbe.current = revealPending
  /**
   * Stable reveal probe: a parent re-render hands over a new function identity,
   * and an unstable dependency here would tear down and re-register the whole
   * gesture listener set on every bridge render (audit §3.5).
   */
  const isRevealPending = useCallback((): boolean => revealProbe.current?.() === true, [])
  // Stable fallback gesture for direct unit rendering: a prop function is often
  // re-created every render, and a new gesture would reset the reducer each time.
  const fallbackGesture = useMemo(
    () => createSelectionGesture({ revealPending: () => isRevealPending() }),
    [isRevealPending],
  )
  const gesture = injectedGesture ?? fallbackGesture
  const selectionState = useSignalValue(gesture.state)
  const pending = selectionState.candidate as unknown as PendingSelection | null
  const editing = selectionState.phase === 'editing'
  const pendingRef = useRef<PendingSelection | null>(null)
  /** True between pointerdown and pointerup: the reader is still dragging. */
  const dragging = useRef(false)
  /** Measured size of the rendered bar, needed for side-by-side placement. */
  const barRef = useRef<HTMLDivElement | null>(null)
  /** Shared, diffed positioner (one owner for bar + card). */
  const positioner = useMemo(() => createFloatingPositioner(), [])
  /**
   * True while Chat's own text-interaction surface is open. The platform owns
   * the floating seat for that gesture, so the plugin renders no bar beside it.
   */
  const [chatSurfaceOpen, setChatSurfaceOpen] = useState(false)
  /** True while the bar's More menu is open (it closes a layer at a time). */
  const [menuOpen, setMenuOpen] = useState(false)
  /** Synchronous view of `menuOpen` for document-level key/pointer listeners. */
  const menuOpenRef = useRef(false)
  menuOpenRef.current = menuOpen
  /**
   * One-shot browser-menu hand-back, armed by the More menu: the next
   * right-click belongs to the browser even though it is over a selection.
   */
  const nativeMenuOnce = useRef(false)
  /** Timer that disarms a hand-back the reader did not follow up on. */
  const nativeMenuTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /**
   * Debounce timer for selectionchange-driven capture. It is a ref so a
   * browser-menu gesture can cancel pending detection, not a closure inside the
   * listener effect (audit S2: a timer firing after a bypass resurrected the bar
   * beside the native menu).
   */
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /**
   * True while the browser's own menu owns the current interaction. Any pending
   * detection is cancelled when this becomes true, and `show()` refuses while it
   * holds, so a dismissed bar cannot be resurrected by a queued callback.
   */
  const browserGesture = useRef(false)
  /** True when the current selection was extended with the keyboard. */
  const keyboardCapture = useRef(false)
  /** Set when the next bar show should move focus into the bar (F5). */
  const focusAfterShow = useRef(false)
  /**
   * Selection identity when the current Shift press began. A Shift release only
   * counts as a keyboard selection when it changed: releasing Shift after a
   * Shift + right-click hand-back must not surface the bar the hand-back avoided.
   */
  const shiftStart = useRef<string | null>(null)
  /**
   * True while Shift is physically held, tracked from the keyboard because a
   * macOS trackpad secondary click by tap (rather than a physical press) can
   * arrive without the modifier on its pointer/mouse/contextmenu events even
   * though the reader is holding Shift.
   */
  const shiftHeld = useRef(false)
  /** Disarms a tracked Shift press the platform never delivered a keyup for. */
  const shiftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /**
   * True when the event target belongs to this component's own floating surface
   * (bar, editor, or the portalled More menu). A press on our own controls is
   * interaction with the editor, not a new selection gesture.
   * @param target - event target of the browser event.
   * @returns whether the target is inside the bar/editor/menu.
   */
  const isInsideOwnSurface = useCallback((target: EventTarget | null): boolean => {
    const element = target instanceof Element ? target : null
    return element !== null && element.closest(OWN_SURFACE_SELECTOR) !== null
  }, [])

  /**
   * True while keyboard focus sits on a control of this component's own
   * surface. Text fields inside the bar collapse the document selection when
   * they take focus, so every detection path must exempt this case.
   * @returns whether focus is inside the bar/editor/menu.
   */
  const focusInsideOwnSurface = useCallback((): boolean => {
    const active = document.activeElement
    return active instanceof Element && active.closest(OWN_SURFACE_SELECTOR) !== null
  }, [])

  /** Synchronous view of the editor phase for the contextmenu decision. */
  const editingRef = useRef(editing)
  editingRef.current = editing

  /** Keep the ref in step with the gesture-owned state. */
  useEffect(() => { pendingRef.current = pending }, [pending])

  /**
   * This bridge session's conversation root element.
   * @returns the element, or null when the conversation is not mounted.
   */
  const conversationRoot = useCallback((): HTMLElement | null => {
    for (const element of document.querySelectorAll<HTMLElement>('[data-conversation-session]')) {
      if (element.dataset.conversationSession === sessionId) return element
    }
    return null
  }, [sessionId])

  /** Feed one capture (or a dismiss) into the single state owner. */
  const update = useCallback((next: PendingSelection | null) => {
    if (next === null) gesture.dismiss('surface-lost')
    else gesture.dispatch({ type: 'input', candidate: next as never })
  }, [gesture])

  /** Dismiss without saving. */
  const close = useCallback(() => { gesture.dismiss('surface-lost') }, [gesture])

  /** Dismiss because the reader asked. */
  const closeByUser = useCallback(() => { gesture.dismiss('outside-press') }, [gesture])

  /** Disarm a pending browser-menu hand-back. */
  const clearNativeMenuOnce = useCallback((): void => {
    nativeMenuOnce.current = false
    if (nativeMenuTimer.current !== undefined) {
      clearTimeout(nativeMenuTimer.current)
      nativeMenuTimer.current = undefined
    }
  }, [])

  /** Cancel every queued detection (the debounced keyboard capture). */
  const cancelPendingDetection = useCallback((): void => {
    if (debounceTimer.current !== undefined) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = undefined
    }
  }, [])

  /**
   * Hand the current interaction to the browser's own menu: cancel pending
   * detection, stop treating the press as a drag, and refuse to show a bar until
   * the next primary press.
   */
  const beginBrowserGesture = useCallback((): void => {
    browserGesture.current = true
    dragging.current = false
    cancelPendingDetection()
  }, [cancelPendingDetection])

  /** Clear the tracked Shift state and its TTL. */
  const clearShiftHeld = useCallback((): void => {
    shiftHeld.current = false
    if (shiftTimer.current !== undefined) {
      clearTimeout(shiftTimer.current)
      shiftTimer.current = undefined
    }
  }, [])

  /**
   * Flip the tracked Shift state from the keyboard.
   * @param held - whether the physical key is now down.
   */
  const setShiftHeld = useCallback((held: boolean): void => {
    shiftHeld.current = held
    if (shiftTimer.current !== undefined) {
      clearTimeout(shiftTimer.current)
      shiftTimer.current = undefined
    }
    if (!held) return
    // A swallowed keyup (native menu, app switch) must not leave every later
    // right-click routed to the browser menu: the track expires on its own.
    shiftTimer.current = setTimeout(() => {
      shiftTimer.current = undefined
      shiftHeld.current = false
    }, SHIFT_TRACK_TTL_MS)
  }, [])

  /**
   * Arm the one-shot browser-menu hand-off: the next contextmenu belongs to the
   * browser, whether or not the platform reports the modifier on that event.
   * @param ttlMs - how long the arm survives when no contextmenu follows.
   */
  const armNativeMenu = useCallback((ttlMs = NATIVE_MENU_ARM_MS): void => {
    nativeMenuOnce.current = true
    if (nativeMenuTimer.current !== undefined) clearTimeout(nativeMenuTimer.current)
    nativeMenuTimer.current = setTimeout(() => {
      nativeMenuOnce.current = false
      nativeMenuTimer.current = undefined
    }, ttlMs)
  }, [])

  /** Capture the live selection; returns null when it is out of scope. */
  const read = useCallback((): PendingSelection | null => {
    const selection = window.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null
    const candidate = captureSelection(selection)
    if (candidate === null) return null
    const range = selection.getRangeAt(0).cloneRange()
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
    if (rects.length === 0) return null
    return {
      anchor: candidate.anchor,
      sessionId,
      text: selection.toString(),
      range,
    }
  }, [sessionId])

  /**
   * Identity of the live highlightable selection, for keyboard-gesture bookkeeping.
   * @returns a stable key, or null when nothing highlightable is selected.
   */
  const liveSelectionSignature = useCallback((): string | null => {
    const selection = window.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null
    const candidate = captureSelection(selection)
    if (candidate === null) return null
    const { nodeKey, start, end } = candidate.anchor
    return `${nodeKey}|${String(start)}|${String(end)}`
  }, [])

  /**
   * Show the bar for a captured selection, unless Chat's own surface already
   * owns the gesture.
   * @param next - the synchronously captured selection.
   */
  const show = useCallback((next: PendingSelection | null): void => {
    // A queued detection must not resurrect the bar after the browser menu took
    // the gesture (audit S2: dismissed bar reappearing beside the native menu).
    if (browserGesture.current) return
    if (next === null || isChatSurfaceOpen()) {
      update(null)
      return
    }
    update(next)
  }, [update])

  /**
   * Capture the selection and show or hide the bar.
   *
   * The only detection path that reaches here is the keyboard-extended one; a
   * pointer selection never opens the bar by itself (the bar is right-click-gated
   * and Chat's own surface owns the plain-selection seat). This is also the
   * single place that refuses to treat interaction with our own editor as a
   * gesture: focusing a text field collapses the document selection, and a stale
   * callback must not interpret that as "dismiss".
   */
  const captureNow = useCallback((): void => {
    if (focusInsideOwnSurface()) return
    // Consume the keyboard intent here: the show path must not lose it when the
    // capture takes a frame to render.
    focusAfterShow.current = keyboardCapture.current
    keyboardCapture.current = false
    show(read())
  }, [focusInsideOwnSurface, read, show])

  /**
   * Claim the right-click gesture only when it is unambiguously about a
   * highlightable selection, and keep a way back to the browser menu otherwise.
   *
   * The listener runs in the capture phase so it sees the event before Chat's
   * own bubble-phase handler and before React's synthetic link/chip handlers.
   * @param event - the contextmenu event.
   */
  const captureContextMenu = useCallback((event: MouseEvent): void => {
    if (event.defaultPrevented) return
    // Chat's own selection surface owns the gesture while it is open (W2).
    if (isChatSurfaceOpen()) return
    // Interaction with our own bar/editor/menu is not a new gesture.
    if (isInsideOwnSurface(event.target)) return
    // The reader already asked for the browser menu: this right-click is its own.
    if (nativeMenuOnce.current) {
      clearNativeMenuOnce()
      beginBrowserGesture()
      closeByUser()
      return
    }
    // Shift+right-click and the keyboard context-menu key are never intercepted.
    // They dismiss the bar first: a press outside the bar is an outside press
    // even when a control of the bar still holds keyboard focus. The tracked
    // Shift state covers synthesized secondary clicks that omit the modifier.
    if (isNativeMenuGesture(event) || shiftHeld.current || isKeyboardContextMenu(event)) {
      beginBrowserGesture()
      clearShiftHeld()
      closeByUser()
      return
    }
    // An open editor owns the gesture until it is dismissed with it: a press
    // outside the bar never becomes a new capture on the same bar, which would
    // drop the untitled draft.
    if (editingRef.current) {
      beginBrowserGesture()
      closeByUser()
      return
    }
    if (isRevealPending()) return
    // Anything outside this session's reply text keeps the browser menu.
    if (contextMenuSource(event, sessionId) === null) {
      beginBrowserGesture()
      closeByUser()
      return
    }
    const next = read()
    if (next === null || !pointInsideRange(next.range, event.clientX, event.clientY) || !selectionIsVisible(next.range)) {
      beginBrowserGesture()
      closeByUser()
      return
    }
    // Own the gesture: without this the browser/OS menu covers the bar. A claim
    // supersedes any earlier browser intent and cancels queued detection.
    browserGesture.current = false
    cancelPendingDetection()
    event.preventDefault()
    show(next)
  }, [beginBrowserGesture, cancelPendingDetection, clearNativeMenuOnce, closeByUser, isInsideOwnSurface, isRevealPending, read, sessionId, show])

  // Path 1 and 2: pointerup in the capture phase, plus a debounced
  // selectionchange for keyboard selection and any drag we never see end.
  // Also the plugin-owned contextmenu gesture (S2).
  // A hidden conversation installs nothing: there is nothing to select on it.
  useEffect(() => {
    // Installed for the lifetime of the mounted bridge. The visibility signal is
    // not a reliable mount-time fact (cold load measured it false while the
    // transcript was rendered), so gesture admission is decided per event from
    // the DOM (`isElementRendered` in `read`, `contextMenuSource`).
    const onPointerDownStart = (): void => { dragging.current = true }
    const onPointerUp = (): void => {
      // A pointer selection never opens the bar: the bar is right-click-gated, so
      // ending the drag suppression is all this path does.
      dragging.current = false
      if (debounceTimer.current !== undefined) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = undefined
      }
    }
    const onPointerCancel = (): void => {
      // A cancelled gesture (touch scroll, browser interruption) never produces
      // a pointerup; without this the dragging flag would suppress every later
      // detection path until the next click.
      dragging.current = false
      cancelPendingDetection()
    }
    const onSelectionChange = (): void => {
      // A reveal in flight remounts the transcript; reading the selection now
      // would force a layout of the half-mounted conversation for a gesture the
      // reader cannot be making. Detection resumes when the reveal returns.
      if (isRevealPending()) return
      const selection = window.getSelection()
      if (selection === null || selection.isCollapsed) {
        // Focusing a field inside the bar collapses the document selection; that
        // is interaction with us, not a new gesture, so the bar stays.
        if (focusInsideOwnSurface()) return
        keyboardCapture.current = false
        cancelPendingDetection()
        close()
        return
      }
      if (debounceTimer.current !== undefined) clearTimeout(debounceTimer.current)
      if (dragging.current || browserGesture.current) return
      // Only a keyboard-extended selection opens the bar from a selection change.
      // Pointer selections are right-click-gated, and a block selection
      // (triple-click) must not pop the bar.
      if (!keyboardCapture.current) return
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = undefined
        captureNow()
      }, SELECTION_DEBOUNCE_MS)
    }
    const onMouseDown = (event: MouseEvent): void => {
      // A trackpad "tap" secondary click can skip pointerdown; the mouse event is
      // the only press signal then, and it may omit the Shift modifier too.
      if (event.button !== 2 || isInsideOwnSurface(event.target)) return
      dragging.current = false
      if (!(event.shiftKey || shiftHeld.current)) return
      beginBrowserGesture()
      armNativeMenu(NATIVE_MENU_PRESS_ARM_MS)
      clearShiftHeld()
      closeByUser()
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (!(event.shiftKey || event.key === 'Shift')) return
      if (event.key === 'Shift') {
        setShiftHeld(false)
        const started = shiftStart.current
        shiftStart.current = null
        // A Shift press that changed nothing — including the Shift released
        // after a Shift + right-click hand-back — carries no selection gesture.
        if (started !== null && liveSelectionSignature() === started) return
      }
      // A keyboard-extended selection has no pointer gesture to place focus:
      // move focus into the bar once it renders (F5).
      keyboardCapture.current = true
      onSelectionChange()
    }
    const onPointerDown = (event: PointerEvent): void => {
      keyboardCapture.current = false
      // Every press starts a new interaction: drop queued detection and any
      // previous browser intent before deciding what this press is.
      cancelPendingDetection()
      browserGesture.current = false
      // A right/middle press is the contextmenu path's decision: it may claim
      // the selection, hand the gesture back to the browser, or dismiss.
      if (event instanceof MouseEvent && event.button !== 0) {
        // The secondary press itself never counts as a drag: if the platform's
        // menu swallows the matching pointerup, a stuck `dragging` flag would
        // silently disable every later detection path (audit S3).
        dragging.current = false
        // Shift + right-press is the browser's menu. Some platforms (Firefox on
        // macOS) open that menu from the press and deliver no usable modifier on
        // the contextmenu event, so own the decision here: dismiss the bar before
        // the menu opens and arm the hand-off for the event if it does arrive.
        if (event.button === 2 && (event.shiftKey || shiftHeld.current) && !isInsideOwnSurface(event.target)) {
          beginBrowserGesture()
          armNativeMenu(NATIVE_MENU_PRESS_ARM_MS)
          clearShiftHeld()
          closeByUser()
        }
        return
      }
      // A primary press is the authoritative modifier reading: if the reader is
      // not holding Shift for a real click, a swallowed Shift keyup cannot leave
      // the bypass armed for the next right-click.
      setShiftHeld(event.shiftKey)
      clearNativeMenuOnce()
      if (isInsideOwnSurface(event.target)) return
      closeByUser()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Shift') {
        setShiftHeld(true)
        shiftStart.current = liveSelectionSignature()
      } else if (!event.shiftKey) {
        // A trusted keydown without Shift means the physical modifier is up even
        // if its keyup was consumed by a native menu or an app switch.
        setShiftHeld(false)
      }
      if (event.key !== 'Escape') return
      // The More menu is a layer above the bar: it closes itself for this press.
      if (menuOpenRef.current) return
      cancelPendingDetection()
      closeByUser()
    }
    const onWindowBlur = (): void => {
      setShiftHeld(false)
      beginBrowserGesture()
      closeByUser()
    }
    document.addEventListener('pointerdown', onPointerDownStart, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('pointercancel', onPointerCancel, true)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('contextmenu', captureContextMenu, true)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      document.removeEventListener('pointerdown', onPointerDownStart, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerCancel, true)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('contextmenu', captureContextMenu, true)
      window.removeEventListener('blur', onWindowBlur)
      cancelPendingDetection()
      clearShiftHeld()
      if (nativeMenuTimer.current !== undefined) {
        clearTimeout(nativeMenuTimer.current)
        nativeMenuTimer.current = undefined
      }
    }
  }, [armNativeMenu, beginBrowserGesture, cancelPendingDetection, captureNow, captureContextMenu, clearNativeMenuOnce, clearShiftHeld, close, closeByUser, focusInsideOwnSurface, isInsideOwnSurface, isRevealPending, liveSelectionSignature, setShiftHeld])

  // Path 3: Chat's own text-interaction surface opening is the platform's
  // answer to the gesture. While it is open it owns the only floating seat, so
  // the plugin's bar stands down (the F1 two-bar defect). The same observer
  // dismisses a pending capture when the conversation stops being rendered
  // (a global page opened over the keep-alive transcript): the visibility signal
  // is not reliable enough for that, so the DOM is checked directly.
  // workaround: W2 — observation on the platform's `aria-hidden` marker.
  useEffect(() => {
    const sync = (): void => {
      const open = isChatSurfaceOpen()
      setChatSurfaceOpen(open)
      if (open && pendingRef.current !== null) {
        close()
        return
      }
      if (pendingRef.current !== null) {
        // Dismiss only when the mounted conversation stops being rendered: a
        // transiently missing root (unmount/remount) is handled by the session
        // effect, and a bar for a not-yet-mounted root must not disappear.
        const root = conversationRoot()
        if (root !== null && !isElementRendered(root, document)) {
          cancelPendingDetection()
          close()
        }
      }
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden', 'style', 'class'] })
    sync()
    return () => { observer.disconnect() }
  }, [cancelPendingDetection, close, conversationRoot])

  // A hidden conversation has no listeners to dismiss a bar with: drop the
  // pending capture instead of leaving a rendered bar that nothing owns
  // (audit S4).
  useEffect(() => {
    if (visible) return
    cancelPendingDetection()
    close()
  }, [cancelPendingDetection, close, visible])

  // A session switch invalidates the capture and any armed hand-back (its ids
  // belong elsewhere).
  useEffect(() => {
    clearNativeMenuOnce()
    setMenuOpen(false)
    close()
  }, [clearNativeMenuOnce, close, sessionId])

  // The bar owns no menu once it is gone: re-showing it must not reopen a stale
  // menu that a dismissal closed underneath it.
  useEffect(() => {
    if (pending === null) setMenuOpen(false)
  }, [pending])

  /** Durable ids resolved from the Chat snapshot, best effort. */
  const durableIds = (): { messageId?: string; nodeSeq?: number } => {
    if (pending === null) return {}
    const node = chat.nodes?.get(pending.anchor.nodeKey)
    if (node === undefined) return {}
    return {
      ...(node.data?.finalNode?.messageId === undefined ? {} : { messageId: node.data.finalNode.messageId }),
      ...(node.anchorSeq === undefined ? {} : { nodeSeq: node.anchorSeq }),
    }
  }

  /** Save and dismiss. */
  const save = (draft: HighlightDraft): void => {
    if (pending === null) return
    const ids = durableIds()
    createSelection(
      {
        ...pending.anchor,
        ...(ids.messageId === undefined ? {} : { messageId: ids.messageId }),
        ...(ids.nodeSeq === undefined ? {} : { nodeSeq: ids.nodeSeq }),
      },
      pending.sessionId,
      draft,
      ids,
    )
    window.getSelection()?.removeAllRanges()
    gesture.dispatch({ type: 'saved' })
  }

  /**
   * Place the rendered bar directly on the DOM.
   *
   * Measuring in a layout effect and writing `style` (instead of rendering from
   * a size state) means the first paint already uses the real width/height; no
   * fallback-size frame is shown, and Chat moving its own surface is followed.
   */
  const positionBar = useCallback(() => {
    const bar = barRef.current
    if (bar === null || pending === null) return
    let rects: DOMRect[] = []
    try {
      rects = [...pending.range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
    } catch {
      rects = []
    }
    if (rects.length === 0) {
      // The selected text scrolled out of view: hide the bar, but keep the
      // pending selection so scrolling back brings it back.
      positioner.hide(bar)
      return
    }
    // Measure the natural size; a previous constrained pass may have clipped it.
    bar.style.maxHeight = ''
    bar.style.overflowY = ''
    const measured = bar.getBoundingClientRect()
    const width = measured.width > 0 ? measured.width : 210
    const height = measured.height > 0 ? measured.height : TOOLBAR_HEIGHT
    const bounds = conversationBoundsForRange(pending.range)
    positioner.place({ element: bar, rects, bounds, width, height })
  }, [pending, positioner])

  // Position before paint; follow Chat's surface on scroll/resize only, never per frame.
  useLayoutEffect(() => { positionBar() }, [positionBar])
  useEffect(() => {
    if (pending === null || !visible) return
    let frame: number | undefined
    const schedule = (): void => {
      // A portalled menu cannot follow a bar that moves with the transcript.
      if (menuOpenRef.current) setMenuOpen(false)
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        positionBar()
      })
    }
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (frame !== undefined) cancelAnimationFrame(frame)
      const bar = barRef.current
      if (bar !== null) positioner.forget(bar)
    }
  }, [pending, positionBar, positioner, visible])

  // The bar is portalled to the end of <body>, so a keyboard reader would have
  // to tab through the whole document to reach it. A selection extended with
  // the keyboard therefore moves focus into the bar when it appears; pointer
  // gestures leave focus where the reader put it (F5).
  useLayoutEffect(() => {
    if (pending === null) {
      focusAfterShow.current = false
      return
    }
    if (!focusAfterShow.current) return
    focusAfterShow.current = false
    barRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [pending])

  // Chat's own surface owns this gesture (no second floating surface), a hidden
  // conversation renders nothing (its listeners are gone), and another
  // session's pending capture is never drawn in this bridge (audit S4/S5).
  if (pending === null || chatSurfaceOpen || pending.sessionId !== sessionId) return null

  const palette = Array.from({ length: PALETTE_SIZE }, (_, index) => index + 1)
  /** The bar's More menu: the native actions worth keeping, and the way back. */
  const menuItems: readonly MenuEntry[] = [
    { id: 'copy', label: t('action.copySelection') },
    { type: 'separator', id: 'divider' },
    { id: 'browserMenu', label: t('action.browserMenu') },
    { type: 'label', id: 'shortcut', text: t('hint.browserMenuShortcut') },
  ]
  /** Copy the selected text; a refused copy is a notice, never a throw. */
  const copySelection = async (): Promise<void> => {
    const copied = await copy(pending.text.length > 0 ? pending.text : pending.anchor.quote)
    if (!copied) announce(t('action.copyFailed'))
  }
  /**
   * Handle one More-menu row.
   * @param id - the selected row id.
   */
  const onMenuSelect = (id: string): void => {
    setMenuOpen(false)
    if (id === 'copy') {
      void copySelection()
      return
    }
    if (id === 'browserMenu') {
      // Hand the next right-click back to the browser: no page can open the
      // browser's own context menu on demand.
      armNativeMenu()
      announce(t('hint.browserMenuPending'))
      close()
    }
  }

  return createPortal(
    <div
      {...{ [BAR_ATTRIBUTE]: '' }}
      ref={barRef}
      onPointerDown={event => {
        const target = event.target instanceof Element ? event.target : null
        if (target?.closest('input, textarea') != null) return
        event.preventDefault()
      }}
      className="dshhl-affordance"
      style={{ position: 'fixed', top: 0, left: 0, zIndex: 6, visibility: 'hidden' }}
    >
      {editing ? (
        <HighlightEditor
          t={t}
          titleKey="editor.title"
          quote={pending.anchor.quote}
          initial={{ colorId: defaultColor() as 1 | 2 | 3 | 4 | 5, tags: [], note: undefined, starred: false }}
          tagSuggestions={tagSuggestions()}
          onSave={save}
          onCancel={close}
        />
      ) : (
        <div className="dshhl-surface" role="toolbar" aria-label={t('action.annotate')}>
          <div className="dshhl-swatches" role="group" aria-label={t('editor.color')}>
            {palette.map(slot => (
              <button
                key={slot}
                type="button"
                className={`dshhl-swatch${defaultColor() === slot ? ' dshhl-swatch--selected' : ''}`}
                style={{ background: `var(--dsh-hl-${String(slot)})` }}
                aria-label={t(`color.${String(slot)}`)}
                onClick={() => {
                  save({ colorId: slot, tags: [], note: undefined, starred: false })
                }}
              />
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={() => { setMenuOpen(false); gesture.dispatch({ type: 'edit' }) }}>
            {t('action.annotate')}
          </Button>
          <Menu
            open={menuOpen}
            onClose={() => { setMenuOpen(false) }}
            align="end"
            side="top"
            portal
            listClassName={AFFORDANCE_MENU_CLASS}
            items={menuItems}
            onSelect={onMenuSelect}
            anchor={(
              <Button
                variant="ghost"
                size="sm"
                className="dshhl-icon-button"
                aria-label={t('status.menu')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                icon={<IconEllipsisOutlineRegular size={15} />}
                onClick={() => { setMenuOpen(open => !open) }}
              />
            )}
          />
        </div>
      )}
    </div>,
    document.body,
  )
}
