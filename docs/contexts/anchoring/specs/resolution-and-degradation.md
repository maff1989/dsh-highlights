# Resolution and degradation

**Status:** Accepted
**Context:** Anchoring
**Date:** 2026-11-15

Resolution is how an Anchor finds its passage again — or honestly fails to. This specification
states the ladder in behaviour, the four Resolution states and their derivation, the Re-anchor
operation and the Reveal contract. It assumes the Anchor model described in
[The Anchor model](anchor-model.md).

## Definitions

Only terms specific to this feature are defined here. Anchor, Quote, Quote context, Resolution,
Resolution state, Anchored, Unanchored, Archived, Unavailable, Re-anchor, Reveal, Capture,
Highlight, Reply, Turn, Step, Session, Conversation, Transcript, Reasoning and Trajectory view keep
the meanings given in the [glossary](../../../UBIQUITOUS_LANGUAGE.md).

| Term | Meaning |
|---|---|
| **Resolution attempt** | One on-demand reading of the Transcript on behalf of one Highlight, ending in a Resolution state and, when it succeeds, one passage range. |
| **Session record** | The product's record of which Sessions exist and which are archived. While that record is unavailable or incomplete, absence of a Session is not evidence that it is gone. |
| **Session gone** | The owning Session no longer exists in the Session record. Out-of-band deletion produces this. |
| **Resolution derivation** | The order in which Anchoring decides a Resolution state: Session facts first, then the ladder. |
| **Landing** | The single, bounded act of Reveal that brings the anchored passage into the visible Transcript. A Landing is an affordance, not a guarantee. |
| **Re-anchor candidate** | A fresh Anchor, captured through the ordinary Capture path in the same Reply, offered to replace an existing Highlight's Anchor. |
| **Ambiguous match** | A Quote that occurs more than once in the identified Reply occurrence, where Quote context does not distinguish the matches. |
| **Folded Turn**, **Shadowed Reply**, **Regenerated Reply**, **History window**, **Compaction** | As defined in [The Anchor model](anchor-model.md). |

## Constraints

1. **Resolution is read-only.** It reads the Transcript and the owning Session's facts. It never
   writes to the Transcript, never edits a Highlight and never stores its own answer as data.
2. **Resolution state is derived, never stored.** It is a report about the current rendering and the
   current Session facts, not a field of a Highlight. A stored claim would age, and a Highlight
   would begin to assert something false about a Transcript it does not own.
3. **Resolution sees only what is rendered.** It does not open Sessions, page history, expand Turns
   or scroll. Those are Reveal's acts. A Highlight whose Reply is outside the rendered Transcript is
   Unanchored at that moment, even if its text certainly exists elsewhere.
4. **Resolution is scoped.** It looks only in the owning Session's Transcript and only in the Reply
   occurrence the Anchor identifies. A matching Quote in another Session, another Reply or another
   part of the same Step is never accepted.
5. **Session facts outrank text.** A Session that is gone makes its Highlights Unavailable; a
   Session that is archived makes them Archived; only a Session that is present and not archived
   reaches the ladder.
6. **Absence is evidence only once the record is known.** A Session missing from an unanswered or
   incomplete record is not gone. Until the product can say which Sessions exist, the Highlight may
   be Unanchored but never Unavailable.
7. **One ladder, one owner.** Every consumer of a Resolution state asks Anchoring. No surface
   derives a Resolution state from what it can see, and no second resolution rule exists for lists,
   painting or the Agent surface.
8. **The ladder's order is fixed.** Recorded position verified by Quote and Quote context, then a
   unique Quote occurrence, then the best-supported of several occurrences, then Unanchored.
9. **Re-anchor never widens.** It attaches a Highlight to a new Anchor that designates the same
   Quote in the same Reply occurrence. It never changes identity, Quote, presentation fields,
   judgement attributes or the owning Session.
10. **Reveal is bounded and non-destructive.** It has finite waits, it supersedes an earlier Reveal,
    it never reports an error path, and it never changes a Resolution state, a Highlight or the
    Margin.
11. **No automatic repair.** A Resolution state never re-anchors, edits, restores or deletes. Only
    the Reader's explicit acts change a Highlight; only the Reader's Re-anchor replaces an Anchor.
