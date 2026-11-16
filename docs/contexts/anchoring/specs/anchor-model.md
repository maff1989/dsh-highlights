# The Anchor model

**Status:** Accepted
**Context:** Anchoring
**Date:** 2026-11-15

The Anchor is the durable binding between a Highlight and the place in the Transcript it came from.
This specification defines what an Anchor records, which text may become one, and how a Capture
produces it. It does not define how an Anchor is resolved; that belongs to
[Resolution and degradation](resolution-and-degradation.md).

## Definitions

Only terms that are specific to this feature are defined here. Anchor, Quote, Quote context, Span,
Mark, Capture, Highlightable, Settled, Reply, Turn, Step, Session, Conversation, Transcript,
Selection, Reasoning, Tool call, Trajectory view and Composer keep the meanings given in the
[glossary](../../../UBIQUITOUS_LANGUAGE.md).

| Term | Meaning |
|---|---|
| **Reply occurrence** | The rendered appearance of one Reply that a Capture came from: which Turn and Step the Reply answers, and, when the product renders a Step's Reasoning and its answer as separate parts, which part. Only the answer part is an occurrence a Highlight can be captured from. |
| **Recorded position** | The versioned part of an Anchor that says where inside the Reply's rendered text the Quote sat, measured by Anchoring's own reading rules. A position is a hint that Resolution must verify, never a promise. |
| **Reading-rule version** | The version of the rules Anchoring uses to read a rendered Reply as text. A recorded position is meaningful only against the version it was measured with. |
| **Regenerated Reply** | A Reply produced again for the same Step after an earlier answer. The new Reply is a different Reply occurrence; Highlights recorded against the earlier answer are not transferred to it. |
| **Shadowed Reply** | An earlier answer the product no longer renders because a newer answer occupies the Step. Its text may or may not remain reachable in the product. |
| **Folded Turn** | A Turn whose Reply bodies the product is not rendering. Text inside a Folded Turn is not Highlightable and not resolvable at that moment. |
| **History window** | The range of Turns the product has loaded into the rendered Transcript at that moment. |
| **Compaction** | The product condensing earlier Turns of a Conversation into a summary or other reduced form, so the original Reply text may no longer be rendered. |
| **Quote cap** | The bound of 2 000 characters on the Quote an Anchor stores. It bounds what is recorded, never what the Reader selected. |

## Constraints

1. **The Transcript is not ours.** Conversation, Reply identity, rendering and change are owned by
   the product around the plugin. Its rendering may change under us at any version boundary, and no
   public capability to scroll or reveal is promised.
2. **Not every Reply has a durable identity.** A Reply must be identifiable before a Highlight can
   be scoped to it. When the product exposes no durable identity for a Reply occurrence, that Reply
   offers no Highlightable text.
3. **Only a Settled Reply is Highlightable.** Eligibility is a property of the Reply text, not of
   the Reader's gesture, the surface that offered it, or the colour chosen.
4. **One Span comes from one Selection inside one rendered text part of one Reply occurrence.** A
   Selection that begins or ends outside the Reply's own text — in another Reply, in Reasoning, in
   Tool output, in message chrome or in the Composer — is not eligible. Where the product renders
   one Reply's text as more than one part, a Span lies inside one part: a Selection whose endpoints
   fall in two separately rendered parts is not one Span. A Selection that spills only over layout
   whitespace at the Reply's edge is treated as inside the Reply. Widening this boundary is a
   deferred decision, not an accident of rendering.
5. **A Mark covers a whole Reply occurrence, at most once.** A Mark belongs to the occurrence it
   was made on, not to the Step that produced it: a second Mark request on the same occurrence
   opens the existing Mark rather than creating another, and a regenerated Reply is a new
   occurrence that may carry its own Mark. The superseded occurrence keeps its Mark.
6. **The Anchor is a value, not a reference.** It is composed at Capture from the live Selection and
   the Reply occurrence, then stored with the Highlight. It never holds a rendering object, an
   on-screen position or a painted range.
7. **Quote and Quote context are bounded.** The Quote is at most 2 000 characters; Quote context is
   at most 48 characters on each side and is taken from the Reply text adjacent to the Quote.
8. **The Quote is verbatim and immutable.** A Capture may record only characters that exist in the
   Reply's rendered text, and no operation in this context rewrites them.
9. **Position is versioned.** A recorded position carries its reading-rule version; if the version
   is not the current one, Resolution may not trust the position and must fall through to the Quote.
10. **Capture never writes to the Transcript.** Reading the Selection and the Reply text changes
    neither, and a refused Capture leaves no trace in the Margin.
11. **Capture is timely.** A Span is captured from the Reader's live Selection at the moment of the
    gesture. A Capture that starts from a Quote alone — the Agent-authored path — must find that
    Quote in the rendered Transcript at the moment the Highlight is created; if it cannot, nothing
    is created.

