# ADR-003 — Proposals never persist
**Status:** Accepted · **Context:** Agent Access · **Date:** 2026-11-15

## Context

The Agent is often the party best placed to notice which passage of its own reply the Reader will
want later: a claim worth checking, a correction, a direction to carry forward, a fact to come
back to. Giving the Agent a direct write would end the Reader's authorship of the Margin, would
require conflict, version and undo semantics for a non-Reader actor, and would blur the provenance
that makes a Highlight trustworthy. Yet without a proposal path the Reader must recreate by hand
what the Agent could have pointed at. There is also a record-keeping temptation: a queue of
pending suggestions looks helpful, but it is a second store with its own lifecycle, consent
questions and expiry, and it would let Agent-authored material live in the Margin before any
Reader decision.

## Decision

A Proposal is never stored. At Access level `read-write` the Agent may submit at most three
Proposals per call, each a verbatim Quote with optional Note, Tags, Colour and Intent; they are
normalised and returned, and the transcript row shows them. Keep applies the Reader's ordinary
Capture path to create exactly one Agent-authored Highlight; Dismiss leaves nothing.

## Why

- **Direct Agent writes, rejected.** The Agent would become an author of the Reader's record
  without the Reader's act, with no Reader-facing undo and with conflicts between an Agent write
  and a Reader edit that the domain does not need to have.
- **A stored Proposal queue, rejected.** It would be a second durable object with its own consent
  meaning ("does the Agent's suggestion count as the Reader's margin?"), its own expiry and its
  own freshness. The decision point is a transcript row; storing the suggestion adds machinery
  without adding a decision.
- **Auto-keeping above a confidence threshold, rejected.** It is direct writing with extra steps
  and a worse provenance story.
- **Letting the Agent amend an existing Highlight, rejected.** It destroys the Reader's authorship
  and makes the margin's history unrecoverable in principle.
- **Propose, show verbatim, Keep or Dismiss, accepted.** It keeps the Agent in the guest role, it
  makes the Reader's decision explicit and visible on the actual text, and it reuses Capture so
  there is one write path and one Anchor implementation.

## Consequences

- The Agent has no write path at all, so the Guest rule needs no exception and no new conflict,
  version or undo contract.
- Keep is the Reader's act. A kept Highlight carries Author `agent` and the kept-Proposal route in
  its Provenance, so browsing the Margin shows whose judgement each Highlight carries.
- The Proposal row is the only representation of an unkept suggestion, which bounds its life to
  the transcript row. A reload or a session that loses the row loses the suggestions; the Reader
  can ask again, and nothing in the Margin is affected either way.
- Keep can fail honestly when the verbatim Quote no longer exists in the rendered Reply. No
  fallback Anchor and no approximate match is invented, and no Highlight is partly written.
- The per-call cap keeps a reply from becoming a dump, and the verbatim requirement keeps a
  Proposal locatable rather than merely plausible.
- **Hard:** the Agent cannot correct or withdraw its own earlier suggestion, and the Reader must
  act for anything to enter the Margin; unkept Proposals have no durability guarantee.

## References

- [Proposals specification](../specs/proposals.md)
- [Consent specification](../specs/consent.md)
- [Agent Access context](../CONTEXT.md)
- [UBIQUITOUS_LANGUAGE.md §5](../../../UBIQUITOUS_LANGUAGE.md#5-judgement-and-resurfacing)
