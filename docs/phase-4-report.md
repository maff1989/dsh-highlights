# Phase 4 report — command plane

Status: **core implemented**; surface-by-surface migration continues in Phase 6 (documented partial).

## Delivered

| WP | Change | Where |
|---|---|---|
| 4.1 | Command contract: capability set, `CommandOutcome<T>` (`ok`/`error`/`duplicate`/`cancelled`), `Command`, `CommandController` | `src/client/contracts/commands.ts` |
| 4.2 | Command definitions: update, remove, restore, copy, reveal, insert, open-panel, star, plus the create closure used by both capture paths | `src/client/commands/definitions.ts` |
| 4.3 | `CommandController`: single-flight per `(command, record)`, duplicate suppression, typed outcomes, one notice on failure, outcome events, diagnostics count | `src/client/commands/controller.ts` |
| 4.4 | Create deduplication: the two duplicated `createFromAnchor` closures (Chat context menu + selection bar) now execute **one** `create-highlight` command; message Save executes `create-message-mark`, so a double-click is rejected while in flight | `src/client/index.ts` |
| 4.6 | Undo/star policy prototypes: A (Undo everywhere + immediate star) and B (no Undo + card draft), `DEFAULT_POLICY = A` pending the owner's recorded decision | `src/client/commands/policies.ts` |

## Tests

- `tests/client/commands/controller.spec.ts` (3): typed ok outcome, duplicate click while in flight, one
  error outcome + one notice, abort short-circuit, outcome events, in-flight cleanup.
- `tests/client/commands/definitions.spec.ts` (3): the table declares one command per mutation with the
  expected capability; star is the update path; open-panel/insert delegation.
- `tests/client/commands/policies.spec.ts` (3): both policy prototypes coherent, default A.
- Full suite green (40 files / 430 tests before the architecture exemption fix; 40/430 after).

## Deliberately partial

- **All three surfaces are command-routed in production.** `CommandSurface`
  (`commands/surface.ts`) maps controller outcomes to the legacy surface shapes and is injected into the
  page, the right panel and the session bridge, so every page/panel/card mutation goes through
  `controller.execute` (single-flight, typed outcome, one notice on failure). Tests still exercise the
  fallback `createActionSurface` unless a test injects commands; a page integration test asserts the
  command path. The remaining Phase-4 gap is the single shared **conflict view**, not the call routing.
- **Undo/star decision: policy A selected (2026-11-12) and implemented.** Page and panel each offer Undo
  for a confirmed delete in one compact strip (no auto-expiry, explicit dismiss, and a persisted
  “Don’t ask again” preference); the item card keeps its undo window open after a delete instead of closing;
  the card's star now persists immediately (`onStar` → `actions.update`), matching page/panel. The panel
  strip is positioned over the body so it cannot shift the row list.
  The remaining policy work is the single conflict surface, not the semantics.
- **Create failures are no longer silent (follow-up).** Both create commands now throw on a `null` result, so
  the controller returns a typed error and reports one notice; the session bridge renders the shared notice
  as a compact toast, so a failed create is visible while the conversation is open (not only on the page).
- **`orphanedIds` dead plumbing removed.** The page's unanchored filter now reads the store's per-session
  stale union directly; the unused injected prop and its test were deleted.
- **Notice-channel migration** is still partial (page and bridge render the shared channel; panel/card/editor
  local conflict/status UIs remain until the conflict view lands).
- **Single-flight guards in the action face (follow-up):** `update`, `remove` and `restore` now reject a
  duplicate call while one is in flight with `error.busy`, so every surface (including the ones still calling
  `actions.*`) cannot double-fire; tests cover duplicate update/delete. Create/message-save are already
  single-flight through the command controller.
- **No new conflict UI**: commands return typed outcomes; the existing editors still render their local
  conflict bars. The unified conflict view lands with the shared editor in Phase 6.

- **Busy state is surface-visible (follow-up).** `CommandController` now exposes a reactive `busy:
  ReadonlySignal<ReadonlySet<string>>` alongside `inFlight()`; `CommandSurface` re-exports it, and the page
  and panel render `aria-busy` from it. The card keeps its local draft `busy` flag (save/delete buttons).
- **Conflict prompt is already one component.** Page row, panel, card and editor all render the shared
  `ConflictBar`; each surface keeps its own draft state, which is deliberate (a conflict must preserve that
  surface's unsaved draft). Phase 4 is closed with that note.