12. **Exactly one state at a time.** Every Highlight reports exactly one of Anchored, Unanchored,
    Archived, Unavailable at any moment, even when more than one condition seems true.
13. **Determinism.** For one rendered Transcript and one set of Session facts, resolving the same
    Anchor twice reports the same passage and the same state.

## Problem

The Margin must keep working when the Transcript no longer does. Replies are regenerated and edited;
Reasoning is collapsed; Turns are folded; history is paged out; earlier Turns are compacted;
Sessions are archived and sometimes deleted out of band; Sessions are forked. In each case the
Reader's Highlight still exists — with its Quote, its colour, its note and its judgement — but the
passage it was bound to may be absent from the rendered Transcript, absent from the Session, or
present in a different place.

A product that treats this as an error would fail on ordinary life. A product that hides or deletes
the affected Highlights would destroy the Reader's own record. A product that silently re-anchors to
the nearest matching text would fabricate a location and misattribute the Reader's judgement. And a
product that reports one undifferentiated "broken" state would leave the Reader unable to tell "the
text changed" from "the Session is archived" from "the Session is gone".

Resolution has to answer the Reader's real question honestly — *where does this stand?* — and leave
every other decision intact.

## Solution

### The four Resolution states

| State | Meaning | Derived when | What survives |
|---|---|---|---|
| **Anchored** | The passage is found in its Reply occurrence. | The ladder accepts a position or a Quote match. | Surfaces can place it in the Transcript and Reveal can land it. |
| **Unanchored** | The passage cannot be found now, and may return. | The Reply occurrence is not rendered, is folded or paged out, its text no longer contains the Quote, or the reading rules cannot verify the position. | The Highlight keeps its Quote and Quote context, stays listed, and may become Anchored again without any action. |
| **Archived** | The owning Session is archived. | The Session record reports the Session archived. | The Highlight stays listed with its Quote; text is not searched. |
| **Unavailable** | The owning Session is gone. | The Session record is known and does not contain the Session. | The Highlight stays listed with its Quote; Reveal reports the outcome without opening anything. |

No Resolution state deletes, hides, edits, re-colours, re-tags or auto-re-anchors a Highlight, and
no state changes any presentation or judgement field. A Highlight's visibility in a list is a matter
for the surface and its Reader-chosen filters, never a consequence of degradation.

### The ladder as behaviour

1. **The recorded position.** Anchoring looks where the Anchor says the Quote sat, in the owning
   Session's identified Reply occurrence, using the current reading of the Reply's rendered text. It
   accepts that place only when the text there is the verbatim Quote and the text around it agrees
   with the Quote context. If the reading-rule version has changed, or the Reply no longer reads the
   same way, the position is not accepted.
2. **A unique Quote match.** If the Quote occurs exactly once in the identified Reply occurrence,
   that occurrence is the passage.
3. **The best of several matches.** If the Quote occurs more than once, Anchoring compares the Quote
   context at each candidate and accepts the one that agrees most. When two or more agree equally,
   it accepts the earliest in reading order: an Ambiguous match is still reported as Anchored,
   because a deterministic best effort is more useful to the Reader than a refusal.
4. **Unanchored.** If no candidate verifies, the Highlight is Unanchored. This is a normal report,
   not an error, and it is revisitable on the next Resolution attempt.

Resolution never mutates the Transcript and never edits a Highlight. It does not retry in a loop, it
does not fetch anything, and it does not persist its conclusion. A later call resolves against the
Transcript as it then is, so a rotation of a Turn, a page of history or a change of transcript
presentation can turn an Unanchored Highlight into an Anchored one with no Reader action.

### Re-anchor

Re-anchor is the Reader's deliberate repair. It attaches an existing Highlight to a new Anchor,
taken as a Re-anchor candidate from the same Reply occurrence through the ordinary Capture path. The
following hold:

- The candidate's Quote must be the Highlight's Quote, verbatim. Anything else is not a Re-anchor.
- The candidate must designate a passage in the same Reply occurrence of the same owning Session. A
  Quote match in another Reply or another Session is refused, even when the text is identical.
