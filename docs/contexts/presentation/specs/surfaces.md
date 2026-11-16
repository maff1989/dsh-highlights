# Surfaces

**Status:** Accepted
**Context:** Presentation & Resurfacing
**Date:** 2026-11-15

## Definitions

- **Surface** — a place where the Margin becomes visible or actionable to the Reader.
- **Single job** — the one thing a surface exists to do. A surface that needs another surface's job
  calls it rather than restating it.
- **Target** — a Highlight a surface was opened to show. Opening with a target focuses the Reader's
  attention on it instead of merely opening the list.
- **Empty state** — what a surface shows when there is nothing in its scope at all.
- **Filtered-empty state** — what a surface shows when its scope holds Highlights but the Reader's
  search or filters match none of them.
- **Capability-degraded state** — what a surface states when the browser cannot apply a Highlight's
  text colour, or when the owning Session cannot be reached.
- **Refusal** — an action the product declines to perform (the Margin at its cap, a clipboard that
  will not accept text, a disabled control chosen because its precondition is absent).
- **Conflict** — a write that lost its version race because another surface wrote first. It is an
  outcome to show, not an error to hide.
- **Bounded page** — the first N rows a list shows before the Reader asks for more; a new search or
  filter starts a new bounded page.
- **Escape to the browser** — the deliberate hand-back of the Reader's native menu: the plugin
  closes its bar and the next right-click belongs to the browser.
- **Worth another look block** — the Resurfacing area of the Global page and the Session tab; its
  reasons and ordering are specified in [Discovery and resurfacing](discovery-and-resurfacing.md).

## Constraints

1. **One job per surface.** A surface states its job, does it, and points elsewhere for everything
   else.
2. **Read-only over the Margin.** No surface invents a Highlight, changes a Quote, decides a
   Resolution state or keeps derived data as fact. Every change is requested through the Margin's
   actions and reported as an outcome.
3. **The accessible name of a Highlight is its Quote.** Every row, preview line and generated
   affordance that represents a Highlight carries the Quote as its accessible name, with the State
   stated in words; and a Worth another look row carries its one reason too.
4. **Chat's surface is never contested.** A plain Selection belongs to Chat. The plugin's bar exists
   only for the right-click over a Highlightable Selection (and for a Selection extended from the
   keyboard), never on top of Chat's own selection surface.
5. **The native menu is untouched everywhere else.** No right-click is intercepted outside the
   plugin's own gesture: not in the composer or other editable fields, not on links, file chips,
   buttons or other context-menu triggers, not on user-message text, reasoning or tool content, and
   not on the plugin's own surfaces.
6. **One Notice channel.** Outcome messages are transient, one at a time, newest wins, and shared by
   every surface.
7. **Recovery follows the reporting surface.** A confirmed delete offers Undo on the surface that
   reported it; the Tombstone, not the surface, makes recovery possible.
8. **Silence when there is nothing true to say.** No empty Turn digest, no zero Kept badge, no
   without a reason, no Notice for an outcome the Reader can already see.
9. **Live values beat Snapshots.** A Session title or workspace name shown on a row is the live
   value whenever it resolves; the Snapshot is a fallback, never presented as current.
10. **Follow the harness.** Themes, narrow widths and reduced-motion preferences are the harness's,
    and a surface adds no layout opinion beyond keeping itself within the Transcript's visible
    bounds and reachable at narrow width.

## Problem

The Margin is useless if it cannot be reached deliberately, and dangerous if it claims more than it
knows. Thirteen surfaces have accumulated around it, each with a temptation to grow: a list that
starts ranking, a badge that starts recommending, a bar that competes with Chat's own selection
surface, a card that becomes an unclosable dialog. This specification fixes one job per surface,
states how each behaves, and names what each must not do, so that the visual language can change
without the Margin's meaning drifting with it.

## Solution

### Surface inventory

| Surface | The one job it owns |
|---|---|
| **Highlight selection bar** | Immediate Capture in one of five Colours, annotate, browser escape |
| **Annotation popover** | Edit a new Highlight's Colour, Intent, Tags and Note |
| **Item card** | Read and edit an existing Highlight in transcript context |
| **Assistant action row** | Save a whole Reply as a Mark |
| **Proposal row** | Present an Agent Proposal verbatim and offer Keep or Dismiss |
| **Session tab** | The owning Session's Margin, in transcript order |
| **Global page** | Every Session's Margin, grouped and searchable |
| **Turn digest** | Report a completed Turn's counts and open the Session tab |
| **Kept badge** | Report the count of `kept` Highlights on a Session row |
| **Composer dock** | Keep a Pending insertion visible beside its composer |
| **Undo** | Restore a Tombstone from the surface that reported the deletion |
| **Notice** | The one transient channel for an outcome to be stated |
| **First run** | Teach the gesture, name the chord, state visibility |
| **Worth another look** | Present Resurfacing candidates, one reason each |
| **Session-row context menu** | Copy a Session's Highlights as Markdown, open the Session tab, or brief the Agent |

