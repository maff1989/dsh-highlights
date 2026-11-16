# Phase 3 report — paint pipeline, reveal port, notice service

Status: **implemented**; painter/overlay modules intentionally survive as adapter internals until Phase 6.5.

## Delivered

| WP | Change | Where |
|---|---|---|
| 3.1 | `DecorationDescriptor`/`DecorationPass`/`DecorationAdapter`/`DecorationPipeline` contract; plain-geometry rule documented; `Range` is a pipeline-produced pass-through | `src/client/contracts/paint.ts` |
| 3.2 | `createDecorationPipeline`: one `resolveAll(records, scope)` per pass → descriptors (id/session/kind/colour/range) → adapters; descriptor listeners for diagnostics/tests | `src/client/paint/pipeline.ts` |
| 3.3 | Adapters: CSS adapter (`paintPlan` with registry diff + `registryWrites` counter) and overlay adapter (`syncEntries`, two-phase DOM write kept). Adapters write only; the pipeline owns resolution/scope | `src/client/paint/adapters.ts`, `src/client/paint/{painter,overlay}.ts` |
| 3.4 | `RevealPort`: single-flight, supersede, external-signal cancellation, `cancelled` result, quiescence callback, dispose; composed adapter wraps today's routine; actions route through the port | `src/client/contracts/reveal.ts`, `src/client/reveal/{port,composed-adapter}.ts`, `data/actions-impl.ts`, `index.ts` |
| 3.5 | `NoticeService`: one current notice, one TTL timer, one dismissal path | `src/client/contracts/notice.ts`, `src/client/notice/service.ts` |
| 3.6 | Old paint modules converted to adapter internals, then **deleted from their old paths** in the Phase-6 follow-up: the code now lives only as `paint/adapters/css-highlights.ts` and `paint/adapters/overlay.ts`; dead flash CSS/`MESSAGE_NAME` cleanup retained | `paint/adapters/*` |
| 3.7 | Paint consumers migrated: `SessionBridge.repaint` calls the pipeline; no direct `resolveAll`/`painter.paint`/`overlay.sync` in the bridge | `ui/SessionBridge.tsx` |

## Tests

- `tests/client/paint/pipeline.spec.ts` (2): resolve once, descriptors per record, stale propagation, adapter
  pass, listener lifecycle, dispose.
- `tests/client/paint/painter-plan.spec.ts` (1): registry written on first paint, skipped when ranges are
  unchanged, written again when geometry changes.
- `tests/client/reveal/port.spec.ts` (3): supersede reports the older reveal as cancelled, cancelAll and an
  external signal both cancel, a throwing routine maps to `unavailable`, dispose refuses new work.
- `tests/client/notice/service.spec.ts` (3): replace + TTL, stale-id dismissal, dispose.
- Full suite green after reconstructing the bridge's fake painter for the plan API.
- Existing ADR-021 ordering test remains green: the overlay still measures before writing; the pipeline adds
  no reads.

## Deliberate partials

- **Visible-only painting** is not implemented yet: the pipeline resolves the session's records as before.
  Viewport-limited resolution needs the browser lane/measurement fixture (Phase 6 gate); the structural hook
  (`records` in the pass) is in place.
- **Notice migration is partial**: the service exists and is wired app-scoped, but the page/panel/card still
  own their legacy channels. They move onto it with the command plane in Phase 4 (WP 4.2–4.3).
- **Reveal cancellation is a race, not a hard abort**: the port resolves `cancelled` immediately; the bounded
  routine exits at its next wait (each phase is ≤2.5 s). UA-2's public API removes the race in Phase 7.
- **Painter/overlay modules are not deleted**: consumers still import them indirectly through adapters, and
  the bridge test asserts the overlay DOM. Deletion is Phase 6.5 after surfaces/commands migrate.
