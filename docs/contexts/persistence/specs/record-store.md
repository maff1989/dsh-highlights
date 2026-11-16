# Record store

**Status:** Accepted
**Context:** Persistence & Distribution
**Date:** 2026-11-15

## Definitions

- **Stored Highlight** — the durable form of one Highlight: its identity, the opaque record
  shape the Margin publishes, its version, its timestamps, its Origin, and an optional
  Tombstone marker. This specification calls it a *record* when speaking of storage and a
  *Highlight* when speaking of the domain object.
- **Record set** — the whole collection of records, read as one value together with the
  change indicator.
- **Version** — the per-Highlight counter a writer must name. An opaque value; nothing in
  this context depends on it forming a sequence a caller may compute.
- **Conflict** — the answer to a version-guarded write whose named version is no longer the
  stored one; it carries the live record.
- **Refusal outcome** — the answer that the store declined to write, for a reason the caller
  can act on, as distinct from a transport failure.
- **Tombstone** — a record holding its deletion moment, hidden from ordinary reads.
- **Retention window** — the deployment-configured period after which a Tombstone becomes
  eligible for purge.
- **Purge** — the irreversible destruction of expired Tombstones, performed only while the
  Host opens.
- **Live-record cap** — the deployment-configured maximum count of records that are not
  Tombstones.
- **Origin** — the installation identity stamped by the Host.
- **Admission** — the moment a candidate record becomes part of the record set.

## Constraints

- The harness storage facility is a document store: durable, versioned, per-document, with
  no queries and no transactions available to the plugin.
- Exactly one Host process owns the store. Cross-process locking and cross-process change
  notification are outside the guarantee.
- Reads must be answerable synchronously; opening a large store costs a full load, and the
  live-record cap is the bound on that cost.
- The record shape belongs to the [Margin](../../margin/CONTEXT.md). This context stores and
  validates the shape but must not interpret it.
- A write must be attributable to one installation, so a future syncer can reason about
  provenance without a domain change.
- The store must survive the plugin's own removal, upgrade and rollback without touching the
  stored bytes.

## Problem

The Margin is only worth anything if a Highlight survives the reload, the re-render, the
archival of its Session and the crash of the process that saved it. The obvious home for any
per-message annotation — the Session log — is exactly the wrong home for a durable private
collection: it exposes content to export and telemetry, it ties survival to the Session's
lifecycle, and an outside plugin cannot add an event type that a later read can safely
ignore. Equally, a naive durable store loses the Reader's work in a different way: two
windows editing one Highlight overwrite each other, a delete destroys the Quote irreversibly,
a full store silently refuses or silently evicts, and one corrupted document takes the whole
Margin down at the next start.

The record store exists to answer those failure modes with written guarantees rather than
good intentions: replacement without loss, deletion without erasure, a bounded store that
refuses honestly, and corruption that surfaces as an error instead of as silently wrong data.

## Solution

One durable document per Highlight, in a store owned by the single Host process. Reads are
served synchronously from authoritative in-memory state. Every accepted change advances the
record's version, so every write can name the version it was based on and a stale named
version can be refused as a value that carries the live record. Deleting marks a Tombstone;
Tombstones are retained for a deployment-configured window and destroyed only at the next
Host open. Admission is bounded by a deployment-configured live-record cap, and a capture
that would exceed it receives a refusal outcome and stores nothing. The Host stamps each new
record with the installation identity and validates the record shape on write; on open it
validates again, so a damaged document is isolated and reported rather than served.

## User Stories

- As a **Reader**, I want a Highlight I saved to still be there after a reload, a Session
  archive or a process restart, so that the Margin is worth building.
- As a **Reader**, I want two surfaces editing the same Highlight not to silently overwrite
  each other, so that I can trust the value I see.
- As a **Reader**, I want a delete to be undoable until the retention window has passed, so
  that a mistaken click does not cost me the Quote.
- As a **Reader**, I want a full store to tell me it is full, so that I know why a capture
  did not happen and what to do about it.
- As the [Margin](../../margin/CONTEXT.md)'s capture action, I want a definite answer — stored,
  refused, or conflicted — so that I can report a truthful outcome.
- As the [Margin](../../margin/CONTEXT.md)'s edit action, I want a stale write to return the
  live Highlight, so that the Reader can choose between the two versions.
