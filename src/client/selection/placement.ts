/**
 * Shared floating positioner for the selection bar and the item card.
 *
 * The old surfaces each ran an unconditional per-frame write→read loop. This
 * positioner is dirty-driven: callers `place()` when scroll/resize/selection
 * actually changed, and writes are diffed so an unchanged placement performs no
 * style mutation. One owner for both surfaces.
 */
import type { ConversationBounds } from './bounds'
import { placeFloating } from './bounds'

/** One placement request. */
export interface FloatingPlacementRequest {
  readonly element: HTMLElement
  /** Range line boxes in viewport coordinates. */
  readonly rects: readonly DOMRect[]
  /** Conversation viewport bounds. */
  readonly bounds: ConversationBounds
  /** Natural width of the floating surface. */
  readonly width: number
  /** Natural height when known (otherwise measured from the element). */
  readonly height?: number
}

/** Positioner face. */
export interface FloatingPositioner {
  /** Place one surface from measured inputs; returns whether it is hidden. */
  place(request: FloatingPlacementRequest): boolean
  /** Hide one surface (diffed). */
  hide(element: HTMLElement): void
  /** Forget cached styles for one element (e.g. after it unmounts). */
  forget(element: HTMLElement): void
  /** Observe writes (tests/diagnostics). */
  setWriteListener(listener: ((element: HTMLElement, property: string) => void) | undefined): void
}

/** Last style values written per element. */
type StyleCache = Map<string, string>

/**
 * Create one shared positioner.
 */
export function createFloatingPositioner(): FloatingPositioner {
  const cache = new WeakMap<HTMLElement, StyleCache>()
  let listener: ((element: HTMLElement, property: string) => void) | undefined

  /** Write one property only when it changed. */
  function write(element: HTMLElement, properties: StyleCache): void {
    let previous = cache.get(element)
    if (previous === undefined) {
      previous = new Map()
      cache.set(element, previous)
    }
    for (const [property, value] of properties) {
      if (previous.get(property) === value) continue
      if (property === 'visibility') element.style.visibility = value
      else if (property === 'top') element.style.top = value
      else if (property === 'left') element.style.left = value
      else if (property === 'bottom') element.style.bottom = value
      else if (property === 'maxHeight') element.style.maxHeight = value
      else if (property === 'overflowY') element.style.overflowY = value
      previous.set(property, value)
      listener?.(element, property)
    }
  }

  return {
    place(request) {
      const { element, rects, bounds, width } = request
      // Height is optional: when the caller has not measured it, the placement
      // math must stay identical to the surface's previous call.
      const placement = placeFloating({
        rects,
        bounds,
        width,
        ...(request.height === undefined ? {} : { height: request.height }),
      })
      if (placement.hidden) {
        write(element, new Map([['visibility', 'hidden']]))
        return true
      }
      const geometry: [string, string][] = [['visibility', 'visible'], ['left', `${String(Math.round(placement.left))}px`]]
      if (placement.bottom !== undefined) {
        geometry.push(['bottom', `${String(Math.round(placement.bottom))}px`], ['top', ''])
      } else {
        geometry.push(['top', `${String(Math.round(placement.top ?? 0))}px`], ['bottom', ''])
      }
      geometry.push(['maxHeight', `${String(Math.floor(placement.maxHeight ?? Math.max(180, bounds.bottom - bounds.top)))}px`], ['overflowY', 'auto'])
      write(element, new Map(geometry))
      return false
    },
    hide(element) {
      write(element, new Map([['visibility', 'hidden']]))
    },
    forget(element) {
      cache.delete(element)
    },
    setWriteListener(next) {
      listener = next
    },
  }
}
