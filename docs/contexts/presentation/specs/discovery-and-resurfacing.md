# Discovery and resurfacing

**Status:** Accepted
**Context:** Presentation & Resurfacing
**Date:** 2026-11-15

## Definitions

- **Transcript position** — a Highlight's place inside its Session's conversation, expressed as
  Turn, then Step, then the position of the passage within the Reply, then the character offset
  within that passage's flow. Creation time and identity break ties.
- **Grouping** — the two-level arrangement of the Global page: every Session belongs to a workspace,
  and every Highlight belongs to a Session.
- **Facet** — a filter option derived from the whole Margin (a workspace with its count, a tag with
  its count), so that choosing a filter never removes the option the Reader is using.
- **Search** — a case-insensitive substring test over a Highlight's Quote, Note and Tags.
- **Filter axis** — one dimension of narrowing: Colour, Tag, Starred, Author, Unanchored or
  workspace. A Highlight must satisfy every active axis; within an axis, every chosen value must
  hold.
- **Bounded page** — the first N rows a list shows before it offers the next page. A changed search
  or filter starts a new bounded page.
- **Resurfacing** — the deliberate reappearance of Highlights that the stored data can justify
  showing again.
- **Resurfacing reason** — the one provable fact that puts a Highlight in Worth another look.
- **Reason precedence** — the fixed order in which the four reasons are tested, so a Highlight that
  could satisfy several carries exactly one.
- **Silence** — the correct output of Worth another look, the Turn digest and the Kept badge when no
  reason or no count holds.
- **Recently touched** — a Highlight's last change, which is what orders Sessions and workspaces on
  the Global page.

## Constraints

1. **Four reasons and no fifth.** The reasons are **Starred and new**, **Kept and not compiled**,
   **Text changed** and **Stale and new**. A fifth reason is a domain change, not a display change.
2. **Prove or stay silent.** A reason may claim only what stored data proves. A row without a reason
   does not exist; a count that cannot be supported is not shown.
3. **No ranking, no scoring, no recommendation, no remembered visits.** Visits are not tracked, so
   "recently viewed", "most read" and "you keep coming back" are not available and must not be
   imitated.
4. **One reason per row.** The four predicates are tested in a fixed precedence and the first match
   wins.
5. **Determinism.** The same stored data and the same clock produce the same order; a clock tick
   cannot reshuffle the block.
6. **State only moves by explicit Reader action.** Nothing in discovery derives a State from
   activity, from a view, or from another field.
7. **Counts are counts of Highlights.** A count of a State is a count of Highlights in that State,
   never of rows, guesses or estimates.
8. **Live names, snapshot fallback.** A Session title or workspace name shown in a list is the live
   value when it resolves; a Snapshot is used only when it does not, and is never presented as
   current.
9. **Ordering is stated once.** Each list has one ordering rule; a surface does not acquire a second
   sort order of its own.
10. **Discovery writes nothing.** Searching, filtering, grouping, folding, paging, scrolling and
    resurfacing never write to the Margin.

## Problem

A Margin that only grows becomes a second conversation to search. The Reader needs three things that
do not require the Agent, a score or a recommendation: a stable way to find a highlight again, a way
to narrow a large Margin to what they are looking for, and a way to be shown what they have
neglected. The fourth — a way to be told what matters — is deliberately absent, because a
recommendation would need engagement data the product refuses to collect and would still be unable
to justify itself to the Reader. What replaces it is a small, provable, explainable set of reasons
and a silence rule.

## Solution

### Ordering

**Within a Session**, rows follow the conversation, not the moment of capture: an earlier Turn comes
before a later Turn, an earlier Step before a later Step, an earlier passage before a later one, and
a tie falls back to capture time and then to identity. A Highlight whose position cannot be
expressed sorts after every position that can, so an Unanchored or old row never interleaves itself
into the middle of a transcript order it cannot justify. The Session tab and the rows under a
Session on the Global page both use this order.

**The Global page** groups first by workspace and then by Session. A workspace is named by its name,
never by its full path; a Highlight whose workspace cannot be resolved appears under an explicitly
unknown workspace. A Session is named by the live Session title, then by the Snapshot, then by an
untitled label.