Each surface's behaviour, states and prohibitions follow. The job above is the whole of its remit: a
surface that needs another's job calls it rather than restating it.

### Highlight selection bar

**Behaviour.**

- It appears for one gesture: a right-click that lands inside a Highlightable Selection in the
  Visible Session, and it suppresses the native menu for that press only.
- It anchors to the Selection — below it when it fits, above it otherwise, clamped to the
  Transcript's visible bounds — and follows the Selection when the Transcript scrolls or reflows.
- It carries five Colour dots, Annotate, and ⋯ More actions. Choosing a dot captures the Selection
  immediately in that Colour. The dot matching the last Colour the Reader used is marked as current;
  before any Colour has been chosen, Violet (slot 3) is the quick-capture default.
- Annotate opens the Annotation popover for the same Selection. ⋯ More actions offers Copy selection
  and Browser menu.
- Copy selection copies the whole live Selection, not only the part that will be stored as the
  Quote, and reports failure truthfully.
- Browser menu closes the bar, tells the Reader that the next right-click is the browser's, and
  hands that next right-click over. No surface can open the browser's menu on its own.
- ⇧ + right-click, with Shift held before the press, and the keyboard context-menu key are never
  intercepted: the Reader gets the browser's menu and the bar dismisses itself.
- A pointer Selection — drag, double-click or triple-click — never opens the bar by itself. A
  Selection extended from the keyboard may open it, and then focus moves into the bar because the
  bar sits outside the Reader's tab order.
- While Chat's own selection surface is open, the plugin's bar stands down: a plain Selection shows
  only Chat's Quote affordance.
- A press outside the bar dismisses it. A right-click while the Annotation popover is open dismisses
  the popover instead of starting a second capture.
- Keyboard chords exist for capturing the live Selection in the last-used Colour and for opening
  this Session's Highlights. A chord that is already taken degrades to the next candidate rather
  than failing, and First run names what actually registered.

**States.**

- *Empty:* not shown; there is no resting bar and no placeholder.
- *Out of scope:* a Selection in reasoning, a user message, tool output, injected context, composer
  text or the Trajectory view leaves the bar hidden and the native menu untouched.
- *Error:* a Capture the Margin refuses is reported through a Notice, the bar closes, and the
  passage is left unhighlighted; the Reader is never shown a saved Highlight that was not stored.
- *Capability-degraded:* saving works; the resulting paint may lose only its text colour.
- *Narrow width:* the bar stays within the Transcript's bounds and never widens the layout; its More
  menu stays inside the viewport.
- *Reduced motion:* it appears without transition or scale, and no state depends on motion.

**Must not.** Open from a pointer Selection; merge with or replace Chat's selection surface; capture
more or less than the live Selection; capture anything that is not Highlightable; intercept a
right-click outside its own gesture; keep the Reader from the native menu; stay open after its
Session leaves the screen; remember a Selection as stored Margin data.

### Annotation popover

**Behaviour.**

- It opens only from Annotate, against the same captured Selection, and shows the Quote excerpts so
  the Reader knows what is being annotated.
- It carries Colour (five slots), Intent (the four values, `note` by default), Tags and Note. The
  Note is behind an explicit add action so the popover stays small; the frequent path stays short.
- Tags are added as chips, normalised as the Margin will normalise them, with suggestions drawn from
  tags already in use and a cap the Margin enforces.
- Save captures the Selection with everything the Reader set. Cancel dismisses without capturing.
  Escape cancels.
- Interacting with the popover — including typing in a tag or note field — never dismisses it and
  never clears the draft. A press outside it, or Escape, dismisses it and drops the pending
  Selection.
- Focus moves into the popover when it opens (or into the bar for a pointer gesture, which leaves
  focus where the Reader put it), stays inside while it is open, and returns to where it was when it
  closes.

**States.**

- *Empty:* a new Highlight opens with the last-used Colour, no Tags, no Note and the default Intent.
- *Error:* a refused Capture is reported through a Notice, the popover closes, and nothing is
  stored.
- *Capability-degraded:* annotation works; only the paint's text colour may be missing afterwards.
- *Narrow width:* the popover stays within the Transcript's bounds and the Note stays collapsed by
  default.
- *Reduced motion:* no opening animation; focus moves without motion.

**Must not.** Save without an explicit save action; bind the Colour, Intent, Tags or Note beyond the
Margin's rules; keep a half-filled draft; reopen over a second Selection; take focus from the Reader
without returning it.

### Item card

**Behaviour.**

- One left-click on painted characters of the Visible Session opens the Item card for that
  Highlight, anchored to the Highlight.
- It shows the Quote, the Star, and the fields the Reader may change — Colour, Intent, Tags and
  Note. The Quote is read-only.
