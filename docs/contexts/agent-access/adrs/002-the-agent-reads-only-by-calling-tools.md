# ADR-002 — The Agent reads only by calling tools
**Status:** Accepted · **Context:** Agent Access · **Date:** 2026-11-15

## Context

There are two ways to show the Margin to a model: put some of it into the request, or let the
model ask for it. Injection looks simpler and makes the Agent more likely to use the Margin, but
it makes the Reader's saved text part of the model's context on every turn, whether or not the
turn concerns it, and it moves the consent decision from a call to a request-assembly step that
no tool gate can revoke. Injection is also prefix-unstable, so it breaks reuse of the model's
prompt cache and adds cost to every request for a store the Reader may never consult. The Agent
runtime offers a tool surface and a runtime-skill registration, and the product's promise is that
the Margin is felt only when it is wanted.

## Decision

Nothing from the Margin is injected into a model request. The only door is a tool call: a paged
list and a single fetch, plus one runtime skill whose catalogue line teaches when the Margin is
worth consulting and when it is not. At Access level `off` none of it exists.

## Why

- **A prompt section, rejected.** It is always-on cost, it cannot be gated per call, it makes the
  margin prefix material that every later turn carries, and it hands the Reader's text to the
  model without a question being asked. The Reader's grant would become a filter over content
  that already entered the request, which is not the same contract as consent.
- **An automatic message or an opening summary, rejected.** Same defects as a prompt section, plus
  it manufactures a turn the Reader did not write.
- **Preloading broadly on the first call, rejected.** Reading the whole Margin "so the Agent is
  ready" defeats the list's bounded page and the Note's exclusion, and it makes one call's cost
  scale with the store.
- **A single all-purpose operation, rejected.** It would need one large definition, it would blur
  the distinction between discovery and the Note-bearing fetch, and it would make the consent
  decision coarser than the Reader's permissions.
- **Two operations and one skill, accepted.** The list is cheap to call and safe to return in
  bulk because it carries no Notes; the fetch is the deliberate escalation for the one item that
  matters; the skill supplies the habit that the descriptions cannot carry without bloating.

## Consequences

- With access off, the model's request is unchanged: no operation description, no skill line, no
  runtime context
  and no automatic message.
- Consent is enforced at the point of the call, which is the same point at which a withdrawal can
  be honoured.
- The Agent can only read the Margin if it decides the Margin is relevant. The skill teaches the
  habit, but nothing can force the model to follow it, and a turn that ignores the Margin simply
  has no margin content.
- At `read` the fixed cost is two operation descriptions and one skill catalogue line; a result is
  bounded by page size and excerpt length, so cost does not grow with the Margin.
- The read pair must carry the whole reading contract — filters, scope, caps, untrusted content —
  because there is no prose channel to explain it per turn.
- **Hard:** the model cannot be guaranteed to know the Margin exists beyond one catalogue line,
  and the two-operation surface must be good enough on its own; an Agent that never calls gets no
  benefit, which is the intended trade for a Margin that never leaks into a request.

## References

- [The Agent surface specification](../specs/agent-surface.md)
- [Consent specification](../specs/consent.md)
- [Agent Access context](../CONTEXT.md)
- [UBIQUITOUS_LANGUAGE.md §6](../../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface)