**Groups are ordered by recency of change:** the Session whose most recently touched Highlight is
newer comes first, and the workspace containing the newest such Session comes before the others.
Ties break by name and then by identity. Editing a Highlight, changing its State, starring it or
deleting it changes where its Session sits, so the Global page follows the Reader's attention
without ever ranking its content.

**The Global page remembers its place.** Search text, filters, collapsed groups and reading
position survive leaving the Global page to open a Session and returning to it.

### Search

Search is a case-insensitive substring test over a Highlight's Quote, its Note and its Tags.
Surrounding whitespace is ignored, and an empty search narrows nothing. Nothing else is searched:
not Colour, not Author, not State, not a Session title, not a date. Search and filters combine, and
a row must satisfy all of them.

### Filters

| Axis and values | Where | Semantics |
|---|---|---|
| **Colour**: Amber, Green, Violet, Blue, Red | Both lists | The slot; several must all hold |
| **Tag**: one normalised Tag | Both lists | Exact; several must all be carried |
| **Starred**: on or off | Both lists | Only starred Highlights |
| **Author**: the Reader, the Agent, or all | Both lists | The chosen Author; all is default |
| **Unanchored**: shown or hidden | Global page | Visible by default; the control hides them |
| **Workspace**: one workspace | Global page | The chosen workspace grouping |

- Filter options are derived from the whole Margin, so choosing one option never removes another,
  and the Reader can always see how many Highlights a workspace or Tag would admit.
- All active axes combine with AND, and each axis combines with the search.
- One Clear control restores the unfiltered list; a filtered-empty state names the situation and
  leaves Clear where it is.
- While any search or filter narrows the list, the Global page states how many of the whole Margin
  are shown, and Worth another look is hidden so the block cannot disagree with the rows below it.

### State changes

Each row carries the Highlight's State as a control, not merely a label. One action advances it by
one step: `new` to `kept`, `kept` to `compiled`, and `compiled` wraps to `new`; the backwards step
stops at `new` rather than wrapping, so "back" at the start of the ladder means there is nothing
before it. The control is operable by pointer, by Enter or Space, and by the left and right arrow
keys while it has focus.

Writes show their intended result immediately and are single-flight per row: the control shows the
intended State immediately, a second action while one write is pending is ignored, and a write that
does not land rolls the control back to the stored State and says so. State counts read from
stored State, never from activity.

### Resurfacing

Worth another look presents the Highlights the stored data can justify showing again. Each row
carries exactly one reason, from exactly four:

| Reason | The stored fact that proves it |
|---|---|
| **Starred and new** | Starred, and its State is still `new` |
| **Kept and not compiled** | Its State is `kept`; decided and not carried forward |
| **Text changed** | The Anchor no longer resolves in its own live Session |
| **Stale and new** | Unchanged for more than 30 days and still `new` |

**Precedence is fixed**, tested in the order above; a Highlight that satisfies several carries the
first one. **Order is fixed too:** reason precedence, then the most recently touched Highlight, then
identity. Nothing about the block depends on drawing order, on the order the data happened to
arrive, or on the clock beyond the age predicate.

The block shows the first few rows and expands the rest on request; expansion and collapse are not
animated. A row reveals its Highlight. A Highlight stops being a candidate as soon as the data
changes: changing its State, unstarring it or resolving its passage removes it from the block, and a
new candidate appears in its ordered place. When no reason holds, the block does not exist — silence
is the correct output, not an empty container and not a "nothing to show" message.

The block reports no recommendation, no score, no confidence and no ordering rationale beyond the
reason it prints. There is no fifth reason and no configurable one.

### The Turn digest and the Kept badge

- The Turn digest reports counts for its own Turn: how many Highlights that Turn holds,
  and how many of them are `kept`. It reports counts only, never content and never a judgement, and
  it is silent for a Turn with nothing marked or a Turn that has not completed.
- The Kept badge reports the count of `kept` Highlights in its Session, with a hover preview of that
  Session's leading Highlights, kept ones first. It may claim nothing except the count of `kept`
  State, and it is silent at zero.
- Neither may report a count it cannot support from stored data, and neither may present a previewed
  Highlight as `kept` unless it is.

### Empty states and paging

- A Margin with no Highlights is First run on the Global page and an empty state on the Session tab.
- A narrowed list with no matches is a filtered-empty state, distinct from an empty Margin.
- Each list shows a bounded first page and offers the next one on request; a new search or filter
  starts a new bounded page so the Reader is never silently dropped into the middle of a long list.
