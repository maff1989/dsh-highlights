# Lifecycle and erasure

**Status:** Accepted
**Context:** Margin
**Date:** 2026-11-15

## Definitions

Terms used in their glossary sense are not redefined here; see the
[glossary](../../../UBIQUITOUS_LANGUAGE.md). This specification belongs to the
[Margin context](../CONTEXT.md), whose boundaries are mapped in
[CONTEXT_MAP](../../../CONTEXT_MAP.md).

| Term | Meaning |
|---|---|
| **Live Highlight** | A Highlight that is not a Tombstone: listed, edited, counted, delivered and exposed under Consent. |
| **Retention window** | The configured interval, defaulting to 30 days, that a Tombstone must be older than before a purge may remove it. |
| **Purge pass** | The removal of eligible Tombstones and their Quotes, performed once at a Host start and at no other time. |
| **Admission** | The act of accepting a Capture into the Margin: eligibility, the cap, validation and the version-guarded write, all before the Highlight exists. |
| **Draft** | The Reader's uncommitted change on a surface, held by that surface when an edit is refused, never stored by the Margin. |

## Constraints

1. A Highlight has exactly three lifecycle situations: live, Tombstoned, purged. Only three
   transitions exist — Delete, restore and purge — and no other field records life or death.
2. A Capture is admitted only by a valid route: a direct save by the Reader, or a kept Proposal.
   Both go through the same Admission, which applies the whole model and the cap before the
   Highlight exists.
3. An edit changes presentation fields and judgement attributes only, one named change at a
   time, and never the Quote, identity, kind or owning Session.
4. A Star is a presentation field set by explicit action and persists immediately. Starring is
   not processing: it never changes State, and a starred Highlight at `new` State remains `new`.
5. Delete creates a Tombstone. The Highlight disappears from every consumer, its Quote and
   identity are retained, and the moment of deletion is recorded. Deletion is reversible.
6. Restore clears the Tombstone, keeps the same identity and Quote, preserves every
   presentation field and judgement attribute, and advances the version.
7. Nothing is erased by Delete, by restore, by any Reader action, by the cap, by age, by a
   Resolution state, by archival or by a missing Session.
8. Purge is the only erasure. It removes a Tombstone and its Quote only when the Tombstone is
   older than the retention window, and only in the Purge pass at a Host start. There is no
   timer, and a Tombstone may therefore persist for the retention window plus the time until the
   next Host start.
9. Purge is irreversible and is not a Reader action. After it, no consumer can read the Quote,
   the identity or any other part of the removed Highlight.
10. The Margin holds at most a configured number of live Highlights. An Admission that would
    exceed the cap is refused and says so; no stored Highlight is evicted to make room, and
    Tombstones do not count towards the live cap.
11. Every mutation is version-guarded. A write carries the version the Reader read; a write
    against a stale version is refused, the live Highlight is returned, and the Reader's Draft
    is preserved with a choice of reload or overwrite.
12. A refused write changes nothing. There is no partial write, no optimistic stored value and
    no state in which a Highlight claims a change that was not accepted.
13. Resolution state, regeneration, archival and out-of-band Session loss never delete, edit or
    hide a live Highlight. They change only the Resolution state that qualifies it.
14. Refusals are ordered and deterministic: eligibility first (is the source Highlightable?), then
    admission (is the live-record cap reached?), then validation (is the write well formed?). The
    first failing check is the one the Reader is told about, and no later check can change that.

## Problem

The Margin holds two duties that pull in opposite directions. It must never lose a Highlight by
accident: reading is long, attention is scarce, and a lost passage is the exact failure the
product exists to prevent. It must also be able to remove content the Reader no longer wants,
including content sensitive enough that its mere retention is a risk. A naive lifecycle satisfies
one duty by betraying the other — deleting immediately makes a misclick unrecoverable, while
hiding a deleted Highlight forever makes "delete" a claim the product cannot back. The same
tension appears at the edges: a cap that drops old Highlights to admit new ones is silent data
loss, and a write that merges concurrent edits is silent corruption. The lifecycle has to name
each guarantee precisely, state its weakest case, and make every removal an explicit,
irreversible act with one named cause.

## Solution

The lifecycle is a small, honest state machine over one Highlight: live, Tombstoned, purged.
Delete moves a Highlight to Tombstoned — hidden everywhere, retained in full, recoverable by
restore, with the moment of deletion recorded. Purge is the only transition that erases, it is
not a Reader action, and it happens only in a startup pass after a configurable retention
window, so the worst case is stated rather than discovered: a Quote can outlive its deletion for
the window plus the time until the next Host start. Everything else is a write: presentation
edits, judgement changes, starring and restore all carry the version the Reader read, so a lost
race is refused with the live Highlight handed back rather than merged. A full Margin refuses
new Captures instead of evicting anything. And the fate of a Session — archived, regenerated,
deleted out of band — never reaches the lifecycle at all: it changes a Resolution state, never
existence.

## User Stories

- As a Reader, I want a deletion I did not mean to be recoverable, so that a misclick does not
  cost me a passage I cared about.
