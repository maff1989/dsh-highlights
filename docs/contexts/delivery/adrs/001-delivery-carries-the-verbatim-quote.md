# ADR-001 — Delivery carries the verbatim quote

**Status:** Accepted · **Context:** Delivery · **Date:** 2026-11-15

## Context

A Highlight's Quote is immutable, and it is what the Reader pointed at when they marked the passage.
It is also a Highlight's fallback identity when the Anchor no longer resolves: the text itself is
the durable claim. Delivery hands that text to a Composer it does not control and to a recipient —
the Reader's own next turn, or the Agent — that will treat whatever arrives as the source. Meanwhile
Copy and Insertion are two routes for the same act, so the Reader is entitled to expect them to
carry the same words.

## Decision

An Insertion and a Copy deliver the Highlight's Quote character for character as text. Delivery
never paraphrases, truncates or augments it; the only permitted addition is the Attribution line,
appended as text by default; the deployment may disable it. Identity and State travel only in a
Briefing row, never inside single-Quote text.

## Why

- **Excerpt or shorten the text to suit the Composer.** Rejected: a shorter text is not the Quote.
  The Reader would send the Agent words they never marked, and Copy would disagree with Insert.
- **Reword or summarise so the Agent understands it faster.** Rejected: that is a judgement about
  what the passage means. The Margin's judgement attributes belong to the Reader, and Delivery has
  no authority to interpret them.
- **Carry the Highlight's presentation fields with the text.** Rejected: Delivery's read contract
  covers the Quote, identity, State, Session identity and Visibility only. The Note is the most
  sensitive field of the Margin, so putting it inside inserted text would smuggle it past the
  Consent boundary that governs the Agent's access.
- **Rely on a structured quote that the Composer keeps attached as a reference.** Rejected: the
  Composer cannot be assumed to accept structured quotes, and a delivery contract that only works on
  one Composer shape would fail on the next. The destination contract is text.
- **Mark the Highlight as delivered.** Rejected: Delivery never writes to the Margin, and
  "delivered" is a fact the Margin cannot prove. A placed text can be edited, sent, or deleted, and
  the Highlight is the same either way.

## Consequences

- The Reader can trust that Insert and Copy carry exactly the marked passage, and the two routes
  agree.
- The delivered text can contain nothing that the Consent boundary controls, apart from the citation
  that Attribution adds deliberately: no Note, no Tags, no resolution detail.
- A long Quote is delivered in full. Delivery offers the Composer no truncation relief, and a
  Composer that dislikes long text must still accept it or refuse the placement.
- Attribution is text. The Reader can edit or remove the citation after it lands, and Delivery
  cannot guarantee that the sent message still carries it.
- A single-Quote Insertion carries no reference back to its Highlight; only a Briefing row does.
- When Attribution is enabled and the destination is a different Session from the Highlight's own,
  the citation is the only signal of provenance, which makes the deployment setting load-bearing
  rather than decorative.

## References

- [Glossary: Quote and §7 Delivery](../../../UBIQUITOUS_LANGUAGE.md#7-delivery)
- [Context map, Margin ↔ Delivery](../../../CONTEXT_MAP.md#15--margin--delivery)
- [ADR-002 — Briefing rows carry Highlight
  identities](002-briefing-rows-carry-highlight-identities.md)