- Both group levels on the Global page collapse and expand, and the collapsed state is remembered.

## User Stories

1. As a Reader, I want a Session's Highlights in the order the conversation happened, so the list
   reads like the Session I just had.
2. As a Reader, I want Sessions and workspaces ordered by what I touched most recently, so
   recent thinking stays near the top without anyone ranking it for me.
3. As a Reader, I want to search the words of a Quote, a Note and a Tag, so I can find a passage by
   something I remember writing or labelling.
4. As a Reader, I want to narrow by Colour, Tag, Star or Author, so a large Margin becomes the set I
   am working with.
5. As a Reader, I want unanchored Highlights visible by default and hideable, so a broken link is
   disclosed without being allowed to crowd the list.
6. As a Reader, I want to move a Highlight along `new`, `kept`, `compiled` in one action, so triage
   costs no more than a click.
7. As a Reader, I want to undo a State change that did not reach the Margin, so the control never
   insists on something that did not happen.
8. As a Reader, I want to be shown what I starred and left, or decided and never carried forward, so
   the Margin helps me finish what I started.
9. As a Reader, I want the product to stay silent when nothing deserves a second look, so the block
   means something when it appears.
10. As a Reader, I want to trust that a resurfaced row's reason is literally true, so I never have
    to ask why it is there.
11. As a Reader, I want the same data to produce the same order every time, so the list does not
    reshuffle under my pointer.
12. As a Reader, I want a long Margin to load in pages rather than all at once, so opening the
    Global page is never a wait.

## Acceptance Criteria

Each scenario has exactly one action. Fixtures are inline.

1. **Transcript order beats capture order.**
   Given a Session with a Span captured later on Turn 1 and a Span captured earlier on Turn 3, when
   the Reader opens the Session tab, then the Turn 1 row is above the Turn 3 row.

2. **An unknown position sorts last.**
   Given a Session with one anchored Span and one Highlight whose Anchor no longer resolves, when
   the Reader opens the Session tab, then the Unanchored Highlight is listed after the anchored one.

3. **Global grouping is workspace → Session.**
   Given three Sessions in workspace "highlight-plugin" and one in workspace "docs", when the Reader
   opens the Global page, then each Session's rows sit under their own Session heading inside the
   correct workspace heading.

4. **A workspace is named, not pathed.**
   Given a Highlight stored while its workspace path was `/home/reader/work/docs`, when the Global
   page names the group heading, then the heading reads "docs" and never the full path.

5. **Recent change orders the groups.**
   Given workspace A whose most recently touched Highlight was touched two days ago and workspace B
   whose most recent was touched an hour ago, when the Reader opens the Global page, then workspace
   B is listed before workspace A.

6. **A live title beats a Snapshot.**
   Given a Highlight whose Snapshot session title is "old name" while the live Session title is
   name", when the Global page names the Session heading, then the heading reads "new name".

7. **A Snapshot stands in when the Session is gone.**
   Given a Highlight whose owning Session no longer exists and whose Snapshot title is "deleted
   session", when the Global page shows it, then the row is listed under "deleted session" in its
   Snapshot workspace and carries the unavailable badge.

8. **Search covers Quote, Note and Tag.**
   Given a Highlight quoted "the migration must land" with Note "ship behind a flag" and Tag
   `release`, when the Reader searches "flag", then the row matches because its Note carries the
   word.

9. **Search ignores Colour and Author.**
   Given a Green Highlight and an Agent-authored Highlight that carry neither the word "green" nor
   the word "agent" in their Quote, Note or Tags, when the Reader searches "green", then no row
   matches.

10. **Filters combine with AND.**
    Given a starred Green Highlight tagged `release` and a starred Red Highlight tagged `release`,
    when the Reader filters by Colour Green and Starred, then only the Green Highlight is shown.

11. **Several Tags all have to hold.**
    Given a Highlight tagged `release` and `migration` and another tagged only `release`, when the
    Reader selects both Tags on the Session tab, then only the Highlight carrying both is shown.

12. **Unanchored rows are visible by default.**
    Given a Margin with one anchored and one Unanchored Highlight, when the Reader opens the Global
    page, then both are listed and the Unanchored filter control is offered.