- Star persists immediately rather than as part of a draft. Save commits the rest; closing without
  Save discards the draft and leaves the stored Highlight unchanged.
- ⋯ More actions holds the occasional actions: show in conversation (Reveal), insert into the
  current Session's composer, insert into a new Session, copy the Quote, and delete.
- Delete is a Tombstone and offers Undo inside the card. A delete the version guard refuses leaves
  the Highlight visible and says so.
- A save or delete that loses its version race keeps the Reader's draft and offers Reload or
  Overwrite; nothing is overwritten silently.
- A queued Insertion is reported as queued; a failed one as failed. A copy is reported successful
  only when the text reached the clipboard.

**States.**

- *Empty:* not applicable; the card exists only for an existing Highlight.
- *Unanchored Highlight:* the card is reached from the lists rather than the paint; it shows the
  stored Quote and still allows every action except Reveal.
- *Archived or unavailable Session:* Reveal is unavailable and says why; editing, copying and
  deleting still work.
- *Conflict:* an inline prompt inside the card, with the draft preserved.
- *Error:* a refused write is stated in the card and the card stays open.
- *Capability-degraded:* the card works; reaching it by clicking paint depends on the paint's fill,
  which survives a missing text colour.
- *Narrow width:* the card stays within the viewport and scrolls internally rather than pushing the
  Transcript.
- *Reduced motion:* no entrance animation; focus moves without motion.

**Must not.** Change the Quote; overwrite a newer version; hold a Star as a draft; present itself as
a blocking dialog that cannot be dismissed; report a copy or a save that did not happen; offer
Reveal without saying why it is unavailable; lose a draft silently.

### Assistant action row

**Behaviour.**

- On a settled Reply, Chat's action row carries one plugin action: save this Reply as a Mark, in the
  last-used Colour, with the default fields.
- A Reply occurrence has at most one Mark. Invoking the action again does not create another; it takes the
  Reader to the Mark that already exists.
- The Mark's band is drawn over the Reply's resolved text and never changes a character's styling.

**States.**

- *Empty:* no Reply, no action; the action appears only where Chat offers an action row for a
  settled Reply.
- *Already marked:* the action still works and goes to the existing Mark rather than duplicating it.
- *Error:* a Mark the Margin refuses is reported through a Notice and nothing is stored.
- *Capability-degraded:* a Mark's band is drawn by the plugin's own visual layer and survives a
  missing text colour.
- *Narrow width:* the action follows Chat's own row geometry and keeps its accessible name.
- *Reduced motion:* no animation.

**Must not.** Create a second Mark on one Reply; appear on reasoning, tool, user or streaming
content; paint a character wash for a Mark; let the action's state depend on a Mark's Resolution
state (an Unanchored Mark still opens).

### Session tab

**Behaviour.**

- It opens for one Session from the Session header's Highlights control, from a Turn digest, from a
  Global page row's open-Highlights action, from the Session-row context menu, and from the
  open-Highlights chord.
- It shows the owning Session's Highlights in transcript-position order, with search, Colour, Tag,
  Starred and Author filters, a State control per row, and row actions: Reveal, insert into this
  Session's composer or a new Session, copy the Quote, star, edit and delete.
- Rows carry the Quote, the Note, the Tags, the Colour, an Author chip only when the Author is the
  Agent, the State control, a relative time, and the badges the facts justify: Unanchored, archived
  Session, unavailable Session.
- A delete offers Undo for the most recent delete, in place.
- Opening with a target clears the Session tab's own narrowing so the target cannot be filtered out,
  scrolls the target row into view, and marks it briefly so the Reader can find it.
- The tab pages its rows and offers the next bounded page. A new search or filter starts a new page.
- A Session's Highlights are its own: a fork does not inherit the parent Session's Highlights, and
  the Session tab never shows another Session's rows.

**States.**

- *Empty:* states that nothing is marked in this Session and points at the gesture; it does not
  repeat the First run teaching.
- *Filtered-empty:* states that no Highlights match the current filters; the header owns the one
  Clear control.
- *Loading:* states that the Margin is being read.
- *Error:* states the failure and still shows the last successful read's Highlights, and offers a
  retry when there are none.
- *Offline or stale:* states that it is showing the last successful read and that changes are
  paused.
- *Capability-degraded:* states that this browser cannot paint Highlights and that lists and Copy
  still work.
- *Narrow width:* one column, controls reachable, the inline editor fits the column.
- *Reduced motion:* the target is scrolled into view without smooth motion and the brief emphasis
  does not depend on animation.

**Must not.** Show another Session's Highlights; reorder by recency; hide Unanchored Highlights;
offer Reveal for an archived or unavailable Session without saying why; drop a draft on a conflict;
lose the Reader's place when a row's edit closes.

### Global page

**Behaviour.**

- It is reached from the left navigation and shows every Session's Highlights, grouped workspace →
  Session.
