# Phase 2B report — host query and recovery

Status: **implemented**; live 10 k/CI scale gate remains `[baseline]`.

## Delivered

| WP | Change | Where |
|---|---|---|
| 2.6 | `query` endpoint: server-side session/workspace/tag/starred/text filters, transcript-position ordering, opaque cursor pagination, summaries vs bodies, 2 MiB page byte bound, `limit` capped at 500 | `src/host/query.ts`, `src/shared/protocol.ts`, `src/host/route.ts` |
| 2.7 | Recovery/hardening: `invalidRecords: 'backup-and-skip'` on the domain; create is serialised with put-if-absent + atomic cap; Host stamps `origin` (ignores draft); `updatedAt` is monotonic; re-anchor validates immutable quote/kind; duplicate-id and invalid-reanchor map to `bad-request`; config bounds kept | `src/host/store.ts`, `src/host/route.ts`, `src/host/config.ts` |
| 2.8 | Client/transport query face: `HighlightsTransport.query`, `HighlightsClient.query` (surfaces migrate in Phase 6); shared route constant removes the twice-spelled path | `src/client/data/transport.ts`, `src/client/data/client.ts`, `src/shared/constants.ts` |

## Tests

- `tests/host/query.spec.ts` (6): filters, transcript ordering, 3-page cursor walk with no duplicates,
  malformed cursor, summary projection (no prefix/suffix/origin), 10 k-record page under the byte bound and
  gzip < 2 MiB, body page.
- `tests/host/route.spec.ts` (+2): query over the unchanged envelope; invalid payload → `bad-request`.
- `tests/host/store.spec.ts` (+5): `backup-and-skip` declared, Host-stamped origin, duplicate-id refusal,
  re-anchor immutability, monotonic `updatedAt`.
- `tests/client/data-client.spec.ts` (+1): `client.query` delegates without touching the snapshot.
- Full suite: **33 files / 412 tests green**; typecheck/build/bundle green.

## Notes and partials

- **Compression is bounded at the source.** Instead of gzip-encoding the HTTP reply (the Connection carrier
  owns response handling), the page is hard-bounded to 2 MiB; the 10 k test proves the gzip size is < 2 MiB.
  This satisfies the H10 byte gate without changing the wire envelope.
- **Corrupt JSON** is the storage-domain's responsibility once `backup-and-skip` is declared; malformed JSON
  is still read as absent by the library. The corrupt fixture in `tools/dev-instance` documents the expected
  post-2B behaviour; a live activation test needs the dev GUI.
- **Surfaces still use `list`.** Page/panel switch to `query` in Phase 6 (WP 6.2/6.3); `list` stays for
  compatibility and is removed from the client path only after that migration.
- The 10 k live page/filter gate is `[baseline]` (needs the seeded dev GUI); the host-side page bound and
  cursor tests are the deterministic half.

## Follow-up — client-side validation parity

- Every editor input now enforces the shared limits at input time: tags are capped at `MAX_TAG_CHARS`
  (card, panel and popover editors), notes at `MAX_NOTE_CHARS`, and tag lists at `MAX_TAGS` (existing).
- Quotes are captured with the existing anchor cap; the remaining parity gap is a disabled-save state before
  `hello` (the store's ready status is the practical guard because the page/panel don't render editors before
  a read).
