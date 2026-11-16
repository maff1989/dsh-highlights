# ADR-002 — Briefing rows carry Highlight identities

**Status:** Accepted · **Context:** Delivery · **Date:** 2026-11-15

## Context

A Briefing exists so the Agent can act on the Reader's Highlights without the Margin injecting
anything into a request: the Agent must ask. But the Agent's read surface resolves Highlights one
identity at a time, so a Briefing that names nothing is a dead end. Sending the full Quotes instead
would be unbounded — ten long passages in one Composer, copied into the Agent's context — and it
would turn a pointer into a second, weaker copy of the Margin. The Reader needs a packet short
enough to place but complete enough that every included Highlight stays reachable.

## Decision

Every Briefing row carries the Highlight's identity, its State and a short display excerpt. The
identity is the payload — the Agent resolves each row through the Agent surface's
read-by-identity operation — and the excerpt
is only recognisability. The packet is bounded, and when the cap would be exceeded whole items are
dropped from the end, so no identity is ever cut.

## Why

- **Send the full Quotes instead.** Rejected: the packet becomes unbounded in both item count and
  item length, it floods the Composer and the Agent's context, and it pays a large token cost for
  text that already has an identity.
- **Summarise the Session's Highlights into prose.** Rejected: the Agent could not resolve a summary
  back to Highlights, and producing one would be Delivery interpreting the Margin — a judgement it
  does not own.
- **Send excerpts without identities.** Rejected: the Agent would have to search by text, similar
  passages would be indistinguishable, and an Unanchored Highlight has no Transcript text to find
  anyway.
- **Include Notes to give the Agent context.** Rejected: Notes are the Margin's most sensitive
  field, the Agent surface excludes them entirely, and a Briefing must not become a
  second consent path.
- **Cut the packet at a character bound regardless of rows.** Rejected: a cut identity is unusable,
  and a half-row is worse than no row. Dropping whole items from the end keeps every surviving row
  resolvable.
- **Rank or reorder items to fit the cap.** Rejected: the packet keeps the Session's transcript
  order so the Agent reads items in the order the Reader encountered them. Ranking is a judgement
  Delivery does not own.

## Consequences

- The packet stays bounded while every included Highlight remains resolvable, and private Highlights
  and Notes never leave the Margin through it.
- The Agent must make up to one follow-up read per row to see the full Quote. That is the intended
  cost: the Agent fetches the exact text under its own Consent rather than trusting a summary.
- Items at the end can be omitted because of the cap, and the packet shows that only by listing
  fewer rows; a Reader may not notice which were dropped.
- Private Highlights are excluded silently, so a Reader cannot tell from the packet that items were
  excluded. The packet never states that private Highlights were omitted — that disclosure is the
  leak the exclusion prevents — while the Reader-facing outcome may state how many were withheld.
- A Briefing can name identities that the Agent's own Consent or scope does not expose. Delivery
  cannot know Consent, so some rows may be unresolvable for the Agent; the packet itself says
  nothing about that.
- The excerpt is display-only and is never stored, so it cannot be cited or audited later.
- The identity is treated as opaque. Any change to what an identity is or how it is resolved is a
  change to the Briefing contract.

## References

- [Glossary: Briefing, Visibility and the Agent surface](../../../UBIQUITOUS_LANGUAGE.md#7-delivery)
- [Context map, Margin ↔ Delivery](../../../CONTEXT_MAP.md#15--margin--delivery)
- [ADR-001 — Delivery carries the verbatim quote](001-delivery-carries-the-verbatim-quote.md)