- Workspace headings name the workspace by its name, never a full path; an unknown workspace is
  named as unknown. Session headings use the live Session title, then the Snapshot, then an untitled
  label.
- Groups are ordered by their most recently touched Highlight, newest first; within a Session, rows
  follow transcript position.
- It carries search, Colour, Tag, Starred, Author, Unanchored and workspace filters, a filtered
  summary, collapse for both group levels, and the next bounded page.
- Rows carry the Quote, Note, Tags, Colour, the Author chip when the Author is the Agent, the State
  control, a relative time, and the badges the facts justify. Row actions: Reveal, edit in place,
  copy the Quote, star, delete with Undo, and open the Highlight in its Session tab.
- Worth another look sits above the list while no filter or search is narrowing it. A Session group
  offers a brief-the-Agent action that never includes a private Highlight.
- The Global page remembers its search, filters, collapsed groups and reading position while the
  Reader opens a Session and comes back.
- A private Highlight is still fully available to the Reader here: privacy is an Agent-access
  ceiling, not a restriction on the Reader.

**States.**

- *Empty:* First run.
- *Filtered-empty:* states that no Highlights match and shows the narrowed summary.
- *Loading:* states that the Margin is being read.
- *Error:* states the failure and offers a retry; if the last read succeeded, it keeps showing that
  data and says it is the last successful read.
- *Offline:* states that changes are paused until the connection returns.
- *Capability-degraded:* states that this browser cannot paint Highlights and that lists and Copy
  still work.
- *Narrow width:* group headings and the filter row wrap, rows keep their names, and no control
  becomes unreachable.
- *Reduced motion:* disclosures and focus moves are not animated.

**Must not.** Rank, score, recommend or reorder by visits; show a Resurfacing row without a reason;
hide or delete a Highlight because its Session is gone; present a Snapshot as the live title; take a
State decision on the Reader's behalf; include a private Highlight in a Briefing.

### Turn digest

**Behaviour.**

- One quiet line closes a completed Turn that has at least one Highlight in it, stating counts only,
  for example "2 highlights · 1 kept". The kept part is omitted when the count is zero.
- Activating it opens the Session tab.
- A Turn with no Highlights under it shows nothing at all.

**States.**

- *Empty:* absent.
- *Open Turn:* absent; a Turn receives its digest when it completes.
- *Error:* absent; the digest reads stored data and never states a count it cannot support.
- *Capability-degraded:* unaffected; counts do not depend on paint.
- *Narrow width:* the line stays short and never becomes the widest element in the Transcript.
- *Reduced motion:* no animation.

**Must not.** Report content rather than counts; report a judgement; count another Turn's
Highlights; claim a State it does not have; open anything other than the Session tab.

### Kept badge

**Behaviour.**

- On a Session row it reports the count of `kept` Highlights in that Session, as a quiet trailing
  signal that is not itself an operable control.
- Its hover preview lists the Session's leading Highlights, kept ones first, with a colour and an
  excerpt, and states how many more there are. The preview is the Session's Margin; it never labels
  a previewed Highlight as kept unless it is.
- A Session with no `kept` Highlight shows no badge at all.

**States.**

- *Empty:* absent.
- *Error:* absent; the Kept badge states a count or nothing.
- *Capability-degraded:* unaffected.
- *Narrow width:* the Kept badge stays at the trailing strip's icon scale.
- *Reduced motion:* the hover preview appears without animation.

**Must not.** Claim any count other than the count of `kept` State; become a control or a second
navigation path; preview another Session; appear at zero.

### Composer dock

**Behaviour.**

- A strip above the composer of the destination Session states that one or more Quotes are waiting
  for that composer, and how many, for example "1 quote waiting for the composer".
- It appears only while at least one Pending insertion is addressed to that Session, and disappears
  when the insertion lands or expires.
- It survives a Session switch: it belongs to the destination Session, not to where the Reader was
  when they asked for the insertion.
- It is informational. It does not retry, dismiss, reorder or place text; the queue is Delivery's.

**States.**

- *Empty:* absent.
- *Degraded:* a Pending insertion that cannot be persisted still works for the current browser
  session and is still shown.
- *Capability-degraded:* not applicable; the dock does not depend on paint.
- *Narrow width:* the strip stays within the composer's width and truncates its sentence rather than
  the count.
- *Reduced motion:* no animation.

**Must not.** Place text into the composer; offer a retry control that competes with Delivery's
queue; show another Session's pending insertions; report a late failure as an error path.

### Undo

**Behaviour.**

- After a confirmed delete, the surface that reported it offers Undo on the spot: a compact strip,
  not a blocking alert, that does not shift the rows around it.
- Undo restores the same Highlight — identity, Quote, presentation fields, judgement attributes — so
  it reappears in every surface and is painted again in its Session.
- The strip does not expire on a timer: the Reader undoes, dismisses it, or asks not to be prompted
  again. Asking not to be prompted suppresses the offer and changes nothing about what delete does.
