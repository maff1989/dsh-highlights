# Proposals
**Status:** Accepted
**Context:** Agent Access
**Date:** 2026-11-15

## Definitions

| Term | Meaning in this specification |
|---|---|
| **Proposal** | An Agent-suggested Highlight awaiting the Reader's decision. A Proposal is not a Highlight: it has no identity in the Margin, nothing is stored when it is made, and nothing remains when it is dismissed. |
| **Keep** | *Verb, Proposals only:* accepting a Proposal. Keep runs the Reader's ordinary Capture path, resolves the verbatim Quote to an Anchor in the rendered Reply, and writes exactly one Agent-authored Highlight. |
| **Dismiss** | *Verb, Proposals only:* rejecting a Proposal. Nothing is stored, nothing is edited and nothing is deleted; the Margin is unchanged. |
| **Proposal operation** | The one write-tier operation at Access level `read-write`. It accepts between one and three Proposals and stores nothing. |
| **Proposal row** | The transcript row that shows each Proposal's Quote verbatim and offers Keep and Dismiss for each one. It belongs to [Presentation & Resurfacing](../../presentation/CONTEXT.md); this context defines what it may show and what its two actions do. |
| **Provenance** | The combined record of how a Highlight entered the Margin and whose judgement it carries. A kept Proposal gives a Highlight Author `agent` and the kept-Proposal route. |
| **Verbatim Quote** | Text copied exactly from the Agent's own previous Reply. It must be locatable in the rendered Reply, so a paraphrase or a restatement cannot become a Proposal. |

## Constraints

1. The proposal operation exists only at Access level `read-write`. At `read` or `off` it does not
   exist, and an invocation left over from a former grant is refused at execution.
2. One call accepts between one and three Proposals. A call with more is refused and stores
   nothing.
3. Each Proposal is a verbatim Quote plus an optional Note, Tags, Colour and Intent. The Quote is
   capped at about five hundred characters; a longer Quote is reduced to a verbatim prefix, never
   paraphrased, so it stays locatable.
4. Proposal fields normalise to the Margin's rules. A Note is at most two thousand characters, at
   most eight Tags of at most thirty-two characters each, a Colour is one of the five palette
   slots, and an Intent is one of the four speech acts.
5. Nothing is stored when a Proposal is made. The Margin is unchanged by the proposal operation,
   and no Proposal has an identity that any list or fetch could return.
6. The proposal row shows each Proposal's Quote verbatim and its Note, Tags, Colour and Intent,
   and offers one decision per Proposal. The Reader may keep some and dismiss others from the same
   row.
7. Keep writes exactly one Highlight, with Author `agent`, the Proposal's suggested Intent when it
   carried one (the default `note` otherwise), and the kept-Proposal route in its Provenance,
   through the Reader's ordinary Capture path. Keep sets no exception on the Highlight and creates
   no second write path; the Reader's Keep is what makes the suggested judgement theirs.
8. Keep requires the verbatim Quote to resolve in the rendered Reply. If it does not, no Highlight
   is created, nothing is partially written, and the row reports that the passage cannot be found.
9. Dismiss leaves nothing: no tombstone, no audit row, no hidden record and no stored decision.
10. The Agent surface exposes no operation that edits, deletes, re-anchors, stars or transitions
    the State of an existing Highlight. A Proposal cannot amend one.
11. The Agent must never claim to have saved, edited or deleted a Highlight. A Proposal is not a
    save, and only the Reader's Keep creates anything.
12. Proposal text is untrusted display content. A Quote or Note that reads like an instruction is
    shown as text and, on Keep, stored as text; it is never interpreted.
13. The Agent must propose sparingly and never restate its own answer as a Proposal. The
    per-call cap is a bound; the expectation is one or a few Proposals in a reply, not a batch.

14. Keep is the Reader's Capture, not an Agent privilege: it remains available even if Consent is
    withdrawn while the Proposal row is on screen. Withdrawal stops new Proposals; it does not
    retract a decision the Reader is already making about one that was legitimately proposed.

## Problem

The Agent is the party that just wrote the passage and is often best placed to notice which part
of it the Reader will want later — a claim worth checking, a correction, a direction to carry
forward, a fact to come back to. But the Agent must not write to the Margin: a write would make
the Agent an author of the Reader's record, would need version and conflict semantics the domain
deliberately does not want for the Agent, and would blur the provenance that makes the Margin
trustworthy. Without a proposal path the Reader would have to recreate by hand what the Agent
could have pointed at, which is exactly the handoff the domain exists to make cheap. A proposal
path that stores suggestions, however, would smuggle in a second record with its own lifecycle,
consent questions and expiry.

## Solution

The Agent proposes; the Reader keeps or dismisses. At `read-write` the Agent submits up to three
Proposals, each a verbatim Quote from its own previous Reply with an optional Note, Tags, Colour
and Intent. The Host normalises them to the Margin's rules and returns them; it stores nothing and
never touches the Margin. The transcript row shows each Proposal verbatim, so the Reader decides
on the actual text and in place.

