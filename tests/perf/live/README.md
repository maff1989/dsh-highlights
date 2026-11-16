# Live perf harness (promoted from the review session)

This is the CDP harness used for the review's measured evidence, promoted into the package so the
`[baseline]` gates in `review/REMEDIATION-PLAN.md` can be re-measured without the session scratch directory.

**It is not run in CI.** It needs:

1. a running DSH GUI (default `http://172.16.2.20:3080/`, override with `GUI_URL`),
2. a minted browser-session cookie written to `<ART_DIR>/cookie.txt` (mint from
   `~/.dsh/.credentials.yaml` in the same shell call; see the original `mint.mjs` in the session workspace),
3. an isolated headless Chromium on its own CDP port/profile (never the user's browser).

Read-only with respect to the highlights store: it only navigates, opens surfaces and mutates DOM locally.

```bash
cd dsh-highlights
ART_DIR=.dsh-perf-live node tests/perf/live/sec-a-boot-nav.mjs
```

The scripts are plain `.mjs` (not TypeScript) so `tsconfig`/vitest globs leave them alone. The deterministic
fixtures and the baseline ledger remain in `tests/perf/`; this directory is the "live lane" half.
