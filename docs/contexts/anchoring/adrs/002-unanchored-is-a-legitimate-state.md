# ADR-002 — Unanchored is a legitimate state

**Status:** Accepted · **Context:** Anchoring · **Date:** 2026-11-15

## Context

Resolution is best effort, and failure is ordinary: Replies are regenerated and edited, Turns are
folded, history is paged out, earlier Turns are compacted, Sessions are archived and sometimes
deleted out of band. A product that treated every unresolved Anchor as an error would fail on
ordinary use. A product that hid or deleted affected Highlights would destroy the Reader's own
record. A product that silently re-anchored to the nearest matching text would fabricate a location
and misattribute the Reader's judgement. The Margin's promise is that the artefact outlives the
transcript, which means the system needs a way to say "not found now, still mine" that is neither
success nor failure.

## Decision

Unanchored is a first-class Resolution state, not an error: a Highlight whose Anchor cannot be
verified now stays listed with its Quote and Quote context, keeps every field the Reader set, and
may become Anchored again without any action. No Resolution state deletes, hides, edits or
automatically re-anchors a Highlight; Re-anchor is only ever the Reader's explicit act.

## Why

- **Treating it as an error** was rejected because the causes are ordinary lifecycle events rather
  than exceptional failures, and an error model would push surfaces towards retry loops, hiding, or
  destructive recovery for something that may resolve itself on the next render.
- **Hiding or filtering it out by default** was rejected because it turns the Margin into a liar by
  omission: the Reader would see a shorter list than the one they made, and a Highlight that is
  temporarily outside the loaded window would look deleted.
- **Deleting it** was rejected outright: a missing passage says nothing about the value of the
  Reader's judgement, and deletion is the Reader's act, expressed as a Tombstone.
- **Automatically re-anchoring by Quote** was rejected because the same sentence can occur in
  another passage, Reply or Session; without a verified occurrence and context, "repair" would
  silently move a note and change what the Reader's record claims.
- **Distinguishing Unanchored from Archived and Unavailable** was kept because the cause changes
  what the Reader can do about it: text may return, an archive is a product decision, and a gone
  Session is irreversible. One undifferentiated broken state would be honest about failure and
  unhelpful about the next step.

## Consequences

- Lists carry degraded rows and must render the state truthfully; a list is not allowed to make a
  failed Highlight look current.
- Some Highlights may never resolve again — an archived Highlight, or a text deleted with its
  Session — yet they remain part of the Margin indefinitely. The Reader's collection therefore
  accumulates entries whose location is permanently Unanchored, Archived or Unavailable, and the
  surfaces must support that without implying the record is defective.
- Resolution must be derived on demand and reported honestly by every consumer. A surface that
  paints, for example, cannot quietly skip an Unanchored Highlight; it must present it as unplaced.
- Re-anchor exists as a Reader act, not as a background repair, so the repair is legible and the
  system never claims a location the Reader did not supply.
- What becomes hard: no cleanup by deletion, no tidy-up heuristic, and no "fix broken links" batch
  operation. Any future automation in this area inherits the rule that a location may change only by
  a verified Re-anchor, never by an inference.
- The rule that nothing auto-re-anchors is what keeps the four Resolution states meaningful: if the
  system repaired silently, Unanchored would be a transient internal detail rather than something
  the Reader is owed.

## References

- [UBIQUITOUS_LANGUAGE.md](../../../UBIQUITOUS_LANGUAGE.md) §4 — Resolution, Resolution state,
  Unanchored, Re-anchor, Reveal.
- [CONTEXT_MAP.md](../../../CONTEXT_MAP.md) — the Margin outliving the transcript, and the
  Resolution state contract.
- [Resolution and degradation](../specs/resolution-and-degradation.md) — the ladder and the four
  states.
