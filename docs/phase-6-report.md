# Phase 6 report — surface consolidation and scale

Status: **partial**. The measurable page-scale and consolidation wins landed; the full
one-row/one-editor/one-positioner rewrite and the old-module deletion did **not** land.

## Delivered

| WP | Change | Where |
|---|---|---|
| 6.1 | Page notice moved onto the app-scoped `NoticeService` (page-local fallback only when it is not injected) | `ui/page/HighlightsPage.tsx`, `index.ts` |
| 6.2 | Page rows memoised with an equality that ignores the page clock; `.dshhl-row` gets `content-visibility: auto` + `contain-intrinsic-size`; **row cap + "Show more"** (200 rows per page) so a 10k store renders a bounded list; page clock no longer re-renders memoised rows | `ui/page/{RecordRow,GroupList,HighlightsPage}.tsx`, `ui/page/pageStyles.ts` |
| 6.3 | Shared floating positioner adopted for the item card (per-frame loop removed in Phase 5); page/panel narrow selectors already in Phase 2 | `ui/SessionBridge.tsx`, `selection/placement.ts` |
| 6.4 | Create-path duplication removed (one `create-highlight` command for both capture paths); message Save single-flight | `index.ts`, `commands/*` |
| 6.7 | Backlog alignment recorded (archived badges/validation parity/multi-tag/persistence still open; cross-tab/pre-P0 marks/glow explicitly out) | plan §8.3 |
| 6.8 | **Signal cleanup:** `revision` removed from the public snapshot (nothing consumed it; `paintEpoch` is the paint signal), `applyRecords` no longer publishes it | `data/client.ts` and reconstructed tests |

## Not done (honest)

- **One editor / one row / one positioner** is not achieved. `RecordRow`, `PanelRow`, `ItemCard` and
  `HighlightEditor` still contain three editor implementations; the panel still has its own row renderer.
  Consolidating them is a larger surface rewrite than the remaining phase budget allowed and would need its
  own focused pass (the plan's Phase 6.1/6.3).
- **True list virtualisation / paged `query` in the page** is not wired. The page still loads one `list`
  (bounded by the host cap) and caps rendering at 200 rows with a Show-more control; CSS containment skips
  off-screen work. The `query` endpoint and client `query()` are ready (Phase 2B); swapping the page/panel
  data source to paged queries is the missing wiring.
- **Old paint module paths are now deleted (Phase-6 follow-up).** `paint/painter.ts` and `paint/overlay.ts`
  were moved to `paint/adapters/css-highlights.ts` and `paint/adapters/overlay.ts`; consumers and tests import
  the adapter paths, so the old owner files no longer exist. The adapter implementations still carry the
  paint code until UA-1 lands.
- **`selection/bounds.ts` now lives in the selection layer** (moved from `ui/`), so that cleanup is done.
- **`revision` removal is done** for the client snapshot; the host-list `revision` value is still returned by
  the wire contract for future sync work but the client ignores it.

## Tests

- Full suite green after the page/row/notice changes: **41 files / 436 tests**.
- No new perf/browser measurement was possible in this environment; the page-scale gate remains `[baseline]`.

## Follow-up — panel row window is bounded

- The right panel now renders at most `PANEL_ROW_LIMIT` (200) rows and reveals the next page through the same
  Show-more affordance as the page; the limit resets on filter/session change.
- Panel rows carry `content-visibility: auto` with an intrinsic size, so off-screen rows skip layout/paint.
- Test: a 250-record panel renders 200 rows, then 250 after Show more.

## Follow-up — shared editor fields

- `ui/EditorFields.tsx` is the single field implementation for colour, tags and note; page, panel and card
  pass their own class names and keep their save/cancel/conflict shells. Normalisation/caps/Enter behaviour
  can no longer drift. (`HighlightEditor` remains the compact new-selection popover.)