- The Highlight's identity, Quote, Colour, Tags, Note, Star, Author, Intent, State, Visibility and
  timestamps of creation are unchanged. Only the Anchor is replaced, and the Highlight's version
  advances because it changed.
- A Re-anchor is applied to the version of the Highlight the Reader acted on. If the Highlight has
  changed since, the Re-anchor is refused and the live Highlight wins; nothing is overwritten.
- Re-anchor is permitted only while the Highlight's Quote still exists in its Reply. When the Quote
  text is gone from the Reply, no Re-anchor candidate can be captured, and the Highlight stays
  Unanchored until its text returns.

Re-anchor is not automatic and is not required: an Unanchored Highlight is a legitimate end state.

### Reveal

Reveal brings a Highlight's passage into view. In order, it:

1. opens the owning Session;
2. returns to that Session's Conversation;
3. pages history back towards the Reply occurrence when the occurrence is outside the loaded
   Transcript window, within a bounded wait;
4. locates the Reply occurrence and resolves the passage; and
5. brings the passage — not merely the Reply row — into view in one instant landing.

Reveal is best effort in every step. Its degradations are:

- **Folded Turn.** The Reply body is not rendered and is not expanded by Reveal. The Session stays
  open, nothing is scrolled, and the Reader sees the Highlight's Quote and Quote context in the
  list.
- **Unanchored Highlight.** There is no passage to land. The Session is opened where the product
  allows it, the Reply itself is the best target if it is rendered, and no claim is made that the
  passage was shown.
- **Archived or Unavailable Session.** The plugin does not override the product's archived-Session
  rules and cannot open a Session that is gone. Reveal ends with its bounded outcome and no error;
  the Highlight remains listed.
- **Superseded Reveal.** A newer Reveal, leaving the Session, or unmounting the surface supersedes
  the one in flight. Only the last request lands, and a superseded request is not an error.
- **Session switch.** Reveal never scrolls a Conversation other than the owning Session's. If the
  Reader navigates away while it is working, it stops rather than landing in the wrong place.

Reveal never changes a Resolution state. Paging history may make the passage renderable so that a
subsequent Resolution reports Anchored, but Reveal does not report the state itself and does not
rewrite the Highlight. Reveal is never an error path: a failed Landing is a quiet, bounded outcome
after which the Reader still has the Highlight's Quote and Quote context.

### What each consumer sees

- **Presentation & Resurfacing** receives the Resolution state and the passage when Anchored. It
  renders the state truthfully and asks for Reveal or Re-anchor; it never recomputes either.
- **Agent Access** receives one boolean derived from Resolution state — whether the Highlight is
  Anchored — so that the model can be told that a stored Highlight is not located in the Transcript
  at that moment. It receives no passage, no Session facts and no ladder detail.
- **The Margin** receives nothing from Resolution: an Anchor value may change only through
  Re-anchor, and no Resolution state is ever written back to a Highlight.

## User Stories

- As a Reader, I want to see whether each Highlight is Anchored and, when it is not, to be told
  whether the cause is the text, the archive or the Session, so that I know what I can do about it.
- As a Reader, I want a Highlight whose typed text shifted to still mark the same sentence, so that
  normal editing of a Reply does not cost me my margin.
- As a Reader, I want a Highlight in a folded Turn or paged-out history to come back when the text
  does, without my having to repair it, so that folding and paging are not destructive.
- As a Reader, I want to reveal a Highlight and land on the marked words, not just somewhere near
  the Reply, so that revealing is a return and not a search.
- As a Reader, I want an archived Session's Highlights to stay listed and clearly archived rather
  than appearing lost, so that tidying Sessions does not look like data loss.
- As a Reader, I want a deleted Session's Highlights to stay listed and clearly unavailable, so that
  I still keep the record of what I noticed even when the product no longer keeps the Session.
- As a Reader, I want Highlights of a forked Session to stay with the Session they came from, so
  that a fork does not silently duplicate or inherit my margin.
- As a Reader, I want two Highlights of the same sentence to remain two independent records, so that
  one note about a phrase never overwrites another.
- As a Reader, I want to attach a Highlight to a recovered passage without losing what I judged
  about it, so that repair is cheap when the text is recoverable.

