# Margin

**Classification:** Core · **Owns:** what a Highlight is, what may be recorded about it, and
what may change about it · **Map:** [CONTEXT_MAP](../../CONTEXT_MAP.md)

The Margin is the Reader's durable, private collection of Highlights over Agent Replies, and
the core domain of the product: every other context exists to capture into it, show it, hand
it forward or keep it durable. A Highlight that is not a Tombstone is called *live* in this
document. This document states the objects the Margin owns, the rules that never bend, the
contracts it publishes and the facts it refuses to know; its first reader is the Reader, and
the Agent is a guest admitted only through Agent Access.

## Owns

- **Highlight identity and kind.** One opaque identity per Highlight; the two kinds, Span and
  Mark; the rule that a Reply occurrence carries at most one Mark that is not a Tombstone.
- **The Quote.** What a Highlight covers, and the fact that the covered text never changes
  after capture.
- **Presentation fields.** Colour, Tag, Note and Star, with their fixed ceilings and their
  deterministic normalisation.
- **Judgement attributes.** Author, Intent, State and Visibility, with their defaults and the
  rules under which the Reader may change them.
- **Provenance.** Author plus the capture route, carried as a property of the Highlight.
- **Ownership and fallbacks.** The owning Session, the Snapshot, the Origin, the version.
- **Lifecycle rules.** Capture, edit, star, Delete to Tombstone, restore, the rule that purge is the
  only erasure, the rule that a full Margin refuses Capture, and the rule that every write names the
  version it read.

## Does not own

- **Where a Highlight sits in the Transcript.** Anchor construction, Quote context and
  resolution belong to [Anchoring](../anchoring/CONTEXT.md). The Margin stores an Anchor and
  never interprets one.
- **Anything the Reader sees or touches.** Surfaces, gestures, painting, lists, search,
  filters, Notices and every affordance that restores a Tombstone belong to
  [Presentation & Resurfacing](../presentation/CONTEXT.md).
- **Delivery.** Insertion, Pending insertion, Briefing, Attribution and Copy belong to
  [Delivery](../delivery/CONTEXT.md).
- **Who may read the Margin.** Access level, Access scope, Proposal handling and the Guest
  rule belong to [Agent Access](../agent-access/CONTEXT.md). The Margin states the per-item
  Visibility ceiling; it never enforces access.
- **Durability and distribution.** The store, its versions, the purge schedule, the cap
  mechanism, packaging and freshness belong to
  [Persistence & Distribution](../persistence/CONTEXT.md). The Margin states that a Tombstone
  survives until purge and that a full Margin refuses Capture; it does not own when, where or
  how either happens.
- **The Conversation.** Chat, Sessions, Workspaces, the composer and the Session log are
  upstream. The Margin never modifies them.

## Terms this context owns

| Term | In one line | Glossary |
|---|---|---|
| Highlight | One entry in the Margin: a Quote, presentation fields, judgement attributes, identity, version and optional Tombstone | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Span | A Highlight of a contiguous passage inside one settled Reply | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Mark | A Highlight of a whole Reply, at most one per Reply among its live Highlights | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Quote | The verbatim source text; immutable; the fallback identity when the Anchor no longer resolves | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Colour | One of five fixed themed slots; a presentation field | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Tag | A lowercase label, at most eight per Highlight; a presentation field | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Note | The Reader's commentary, at most 2000 characters; a presentation field | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Star | A boolean the Reader sets to flag a Highlight for attention | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Author | `user` (the default) or `agent`, the latter only through a kept Proposal | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Intent | The speech act: `note`, `dispute`, `direct` or `remember`; the default is `note` | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| State | `new` → `kept` → `compiled`, set only by explicit Reader action | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Visibility | The per-item ceiling `agent` (the default) or `private` | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Provenance | Author plus the capture route, as a property of a Highlight | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Tombstone | A deleted Highlight: hidden, retained with the moment of deletion, restorable | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Snapshot | Capture-time display values used only while the live Session cannot be resolved | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| Origin | The creating installation; never rendered | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |

## Invariants

1. **One object, one identity.** A Highlight is the only object the Margin stores. It has an
   opaque identity, one kind, one Quote and exactly one owning Session; none of these changes
   after capture.
2. **Two kinds, one model.** A Span covers a contiguous passage inside one settled Reply; a
   Mark covers a whole Reply. Both are Highlights and share every field and rule below. A
   Reply occurrence carries at most one Mark that is not a Tombstone, and any number of live
   Spans.
3. **The Quote never changes.** No Reader action, Agent action, edit or resolution outcome
   changes the text a Highlight covers. The only path to a different Quote is Delete and
   capture again.
4. **Presentation fields are bounded and normalised.** Colour is one of five fixed themed
   slots; a Highlight carries at most eight Tags of at most 32 characters each, lowercased,
   with any leading `#` removed and duplicates collapsed keeping first-use order; a Note holds
   at most 2000 characters; a Star is a boolean.
