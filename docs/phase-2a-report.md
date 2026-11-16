# Phase 2A report — client data plane

Status: **implemented**; host half (2B) follows.

## Delivered

| WP | Change | Where |
|---|---|---|
| 2.1 | `recordsBySession` slice map + identity-stable grouping; `staleBySession`, `paintEpoch`, `inFlight` added to the snapshot; shared `EMPTY_*` selectors | `src/client/data/client.ts` |
| 2.2 | Reads are cancellable: an `AbortController` per read, a forced refresh supersedes an in-flight read, aborted reads never mark the store offline; polling stops while offline | `src/client/data/client.ts`, `src/client/data/transport.ts`, `src/client/index.ts` |
| 2.3 | `SessionBridge` reads its session slice (no global revision); `MessageAction` selects the identity-stable node store and resolves at click time; page/panel use narrow selectors (`records`, `stale`, `status`, `offline`, `paintSupported`, `error`) | bridge/message/page/panel |
| 2.4 | `paintEpoch` is the paint signal; stale publishes on its own channel; per-session stale (`setStaleForSession`/`staleForSession`) with the page-level union kept for compatibility | `data/client.ts`, bridge, panel |
| 2.5 | Update/delete/restore are optimistic with rollback; every write has an in-flight marker; failure no longer triggers a whole-store re-read | `data/actions-impl.ts`, `data/client.ts` |

## Behaviour changes (intentional)

- **Optimistic presentation writes.** `update` publishes the patched record immediately; a conflict replaces it
  with the Host's live record; a transport failure restores the previous record. `remove` hides immediately
  and restores on conflict/failure. `restore` republishes the tombstone's record immediately and rolls back on
  failure. `removed`/Undo entries are only created on `written`.
- **No read-on-failure.** The old `refresh(true)` in write catch blocks is gone; a failed write returns a
  typed outcome. Explicit Reload/Retry buttons still force a read.
- **Session slices are identity-stable.** An unrelated session's write does not change another session's
  array object, so a selector comparing by identity does not re-render it.

## Tests (reconstructed where the old contract no longer applies)

- New `tests/client/data/store-slices.spec.ts` (5): slice identity across unrelated writes, slice replacement,
  epoch-only-on-paint-inputs, per-session stale + union, in-flight exposure.
- `tests/client/data/actions.spec.ts` rewritten to the optimistic contract: conflict publishes the live
  record, failure rolls back and does **not** read the store, conflicted delete is rolled back, failed
  delete rolls back.
- Page/panel/bridge fixtures updated for the new snapshot fields; panel stale falls back to the union while
  the per-session map is empty (removed once the bridge always publishes per-session stale).
- Full suite: **32 files / 398 tests green**; `pnpm typecheck` clean.

## Deferred / partial

- The Host's `list` is still unbounded (Phase 2B).
- `revision` remains in the snapshot for compatibility; nothing in the client subscribes to it as a paint
  signal anymore. It is removed with the Phase-6 surface cleanup.
- The stale union remains for the page's "unanchored" filter until the global-orphan decision lands;
  `orphanedIds` plumbing is still dead (Phase 4/6 decision).

## Follow-up — transport status mapping and bounded retry

- `transport.ts` maps HTTP 401/403 → `forbidden`, 404 → `not-found`, 400/422 → `bad-request`, everything else
  → `transport` (instead of one generic failure).
- `HighlightsClient` reads retry **transient transport failures only**, with bounded backoff
  (`retryDelays`, default 300/900 ms, injectable so tests run at zero delay); typed refusals never retry.
  Superseded/aborted reads still return without touching the snapshot.
- New `tests/client/data/transport.spec.ts` covers both behaviours.
