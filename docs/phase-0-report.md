# Phase 0 report — mobilize, baseline, de-risk

Status: **complete with two explicit partials** (live harness promotion, live re-baseline).
Baseline commit for the programme: `1a2fde1`; Phase-0 work on top.

## Delivered

| WP | Deliverable | Where |
|---|---|---|
| 0.1 | Isolated dev-instance tooling: seed 500/10 000 records, corrupt-record fixture, verify, guarded reset | `tools/dev-instance/` |
| 0.2 | Deterministic CI fixtures (records + transcript DOM) and the ledger schema | `tests/perf/fixtures.ts`, `tests/perf/baseline.json`, `tests/perf/README.md` |
| 0.3 | Baseline ledger seeded from the review's measured numbers **with provenance per row**; the two-track/fixture rules documented | `tests/perf/baseline.json` |
| 0.4 | Six spikes answered from installed contracts; blur A/B deferred to a live profile | `docs/spikes-2026-11.md` |
| 0.5 | ADR-023…028 appended (layering, visibility, strangler flags, test lanes, host query/recovery, notice/undo placeholder); contract skeletons; import-rule test | `ADRS.md`, `src/client/contracts/`, `tests/architecture/import-rules.spec.ts`, `tests/contracts/type-only.spec.ts` |
| 0.6 | Layer flags + dev diagnostics counters | `src/client/runtime/flags.ts`, `src/client/runtime/diagnostics.ts`, tests |
| — | Plan/diagrams committed | `review/REMEDIATION-PLAN.md`, `review/diagrams/` |

## Verified

- `pnpm typecheck` clean.
- `pnpm test` baseline before the phase: 26 files / 374 tests green.
- New Phase-0 tests: 4 files / 14 tests green (`runtime/flags`, `runtime/diagnostics`,
  `contracts/type-only`, `architecture/import-rules`).
- Dev-instance round trip: seed 20 → verify 20 valid / 4 sessions; seed 3 + 1 corrupt →
  verify reports 1 invalid and exits non-zero (expected pre-2B); guarded reset removes only
  `<home>/storages/highlights`.
- `pnpm build` + `check:bundle` unchanged at the Phase-0 commit.

## Partial / deferred (honest)

1. **Live harness promotion — done and exercised.** The harness (`lib.mjs`, `cdp.mjs`, `sec-a-boot-nav.mjs`)
   is promoted into `dsh-highlights/tests/perf/live/`. On 2026-11-12 it was run against the **installed rc.1
   runtime** (hot-patch applied) with a minted cookie and an isolated headless Chromium; Section A completed
   and its JSON is committed under `tests/perf/live/artifacts/`. Measured: boot loadEventEnd 1171 ms /
   longest task 687 ms; cold Highlights nav 671 ms with 0 long tasks; warm 602 ms with 0 long tasks
   (n=1, small live store). This is a *runtime* baseline, not the repository build: the repo bundle still
   needs installing into a test profile before the plugin-attributable gates can be asserted, and the
   reveal/streaming sections were not run. The live gates therefore remain `[baseline]`.
2. **Live two-state re-baseline.** `baseline.json` holds the review's measured numbers, not a new
   run. The re-measurement needs the same dev instance + harness; it is a Phase-1 deliverable
   (the plan's `[baseline]` markers stay until then).
3. **Blur A/B (spike f).** Requires a live browser profile; deferred, treated as optional.

## Decisions recorded

- Owner: approve start Phase 0+1; full architecture first; upstream deferred until after Phase 6;
  include H10/H11 in Phase 2B; Undo/star decided in Phase 4 with prototypes; Agent Teams execution.
- ADR-023…028 accepted as recorded.

## Risk notes

- The keep-alive hot-patch is still applied to the installed runtime and is not upstream. The
  visibility model is built to be correct with it on and off; the plan's `[baseline]` gates do not
  assume it.
- The import-rule test currently exempts unmigrated directories (`data/`, `ui/`, `services/`,
  legacy root files). Every subsequent phase shrinks that exemption; the test is the enforcement.
