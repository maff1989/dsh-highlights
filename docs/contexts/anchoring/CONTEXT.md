# Anchoring

**Classification:** Supporting · **Owns:** the Anchor value, Capture eligibility, the resolution
ladder, Resolution state, Re-anchor · **Map:** [CONTEXT_MAP](../../CONTEXT_MAP.md)

Anchoring binds a Highlight to the place in the Transcript it came from, and keeps that binding
honest as the Transcript changes beneath it. The Margin must outlive the Conversation, but the
Conversation is not ours: its Replies are re-rendered, regenerated, folded, paged out, archived and
deleted. Anchoring therefore records a selector rather than a location, resolves it when a surface
asks, and reports one of four Resolution states instead of pretending that a Highlight which cannot
be found has been lost. It owns how a Capture becomes an Anchor, how an existing Highlight finds its
passage again, and the deliberate act of attaching it to a new Anchor.

## Owns

- Capture eligibility: which text is Highlightable, which Reply occurrences can hold a Highlight,
  and what a Span and a Mark are allowed to designate.
- The **Anchor**: the durable value made of the identity of the Reply occurrence the Highlight came
  from, the verbatim Quote, up to 48 characters of Quote context on each side, and a versioned
  record of where the Quote sat inside that Reply's rendered text.
- The **resolution ladder** and the four **Resolution states**: Anchored, Unanchored, Archived,
  Unavailable.
- **Re-anchor**: attaching an existing Highlight to a new Anchor without changing anything else it
  carries.
- The domain contract of **Reveal**: what revealing a Highlight must land, and how it degrades when
  it cannot.

## Does not own

- The Highlight itself: its identity, Quote, kind, Colour, Tags, Note, Star, Author, Intent, State,
  Visibility, Provenance, Snapshot or Tombstone. Those belong to the [Margin](../margin/CONTEXT.md)
  context, which stores an Anchor without interpreting it.
- Painting, lists, browsing, search, filters, surfaces, Notices and the gestures that begin a
  Capture. Those belong to [Presentation & Resurfacing](../presentation/CONTEXT.md).
- When, where and by which control a Reveal or a Re-anchor is offered. Anchoring states what those
  acts must mean; Presentation owns the surface that asks for them.
- Whether the Agent may read a Highlight, and what an `anchored` flag means to it. That belongs to
  [Agent Access](../agent-access/CONTEXT.md).
- Durability, versioning, transport and retention of stored data. An Anchor travels inside a
  Highlight; keeping either of them is not Anchoring's concern.
- The Trajectory view, which is outside the domain: it exposes no Highlightable text and no place to
  paint one.

## Terms this context owns

The [glossary](../../UBIQUITOUS_LANGUAGE.md) is authoritative; this table only fixes how each term
is used here.

| Term | Used here to mean | Glossary |
|---|---|---|
| **Anchor** | The selector that binds a Highlight to a Reply occurrence; resolved on demand and never the Highlight's identity. | [§2](../../UBIQUITOUS_LANGUAGE.md) |
| **Quote context** | The bounded run of Reply text stored before and after the Quote, at most 48 characters each side. | [§2](../../UBIQUITOUS_LANGUAGE.md) |
| **Capture** | Turning a Selection into a Span, or a settled Reply into a Mark, producing one Anchor. | [§3](../../UBIQUITOUS_LANGUAGE.md) |
| **Highlightable** | Eligible to become a Highlight: the text of a settled Reply only. | [§3](../../UBIQUITOUS_LANGUAGE.md) |
| **Settled** | Finished and final; the only condition under which Reply text can be captured. | [§3](../../UBIQUITOUS_LANGUAGE.md) |
| **Resolution** | Finding the Transcript range an Anchor designates; reads only, never writes. | [§4](../../UBIQUITOUS_LANGUAGE.md) |
| **Resolution state** | Where a Highlight stands: Anchored, Unanchored, Archived or Unavailable. | [§4](../../UBIQUITOUS_LANGUAGE.md) |
| **Unanchored** | The canonical word for an Anchor that does not resolve now but may return. | [§4](../../UBIQUITOUS_LANGUAGE.md) |
| **Re-anchor** | Attaching an existing Highlight to a new Anchor without changing its identity or content. | [§4](../../UBIQUITOUS_LANGUAGE.md) |
| **Reveal** | Bringing the anchored passage — not merely its Reply — into view, best effort. | [§4](../../UBIQUITOUS_LANGUAGE.md) |

