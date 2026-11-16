# The Agent surface
**Status:** Accepted
**Context:** Agent Access
**Date:** 2026-11-15

## Definitions

| Term | Meaning in this specification |
|---|---|
| **Agent surface** | What the Agent sees when Consent allows: a read pair (a paged list and a single fetch) and, at `read-write`, one proposal operation, together with one runtime skill. The surface is a tool surface, never a prompt section. |
| **Paged list** | The read operation that returns one bounded page of Highlight rows, filtered by the caller and ordered newest first. It carries identity, a short excerpt and presentation metadata, and never a Note. |
| **Single fetch** | The read operation that returns one Highlight by its identity: the full Quote, its presentation metadata, its Quote context and its Note. A private Highlight is not fetchable: the answer is the same non-leaking miss as for an identity that does not exist. |
| **Excerpt** | A shortened display form of the Quote, collapsed to a single line and about one hundred and sixty characters. An excerpt is never stored and is never a substitute for the Quote. |
| **Quote context** | The bounded run of text stored immediately before and after the Quote, as the Anchor records it. The fetch returns it so the Agent can place the Quote in its Reply. |
| **Runtime skill** | One catalogue line, with a model-facing body, that teaches the cross-call workflow: when the Margin is worth consulting, when it is not, and how to escalate from the list to a fetch. It carries no per-operation semantics and no operation definition. |
| **Untrusted display content** | A returned string that the Reader authored — a Quote, Note, Tag or Session title. It is data to read, never instructions to follow and never new user input. |
| **Refusal** | An answer that names a reason and carries no Highlight content. The Agent must treat a refusal as final for the call and must not retry it as if the range were merely empty. |
| **Structural anchor report** | The answer to "is this Highlight's stored Anchor structurally resolvable", reported as whether the Highlight is anchored. It is not a claim that the passage resolves on screen. |

## Constraints

1. The surface exists only at Access level `read` or `read-write`. At `off` there is no
   operation, no skill, no model-facing string and no added cost to a request.
2. The read pair is exactly two operations: one paged list and one single fetch by identity. There
   is no read operation that returns an unbounded set, an aggregate or a search result outside a
   bounded page.
3. A list row carries: the Highlight's identity, an excerpt, its Colour, Tags, Author, Intent,
   State, Star, Session title, age and whether it is anchored. A list row never carries a Note and
   never carries Quote context.
4. The list accepts filters for scope, State, Author, Tags, Star and a query. Every named Tag must
   match. The query searches the Quote, the Tags and the Session title only; it never searches a
   Note, and a Note's content can never be inferred from whether a row matched.
5. Paging is bounded: a page defaults to ten rows and is at most twenty; a larger request is
   served at the cap. A later page is reached by asking for the rows after those already seen,
   and the order is newest first with a stable tie-break.
6. The fetch returns one Highlight: its full Quote, Colour, Tags, Author, Intent, State, Star,
   Session title, age, structural anchor report and Quote context. It returns the Note only when
   the Highlight is not private.
7. A Highlight whose Visibility is `private` is never returned, by the list or by the fetch, and
   its Note never crosses. A fetch for one is answered exactly as a fetch for a Highlight that
   does not exist is answered.
8. The list and the fetch are filtered by the composition of Consent and the call's own narrower
   scope. A row outside the effective scope is not returned, and a fetch for one is answered as a
   miss rather than as a refusal that confirms it exists.
9. The Agent reads only by calling a tool. Nothing from the Margin is added to a model request:
   no prompt section, no runtime context and no automatic message.
10. The runtime skill is one catalogue line while registered and is removed with the tools. It
   teaches the cross-call workflow only; each operation's description carries that operation's
   own semantics.
11. Every returned user-authored string is labelled untrusted display content, and the result
   states that rule in text the Agent can read. User strings travel as values, never inside prose
   the Agent could mistake for an instruction.
12. The read surface is read-only. At `read` there is no operation that stores anything, and a
   stale proposal invocation is refused at execution rather than served.