5. **Judgement has one owner.** Author is fixed at capture: `user` for a direct save and
   `agent` only through a kept Proposal. Intent, State and Visibility change only by explicit
   Reader action and are never derived from reading activity. No State is terminal, and
   `compiled` locks no other field.
6. **Visibility is a ceiling, never a grant.** `private` narrows what the installation Consent
   allows; no per-Highlight value widens it.
7. **Ownership does not migrate.** A Highlight belongs to the Session that owned its Reply at
   capture. A fork or child Session inherits nothing, and no resolution outcome, archival or
   deletion re-homes a Highlight.
8. **Delete is a Tombstone.** Delete hides the Highlight from every consumer, keeps its Quote
   and its identity, records the moment of deletion and is reversible. The only erasure is a
   purge after the retention window at the next Host start; no timer and no Reader action
   erases a Quote.
9. **Nothing is lost to the Transcript.** No Resolution state, regeneration, archival or
   out-of-band Session loss deletes, edits or hides a live Highlight; the Quote and the
   Snapshot keep it displayable.
10. **Every write is version-guarded.** A write carries the version the Reader read; a write
    against a stale version is refused, the live Highlight is returned, and the Reader's draft
    is kept for a reload or an overwrite.
11. **The cap refuses, never drops.** A full Margin refuses new Capture and says why; it never
    evicts or silently discards a stored Highlight.
12. **Snapshot is a fallback, Origin is silent.** Capture-time Session title and workspace are
    displayed only where the live value cannot be resolved; the Origin is never rendered.

## Published contracts

| Contract | Consumers | What the Margin promises |
|---|---|---|
| **Highlight** | [Anchoring](../anchoring/CONTEXT.md), [Presentation & Resurfacing](../presentation/CONTEXT.md), [Delivery](../delivery/CONTEXT.md), [Agent Access](../agent-access/CONTEXT.md), [Persistence & Distribution](../persistence/CONTEXT.md) | Identity, kind, Quote, Snapshot, Origin, version, timestamps and an optional Tombstone. It is the only object that is stored. |
| **Judgement attributes** | [Presentation & Resurfacing](../presentation/CONTEXT.md), [Agent Access](../agent-access/CONTEXT.md) | Author, Intent, State and Visibility, their defaults, and the rule that only the Reader changes them. |
| **Presentation-field ceilings** | [Presentation & Resurfacing](../presentation/CONTEXT.md) | Five Colour slots, eight Tags of at most 32 characters, a Note of at most 2000 characters, a boolean Star, and deterministic Tag normalisation. |
| **Tombstone and erasure rules** | [Presentation & Resurfacing](../presentation/CONTEXT.md), [Persistence & Distribution](../persistence/CONTEXT.md) | Delete hides and retains; restore is a version-guarded write; only purge after the retention window removes a Quote. |
| **Provenance** | [Presentation & Resurfacing](../presentation/CONTEXT.md), [Agent Access](../agent-access/CONTEXT.md) | Author plus the capture route, carried as a property of each Highlight and never as a separate object. |

What each consumer may do with those contracts, stated once: Presentation may read every field
and may change the presentation fields and judgement attributes; Delivery may read the Quote,
identity, State and Visibility and may never write; Agent Access may read under Consent and may
never write to an existing Highlight; Persistence receives whole Highlights to keep and interprets
none of them. No other consumer may write, and no consumer may change the Quote, the kind or the
owning Session.

## Consumed contracts

| Contract | Provider | What the Margin reads | What the Margin never does |
|---|---|---|---|
| **Anchor** | [Anchoring](../anchoring/CONTEXT.md) | One opaque Anchor value per Highlight | Interpret, repair, compare, build or replace one |
| **Resolution state** | [Anchoring](../anchoring/CONTEXT.md) | `anchored`, `unanchored`, `archived` or `unavailable` as a qualifier on a Highlight when it is read for a list | Store it in the Highlight, derive it, or let it delete or edit anything |
| **Consent ceiling** | [Agent Access](../agent-access/CONTEXT.md) | The installation Access level and Access scope as the outer bound that Visibility can narrow | Enforce access, hold the installation Consent, or make a visibility claim of its own |
| **Deployment limits** | [Persistence & Distribution](../persistence/CONTEXT.md) | The live-Highlight cap and the retention window as values to respect | Decide when a purge runs, or where and how Highlight data is kept |

## Primary flows

- **Capture a Span.** The Reader selects text in a settled Reply and saves it. The Margin
  admits one Highlight with the Quote, the owning Session, a Snapshot and an Origin, all
  presentation fields empty or defaulted, and the judgement defaults. A Capture that cannot
  be admitted — ineligible source, full Margin, refused write — stores nothing and reports the
  refusal.
- **Capture a Mark.** The Reader marks a whole settled Reply. The Margin records one Mark for
  that Reply occurrence and that Session; marking the same occurrence again resolves to the
  existing Mark instead of creating another.
- **Annotate.** The Reader changes Colour, Tags, Note, Star, Intent, State or Visibility. Each
  change is a version-guarded write that alters only the named fields; the Quote, identity,
  kind and owning Session are untouched.