- As a Reader, I want a deleted Highlight to stop appearing everywhere at once, so that Delete
  means what it says in every place I look.
- As a Reader, I want to know that a sensitive passage is actually removed eventually and by
  what route, so that I am not relying on a promise the product cannot keep.
- As a Reader, I want a full Margin to refuse a new Highlight rather than throw away an old one,
  so that the cap never becomes silent data loss.
- As a Reader, I want my edit preserved when another window has changed the same Highlight, so a
  conflict costs me a decision and not my work.
- As a Reader, I want a Highlight to survive a regenerated Reply, an archived Session or a
  Session file I deleted, so that the state of the Conversation never decides the state of my
  margin.
- As a consumer context, I want one rule for what "deleted" means, so that no surface has to
  invent its own filter.

## Acceptance Criteria

**AC-1 — Delete hides a Highlight but retains it**
- **Given** a live Highlight whose Quote is "the replica is promoted last"
- **When** the Reader deletes it
- **Then** it becomes a Tombstone with the moment of deletion recorded, hidden from every
  consumer, and its Quote and identity unchanged.

**AC-2 — Restore brings the same Highlight back**
- **Given** a Tombstone whose Quote is "the replica is promoted last", with Tags and a Note
- **When** the Reader restores it
- **Then** it is live again with the same identity, the same Quote and the same presentation
  fields and judgement attributes, and its version has advanced.

**AC-3 — A Tombstone inside the window survives a Host start**
- **Given** a Tombstone deleted 10 days ago and a retention window of 30 days
- **When** the Host starts
- **Then** the Tombstone and its Quote remain stored and restorable.

**AC-4 — A Tombstone past the window is purged at the next Host start**
- **Given** a Tombstone deleted 31 days ago and a retention window of 30 days
- **When** the Host starts
- **Then** the Tombstone and its Quote are removed
- **And** no consumer can read the Highlight, its Quote or its identity afterwards.

**AC-5 — Nothing is purged while the Host keeps running**
- **Given** a Tombstone that is past the retention window and a Host that has not restarted
- **When** time passes with the Host running
- **Then** nothing is purged and the Tombstone remains restorable until the next Host start.

**AC-6 — Delete never erases a Quote**
- **Given** a Highlight the Reader wants gone permanently
- **When** the Reader deletes it
- **Then** only a Tombstone is created and its Quote remains stored
- **And** erasure remains a Purge after the retention window, never a Reader action.

**AC-7 — A full Margin refuses a new Capture**
- **Given** a Margin holding the configured maximum number of live Highlights
- **When** the Reader captures another
- **Then** no Highlight is stored, the refusal names the limit, and every stored Highlight is
  unchanged.

**AC-8 — Deleting frees capacity for a new Capture**
- **Given** a full Margin and a live Highlight the Reader no longer needs
- **When** the Reader deletes that Highlight
- **Then** the number of live Highlights falls below the cap, so the next Capture is admitted
- **And** the Tombstone remains stored and restorable.

**AC-9 — A stale edit is refused and the draft preserved**
- **Given** a Highlight read at one version and changed in another window since
- **When** the Reader saves an edit from the stale version
- **Then** the write is refused, the live Highlight is returned, and the Reader's Draft is preserved
  with a choice of reload or overwrite.

**AC-10 — Overwrite re-applies the draft against the live Highlight**
- **Given** a refused stale edit whose Draft is still held
- **When** the Reader chooses overwrite
- **Then** the Draft is applied against the live version and only the fields the Reader changed
  are altered.

**AC-11 — An archived Session does not delete its Highlights**
- **Given** a Highlight whose owning Session is archived
- **When** the Margin is read
- **Then** the Highlight remains a live Highlight with its Quote and judgement unchanged, and
  its Resolution state is `archived`.

**AC-12 — A lost Session does not delete its Highlights**
- **Given** a Highlight whose owning Session was deleted out of band
- **When** the Margin is read
- **Then** the Highlight remains live, its Quote and Snapshot are still displayable, and its
  Resolution state is `unavailable`.

**AC-13 — A regenerated Reply does not delete its Highlights**
- **Given** a Highlight whose Reply has been regenerated so that its Anchor no longer resolves
- **When** the Margin is read
- **Then** the Highlight remains live with its Quote unchanged and its Resolution state is
  `unanchored`.

**AC-14 — A refused write leaves nothing behind**
- **Given** a Capture or an edit whose write is refused by the boundary
- **When** the refusal is reported
- **Then** no Highlight or field change is stored, and the Reader sees the refusal rather than a
  saved-looking result.

**AC-15 — Starring never implies processing**
- **Given** a Highlight at State `new`
- **When** the Reader stars it
- **Then** its Star is stored as true and its State remains `new`.

## Implementation Decisions

The decision that Delete is a Tombstone rather than erasure is recorded in
[ADR-003](../adrs/003-delete-is-a-tombstone-not-erasure.md).