- As the operator of a deployment, I want one damaged document not to disable the Margin, so
  that a single bad write cannot cost the Reader everything.
- As a future syncer, I want every record to carry identity, version, timestamps and Origin,
  so that provenance and conflicts can be reasoned about without a domain change.

## Acceptance Criteria

**Conflict**
1. **Given** a stored Highlight at version 3 and two windows that have both read it,
   **when** the first window writes with version 3 and the second then writes with version 3,
   **then** the second receives a conflict carrying the live Highlight at version 4, and the
   stored value is the first window's write.

**Cap refusal**
2. **Given** a store holding as many live records as the live-record cap allows,
   **when** a capture asks to store a new Highlight,
   **then** the store returns a refusal outcome, no record is added, and no existing record
   is dropped or altered.

**Cap counts only live records**
3. **Given** a store whose live records reach the cap and whose Tombstones are retained,
   **when** a capture asks to store a new Highlight,
   **then** the cap is evaluated against live records only, so the Tombstones do not cause
   the capture to be refused for that reason.

**Purge at the next Host start**
4. **Given** a Tombstone whose deletion moment is older than the retention window,
   **when** the Host opens the store,
   **then** that record is destroyed during the open and is absent from the first read after
   it.

**A Tombstone inside the window survives**
5. **Given** a Tombstone whose deletion moment is inside the retention window,
   **when** the Host opens the store,
   **then** the record is retained, remains restorable, and is still absent from ordinary
   reads.

**A damaged document at open**
6. **Given** one stored document whose shape no longer validates,
   **when** the Host opens the store,
   **then** that document is not admitted to the record set, an error naming it is reported
   to the operator, and the remaining valid records are served.

**A malformed write is refused**
7. **Given** a write whose record shape fails validation,
   **when** the store receives it,
   **then** the write is refused as inadmissible, nothing is stored, and no version advances.

**Crash after a durable write**
8. **Given** a write that has become durable and a process that stops before the caller
   receives the outcome,
   **when** the Host next opens and a surface reads the record set,
   **then** the Highlight is present with the version the store assigned, so the caller can
   reconcile by reading rather than by retrying blindly.

**A retried capture does not duplicate**
9. **Given** a capture that was stored but whose outcome never reached the caller,
   **when** the caller repeats the same capture with the same identity,
   **then** the store refuses it as a reused identity and no second record is created.

**Delete is a Tombstone**
10. **Given** a live Highlight,
    **when** the Reader deletes it,
    **then** the store writes a Tombstone carrying the deletion moment, the Highlight
    disappears from ordinary reads, and the record is restorable inside the retention window.

**Restore advances the version**
11. **Given** a Tombstone inside the retention window,
    **when** the Reader restores it,
    **then** the record returns to the live set with a version greater than the one it held
    when it was deleted.

**Serialised writes**
12. **Given** two writes arriving for one Highlight at the same version,
    **when** the store applies them,
    **then** exactly one is accepted and the other is a conflict, and no value that mixes the
    two writes is ever stored.

**Origin is stamped**
13. **Given** a capture whose payload names an installation identity,
    **when** the Host admits the record,
    **then** the stored Origin is the Host's own installation identity, not the supplied one.

## Implementation Decisions

- **One durable document per record.** A change rewrites one document; the store never
  serialises the whole collection to accept one write. This is what keeps a write and a
  delete O(1) in the size of the Margin and what makes the per-document validation boundary
  meaningful.
- **Memory-authoritative reads.** The Host holds the record set in memory and answers reads
  from it. Durability is a write-path property; the read path never touches durable storage.
- **Versions are compare-and-set counters carried on the record.** The store does not keep a
  separate version ledger: the value a caller names is the version field it read, and the
  store refuses the change if the stored field has moved. A caller never computes a version.
- **Refusals are values.** A stale version, a reached cap and an inadmissible identity are
  outcomes inside the answer, not raised transport failures; only an internal fault is a
  transport-level error. This keeps the transport from being the place where business
  outcomes are retried.
- **Admission is serialised.** Cap evaluation and identity admission happen on one write
  chain, so two concurrent captures cannot both pass a cap check and both land.