Span, Mark, Quote, Turn, Step, Session and Transcript keep their glossary meanings and are not
redefined here.

## Invariants

1. An Anchor designates one Reply occurrence and one passage within it. The same Anchor never
   resolves into two passages and never resolves in a Session other than the Highlight's owning
   Session.
2. A Highlight's Anchor is replaceable; the Highlight's identity, Quote, presentation fields and
   judgement attributes are not affected by Capture, Resolution, degradation or Re-anchor.
3. Resolution reads the Transcript and changes nothing: not the Transcript, not the Highlight, not
   its Resolution state as stored data. Resolution state is derived from the Transcript and the
   owning Session's facts, never stored as a claim.
4. Every Resolution state is a report, not an action. None of Anchored, Unanchored, Archived or
   Unavailable deletes, hides, edits, auto-re-anchors or re-colours a Highlight.
5. Only the text of a Settled Reply is Highlightable. Reasoning, user messages, Tool calls and their
   output, injected context, streaming or interrupted text, Composer text and the Trajectory view
   yield no Highlight.
6. A Capture is all or nothing: a Selection that is not wholly Highlightable produces no Anchor and
   no partial Highlight; a kept Agent-authored Highlight that cannot be found in rendered
   Highlightable text is refused in the same way.
7. The Quote stored in an Anchor is verbatim and never longer than 2 000 characters; the Quote
   context is never longer than 48 characters on either side.
8. A Reply occurrence has at most one Mark. Invoking Mark on an occurrence that already has one
   opens the existing Mark and creates nothing; a regenerated Reply is a new occurrence.
9. Resolution accepts a recorded position only when the Quote and its Quote context verify there;
   otherwise it falls through the ladder and may end Unanchored.
10. Re-anchor is permitted only while the Highlight's Quote still exists in its Reply, only within
    that Reply, and it changes the Anchor alone. Re-anchor never changes the Quote.
11. Reveal is best effort and never an error path. It never changes Resolution state, never scrolls
    a different Session's Conversation, and when it cannot land the passage the Highlight stays
    listed with its Quote and Quote context.
12. Resolution is deterministic for one rendered Transcript: the same Anchor resolved twice against
    the same rendering reports the same passage and the same Resolution state.

## Published contracts

| Contract | Consumer | Guarantee |
|---|---|---|
| **Anchor value** | [Margin](../margin/CONTEXT.md), which stores it opaquely | A value that designates the Reply occurrence, Quote, Quote context and a versioned position. Margin may hold it, hand it back and pass it to Anchoring, but never reads or alters its parts. |
| **Resolution state** | [Presentation & Resurfacing](../presentation/CONTEXT.md); [Agent Access](../agent-access/CONTEXT.md) receives only whether it is Anchored | Exactly one of Anchored, Unanchored, Archived, Unavailable, derived on demand. It never implies deletion and never carries a promise that the passage will stay found. |
| **Capture eligibility** | [Presentation & Resurfacing](../presentation/CONTEXT.md) | Only text of a Settled Reply is Highlightable; a Span covers one Selection inside one Reply; a Mark covers one whole Reply, at most once. Presentation may offer a Capture only over eligible text, and Mark only on a settled Reply. |
| **Reveal contract** | [Presentation & Resurfacing](../presentation/CONTEXT.md) | Reveal opens the owning Session, pages history as needed, and lands the anchored passage; when it cannot, it leaves the Session open and the Highlight listed, without an error path. |
| **Re-anchor operation** | [Presentation & Resurfacing](../presentation/CONTEXT.md); the surface that offers it is undecided | An existing Highlight may be attached to a new Anchor within its Reply, with identity, Quote, presentation fields and judgement attributes unchanged. |

