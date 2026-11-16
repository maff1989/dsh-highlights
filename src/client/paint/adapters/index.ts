/**
 * Paint adapters: the only code that touches the browser registries.
 *
 * Both adapters write from a resolved pass; neither resolves or measures ranges
 * (the pipeline's resolve stage owns that, preserving ADR-021's single-reader
 * ordering). The overlay adapter keeps the existing two-phase DOM write.
 */
import type { DecorationDescriptor, DecorationPass, DecorationAdapter } from '../../contracts/paint'
import type { Author } from '../../../shared/provenance'
import { HIGHLIGHT_NAME_PREFIX } from '../../../shared/constants'
import type { HighlightOverlay, OverlayEntry } from './overlay'
import type { HighlightsPainter } from './css-highlights'

/**
 * Registry-name segment for agent-authored items.
 *
 * User-authored paint keeps the shipped `dsh-hl-<slot>` names, so its CSS and
 * registry entries stay byte-identical to before schema v2 existed. Agent items
 * get their own namespace, which is what lets the stylesheet add a provenance
 * mark (`::highlight(dsh-hl-agent-<slot>)` with a dotted underline) without
 * touching the user's wash.
 */
const AGENT_NAME_SEGMENT = 'agent-'

/**
 * Resolve the CSS custom-highlight registry name for one slot and author.
 * @param colorId - palette slot.
 * @param author - who authored the item.
 * @returns the registry name the painter publishes under.
 */
function registryName(colorId: number, author: Author): string {
  return author === 'agent'
    ? `${HIGHLIGHT_NAME_PREFIX}${AGENT_NAME_SEGMENT}${String(colorId)}`
    : `${HIGHLIGHT_NAME_PREFIX}${String(colorId)}`
}

/** Bucket descriptors into the registry names the painter owns. */
function bucketsOf(descriptors: readonly DecorationDescriptor[]): Map<string, Range[]> {
  const buckets = new Map<string, Range[]>()
  for (const descriptor of descriptors) {
    if (descriptor.kind !== 'text') continue
    const range = descriptor.textRanges?.[0]
    if (range === undefined) continue
    const name = registryName(descriptor.colorId, descriptor.author)
    const bucket = buckets.get(name)
    if (bucket === undefined) buckets.set(name, [range])
    else bucket.push(range)
  }
  return buckets
}

/** Resolved range map keyed by record id (painter consumers read this). */
function resolvedOf(descriptors: readonly DecorationDescriptor[]): Map<string, Range> {
  const resolved = new Map<string, Range>()
  for (const descriptor of descriptors) {
    const range = descriptor.textRanges?.[0]
    if (range !== undefined) resolved.set(descriptor.recordId, range)
  }
  return resolved
}

/**
 * CSS Custom Highlight adapter.
 * @param painter - app-scoped painter.
 */
export function createCssHighlightAdapter(painter: HighlightsPainter): DecorationAdapter {
  return {
    apply(pass: DecorationPass): void {
      painter.paintPlan(resolvedOf(pass.descriptors), bucketsOf(pass.descriptors), pass.stale)
    },
    dispose(): void {
      // The painter is app-scoped; it is disposed by the composition root, never
      // by a per-session pipeline (the W2 defect).
    },
  }
}

/** Convert descriptors to the overlay's entry shape. */
function entriesOf(descriptors: readonly DecorationDescriptor[]): OverlayEntry[] {
  const entries: OverlayEntry[] = []
  for (const descriptor of descriptors) {
    const range = descriptor.textRanges?.[0]
    if (range === undefined) continue
    entries.push({ id: descriptor.recordId, kind: descriptor.kind, colorId: descriptor.colorId, author: descriptor.author, range })
  }
  return entries
}

/**
 * DOM overlay adapter (rounded fills and whole-message bands).
 * @param overlay - the session-scoped overlay.
 */
export function createOverlayAdapter(overlay: HighlightOverlay): DecorationAdapter {
  return {
    apply(pass: DecorationPass): void {
      overlay.syncEntries(entriesOf(pass.descriptors))
    },
    dispose(): void {
      overlay.dispose()
    },
  }
}
