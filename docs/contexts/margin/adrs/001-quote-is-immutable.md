# ADR-001 — The Quote is immutable after capture

**Status:** Accepted · **Context:** Margin · **Date:** 2026-11-15

## Context

The Quote is three things at once: the text the Reader sees, the recognition key Anchoring
searches for when it re-finds the passage, and the fallback identity that keeps a Highlight
meaningful when its Anchor no longer resolves. After a mis-selection or a typo, editing the text
is the Reader's most natural request, and every other field has an editor.

## Decision

The Quote, the kind and the owning Session are fixed at capture. Every editable field is a
presentation field or a judgement attribute, so the only way to change what a Highlight covers is
to delete it and capture the passage again.

## Why

- **An editable Quote would make the Highlight lie.** The Margin would claim the Reply said
  something it never said, and other contexts treat the Quote as evidence.
- **It would break the Anchor contract.** Edited in place, the selector describes text that is
  no longer there; with a re-anchor, every correction becomes a resolution problem.
- **Capturing again is cheap; revisions are not.** Replacement produces the correct Highlight in one
  gesture, while keeping revisions would multiply identity, erasure, Consent and sync decisions
  for a rare correction.

Alternatives rejected: editing in place (the Anchor points at text it does not describe); editing
with a re-anchor (the selector may no longer match, so the Highlight could silently move); keeping
revisions (identity stops being the unit of undo, erasure and Consent).

## Consequences

- A mis-selection cannot be corrected in place; it is deleted and captured again.
- The Quote is the one field every consumer may treat as evidence without a provenance question.
- Presentation and judgement edits cannot change what was read, so they are safe by construction.
- A sensitive Quote cannot be edited away — only deleted, and erased only by the purge.

## References

- [CONTEXT](../CONTEXT.md), [CONTEXT_MAP](../../../CONTEXT_MAP.md),
  [glossary §2](../../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects)
- The anchor decision behind this one is ADR-004 in `../../../../../ADRS.md`; specified in
  [Highlight model](../specs/highlight-model.md).