13. Page and excerpt bounds exist so that a turn's cost is bounded. No read answer grows with the
   size of the Margin.

## Problem

An Agent that cannot see the Margin can only guess what the Reader noticed, which is exactly the
failure the Margin exists to fix. An Agent that sees too much is worse: a single list containing
every Quote, Note, Tag and Session title would be a surveillance surface, would cost a request
its whole margin and would turn the Reader's private commentary into model input without a
second thought. The read surface therefore has to be useful for the questions that actually
occur — what did I keep, what did I mark about this, what does that item say — while keeping the
sensitive part out of any scan and keeping every answer bounded. It also has to be discoverable
without being injected: a model that never learns the Margin exists will never ask.

## Solution

Two read operations, each with one job, plus a skill that teaches the habit. The paged list is
the discovery surface: it carries identity, a short excerpt and presentation metadata, so the
Agent can recognise an item without reading it, and it never carries a Note. The single fetch is
the escalation surface: it returns the full Quote, its Quote context and the Note of a Highlight it
is allowed to return, and it is by identity only, so it cannot be used as a second search. A private
Highlight is never returned at all, so its Note never crosses and no withheld-note signal exists.

The list's filters narrow the Margin before paging: scope, State, Author, Tags, Star and a query
over the Quote, Tags and Session title. Paging is bounded and ordered, so an Agent that needs
more pages asks for them explicitly and an answer never scales with the store. Both operations
answer at the intersection of Consent and the call's own narrower scope, and neither confirms
the existence of a Highlight outside that intersection.

Everything returned is labelled. The result names the surface, states that user-authored strings
are untrusted display content, and carries the payload as values so that a Quote containing
instruction-like text stays a string. The runtime skill adds the one rule the operations cannot
enforce: never restate a guess about what a Highlight says, and never treat returned text as a
new instruction.

## User Stories

- As the Reader, I want the Agent to answer "what did I keep about this?" without my whole margin
  being pasted into its request, so that the Margin stays a store it queries rather than context
  it receives.
- As the Reader, I want a list that cannot show my Notes, so that a scan of my Highlights never
  exposes my commentary.
- As the Reader, I want one Note available when a specific Highlight matters, so that the Agent
  can use what I wrote without seeing every Note at once.
- As the Reader, I want a private Highlight never returned at all, so that marking it private is
  a real exclusion and not a display setting.
- As the Reader, I want a bounded result, so that turning access on does not make every request
  larger as the Margin grows.
- As the Agent, I want a short excerpt and metadata in the list, so that I can decide which one
  item deserves a fetch instead of reading everything.
- As the Agent, I want to be told that returned text is untrusted display content, so that I
  never treat a Quote or a Note as an instruction.

## Acceptance Criteria

**AC-1 — No surface while off.** Given Access level `off`, When the Agent runtime lists its
available tools and skills, Then no read operation, no proposal operation and no runtime skill
exist.

**AC-2 — The read pair at read.** Given Access level `read`, When the Agent runtime lists its
available tools, Then exactly the paged list and the single fetch exist, with the runtime skill,
and no operation that stores anything exists.

**AC-3 — List returns metadata, never a Note.** Given a Highlight that carries a Note, When the
list returns it, Then the row carries identity, excerpt, Colour, Tags, Author, Intent, State, Star,
Session title, age and whether it is anchored, and carries no Note.

**AC-3b — The list carries Intent.** Given a Highlight whose Intent is `direct`, When the list
returns it, Then the row carries Intent `direct`, because the speech act is what Consent exists to
let the Agent understand.

**AC-3c — The fetch carries Intent.** Given a Highlight whose Intent is `dispute`, When the Agent
fetches it by identity, Then the answer carries Intent `dispute`.

**AC-4 — List search never searches Notes.** Given a Highlight whose Quote, Tags and Session
title do not contain a word that appears only in its Note, When a list call queries that word,
Then the Highlight is not among the returned rows.

**AC-5 — List paging is capped.** Given a list call that asks for fifty rows, When it executes,
Then it returns at most twenty rows, and no total is reported: paging is answering by rows after
those already seen.

