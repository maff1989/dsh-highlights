# ADR-001 — The Anchor is a selector, not a pointer

**Status:** Accepted · **Context:** Anchoring · **Date:** 2026-11-15

## Context

The Margin promises to outlive the Conversation, but the Conversation belongs to the product and
changes under the plugin: Replies are re-rendered, folded, regenerated, compacted, paged out and
deleted, and no stable address is promised for every Reply. Storing a rendering reference, a range,
a scroll position or another live handle would make a Highlight's meaning depend on a surface the
Margin does not own, so any re-render could turn a valid Highlight into a broken or, worse, a
misplaced one. At the same time, storing only the Quote would make a repeated sentence
indistinguishable from the passage the Reader actually marked. The Anchor therefore has to survive
both the product's churn and the ambiguity of text.

## Decision

An Anchor is a selector, not a pointer: it records the durable identity of the Reply occurrence the
Highlight came from, the verbatim Quote, up to 48 characters of Quote context on each side, and a
versioned record of where the Quote sat inside that Reply's rendered text. It is resolved on demand,
may fail, and is never the Highlight's identity; the Highlight keeps its identity and Quote whatever
the Anchor's fate.

## Why

- **A rendering reference or range** was rejected because it is invalidated by exactly the events
  the Margin exists to survive — reload, re-render, transcript presentation change, folding, history
  paging — and because it would couple a stored Highlight to a product detail the plugin does not
  control.
- **A screen or scroll position** was rejected for the same reason and one more: it is meaningless
  outside the moment it is taken, so it cannot be recovered at all after a reload.
- **The Quote alone** was rejected because a sentence may appear twice in one Reply: without a
  recorded occurrence and Quote context, Resolution would have to guess, and guessing is how a note
  ends up attached to the wrong passage.
- **A durable message identity alone** was rejected because not every Reply exposes one, and because
  identity says which Reply, not which passage inside it.
- **A selector composed of identity, Quote, Quote context and a versioned position** is the smallest
  value that can survive churn, re-find a passage after it moves, and refuse to guess when it cannot
  verify.

## Consequences

- A Highlight's location is always a best-effort claim. Resolution can fail, and failure is a normal
  Resolution state rather than an exception.
- Every consumer pays a resolution cost on demand; the ladder runs again rather than reading a
  stored location.
- The recorded position is meaningful only against the reading-rule version beside it, so a change
  in how Reply text is read degrades gracefully into a Quote search instead of producing a wrong
  highlight. That graceful degradation is also why the recorded position can never be treated as a
  shortcut that skips verification.
- The Anchor carries text, not rendering, so it can be stored with the Highlight without dragging
  surface, storage or transport concerns into this context.
- What becomes hard: there is no exact frame for a Highlight to remember, no cheap "paint this
  range" path that bypasses Resolution, and no promise that a Highlight will be found tomorrow.
  Repeated Quotes and heavily edited Replies push the ladder to its limits, which is why the states
  and the ladder must be visible to the Reader rather than hidden.
- A second, cheaper resolution path for lists or painting would defeat the design; one ladder, one
  owner.

## References

- [UBIQUITOUS_LANGUAGE.md](../../../UBIQUITOUS_LANGUAGE.md) §2 and §4 — Anchor, Quote, Quote
  context, Resolution.
- [CONTEXT_MAP.md](../../../CONTEXT_MAP.md) §1.3 — the Margin ↔ Anchoring contract, and the "no
  stable identity on every Reply" boundary pressure.
- [Anchoring CONTEXT.md](../CONTEXT.md) and [the Anchor model](../specs/anchor-model.md).
