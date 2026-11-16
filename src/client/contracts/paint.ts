/**
 * Paint contract: one pipeline resolves, describes, and hands descriptors to
 * adapters. Adapters only write; they never measure (ADR-021's single-reader
 * ordering is owned by the pipeline).
 */
import type { Author } from '../../shared/provenance'
import type { HighlightRecord } from '../../shared/schema'

/** Plain geometry (no live DOM types in the contract surface). */
export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** One decided decoration for one record. */
export interface DecorationDescriptor {
  readonly recordId: string
  readonly sessionId: string
  readonly kind: 'text' | 'message'
  readonly colorId: number
  /**
   * Who authored the item (schema v2; absent in a record means `user`). Paint is
   * provenance-bearing: adapters use it to pick the user wash or the agent-marked
   * variant, so the two never read as the same judgement.
   */
  readonly author: Author
  /** Resolved ranges for a text decoration (produced by the pipeline's resolve stage). */
  readonly textRanges?: readonly Range[]
  /** Optional measured fill geometry (produced by the pipeline, consumed by DOM adapters). */
  readonly fillBoxes?: readonly Box[]
  /** Optional measured band geometry for a whole-message mark. */
  readonly band?: Box
}

/** Why a paint pass was requested. */
export type PaintReason = 'mount' | 'mutate' | 'resize' | 'store' | 'reveal' | 'show'

/** One resolved paint pass handed to adapters. */
export interface DecorationPass {
  readonly descriptors: readonly DecorationDescriptor[]
  /** Ids that failed to resolve and therefore render as unanchored. */
  readonly stale: readonly string[]
}

/** An adapter writes descriptors; it never reads layout. */
export interface DecorationAdapter {
  /**
   * Apply one pass.
   * @param pass - resolved descriptors plus stale ids for this session.
   */
  apply(pass: DecorationPass): void
  /** Release any owned DOM. */
  dispose(): void
}

/** The one resolve/describe entry point. */
export interface DecorationPipeline {
  /**
   * Resolve and paint one session.
   * @param input - session, records, and optional DOM scope.
   * @returns the descriptors emitted for this pass plus stale ids.
   */
  paint(input: {
    readonly sessionId: string
    readonly records: readonly HighlightRecord[]
    readonly scope?: ParentNode
    readonly reason?: PaintReason
  }): { readonly descriptors: readonly DecorationDescriptor[]; readonly stale: readonly string[] }
  /** Observe descriptors (tests/diagnostics). */
  onDescriptors(listener: (pass: DecorationPass) => void): () => void
  /** Release adapters. */
  dispose(): void
}