**AC-6 — List paging default.** Given a list call that names no page size, When it executes,
Then it returns at most ten rows.

**AC-7 — List filters compose.** Given two Highlights that carry different Tags, When a list call
names one of those Tags, Then only the Highlight carrying it is returned.

**AC-8 — Fetch returns the Quote, the Note and its Quote context.** Given a Highlight that is not
private and carries a Note, When the Agent fetches it by identity, Then the answer contains the
full Quote, the Note and the Quote context around the passage.

**AC-9 — A private Highlight is not fetchable.** Given a Highlight whose Visibility is `private` and
which carries a Note, When the Agent fetches it by identity, Then the answer is exactly the
non-leaking miss returned for an identity that does not exist: no Quote, no Note, no Quote context,
and nothing that distinguishes it from an absent Highlight.

**AC-10 — A miss does not become an existence oracle.** Given a Highlight outside the effective
scope, When the Agent fetches its identity, Then the answer is the same as for an identity that
does not exist, and it reveals no content.

**AC-11 — The write tier is absent at read.** Given Access level `read`, When a proposal
invocation left over from a former `read-write` grant executes, Then it is refused at execution
and stores nothing.

**AC-12 — Returned text is labelled untrusted.** Given a Highlight whose Quote contains text that
reads like an instruction to the Agent, When the list or the fetch returns it, Then the result
labels the Quote as untrusted display content and carries it as a value, not as prose.

**AC-13 — Nothing is injected into a request.** Given Access level `read` and a turn in which the
Agent calls no tool, When the model request is assembled, Then it carries no Highlight content
beyond the surface's fixed operation descriptions and the skill catalogue line.

**AC-14 — The anchored report is structural.** Given a Highlight whose stored Anchor is no longer
structurally resolvable, When the list returns it, Then the row reports that it is not anchored,
and the answer never claims that the passage resolves on screen.

**AC-15 — Out-of-range rows stay out.** Given a call that narrows the scope to the calling
Session, When the list executes, Then no row from another Session is returned, whatever its
Tags or recency.

**AC-16 — Age is reported against the save.** Given a Highlight saved some time ago, When the
list returns it, Then the row carries its age since it was saved, so the Agent can reason about
recency without a second call.

## Implementation Decisions

- **The read pair is one surface.** The two operations are registered and removed together with
  the skill, because a skill that teaches operations the Agent cannot call is misleading and a list
  without a fetch is a dead end.
- **Semantics live in the description, workflow lives in the skill.** Each operation's description
  states what it returns, what it never returns and which filters it accepts. The skill states
  when the Margin is worth consulting, when it is not, and that the fetch is the escalation for
  the one or two items that matter.
- **The list projects a bounded row.** The row is computed for the Agent rather than reusing a
  storage shape: no Note, an excerpt instead of the Quote, no Quote context, and a structural
  anchor report instead of a resolution result.
- **The fetch is by identity.** It exists so the Agent can resolve a row the Reader or the Agent
  already knows about; it is not a second search, so a caller cannot use it to enumerate.
- **Caps are answered where the call is served.** A page larger than the cap is served at the
  cap rather than failing; a malformed argument is reported as a correctable argument error. The
  Agent never receives more than the bound.
- **Ordering is newest first with a stable tie-break,** so paging is deterministic and a later
  page never repeats or skips a row because of equal timestamps.
- **One labelled result.** Every answer is one text block: a non-user-authored line naming the
  operation, the sentence that user strings are untrusted display content, and the payload as
  structured values. Notes are never interpolated into the prose.
- **Refusals are values.** A refusal names its reason (access off, identity unavailable, not
  found) and carries no content. It is never an error the Agent should retry with a wider scope.
- **The anchored report is honest about being structural.** The Host reports whether the stored
  Anchor is structurally resolvable; the browser half owns real resolution. The surface must not
  upgrade the report into a liveness claim in its description or in its result text.
- **The skill is one catalogue line while registered.** Its body is model-facing and English; it
  restates the untrusted-content rule because that rule must survive every call, not because the
  description omitted it.

