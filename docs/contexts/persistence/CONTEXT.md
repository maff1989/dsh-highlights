# Persistence & Distribution

**Classification:** Generic · **Owns:** the record store, the plugin's own transport,
freshness, packaging and upgrade, deployment configuration ·
**Map:** [CONTEXT_MAP](../../CONTEXT_MAP.md)

Persistence & Distribution keeps the Margin durable, reachable and installable. It stores
Highlights without reading them, carries them between the two halves of the plugin, tells
surfaces when their view may be out of date, and owns how the plugin is installed,
configured and upgraded. It is a generic subdomain: every context depends on it, no
context's language describes it, and it holds no domain judgement.

## Owns

- **Durability.** One durable document per stored Highlight; a write has reached durable
  storage before its outcome is reported.
- **The record set.** Synchronous reads from the Host's authoritative in-memory state,
  with one change indicator; no queries and no transactions.
- **Versions.** A version on every stored Highlight and a version-guarded write; a stale
  version is refused as a **conflict value** carrying the live Highlight.
- **Tombstones.** Retention of a deleted Highlight for a retention window, restoration
  inside that window, and purge of expired Tombstones at the next Host open.
- **The live-record cap.** Admission control on new captures, with a refusal outcome when
  the cap is reached.
- **The installation identity** stamped on every stored Highlight as Origin.
- **Single-writer serialisation** inside the one Host process.
- **Boundary shape validation** on write and on open — the exception the map records for
  this context, and the only judgement it makes about a Highlight.
- **The plugin's own authenticated transport** between the browser half and the Host.
- **Freshness.** The occasions on which a surface refreshes, the freshness window, and the
  bounded-staleness rule that replaces a push channel.
- **Packaging, upgrade and rollback** at the activation boundary, including tolerance of a
  version difference between the two halves and protocol negotiation.
- **Deployment configuration.** The knobs a deployment sets, their defaults, and their
  separation from Reader-owned Consent.
- **The privacy consequences** of storing Highlights as local user content.

## Does not own

- **What a Highlight is or means**: identity, kind (Span or Mark), Quote, Colour, Tags,
  Note, Star, Author, Intent, State, Visibility, Provenance and Snapshot. These belong to
  the [Margin](../margin/CONTEXT.md), which publishes the Highlight contract consumed here
  as an opaque shape.
- **Whether an Anchor resolves**, the resolution ladder and every Resolution state. These
  belong to [Anchoring](../anchoring/CONTEXT.md); an Anchor is stored and returned
  uninterpreted.
- **Consent**: Access level, Access scope and per-item Visibility. These belong to
  [Agent Access](../agent-access/CONTEXT.md), and this context never reads them as
  configuration.
- **Which Highlights deserve attention**, Resurfacing reasons and every Reader-facing
  surface or Notice. These belong to [Presentation & Resurfacing](../presentation/CONTEXT.md).
- **Insertion, Pending insertion, Briefing, Attribution behaviour and Copy.** These belong
  to [Delivery](../delivery/CONTEXT.md); this context supplies the values they read.
- **Capture gestures, painting, the Transcript, Session lifecycle, workspace identity, the
  Session log, export, telemetry and backup policy.** These are the Reader's surfaces or
  the harness's.
- **Encryption at rest, per-record authorisation and cross-device sync.** No mechanism here
  owns them; the Deferred decisions table names the seams that keep each reachable.

## Terms this context owns

These are machinery terms. Each states a **contract**, and each borrows its surrounding
vocabulary from the [glossary](../../UBIQUITOUS_LANGUAGE.md) rather than redefining a
domain word. *Record* and *document* are this context's machinery nouns for what the store
holds; a record is never a synonym for a Highlight in a domain sentence (§10 of the
glossary).

