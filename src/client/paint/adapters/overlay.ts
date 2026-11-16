/**
 * The plugin's in-transcript fill layer.
 *
 * Two visual languages share one overlay:
 * - a **text highlight** is a marker drawn per line-box around the selected
 *   characters (`kind:'text'`);
 * - a **whole-message mark** is one rounded band behind the reply (`kind:'message'`),
 *   so a marked reply reads as "bookmarked" instead of looking like every
 *   character had been selected.
 *
 * The CSS Custom Highlight API paints text but supports no border-radius or
 * padding, so both are drawn here. The layer lives in a zero-height positioning
 * host **inside** the transcript scroller, so its boxes are ordinary scroll
 * content: they move with the text on the compositor instead of chasing it from
 * a fixed overlay (which visibly lagged by a frame). Geometry is recomputed when
 * the transcript mutates, when the viewport resizes, and on bridge repaint.
 */
import { authorOf } from '../../../shared/provenance'
import type { HighlightRecord } from '../../../shared/schema'

/** Extra breathing room around each text line box. */
const PADDING_PX = 1.5

/** Breathing room around a whole-message band, so it reads as a block. */
const BAND_PADDING_PX = 5

/** Attribute marking the plugin-owned layer. */
const LAYER_ATTRIBUTE = 'data-dshhl-highlight-layer'

/**
 * Write one inline style only when it changes.
 *
 * A transcript mutation repaints every record, but usually only one or two
 * boxes actually moved. Reading `element.style` is layout-free, so comparing
 * first avoids needless style invalidations on streaming transcripts.
 * @param element - the box/band element.
 * @param property - CSS property name.
 * @param value - desired value.
 */
function writeStyle(element: HTMLElement, property: string, value: string): void {
  if (element.style.getPropertyValue(property) === value) return
  element.style.setProperty(property, value)
}

/**
 * Write one attribute only when it changes (the same diff discipline as styles).
 * @param element - the box/band element.
 * @param name - attribute name.
 * @param value - desired value, or undefined to remove the attribute.
 */
function writeAttribute(element: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined) {
    if (!element.hasAttribute(name)) return
    element.removeAttribute(name)
    return
  }
  if (element.getAttribute(name) === value) return
  element.setAttribute(name, value)
}

/** Line-box rectangles of a range, or none when layout is unavailable. */
function boxesOf(range: Range): DOMRect[] {
  try {
    if (typeof range.getClientRects !== 'function') return []
    return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
  } catch {
    return []
  }
}

/** One record with the geometry measured for a single paint pass. */
interface MeasuredRecord {
  readonly record: HighlightRecord
  readonly rects: readonly DOMRect[]
}

/** One overlay entry: only what the DOM pass needs. */
export interface OverlayEntry {
  readonly id: string
  readonly kind: 'text' | 'message'
  readonly colorId: number
  /** Provenance: agent marks get the marked variant of the same wash. */
  readonly author: 'user' | 'agent'
  readonly range: Range
}

/** Owns the overlay layer for the on-screen Session. */
export class HighlightOverlay {
  private host: HTMLDivElement | undefined
  private layer: HTMLDivElement | undefined
  private scroller: HTMLElement | undefined
  private entries: readonly OverlayEntry[] = []
  private frame: number | undefined
  /** Reused line boxes per record, so a repaint only touches changed geometry. */
  private readonly boxes = new Map<string, HTMLDivElement[]>()
  /** One band per whole-message mark. */
  private readonly bands = new Map<string, HTMLDivElement>()
  /** Re-render when the transcript's box changes size (pane/sidebar toggles). */
  private resizeObserver: ResizeObserver | undefined

  /** Reflow is a layout change (viewport width), unlike scroll. */
  private readonly onResize = (): void => { this.schedule() }

