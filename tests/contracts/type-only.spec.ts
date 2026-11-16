/**
 * Contract skeletons must stay type-only while the layers are introduced.
 *
 * These imports are `import type`, so this spec proves the modules have no
 * runtime side effects (and therefore cannot read the DOM at bundle evaluation).
 */
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Disposer, Disposable, ReadonlySignal, SessionHandle, SessionScope, Signal } from '../../src/client/contracts/scope'
import type {
  ObservationService,
  PaintReason,
  SurfaceId,
  SessionRoots,
} from '../../src/client/contracts/observation'

describe('contracts/scope + contracts/observation', () => {
  it('exposes the expected primitive shapes', () => {
    expectTypeOf<Disposer>().toBeFunction()
    expectTypeOf<Signal<number>['get']>().returns.toBeNumber()
    expectTypeOf<ReadonlySignal<boolean>>().toMatchTypeOf<Signal<boolean>>()
    expectTypeOf<SessionHandle>().toMatchTypeOf<SessionScope & Disposable>()
    expectTypeOf<SessionScope['conversationRoot']>().returns.toEqualTypeOf<HTMLElement | null>()
    expectTypeOf<SessionScope['paintEpoch']>().toEqualTypeOf<ReadonlySignal<number>>()
  })

  it('exposes the observation face', () => {
    expectTypeOf<SurfaceId>().toEqualTypeOf<'conversation' | 'page' | 'panel' | 'card' | 'hidden'>()
    expectTypeOf<PaintReason>().toEqualTypeOf<'mount' | 'mutate' | 'resize' | 'store' | 'reveal' | 'show'>()
    expectTypeOf<SessionRoots['transcriptRoot']>().returns.toEqualTypeOf<HTMLElement | null>()
    expectTypeOf<ObservationService['registerSession']>().toBeFunction()
    expectTypeOf<ObservationService['isVisible']>().returns.toBeBoolean()
  })

  it('has no runtime exports beyond the type namespace', async () => {
    const scopeModule = await import('../../src/client/contracts/scope')
    const observationModule = await import('../../src/client/contracts/observation')
    expect(Object.keys(scopeModule)).toEqual([])
    expect(Object.keys(observationModule)).toEqual([])
  })
})
