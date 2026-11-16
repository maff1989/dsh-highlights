# ADR-001 — The Margin is painted over the Transcript

**Status:** Accepted · **Context:** Presentation & Resurfacing · **Date:** 2026-11-15

## Context

The Margin has to be visible where it is made: a Highlight that cannot be seen at reading position
is a list entry, not a mark. The Transcript, however, belongs to Chat. It exposes no decoration seat
inside a Reply body, it owns the markdown rendering and the streaming of an in-flight Reply, and it
can change its rendering between releases. The Reader must still be able to select text, follow
links, quote a passage and read a half-streamed Reply as if no Highlight existed. At the same time a
Highlight outlives the Transcript: it is stored independently and must remain readable when the
Transcript cannot show it at all.

## Decision

The Margin is presented as a **paint layer over the Transcript**, never as content inside it. A Span
is drawn as a rounded, padded wash behind exactly its characters and a Mark as one rounded band
behind its Reply; both are derived on demand from stored Highlights and the current Transcript, and
neither alters a single character of the conversation. The paint layer is inert: it receives no
pointer input of its own, and the one interaction over it — clicking a Highlight to open the Item
card — is observed beside it rather than built into it.

## Why

- **Adding markup to the Reply body** was rejected: it writes into the upstream rendering tree,
  which collides with the streaming of an in-flight Reply, with markdown reconciliation, and with
  any future change to Chat's rendering. It would also make the Highlight visible to Chat's own
  bookkeeping, which is not this context's data.
- **Asking Chat for a decoration seat** was rejected because no such seat exists, and a fork of the
  message view was rejected because it trades a presentation problem for ownership of a surface
  this context does not own.
- **Floating a fixed layer over the viewport** was rejected because it has to follow scrolling every
  frame, lags visibly behind the text, and paints over the composer and the Transcript's own chrome.
  The chosen layer is positioned with the content, so the text and the paint move together.
- **Replacing the Reply's text styling per character** was rejected for Marks: it makes a
  whole-Reply bookmark read as "everything is selected", and it compounds unreadably with a Span
  inside it.
- **Not painting at all**, and showing the Margin only in lists, was rejected because the product's
  central promise is that the mark is where the reading happened.

## Consequences

- Every repaint must re-derive painted geometry after a Transcript change, because the layer cannot
  own the words it decorates; the work is bounded by one coalesced pass per change and must never
  become per-frame work.
- Painting is **visual only**: assistive technology is not told that a Highlight exists in the
  Transcript. Accessibility therefore has to be carried by the lists and the surfaces, where the
  Quote is the accessible name of everything that represents a Highlight.
- The visual language is coupled to the Transcript's geometry. A future Chat change to layout or
  scrolling is a presentation change, not a Margin change, and the paint layer must be re-measured
  against it.
- Where the browser cannot apply text colour, only part of the visual language is available. The
  rounded fills and the Mark bands are drawn by the plugin's own layer, so a Highlight stays
  visible, and the surfaces have to state the capability truthfully rather than pretend.
- A painted passage cannot itself be a control. The way into an existing Highlight is one observed
  click plus the Item card, and the paint must never intercept selection, links or quoting to
  provide it.
- The paint layer is one mechanism behind one pass, so an upstream decoration seat, if it ever
  arrives, can replace the mechanism without changing the visual language.

## References

- [In-transcript presentation](../specs/in-transcript-presentation.md)
- [Surfaces](../specs/surfaces.md)
- [ADR-003 — A Mark is a band, a Span is a wash](003-mark-is-a-band-span-is-a-wash.md)
- [CONTEXT_MAP — boundary pressure: no decoration seat inside a Reply body](../../../CONTEXT_MAP.md)