## Problem

The Margin's whole reason for existing is that it outlives the Conversation. But the thing a
Highlight points at exists only in a surface the Margin does not own: Replies are rendered,
re-rendered, folded, regenerated, edited, compacted, paged out, archived and sometimes deleted. The
product gives the plugin no stable address for every Reply and no notification when any of this
happens.

Two temptations make the problem worse. The first is to store a location — a rendering coordinate, a
range, a scroll position — which reads as precise and is wrong the moment the Transcript changes.
The second is to give up on the binding entirely and treat the Quote as the Highlight's position,
which reads as robust and silently misattributes a repeated sentence to the wrong passage, Reply or
Session.

The middle way is a selector: record enough identity and enough text to re-find the passage when it
can be found, and enough honesty to say when it cannot.

## Solution

An Anchor has four parts, each answering a different question.

1. **Which Reply occurrence.** The durable identity of the Reply the Highlight came from, expressed
   as the Turn and Step it answers plus which part of the Step it is when the Step renders Reasoning
   and an answer separately. This scopes every later Resolution: the Quote is looked for inside that
   Reply occurrence in the owning Session, never anywhere else.
2. **The Quote.** The verbatim selected text for a Span, or the Reply text for a Mark, bounded by
   the Quote cap. It is the Anchor's portable evidence: it survives re-rendering, reload and history
   paging, and it is what the Reader still sees when nothing resolves.
3. **The Quote context.** Up to 48 characters of Reply text immediately before and after the Quote.
   Its job is disambiguation: when the same sentence appears twice in one Reply, context tells the
   two apart, and when the Reply shifts, context lets a match be trusted.
4. **The recorded position.** Where the Quote sat, in the reading-rule version in force at Capture.
   It is the fast path for an unchanged Reply and a hint that must be verified; it is never the
   Highlight's location on its own.

**What may be captured.** A Span may be captured from a Selection wholly inside the text of a
Settled Reply. The Selection may cross paragraph and other rendered block boundaries inside that
Reply: one Selection produces one Span, one Quote covering it verbatim and one Quote context on each
side. A Selection that is not wholly inside eligible Reply text produces nothing: no Span, no
partial highlight, no Anchor, and the Reader stays where they were.

**What may not be captured.** Selection inside Reasoning, user messages, Tool calls or their output,
injected context, streaming or interrupted Reply text, Composer text and the Trajectory view is not
Highlightable. Neither is any text in a Turn whose Reply body is not rendered. A Selection that
spans two Replies is refused: one Anchor describes one Reply occurrence and one passage.

**The Mark case.** Mark designates the whole text of one Settled Reply. Its Anchor records the same
four parts, with the whole Reply as the designated passage and the Reply's opening text as its
Quote, bounded by the Quote cap. A Reply occurrence has at most one Mark; a second request opens the
existing one and creates no second Anchor. A Regenerated Reply has its own Reply occurrence and
starts without a Mark.

**Agent-authored Highlights.** A Highlight authored by the Agent is not a special case for
Anchoring. It enters through the ordinary Capture path: the Quote must be found
verbatim in rendered Highlightable text, and the Anchor is built from that occurrence in exactly the
same way. A Quote that cannot be found is refused, and nothing is stored.

**What an Anchor deliberately does not record.** It records no colour, tag, note, star, author,
intent, state or visibility; no rendered geometry; no hint about which surface captured it; no
snapshot of the Session title; and no claim about the current Resolution state. Those either belong
to the Margin or are derived, and mixing them into the Anchor would turn a selector into an ageing
copy of a surface.

## User Stories

- As a Reader, I want the sentence I select in a settled Reply to stay attached to that sentence
  after I reload the page, so that my marginalia keeps pointing at what I read.
- As a Reader, I want to select a whole paragraph or several paragraphs at once and get one Span, so
  that the shape of my selection decides the shape of my Highlight.
- As a Reader, I want to mark a whole Reply with one gesture, so that a reply worth keeping as a
  whole is one item, not a fiddly selection.
- As a Reader, I want a second Mark on the same Reply to open the Mark I already have, so that one
  Reply never accumulates duplicates.
- As a Reader, I want text I cannot meaningfully highlight — Reasoning, my own message, Tool output,
  a streaming answer, the Trajectory view — to refuse the gesture, so that the Margin contains only
  things that are actually in the Reply.
- As a Reader, I want a Highlight I asked the Agent to keep to be bound to real Reply text or
  refused, so that nothing enters the Margin that the Transcript cannot show.
- As a Reader, I want the same sentence appearing twice in one Reply to yield two independent
  Highlights that each keep their own place, so that repetition does not merge my notes.
