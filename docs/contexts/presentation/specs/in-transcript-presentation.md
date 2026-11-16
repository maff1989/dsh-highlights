# In-transcript presentation

**Status:** Accepted
**Context:** Presentation & Resurfacing
**Date:** 2026-11-15

## Definitions

- **Paint layer** — the visual layer this context draws *over* the Transcript. It carries every
  painted Span and every painted Mark. It is not part of the Transcript's content and carries no
  Reader-operable control of its own.
- **Painted Span** — a Span's visible form: a rounded, padded wash behind exactly the selected
  characters, tinted with one of the five Colour slots, with the passage's text drawn in the theme's
  text colour.
- **Painted Mark** — a Mark's visible form: one rounded band behind the whole Reply, tinted with the
  Mark's Colour. A band changes no character's styling.
- **Visible Session** — the Session whose Transcript is on screen. Painting is scoped to it; every
  other Session's Highlights are not painted.
- **Repaint** — the automatic re-derivation of painted geometry after the Transcript changes
  (streaming, a Turn expanding, a resize, the right-hand layout opening or closing, a navigation).
- **Provenance cue** — the quiet secondary mark that distinguishes an Agent-authored Highlight from
  one the Reader authored, without changing its Colour: a dotted underline on a Span and a dashed
  outline on a Mark.
- **Capability-degraded painting** — the condition in which the browser cannot apply a Highlight's
  text colour. Rounded washes and Mark bands still paint; only the text colour is lost.
- **Instant landing** — how a Reveal arrives: the anchored passage is scrolled into view once, with
  no animation, no flash and no easing, so the Reader is looking at the text when the view settles.

## Constraints

1. **The Transcript is not ours.** Chat owns the Reply body, its rendering, its node identity and
   its text projection. There is no decoration seat inside a Reply body, and this context may not
   add one.
2. **The Transcript's content is never altered.** Text selection, links, quoting, the streaming of
   an in-flight Reply, copied selections and Chat's own selection surface all keep working while
   Highlights are painted.
3. **No scroll command exists.** The Transcript is the harness's; this context may open a Session
   and page history through public behaviour, but it may not command a scroll position from outside.
4. **Five slots, two themes.** Colour is one of five fixed themed slots — Amber, Green, Violet,
   Blue, Red — and the theme supplies light or dark automatically. No surface may invent a colour.
5. **Painting is visual only.** Assistive technology is never told that a Highlight exists in the
   Transcript, and the painted geometry is never a focusable or operable control.
6. **The Margin outlives the paint.** A Highlight exists whether or not it is painted; losing paint
   is a display outcome, never a loss of the Highlight.
7. **One pass per change.** Repainting may not block reading or typing: its work is coalesced into
   one pass per Transcript change and never runs per frame while the Reader is idle.
8. **A Session is not always on screen.** At most one Transcript is visible; a Highlight in another
   Session is not painted and produces no work.
9. **Reveal is best effort and never an error path.** The harness offers no reveal command, so a
   Reveal composes public behaviour and may fail to land; failure is stated as an outcome.
10. **Motion is optional.** Nothing about painting or revealing depends on animation, and any
    decorative transition is suppressed when the Reader asks for reduced motion.

## Problem

The Margin's value depends on being seen where it was made. A Reader who marks a passage and cannot
see it afterwards cannot trust the Margin, and one who sees the Transcript altered around the mark
cannot trust the conversation either. The product therefore needs a visual language that shows
Highlights at reading position, distinguishes a passage from a whole Reply, follows the theme, and
never becomes part of the content Chat owns — while remaining honest when the browser can paint only
part of it and when a passage can no longer be found.

## Solution

### The two forms

A **Span** is shown as a rounded, padded wash behind exactly the selected characters, tinted in one
of the five Colour slots. The fill is the primary signal: it is what makes a phrase, sentence or
paragraph read as marked. The passage's text is drawn in the theme's text colour, so the wash never
turns readable text into an unreadable colour, and so emphasis and links inside the passage keep the
theme's own contrast rules.

A **Mark** is shown as one rounded band behind the whole Reply, tinted in the Mark's Colour. A band
is deliberately not a character wash: it changes no character's styling, it does not look like "the
whole reply is selected", and it cannot compound with a Span's wash into a darker patch. A Span
inside a marked Reply reads above the band, so the two forms coexist on one Reply without either
hiding the other. Where a Reply mixes text with non-text blocks — code, tables, other widgets — the
band covers the Reply's rendered text region and never paints over content it does not band: the
band claims only what it covers.

Both forms follow the theme: the same Colour slot is lighter in the light theme and deeper in the
dark theme, and a change of theme re-paints without the Reader doing anything. An Agent-authored
Highlight keeps its Colour and gains a quiet provenance cue, so provenance is visible without a
second colour vocabulary.

