# Highlight model

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
| **Live Highlight** | A Highlight that is not a Tombstone — the only kind that is listed, edited, counted, delivered or exposed under Consent. |
| **Capture route** | The path by which a Highlight entered the Margin: a direct save by the Reader, or a kept Proposal. |
| **Presentation field** | Colour, Tag, Note or Star: a field the Reader may change at will. |
| **Judgement attribute** | Author, Intent, State or Visibility: a field the Reader owns but changes only under the judgement model. |
| **Ceiling** | A fixed bound on a field's value or count, checked on every write after normalisation. |
| **Opaque identity** | An identity with no domain-readable structure: consumers may compare, store and echo it, never parse it. |

## Constraints

1. A Highlight is one object with one opaque identity. It is the only object the Margin
   stores; Provenance, Snapshot, Origin, the Quote and the Tombstone are properties of it,
   not objects beside it.
2. Kind is fixed at capture. A Span covers one contiguous passage inside one settled Reply; a
   Mark covers a whole Reply occurrence. A Reply occurrence carries at most one Mark that is not
   a Tombstone, and
   any number of live Spans.
3. The Quote is verbatim and bounded at 2000 characters. A Selection longer than the ceiling
   yields a Quote of the first 2000 characters; the Highlight does not claim the remainder.
4. Colour is one of five fixed themed slots — 1 Amber, 2 Green, 3 Violet, 4 Blue, 5 Red — and
   Violet is the quick-capture default when the Reader has expressed no colour preference.
   There is no sixth slot and no user-defined colour.
5. Tags: at most eight per Highlight, at most 32 characters each, stored lowercase, with any
   leading `#` removed as input sugar, internal whitespace collapsed, and duplicates
   collapsed keeping first-use order. Tags are an ordered list, not a set.
6. Note: at most 2000 characters. Star: a boolean.
7. A Highlight belongs to exactly one Session — the Session that owned the Reply when it was
   captured. Ownership is never inferred from a fork, a child Session or a later Session.
8. A Highlight carries a Snapshot of the Session title and workspace identity taken at
   capture, an Origin naming the creating installation, and a version. Snapshot values are
   fallbacks; Origin is never rendered; the version is opaque to the Reader.
9. Defaults on capture: the Reader's most recently used Colour, or slot 3 (Violet) when none is
   recorded; no Tags, no Note, Star false, Author `user`,
   Intent `note`, State `new`, Visibility `agent`.
10. The Margin knows nothing of surfaces, gestures, lists, composers, tools, transport or
    storage layout, and no rule here depends on any of them.

## Problem

A reading produces a Highlight that has to outlive the text it came from and stay trustworthy
while it does. Two failures are possible and equally bad. If nothing about a Highlight may
change, the Reader cannot organise what they noticed and the Margin becomes a pile of
identical entries. If too much may change, the Highlight stops being evidence: an edited Quote
would cover text the Reply never contained, a relocated Highlight would claim a Session it
never belonged to, and a reassigned Author would let the Agent's judgement pass as the
Reader's. The model has to draw one line, place every field on the right side of it, and hold
that line for every consumer.

## Solution

A Highlight is a single immutable core wrapped in three thin layers. The immutable core is
identity, kind, Quote and owning Session: capture fixes them, and nothing afterwards touches
them. The presentation layer — Colour, Tags, Note, Star — is the Reader's to reshape at will
within fixed ceilings. The judgement layer — Author, Intent, State, Visibility — is also the
Reader's, but changes only by explicit action and under rules the judgement model states. A
fourth, fallback layer — Snapshot and Origin — exists so the Highlight can still be displayed
and reasoned about when the live Session cannot answer.

The model earns its keep by being boring: every consumer reads the same shape, no consumer
can express a change that no Reader made, and a write that loses a race is refused rather
than merged. The caps and normalisation rules are part of the model, not of any surface,
because a limit that a surface enforces is a limit another surface forgets.

## User Stories

- As a Reader, I want a saved passage to stay exactly the text I selected, so that the Highlight
  is evidence of what the Reply said.
- As a Reader, I want to colour, tag, note and star a Highlight without any risk of changing
  what it covers, so that organising and accuracy never trade against each other.
- As a Reader, I want a whole Reply bookmarked once, so that marking it again reminds me
  rather than duplicating it.
- As a Reader, I want my Highlights to stay with the Session where I made them, so that a
  fork or a child Session is a clean copy of the conversation and not a copy of my margin.
- As a Reader, I want a Highlight to remain readable when the Reply changes, so that the
  value of what I noticed does not depend on the transcript staying still.
- As a Reader, I want the Agent's kept Proposals to appear as Highlights with the same rules,
  so that I judge them the way I judge my own.
- As a consumer context, I want one published Highlight shape, so that I never have to know
  how the Margin stores or validates it.

## Acceptance Criteria

**AC-1 — A Span holds exactly the selected text and takes the defaults**
- **Given** a settled Reply containing "the migration must run once before the replica is
  promoted" and a Selection of "the migration must run once"
