# ADR-003 — A Mark is a band, a Span is a wash

**Status:** Accepted · **Context:** Presentation & Resurfacing · **Date:** 2026-11-15

## Context

The Margin has two kinds of Highlight. A Span marks a passage — a phrase, a sentence, a paragraph —
and a Mark bookmarks a whole Reply. They are different speech acts: one says "look at this", the
other says "keep this whole reply". The Reader must be able to tell them apart while reading, in
either theme, without opening anything, and a Reply may carry both at once. Colour cannot
distinguish them, because colour is already the Reader's own axis over five fixed slots. Whatever
visual language is chosen also has to survive the case where the browser can apply only part of it.

## Decision

A Span is painted as a **wash**: a rounded, padded fill behind exactly its characters, plus a text
colour supplied by the theme. A Mark is painted as a **band**: one rounded block behind the whole
Reply, at a lighter tint, changing no character's styling. They are two forms, not two settings of
one form. Bands are drawn under washes, so a Span inside a marked Reply still reads as a Span and
the two never compound into an unreadable patch, and an Agent-authored Highlight keeps its Colour
while gaining a quiet provenance cue rather than a second colour.

## Why

- **A character wash for a Mark** was rejected: a whole Reply painted character-by-character reads
  as "everything is selected", which is a selection, not a bookmark, and it is indistinguishable in
  kind from a paragraph Span. It also compounds with any Span inside it.
- **A second colour for Marks** was rejected because Colour is the Reader's axis across five fixed
  slots; making one slot mean "bookmark" takes a colour away from the Reader and conflates kind with
  colour.
- **A gutter rail or margin marker for Marks** was rejected: it depends on a reliable gutter in a
  layout this context does not own, collides when several Highlights share a vertical position, and
  loses the direct association with the Reply it bookmarks.
- **An icon or badge alone** was rejected: it is not visible at reading position and would make the
  Reader hunt for the mark, which is the opposite of the point.
- **One form for both, distinguished only by a label** was rejected because a label is not seen
  while reading; the distinction has to be in the shape.

## Consequences

- The two forms have two different shapes and two different failure modes, so the paint pass
  must keep them in one order (bands below washes) and one list of what is painted rather than each
  form resolve independently.
- A Mark changes no character styling, so it cannot communicate its own presence through colour
  contrast inside text. Its visibility depends on the band's shape and mix, which is why the band is
  rounded, padded and drawn behind the whole Reply rather than as a border around it.
- Mark geometry has the same fate as wash geometry: it is re-derived after every Transcript change,
  because the layer does not own the words it decorates.
- Where the text-colour capability is missing, the Span loses its text colour and the Mark loses
  nothing, because the band is drawn by the plugin's own layer. The visual language therefore
  degrades asymmetrically, and the surfaces must state that.
- A Reply whose content is mixed — text interleaved with other blocks — forces a decision about what
  the band covers. The visual language is defined in terms of the Reply's resolved text, so the
  mixed case is a paint-shape decision and must not silently become a character wash.
- The five Colour slots remain purely the Reader's own axis: no slot is reserved for a kind, and
  provenance is expressed as a cue rather than as a colour.
- The language is **hard to withdraw**: Readers learn a Mark's band as the shape of a bookmark, and
  every stored Mark would re-read differently if the form changed. Reversing it is a product change
  with a migration conversation, not a restyle — which is why the choice is recorded rather than
  left to each surface.

## References

- [In-transcript presentation](../specs/in-transcript-presentation.md)
- [ADR-001](001-margin-is-painted-over-the-transcript.md) — the Margin is painted over the
  Transcript.
- [UBIQUITOUS_LANGUAGE](../../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) — §2, the core
  objects.
