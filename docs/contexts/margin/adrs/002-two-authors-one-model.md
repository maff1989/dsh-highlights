# ADR-002 — Two authors share one Highlight model

**Status:** Accepted · **Context:** Margin · **Date:** 2026-11-15

## Context

The Agent may propose Highlights when Consent allows, and the Reader may keep one; a kept
Proposal is a real Highlight carrying the Agent's judgement. Two temptations follow: keep Agent
material in a separate store or type so the Reader's margin stays "pure", or let one Highlight
carry two authors, one per contributor.

## Decision

One Highlight model, one store and one lifecycle serve both authors. Author is a property fixed
at capture — `user` for a direct save, `agent` for a kept Proposal — and an Agent-authored
Highlight enters only through Keep, by way of the ordinary Capture path.

## Why

- **A second store would duplicate every hard decision.** Identity, Tombstones, the cap, Consent,
  erasure and listing would each need two answers, and "what did I keep about this?" would have
  to merge them.
- **A separate type would put the Guest rule in the shape.** Every consumer would branch, and a
  privacy rule would be enforced by type rather than by Consent — the wrong place, because it
  must still hold if a new surface renders the type.
- **Two authors would blur provenance, and a separate store would hollow out Keep.** A Reader's
  edit to a two-author Highlight would dilute the Agent's authorship, while a kept Proposal kept
  outside the Margin would not be durable or editable under the one set of rules.

## Consequences

- Every consumer carries Author in its view model and uses it where provenance matters, such as
  painting, lists and the Agent surface; none may branch the object itself.
- Author cannot be reassigned, so an accidental Keep is undone by Delete, not by relabelling.
- Keep must resolve the Quote through the ordinary Capture path, so it can fail when the Reply
  changed, and that failure must be stated; a wider Agent capability remains a Consent decision.

## References

- [CONTEXT](../CONTEXT.md), [CONTEXT_MAP](../../../CONTEXT_MAP.md),
  [glossary §6](../../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface),
  [Agent Access](../../agent-access/CONTEXT.md), [Judgement model](../specs/judgement-model.md);
  the Host-side validation authority is ADR-005 in `../../../../../ADRS.md`.
