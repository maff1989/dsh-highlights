# Presentation & Resurfacing

**Classification:** Supporting · **Owns:** the in-transcript visual language, every Reader-facing
surface, browsing and discovery, and the derivations behind Resurfacing, the Turn digest and the
Kept badge · **Map:** [CONTEXT_MAP](../../CONTEXT_MAP.md)

This context is the Margin made visible. It paints a Highlight over the characters of a settled
Reply, gives the Reader a way back to it, and organises what has been marked so it can be read,
searched and reconsidered. It owns the vocabulary of surfaces and the derivations that let a surface
say something true about stored data. It is read-only over the Margin: it asks the Margin to change
through the Margin's actions and never invents Highlight state.

## Owns

- The in-transcript visual language: a Span's wash, a Mark's band, the five Colour slots in both
  themes, and the quiet provenance cue of an Agent-authored Highlight.
- The Reader-facing surfaces: Highlight selection bar, Annotation popover, Item card, Assistant
  action row, Proposal row, Session tab, Global page, Turn digest, Kept badge, Composer dock, Undo,
  Notice, First run, Worth another look and the Session-row context menu.
- Browsing and discovery: transcript-position ordering, workspace → Session grouping, search,
  filters, empty states and bounded paging.
- The derivations that let a surface speak: Resurfacing candidates and their reasons, Turn digest
  counts, the Kept badge count, and the excerpt previews attached to them.
- The truthful statement of Consent and of degraded capability on a surface — what the Agent can
  see, and what this browser cannot paint.
- The accessible naming of everything this context presents: the Quote is the name of the Highlight
  a row or affordance represents.
- The presentation of three Session-scoped actions where the Reader organises Sessions: copy a
  Session's Highlights as Markdown, open the Session tab, brief the Agent. The actions themselves
  belong to Delivery; the placement and wording are this context's.

## Does not own

- What a Highlight is, what may be recorded about it, and what may change about it: identity, Quote,
  Colour, Tags, Note, Star, Author, Intent, State, Visibility, Tombstone, Snapshot.
- Anchor, Quote context, Capture eligibility, the resolution ladder or any Resolution state. This
  context asks what a Resolution state is; it never works one out from what it can see.
- Insertion, Pending insertion, Briefing, Attribution or Copy as behaviour. This context invokes
  them and reports their outcome.
- Consent, Access level, Access scope, Visibility enforcement, or the Proposal lifecycle. This
  context states Consent truthfully and presents a Proposal without deciding it.
- Durability, transport, freshness mechanism, retention or deployment configuration.
- The Transcript, Chat's own selection surface, the composer, or the layout that hosts a surface.
  All of those are upstream and are treated as they are.

## Terms this context owns

The glossary is authoritative for every term. This table records the surfaces and derivations this
context is responsible for keeping faithful.

| Term | Glossary | What this context owns |
|---|---|---|
| **Highlight selection bar** | [§8][g8] | Gesture, layout, Capture, browser escape |
| **Annotation popover** | [§8][g8] | Its fields, save and cancel |
| **Item card** | [§8][g8] | Reachability, editing, overflow actions |
| **Assistant action row** | [§8][g8] | Where a Mark is made; second invocation |
| **Session tab** | [§8][g8] | Transcript order, search, filters, row actions, empty states |
| **Global page** | [§8][g8] | Grouping, ordering, filters, row actions, First run |
| **Turn digest** | [§5][g5] | Which counts it may state; what it opens |
| **Kept badge** | [§5][g5] | The count it states and its preview |
| **Composer dock** | [§8][g8] | Making a Pending insertion visible |
| **Undo** | [§8][g8] | Recovery on the surface that reported a delete |
| **Proposal row** | [§8][g8] | Presenting an Agent Proposal verbatim; to keep or dismiss is Agent Access's |
| **Session-row context menu** | [§8][g8] | The three Session-scoped actions and their placement |
| **Notice** | [§8][g8] | The one transient outcome channel |
| **First run** | [§8][g8] | Teaching the gesture, the chord, visibility |
| **Worth another look** | [§5][g5] | Presenting candidates, one reason each |
| **Resurfacing** | [§5][g5] | The presentation; the four reasons are domain rules |

[g8]: ../../UBIQUITOUS_LANGUAGE.md#8-reader-facing-surfaces
[g5]: ../../UBIQUITOUS_LANGUAGE.md#5-judgement-and-resurfacing

Everything else in these documents — Highlight, Span, Mark, Quote, Colour, Tag, Note, Star, Author,
Intent, State, Visibility, Tombstone, Snapshot, Resolution state, Reveal, Capture, Insertion,
Briefing — is borrowed from the glossary and from the context that owns it. A surface displays
those; it does not give them new meaning.

## Invariants

1. **Display changes nothing.** Reading, opening, hovering, searching, filtering, grouping, paging
   or scrolling a surface never writes to the Margin. Only an explicit action does.
