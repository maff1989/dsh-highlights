# Phase 1 report — L0 runtime, scope and visibility

Status: **implemented and committed**; live hidden-work measurement remains a `[baseline]` gate.

## Delivered

| WP | Change | Where |
|---|---|---|
| 1.1 | Visibility gate for the existing pipeline: the transcript observer, repaint frames and the bar/card rAF loops stop while the conversation is hidden; re-show runs one paint | `src/client/observation/service.ts`, `src/client/ui/SessionBridge.tsx`, `src/client/ui/SelectionAffordance.tsx` |
| 1.2 | App-scoped painter lifetime moved out of the per-session bridge into the composition root; overlay stays per-bridge (it owns its host + listener); `resolveAll` scoped to `[data-conversation-session="<sid>"]` | `src/client/index.ts`, `src/client/ui/SessionBridge.tsx` |
| 1.3 | Dead flash CSS removed (`.dshhl-flash-*`, keyframes, reduced-motion rule) | `src/client/styles.ts` |
| 1.4 | Runtime primitives: `createSignal`, `FrameScheduler`, `VisibilityModel`, `ObservationService`, `useSignalValue` | `src/client/runtime/{signal,scheduler,visibility,use-signal}.ts`, `src/client/observation/service.ts` |
| 1.5 | Composition root creates/disposes the observation service and painter; `panelInfo` wired as the layout signal | `src/client/index.ts` |
| 1.6 | `SessionBridge` no longer owns observers/rAF/painter; it registers roots, subscribes to paint frames, and gates its card loop/body observer on visibility | `src/client/ui/SessionBridge.tsx` |
| 1.7 | Selection affordance takes `visible`; it installs no gesture listeners, surface observer or 250 ms poll while hidden | `src/client/ui/SelectionAffordance.tsx` |

## Tests

- New: `tests/client/observation/service.spec.ts` (4 tests) — registration paints once, mutations
  coalesce, hidden produces **0 observer callbacks / 0 paints / dropped requests**, ignored
  plugin/composer mutations do not wake paint, disposal stops work.
- Existing suite: session-bridge and selection specs updated for the injected observation service and
  the `visible` prop. No test was deleted or weakened; types and props were reconstructed.
- Full gate: `pnpm verify` (typecheck → tests → build → bundle contract) green at commit.

## Hidden-work gate

The service counts and skips hidden work (`paintSkippedHidden`) and detaches the transcript observer
when the surface is not visible. The live gate (0 callbacks in a hidden streaming window) is asserted
structurally in the new spec; the live 30-batch/s measurement is still `[baseline]` because the live
harness promotion is pending (Phase 0 partial).

## Deliberately deferred

- Session-keyed painter registry buckets + session-keyed stale set: Phase 2/3 (`STORE`/`PAINT` own the
  data and paint scope). Phase 1 only removed the per-session painter disposal and scoped resolution.
- Replacing the global `revision` signal and whole-snapshot subscriptions: Phase 2.
- Selection reducer/dismissal unification: Phase 5.