- A delete the version guard refuses leaves the Highlight visible and offers no Undo.
- A restore that fails states the failure and leaves the Tombstone in place.

**States.**

- *Empty:* absent; no Undo is offered before a confirmed delete.
- *Error:* a failed restore is stated in place.
- *Capability-degraded:* unaffected.
- *Narrow width:* the strip stays within the surface's width.
- *Reduced motion:* no animation.

**Must not.** Be a purge; restore a different Highlight; be duplicated for one delete; appear before
the delete is confirmed; hide the fact that the delete already happened.

### Notice

**Behaviour.**

- One transient message at a time, on the whole shell, so an outcome survives a Session switch.
- It carries outcomes that need saying and have no better place: copied, copy refused, queued,
  insertion failed, conflict, capability warning, text not found by a Reveal.
- A newer Notice replaces the current one; each expires on its own after a short time; it does not
  steal focus.
- Success and warning are distinguishable without relying on colour alone.

**States.**

- *Empty:* no Notice appears.
- *Warning or failure:* visibly distinct from success.
- *Replaced or expired:* gone; the channel keeps no history.
- *Narrow width:* the Notice stays within the viewport and wraps its sentence.
- *Reduced motion:* it appears without animation.

**Must not.** Be a log, a history or a counter; duplicate an outcome the invoking surface already
shows in place; carry a Quote or a Note; interrupt the Reader's typing or selection.

### First run

**Behaviour.**

- The Global page's empty state is the product's First run.
- It teaches the gesture in one sentence: select text in a settled Reply, then choose a Colour dot
  to save immediately or choose Annotate to add Colour, Intent, Tags and Note.
- It names the capture chord that actually registered. A preferred chord that was taken degrades to
  the next candidate, and First run names the fallback; if no chord registered, it teaches the
  pointer path only and claims no chord.
- It states whether the Agent can see the Margin. When Consent is off it says the Agent cannot see
  the Reader's Highlights and where access can be granted; when Consent is on it claims no more than
  Consent grants.
- Where the browser cannot apply a Highlight's text colour, the same empty state carries the
  capability statement alongside the teaching.

**States.**

- *Empty:* this is the empty state itself.
- *Non-empty Margin:* never shown.
- *No chord available:* the pointer path is taught and no chord is claimed.
- *Error:* a failed read is stated by the Global page's error state instead of First run.
- *Narrow width:* the sentences wrap; no control is implied that does not exist.
- *Reduced motion:* no animation.

**Must not.** Promise a chord that did not register; claim Agent visibility Consent does not grant;
become a tour, a wizard or a modal; appear over a non-empty Margin; teach a gesture the product does
not accept.

### Worth another look

**Behaviour.**

- It is a small block above the Highlights on the Global page and above the rows of the Session tab.
- Every row carries exactly one reason from the four and shows the Quote, its Colour and its reason.
- Activating a row reveals that Highlight.
- Only the first few rows are shown; a control expands the rest and collapses them again.
- It is absent when no reason holds, and it is hidden while a search or filter narrows the list, so
  it can never disagree with the rows below it.

**States.**

- *Empty:* absent.
- *Error:* absent; a row exists only with a provable reason.
- *Capability-degraded:* unaffected.
- *Narrow width:* rows wrap and the reason stays readable.
- *Reduced motion:* expansion is not animated.

**Must not.** Show a row without a reason; show two reasons for one row; rank or score; claim a
visit or a recommendation; disagree with the list below it.

### Proposal row

**Behaviour.**

- A Proposal row appears in the Transcript where a turn returned Proposals, one row per Proposal,
  carrying the Quote verbatim plus any Note, Tags, Colour and Intent the Agent suggested.
- It offers exactly two decisions — Keep and Dismiss — and applies them to that Proposal alone; the
  Reader may keep some and dismiss others from the same row.
- It is presentational: the reader's decision is an Agent Access verb, and this surface only presents
  the Proposal and reports the decision. A Proposal row never appears in a list and is never a
  Highlight.
- It states that a Proposal is not saved, so a kept item is visibly the result of the Keep.

**States.**

- *Empty:* absent; a turn that proposed nothing has no Proposal row.
- *Error:* a Keep whose Quote can no longer be found in its Reply states that the passage cannot be
  found and leaves nothing behind; a Dismiss always succeeds and leaves nothing.
- *Capability-degraded:* unaffected.
- *Narrow width:* the row wraps without hiding the Keep and Dismiss actions.
- *Reduced motion:* no transition is required to understand the outcome.

**Must not.** Store anything before Keep; present a Proposal as a Highlight; offer an edit of an
existing Highlight; or disappear before the Reader has decided unless the Transcript itself is
re-rendered.

### Session-row context menu

**Behaviour.**

- The context menu of a Session row, and of a Session tab, carries three plugin entries: copy this
  Session's Highlights as Markdown, open Highlights, and brief the Agent.