13. **Unanchored rows can be hidden.**
    Given the Unanchored filter is on and a Margin with one anchored and one Unanchored Highlight,
    when the Reader turns the filter off, then only the anchored Highlight remains.

14. **The Unanchored filter is absent with nothing to hide.**
    Given a Margin in which every Highlight is anchored, when the Reader opens the Global page, then
    no Unanchored filter control is offered.

15. **A filtered-empty list is not an empty Margin.**
    Given a Margin with twelve Highlights, when the Reader filters to a Colour that none carries,
    then the Global page states that no Highlights match the filters, the summary reads that none of
    the twelve are shown, and the Clear control is offered.

16. **State advances and rolls back on failure.**
    Given a Highlight whose State is `new` and a Margin that refuses the write, when the Reader
    advances its State, then the control shows `kept` immediately, then returns to `new` and the
    surface states that the change did not land.

17. **State moves backwards.**
    Given a Highlight whose State is `kept`, when the Reader steps back, then the State becomes
    `new`.

18. **Backwards stops at `new`.**
    Given a Highlight whose State is `new`, when the Reader steps back, then the State stays `new`
    and does not wrap to `compiled`.

19. **Each candidate carries exactly one reason.**
    Given a starred, `kept`, Unanchored, 40-day-old Highlight, when the Reader opens the Global
    page, then its Worth another look row states "Kept, not compiled" and no other reason.

20. **Precedence is fixed.**
    Given two candidates, one satisfying "Text changed" and one satisfying "Starred and new", when
    the block is drawn, then the "Starred and new" row is above the "Text changed" row.

21. **Order is deterministic within one reason.**
    Given two "Starred and new" candidates touched at different times, when the block is drawn, then
    the more recently touched row is first; a later sight of the same data keeps that order.

22. **Silence when no reason holds.**
    Given three Highlights that are `compiled`, unstarred and anchored, when the Reader opens the
    Global page, then no Worth another look block appears.

23. **A candidate leaves when its fact changes.**
    Given a "Starred and new" candidate, when the Reader unstars it, then the row leaves the block
    and the list below is unchanged.

24. **The block hides under a filter.**
    Given a Worth another look block with two rows, when the Reader types a search that matches one
    Highlight, then the block is not shown and the narrowed list is.

25. **A Turn digest counts only its own Turn.**
    Given Turn 1 with two Highlights and Turn 3 with one, when the Reader reads the Turn 3 digest,
    then it reads one Highlight and does not include Turn 1's two.

26. **The Kept badge counts only `kept`.**
    Given a Session with two `kept` Highlights and one `new`, when its Session row is shown, then
    the Kept badge reads two.

27. **A list pages.**
    Given a Session tab showing a first bounded page and offering the rest, when the Reader asks for
    the rest, then the next page appears and the first page's rows are still in order.

28. **View state survives navigation.**
    Given a search, a Colour filter and two collapsed groups on the Global page, when the Reader
    opens a Session and returns, then the search, the filter and the folds are as they were.

## Implementation Decisions

1. **Discovery is pure derivation.** Ordering, grouping, search, filters, facets, Resurfacing
   candidates and counts are all computed from the stored Highlights, the live names and one
   clock. Nothing is held as Margin data and nothing is written by a derivation.
2. **One ordering rule per list.** Transcript position is defined once and used by the Session tab
   and by rows inside a Global page Session group; group recency is defined once for both group
   levels.
3. **Total orders only.** Every comparator has a final identity tie-break, so two readings of the
   same data cannot disagree about order.
4. **The reason predicates are one ordered list.** The four predicates are evaluated in a single
   fixed sequence and the first match is the row's reason; adding or reordering a reason is a domain
   change, made in the glossary first.
5. **One sort for the block.** Reason precedence, then recency of change, then identity; the block
   never sorts by anything else and never re-sorts on a clock tick.
6. **Resurfacing reads the whole Margin.** The block is derived from every live Highlight, never
   from the narrowed list, which is why it is hidden while the list is narrowed.
7. **Facets come from the unfiltered set.** A workspace or Tag option is derived from the whole
   Margin, so a chosen filter never removes its own option.
8. **Filters are an AND of axes, and AND within an axis.** One combination function, used by both
   lists, so the two can never disagree about what a filter means.
