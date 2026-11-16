# ADR-001 — The Margin is stored outside the Session log

**Status:** Accepted · **Context:** Persistence & Distribution · **Date:** 2026-11-15

## Context

The harness's Session log is the append-only durable record of session events, and it is what
the product exports, reads back to reconstruct a Session, and lets ride telemetry. An event
type contributed by an outside plugin cannot be declared safe to ignore, so a Session log
containing one is not guaranteed to reconstruct after the plugin is removed. At the same
time, the Margin must outlive the Conversation: a Highlight keeps its identity and Quote when
its Session is archived, deleted or regenerated. A durable home that is rebuilt from the
Session's lifecycle is therefore the wrong home for it.

## Decision

Store each Highlight in the plugin's own durable record store, under its own identity, outside
the Session log. The store's guarantees — durability, versions, Tombstones, the cap — are the
only thing the Margin's survival rests on.

## Why

- **Appending highlight events to the Session log** was rejected: an event type the harness
  cannot mark ignorable breaks reconstruction, uninstalling the plugin would damage the
  Session's own record, and Quote text would ride export and telemetry rather than stay local.
- **Keeping the Margin inside a Session's own stored data** was rejected: the Session is the
  harness's to own, archive and delete, and a Highlight must survive all three.
- **Keeping it only in the browser's local storage** was rejected: clearing site data would
  erase the Margin, no other process could read it, and it would have no durable capacity.
- **A second collection synchronised from the log** was rejected for the same reconstruction
  and export reasons, and because it would make the Margin's identity depend on log replay.

## Consequences

- A Highlight survives reload, re-render, Session archive, Session deletion and regeneration.
- The Margin is absent from Session export, Session replay, telemetry and the harness's own
  backup story; the plugin owns no export of its own either.
- Removing the plugin is safe for the Reader's Sessions and leaves the Margin untouched.
- The store must carry its own cap, retention window, purge and freshness model, because
  nothing in the harness supplies them for this data.
- Delete can only be a Tombstone with a retention window, not immediate erasure; the purge at
  a Host open is the only irreversible removal.
- It becomes hard to reconstruct the Margin from anything else: a damaged store is the only
  copy, so boundary validation and per-record isolation are load-bearing rather than tidy.
- A future cross-device sync or export is a new mechanism on top of the store, not a flag on
  an existing log.

## References

- [CONTEXT_MAP](../../../CONTEXT_MAP.md) — the Persistence boundary and the external
  neighbours; [Record store](../specs/record-store.md);
  [ADR-002](002-local-first-single-user-trust.md).
- Glossary: [Session log](../../../UBIQUITOUS_LANGUAGE.md) §9,
  [Margin](../../../UBIQUITOUS_LANGUAGE.md) §2.