- **When** the Reader captures it
- **Then** one Highlight is stored, of kind Span, whose Quote is exactly "the migration must
  run once"
- **And** its Colour is slot 3 because no Colour preference is recorded, it has no Tags and no Note,
  its Star is false, its Author is
  `user`, its Intent is `note`, its State is `new` and its Visibility is `agent`.

**AC-2 — A Mark covers a whole Reply and nothing else**
- **Given** a settled Reply in the Session titled "Refactor plan" with no Mark
- **When** the Reader marks the Reply
- **Then** one Highlight is stored, of kind Mark, whose Quote is the Reply text used to
  identify it, owned by that Reply's Session
- **And** its presentation fields and judgement attributes take the same defaults as a Span.

**AC-3 — Marking the same Reply again finds the existing Mark**
- **Given** a Reply with one live Mark
- **When** the Reader marks the Reply again
- **Then** no second Highlight is created and the existing Mark is presented.

**AC-4 — A deleted Mark does not block a new one**
- **Given** a Reply whose only Mark has been deleted and now exists as a Tombstone
- **When** the Reader marks the Reply again
- **Then** a new live Mark is stored
- **And** the earlier Tombstone is unchanged and still restorable.

**AC-5 — A presentation edit changes only what was edited**
- **Given** a Span whose Quote is "the migration must run once" and whose Colour is slot 3
- **When** the Reader changes the Colour to slot 4
- **Then** the stored Colour is slot 4 and the version has advanced
- **And** the Quote, identity, kind, Author and owning Session are unchanged.

**AC-6 — A Colour outside the palette is refused**
- **Given** a Highlight whose Colour is slot 2
- **When** a write attempts to set the Colour to slot 6
- **Then** the write is refused, the stored Colour remains slot 2, and the refusal is stated.

**AC-7 — Tags are normalised deterministically**
- **Given** a Highlight with no Tags
- **When** the Reader saves the Tags `#Release`, `release`, `  run   book  ` and a 40-character
  Tag
- **Then** the stored Tags are lowercase, carry no leading `#`, collapse internal whitespace,
  collapse the duplicate keeping first-use order, and cut the long Tag to 32 characters.

**AC-8 — The Tag ceiling is eight**
- **Given** a Highlight carrying eight Tags
- **When** the Reader adds a ninth Tag
- **Then** the ninth Tag does not enter the Highlight and the eight stored Tags are unchanged.

**AC-9 — A Note beyond its ceiling is refused, not cut**
- **Given** a Highlight whose Note is "checked against the review"
- **When** the Reader saves a Note of 2001 characters
- **Then** the write is refused and the stored Note is unchanged.

**AC-10 — There is no way to change what a Highlight covers**
- **Given** a Highlight whose Quote is "the replica is promoted last"
- **When** the Reader attempts to edit the covered text
- **Then** no operation exists that changes the Quote, and the Highlight is unchanged
- **And** the only route to a different Quote is Delete and capture again.

**AC-11 — Ownership survives a fork**
- **Given** a Highlight captured in Session A, which is then forked into Session B
- **When** the Margin is read in the context of Session B
- **Then** Session B inherits no Highlight from Session A
- **And** the Highlight still belongs to Session A.

**AC-12 — A Selection longer than the Quote ceiling is truncated at capture**
- **Given** a Selection of 2500 characters inside a settled Reply
- **When** the Reader captures it
- **Then** a Highlight is stored whose Quote is the first 2000 characters of the Selection
- **And** the Highlight does not claim the remaining 500 characters.

**AC-13 — An ineligible source stores nothing**
- **Given** a Selection over Reasoning text, or over a Reply that is still streaming
- **When** the Reader attempts to capture it
- **Then** no Highlight is stored and the refusal is stated.

**AC-14 — A Snapshot is used only when the live Session cannot answer**
- **Given** a Highlight whose live Session cannot be resolved
- **When** the Highlight is read for a list
- **Then** the Session title and workspace recorded in its Snapshot are shown as fallbacks,
  never as a claim about the live Session.

**AC-15 — The Origin is never rendered**
- **Given** a Highlight created on an installation whose Origin is recorded on it
- **When** the Highlight is read by any consumer
- **Then** the Origin is carried as a property and no Reader-facing value is derived from it.

## Implementation Decisions

The decision that the Quote never changes is recorded in
[ADR-001](../adrs/001-quote-is-immutable.md).

1. **One module owns the whole object.** Identity, kind, Quote, presentation fields, judgement
   attributes, Snapshot, Origin and Tombstone are parts of one Highlight; there is no separate
   provenance object, no separate Snapshot object and no separate Anchor object in the Margin.
2. **Capture is one operation with two sources.** A Selection and a whole Reply both assemble
   a Highlight through the same admission path; the only differences are the kind and the
   extent of the Quote. A Mark is therefore a Span's twin, not a second model.
3. **Absence carries the default.** A judgement attribute is stored only when the Reader has
   set it; reading a Highlight resolves absence to the default. A Highlight that has never been
   judged therefore holds no judgement state to interpret.
