# Documentation — the margin

**Set status.** The intent documents were drafted, reconciled and accepted on 2026-11-15. The
specifications carry `Status: Accepted`, and the set is now the canonical target the engineering
record is measured against.

This directory holds two kinds of record, deliberately kept apart:

| Kind | Purpose | Canonical? |
|---|---|---|
| **Intent documents** — this file, [`INTENT.md`](INTENT.md), [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md), [`CONTEXT_MAP.md`](CONTEXT_MAP.md), [`ARCHITECTURE.md`](ARCHITECTURE.md) and everything under [`contexts/`](contexts/) | What the product *is for*, the language it is described in, the domain rules and the architecture that must keep them | **Yes** — the target the build is measured against |
| **Engineering records** — `implementation-notes.md`, `known-limitations.md`, `issue-log.md`, `upstream-asks.md`, `workaround-ledger.md`, `spikes-2026-11.md`, `phase-*-report.md` | What the build actually does today, what broke, what it worked around, what it asked upstream for | No — status and history |

The rule that keeps the two honest: **the intent documents never claim implementation
status.** They state intended behaviour, invariants and refusals. Where reality falls
short, the engineering records say so; nothing here says "implemented", "deferred" or
"not yet". A reader who needs to know whether something ships reads the engineering
records, not this tree.

## How to read this set

1. [`INTENT.md`](INTENT.md) — why the plugin exists: the problem, the three jobs
   (notice, return, hand forward), the design principles and the non-goals.
2. [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md) — the canonical vocabulary.
   Everything else in this tree uses these words in exactly these senses; the collisions
   table settles the overloaded ones.
3. [`CONTEXT_MAP.md`](CONTEXT_MAP.md) — the six bounded contexts, their relationships
   with each other and with the harness, the published contracts, the dependency matrix
   and the deferred decisions.
4. [`ARCHITECTURE.md`](ARCHITECTURE.md) — the promises the architecture keeps, the two
   halves and their authorities, the deep modules, the seams, and the failures the design
   exists to prevent.
5. [`contexts/`](contexts/) — one directory per context: its `CONTEXT.md`, its domain
   specifications (with Given/When/Then acceptance scenarios) and its intent-level ADRs.

For day-to-day development, read the context that owns the concept you are changing, then
the engineering record for what currently exists.

## The contexts

| Context | Classification | Directory | Owns in one line |
|---|---|---|---|
| **Margin** | Core | [`contexts/margin/`](contexts/margin/) | What a Highlight is and what may change about it |
| **Anchoring** | Supporting | [`contexts/anchoring/`](contexts/anchoring/) | Binding a Highlight to a place in the transcript, and degrading honestly when it cannot |
| **Presentation & Resurfacing** | Supporting | [`contexts/presentation/`](contexts/presentation/) | Making the Margin visible, navigable and honest — in place and in lists |
| **Delivery** | Supporting | [`contexts/delivery/`](contexts/delivery/) | Handing the Margin forward without losing it |
| **Agent Access** | Supporting | [`contexts/agent-access/`](contexts/agent-access/) | Admitting the agent to the Margin on the reader's terms |
| **Persistence & Distribution** | Generic | [`contexts/persistence/`](contexts/persistence/) | Keeping the Margin durable, reachable and installable |

Each context directory contains:

- `CONTEXT.md` — purpose, ownership, invariants, published and consumed contracts,
  primary flows, degradation, boundary rules, deferred decisions and the documentation
  index for that context.
- `specs/` — domain specifications. Each one follows the house spec template:
  definitions, constraints, problem, solution, user stories, Given/When/Then acceptance
  criteria, implementation decisions, deferred decisions, testing strategy, out of scope,
  open questions. These are intent, not design-by-code: no file paths, no snippets.
- `adrs/` — intent-level architecture decision records. An ADR is written only when a
  decision is hard to reverse, surprising without context, and the result of a real
  trade-off. Engineering-level ADRs stay in the workspace root `ADRS.md`; intent-level
  ADRs cross-reference them by number.

## Conventions

- **Vocabulary is not negotiable per document.** A missing or wrong term changes in
  [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md) first, then in the documents that
  use it.
- **One meaning per term.** Overloaded words are resolved in the glossary's collisions
  table; a document that needs a new sense adds a row there.
- **Intent, not mechanism.** Specs state behaviour and invariants. A mechanism is named
  only where the contract *is* the mechanism (e.g. "version-guarded write").
- **Acceptance criteria are overloading, not decoration.** Every spec states its intent
  twice: as prose and as Given/When/Then scenarios. The two must agree; a disagreement is
  a spec defect, not an implementation detail.
- **Deferred decisions are first-class.** Each one names the decision *not* made and the
  seam that keeps it open. Deferring is a design virtue; the seams are in
  [`ARCHITECTURE.md` §5](ARCHITECTURE.md#5-seams--where-deferred-decisions-live).
- **British spelling** (colour, behaviour, organise), wrapped at 100 columns.
- **Links are relative and must resolve.** A link to a document that does not exist is a
  defect in the document that holds it.

## Changing this documentation

1. A change inside one context updates that context's `CONTEXT.md` and its specs.
2. A change to a published contract updates [`CONTEXT_MAP.md`](CONTEXT_MAP.md) and every
   consumer's document in the same change — the contract table there is the checklist.
3. A new boundary, or a dependency the matrix forbids, is a map change first: add the
   edge, its pattern, its contract and its failure mode, then write the spec.
4. A change to intent updates [`INTENT.md`](INTENT.md) before anything else, because the
   principles there are the reason the contexts are shaped as they are.

## Relationship to the rest of the repository

The workspace root holds the feature-level engineering records (`DESIGN.md`,
`IMPLEMENTATION.md`, `ADRS.md`, `REVIEW.md`, `TRACKING.md`, `REMAINING.md` and the review
packet under `review/`). Those records remain the engineering narrative; this tree is the
intent narrative. Neither replaces the other, and the code-identity table in the glossary
is the bridge between them.