## Consumed contracts

| Contract | Owner | What Anchoring takes |
|---|---|---|
| The **Quote**, the Highlight's kind and its owning Session and Reply identity | [Margin](../margin/CONTEXT.md) | The verbatim text the Anchor must find, whether the Highlight is a Span or a Mark, and the Session whose Transcript is the only place Resolution may look. |
| **Reply identity and rendered Reply text** | Conversation and Chat, an upstream neighbour named in [CONTEXT_MAP](../../CONTEXT_MAP.md) | Durable identity of a Reply occurrence, whether it is Settled, its Turn and Step position, whether a Step renders its Reasoning and answer as separate parts, and the text boundaries the Reader can select inside. |
| **Session facts and history paging** | Sessions & history, an upstream neighbour named in [CONTEXT_MAP](../../CONTEXT_MAP.md) | Whether the owning Session exists, whether it is archived, and the ability to page history back to a target Reply for Reveal. |

Anchoring depends on those three things and on nothing else. It does not know how the Transcript is
painted, what a surface displays, how a Highlight is stored or who may read it.

## Primary flows

**Capture.** A Settled Reply exposes Highlightable text. The Reader makes a Selection inside it, or
invokes Mark on the whole Reply. Anchoring verifies that the Reply text is eligible, identifies the
Reply occurrence, measures where the selected text sat, and records the Quote and its Quote context
from the same text. Ineligible sources produce no Highlight and no Anchor. A Capture that becomes a
Highlight does so through the Margin, which stores the Anchor opaquely.

**Resolution.** A surface needs to know where a Highlight stands. Anchoring checks the owning
Session's facts first, then attempts the ladder inside the identified Reply occurrence of the
rendered Transcript. It reports Anchored, Unanchored, Archived or Unavailable and a passage range
when it found one. It writes nothing and stores nothing; the next call resolves again against the
Transcript as it then is.

**Re-anchor.** A Highlight whose passage can no longer be found may be attached to a new Anchor that
designates the same Quote in the same Reply, once the Reader supplies one through a fresh Capture.
The Highlight keeps its identity, its Quote and everything the Reader judged about it; only the
Anchor changes. A Re-anchor that would change the Quote, cross into another Reply or Session, or
overwrite a newer version of the Highlight is refused.

**Reveal.** A surface asks to show a Highlight. Anchoring opens the owning Session, pages history
until the Reply occurrence is available, resolves the passage and brings that passage into view.
Reveal is bounded and best effort: a folded Turn, a missing Reply, an archived Session or a Session
that is gone ends the attempt without an error and without changing the Highlight. The Reader keeps
the Quote and its Quote context in the list.

## Degradation and failure modes

| Situation | What the Reader observes | What Anchoring does |
|---|---|---|
| Reply text shifted without changing the Quote | The Highlight still marks its passage, now in its new place | Falls through the ladder to a Quote match and reports Anchored |
| Reply regenerated, edited or shadowed | The Highlight remains listed with its Quote; it no longer marks text | Reports Unanchored; never transfers the Highlight to the new answer |
| Reasoning collapsed or expanded | A Highlight in the answer text is unaffected | Ignores Reasoning entirely: no Anchor can exist there |
| Turn folded, or history outside the loaded window | The Highlight is listed as Unanchored; Reveal leaves the Session open | Does not page or expand on its own; Reveal may page history |
| Owning Session archived | The Highlight is listed as Archived | Reports Archived; does not attempt the ladder |
| Owning Session deleted out of band | The Highlight is listed as Unavailable | Reports Unavailable; Reveal reports the outcome without an error |
| Earlier Turns compacted into a summary | The Highlight is listed as Unanchored, Quote intact | Reports Unanchored; resolves again if its Reply text returns |
| Two passages share the same Quote | Both Highlights are listed and each keeps its own passage | Uses Quote context to choose between matches, then the earlier passage on a tie |
| The reading rules for Reply text change with a version | Highlights still resolve by Quote and Quote context | Distrusts the recorded position of an older version instead of using it |
| A long Quote is bounded to 2 000 characters | The Highlight covers the whole Selection; the stored Quote is its leading part | Re-anchor relies on the stored part, so an edit beyond it can leave the Highlight Unanchored |
| The product cannot identify a Reply durably | That Reply exposes no Highlightable text | Offers no Capture there rather than storing an Anchor that can never be scoped |

