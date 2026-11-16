/**
 * Painting highlights without touching the DOM.
 *
 * The transcript is React-owned; writing `<mark>` wrappers into it would fight
 * Markdown reconciliation and the streaming element cache. The CSS Custom
 * Highlight API paints arbitrary `Range`s from a browser registry instead, so
 * the plugin never mutates React's tree: it resolves anchors to ranges and
 * publishes them under namespaced highlight names.
 *
 * Range objects bind to specific Text nodes, so every DOM mutation invalidates
 * them; the session bridge re-resolves on change (coalesced to one animation
 * frame) and repaints.
 */
import { authorOf } from '../../../shared/provenance'
import type { HighlightRecord } from '../../../shared/schema'
import { HIGHLIGHT_NAME_PREFIX } from '../../../shared/constants'
import { count } from '../../runtime/diagnostics'

/** Name used for whole-message marks. */
const MESSAGE_NAME = `${HIGHLIGHT_NAME_PREFIX}message`

/**
 * Registry-name segment for agent-authored items (schema v2). User paint keeps
 * the shipped `dsh-hl-<slot>` names; agent paint is namespaced so the stylesheet
 * can mark provenance without changing the user's wash.
 */
const AGENT_NAME_SEGMENT = 'agent-'

/**
 * Registry name for one record's text highlight.
 * @param record - the record being painted.
 * @returns the CSS highlight name for its palette slot and author.
 */
function nameOf(record: Pick<HighlightRecord, 'colorId' | 'author'>): string {
  const slot = String(record.colorId)
  return authorOf(record) === 'agent'
    ? `${HIGHLIGHT_NAME_PREFIX}${AGENT_NAME_SEGMENT}${slot}`
    : `${HIGHLIGHT_NAME_PREFIX}${slot}`
}

/** The CSS.highlights registry shape this module needs. */
interface HighlightRegistryLike {
  set(name: string, highlight: unknown): void
  delete(name: string): boolean
}

/** Constructor of the browser's Highlight class. */
type HighlightConstructor = new (...ranges: Range[]) => unknown

/** Browser globals the painter uses, probed once. */
interface HighlightGlobals {
  readonly registry: HighlightRegistryLike
  readonly Highlight: HighlightConstructor
}

/** Result of one paint pass. */
export interface PaintResult {
  /** Resolved ranges keyed by record id (for hit-testing and reveal). */
  readonly ranges: ReadonlyMap<string, Range>
  /** Record ids whose anchor could not be resolved in the current DOM. */
  readonly stale: readonly string[]
}

/** Resolve browser globals, or null when the API is unavailable. */
function highlightGlobals(): HighlightGlobals | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistryLike } }).CSS
  const HighlightClass = (globalThis as { Highlight?: HighlightConstructor }).Highlight
  if (css?.highlights === undefined || typeof HighlightClass !== 'function') return null
  return { registry: css.highlights, Highlight: HighlightClass }
}

/** True when this browser can paint highlights at all. */
export function paintSupported(): boolean {
  return highlightGlobals() !== null
}

/**
 * Whether two bucket plans paint the same ranges.
 * Compares range boundaries only; the Range objects are re-made per resolve.
 */
function sameBuckets(a: ReadonlyMap<string, readonly Range[]> | undefined, b: ReadonlyMap<string, readonly Range[]>): boolean {
  if (a === undefined) return false
  if (a.size !== b.size) return false
  for (const [name, left] of a) {
    const right = b.get(name)
    if (right === undefined || right.length !== left.length) return false
    for (let index = 0; index < left.length; index += 1) {
      const one = left[index]
      const other = right[index]
      if (one === undefined || other === undefined) return false
      if (one.startOffset !== other.startOffset || one.endOffset !== other.endOffset) return false
    }
  }
  return true
}

/** Painter owning the plugin's entries in the document-global registry. */
export class HighlightsPainter {
  private readonly globals: HighlightGlobals | null
  private ranges = new Map<string, Range>()
  private stale: string[] = []
  /** Last plan's ranges per registry name, for the no-op diff. */
  private lastBuckets: ReadonlyMap<string, readonly Range[]> | undefined
  private painted = false

  constructor() {
    this.globals = highlightGlobals()
  }

  /** Whether painting is available. */
  get supported(): boolean {
    return this.globals !== null
  }

