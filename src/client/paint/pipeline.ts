/**
 * One decoration pipeline for one session bridge.
 *
 * Resolve once per pass, emit descriptors, hand them to adapters that only
 * write. This replaces the three independently driven paint mechanisms with a
 * single call site; the existing painter/overlay become adapter internals and
 * are deleted when the upstream decoration seat lands (Phase 7).
 */
import type { DecorationDescriptor, DecorationPass, DecorationPipeline, DecorationAdapter, PaintReason } from '../contracts/paint'
import { authorOf } from '../../shared/provenance'
import type { HighlightRecord } from '../../shared/schema'
import { resolveAll } from '../anchor/resolve'

/** A resolve function (injectable for tests). */
export type ResolveAll = (
  records: readonly HighlightRecord[],
  scope?: ParentNode,
) => { readonly ranges: Map<string, Range>; readonly stale: Map<string, unknown> }

/**
 * Create a decoration pipeline.
 * @param options - adapters plus an optional resolve override.
 */
export function createDecorationPipeline(options: {
  readonly adapters: readonly DecorationAdapter[]
  readonly resolve?: ResolveAll
}): DecorationPipeline {
  const resolve = options.resolve ?? resolveAll
  const adapters = [...options.adapters]
  const listeners = new Set<(pass: DecorationPass) => void>()
  let disposed = false
  return {
    paint(input) {
      if (disposed) return { descriptors: [], stale: [] }
      const { ranges, stale } = resolve(input.records, input.scope)
      const descriptors: DecorationDescriptor[] = []
      for (const record of input.records) {
        const range = ranges.get(record.id)
        if (range === undefined) continue
        descriptors.push({
          recordId: record.id,
          sessionId: record.sessionId,
          kind: record.anchor.kind,
          colorId: record.colorId,
          author: authorOf(record),
          textRanges: [range],
        })
      }
      const pass: DecorationPass = { descriptors, stale: [...stale.keys()] }
      for (const adapter of adapters) adapter.apply(pass)
      for (const listener of [...listeners]) listener(pass)
      void (input.reason satisfies PaintReason | undefined)
      return { descriptors, stale: pass.stale }
    },
    onDescriptors(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      if (disposed) return
      disposed = true
      listeners.clear()
      for (const adapter of adapters) adapter.dispose()
    },
  }
}