### The layer rules

Painting is a layer over the Transcript and behaves like one:

- It never writes into the Transcript's own content and never replaces any of it. The words are
  Chat's; the paint is drawn around them.
- It follows the text as the Transcript scrolls and reflows, without lag or drift, and it never
  covers the composer, the Session header or other Transcript chrome.
- It never receives pointer input of its own: text remains selectable through a painted passage, a
  link inside a painted passage still opens, and quoting a painted Selection works exactly as it
  would without a Highlight.
- It is drawn at reading position in the Transcript, not per Reply in the abstract: the wash hugs
  the characters on every line the passage wraps across.

### What the Reader can do with paint

A left-click on painted characters is the Reader's way into an existing Highlight: one action opens
the Item card for a Highlight whose passage was clicked. The paint itself adds no buttons: the card
is the edit surface, and painting stays a reading aid.

Where two Highlights overlap, each keeps its own Colour and both remain legible. A click on shared
characters opens one of them deterministically rather than according to which paint happens to sit
higher, so the lists remain the reliable way to reach the other. A Span inside a Mark is the common
overlap and always reads as a Span.

### Scope and repaint

Only the Visible Session is painted. A Highlight belonging to another Session waits: it produces no
work and no Notice, and it is painted on the first pass after its Session becomes visible. If the
Session leaves the screen while the Highlight selection bar or the Annotation popover is open, that
surface is dismissed rather than left floating over a Transcript that is no longer there.

Repaint is automatic and boring, which is the point: a Transcript change — a Reply still streaming,
a Turn expanding, the right-hand layout opening or closing, a window resize, a navigation — is
followed by one coalesced pass. The pass measures everything it needs before it changes anything, so
it costs the Reader one layout rather than one per Highlight; a change that draws no new geometry
writes nothing.

### Reveal

A Reveal opens the owning Session, pages history back when the target is outside what is loaded, and
brings the anchored passage itself — not merely its Reply — into view. It lands instantly: one final
position, no animation, no flash and no easing. A Reveal is best effort. When the passage cannot be
brought into view — a folded Turn, content that never appears, an archived or deleted Session —
Reveal completes without landing, the Session may simply be open, and the invoking surface states
that the text could not be found. Nothing is retried in a loop, nothing is reported as a failure
dialog, and the Highlight is unchanged.

### Degradation

1. **No text colour capability.** The rounded washes and the Mark bands still paint, because they do
   not depend on it. A highlighted passage is therefore still visible; only its text colour is the
   theme's normal text colour. The Session tab and the Global page state in place that this browser
   cannot paint Highlights and that lists and Copy still work.
2. **A passage cannot be resolved.** It is not painted, and the Highlight is reported as Unanchored
   in every list. Its Quote, Colour, Tags, Note and State remain exactly as stored; lists stay
   readable and every action except Reveal keeps working.
3. **A Session is archived or unavailable.** Its Highlights stay listed; they are not painted
   because the Transcript is not on screen; Reveal says why it cannot work.
4. **A Reply is regenerated or edited.** Whether the stored passage is still found is a Resolution
   state decided by Anchoring. A Highlight that stops resolving loses its paint and gains the
   Unanchored badge; one that becomes findable again is painted on the next pass without the Reader
   doing anything.
5. **A Highlight sits inside a folded Turn.** Nothing inside a folded Turn is on screen, so nothing
   there is painted. The Highlight keeps its Quote and stays listed, and a Reveal of it is subject
   to what the Turn will show.
6. **Reduced motion.** No transition is used to communicate paint, State or a Reveal; the instant
   landing is already motion-free.

## User Stories

1. As a Reader, I want a marked passage to be visibly marked where I read it, so I can see what I
   have noticed without leaving the conversation.
2. As a Reader, I want a whole-Reply Mark to look different from a marked phrase, so I can tell a
   bookmark from a passage at a glance.
3. As a Reader, I want the mark to follow the text as I scroll and as the Reply grows, so it never
   sits beside the wrong words.
4. As a Reader, I want to keep selecting, linking and quoting inside a painted passage, so the
   Margin never gets in the way of the conversation.
5. As a Reader, I want the paint to follow my theme, so a highlight reads naturally in light or
   dark.
6. As a Reader, I want to click painted text and reach the Highlight behind it, so the transition
   from reading to editing is one action.
7. As a Reader, I want a Highlight I cannot see to be explained rather than silently missing, so I
   can tell "not found" from "not saved".
8. As a Reader, I want a Reveal to land on the passage, not merely on its Reply, so I do not have to
   search again.
9. As a Reader, I want an Agent-authored Highlight to be distinguishable from mine, so I know whose
   judgement I am reading.