  /** Ranges from the last paint pass, keyed by record id. */
  get resolved(): ReadonlyMap<string, Range> {
    return this.ranges
  }

  /** Record ids that could not be resolved in the last pass. */
  get unresolved(): readonly string[] {
    return this.stale
  }

  /**
   * Publish one paint pass.
   * @param records - Records for the visible session.
   * @param resolved - Ranges resolved from those records.
   * @param stale - Ids that could not be resolved.
   * @returns the paint result (also stored on the painter).
   */
  /**
   * Apply a paint plan assembled by the decoration pipeline.
   * @param buckets - ranges grouped by highlight registry name.
   * @param stale - ids that could not be resolved.
   * @returns the paint result.
   */
  paintPlan(
    resolved: ReadonlyMap<string, Range>,
    buckets: ReadonlyMap<string, readonly Range[]>,
    stale: readonly string[],
  ): PaintResult {
    this.stale = [...stale]
    this.ranges = new Map(resolved)
    if (this.globals === null) return { ranges: this.ranges, stale: this.stale }
    if (sameBuckets(this.lastBuckets, buckets)) {
      this.painted = true
      return { ranges: this.ranges, stale: this.stale }
    }
    // Replace every name this plugin owns, including names that went empty.
    for (const name of [...buckets.keys(), ...this.ownedNames()]) {
      if (!buckets.has(name)) {
        count('registryWrites')
        this.globals.registry.delete(name)
      }
    }
    for (const [name, ranges] of buckets) {
      count('registryWrites')
      this.globals.registry.set(name, new this.globals.Highlight(...ranges))
    }
    this.lastBuckets = new Map(buckets)
    this.painted = true
    return { ranges: this.ranges, stale: this.stale }
  }

  paint(records: readonly HighlightRecord[], resolved: ReadonlyMap<string, Range>, stale: readonly string[]): PaintResult {
    this.ranges = new Map(resolved)
    this.stale = [...stale]
    if (this.globals === null) return { ranges: this.ranges, stale: this.stale }

    /** Ranges bucketed by the highlight name they paint under. */
    const buckets = new Map<string, Range[]>()
    for (const record of records) {
      const range = resolved.get(record.id)
      if (range === undefined) continue
      // Whole-message marks are not character highlights: the overlay draws one
      // rounded band behind the reply so a marked message
      // reads as bookmarked rather than "all of this text is selected". Painting
      // a `::highlight` wash here would re-introduce that look.
      if (record.anchor.kind === 'message') continue
      const name = nameOf(record)
      const bucket = buckets.get(name)
      if (bucket === undefined) buckets.set(name, [range])
      else bucket.push(range)
    }

    // Replace every name this plugin owns, including names that went empty.
    for (const name of [...buckets.keys(), ...this.ownedNames()]) {
      if (!buckets.has(name)) this.globals.registry.delete(name)
    }
    for (const [name, ranges] of buckets) {
      this.globals.registry.set(name, new this.globals.Highlight(...ranges))
    }
    this.painted = true
    return { ranges: this.ranges, stale: this.stale }
  }

  /**
   * Paint a transient flash over one range (a reveal, or a row activation).
   * @param range - Range to flash.
   */
  flash(range: Range): void {
    // Disabled for now: the overlay glow added animation/rAF work during typing
    // and was not worth the interaction cost. Kept as a no-op so reveal keeps a
    // single call site if a quieter effect is reintroduced later.
    void range
  }

  /** Remove every highlight this plugin painted and clear the flash timer. */
  dispose(): void {
    this.lastBuckets = undefined
    const globals = this.globals
    if (globals !== null) {
      for (const name of this.ownedNames()) globals.registry.delete(name)
    }
    this.painted = false
    this.ranges = new Map()
    this.stale = []
  }

  /**
   * Every registry name this plugin may own, including the agent namespace:
   * a name that goes empty must be deleted from the registry, or an item that
   * stops painting would keep its old wash alive.
   */
  private ownedNames(): string[] {
    const slots = ['1', '2', '3', '4', '5']
    return [
      ...slots.map(slot => `${HIGHLIGHT_NAME_PREFIX}${slot}`),
      ...slots.map(slot => `${HIGHLIGHT_NAME_PREFIX}${AGENT_NAME_SEGMENT}${slot}`),
      MESSAGE_NAME,
    ]
  }
}