| Term | Contract stated here | Glossary |
|---|---|---|
| **Host half** | The process that owns the durable store and answers the browser half. There is exactly one writer. | machinery |
| **Browser half** | The in-browser part of the same package; it owns no durable state and reads through the Host. It may run a different version. | machinery |
| **Record store** | The durable, versioned collection of stored Highlights. It is a document store, not a database: no queries, no transactions, one document per Highlight. | [§9 Storage domain](../../UBIQUITOUS_LANGUAGE.md#9-borrowed-vocabulary-dsh-owned-never-redefined-here) |
| **Read** | A synchronous answer from the Host's authoritative in-memory state. A read never waits on durable storage and never observes a record the store has not accepted. | machinery |
| **Durability** | A write has reached durable storage before its outcome is reported to the caller. | machinery |
| **Version** | A per-Highlight counter that advances on every accepted change. It is the value a writer must name; its format is opaque. | machinery |
| **Version-guarded write** | A write that names the version its author read. If the stored version has moved, the write is refused, never applied on top of the newer value. | machinery |
| **Conflict** | The refusal value of a stale version-guarded write, carrying the live Highlight. It is a business outcome, not a transport failure. | machinery |
| **Refusal outcome** | A first-class answer that the store declined a write (for example, the live-record cap is reached), distinct from a transport failure. | machinery |
| **Change indicator** | A monotonic value that advances when the record set changes, so a surface can tell whether a read it holds is still up to date. | machinery |
| **Tombstone** | The stored form of a deleted Highlight: retained with its deletion moment, hidden from ordinary reads, restorable until purged. Deletion itself is a domain act; retention and purge are this context's. | [§2 Tombstone](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| **Retention window** | How long a Tombstone is kept before it becomes eligible for purge. A deployment knob. | [§2 Tombstone](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| **Purge** | Irreversible removal of expired Tombstones. It happens only while the Host opens, is not a Reader action, and can never be undone. | [§10 Delete / purge](../../UBIQUITOUS_LANGUAGE.md#10-collisions-and-rulings) |
| **Live-record cap** | The maximum number of stored Highlights that are not Tombstones. A deployment knob; at the cap, a new capture is refused. | machinery |
| **Origin** | The installation identity the Host stamps on a stored Highlight. The glossary owns the term's role in provenance; here it is installed metadata. | [§2 Origin](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| **Freshness** | The guarantee that a surface's view of the record set is refreshed on defined occasions and is otherwise **explicitly** potentially stale. It is best effort and bounded, never absolute. | machinery |
| **Freshness window** | A short interval after a successful read inside which a non-forced refresh is skipped. | machinery |
| **Activation boundary** | The moment a process adopts the installed plugin set. An install, upgrade, rollback or deployment-configuration change takes effect at the next activation, not before. | machinery |
| **Deployment configuration** | The knobs whoever composes the profile sets: the live-record cap, the retention window, Attribution on insertion, and the optional refresh interval. It is not Consent. | machinery |
| **Wire addition** | A field added to the exchange between the halves. Every wire addition is optional by construction, and every consumer tolerates its absence. | machinery |
| **Protocol negotiation** | The exchange of version numbers at the halves' first contact. A mismatch is refused with a stated outcome rather than interpreted. | machinery |
| **Owner Peer** | The authenticated peer on the connection. The channel admits the owner and nobody else, and it provides no per-record authorisation. | [§9 Connection / Peer](../../UBIQUITOUS_LANGUAGE.md#9-borrowed-vocabulary-dsh-owned-never-redefined-here) |

## Invariants

1. **One document, one Highlight.** Each stored Highlight occupies its own durable document;
   a write or a delete rewrites one document, never the whole store.
2. **Durable before reported.** A write is durable before its outcome reaches the caller.
   A caller that never receives an outcome may still find the write applied.
3. **Reads are memory reads.** A read answers synchronously from the Host's authoritative
   state, never from a partial or unaccepted value.
4. **Every Highlight has a version.** A stored Highlight without a version is not admitted;
   an absent version is an error, not a default.
5. **Versions advance on accepted change only.** A refused change leaves the version and the
   stored value untouched.
6. **A stale write is a value.** A version-guarded write against a stale version returns a
   conflict carrying the live Highlight; it never overwrites and never becomes a transport
   error.
7. **Delete is a Tombstone.** A deleted Highlight is retained with its deletion moment,
   hidden from every ordinary read, and restorable inside the retention window.
8. **Purge happens at open only.** A Tombstone is destroyed only during a Host open, and
   only once its deletion moment is older than the retention window; no timer destroys a
   record.
9. **The cap is admission control.** At the live-record cap, a new capture is refused with a
   refusal outcome, nothing is stored, and nothing already stored is dropped. Tombstones do
   not consume the cap.
10. **One writer.** All store writes are serialised by the single Host process; two writes
    to one Highlight can never interleave inside the record.
11. **Origin is stamped, not supplied.** The Host writes the installation identity; a caller
    cannot claim another installation's identity.
12. **The shape is validated at the boundary on write and on open.** A record that fails
    validation is refused on write and never served as data on open; corruption surfaces as
    an error, and the valid records stay served.
13. **A read that races a local write does not publish a superseded snapshot.** It repeats,
    a bounded number of times, and on exhausting the bound publishes its answer — so
    staleness is bounded, not eliminated.
14. **No push channel.** No mechanism delivers a change to a surface unprompted; a surface
    must treat its view as potentially stale between the defined refresh occasions.
15. **Deployment configuration is not Consent.** No deployment knob grants, widens or
    narrows what the Agent may read.
16. **Uninstall leaves data.** Removing the plugin from the profile leaves every stored
    Highlight intact; reinstalling restores them.
17. **The halves may differ in version.** A browser half may be newer than a running Host;
    consumers tolerate an absent optional field, and protocol negotiation bounds the
    difference they will interpret.
18. **Activation is the boundary.** A deployment change, an install, an upgrade or a
    rollback takes effect only at the next activation of the Host, while a browser half
    updates without a Host restart.

## Published contracts

| Contract | Consumers | What it guarantees |
|---|---|---|
| **Record store** | the [Margin](../margin/CONTEXT.md), through its actions | Durable, one-document-per-Highlight writes; synchronous reads; versions and version-guarded writes with conflict as a value; Tombstone retention and purge at open; the live-record cap as a refusal outcome; single-writer serialisation; Origin stamping; shape validation at the boundary. |
| **Freshness** | [Presentation & Resurfacing](../presentation/CONTEXT.md), the [Margin's](../margin/CONTEXT.md) actions | The defined refresh occasions (activation, after a local write, on reconnect, on window focus inside the freshness window, an optional fixed interval while visible); the freshness window; bounded best-effort staleness; the in-flight read rule; the explicit absence of a push channel. |
| **Deployment configuration** | the [Margin](../margin/CONTEXT.md) (cap, retention), [Delivery](../delivery/CONTEXT.md) (Attribution), [Presentation & Resurfacing](../presentation/CONTEXT.md) (refresh interval) | The set of knobs and their defaults; a configuration change takes effect at activation; no knob carries or overrides Consent. |
| **Distribution and upgrade** | every context, by way of the [Profile](../../UBIQUITOUS_LANGUAGE.md#9-borrowed-vocabulary-dsh-owned-never-redefined-here) | One package installed as a bundle; activation as the install/restart boundary; uninstall preserves stored Highlights; mixed-version tolerance; protocol negotiation. |
| **Privacy statement** | [Agent Access](../agent-access/CONTEXT.md) (what it may claim about storage), [Presentation & Resurfacing](../presentation/CONTEXT.md) (truthful statements) | Highlights are local user content, stored unencrypted under the Reader's profile with the same trust model as workspace and Session data; nothing leaves the machine; there is no export, print or sync; delete is a Tombstone, not erasure, and the [Margin's erasure rules](../margin/CONTEXT.md) govern what the Reader is promised. |

## Consumed contracts

This context consumes shapes and facilities, never domain judgement. The map's dependency
matrix gives Persistence no dependency edge on any domain context; the record shape crosses
as inbound **data**, not as a dependency.

| Contract | Provider | What crosses |
|---|---|---|
| **Highlight record shape** | the [Margin](../margin/CONTEXT.md) | The fields to store, version and validate, received as an opaque value. The store never interprets them; shape validation is the boundary exception the map records. |
| **Authenticated channel and owner-Peer fence** | the harness's Connection (borrowed vocabulary) | Authentication and the peer fence. The channel supplies no per-record authorisation and no actor identity. |
| **Storage domain** | the harness's storage facility (borrowed vocabulary) | Durable, versioned, per-document plugin storage. It is a document store: no queries, no transactions. |
| **Profile composition and deployment configuration values** | the harness's Workspace & Profile (borrowed vocabulary) | The installed plugin set and the values a deployment sets; the plugin never edits the profile. |
| **Lifecycle and channel signals** | the harness runtime (borrowed vocabulary) | The moments at which the Host half opens and closes its store, and the moment the browser half learns that its channel was re-established. |

## Primary flows

**A capture becomes durable.** The browser half hands the store a complete new record. The
Host admits it only below the live-record cap and only under a fresh identity, stamps the
installation's Origin and the Host clock, validates the shape, and writes it durably. Only
then does it report the stored record with its first version. The browser half has already
shown a provisional value; the confirmed record replaces it.

**A read.** The browser half asks for the record set with a change indicator. The Host
answers from memory, synchronously, filtering Tombstones out unless they are asked for. No
durable access happens on the read path.

**An edit or a restore.** The caller names the version it read. If that version is still the
stored one, the change is validated, the version advances, and the write is durable before
the new value is reported. If it is not, the caller receives a conflict carrying the live
Highlight; the surface shows the newer value and lets the Reader decide, rather than
silently losing one of the two changes.

**A delete, then Undo, then purge.** A delete stores a Tombstone and reports the tombstoned
record. An Undo inside the retention window restores it with a new version. Nothing destroys
the stored bytes until a Host open finds the deletion moment older than the retention
window; that purge is the only irreversible removal, and it is not reachable from a surface.

**A surface becomes fresh.** The browser half reads at activation, after each of its own
confirmed writes, when its channel reconnects, when its window regains focus outside the
freshness window, and on an optional fixed interval while a Highlights surface is visible.
A read that sees a local write land during its flight repeats instead of publishing a
pre-write snapshot, up to a bounded number of attempts. A surface that has not refreshed
since one of those occasions says so, and never claims its view is up to date.

**Install, upgrade, uninstall.** A package is installed as a bundle into the Reader's
profile. The running Host keeps the plugin set it activated with; the next activation
adopts the new set and opens the store with that version's configuration. Uninstalling
removes the bundle and leaves the store untouched, so reinstalling finds the Margin again.
A browser half can be newer than the Host and updates without a Host restart, which is why
every wire addition is optional.

## Degradation and failure modes

| Failure | What the Reader or consumer observes | What the context guarantees |
|---|---|---|
| Host unreachable, or the plugin not mounted in the running process | Surfaces keep the last records they read, marked as offline; writes fail with a transport outcome | No destructive action; displayed data is not erased; a reconnect forces a refresh |
| Live-record cap reached | A refusal outcome on capture, with an explanation | Nothing stored, nothing evicted, the cap counts only live records |
| Stale version on write | The live Highlight returned as a conflict | No overwrite; the caller can re-read and retry |
| Store full of Tombstones | Nothing visible; the store is smaller after a later open | Purge only at open; bytes persist for the retention window plus the time until the next activation |
| A record's shape does not validate at open | An error is reported to the operator; the rest of the Margin stays usable | The bad record is never served as data; valid records are served |
| A second Host process writes the same store | Each process sees its own view; neither notifies the other | Outside the guarantee: one writer is the contract, not an enforced lock across processes |
| Another window writes | The change appears when this window regains focus, or at the next poll tick | Bounded staleness; no spontaneous delivery |
| Browser half newer than the Host | Absent optional fields are treated as absent, with the documented fallback | Consumers do not fail on an unknown-to-them absence |
| Protocol numbers disagree | The first exchange is refused with a stated outcome | No guessing, no partial interpretation |
| Deployment configuration changed | The old values hold until the Host is activated again | A restart is the boundary; the Reader is not affected silently |

## Boundary rules

**This context may know:** the record shape (identity, version, timestamps, Tombstone
marker, Origin, opaque payload), the deployment knobs, the trust facts of the channel, the
activation and connection lifecycle, and the freshness occasions.

**This context must not know:** what a Highlight means; which fields represent judgement; how
an Anchor resolves; what Consent has been granted; which surfaces exist; why a write is
wanted. It must not rank, filter by meaning, interpret the payload, or decide that one
Highlight matters more than another. It holds no Reader-facing vocabulary.

**The one exception**, recorded in the
[map](../../CONTEXT_MAP.md#18--any-context--persistence--distribution): the Host validates the
record shape at the boundary before persisting and before serving. That is a
boundary-validation duty, not a licence to own a domain rule; the shape belongs to the
[Margin](../margin/CONTEXT.md) and this context only enforces that what is stored is
well-formed.

## Deferred decisions

| Deferred decision | Seam that keeps it open |
|---|---|
| Whether freshness is ever pushed to a surface | The freshness contract names refresh occasions and a change indicator, not a mechanism; a push channel would add an occasion, not change a surface's obligation |
| Transport mechanism (the plugin's own channel versus a harness-supplied typed call) | The record-store contract is transport-agnostic; the adapter between the store and the exchange belongs to this context |
| Storage engine and layout | The record-store contract states durable CRUD and one document per Highlight; layout stays behind it |
| Export, import and cross-device sync | Identity, version, updated-at, deletion moment and Origin are already stored, so a syncer could reason about provenance and conflicts without a domain change |
| Encryption at rest | The privacy statement and the single-user trust decision are stated in one place; adding encryption changes the trust boundary and is a new decision, not a store detail |
| Per-record authorisation and actor identity | The owner-Peer fence is the stated boundary; adding an actor would change the trust decision in [ADR-002](adrs/002-local-first-single-user-trust.md) |
| Record-shape migration across plugin versions | Each stored record carries the shape marker it was written with, so a future open can distinguish shapes instead of guessing |
| Whether the live-record cap or the retention window may be set per Reader rather than per deployment | Deployment configuration is deliberately one place; making it Reader-owned would fold it into Consent |

## Documentation index

| Document | What it settles |
|---|---|
| [Record store](specs/record-store.md) | One document per Highlight, durability, versions, conflict, Tombstones, purge, the cap, serialisation, Origin, shape validation |
| [Freshness and transport](specs/freshness-and-transport.md) | The authenticated channel, owner-Peer trust, outcomes as values, the refresh occasions, bounded staleness, stale and reconnect obligations |
| [Distribution and upgrade](specs/distribution-and-upgrade.md) | Packaging, the activation boundary, uninstall and reinstall, deployment configuration versus Consent, mixed versions, protocol negotiation |
| [ADR-001](adrs/001-margin-is-outside-the-session-log.md) | Why the Margin is stored outside the Session log |
| [ADR-002](adrs/002-local-first-single-user-trust.md) | Why local first, single user, and the owner Peer is the whole trust boundary |
| [ADR-003](adrs/003-deployment-configuration-is-not-consent.md) | Why deployment configuration never carries Reader-owned Consent |

## Where the implementation record lives

The engineering record — observed failure modes, deviations with reasons and the
verification evidence — lives in [known-limitations](../../known-limitations.md) and
[implementation-notes](../../implementation-notes.md).