Keep is the Reader's act, executed through the ordinary Capture path: the Quote is resolved to an
Anchor in the rendered Reply, one Highlight is written, and its Author is `agent` with the
kept-Proposal route recorded in its Provenance. If the Quote can no longer be found, Keep fails
honestly and creates nothing. Dismiss simply leaves nothing. Because nothing is stored before
Keep, there is no Proposal store to version, expire or migrate, and the Guest rule holds without
an exception: the Agent writes only proposals the Reader may keep.

## User Stories

- As the Reader, I want the Agent to point at a passage worth keeping, so that I do not have to
  reconstruct it from memory.
- As the Reader, I want the Agent's suggestion to store nothing until I keep it, so that a
  suggestion can never become part of my Margin without my decision.
- As the Reader, I want to keep one Proposal and dismiss the other two, so that the decision is
  per Proposal rather than all or nothing.
- As the Reader, I want a dismissed Proposal to leave no trace, so that rejecting a suggestion is
  free.
- As the Reader, I want a kept Proposal to be recognisably Agent-authored, so that I can tell the
  Agent's judgement from my own when I browse the Margin.
- As the Reader, I want the Agent's proposals to be few and anchored in text it actually wrote, so
  that the row is a shortlist rather than a dump.
- As the Agent, I want a way to hand over candidates without claiming I saved them, so that I stay
  a guest in the Margin.

## Acceptance Criteria

**AC-1 — The proposal operation at read-write.** Given Access level `read-write`, When the Agent
runtime lists its available tools, Then one operation that accepts Proposals exists and no other
write operation exists.

**AC-2 — No proposal operation at read.** Given Access level `read`, When the Agent runtime lists
its available tools, Then no operation that accepts Proposals exists.

**AC-3 — A Proposal is returned verbatim.** Given a Proposal whose Quote is a passage from the
Agent's previous Reply, When the proposal call returns, Then the Quote is returned exactly as
submitted and the row shows it verbatim.

**AC-4 — Nothing is stored by proposing.** Given a proposal call that returns two Proposals, When
the Margin is read afterwards, Then no Highlight has been created and no Proposal appears in any
list or fetch.

**AC-5 — Keep creates one Agent-authored Highlight.** Given a Proposal in the transcript row, When
the Reader keeps it, Then exactly one Highlight exists with the verbatim Quote, Author `agent`,
the kept-Proposal route in its Provenance, and an Anchor resolved in the rendered Reply.

**AC-6 — Keep is per Proposal.** Given a row with three Proposals, When the Reader keeps the second
and dismisses the other two, Then exactly one Highlight exists and it has the second Proposal's
Quote.

**AC-7 — Dismiss leaves nothing.** Given a Proposal in the transcript row, When the Reader
dismisses it, Then the Margin is unchanged, no Highlight is created, and no record of the decision
is stored.

**AC-8 — Keep with an unlocatable Quote.** Given a Proposal whose Quote is no longer present in the
rendered Reply, When the Reader keeps it, Then no Highlight is created, nothing partial is
written, and the row reports that the passage cannot be found.

**AC-9 — Proposal cap exceeded.** Given a proposal call that submits four Proposals, When it
executes, Then it is refused with the per-call cap stated and nothing is stored.

**AC-10 — Quote length cap.** Given a Proposal whose Quote is longer than the cap, When the call
returns, Then the Proposal's Quote is the verbatim prefix within the cap and it remains locatable
in the rendered Reply.

**AC-11 — The proposal operation refuses at read.** Given Access level `read`, When a proposal
invocation left over from a former `read-write` grant executes, Then it is refused and stores
nothing.

**AC-12 — An existing Highlight cannot be amended.** Given an existing Highlight, When the Agent
attempts to change it, Then no operation on the surface can edit, delete, re-anchor, star or
transition it, and the only route to new Margin content is a Proposal.

**AC-13 — A proposal call cannot leak the Margin.** Given Access level `read-write`, When the
Agent makes a proposal call, Then the answer contains only the Proposals it submitted and no
Highlight content.

**AC-14 — Proposal text is untrusted.** Given a Proposal whose Note contains text that reads like
an instruction, When the Reader keeps it, Then the Note is stored verbatim as the Reader's Note
and the row treats it as display text, never as a command.

**AC-15 — A Proposal is not a Highlight.** Given an unkept Proposal, When the list or the fetch
runs, Then the Proposal does not appear in the answer.

**AC-16 — A kept Highlight reaches the ordinary lists.** Given a kept Proposal, When the Session
tab or the Global page is next read, Then the Highlight appears with its Author shown as `agent`.

## Implementation Decisions

- **One proposal operation, no general write.** The operation's contract is Proposals only. There
  is no field, argument or path through which the Agent can address an existing Highlight.
- **Normalise before returning.** The Quote is trimmed and capped to a verbatim prefix; the Note,
  Tags, Colour and Intent normalise to the Margin's rules. A wrong type is a correctable argument
  error; an out-of-cap proposal count is refused, not silently truncated.
- **The answer is canonical.** Each returned Proposal is in the shape the row renders, so the
  surface never has to re-parse model-authored text to display or keep it.