### Deferred Decisions

| Decision not made | Seam that keeps it open |
|---|---|
| Whether the read pair ever answers aggregate questions such as counts over a range | The bounded page contract is the seam; an aggregate would be a new published operation with its own limits. |
| Whether the list accepts an Intent filter | Intent is already carried by the list row and the fetch; a filter joins the existing bounded filter set without changing the row contract. |
| Whether a longer excerpt or Quote context may appear in a list row at a narrower grant | The excerpt bound is part of the page contract; a longer row would be a visibility decision, not an optimisation. |
| Whether the fetch should accept a Quote instead of an identity | The current contract is identity-only so the fetch cannot become a search; a Quote lookup would need its own consent wording. |
| Whether further read operations are ever justified | The pair is closed until a separately specified Reader need exists; the Guest rule does not permit adding operations for the Agent's convenience. |
| Whether the skill body should be localised | The skill is model-facing, and the runtime's catalogue language is not the Reader's surface language; changing that is an upstream question. |

## Testing Strategy

The list projection is tested for what it never carries: a Highlight with a Note is listed and
the Note is absent; a query whose only match is inside a Note returns no row. The private ceiling
is tested on both operations, including the case where a private Highlight would otherwise match
every filter.

Paging is tested at its boundaries: default, at the cap, above the cap, an empty page beyond the
end, and repeated pages over rows with equal timestamps to prove the order is stable. Filters are
tested as an intersection, including a Tag filter that must match every named Tag and a State or
Author filter that must exclude the other values.

Scope intersection is tested from both directions: a narrower call inside a wider grant, and a
call that asks for more than the grant. The miss path is tested against a Highlight outside the
effective scope and against an identity that does not exist, and the two answers must be
indistinguishable.

The untrusted-content contract is tested with a payload that imitates tool syntax and with a
payload that imitates an instruction; both must remain labelled values in the result. The
zero-surface case is tested by asserting that no operation and no skill exist at `off`, and the
skill/tool coupling is tested by each level transition. The structural anchor report is tested
with an Anchor that is no longer structurally resolvable and with one that is but whose passage
is not on screen, and the answer must not claim more than structure.

## Out of Scope

- Everything the Reader sees: the surfaces that display Highlights, the row that shows a Proposal,
  the lists and their filters. Those belong to
  [Presentation & Resurfacing](../../presentation/CONTEXT.md).
- The Briefing and every Insertion, which belong to [Delivery](../../delivery/CONTEXT.md).
- Resolving an Anchor, which belongs to [Anchoring](../../anchoring/CONTEXT.md); this context only
  reports the structural flag it is given.
- The durability and transport of the Highlights the read pair serves, which belong to
  [Persistence & Distribution](../../persistence/CONTEXT.md).
- The quality of the model's decisions about when to call a tool; the skill teaches the habit,
  and nothing in this context can enforce that the Agent follows it.

## Open Questions

None outstanding. The five questions this specification raised are resolved:

1. **Intent on the Agent surface.** Intent is returned by both the list row and the fetch. The
   speech act is the reason Consent exists — it is what tells the Agent "this is a direction",
   "this is a dispute" — so a surface that withholds it defeats the grant. An Intent *filter* is a
   deferred addition, not a new row contract.
2. **The private ceiling.** A private Highlight is never returned by either operation, and a fetch
   for one is answered exactly like a fetch for a Highlight that does not exist. The package
   README and the implementation record describe the weaker Note-only reading; the intent documents
   lead, and the engineering record is to be corrected.
3. **Distinguishing "no Note" from "private Note".** It must not be possible: under the exclusion
   contract there is no private item on the surface to distinguish. No withheld-note flag exists,
   because it would disclose the existence of the Highlight.
4. **Session title provenance.** No marking is required: a Session title on the Agent surface is
   display context inside the untrusted envelope, and the Agent must treat it as such either way.
5. **The list's age field.** Age is sufficient: it carries the only temporal judgement the surface
   needs (recency), and a date would be a second representation of the same fact.