- **Delete and restore.** The Reader deletes a Highlight; the Margin turns it into a Tombstone
  with the moment of deletion, so every consumer stops showing it while the Quote remains
  stored. A restore within the retention window makes the same Highlight live again, with the
  same identity and Quote and an advanced version.
- **Purge.** Once a Tombstone is older than the retention window, the next Host start removes
  it and its Quote. This is the only erasure, it is irreversible, and no Reader action and no
  timer performs it.
- **Serve a consumer.** When a consumer reads the Margin, it receives Highlights in the shape
  of the published contract, with the Resolution state supplied as a qualifier and Visibility
  as the ceiling. The Margin never supplies derived material: no lists, counts, reasons,
  surfaces or packets.

## Degradation and failure modes

| Failure | What the Reader observes | What never happens |
|---|---|---|
| The Margin is full | Capture is refused with a Notice that names the limit; nothing new is stored | A stored Highlight is evicted, overwritten or silently dropped |
| A write is based on a stale version | The live Highlight is shown with a choice to reload it or overwrite it with the draft | The draft is discarded, or the newer value is overwritten silently |
| An Anchor no longer resolves | The Highlight stays listed, searchable, copyable and editable; its Resolution state says so | The Highlight, its Quote or its judgement is deleted, hidden or rewritten |
| The owning Session is archived or cannot be found | The Highlight stays listed with its Snapshot and its Quote; Reveal may fail honestly | The Highlight is deleted, re-homed or edited |
| A Capture source is not eligible | No Highlight is stored and the refusal is stated | A Highlight is stored against a Reply it does not belong to |
| A Note exceeds its ceiling | The write is refused and the stored Note is unchanged | The Note is truncated in silence or the rest of the Highlight is lost |
| A Quote exceeds its ceiling | The Quote holds the first 2000 characters and the Highlight does not claim the rest | The Capture is dropped, or the Quote claims text it does not hold |
| A Tombstone is past the retention window | Nothing changes until the next Host start; the Quote then disappears permanently | A background timer or a Reader action erases a Quote |

## Boundary rules

**This context may know:**

- That a Highlight came from a settled Reply, and which Session owned that Reply at capture.
- An opaque Anchor value, and a Resolution state as one of four names when a Highlight is read.
- Its own presentation fields, judgement attributes, Snapshot, Origin and version.
- The deployment limits it must respect: the live-Highlight cap and the retention window.
- The installation Consent as the ceiling that a Visibility value narrows against.

**This context must not know:**

- Surfaces, gestures, painting, lists, counts, badges, digests, Resurfacing reasons or Undo
  affordances.
- Composers, Insertions, Pending insertions, Briefings, Attribution or Copy.
- Access levels and scopes beyond the ceiling it is handed, Proposals, Agent surfaces or
  model-facing vocabulary.
- Transport, routes, envelopes, storage layout, files, freshness or polling.
- Chat's node identity, DOM attributes, offsets, text projections or the resolution ladder.
- Page sizes, payload fields, locale strings or any other implementation identifier.

## Deferred decisions

| Decision deliberately not made | The seam that keeps it open |
|---|---|
| Whether a Mark and a Span may coexist on one Reply | The kind contract: uniqueness applies to Marks only, and Spans are unbounded, so the combination is a decision about the one-Mark rule rather than about the model |
| Whether a Highlight may ever move to another Session | Ownership is fixed by identity, so a re-home is a new Highlight: the decision changes a rule, not stored data |
| Whether Author may ever be reassigned | Provenance is a property of the Highlight, so a reassignment rule is a new fact about an existing object, not a new object |
| Whether user-defined colours or a larger palette exist | Colour is a slot from a fixed set, so a richer palette replaces the set and never the field |
| Whether Quotes longer than the ceiling are refused instead of truncated | Capture validates before a Highlight exists, so refusal can replace truncation without changing a stored Highlight |
| Whether retention may vary per Highlight | The Tombstone records the moment of deletion, so a per-item policy is additive |
| Whether cross-device sync and export exist | Identity, Origin, version, Tombstone and Snapshot are already in the published contract, so a sync decision needs no domain change |

## Documentation index

- [Highlight model](specs/highlight-model.md) — kinds, identity and ownership, the Quote,
  presentation fields and their ceilings.
- [Judgement model](specs/judgement-model.md) — Author, Intent, State, Visibility and
  Provenance, and the rules for changing them.
- [Lifecycle and erasure](specs/lifecycle-and-erasure.md) — capture routes, edit, star,
  Tombstone, restore, purge, cap and write conflicts.
- [ADR-001](adrs/001-quote-is-immutable.md) — the Quote is immutable after capture.
- [ADR-002](adrs/002-two-authors-one-model.md) — two authors share one Highlight model.
- [ADR-003](adrs/003-delete-is-a-tombstone-not-erasure.md) — delete is a Tombstone, not
  erasure.

## Where the implementation record lives

The observed behaviour and failure modes this document is measured against are recorded in
[known-limitations](../../known-limitations.md) and, case by case, in
[implementation-notes](../../implementation-notes.md); those engineering records carry status, this
document carries intent.