2. **The Transcript is never the substrate.** Painting adds no markup to the Transcript and removes
   none; text selection, links, quoting and streaming behave exactly as they would with no Highlight
   present.
3. **Painting is visual only.** Assistive technology is never told that a Highlight exists in the
   Transcript. The Quote is the accessible name of every row and generated affordance that
   represents a Highlight, and State is stated in words, not by paint alone.
4. **Two kinds read differently.** A Span's wash and a Mark's band are distinguishable in kind at a
   glance; a Mark never sets per-character styling, and a Span inside a Mark still reads as a Span.
5. **One Colour, five slots, current theme.** Every painted Highlight takes one of the five named
   palette slots and follows the light/dark theme; no surface invents a colour, a palette or a hue.
6. **No invented facts.** A surface never invents a Highlight, changes a Quote, computes a
   Resolution state, or stores derived data as fact. Lists, groups, counts, previews and Resurfacing
   candidates are recomputed from stored Highlights and the clock.
7. **A Snapshot is never presented as current.** When the live Session title or workspace resolves
   it wins; when it does not, the stored value is shown as what it is.
8. **Resurfacing is provable or silent.** Every Resurfacing row carries exactly one reason from the
   four, there is no fifth reason, and the block does not exist when no reason holds.
9. **Counts are exact or absent.** A Turn digest or Kept badge states only counts of Highlights in
   the State it names, or states nothing at all.
10. **Every deletion is recoverable where it was reported.** A confirmed delete offers Undo on the
    surface that reported it, and Undo restores the same Highlight with its identity and fields. A
    Reader may suppress the prompt; suppression changes the offer, never the recovery path or the
    retention window.
11. **One Notice at a time.** Outcome messages share one transient channel: the newest replaces the
    current one, and silence is used when the Reader can already see the outcome.
12. **No ranking, no scoring, no recommendation, no remembered visits.** The only orderings are
    transcript position, recency of change, Resurfacing reason precedence and identity.
13. **Chat's surface is never contested.** A plain Selection belongs to Chat; this context's own
    gesture exists only on the chord and the right-click it owns, and the native menu stays
    reachable everywhere else.
14. **Nothing blocks reading.** Painting, repainting and Notices never interrupt typing, selection,
    links or quoting; a Reveal is best effort and is never an error path.

## Published contracts