- **Deletion is a marked record, not a removed one.** The deletion moment is stored on the
  record and the version advances, so restores, purges and any future syncer share one
  representation.
- **Purge is a start-up duty, not a schedule.** The store has no timer. Opening the store is
  the only trigger, which makes the retention window a lower bound on how long bytes remain,
  never an upper bound.
- **Validation happens twice, on purpose.** The shape is validated before the durable write
  (so a malformed value never lands) and again when a document is read at open (so damage
  caused outside the plugin is caught). An invalid document is isolated and reported; the
  store opens with the valid remainder.
- **The cap is evaluated against live records only.** Tombstones are retained data, not
  capacity the Reader can use, and counting them would let a Reader with many deleted
  Highlights be refused for space they have already freed.
- **One writer is a contract, not a lock.** The store does not defend against a second Host
  process writing the same documents; the single-writer requirement is stated so that no
  consumer builds an expectation the store cannot meet.

### Deferred Decisions

| Decision | Seam |
|---|---|
| Storage engine and on-disk layout | The contract states durable CRUD and one document per Highlight; the engine sits behind it |
| Record-shape migration when the shape changes | Each record carries the shape marker it was written with, so a future open can distinguish shapes rather than guess |
| A syncer that consumes Tombstones and Origin | Reads can include Tombstones on request; identity, version, timestamps, deletion moment and Origin are already stored |
| Whether a cap refusal can ever offer eviction or archival as an alternative | The refusal is one outcome in one place; adding an alternative is a new outcome, not a store detail |
| Whether purge could run without an activation | Purge is an open-time duty with a single trigger; a scheduler would be a new decision about when irreversibility is allowed |

## Testing Strategy

- **Store contract tests** drive the store directly and assert the invariants: one document
  per record, durable-before-reported, version advancement, conflict values, cap refusal,
  Tombstone retention, purge boundary and Origin stamping. An injectable clock makes the
  retention boundary deterministic.
- **Concurrency tests** issue two writes at one version and assert exactly one acceptance and
  one conflict, and that no interleaved value is ever readable.
- **Crash simulation** rewrites a store after a durable write but before the outcome is
  reported, then reopens it and asserts the write is present and that a repeated capture with
  the same identity is refused rather than duplicated.
- **Corruption fixtures** place one document that violates the shape, reopen the store, and
  assert that an error is reported, the document is absent from the record set, and the valid
  remainder is served and writable.
- **Boundary tests** assert that a value accepted by the store is identical to the value the
  Margin supplied, that the store never mutates the payload, and that no field is interpreted.
- **Scale tests** exercise the cap and assert that admission and read cost stay bounded by
  it.

## Out of Scope

- What any stored field means, which values are valid domain values beyond the published
  shape, and which changes are permitted to a Highlight.
- Version-guarded writes that are decided by the domain: an edit, a re-anchor and a restore
  all use the same mechanism, but *which* of them a Reader may perform belongs elsewhere.
- Whether a tombstoned Highlight may be shown to the Reader, and for how long the Undo
  affordance is offered.
- Anchors, resolution and re-anchoring.
- Export, import, sync, backup and encryption.
- The transport and the freshness occasions (see
  [freshness and transport](freshness-and-transport.md)).

## Open Questions

None outstanding. The four questions this specification raised are resolved:

1. **A damaged document.** Isolation and reporting is the whole contract. The damaged document is
   never served as data, its existence is reported, and it is retained rather than discarded, so a
   future recovery path is possible — but no recovery path is promised, because a recovery tool is
   an operator surface this plugin does not own.
2. **The retention clock.** It is measured from the deletion moment. Each deletion writes a deletion
   moment, so a restored Highlight that is deleted again starts a new window; a change to a Tombstone
   other than restoring it is not a change because a Tombstone is not editable.
3. **A store "full" of Tombstones.** The cap counts live Highlights only, so Tombstones can never
   cause a refusal; when the live cap is reached, the refusal is the ordinary cap refusal, and the
   purge at the next open is irrelevant to admission.
4. **Refusals other than a stale version.** Only a stale version is a conflict. A restore of a
   purged or absent record is a not-found refusal, and a restore of a Highlight that is already live
   is refused as invalid; neither is a conflict and neither is silently treated as success.