  /**
   * Replace the boxes for one paint pass.
   * @param records - records with resolved ranges.
   * @param ranges - resolved range per record id.
   */
  sync(records: readonly HighlightRecord[], ranges: ReadonlyMap<string, Range>): void {
    this.syncEntries(records.flatMap(record => {
      const range = ranges.get(record.id)
      return range === undefined
        ? []
        : [{ id: record.id, kind: record.anchor.kind, colorId: record.colorId, author: authorOf(record), range }]
    }))
  }

  /**
   * Replace the boxes from already-resolved entries (the decoration pipeline's
   * adapter path). The pipeline owns resolution; this class owns measurement and
   * the two-phase write.
   * @param entries - resolved decorations for one session.
   */
  syncEntries(entries: readonly OverlayEntry[]): void {
    this.entries = entries
    this.ensureLayer()
    this.render()
  }

  /** Repaint after a resize without resolving again. */
  private schedule(): void {
    if (this.frame !== undefined) return
    const view = (globalThis as { window?: Window }).window
    if (view === undefined) return
    this.frame = view.requestAnimationFrame(() => {
      this.frame = undefined
      this.ensureLayer()
      this.render()
    })
  }

  /** Find the transcript scroller and mount the positioning host inside it. */
  private ensureLayer(): void {
    const document = (globalThis as { document?: Document }).document
    if (document === undefined) return
    const scroller = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scroller === null) {
      this.detach()
      return
    }
    if (scroller !== this.scroller || this.host?.isConnected !== true) {
      this.detach()
      this.scroller = scroller
      const host = document.createElement('div')
      host.className = 'dshhl-highlight-host'
      host.setAttribute('data-dshhl-highlight-host', '')
      host.setAttribute('aria-hidden', 'true')
      const layer = document.createElement('div')
      layer.className = 'dshhl-highlight-layer'
      layer.setAttribute(LAYER_ATTRIBUTE, '')
      host.append(layer)
      // Prepending keeps the host at the scroll-content origin, so its
      // absolute children use content coordinates and scroll natively.
      scroller.prepend(host)
      this.host = host
      this.layer = layer
      this.boxes.clear()
      this.bands.clear()
      document.defaultView?.addEventListener('resize', this.onResize)
      // The right-hand panel expanding/collapsing reflows the transcript without
      // resizing the window; observe the real boxes so geometry is re-measured.
      const ResizeObserverCtor = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
      if (ResizeObserverCtor !== undefined) {
        const observer = new ResizeObserverCtor(() => { this.schedule() })
        observer.observe(scroller)
        const flow = document.querySelector<HTMLElement>('[data-chat-flow]')
        if (flow !== null && flow !== scroller) observer.observe(flow)
        this.resizeObserver = observer
      }
    }
  }

  /**
   * Draw text line-boxes and whole-message bands in content space.
   *
   * Measurement and DOM writes are split into two passes on purpose. Creating a
   * box or writing its geometry invalidates layout, so a `getClientRects()`
   * call made after one forces the browser to re-lay out the whole mounted
   * transcript. A reveal mounts the conversation, and on a long conversation a
   * single full layout costs hundreds of milliseconds, so the read/write loop
   * this replaced froze the GUI for seconds per paint (measured: ~285 ms per
   * record, ~2.5 s for the eight records of one session) and grew with every
   * turn the reveal paged in. Reading every range before touching the DOM means
   * a paint pays at most the one layout the browser needs for its own paint.
   */
  private render(): void {
    if (this.layer === undefined || this.scroller === undefined) return
    if (this.host?.isConnected !== true) {
      this.ensureLayer()
      if (this.layer === undefined) return
    }
    const layer = this.layer
    // Pass 1 — measure. No element is created, attached or styled until every
    // read below is finished.
    const origin = layer.getBoundingClientRect()
    const measured: { readonly entry: OverlayEntry; readonly rects: readonly DOMRect[] }[] = []
    for (const entry of this.entries) {
      measured.push({ entry, rects: boxesOf(entry.range) })
    }
    // Pass 2 — apply the measurements.
    const seenText = new Set<string>()
    const seenMessage = new Set<string>()
    for (const { entry, rects } of measured) {
      if (entry.kind === 'message') {
        this.renderBand(entry, rects, origin)
        seenMessage.add(entry.id)
        continue
      }
      seenText.add(entry.id)
      let elements = this.boxes.get(entry.id)
      if (elements === undefined) {
        elements = []
        this.boxes.set(entry.id, elements)
      }
      let used = 0
      for (const box of rects) {
        let element = elements[used]
        if (element === undefined) {
          element = document.createElement('div')
          element.className = 'dshhl-highlight-box'
          layer.append(element)
          elements.push(element)
        }
        writeStyle(element, 'left', `${String(box.left - origin.left - PADDING_PX)}px`)
        writeStyle(element, 'top', `${String(box.top - origin.top - PADDING_PX)}px`)
        writeStyle(element, 'width', `${String(box.width + PADDING_PX * 2)}px`)
        writeStyle(element, 'height', `${String(box.height + PADDING_PX * 2)}px`)
        writeStyle(element, 'background', `var(--dsh-hl-${String(entry.colorId)})`)
        used += 1
      }
      while (elements.length > used) elements.pop()?.remove()
    }
    for (const [id, elements] of this.boxes) {
      if (seenText.has(id)) continue
      for (const element of elements) element.remove()
      this.boxes.delete(id)
    }
    for (const [id, element] of this.bands) {
      if (seenMessage.has(id)) continue
      element.remove()
      this.bands.delete(id)
    }
  }

  /**
   * Draw one whole-message mark as a single rounded band.
   * The band spans the union of the range's line boxes plus a small margin, so
   * it reads as a marked block rather than a character-level selection.
   * @param entry - the message-marked entry.
   * @param rects - its already-measured line boxes (empty when unresolved).
   * @param origin - content-space origin of the overlay layer.
   */
  private renderBand(entry: OverlayEntry, rects: readonly DOMRect[], origin: DOMRect): void {
    const existing = this.bands.get(entry.id)
    if (rects.length === 0) {
      existing?.remove()
      this.bands.delete(entry.id)
      return
    }
    let left = Number.POSITIVE_INFINITY
    let top = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    for (const rect of rects) {
      left = Math.min(left, rect.left)
      top = Math.min(top, rect.top)
      right = Math.max(right, rect.right)
      bottom = Math.max(bottom, rect.bottom)
    }
    let element = existing
    if (element === undefined) {
      element = document.createElement('div')
      element.className = 'dshhl-message-band'
      this.layer?.append(element)
      this.bands.set(entry.id, element)
    }
    writeStyle(element, '--dshhl-band-color', `var(--dsh-hl-${String(entry.colorId)})`)
    writeStyle(element, 'left', `${String(left - origin.left - BAND_PADDING_PX)}px`)
    writeStyle(element, 'top', `${String(top - origin.top - BAND_PADDING_PX)}px`)
    writeStyle(element, 'width', `${String(right - left + BAND_PADDING_PX * 2)}px`)
    writeStyle(element, 'height', `${String(bottom - top + BAND_PADDING_PX * 2)}px`)
    // Provenance is a mark, not a different fill: an agent-authored whole-message
    // band keeps the user's wash and gains a dashed outline. The attribute is
    // written only for the agent variant, so user paint stays byte-identical.
    writeAttribute(element, 'data-dshhl-author', entry.author === 'agent' ? 'agent' : undefined)
  }

  /** Remove the host (and its boxes) from the transcript. */
  dispose(): void {
    this.detach()
    this.entries = []
    this.boxes.clear()
    this.bands.clear()
  }

  /** Release listeners and remove the current host. */
  private detach(): void {
    if (this.frame !== undefined) {
      (globalThis as { window?: Window }).window?.cancelAnimationFrame(this.frame)
      this.frame = undefined
    }
    const view = (globalThis as { document?: Document }).document?.defaultView
    if (view !== null && view !== undefined) view.removeEventListener('resize', this.onResize)
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.host?.remove()
    this.host = undefined
    this.layer = undefined
    this.scroller = undefined
    this.boxes.clear()
    this.bands.clear()
  }
}