| Contract | Consumers | Stated in domain terms |
|---|---|---|
| **Notice** | Any context that reports an outcome | One transient message at a time |
| **Surface inventory** | Every document naming a surface | The names and their single jobs |
| **Undo** | Margin (the Tombstone) | Recovery on the reporting surface |
| **Ordered Session Highlights** | Delivery (a Briefing's row order) | The Session's live Highlights in transcript order, as the Session tab derives it; Delivery preserves the order and never re-derives it |

The Notice contract and the surface inventory are stated in full by [Surfaces](specs/surfaces.md);
the Undo contract is stated there and in the glossary's surface list; the ordered-Session-Highlights
contract is the Session tab's derivation, published so a Briefing can preserve it without Delivery
depending on Anchoring or re-deriving transcript position. A producer reports an outcome
and this context presents it; there is no second channel. A surface is named exactly as the glossary
names it, and a surface never takes another surface's job.

## Consumed contracts

| Contract | Owner | What this context takes |
|---|---|---|
| **Highlight** | [Margin][m] | Stored fields every surface shows, groups and searches |
| **Judgement attributes** | [Margin][m] | Author, Intent, State, Visibility: show and request |
| **Resolution state** | [Anchoring][a] | Whether to paint; which badge applies |
| **Proposal** | [Agent Access][aa] | A suggestion to present verbatim; not its lifecycle |
| **Consent** | [Agent Access][aa] | Facts needed to state Agent visibility truthfully |
| **Delivery outcome** | [Delivery][d] | Inserted, queued or failed, to report |
| **Freshness** | [Persistence & Distribution][p] | How a surface learns of writes it did not make |

[m]: ../margin/CONTEXT.md
[a]: ../anchoring/CONTEXT.md
[aa]: ../agent-access/CONTEXT.md
[d]: ../delivery/CONTEXT.md
[p]: ../persistence/CONTEXT.md

What this context may do with a consumed contract: read it, display it, and ask its owner to change
it through the owner's action. What it may never do: derive its own version of it.

## Primary flows

**Capture from a Selection.** The Reader selects text inside a settled Reply and right-clicks the
Selection; the Highlight selection bar appears against the Selection with five Colour dots, Annotate
and the escape to the browser. Choosing a dot captures the Selection immediately in that Colour and
the passage is painted. Choosing Annotate opens the Annotation popover for a Colour, an Intent, Tags
and a Note, and Save captures the Selection with them.

**Mark a Reply.** From the Assistant action row the Reader saves a whole Reply as a Mark. The Reply
gains a band behind it, distinguishable from a Span's wash. Invoking the action again takes the
Reader to the Mark that already exists rather than creating a second one.

**Return.** From any list, a Resurfacing row, a Turn digest or a Session-row context menu the Reader
asks to see a Highlight's passage. A Reveal opens the owning Session, pages history as needed,
brings the passage itself into view and lands instantly. When the passage cannot be brought into
view, the surface says so and nothing is lost.

**Browse.** The Session tab shows one Session's Highlights in transcript-position order; the Global
page shows every Session's Highlights grouped by workspace and ordered by the most recently touched
Highlight. Both narrow by search and by filters, and both page their rows rather than showing
everything at once.

**Reconsider.** On the Global page and above a Session tab's rows, Worth another look presents the
Highlights the stored data can justify showing again, each with one reason. The Reader follows a row to its passage, or changes a
State so the row stops being a candidate.

**Hand forward.** From a row or the Item card the Reader copies a Quote or asks Delivery to insert
it; from a Session's context menu the Reader copies the Session's Highlights as Markdown or briefs
the Agent. This context invokes those actions and reports their outcome through the Notice channel.

## Degradation and failure modes

- **Painting capability degraded.** Where the browser cannot apply a Highlight's text colour, the
  rounded fills and the Mark bands still paint. The Session tab and the Global page say so in place,
  and the Reader is never shown a Highlight that silently failed to save.
- **A passage cannot be found.** The Highlight is not painted and carries the Unanchored badge in
  the lists; its Quote, Tags, Note and State remain readable, editable, copyable and insertable.
- **An owning Session is archived or gone.** The rows stay listed and stay readable; Reveal is
  unavailable and says why rather than failing silently; nothing is deleted.
- **The read is stale or the connection is unreachable.** The surface says it is showing the last
  successful read and pauses changes; it does not present old data as current.
- **A write loses its race.** The editing surface keeps the draft and asks the Reader to reload or
  overwrite; no surface overwrites a newer version silently.
- **The Margin refuses a new Highlight.** The Reader is told through a Notice that nothing was
  stored; the passage is left unhighlighted rather than shown as saved.
- **A copy is refused.** No surface reports success unless the text actually reached the clipboard.
- **A Reveal cannot land.** The Session may be open with nothing scrolled; the surface states that
  the text could not be found, with no retry loop and no error path.
- **The Margin is empty.** The Global page is First run; every other surface is silent until there
  is something true to say.
- **The window is narrow, or motion is unwelcome.** Surfaces follow the harness's own narrow layout,
  floating surfaces clamp to the Transcript, and no transition is required to understand a state.

## Boundary rules

**What this context may know.** The surfaces the Reader interacts with and their placement; the
Transcript as a rendering surface it observes; projections of Margin data; the Resolution state it
is handed; the Consent facts it must state; Delivery outcomes; how fresh its last read is.

**What this context must not know.** How an Anchor is built or resolved, how a Resolution state is
decided, how a Highlight is stored or transported, what a Consent gate enforces internally, how a
Proposal is produced, or what a tool is called. No surface document may name a mechanism of those
contexts, and no surface may reconstruct one.

**The line inside its own surfaces.** A surface may present a Highlight and ask the Margin to change
it. It may not decide what a State means, what a Quote is, what an Intent implies, what a Colour
signifies, or what is private. When a surface seems to need such a rule, the rule belongs to the
owning context and the surface asks for it.

## Deferred decisions

| Decision not made | The seam that keeps it open |
|---|---|
| Indicator for Note or Tags | Item card is the edit surface; paint can add a cue |
| A quieter Reveal confirmation | Reveal has one outcome path; no effect may run per frame |
| Whether the Turn digest may show content | Counts only; the glossary changes first |
| Where a Re-anchor is offered | Anchoring owns the operation; the surface is ours |
| Read error: in place or a Notice | The Notice channel is single; in place is the fallback |
| Reader-defined colours beyond five slots | The Colour contract is the Margin's |

## Documentation index

Specifications:

- [In-transcript presentation](specs/in-transcript-presentation.md) — how a Span and a Mark are
  painted, what painting may not touch, and how the paint degrades.
- [Surfaces](specs/surfaces.md) — every surface's single job, its behaviour, its states and what it
  must not do.
- [Discovery and resurfacing](specs/discovery-and-resurfacing.md) — ordering, grouping, search,
  filters, State changes, the four Resurfacing reasons and the silence rule.

Decisions:

- [ADR-001](adrs/001-margin-is-painted-over-the-transcript.md) — the Margin is painted over the
  Transcript.
- [ADR-002](adrs/002-resurfacing-requires-a-provable-reason.md) — Resurfacing requires a provable
  reason.
- [ADR-003](adrs/003-mark-is-a-band-span-is-a-wash.md) — a Mark is a band, a Span is a wash.

## Where the implementation record lives

How this context is built — its concrete failure modes and its deviations — lives in
[`known-limitations.md`](../../known-limitations.md) and
[`implementation-notes.md`](../../implementation-notes.md); this document is the intent those are
measured against.