- The three entries are always present and disabled when they cannot act, so the menu has a stable
  shape and an empty Session still documents that the feature exists.
- Copy writes a Markdown bullet list of the Session's Highlights in transcript order: each Quote
  and, when present, its Note; no Colour, Tags or dates. It is capped so a paste stays bounded, and
  a refused clipboard is reported.
- Open Highlights focuses that Session's Session tab. It is disabled when the tab it was invoked on
  already is the Highlights tab.
- Brief the Agent asks Delivery to build a Briefing from that Session's Highlights; private
  Highlights are never included, and a Briefing that cannot be staged is reported.
- The Reader's own private Highlights are still copied: privacy constrains the Agent, not the
  clipboard.

**States.**

- *Empty Session:* all three entries present; Copy and Brief are disabled.
- *All private:* Copy is enabled; Brief is disabled.
- *Clipboard refused:* the menu reports the failure and the Margin is unchanged.
- *Capability-degraded:* unaffected.
- *Narrow width:* the menu follows the harness's own menu behaviour.
- *Reduced motion:* no animation.

**Must not.** Change the Margin; copy something the Reader did not ask to copy; include a private
Highlight in a Briefing; remove an entry instead of disabling it; make a disabled entry look
actionable.

## User Stories

1. As a Reader, I want one obvious way to save a passage from the keyboard or the pointer, so
   capture costs no thought.
2. As a Reader, I want to annotate a passage without a large dialog covering the conversation, so
   the context stays visible while I think.
3. As a Reader, I want to click painted text and edit the Highlight behind it, so reading and
   editing are the same gesture.
4. As a Reader, I want to mark a whole Reply in one action and never get a duplicate, so a bookmark
   stays a bookmark.
5. As a Reader, I want this Session's Highlights in transcript order, so the Session tab reads like
   the conversation I just had.
6. As a Reader, I want every Session's Highlights grouped by where they live, so I can find a
   passage I half-remember.
7. As a Reader, I want a quiet count at the end of a Turn and on a Session row, so I can tell what I
   have already judged without opening anything.
8. As a Reader, I want a queued quote to wait visibly above its composer, so "queued" is not a
   disappearing act.
9. As a Reader, I want to take back a delete from the place I deleted it, so a misclick costs
   nothing permanent.
10. As a Reader, I want one message channel for outcomes, so I am not hunting four corners of the
    screen for what just happened.
11. As a new Reader with an empty Margin, I want to be taught the gesture with the chord that
    actually works, so my first attempt succeeds.
12. As a Reader, I want the product to explain what it cannot do here rather than pretend, so I can
    trust what I see.

## Acceptance Criteria

Each scenario has exactly one action. Fixtures are inline.

1. **A right-click over a Selection opens the bar.**
   Given a settled Reply containing "the migration must land" and a Selection of "migration must
   land", when the Reader right-clicks inside the Selection, then the Highlight selection bar
   appears anchored to the Selection and the native menu does not open.

2. **A pointer Selection alone opens nothing.**
   Given the same Reply, when the Reader drags to select "the migration", then Chat's own Quote
   affordance is offered, the plugin's bar does not appear, and the native menu is untouched.

3. **Shift + right-click escapes to the browser.**
   Given a Selection of "migration must land", when the Reader holds ⇧ before right-clicking, then
   the browser's own menu opens and the plugin's bar does not claim the gesture.

4. **A colour dot captures immediately.**
   Given a Selection of "the flag is on" and a last-used Colour of slot 1 Amber, when the Reader
   chooses the second colour dot, then a Span is captured in slot 2 Green, the bar closes, and the
   passage is painted in Green.

5. **Escape cancels the Annotation popover.**
   Given the Annotation popover is open on a Selection of "ship it behind a flag", when the Reader
   presses Escape, then the popover closes with nothing captured and the stored Margin is unchanged.

6. **Annotate saves with an Intent and Tags.**
   Given the Annotation popover is open on a Selection of "ship it behind a flag" with Intent
   `direct`, tag `release` and a Note, when the Reader chooses Save, then one Span is captured
   carrying those fields and its Quote is the whole Selection.

7. **A right-click outside the bar dismisses it.**
   Given an open bar over a Selection, when the Reader right-clicks elsewhere in the Reply, then the
   bar closes, no Capture happens, and the native menu opens because that press is outside the
   Selection.

8. **An open popover is not replaced by a second capture.**
   Given the Annotation popover open for one Selection, when the Reader right-clicks a second
   Highlightable Selection, then the popover closes without saving and no second popover opens.

9. **The bar stands down for Chat's surface.**
   Given Chat's own selection surface is open for the current Selection, when the Reader
   right-clicks inside that Selection, then no plugin bar appears and Chat's surface is unchanged.

10. **A click on painted text opens the Item card.**
    Given a painted Span quoted "migration must land", when the Reader left-clicks inside the
    painted passage, then the Item card opens for that Highlight and shows its Quote, Tags and Note.