## Acceptance Criteria

1. **Given** an Anchored Highlight of "the migration runs at the next Host start" in a rendered
   Settled Reply, **when** Resolution runs, **then** the Highlight reports Anchored and the passage
   range covering exactly that text.
2. **Given** an Anchored Highlight and a page reload that re-renders the same Transcript, **when**
   Resolution runs after the reload, **then** the Highlight reports Anchored at the same passage and
   no duplicate Highlight or Anchor is created.
3. **Given** an Anchored Highlight whose Reply later gains a sentence before the passage, **when**
   Resolution runs, **then** the recorded position is not accepted, the Quote is found once in the
   Reply, and the Highlight reports Anchored at the Quote's new place.
4. **Given** an Anchored Highlight and a Regenerated Reply for the same Step, **when** the earlier
   answer is no longer rendered, **then** the Highlight reports Unanchored, keeps its Quote and
   stays listed.
5. **Given** a Regenerated Reply for a Step whose earlier answer still has a Mark, **when** the
   Reader invokes Mark on the new Reply, **then** one Mark is created for the new Reply and the
   earlier Mark stays with the earlier answer.
6. **Given** an Anchored Highlight and an edited or shadowed Reply whose text no longer contains the
   Quote, **when** Resolution runs, **then** the Highlight reports Unanchored.
7. **Given** a Highlight that became Unanchored because its Reply text changed, **when** the
   original text is rendered again, **then** Resolution reports Anchored without any Reader action.
8. **Given** an Anchored Highlight in the answer text of a Step, **when** the Reader collapses that
   Step's Reasoning, **then** Resolution still reports Anchored at the same passage.
9. **Given** a Step rendered only as its Reasoning part with no answer part, **when** Resolution
   runs for a Highlight captured from that Step's earlier answer, **then** the Highlight reports
   Unanchored and never reports Anchored inside Reasoning.
10. **Given** a Highlight whose Reply sits in a folded Turn, **when** Resolution runs, **then** the
   Highlight reports Unanchored.
11. **Given** that same Highlight, **when** the Reader invokes Reveal, **then** the owning Session
    is opened, the folded Turn is not expanded, the view does not move elsewhere, and the list
    still shows the Highlight's Quote and Quote context.
12. **Given** a Highlight whose Reply is outside the loaded History window, **when** Resolution
    runs, **then** the Highlight reports Unanchored.
13. **Given** that same Highlight, **when** the Reader invokes Reveal, **then** history is paged
    back within the bounded wait, the Reply occurrence is located, the anchored passage is landed,
    and a later Resolution reports Anchored.
14. **Given** a Highlight whose owning Session is archived, **when** Resolution runs, **then** the
    Highlight reports Archived, its Quote is unchanged, and it is still listed.
15. **Given** an archived owning Session whose Reply text is also absent, **when** Resolution runs,
    **then** the Highlight reports Archived and not Unanchored.
16. **Given** a Session deleted out of band while the Session record is known, **when** Resolution
    runs, **then** the Highlight reports Unavailable and stays listed with its Quote.
17. **Given** a Session record that is still answering, **when** Resolution runs for a Highlight of
    a Session it does not list, **then** the Highlight does not report Unavailable, and it reports
    Unavailable only after the record is known and the Session is absent.
18. **Given** a Session that was forked, **when** Resolution runs for a Highlight of the original
    Session while the fork is open, **then** the Highlight is not resolved against the fork, and a
    new Highlight captured in the fork belongs to the fork.
19. **Given** two Highlights of the same Quote text in one Reply, **when** Resolution runs, **then**
    each reports Anchored at its own passage.
20. **Given** two Anchored Highlights of the same Quote text in one Reply, **when** the Reader
    Re-anchors one of them, **then** the other keeps its Anchor and passage.
21. **Given** a Highlight in an earlier Turn that the product has compacted into a summary, **when**
    Resolution runs, **then** the Highlight reports Unanchored, keeps its Quote and stays listed.
22. **Given** an Unanchored Highlight whose Quote still exists in its Reply, **when** the Reader
    supplies a Re-anchor candidate from that Reply, **then** the Highlight reports Anchored and its
    identity, Quote, Colour, Tags, Note, Star, Author, Intent, State and Visibility are unchanged.