- As a Reader, I want a very long Selection to remain covered even though only its beginning is
  stored verbatim, so that I do not have to shorten what I want to keep.

## Acceptance Criteria

1. **Given** the Session "Storage migration notes" with a Settled Reply reading "The migration runs
   at the next Host start, not when the file is written.", **when** the Reader selects "The
   migration runs at the next Host start" and captures it, **then** one Span is created whose Anchor
   records the Reply occurrence, the verbatim Quote, the text before and after it (each at most 48
   characters) and a recorded position with the current reading-rule version.
2. **Given** a Settled Reply with two paragraphs, the first beginning "We keep the old file until
   the" and the second beginning "second start succeeds.", **when** the Reader selects from "We
   keep" to "succeeds." across the paragraph break, **then** one Span is created, its Quote contains
   both paragraphs and the break between them verbatim, and its Anchor records one Quote context
   pair.
3. **Given** a Reply that is still streaming, **when** the Reader attempts to capture text in it,
   **then** no Highlight and no Anchor are created.
4. **Given** the same Reply after it has Settled, **when** the Reader captures a sentence in it,
   **then** the Span is created.
5. **Given** text inside a Reasoning block, **when** the Reader attempts to capture it, **then** no
   Highlight and no Anchor are created.
6. **Given** a user message reading "please check the migration again", **when** the Reader attempts
   to capture it, **then** no Highlight and no Anchor are created.
7. **Given** a Tool call and its rendered output, **when** the Reader attempts to capture the
   output, **then** no Highlight and no Anchor are created.
8. **Given** injected context shown in the Conversation, **when** the Reader attempts to capture it,
   **then** no Highlight and no Anchor are created.
9. **Given** text typed in the Composer, **when** the Reader attempts to capture it, **then** no
   Highlight and no Anchor are created.
10. **Given** the Trajectory view of a Session, **when** the Reader attempts to capture any of its
    rows, **then** no Highlight and no Anchor are created, and no Highlight is painted there.
11. **Given** a Settled Reply that has no Mark, **when** the Reader invokes Mark, **then** exactly
    one Mark is created, its Anchor designates the whole Reply text and its Quote is the opening of
    that text, at most 2 000 characters.
12. **Given** a Reply that already has a Mark, **when** the Reader invokes Mark again, **then** the
    existing Mark is opened and neither a second Mark nor a new Anchor is created.
13. **Given** a Selection that begins in one Reply and ends in the next, **when** the Reader
    attempts to capture it, **then** the Capture is refused and nothing is stored.
14. **Given** a Selection of 3 000 characters inside one Settled Reply, **when** the Reader captures
    it, **then** the Highlight designates and paints all 3 000 characters, while its stored Quote is
    the first 2 000 and claims only those.
15. **Given** a Selection whose end spills only over whitespace at the end of a Reply's text,
    **when** the Reader captures it, **then** the Span is created over the visible selected text
    without the spill.
16. **Given** an Agent-authored Highlight whose Quote reads "the retry budget is ten attempts",
    but that quote no longer appears in any rendered Highlightable text, **when** the Highlight is
    created, **then** no Highlight is stored and the Reader stays where they were.
17. **Given** one Reply containing the sentence "We pin zod to 4.4.3." twice, and a Span already
    captured on the first occurrence, **when** the Reader captures the second occurrence, **then**
    two independent Spans exist, each with its own recorded position and Quote context.
18. **Given** a Settled Reply that the product cannot identify durably, **when** the Reader attempts
    to capture its text, **then** no Highlight and no Anchor are created.
19. **Given** any Capture above, **when** the attempt ends, **then** the Transcript and the Reader's
    Selection are unchanged.

## Implementation Decisions

- An Anchor is constructed once, at Capture, from the live Selection and the Reply occurrence; it is
  never recomputed from stored data afterwards. Re-anchor is the only operation that replaces one.
- The Anchor's occurrence identity includes the Turn and Step the Reply answers and, when the
  product renders a Step in parts, the answer part. A Reasoning part is never recorded.
- The recorded position is a pair of boundaries in Anchoring's own reading of the Reply text,
  carried with the reading-rule version. A position from an older version is not trusted by
  Resolution.
- Quote context is taken from the same reading of the same Reply text, immediately adjacent to the
  Quote, and truncated to 48 characters on each side. A Mark records empty Quote context because its
  designated passage is the whole Reply.
- The Quote is captured verbatim from the Reply text and then bounded to 2 000 characters. The Span
  or Mark still designates the whole selected or whole-Reply passage; only the stored Quote is
  bounded. The Anchor does not repair the unquoted remainder later, which is why an edit beyond the
  stored Quote can leave the Highlight Unanchored.