11. **Star persists without Save.**
    Given an open Item card for a Highlight that is not starred, when the Reader clicks Star, then
    the stored Highlight is starred immediately and no Save is needed.

12. **A conflict keeps the draft.**
    Given an open Item card whose Highlight was changed elsewhere to Colour slot 5 Red, when the
    Reader saves a Note, then the card keeps the Note draft and offers Reload or Overwrite instead
    of overwriting.

13. **Deleting from the card offers Undo there.**
    Given a confirmed delete performed from the Item card, when the Reader chooses Undo in that
    card, then the Highlight is restored with the same identity and fields and is listed again.

14. **The Assistant action row makes one Mark.**
    Given a settled Reply that already carries one Mark, when the Reader invokes save-to-highlights
    again, then no second Mark is created and the Reader is taken to the existing Mark.

15. **The Session tab is in transcript order and searchable.**
    Given the Session tab is open on a Session with a Span on Turn 1 and a Span on Turn 3, both
    quoted "migration", when the Reader searches "migr", then both match and the Turn 1 row is
    above the Turn 3 row.

16. **The Session tab opens a target visibly.**
    Given the Session tab is open with a tag filter that excludes a Highlight, when the Reader opens
    that Highlight from a Global page row, then the tab clears its filter, scrolls the target row
    into view and marks it briefly.

17. **The Global page groups and orders by recency of change.**
    Given two Sessions in one workspace whose most recent Highlights were touched a day and a minute
    ago respectively, when the Reader opens the Global page, then the more recently touched Session
    is listed first and its rows follow transcript position.

18. **The Global page is First run when empty.**
    Given a Margin with no Highlights, when the Reader opens the Global page, then the page teaches
    the gesture, names the capture chord that registered, and states that the Agent cannot see the
    Margin while Consent is off.

19. **No chord registered, no chord claimed.**
    Given every candidate capture chord is already taken and no chord registered, when a Reader with
    an empty Margin opens the Global page, then First run teaches the pointer path and claims no
    chord.

20. **A Turn with nothing marked has no digest.**
    Given a completed Turn containing no Highlight, when the Reader reads the Transcript, then no
    Turn digest line appears under that Turn.

21. **The Turn digest opens the Session tab.**
    Given a completed Turn with two Highlights, one `kept`, when the Reader activates the line
    reading "2 highlights · 1 kept", then the Session tab opens for that Session.

22. **The Kept badge is silent at zero.**
    Given a Session whose Highlights are all `new`, when the Reader looks at its Session row, then
    no Kept badge appears.

23. **The Composer dock shows a waiting quote.**
    Given a Pending insertion addressed to Session A while Session B is on screen, when the Reader
    switches to Session A, then the Composer dock states that one quote is waiting for the composer.

24. **The Composer dock is silent when nothing waits.**
    Given no Pending insertion for the current Session, when the Reader looks above the composer,
    then no Composer dock strip appears.

25. **A Notice replaces the current one.**
    Given a Notice that a copy succeeded, when a later action is refused and reports, then only the
    refused outcome is shown and the earlier message is gone.

26. **The Session-row context menu is stable and honest.**
    Given a Session with no Highlights, when the Reader opens its context menu, then the three
    plugin entries are present and the copy and brief entries are disabled.

27. **Copying a Session's Highlights excludes metadata.**
    Given a Session with one Highlight quoted "the migration must land" with Note "ship behind a
    flag", Tags `release` and Colour slot 4 Blue, when the Reader copies the Session's Highlights,
    then the clipboard holds a Markdown list with the Quote and the Note and no Colour, Tag or date.

28. **Private Highlights never enter a Briefing.**
    Given a Session with one Highlight visible to the Agent and one private Highlight, when the
    Reader briefs the Agent from that Session, then the Briefing contains only the agent-visible
    Highlight.

29. **A degraded browser is told the truth.**
    Given a browser that cannot apply a Highlight's text colour, when the Reader opens the Session
    tab, then it states that this browser cannot paint Highlights and that lists and Copy still
    work.

30. **A refusal is stated and keeps nothing.**
    Given the Margin is at the limit of how many Highlights it will hold, when the Reader captures a
    Selection with a colour dot, then a Notice reports the refusal, no Highlight is added, and the
    passage is not painted.

## Implementation Decisions

1. **One surface, one job, one owner.** Each surface is defined by its job and calls another surface
   rather than duplicating it: a Turn digest opens the Session tab, a Session-row menu opens the
   Session tab, an Item card asks Delivery to insert.
2. **Surfaces are projections.** Every list is derived from stored Highlights plus the live Session
   and workspace names on each read; nothing a surface displays is stored as fact.
3. **One request path.** Every change a surface requests goes through the same path and ends in a
   typed outcome (written, conflict, refused, failed, queued, inserted, not found), which
   the surface reports; no surface re-derives an outcome.