10. As a Reader who cannot see the paint, I want the Quote to be the accessible name of everything
    that represents a Highlight, so the Margin is usable through assistive technology.
11. As a Reader with reduced-motion preferences, I want painting and Reveal to work without
    animation, so nothing moves that I did not ask to move.

## Acceptance Criteria

Each scenario has exactly one action. Fixtures are inline.

1. **A Span is painted exactly over its characters.**
   Given a settled Reply containing "the migration must land" and a Span whose Quote is "migration
   must land" in Colour slot 4 Blue, when the Reply is on screen in the Visible Session, then the
   wash is drawn behind exactly those characters in Blue and behind no other character.

2. **A wrapped Span is painted on every line.**
   Given a Span whose Quote wraps across two lines of a Reply, when it is painted, then the wash
   covers the passage on both lines with the same Colour and no wash appears between them.

3. **A Mark is a band, not a character wash.**
   Given a settled Reply of four paragraphs and a Mark on it in Colour slot 2 Green, when the Reply
   is on screen, then one band behind the Reply carries Green, and no character in the Reply changes
   its styling or gains a per-character wash.

4. **A Span inside a Mark reads as a Span.**
   Given a Mark on a Reply and a Span in Colour slot 5 Red on a sentence inside that Reply, when
   both are painted, then the Red wash is visible within the Green band and the two colours do not
   compound into an unreadable patch.

5. **Painting survives selection and links.**
   Given a painted Span containing a link and a Selection made across the Span, when the Reader
   clicks the link, then the link opens normally and the Selection is unaffected.

6. **The paint is not content.**
   Given a painted Reply, when more of the Reply streams in or the Turn is folded and expanded, then
   the Transcript's own words are unchanged and the paint is corrected on the next pass without a
   reload.

7. **Paint follows the theme.**
   Given the same Span in Colour slot 3 Violet, when the GUI changes from the light theme to the
   dark theme, then the wash and the passage's text colour both re-resolve to the dark theme's
   values for the same slot with no reload.

8. **No text colour capability, still visible.**
   Given a browser that cannot apply a Highlight's text colour and a Span in Colour slot 1 Amber,
   when the Span is painted, then its rounded wash still appears in Amber, the passage keeps the
   theme's normal text colour, and the Session tab and Global page both state that this browser
   cannot paint Highlights and that lists and Copy still work.

9. **An unresolved passage is not painted but is not lost.**
   Given a Span whose Anchor no longer resolves in its own Session, when the Transcript is shown,
   then nothing is painted for it, its row carries the Unanchored badge, and its Quote, Tags, Note
   and State remain readable and editable in the lists.

10. **Reveal lands on the passage, instantly.**
    Given a Highlight on the third sentence of a long Reply, when the Reader reveals it from the
    Global page, then the owning Session opens, history is paged as needed, the sentence itself is
    in view, and the view is still rather than animating or flashing.

11. **Reveal that cannot land is stated, not an error.**
    Given a Highlight whose Turn is folded and will not open, when the Reader reveals it from the
    Session tab, then the owning Session opens, the view does not land on the passage, the tab
    states that the text could not be found, and the Highlight is unchanged.

12. **A regenerated Reply is an honest outcome.**
    Given a Reply that has been regenerated so a Highlight's Quote no longer appears, when the
    Session is opened, then the Highlight is not painted, is listed as Unanchored, and is painted
    again by itself if the passage later becomes findable.

13. **Hidden Sessions do no work.**
    Given a Margin with Highlights in three Sessions and only one Session on screen, when the Reader
    reads the visible Session, then only that Session's Highlights are painted and no surface or
    Notice refers to the other two until their Session is opened.

14. **An Agent-authored Highlight is distinguishable.**
    Given a Highlight whose Author is the Agent and a Highlight whose Author is the Reader, both in
    Colour slot 2 Green, when both are painted, then both use the Green slot and only the
    Agent-authored one carries the provenance cue.

15. **Reduced motion removes nothing but motion.**
    Given a Reader whose system asks for reduced motion, when a Reveal lands on a painted Span,
    then the landing is motion-free, the paint is unchanged and the result is identical.

## Implementation Decisions

1. **One paint pass per Transcript change.** Resolution and painting are one pass, coalesced after
   the change that caused it, rather than three independent mechanisms with their own triggers.
2. **Resolve once, then draw.** The pass derives every painted passage from the stored Highlights
   and the current Transcript in one step, then hands one list of what to draw to the drawing
   mechanisms; nothing measures the Transcript after it has started changing it.
3. **Two drawing mechanisms, one meaning.** The text-colour capability draws text colour; the
   plugin's own visual layer draws rounded washes and bands. Both read the same list of what is
   painted, so the two can never disagree about what is painted.
