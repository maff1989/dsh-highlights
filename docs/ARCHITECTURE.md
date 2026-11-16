# Architecture — the margin

**Read this for:** the shape of the solution and the reasoning behind it — the promises
the architecture must keep, the two halves and their authorities, the direction
dependencies are allowed to point, the deep modules that hide the complexity, the seams
where undecided questions are parked, and the failures the design exists to prevent.
**Companions:** [`INTENT.md`](INTENT.md), [`CONTEXT_MAP.md`](CONTEXT_MAP.md),
[`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md).

This document describes the architecture the product **needs**, not the state of the
build. Where the two differ, the engineering records say so; nothing here restates
implementation status.

## 1. The promises the architecture keeps

The architecture is not judged by its diagrams but by whether these five guarantees hold
under pressure. Each is stated as an invariant; §8 turns them into the failure list a
reviewer checks.

1. **Nothing the reader stored can be lost by anything the transcript does.** Reload,
   re-render, regeneration, folding, compaction, archiving, deletion, or a content change
   may cost a Highlight its *link*. It never costs it its identity, its quote, its note
   or its presence in the list.
2. **The transcript is never modified by the margin.** The margin is a layer *over*
   reading, never an edit *of* it: text selection, links, quoting, streaming and the
   reader's own flow continue to work with highlights on the page.
3. **The agent never reaches the margin unless the reader granted it.** Access is off by
   default; what is granted is layered (level, scope, per-item ceiling); what is
   withdrawn stops working even if a surface's registration lags; nothing is ever pushed
   into a model request.
4. **Capture never blocks reading and painting never blocks typing.** The margin is
   asynchronous to the reader: the highlight appears immediately, the write confirms
   behind it, and a transcript change re-paints within a frame rather than in the
   reader's way.
5. **Every stored fact has one owner, every boundary one contract, every deferred
   decision one seam.** Two resolution ladders, two stores or two consent checks are
   architectural defects, not tidy-up work.

## 2. Two halves, one authority

The plugin is one package with two processes and two jobs:

| Half | Where it runs | Owns | Never owns |
|---|---|---|---|
| **Host** | Beside the harness, persistent | Durability, record identity and versions, tombstones and purge, the live-record cap, consent enforcement, boundary validation, the agent surface registration | Any presentation, any gesture, any reading-flow decision |
| **Browser** | In the GUI | Surfaces, painting, capture gestures, optimistic presentation, the reader's draft state, notices | The truth about what is stored, the authority on consent, the final say on a version conflict |

The split is deliberate, and it is the source of most of the architecture's shape:

- **Consent must be enforced where the data is, not where the button is.** The browser
  half is a surface; a stale or synthetic caller must not be able to widen what the
  reader granted. The Host holds the settings record, registers the agent surface from
  it, and re-checks at execution.
- **Truth must survive the tab.** The browser half can reload at any time; the record
  store, versions and tombstones outlive it. The browser's optimistic view is a forecast,
  and a forecast that loses a race yields to the stored fact while keeping the reader's
  draft.
- **The deployment seam is the same line.** The plugin is installed as a bundle into a
  profile; the Host half activates at process start and the browser half is loaded by the
  GUI. Two artifacts, one package, one compatibility contract: the browser half may be
  newer than the Host half, so every wire addition is optional and every consumer
  tolerates an absent optional field.

Consequences that the rest of the design inherits: a transport with a version-guarded
write whose conflicts are *values*; a freshness model that is pull-based with a stated
staleness bound; and a rule that no surface may assume the data it shows is the latest
possible truth.

## 3. Layers and dependency direction

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  Surfaces — where the reader acts                                │
  │  selection bar · annotation editor · item card · Session tab ·   │
  │  Global page · assistant action · digest · badge · dock · notice │
  └───────────────┬──────────────────────────────────────────────────┘
                  │ depends on
  ┌───────────────▼──────────────────────────────────────────────────┐
  │  Application contexts                                            │
  │  Presentation & Resurfacing · Anchoring · Delivery ·             │
  │  Agent Access                                                    │
  └───────────────┬──────────────────────────────────────────────────┘
                  │ depends on
  ┌───────────────▼──────────────────────────────────────────────────┐
  │  Core: the Margin                                                │
  │  Highlight · Quote · Colour · Tag · Note · Star · Author ·       │
  │  Intent · State · Visibility · Provenance · Tombstone            │
  └───────────────▲──────────────────────────────────────────────────┘
                  │ published contracts only
  ┌───────────────┴──────────────────────────────────────────────────┐
  │  Generic infrastructure: Persistence & Distribution               │
  │  record store · transport · freshness · packaging · config        │
  └───────────────┬──────────────────────────────────────────────────┘
                  │ adapters at the edge
  ┌───────────────▼──────────────────────────────────────────────────┐
  │  The harness (upstream, not ours)                                 │
  │  Conversation · Sessions · Workspace · Layout · Storage ·         │
  │  Connection · Agent runtime                                       │
  └──────────────────────────────────────────────────────────────────┘
```

Three rules make the diagram real rather than decorative:

1. **Dependencies point inward, toward the core.** The Margin names nothing from its
   outer contexts: it holds an opaque Anchor, a Snapshot and its own judgement
   attributes, and nothing else. Anchoring names no surface and no consent concept.
   Surfaces name actions, not storage. Infrastructure names no domain meaning.
2. **Upstream models are translated at the edge, never passed inward.** The transcript's
   node identity, the storage document, the tool envelope and the composer's insertion
   response are all *upstream* shapes. Each is converted by one adapter into the inner
   context's vocabulary before anything else sees it. That adapter is the only place the
   upstream fact is allowed to exist.
3. **Construction is confined to the two composition points** — one for the Host half,
   one for the browser half. Inner modules receive collaborators; they never build them.
   This is where the unavoidable concrete dependencies (opening the store, registering
   the route, wiring surfaces, reading configuration) live, and nowhere else.

The matrix in [`CONTEXT_MAP.md`](CONTEXT_MAP.md#dependency-rules) is the enforceable
version of these rules; a change that needs a forbidden edge is a map change first.

## 4. Deep modules

A **deep module** has a small interface over a large amount of hidden complexity — state,
ordering and side effects, not lines of code. The margin's architecture is deliberately
built from six of them. Each one is where a category of bugs is *not* allowed to spread.

| Deep module | Small interface, in the caller's words | What it hides | Why this is where the difficulty belongs |
|---|---|---|---|
| **Record store** | *keep this Highlight; give me what is stored; apply this version-guarded change; tell me when the set changed* | Durability, versions and compare-and-set, tombstones and the retention purge, the live-record cap, boundary validation, write serialization, the change indicator | Every caller would otherwise re-implement retention, conflict and validity. One store means one answer to "is it saved?" and one place where "delete is not erasure" is true. |
| **Consent gate** | *may this caller read this, at this scope? may it propose?* | The composition of access level × access scope × per-item visibility × calling identity; registration and revocation lifecycle; execution-time re-check | Consent is the one place a mistake is a privacy failure. Callers get a yes/no; the policy matrix never leaks into a surface. |
| **Anchor resolver** | *capture a selection or a reply as an Anchor; resolve an Anchor to a place or a resolution state; re-anchor this Highlight* | Transcript structure and occurrence selection, text projection, quote-and-context verification, the resolution ladder, reveal sequencing, DOM variance and change | The transcript is upstream and will change. One resolver means the panel and the transcript cannot disagree about whether a Highlight is anchored. |
| **Observation and paint pipeline** | *register these transcript roots; paint these Highlights; something changed, refresh* | Geometry measurement, two-phase measure-then-write, frame coalescing, mutation observation, visibility gating (no work while the conversation is hidden), degraded capacity when a browser mechanism is unavailable | Painting is the densest source of ordering and side-effect bugs in the product. Hiding it behind "paint these" makes every surface safe to change. |
| **Delivery queue** | *deliver this quote or packet to this destination → inserted, queued or failed* | Composer readiness, retry windows, expiry, deduplication, attribution formatting, the visible pending queue | Delivery failure is invisible by default (the text simply does not appear). The queue is the only place that can guarantee "the reader always learns what happened". |
| **Resurfacing selector** | *given these Highlights, their resolution and the clock, which are worth another look, and why?* | The four predicates, their fixed precedence, the deterministic ordering, the silence rule | Resurfacing is where a product becomes noisy. Pure and total: every row carries exactly one provable reason, and no reason means no row. |

Two properties hold for all six, and they are the test of whether the module is real:

- **The interface is shaped by the application's need, not by what the upstream happens
  to offer.** The paint pipeline says "paint these ranges", not "apply this stylesheet";
  the resolver says "resolve this Anchor", not "search these DOM nodes"; the delivery
  queue says "deliver", not "insert a quote and capture an insertion span". If an
  interface mirrors the vendor's API, the upstream has already leaked inward.
- **A fake is trivial to write.** In-memory store, an always-ready or never-ready
  composer, a transcript that can be scripted, an agent client that answers from a list.
  That is how the modules are built and tested before the real thing exists (§9).

## 5. Seams — where deferred decisions live

Each row names a decision deliberately *not* made, the interface that keeps it open, and
what a later choice is still allowed to change. This is the architect's main deliverable:
the design's value is inversely proportional to the number of decisions it forces early.

| Decision deferred | The seam that holds it | May change later | May not change |
|---|---|---|---|
| Transport mechanism between the halves | The store contract: callers ask for outcomes, not for a channel | Route, envelope, negotiation, replacement by a harness-native typed remote | The outcomes (written, conflict, refused, queued) and the version-guarded write |
| Storage engine and physical layout | The record-store contract: durable CRUD over opaque Highlights | Document layout, engine, indexing, migration strategy | Identity, versions, tombstone semantics, cap semantics |
| Push vs pull freshness | The freshness contract: "records changed" is observable; the mechanism is not | Add a forwarded change event; keep or drop polling | Staleness must remain bounded and stated; surfaces must remain honest while stale |
| Cross-device sync and export | Identity, Origin, version, tombstone and Snapshot in the Highlight contract | Any sync transport, merge policy, export format | The margin stays the reader's; conflicts stay visible; delete stays a tombstone |
| Where Re-anchor is offered | The Re-anchor operation in Anchoring | Any surface, any gesture | Re-anchoring never changes Quote, identity or judgement |
| Delivery to another *existing* Session | The destination model, with Pending insertion as the seam | Add the destination and its queue behaviour | Delivery never mutates the Margin; refused means queued, not dropped |
| The agent doing more than proposing | The Guest rule: a hard boundary, not a setting | A deliberate, separately specified widening | Consent stays off by default; private items stay private; nothing is injected |
| A richer palette or user-defined colours | The Colour slot contract | More slots, a picker | Colours remain themed, finite and legible in both themes |
| Painting in-band if the harness offers a decoration seat | The presentation contract: "paint these Highlights here" | Replace the out-of-band adapter with an in-band one | The transcript is never mutated by the margin; accessibility statements stay true |

The discipline that makes seams real: **design against the interface you wish you had,
build the fake first, and land the real adapter last.** Each seam above was used that way
— the in-memory store before the durable one, the scripted composer before the real
insertion, the scripted transcript before the real one. The boundary tests that pinned
the real behaviour stay, and are re-run when the upstream changes.

## 6. Absorbing upstream pressure

Most of the architecture exists to absorb gaps in the harness. Each row is a place where
the front door is closed, the adaptation chosen, and the alternative rejected.

| Upstream reality | Adaptation | Alternative rejected, and why |
|---|---|---|
| No seat inside a reply body to decorate | Paint as a layer over the transcript: a text-colour highlight for passages, a geometry overlay for rounded fills and whole-reply bands; the rendered tree is untouched | Forking the harness to add a decoration seat: it changes which runtime serves the GUI for one visual feature, and it is not reversible for the reader |
| No public scroll API | Reveal owns the scroll: open the Session, page history as needed, then scroll the resolved passage (not merely its reply) into view; best effort, stated outcome | "Open the Session and hope": fails silently on long histories, which is the common case |
| No forwarded change event for an out-of-tree plugin | Pull freshness: activation, own write, reconnect, focus within a window, optional visible-page poll; a bounded retry when a read races a write | A timer that pretends to be real-time: it burns work to fake a guarantee it cannot make |
| Reply identity is a DOM fact, not a contract; history is not always loaded | Anchors are selectors: identified reply occurrence + quote + quote context + versioned recorded position, resolved down a ladder; unanchored is a legitimate state | Storing a pointer or an offset: fails on the first re-render, reorders the reader's margin behind their back |
| Only one plugin may hold Chat's selection surface, and the shipped quote plugin holds it | Own the gesture: the highlight bar arrives on a distinct gesture with explicit escape hatches and a non-interference rule for the native menu | Fighting for the shared surface: two plugins taking turns makes every selection ambiguous |
| A typed remote is not available out-of-tree | The plugin's own authenticated channel with an envelope; business outcomes are values inside it | Undocumented global mutation of the harness: brittle, and a failure mode nobody can debug |
| The transcript is virtualized in some views but not others | Paint only where the reader reads; exclude the views with no highlightable source and no body seat; never assume a virtualized row is mounted | Chasing a virtualized seat through a table view: high cost, no reader benefit |
| One process serves the GUI; a reload can happen at any moment | The browser's store is a cache with an explicit freshness contract; optimistic writes are forecasts; conflicts are values and drafts are kept | Server-style sessions and locking: the plugin has no authority to change the harness's process model |

## 7. The primary data flows

Stated in the language of the contexts, without mechanisms.

**Capture.** The reader selects text in a settled reply (or marks a reply) → the
selection is checked for eligibility → the Anchor is captured → the Highlight is
assembled with defaults (last colour, no tags, no note, `new`, `note`, `user`,
`agent`-visible) → the store keeps it behind a version-guarded write → the surface paints
it immediately and the list prepends it optimistically → the confirmed record replaces
the forecast. A lost race keeps the draft and offers reload or overwrite.

**Render.** The reader opens a Session → the transcript registers its roots with the
observation pipeline → stored Highlights for that Session are resolved through the
Anchoring context → the pipeline measures and paints them (span fills, text colour,
whole-reply bands) → a transcript mutation re-runs one coalesced pass per frame, gated
on visibility. Nothing in this flow writes to the transcript or to the store.

**Browse.** A surface asks the Margin for Highlights and the Anchoring context for
resolution states, derives its groups, counts and resurfacing candidates, and renders.
Search and filters are pure derivations over the fetched set. Derived facts (digest,
badge, resurfacing reason) are computed, never stored.

**Reveal.** A surface asks to reveal a Highlight → the owning Session is opened and the
panel state is set → if the target is outside the loaded history, history is paged in →
the anchored passage is resolved and scrolled into view → if the passage cannot be
resolved or stays inside a folded Turn, the Session stays open and the Highlight's quote
context is shown in the list. Never an error path.

**Deliver.** A surface asks Delivery to place a quote or a briefing → Delivery asks the
destination composer whether it can accept text now → yes: inserted, then attribution if
enabled; no: queued, shown in the dock, retried when the destination becomes editable,
expiring with a stated reason → the outcome is reported through the one notice channel →
the Margin is unchanged throughout.

**Consent.** The reader sets an access level, a scope, or a per-item visibility → the
Host stores it in its own settings record and re-evaluates the agent surface as one
deliberate change → the agent, when it asks, is answered by the consent gate, which
composes level, scope, visibility and identity, and refuses rather than widens. Nothing
is ever added to a model request.

## 8. What must never happen

The failure architecture, stated as a review checklist. A change that makes any of these
possible is rejected regardless of the feature it enables.

| Never | Enforced by |
|---|---|
| A stored Highlight is lost, altered or auto-deleted because the transcript changed | Anchors are selectors; the quote, identity and tombstone live in the store; no auto-delete policy exists |
| Anything is deleted automatically | Deletion is an explicit reader act; purge is the only removal and only after the stated retention window |
| The margin modifies the transcript | Painting is a layer; no transcript writing exists in the design |
| Private content reaches the agent surface — in a list, a fetch, a proposal, a notice or an attribution line | The consent gate and per-item visibility are enforced where the data is, and delivery filters private items before they leave |
| Margin content is injected into a model request | No prompt section, no runtime context, no automatic message; the agent's only door is a tool call |
| A surface owns consensus — its own resolution ladder, its own store, its own consent check | One deep module per fact; the dependency matrix forbids the shortcut |
| A delivery disappears without a stated outcome | Delivery returns `inserted` / `queued` / `failed` by contract, and the notice channel reports it |
| A lost write race silently discards the reader's edit | Conflict is a value carrying the live record; the draft is kept and the choice is the reader's |
| Staleness is presented as freshness | The store's freshness contract states its bound; surfaces say when they are stale |

## 9. Testing the architecture

Tests follow the boundaries, not the file tree.

- **One suite per deep module, at its interface.** The store is tested for durability,
  conflict, retention and cap through its contract; the resolver for the ladder and the
  four resolution states; the gate for the composition matrix; the pipeline for paint
  ordering and visibility gating; the queue for the outcome machine; the selector for
  reason precedence and silence. The interior is free to change without rewriting tests.
- **Acceptance scenarios from the domain specs are the outer suite.** Each Given/When/Then
  scenario is written to be executable through a context's public interface. They are the
  definition of done, not illustrations.
- **Fakes are first-class**: the in-memory store, the scriptable transcript, the
  always/never-ready composer and the canned agent client are products of the design.
- **Only system boundaries are mocked**: the harness's seats, the storage facility, the
  transport and the composer. The plugin's own contexts are never mocked against each
  other; if a seam forces a mock between contexts, the seam is wrong.
- **Non-determinism is controlled, never tolerated**: an injected clock for staleness and
  resurfacing, seeded identity minting, explicit ordering instead of map iteration order,
  and stated retry bounds instead of wall-clock waits.
- **Upstream contracts are pinned by small boundary tests** that call the transcript seat,
  the composer, the storage facility and the channel exactly as production does, and are
  re-run on harness upgrades. That is how an upstream surprise is caught before a reader
  meets it.
- **Replace, don't layer**: once a boundary test proves a semantic, a shallower interior
  test that duplicated it is deleted. The suite's value is the freedom to change the
  inside.

## 10. What may change, and what may not

**May change without touching the domain:** the transport, the storage engine, the
freshness mechanism, the surfaces and visual language, the painting mechanism, the
packaging, the number of palette slots, the page sizes and caps (within the contract).

**May not change without a new intent-level ADR and a contract change in the context map:**
the Guest rule and consent defaults; quote immutability; anchor-as-selector; the
transcript never being modified; deletion as a tombstone; one owner per stored fact; the
honesty rules for counts, reasons and resolution states.

**When upstream finally offers a seat** (a decoration slot inside a reply, a forwarded
change event, a typed remote, a scroll API), the change is an adapter replacement behind
an existing contract, not a redesign. If it cannot be made that way, the seam was in the
wrong place — fix the seam, not the contexts.

## 11. Reading the build against this document

The engineering record is the status of the build: `known-limitations.md`,
`implementation-notes.md`, `issue-log.md`, `upstream-asks.md` and `workaround-ledger.md`
in this directory, and the feature-level records in the package README. The module names
used there may differ from the context names used here; the glossary's code-identity
table ([`UBIQUITOUS_LANGUAGE.md` §12](UBIQUITOUS_LANGUAGE.md#12-code-identity-and-known-disagreements))
maps between them, and the engineering ADRs record the concrete choices this document
generalises.