9. **Unanchored is a Resolution state, not a guess.** The Unanchored filter and the Unanchored
   badge read the Resolution state the lists are handed, never the Transcript.
10. **Optimistic State with single flight and rollback.** The control owns its in-flight value,
    ignores a second action while one write is pending, adopts the stored value when it lands, and
    rolls back with a statement when it does not.
11. **The Global page owns its view state.** Search, filters, folds, the row limit and reading
    position live with the Global page rather than with one appearance, so opening a Session does
    not reset the Reader's context.
12. **One clock.** The age predicate and the relative times read one clock, so a block cannot
    half-update across a tick.

### Deferred Decisions

| Decision not made | The seam that keeps it open |
|---|---|
| Resurfacing under a narrowed list | Independent derivation; presentation hides it |
| Unanchored filter on the Session tab | Filter axes are one table; a list may add one |
| A fifth reason | A glossary change first, then the map |
| Stable workspace identity for grouping | The grouping key is derived from live facts |
| Word-aware search | One predicate; a smarter match needs its truth rule |

## Testing Strategy

- **Derivations as pure functions.** Test ordering, grouping, facets, search, filters, reason
  selection and counts as pure functions of fixtures plus a fixed clock, with no surface involved.
- **Order properties.** Assert total-order properties for every comparator: antisymmetry,
  transitivity and a stable identity tie-break; fixture absent positions, equal timestamps and
  duplicate titles.
- **Reason matrix.** Build the full truth table of the four predicates, including every overlap, and
  assert exactly one reason per row and the fixed precedence; then assert silence for the
  complement.
- **Determinism.** Draw the block twice with the same data and twice with the clock advanced
  inside the same predicate bucket; assert harmless stability where the data did not change.
- **Candidate departure.** Change each predicate's fact (unstar, change State, resolve the passage)
  and assert the row leaves and the order of the rest is unchanged.
- **Filter semantics.** For each axis: single value, several values, combination with another axis,
  combination with search, Clear, and the filtered-empty state; assert AND everywhere.
- **Unanchored disclosure.** Assert visibility by default, the control's presence only when
  something is Unanchored, and that the Kept badge carries no other claim.
- **Digest and badge counting.** Fixtures with mixed States and Turns; assert counts only of the
  named State and only of the named Turn, and absence at zero.
- **Paging and view state.** Assert the bounded page, the next page, page reset on a filter change,
  and restoration of search, filters, folds and scroll after navigation.
- **Empty states.** Empty Margin, empty Session, filtered-empty and empty block as four distinct
  states.

## Out of Scope

- Where a Highlight's Anchor points and whether it resolves; discovery consumes the Resolution state
  it is handed.
- Capture, the visual language of paint, and the surfaces' gesture rules; those are specified in the
  other two specifications of this context.
- The Agent surface's own filters, paging and result shape; those are Agent Access's.
- Insertion, Briefing and Copy semantics; those are Delivery's.
- The storage layout, freshness mechanism and configuration of the read.
- Saving a search, a view or a smart collection; discovery is stateless.

## Open Questions

None outstanding. The six questions this specification raised are resolved:

1. **The Stale-and-new clock.** It runs from the last change: "unchanged for 30 days, still `new`".
   Reading a Highlight is not a change and is not tracked, so a Reader who re-reads an item does not
   reset the reason.
2. **The Unanchored filter.** It is offered on the Global page only; the Session tab always shows its
   Session's Unanchored Highlights without a filter. Widening the shared filter set is a deferred
   decision, not a missing requirement.
3. **The Turn digest.** Counts only (glossary §5). It reports how many Highlights and how many `kept`
   a Turn holds and opens the Session tab; it carries no excerpt preview. The Kept badge's preview is
   the exception the glossary grants explicitly, because a sidebar row has no other way to sample.
4. **"Text changed" and Session availability.** The reason applies only in a live owning Session: an
   archived or missing Session is a Session-availability fact, not a claim that the Reply's text
   changed.
5. **Where Worth another look appears.** On both the Global page and the Session tab; a
   Session-scoped block reports only that Session's candidates, with the same four reasons and the
   same one-reason-per-row rule.
6. **"Most recently touched".** It means last change. Reading history is deliberately not recorded,
   so "where I was last active" is not recoverable and is not claimed.