- **Keep calls Capture.** The kept Proposal is applied by the Reader's ordinary Capture path,
  which resolves the Quote to an Anchor in the rendered Reply and creates one Highlight. There is
  no Agent-specific write route and no second Anchor implementation.
- **Provenance is set at Keep.** Author `agent` records whose judgement the Highlight carries, and
  Provenance records the kept-Proposal route. The Reader remains the actor who kept it.
- **Failure to locate is an outcome, not an error path.** A Quote that cannot be found produces a
  clear answer in the row and no record. No fallback Anchor and no approximate match is invented.
- **The operation reads Consent and nothing else.** Its execution reads the stored Access level
  (to refuse at `read`) and never reads the Margin, so a proposal call cannot leak a Highlight.
- **Model instructions travel with the result.** The result text states that nothing is saved, that
  the Reader keeps or dismisses each Proposal, and that each Quote must be verbatim from the
  Agent's own previous Reply. That instruction is part of the published language, not the row.
- **The row is Presentation's.** This context fixes the contract: verbatim display, one decision
  per Proposal, Keep routed to Capture, Dismiss routed to nothing. Layout, copy and state belong
  to Presentation.

### Deferred Decisions

| Decision not made | Seam that keeps it open |
|---|---|
| Whether a Proposal may outlive the transcript row that shows it | There is no durable Proposal store, so a future one would be an additive contract with its own expiry rule. |
| Whether a kept Highlight's Visibility may be chosen at Keep | Visibility is a Margin judgement attribute; a Keep-time choice would be a pre-filled editor in Presentation, not a change to this contract. |
| Whether the Agent may propose a Mark as well as a Span | The proposal contract names a Quote, which is a Span. A whole-Reply Proposal would need a kind in the contract before it could be offered. |
| Whether a Proposal can be revised rather than dismissed and re-proposed | The contract has one decision per Proposal and no state; revision would need a stored identity before it could exist. |
| Whether Keep should offer a retry when the Quote cannot be located | The failure is honest; a retry would have to ask the Reader to re-select, which is a Presentation gesture. |

## Testing Strategy

The central test is that proposing changes nothing: the Margin is read before and after a proposal
call, and the store is unchanged. Proposing is also tested for what it cannot reach: a proposal
call with no Highlight identity argument, and a proposal call while the Margin contains Highlights,
must return only the submitted Proposals.

Keep is tested through the ordinary Capture path: the resulting Highlight has the verbatim Quote,
Author `agent`, the kept-Proposal route in Provenance and a resolved Anchor. Keep is tested per
Proposal from a row of three, and the unkept Proposals must leave no Highlight. Dismiss is tested
by asserting that the Margin is unchanged in every observable way, including count and versions.

Caps are tested at both boundaries: one Proposal, three Proposals, and four refused; a Quote at
the cap and one over it, with the over-cap Quote reduced to a verbatim prefix and still located.
The read tier is tested with a stale invocation that must refuse and store nothing. Keep with an
unlocatable Quote is tested with regenerated text, and the answer must be a clear failure with no
partial write. Untrusted content is tested with a Note that imitates an instruction, kept and
re-read as text.

## Out of Scope

- The transcript row's layout, wording and interaction states; they belong to
  [Presentation & Resurfacing](../../presentation/CONTEXT.md).
- Capture, the Anchor and its resolution, which belong to [Margin](../../margin/CONTEXT.md) and
  [Anchoring](../../anchoring/CONTEXT.md).
- The model's judgement about which passages are worth proposing; the surface can bound the
  number, and nothing in the domain can make the judgement good.
- Editing an existing Highlight, which no Agent surface offers and which remains a Reader action.
- Any notification or Notice about a kept or dismissed Proposal; outcome feedback belongs to
  Presentation.

## Open Questions

None outstanding. The five questions this specification raised are resolved:

1. **A Proposal's Intent.** The Agent suggests; the Reader keeps; the suggested Intent becomes the
   Highlight's Intent because the Reader kept the Proposal. This is the Reader adopting the Agent's
   judgement, not the Agent setting the Reader's. The Agent never changes an existing Highlight's
   Intent.
2. **The author of a kept Highlight.** Author `agent` plus the kept-Proposal route in Provenance is
   the complete record. A Highlight with Author `agent` can exist only through a Keep, so a
   separate "accepted" flag would record the same fact twice.
3. **Keep after withdrawal.** Yes — Keep remains available (constraint 14): it is the Reader's
   Capture, not an Agent privilege, and withdrawal stops new Proposals rather than the Reader's
   decision about one already rendered.
4. **The proposal budget.** The hard cap is three per call. The skill states the norm ("propose at
   most a few per reply") as guidance, not as a limit the surface enforces, because a per-reply
   limit cannot be observed across calls without a stored Proposal identity.
5. **Proposal durability.** An unkept Proposal is not durable: a reload may lose it, and that is
   acceptable. Keeping it durable would require a Proposal identity and an expiry rule, which the
   design deliberately avoids; the Reader can ask again.