23. **Given** an Unanchored Highlight whose Quote no longer exists in its Reply, **when** the Reader
    attempts a Re-anchor, **then** the attempt is refused and the Highlight remains Unanchored with
    every other field unchanged.
24. **Given** a Re-anchor candidate taken from a different Reply containing the same Quote text,
    **when** the Reader attempts a Re-anchor, **then** the attempt is refused and the Highlight
    keeps its original Anchor.
25. **Given** a Re-anchor based on a Highlight version that has since changed, **when** it is
    applied, **then** the Re-anchor is refused and the live Highlight is left untouched.
26. **Given** an Unavailable Highlight, **when** the Reader invokes Reveal, **then** no Session is
    opened, no error is reported, and the Reader remains where they were with the Quote still
    listed.
27. **Given** a Reveal in flight, **when** a second Reveal starts for another Highlight, **then**
    the first is superseded without error and only the second lands.
28. **Given** a Mark on a rendered Reply, **when** that Reply's text is edited so it no longer
    begins with the Mark's stored Quote, **then** the Mark still reports Anchored because its Reply
    occurrence is rendered and identifiable, and it is not resurfaced as Text changed.
29. **Given** any Resolution attempt or Reveal above, **when** it completes, **then** the Transcript
    is unchanged and no Highlight is deleted, hidden, edited or automatically re-anchored.

## Implementation Decisions

- Resolution derivation runs in one order: Session gone, then Session archived, then the ladder.
  Each earlier fact makes the later steps unnecessary rather than merely less likely.
- Session facts come from the product's Session record. The record is consulted before the
  Transcript, and its completeness is checked before absence is treated as deletion.
- The ladder is one ordered set of attempts over the reading of the identified Reply occurrence.
  Each attempt either yields a passage or is abandoned; only the last one yields Unanchored.
  Attempts do not mutate the reading or the Transcript.
- Verification at the recorded position requires both the Quote and the Quote context to agree. A
  position that agrees on the Quote but not its context is not accepted, because the surrounding
  text is what distinguishes repeated sentences.
- A Quote match is restricted to the identified Reply occurrence. The owning Session's Transcript is
  the only scope; the same Quote in any other Reply or Session is invisible to Resolution.
- When several Quote occurrences are found, the comparison is by agreement of the stored Quote
  context, longest agreement first. Equal agreement resolves to the earliest occurrence in reading
  order. Ambiguity is never reported as a state.
- A Mark resolves against its whole-Reply occurrence: it is Anchored while that occurrence is
  rendered and identifiable, because a Mark designates the Reply and not a passage inside it. An
  edit to the Reply therefore leaves its Mark Anchored; only a missing or unidentifiable occurrence
  makes a Mark Unanchored, and an edited Reply is not resurfaced as Text changed.
- Resolution never pages, opens or scrolls. Reveal is a separate operation that may page and then
  resolve, and it reports only its own bounded outcome, not a Resolution state.
- Reveal is single-flight: a newer request supersedes the one in flight, a Session switch or an
  unmount cancels it, and every wait is bounded. A cancelled or unsuccessful Reveal is a quiet
  outcome, never an error.
- Reveal brings the resolved passage into view in one instant landing rather than animating the
  scroll, because animating through a Conversation the plugin does not own is both slow and
  disruptive, and the scroll machinery belongs to the product.
- Re-anchor replaces the Anchor reference only. It is applied against the Highlight version the
  Reader acted on, requires the candidate Quote to equal the Highlight's Quote, and requires the
  candidate to be in the same Reply occurrence of the same owning Session.
- No Resolution state is written to a Highlight, cached as a fact or used to decide whether a
  Highlight exists. Lists and surfaces ask again.

### Deferred Decisions