4. **One Notice channel.** All transient outcomes share one channel that holds one message at a
   time, shown at the shell so it survives navigation.
5. **Undo belongs to the reporting surface.** The delete request returns whether it succeeded; the
   surface that asked offers recovery, so recovery is never more than one step from the action.
6. **Show the intended result, keep the stored one.** A surface may show a write's intended result
   immediately, but the stored outcome replaces it; a refused write rolls back and says so.
7. **Asking is not deciding.** A surface may ask the Margin to change a field, but it never decides
   a State, a Resolution state, a Visibility or a Consent fact.
8. **Live names first.** Session and workspace names resolve from the live values on every showing
   of a list, with the stored Snapshot as the fallback.
9. **One source for passive signals.** The Turn digest and the Kept badge read the Highlights one
   Session already has; they never fetch and never count across Sessions.
10. **Lists are bounded and view state survives navigation.** Search, filters, folds, reading
    position and the row limit belong to the Global page, not to one appearance, so returning from a
    Session restores them.
11. **The bar and the popover are the plugin's own floating surfaces.** They place themselves
    against the Selection's own lines and the Transcript's bounds, and they never enter Chat's own
    selection surface.
12. **Dismissal is layered.** One Escape closes one layer: the More menu first, then the popover or
    bar, then the Item card; a press outside a surface dismisses it without acting on it.

### Deferred Decisions

| Decision not made | The seam that keeps it open |
|---|---|
| More actions in the bar's menu | One menu surface; another action is another request |
| Keyboard route into the Item card | One entry point; a route changes no data |
| One-press dismissal of the card | Dismissal is layered in one place; policy can change |
| Resurfacing on a filtered Session tab | The block is independent; only presentation hides it |
| Whether the digest may show content | Counts only; the glossary changes first |
| A Briefing in the Session-row menu | Briefing is Delivery's; placing it is ours |

## Testing Strategy

- **Surface-by-surface behaviour.** For each surface, fix its stored data and assert its job, its
  states and its refusals, driving it through the Margin's actions with those actions replaced by
  fixtures.
- **Accessibility as behaviour.** For every row, preview line and generated affordance, assert the
  accessible name is the Quote (plus the reason for a Worth another look row), and that State and
  badge text are present as words.
- **Gesture matrix.** Right-click, pointer drag, double-click, triple-click, keyboard-extended
  Selection, Shift + right-click, the keyboard context-menu key, the chords, and an open Chat
  selection surface; assert exactly which surface responds and that the native menu is untouched
  everywhere else.
- **Outcome coverage.** For each surface that writes: written, conflict, refused, failed, queued,
  inserted, not found; assert the surface's statement and that no silent path exists.
- **Empty and degraded states.** Empty Margin, empty Session, empty filter result, archived Session,
  unavailable Session, unanchored Highlight, no text-colour capability, offline read, narrow width,
  reduced motion.
- **Notice channel.** Assert one message at a time, replacement, expiry and that no surface keeps a
  second channel.
- **Undo coverage.** For every surface that reports a delete: confirmed delete offers Undo, refuses
  on an unconfirmed delete, restores the same Highlight, and a failed restore is stated.
- **First run truthfulness.** With a registered chord, with a degraded chord and with no chord; with
  Consent off and with Consent on; assert exactly what the empty state claims.

## Out of Scope

- What may be highlighted, how an Anchor is captured, resolved or re-anchored.
- Consent enforcement and the Agent surface; this context only states the facts truthfully.
- The insertion queue, Briefing construction, attribution and expiry; those are Delivery's.
- Storage, transport, freshness and retention; those are Persistence's.
- The concrete visual design of any surface: exact sizes, spacing, colours beyond the five slots and
  copy beyond what the behaviour requires.
- A layout or navigation revolution: the surfaces use the places the harness provides.

## Open Questions

None outstanding. The five questions this specification raised are resolved:

1. **The Turn digest.** Counts only, as the glossary rules; no preview list. The digest's job is to
   make the Session's margin visible at a glance and open the Session tab.
2. **Undo and the opt-out.** The invariant is recoverability, not the prompt. A Reader may suppress
   the prompt; the Session tab keeps a recovery path for the most recent delete, and the retention
   window is never shortened by a preference. No Tombstone becomes unrecoverable.
3. **The Unanchored filter.** Global page only for now; the Session tab shows its Session's
   Unanchored Highlight without a filter. Widening the shared filter set is deferred.
4. **The Proposal row.** It is a surface, now listed in the glossary's inventory: Agent Access owns
   its semantics (Keep, Dismiss, nothing stored) and Presentation owns presenting it. It never
   appears in a list and is not a Highlight.
5. **Telling the Reader that a Mark is one per Reply.** No dedicated teaching is required: the
   Assistant action row reflects the saved state, so a second invocation visibly opens the existing
   Mark rather than appearing to do nothing.