- Capture is a refusal-first operation: the eligibility checks happen before anything is composed,
  and a failed check produces a plain refusal rather than a degraded Anchor or a shortened
  Highlight.
- Capture accepts a Selection whose endpoints are inside the Reply text. A Selection with one
  endpoint outside the Reply is clamped to the Reply boundary only when the excluded part is layout
  whitespace; any visible text from outside the Reply makes the Selection ineligible.
- A Mark is identified by the Reply occurrence. The Mark existence check happens before creation, so
  a repeated invocation is an open-existing action rather than a second Capture.
- A Capture that starts from a Quote alone locates the Quote in rendered Highlightable text first
  and then goes through the ordinary Capture path, so a Quote-only Capture and a Selection Capture
  can never produce different Anchors for the same text.
- Anchors are immutable values once stored. Resolution treats them as read-only, and Re-anchor
  replaces the Anchor reference rather than editing an existing Anchor in place.

### Deferred Decisions

| Decision not made | Seam |
|---|---|
| Whether the Quote cap should differ for a Span and a Mark | The Quote cap is a single stated bound; a per-kind cap changes one constraint and one Capture rule. |
| Whether a Mark's Quote should ever cover the Reply beyond the cap | A Mark's Anchor already designates the whole Reply; extending its stored Quote changes only what is recorded, not what is designated. |
| Whether a Selection spanning two separately rendered parts of one Reply should become one Span | The Reply-occurrence identity and the single-passage rule are the seam; widening eligibility changes that rule alone. |
| Whether a Reply without a durable identity could still be captured through a best-effort Anchor | Occurrence identity is a named part of the Anchor; adding a weaker identity extends that part. |
| Whether Reasoning, Tool output or the Trajectory view could ever become Highlightable | Eligibility is stated as a property of Reply text in one place, so the scope can be revisited without changing the Anchor. |
| Whether a Regenerated Reply inherits any prior Mark or Span of the answer it replaced | The Reply occurrence identity already distinguishes them; inheritance would be a new rule about Marks and Spans. |

## Testing Strategy

Behaviour is tested at the domain boundary, without depending on any surface: given a described
Reply, a described Selection and a described Session, the observable outcome is the Anchor that
would be composed or the refusal that would be returned. The refusal matrix is tested case by case —
each excluded case in [Constraints](#constraints) has at least one scenario — because eligibility
is the one rule every other context relies on.

Anchor construction is tested for its recorded parts: occurrence identity (including split Steps and
both ways the product presents a Step), verbatim Quote and bounded Quote cap, Quote context bounds,
recorded position and reading-rule version. Acceptance criteria 1–19 form the core matrix.
Additional property-style checks cover: any captured Quote appears verbatim in the Reply text; any
recorded Quote context is at most 48 characters and adjacent to the Quote; a refused Capture stores
nothing; and a repeated Mark invocation is idempotent.

Real rendering is exercised separately against the rendered product: a fixture Conversation with a
settled Reply, a folded Turn, a Reasoning part and a split Step, used to confirm that the described
eligibility boundary holds against actual product output. Those checks are not a substitute for the
domain matrix; they exist to catch a product change that would silently widen or narrow
Highlightable text.

## Out of Scope

- Resolution, Resolution state, Re-anchor and Reveal; see
  [Resolution and degradation](resolution-and-degradation.md).
- Painting a captured Highlight in the Transcript.
- The selection bar, the Annotation popover, the Assistant action row and every other surface.
- Colour, Tags, Note, Star, Author, Intent, State, Visibility and Highlight identity.
- Storage, transport, versioning of stored records and retention.
- Consent, Agent access, Proposals and Insertion.
- The Trajectory view as a place to capture or paint anything.

## Open Questions

None outstanding. The four questions this specification raised are resolved:

1. **Split rendered parts.** One Span lies inside one rendered text part of one Reply occurrence; a
   Selection whose endpoints fall in two separately rendered parts is not one Span. Multi-paragraph
   and multi-block Selections inside one part are eligible. Widening the boundary is recorded as a
   deferred decision with the Reply-occurrence identity as its seam.
2. **A regenerated Reply and its Mark.** A regenerated Reply is a new Reply occurrence: it starts
   clean, may carry its own Mark, and the superseded occurrence keeps what it had. The invariant is
   per occurrence, never per Step.
3. **The term "reply occurrence".** Adopted in the glossary. A Step that renders Reasoning and its
   answer separately yields one Reply occurrence per rendered answer part; Reasoning is not
   Highlightable and therefore never an occurrence the Reader can mark.
4. **Capture without a durable identity.** No. An Anchor's identity is a named part of the value; a
   Reply whose durable identity the product cannot state at that moment is not Highlightable. A
   best-effort identity is a deferred widening (see Deferred Decisions), not a silent fallback.
