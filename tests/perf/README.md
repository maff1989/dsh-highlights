# Performance fixtures and the evidence ledger (Phase 0)

The migration gates in `review/REMEDIATION-PLAN.md` (Appendix C) distinguish
three things:

1. **CI-runnable structural tests** — counts and invariants that do not need a
   browser. These live here as `fixtures.ts` plus per-phase specs.
2. **A live harness** — long tasks, forced layouts, paint counters, per-state
   CPU. The reviewed session built one in `.dsh-dev/arch-review/perf-artifacts/`
   (`lib.mjs`) and `.dsh-dev/perf-repro/verify/` (`measure.mjs`); promoting it
   into this package is an open Phase-0 item because it depends on a running
   GUI and a minted browser-session cookie.
3. **A baseline ledger** — `baseline.json`, seeded from the review's measured
   numbers with provenance on every row.

## Fixtures

| Name | Where | Use |
|---|---|---|
| `FIXTURE_SESSION` / `makeTranscript` | `fixtures.ts` | jsdom structural tests: resolution, visibility gating, paint descriptors |
| `FIX-SMALL` | live harness | keep-alive A/B surface (12 records / 15 boxes) |
| `FIX-BIG` | live harness (manual) | real 681-node session; reference only, not reproducible in CI |
| `FIX-BIG-DEV` | `tools/dev-instance` seed | the reproducible CI/perf fixture; pin chat-node/DOM/scrollHeight before gating |
| `FIX-SEEDED` | `tools/dev-instance` | 500 / 10 000 records for host, page scale and write paths |

## Ledger rules

- Every gate run writes `{ runAt, pluginFnv, coreHash, keepAlive, fixture, n, metrics }`.
- Counts and ratios only; absolute ms on a pinned fixture with the same harness.
- Never compare across fixtures; never quote `~0.45 s` outside `FIX-SMALL`.
- The review's measured values are **inputs** to the ledger, not re-measurements:
  see the `provenance` field per row.

## Live harness promotion (done)

The harness now lives in `live/` (`lib.mjs`, `cdp.mjs`, `sec-a-boot-nav.mjs`, README). It still requires:

- `cdp.mjs` (connect + cookie minting; cookie must be minted and used in the same
  shell call),
- `instrument.mjs` (long tasks, forced-layout attribution, paint counters),
- `measure.mjs` (state scenarios),
- `run.mjs` (writes the ledger row),
- a CI job that is skipped unless `DSHLIVE=1`.

Until then, Phase 0's baseline claims are marked **[baseline]** in the plan and
are not asserted by CI.