4. **Normalise, then check the ceiling.** Tag normalisation runs before the ceiling check, so a
   Reader never loses a write to a leading `#` or a case difference; a Note is checked as
   submitted and refused when it is too long, because cutting prose changes its meaning.
5. **Mark uniqueness is a scoped check.** It considers the owning Session, the Reply identity
   and Highlights that are not Tombstones. It is never a global check on the Quote.
6. **The Quote travels with the Anchor.** The Margin publishes the Quote; Anchoring binds it to
   the Reply. A Highlight whose Anchor cannot resolve still holds, displays and copies its
   Quote.
7. **Snapshots are written once.** A Snapshot is recorded at capture and never refreshed by a
   read; resolving a live Session is the consumer's business, not the Margin's.
8. **The Origin is stamped, not computed.** It names the installation that created the
   Highlight and exists so a future sync can reason about provenance; nothing in the Margin
   branches on it.
9. **Every mutation names the version it read.** The model has no partial merge: a write either
   applies to the version the Reader saw or is refused and hands back the live Highlight.

### Deferred Decisions

| Decision deliberately not made | The seam that keeps it open |
|---|---|
| Whether a Quote longer than the ceiling is refused rather than truncated | Capture admits a Highlight only after validation, so refusal can replace truncation without touching a stored Highlight |
| Whether Spans and Marks may overlap on one Reply | The kind contract bounds Marks only; overlapping coverage is a rule about Span capture, not a field |
| Whether a Snapshot may ever be refreshed | A Snapshot is defined as capture-time evidence; refreshing it would make it a cache, which is a different field with a different meaning |
| Whether Tag order carries meaning beyond first use | Tags are an ordered list, so a sort or a priority rule is additive |
| Whether a Highlight may exist without an owning Session | Ownership is part of identity; a Session that cannot be found is expressed as an `unavailable` Resolution state, not as a missing owner |
| Whether the Origin is ever displayed | The Origin is retained as a property, so displaying it later is a presentation decision with no domain change |

## Testing Strategy

- **Normalisation tables.** One table per presentation field: Tag inputs covering leading `#`
  runs, mixed case, repeated internal whitespace, duplicates, empty Tags and a 40-character
  Tag; each row states the stored value.
- **Boundary pairs.** Eight and nine Tags, 2000 and 2001 characters for a Note, 2000 and 2001
  for a Quote, Colour slots 1, 5, 0 and 6, and an empty Selection.
- **Invariant properties.** For a generated sequence of edits, assert after each successful
  write that the Quote, identity, kind, owning Session and Author are unchanged, and that the
  version strictly advances.
- **Mark uniqueness.** Repeat marking, marking after Delete, marking after restore, marking
  the same Reply through two Sessions, and marking a Reply with an existing Span.
- **Admission.** Ineligible sources, a full Margin, and a write refused by version all leave
  the stored set unchanged.
- **Consumer contracts.** Presentation can change every presentation field and no immutable
  field; Delivery and Agent Access receive the same shape and cannot express a write.
- **Fallbacks.** Snapshot precedence over the live Session and the reverse, with the Origin
  present but never selected for display.

## Out of Scope

- Selecting, clamping or validating a Selection: the Capture eligibility rules belong to
  Anchoring.
- Building, resolving or re-anchoring an Anchor, and the resolution ladder.
- Painting, lists, search, filters, filters' counts, Resurfacing reasons, Notices, Undo and
  every other surface concern.
- Insertion, Pending insertion, Briefing, Attribution and Copy.
- Access levels, scopes, Proposals, the Agent surface and model-facing vocabulary.
- Storage layout, durability, the cap mechanism, retention scheduling, transport and freshness.
- Sync, export, import and print.
- Locale strings and error copy.

## Open Questions

None outstanding. The five questions this specification raised are resolved, and the ruling is
recorded in the constraint or glossary entry that carries it:

1. **Quote ceiling.** The glossary now states that a Quote is bounded at 2000 characters and that a
   longer Selection stores its first 2000 — the Highlight never claims text it did not store. The
   alternative (refusing the Capture) is rejected because it trades a fast capture for a wordier
   refusal of a rare case.
2. **"Live Highlight".** Adopted as a cross-context term in the glossary; a Highlight that is not a
   Tombstone is the only kind listed, counted, delivered or exposed under Consent.
3. **Ceiling symmetry.** The asymmetry is intended: a Tag is a label and is normalised (a long Tag is
   cut), a Note is prose and is refused rather than silently truncated (constraint 6).
4. **Capture Colour default.** The Reader's most recently used Colour is the default; Violet is the
   fallback only when the Reader has expressed no preference (constraint 4 and the glossary).
5. **Concurrent Mark creation.** The invariant is at most one live Mark per Reply occurrence. A
   second Mark request resolves to the existing Mark; two writes that both claim the place are a
   defect at the boundary, not an accepted race. The Margin does not relax the invariant to fit a
   window-scoped check.