1. **One state machine per Highlight.** Live, Tombstoned and purged are the only situations, and
   Delete, restore and purge are the only transitions. There is no second lifecycle field and no
   "archived Highlight" state; archival belongs to the Session.
2. **Delete is a write, not a removal.** The Tombstone marker records the moment of deletion and
   advances the version, which is what makes version-guarded restore and a startup purge
   possible.
3. **Purge is a startup pass, not a daemon.** It compares each Tombstone's recorded deletion
   moment with the configured retention window, runs once per Host start, and is idempotent, so
   an interrupted pass is safe to repeat.
4. **Restore is an ordinary version-guarded write** that clears the Tombstone marker; a stale
   restore is refused exactly like a stale edit.
5. **The cap is counted at Admission over live Highlights only.** The check happens before the
   write, and the refusal is a value the Reader can act on; no eviction path exists.
6. **Admission is all-or-nothing.** The whole Highlight is validated and admitted before it is
   stored, so a refused Capture never leaves a partial or default-filled object behind.
7. **A conflict is returned as a value, not thrown away.** The refusal carries the live
   Highlight so a consumer can offer reload or overwrite; the Draft is never reconstructed or
   guessed by the Margin.
8. **Session fate is consumed as a qualifier only.** The lifecycle has no transition that
   reacts to archival, regeneration or a missing Session; those arrive as Resolution states and
   change nothing that is stored.
9. **Purge removes the whole Highlight.** There is no partial erasure that keeps the identity or
   the metadata while dropping the Quote; after purge nothing of the Highlight is readable.

### Deferred Decisions

| Decision deliberately not made | The seam that keeps it open |
|---|---|
| Whether the Reader may ever request a purge directly | The Tombstone records the moment of deletion, so an explicit erasure action could be added as a Reader action with its own confirmation, without a new lifecycle situation |
| Whether the retention window may differ per Highlight | Every Tombstone carries its own moment of deletion, so a per-item policy is a comparison change only |
| Whether stored Tombstones need a bound of their own | The cap is defined over live Highlights; a second bound over Tombstones is additive and would not change delete or restore |
| Whether restore is offered after the window but before the purge | The purge pass is the boundary, so a restore inside that interval is a surface policy, not a domain change |
| Whether a Tombstone's Quote may be scrubbed earlier than the purge | Scrubbing would be a transition that does not exist in the current state machine and needs its own decision |
| Whether an unanchored Highlight may be re-anchored to a new Reply | Re-anchor belongs to Anchoring and preserves identity, so it never becomes a lifecycle transition |

## Testing Strategy

- **State machine.** Every legal and illegal transition between live, Tombstoned and purged,
  with the version and timestamps asserted after each.
- **Retention boundaries.** A Tombstone at window − 1 day, exactly at the window, and window + 1
  day; a Host start and a Host that keeps running; an injected clock so nothing waits on wall
  time.
- **Purge idempotency.** A pass repeated after an interruption removes the same eligible set once
  and never touches a live Highlight.
- **Cap boundaries.** Cap − 1, cap and cap + 1 live Highlights; a capture refused at the cap;
  a delete followed by an admitted capture; Tombstones never counted.
- **Concurrency.** Two writers, one version apart, for edit, star, delete and restore; assert the
  refusal carries the live Highlight and the earlier write survives.
- **No-automatic-deletion property.** For a matrix of Resolution states, archival, regeneration,
  a full cap and a missing Session, assert the stored set is unchanged.
- **Erasure completeness.** After a purge, assert the Highlight, its Quote and its identity are
  unreachable from every consumer, and that no Tombstone remains.
- **Star and State non-derivation.** Star and unstar, and assert State is untouched in both
  directions.

## Out of Scope

- How Delete, restore or Undo are offered, and which surfaces carry which action: Presentation &
  Resurfacing owns them.
- The Notice that reports a refusal, a conflict or a limit.
- Where Highlight data is kept, how the purge pass relates to the store, and how a startup is
  detected: Persistence & Distribution owns them.
- Transport errors and retries.
- Session archival policy and Session deletion; the Margin only observes their consequences.
- What happens to an Insertion or a Pending insertion whose Highlight is later deleted:
  Delivery owns its queue and expiry.
- Sync, export and import.

## Open Questions

None outstanding. The four questions this specification raised are resolved:

1. **Tombstone recoverability.** It is unconditional: every Tombstone is restorable. Which surface
   offers Undo is a presentation decision and may differ by surface; the recoverability invariant
   may not. The Margin never states an affordance.
2. **Delete versus an in-flight delivery.** Deleting does not revoke an accepted Pending insertion:
   the queue holds its own copy of the text, which has already left the Margin, and the Composer
   dock keeps it visible so the Reader can see it. Cancelling a pending insertion is a Delivery
   decision, recorded as deferred there, not a Margin rule.
3. **Refusal precedence.** Eligibility, then admission, then validation (constraint 14), so the same
   Capture always produces the same refusal.
4. **Purge wording.** Canonical wording is "when the store next opens", which is a Host start in
   practice; documents may say "a Host start" parenthetically but must not promise a timer.