No row deletes a Highlight, changes its Quote or edits what the Reader judged about it.

## Boundary rules

What this context may know:

- The owning Session of a Highlight, and that Session's existence and archived state.
- The identity, Settled state, Turn and Step position and rendered text of a Reply occurrence,
  including which part of a Step it is when a Step is split.
- The text boundaries the Reader may select inside a Reply, and the fact that Reveal may page
  history.
- The Highlight's Quote, kind and identity, which the Margin gives it.
- The reading rules this context itself versions, and the fact that a Transcript is rendered by
  someone else and may change.

What this context must not know or decide:

- How the Transcript is painted, annotated, laid out or made interactive; any rendering coordinate,
  markup detail, identity format or text-measuring mechanism.
- Which surface asked, what a Notice says, how lists filter or order, or how a degraded item looks.
- Colour, Tags, Note, Star, Author, Intent, State, Visibility or any other judgement about a
  Highlight.
- The vocabulary and concerns of every other context on the map, unless they appear among the
  consumed contracts above.
- Storage, transport, versions, retention, tombstones or freshness.
- That the Transcript is immutable, that history is always loaded, that a Reply always has a durable
  identity, that a Session always exists, or that a fold is always expandable.

## Deferred decisions

| Decision not made | Seam |
|---|---|
| Whether a Re-anchor may ever move a Highlight to a different Reply that happens to contain the same Quote | The Re-anchor operation states that the new Anchor must designate the same Quote in the same Reply; widening it changes that one rule. |
| Which Reader surface offers Re-anchor, if any | The Re-anchor operation is independent of any surface; Presentation may call it where it chooses. |
| Whether an ambiguous Resolution (several equally supported matches) should be its own state | The ladder already picks a deterministic match; a fifth state would extend Resolution state, not the Anchor. |
| Whether Archived outranks Unanchored whenever both are true | Resolution states are derived from Session facts and the ladder; the precedence order is stated in one place. |
| Whether Reveal may expand a folded Turn | The Reveal contract treats folding as a degradation; expanding would change the contract's limits, not the Anchor. |
| Whether Highlightable text could ever include Reasoning, Tool output or the Trajectory view | Eligibility is stated once, as a property of the Reply text; the exclusion is scope, not capability. |
| Whether Capture should be possible from a Reply the product cannot identify durably | Eligibility requires durable Reply identity; the Anchor's occurrence identity is the seam. |

## Documentation index

- [the Anchor model](specs/anchor-model.md) — what an Anchor is, what may be captured, and how a
  Capture becomes one.
- [Resolution and degradation](specs/resolution-and-degradation.md) — the ladder, the four
  Resolution states, Re-anchor, Reveal and the failure scenarios.
- [ADR-001 — an Anchor is a selector, not a pointer](adrs/001-anchor-is-a-selector-not-a-pointer.md)
- [ADR-002 — Unanchored is a legitimate state](adrs/002-unanchored-is-a-legitimate-state.md)

## Where the implementation record lives

The engineering record for the behaviour described here is in
[known-limitations.md](../../known-limitations.md) and
[implementation-notes.md](../../implementation-notes.md).