| Decision not made | Seam |
|---|---|
| Whether Archived should suppress Unanchored in every list, or whether both facts may be shown | The Resolution derivation states one precedence; the seams are the derivation order and the Resolution state contract. |
| Whether Reveal may expand a folded Turn and land inside it | The Reveal contract treats folding as a degradation; expanding would extend the contract, not the Anchor. |
| Whether a Re-anchor may ever move a Highlight to a different Reply that contains the same Quote | The Re-anchor rules state the same-Reply requirement in one place. |
| Whether Reveal should retry a failed Landing, or whether a Reader-initiated repeat is the only retry | The Reveal contract fixes bounded, superseding attempts; a retry policy would extend it. |
| Whether an Ambiguous match should ever be reported as a distinct Resolution state | The ladder already resolves it deterministically; a fifth state would extend Resolution state and its consumers. |
| Where Re-anchor is offered to the Reader, and whether it is offered for Archived or Unavailable Highlights | The Re-anchor operation is surface-independent and already refuses what it cannot verify. |
| Whether Resolution might itself page history to serve lists, instead of leaving that to Reveal | Resolution's read-only, rendered-only scope is a stated constraint; relaxing it is a contract change. |
| Whether Compaction should be surfaced as a distinct boundary the Reader can traverse | Compaction produces Unanchored like any other missing text; a distinct state or boundary extends the Resolution model. |

## Testing Strategy

The domain matrix is tested by describing a Transcript state, a Session record and one Highlight,
then asserting the Resolution state, the passage if any, and the absence of side effects. The matrix
is organised by the deformations named in the acceptance criteria: unchanged, shifted, regenerated,
edited or shadowed, Reasoning collapsed, Reasoning-only, folded Turn, history window, archived,
record incomplete, Session gone, fork, two Highlights of one Quote, compaction, and the four
Resolution states including precedence. Re-anchor is tested for its permitted case, each refusal
case and version conflict. Reveal is tested for the landing, each degradation, supersession and
cancellation.

Ladder tests use fixtures with controlled text: a shifted sentence, a repeated
sentence with distinguishable context, a repeated sentence with identical context, and a stored
position that no longer verifies. Property checks cover determinism (same rendering, same answer),
scope isolation (a match outside the owning Session or Reply is never accepted), and non-mutation
(no operation from Resolution can write to a Highlight or the Transcript).

Reveal is exercised end to end against the rendered product with a fixture Conversation containing a
long history, a folded Turn, a split Step and an archived Session, because its failure modes are
timing- and product-dependent. Those checks confirm the contract's bounded waits and quiet outcomes;
they do not replace the domain matrix, which remains the authority on what Reveal means.

## Out of Scope

- The Anchor's structure and Capture eligibility; see [The Anchor model](anchor-model.md).
- Painting and all surfaces; Presentation owns them.
- List filtering, ordering, badges and the wording of Notices.
- The Highlight's fields, identity, storage and versioning.
- Consent, Agent access, Proposals and Insertion.
- The product's Session record, history paging and archived-Session rules, which are consumed as
  they are.
- The Trajectory view.
- Automatic repair of any kind.

## Open Questions

None outstanding. The five questions this specification raised are resolved:

1. **Archived and Unanchored together.** Both facts exist, but a surface reports one exhaustive
   Resolution state with the precedence `unavailable` → `archived` → `unanchored` → `anchored`. The
   Session's state decides what the Reader can do next, so it wins the display; the glossary states
   the precedence and notes that the underlying facts are independent.
2. **"Session gone" versus "Session record unavailable".** Unavailable is never claimed while the
   record is unknown: the Highlight reports Unanchored, and the surfaces say the view is stale. A
   deleted Session therefore reports Unanchored until the record confirms the deletion.
3. **A regenerated Reply.** It is a new Reply occurrence, not a replacement of the old one, so the
   old Highlights stay with the superseded occurrence and the new answer starts clean (including
   for Marks).
4. **Reveal of an Unanchored Highlight.** Reveal stops at the identified Reply and does not page
   history speculatively in the hope that the text has returned. Paging is bounded and deliberate;
   the next Resolution attempt can find the passage if it is back.
5. **A Mark whose Reply text changed.** A Mark designates its whole Reply occurrence, not a passage
   inside it, so it stays Anchored while that occurrence is rendered and identifiable; only a
   missing or unidentifiable occurrence makes a Mark Unanchored. A Span has no such licence: it
   must still verify its Quote.
