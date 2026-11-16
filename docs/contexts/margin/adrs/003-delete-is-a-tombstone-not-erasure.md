# ADR-003 — Delete is a Tombstone, not erasure

**Status:** Accepted · **Context:** Margin · **Date:** 2026-11-15

## Context

Delete must satisfy two duties: a mistaken deletion must be recoverable, because the Margin is the
only copy of what the Reader noticed, while a sensitive Quote must eventually stop existing. The
platform offers no secure erase and no process the plugin may rely on to run it later.

## Decision

Delete creates a Tombstone: hidden everywhere, retaining its Quote and identity, recording when it
was deleted, and restorable. The only erasure is a purge after a configurable retention window,
defaulting to 30 days, once at the next Host start.

## Why

- **Immediate erasure loses the undo the product promises.** A misclick would be unrecoverable, and
  the commonest delete is the correction of a mistake.
- **Hiding forever makes Delete a lie.** Retaining a sensitive Quote indefinitely while telling the
  Reader it was deleted trades trust for a saving that is not the point.
- **A timer needs a process that does not exist.** A timed purge would depend on the Host staying
  up and could not be tested against a stated bound; a startup pass is deterministic, idempotent
  and observable. Secure overwrite is rejected for the same reason: the platform does not promise
  it.

## Consequences

- A sensitive Quote can persist for the retention window plus the time until the next Host start;
  every description of deletion must state this and the Reader must not rely on Delete for
  immediate secrecy.
- Restore must remain possible until the purge, so a Tombstone keeps everything: Quote, Anchor,
  Snapshot, presentation fields and judgement attributes.
- Tombstones grow until purged — excluded from the live cap but not from storage or load — and a
  consumer that forgets to filter them surfaces deleted content. Purge is irreversible and is not
  a Reader action, so the interval and its trigger are the whole guarantee.

## References

- [CONTEXT](../CONTEXT.md), [CONTEXT_MAP](../../../CONTEXT_MAP.md),
  [glossary §10 ruling on Delete](../../../UBIQUITOUS_LANGUAGE.md#10-collisions-and-rulings)
- Specified in [Lifecycle and erasure](../specs/lifecycle-and-erasure.md); the store decision is
  ADR-005 in `../../../../../ADRS.md`.