4. **Painted shape is derived, never stored.** A Highlight's painted shape is a function of its
   stored data and the current Transcript; no painted geometry, text position or colour resolution
   is kept as Margin data.
5. **The paint layer is inert.** It accepts no pointer input and owns no focusable element; the one
   interaction over paint is the click that opens the Item card, handled outside the layer.
6. **Painted geometry is scoped to the Visible Session.** The pass never walks another Session's
   content, and a Session becoming visible is itself the trigger for its first pass.
7. **Mark bands and Span washes are drawn by the same layer, in a fixed order:** bands under washes,
   so a Span always reads above a Mark.
8. **Hit-testing is deterministic.** A click on overlapping painted characters resolves to one
   Highlight by a stable rule (the first painted passage containing the point), never by visual
   stacking.
9. **Reveal is a bounded composition of public behaviour.** Open the Session, page history if
   needed, wait a bounded time for the content, land once, report the outcome. Every wait is bounded
   so a Reveal always returns.
10. **No flash, no animation.** Reveal feedback is the landing itself. A future confirmation effect
    must not run per frame and must not be required to understand the outcome.
11. **Degradation is a stated capability, not a silent no-op.** A surface that depends on painting
    says so in place, from the same capability fact the paint layer reads.

### Deferred Decisions

| Decision not made | The seam that keeps it open |
|---|---|
| Indicator for Note or Tags | Item card is the edit surface; paint can add a cue |
| A quieter Reveal confirmation | One outcome path; no effect may run per frame |
| A Mark's band across text blocks | The band is the Reply's resolved text; a union is paint |
| A slot-derived text colour | The palette fixes five slots; paint change only |
| Paint if a Reply ever offers a decoration seat | One mechanism behind one pass, replaceable |

## Testing Strategy

- **Painting invariants, not pixels.** Test that a Span's painted characters are exactly its Quote,
  that a Mark changes no character styling, that bands sit under washes, and that the Transcript's
  content is unchanged before and after a paint pass.
- **Mutation survival.** Drive a streaming Reply, a fold/unfold, a layout resize and a navigation,
  and assert that the invariant above holds after each pass and that no pass measures the Transcript
  after it has drawn any of its result.
- **Overlap and wrap.** Fixture Spans that wrap, that abut, that overlap each other, and that sit
  inside a Mark; assert each Colour survives and that hit-testing is deterministic.
- **Capability matrix.** Run the pass with and without the text-colour capability; assert that
  washes and bands exist in both, that text colour differs, and that the surfaces state the
  degradation in exactly the degraded case.
- **Reveal outcomes.** Fixtures for a passage in loaded history, in paged-out history, in a folded
  Turn, in an archived Session and in a Session that does not exist; assert landing, bounded waits,
  one stated outcome and no error path.
- **Theme and reduced motion.** Render in both themes and under a reduced-motion preference; assert
  the same geometry and no state that depends on a transition.
- **Hidden Session.** Assert that a Session that is not visible produces no paint pass and no
  Notice, and that its Highlights paint on the first pass after it becomes visible.
- **Accessibility.** Assert that the paint layer exposes no focusable element and no announcement,
  and that every list row and generated affordance carries its Quote as the accessible name.

## Out of Scope

- Which selections are Highlightable, how an Anchor is captured or resolved, and what a Resolution
  state is; all of that belongs to Anchoring.
- The concrete visual design: exact padding, radius, opacity, shadows and the theme's own values.
- The Session tab, the Global page, the search, filters and Resurfacing rules; those are specified
  separately in this context.
- Delivery's queue behaviour after an Insertion is accepted.
- The Trajectory view, which offers neither a highlightable source nor a paint seat.
- Localisation of copy, beyond the requirement that a surface names things in the Reader's terms.

## Open Questions

None outstanding. The four questions this specification raised are resolved:

1. **Text colour and the slots.** The five Colour slots drive the fill and the band; the text itself
   keeps the theme's primary label colour, because a per-slot text colour would fight the contrast
   guarantees and the light/dark flip. The Colour is the Reader's label for the passage, not a
   recolouring of the Agent's words.
2. **The provenance cue.** It stays in the intent documents: the dotted underline for an
   Agent-authored Highlight is visible to the Reader and is part of the promise that the Reader can
   always tell whose judgement a passage carries. It is presentation, never a property of the record.
3. **A Mark's band over mixed content.** A Mark bands the Reply's rendered text; where a Reply mixes
   text with non-text blocks, the band covers the text region and never paints over code, tables or
   other non-text content. The band claims only what it covers.
4. **A browser without text colour.** The in-place capability statement is enough. No Notice is
   raised for a capability the Reader cannot fix; the rounded fills and bands still render, and the
   lists and copying still work.
