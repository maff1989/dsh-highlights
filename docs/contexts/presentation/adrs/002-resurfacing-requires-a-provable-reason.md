# ADR-002 — Resurfacing requires a provable reason

**Status:** Accepted · **Context:** Presentation & Resurfacing · **Date:** 2026-11-15

## Context

A Margin that only grows stops helping: the Reader keeps capturing and never returns to what they
captured. The obvious answer — show the Reader what matters — needs either a relevance score or a
history of what the Reader has looked at, and this product refuses both: it does not profile the
Reader, does not track visits, and cannot justify a ranking it cannot explain. Yet a returned
Highlight is the difference between a note and a decision. The design needs a way to put a Highlight
back in front of the Reader that is honest, deterministic and cheap, and that stays silent when it
has nothing to stand on.

## Decision

Resurfacing presents a Highlight only when stored data proves one of exactly four reasons: **Starred
and new**, **Kept and not compiled**, **Text changed**, or **Stale and new**. Each surfaced row
carries exactly one reason, chosen by a fixed precedence, and the block's order is fixed as well:
reason precedence, then the most recently touched Highlight, then identity. When no reason holds,
Worth another look does not exist. Nothing is scored, ranked, recommended, or based on a visit.

## Why

- **A relevance score or ranking** was rejected: it cannot be explained to the Reader, it would need
  engagement data the product refuses to collect, and it would make a defensive claim ("this is what
  matters") that a supporting context has no standing to make.
- **Recency-only resurfacing** was rejected because it is not a reason: it floats whatever was
  touched last, including Highlights the Reader has already finished with, and it would need a rule
  anyway for what "recent" means.
- **"Never revisited"** was rejected because it requires tracking views. Visits are not stored, and
  a product that starts tracking them to justify a block has changed what it is.
- **A per-row hand-picked reason** was rejected because the same data could then produce different
  rows on different days with no explanation. One fixed precedence keeps the block reproducible and
  lets a row's reason be checked against the data.
- **Always showing the block, even empty**, was rejected: an empty recommendation area invites the
  Reader to read absence as a judgment, and the silence rule is stronger than a placeholder.
- **Surfacing everything and letting the Reader decide** was rejected because it is
  indistinguishable from the full list, which already exists.

## Consequences

- Some Highlights never resurface. A `compiled`, unstarred, anchored Highlight is finished, and no
  reason will ever bring it back — that is the intended meaning of `compiled`.
- The block is often absent, and its absence is a correct, tested outcome rather than a missing
  feature.
- A fifth reason, or a configurable one, is a domain change: it is stated in the glossary and the
  map before any surface changes.
- The four predicates are the whole vocabulary of resurfacing. Anything a Reader might want to say
  about "why this appeared" has to fit one of their four sentences, or the design does not get to
  say it.
- The block has to be derived from the whole Margin rather than from the narrowed list, so it is
  hidden whenever the list below it is filtered; the two must never disagree on screen.
- The reason a row prints must stay attached to the fact that produced it. A copied or paraphrased
  reason that drifts from its predicate is a defect, not a wording choice.

## References

- [Discovery and resurfacing](../specs/discovery-and-resurfacing.md)
- [Surfaces](../specs/surfaces.md)
- [UBIQUITOUS_LANGUAGE](../../../UBIQUITOUS_LANGUAGE.md#5-judgement-and-resurfacing) — §5, Judgement
  and resurfacing.
