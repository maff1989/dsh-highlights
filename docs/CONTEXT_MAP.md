# Context map — the margin

**Status:** canonical map of the bounded contexts inside the `dsh-highlights` package
and of their relationships with the DeepSeek Harness contexts around them.
**Companion:** [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md) — read it first; this
map uses its terms.

## The domain in one paragraph

A **Reader** marks passages of **Agent Replies** in the **Margin**: a durable, private,
local collection that lives *outside* the **Conversation** and is never Agent memory. The
Margin has to answer three questions at reading time and after it: *what did I notice?*
(capture), *how do I get back to it?* (anchor, reveal, browse, resurface), and *how do I
hand it forward?* (insert, brief, consult). It sits on top of a product whose
transcript it does not own, whose sessions it does not control, and whose model must be
kept at arm's length — while still being useful to that model when the Reader says so.

Two properties make this domain more than a bookmark list, and both are vocabulary-level
commitments:

- **The margin belongs to the Reader, not to the Agent.** Consent is off by default; the
  Agent may read only what the Reader exposes, only by asking, and may never write.
- **The margin outlives the transcript.** A Highlight keeps its Quote and its identity
  when its Anchor breaks, its Session is archived or deleted, or the Reply is
  regenerated. Anchoring is best effort; the artifact is not.

For DeepSeek Harness as a product, the Margin is a *supporting* subdomain (annotations
around conversations). For this package it is the **core domain** — the reason the
plugin exists. The distinction matters: where a design choice trades harness convenience
against margin integrity, margin integrity wins.

## Context inventory

| # | Context | Classification | Purpose | Owns | Publishes / consumes |
|---|---|---|---|---|---|
| 1 | **Margin** | Core | What a Highlight is, what may be recorded about it, and what may change about it | Highlight identity and lifecycle: Quote, Colour, Tags, Note, Star, Author, Intent, State, Visibility, Provenance, Snapshot, Tombstone | Publishes the Highlight contract (including the per-item **Visibility** ceiling that Agent Access enforces). Consumes only an opaque **Anchor** from Anchoring, and a **Reply occurrence** identity; it knows nothing of Consent levels, resolution states or surfaces. |
| 2 | **Anchoring** | Supporting | Binding a Highlight to a place in the Transcript, and degrading honestly when it cannot | Anchor, Quote context, Capture eligibility, the resolution ladder, Resolution state, Re-anchor | Publishes the Anchor value and Resolution state. Consumes Conversation node identity and the Margin's Quote. |
| 3 | **Presentation & Resurfacing** | Supporting | Making the Margin visible, navigable and honest — in place and in lists | The in-transcript visual language, every Reader-facing surface, browsing and discovery, Resurfacing reasons, Digest and Kept badge derivations | Publishes surfaces and Notices. Consumes Margin, Resolution state, Consent (to state it truthfully) and Delivery actions. |
| 4 | **Delivery** | Supporting | Handing the Margin forward without losing it | Insertion, Pending insertion, Briefing, Attribution, Copy | Publishes delivery outcomes and the briefing packet. Consumes the Margin's Quote/identity/State, Visibility (private items excluded), and the Conversation composer. |
| 5 | **Agent Access** | Supporting | Admitting the Agent to the Margin on the Reader's terms | Consent (Access level, Access scope, per-item Visibility enforcement), the Agent surface (tools + skill), the Proposal lifecycle, the Guest rule | Publishes the consent contract and the model-facing published language. Consumes the Margin (under consent only). |
| 6 | **Persistence & Distribution** | Generic | Keeping the Margin durable, reachable and installable | The record store (durability, versions, Tombstones, purge, caps), the plugin's own transport, freshness, configuration, packaging and upgrade | Publishes the record-store contract and the freshness model. Consumes nothing from the domain except the record shape at the boundary. |

## The map

```
                          ┌──────────── READER ────────────┐
                          │            (the only actor)   │
                          └───────────────┬───────────────┘
        ┌─────────────────────┬───────────┴──────────┬──────────────────────┐
        ▼                     ▼                      ▼                      ▼
 ┌───────────────┐   ┌──────────────────┐   ┌──────────────┐   ┌──────────────────┐
 │ Presentation  │   │    Delivery      │   │ Agent Access │   │  (no other       │
 │ & Resurfacing │   │  (supporting)    │   │ (supporting) │   │   Reader surface)│
 │ (supporting)  │   │                  │   │              │   │                  │
 └───────┬───────┘   └────────┬─────────┘   └──────┬───────┘   └──────────────────┘
         │  read + actions    │  read only         │  read under Consent
         ▼                    ▼                    ▼
 ┌──────────────────────────────────────────────────────────────┐
 │                       MARGIN (core)                          │
 │  Highlight · Quote · Colour · Tag · Note · Star · Author     │
 │  Intent · State · Visibility · Provenance · Tombstone        │
 └───────────────────────────▲──────────────────────────────────┘
                             │  opaque [Anchor]  (1.3)
                  ┌──────────┴───────────┐
                  │  Anchoring (support) │
                  └──────────▲───────────┘
                             │  Conversation node identity (Conformist + ACL)
                             │
 ┌───────────────────────────┴───────────────────────────────────────────────────┐
 │       Persistence & Distribution (generic)  —  store · transport · freshness   │
 │       packaging · configuration            (below every context, knows none)   │
 └───────────────────────────────────────────────────────────────────────────────┘
```

Relationship patterns (DDD nomenclature, used strictly):

- **Conformist** — downstream adopts the upstream's model as-is.
- **Anti-corruption layer (ACL)** — downstream translates; the upstream model does not
  leak inward.
- **Customer/Supplier** — upstream has an obligation to serve the downstream's needs.
- **Open Host Service + Published Language (OHS/PL)** — a stable, documented service
  interface for many consumers, with its own published model.
- **Generic subdomain** — a solution-domain facility that all contexts use but no
  context's language describes.

## Internal relationships in detail

### 1.3 — Margin ↔ Anchoring

| Aspect | Contract |
|---|---|
| Pattern | Customer/Supplier. Anchoring is the supplier of **Anchor** values and **Resolution state**; the Margin is the customer. |
| Direction | Margin → Anchoring. The Margin stores an Anchor and may hand it back; it never interprets one. |
| Contract | An Anchor is a value: *a Quote, its Quote context, a versioned record of where the Quote sat inside an identified Reply occurrence, and the Reply's identity.* Anchoring alone may build, resolve or replace it. |
| Why the boundary exists | The Transcript's rendering, node identity and text projection are Chat's to change. Anchoring absorbs that churn; the Margin must not change when Chat does. |
| What must not cross | Chat's node keys, DOM attributes, offset projections or resolution ladder appear in **no** Margin document. Margin specs may say "the Anchor no longer resolves"; they never say why in DOM terms. |
| Failure mode if broken | A Margin change becomes a transcript-parsing change; every upstream Chat release can break Highlight storage semantics. |

### 1.4 — Margin ↔ Presentation & Resurfacing

| Aspect | Contract |
|---|---|
| Pattern | Customer/Supplier, one-way. Presentation reads Margin state and asks the Margin to change through its **actions**; the Margin knows nothing of surfaces. |
| Direction | Presentation → Margin (read + act). |
| Contract | Presentation may: derive lists, groups, digests, badges and Resurfacing candidates from Margin data; expose presentation-field edits and State/Intent/Visibility/Star changes; request Capture, Reveal, Insertion, Copy and Delete. Presentation may not: invent a Highlight, change a Quote, decide a Resolution state, or store derived data as fact. |
| Why the boundary exists | The visual language will churn harder than the domain. Every reskin must be a presentation change only. |
| What must not cross | Margin documents must not name a surface, a Colour token or a layout. Presentation documents must not define Highlight semantics they merely display. |
| Edge case the contract fixes | Resurfacing reasons are **derived** by Presentation from Margin facts, but their definitions are domain rules (see §5 of the glossary) — a reason may only claim what the data proves. |

### 1.5 — Margin ↔ Delivery

| Aspect | Contract |
|---|---|
| Pattern | Customer/Supplier. Delivery is a pure consumer of Margin data plus one Presentation-adjacent fact (**Visibility**). |
| Direction | Delivery → Margin (read only). |
| Contract | Delivery may read Quote, identity, State, Session identity and Visibility, and the ordered Highlight list Presentation supplies; it may not write, edit, star, delete or "mark as delivered". A delivery never changes the Margin. |
| Why the boundary exists | Handing text to a composer is a product surface with its own failure modes (busy composer, new Session, expiry). None of them may leak into the Margin's integrity. |
| What must not cross | The Margin must not know about composers, queues, packets or expiry. Delivery must not decide what is private; it reads Visibility as given. |

### 1.6 — Margin ↔ Agent Access

| Aspect | Contract |
|---|---|
| Pattern | Customer/Supplier **under consent**. Agent Access is a consumer whose access is granted per call and never assumed. |
| Direction | Agent Access → Margin, gated by **[Consent]**. The Margin publishes the per-item **Visibility** ceiling; Agent Access enforces the installation-wide **Access level** and **Access scope**. |
| Contract | Agent Access may: list and fetch Highlights visible under Consent; exclude a private Highlight entirely — no content and no disclosure that it exists; create an Agent-authored Highlight **only** from a kept Proposal, through the Reader's ordinary Capture path. It may never: edit, delete, re-anchor, star or transition State of an existing Highlight. |
| Why the boundary exists | Consent is the single place where "the Agent is a guest" is enforced. If the Margin had to know about tools, every Margin operation would need a consent parameter. |
| What must not cross | The Guest rule is stated once (glossary §6) and restated in the Agent Access specs; Margin documents assume it. Model-facing vocabulary (tool names, JSON envelopes, page sizes) never appears in Margin specs. |

### 1.7 — Anchoring ↔ Presentation & Resurfacing

| Aspect | Contract |
|---|---|
| Pattern | Customer/Supplier. Anchoring supplies Resolution state; Presentation renders it and offers Reveal/Re-anchor. |
| Direction | Presentation → Anchoring. |
| Contract | Presentation never computes a Resolution state from the DOM itself; it asks. Presentation may request a Re-anchor only where the Quote still exists in its Reply. |
| Why the boundary exists | One ladder, one owner. Two resolution implementations (one for painting, one for lists) would disagree on screen and in the panel, which is the failure the engineering records already fought. |

### 1.8 — Any context ↔ Persistence & Distribution

| Aspect | Contract |
|---|---|
| Pattern | Generic subdomain, used by all, owned by none. |
| Direction | Every context's actions eventually reach it; no domain context may depend on its details. |
| Contract | Persistence offers: keep this Highlight durably; tell me what is stored; tell me when it changed. It owns durability, versions, Tombstones, purge, caps, transport and freshness — and **no** domain judgement. |
| Deliberate exception | The Host validates the record shape at the boundary before persisting. This is a boundary-validation exception, documented where it lives (Persistence), not a licence for Persistence to own domain rules. |
| What must not cross | No domain document names a route, a file layout, a storage schema version or a transport envelope. No Persistence document defines what a Highlight *means*. |

The Highlight record itself crosses from the Margin into Persistence as **inbound data**.
That is a data contract, not a dependency edge: Persistence may carry, validate and version
the record, and still knows nothing about what a Highlight is for. If a change needs
Persistence to *reason* about a Highlight, the change belongs in the Margin.

## External neighbours (DeepSeek Harness contexts)

These are outside the package. The Margin depends on them; it does not own them, and it
must not redefine their words.

| Neighbour | Direction | Pattern | What the Margin needs | What it must never assume |
|---|---|---|---|---|
| **Conversation / Chat** | Upstream | Conformist + ACL at Anchoring and Presentation | Highlightable Selections and a gesture over them; the identity and rendered text of a Reply; a composer to insert into; a row that can host an assistant action | That a Reply body offers a decoration seat (it does not); that a scroll API exists (it does not); that the Transcript is virtualized (it is not, but the Turn rail and Trajectory table are); that node identity is a public contract rather than a DOM fact |
| **Sessions & history** | Upstream | Conformist, hardened by **Snapshots** | Session identity, workspace binding, opening a Session, paging history back to a target | That a Session still exists; that it is not archived; that its history is loaded; that a fork inherits anything; that a Session title is stable |
| **Workspace & Profile** | Upstream | Conformist | Workspace grouping; the installed bundle composition; deployment configuration fields | That workspace paths are stable; that the plugin may edit the profile |
| **Layout / sidebar** | Upstream | Conformist | A left-nav page slot; a right-panel Session tab; panel and tab open/close | That a panel is visible or mounted when the Reader thinks it is |
| **Agent runtime** | Downstream | **Open Host Service + Published Language** | A way to register tools and a runtime skill; the calling identity and scope of a call | That the tools are visible only to the top-level Agent (registration is global); that the Agent will follow a description; that a tool result is trusted; that a tool set may change between Steps |
| **Trajectory view** | Upstream, **excluded** | — | Nothing | That it can host or paint a Highlight; it exposes neither a highlightable source nor a markdown body seat |
| **Storage facility** | Upstream, generic | Conformist | Durable, versioned, per-record plugin storage | That it offers queries or transactions; it is a document store |
| **Connection / Peer** | Upstream, generic | Conformist | An authenticated channel between the browser half and the Host, with the owner-peer fence | That it provides per-actor authorization; it does not, and the Margin is single-user by design |

Two neighbour facts shape the whole architecture and are worth naming at map level:

- **The transcript is an upstream surface, not ours.** Painting, capture gestures and
  selection affordances are all *over* or *beside* Chat's DOM. This is why the Margin's
  rendering is out-of-band (glossary §8, Presentation specs) and why Anchoring exists at
  all: the plugin's durability cannot rest on a DOM fact.
- **The harness does not carry change events for out-of-tree plugins.** Freshness is
  therefore part of Persistence's published contract (pull-based, with a contract-level seam for push),
  never something a surface invents.

## Dependency rules

Read as: *a document in the row's context may refer to the column's context.*

| From ↓ / May depend on → | Margin | Anchoring | Presentation | Delivery | Agent Access | Persistence |
|---|---|---|---|---|---|---|
| **Margin** | — | Anchor value only | ✗ | ✗ | ✗ | ✗ |
| **Anchoring** | Quote + Reply identity only | — | ✗ | ✗ | ✗ | ✗ |
| **Presentation** | ✓ read + act | ✓ Resolution state | — | ✓ actions | ✓ consent facts | ✗ |
| **Delivery** | ✓ read | ✗ | ✓ Notice channel + ordered Highlights | — | ✓ Visibility | ✗ |
| **Agent Access** | ✓ under consent | ✓ resolution flag | ✗ | ✗ | — | ✗ |
| **Persistence** | ✗ | ✗ | ✗ | ✗ | ✗ | — |

Corollaries that reviewers should enforce:

1. **Dependencies point inward.** Margin names no outer context. Anchoring names no
   surface and no consent concept. The only things Margin may mention about the outside
   world are an opaque Anchor, a Snapshot and its own judgement attributes.
2. **Construction is at the edge.** Opening the store, registering a route, wiring
   surfaces and reading configuration happen in one place per half (`host` and `client`
   entry). Inner modules receive collaborators; they never build them. This is where the
   unavoidable concrete dependencies are confined.
3. **Data crosses boundaries in the inner context's shape.** The store receives a record
   it does not interpret; the transport carries the published record contract; surfaces
   receive projections of Margin data, not storage rows.
4. **A new cross-context dependency needs a row here first.** If a change requires an
   edge the matrix forbids, the change is a map change: update this document, add or
   amend the contract, then implement.

## Cross-context contracts

The published contracts, stated in domain terms. A contract that changes here changes in
every consumer's document in the same change.

| Contract | Owner | Consumers | Stated in domain terms |
|---|---|---|---|
| **Highlight** | Margin | Anchoring, Presentation, Delivery, Agent Access, Persistence | A Highlight has identity, kind (Span or Mark), a Quote, an Anchor, presentation fields, judgement attributes, a version, timestamps and an optional Tombstone. It is the only object that is stored. |
| **Judgement attributes** | Margin | Presentation, Agent Access | Author, Intent, State, Visibility. Absent means the default (user, note, new, agent-visible). Presentation may change them; Agent Access may read them (never write). |
| **Anchor** | Anchoring | Margin (opaque), Presentation (via Resolution state) | A selector over an identified Reply occurrence. Only Anchoring may interpret or replace it. |
| **Resolution state** | Anchoring | Presentation, Agent Access (as an `anchored` flag) | `anchored` \| `unanchored` \| `archived` \| `unavailable`. Never a deletion. |
| **Consent** | Agent Access | Presentation (truthful statements about visibility), Agent surface | Access level, Access scope, per-item Visibility enforcement. The default is off; scope may narrow, never widen. The per-item value is a Margin field that Agent Access enforces. |
| **Proposal** | Agent Access | Presentation (the transcript row that keeps or dismisses) | An un-stored suggestion; Keep produces a Highlight with Author `agent`; Dismiss produces nothing. |
| **Delivery outcome** | Delivery | Presentation (Notices) | `inserted` \| `queued` \| `failed` — what became of one Insertion or Briefing. |
| **Ordered Session Highlights** | Presentation & Resurfacing | Delivery (a Briefing's row order) | The Session's live Highlights in transcript order, as the Session tab derives it. Delivery preserves the order and never derives or reorders it. |
| **Notice** | Presentation & Resurfacing | All contexts (as producers) | One transient outcome message at a time; producers report, Presentation renders. |
| **Record store** | Persistence | Margin through its actions | Durable CRUD with a version-guarded write, a tombstone window, a live-record cap and a monotonic change indicator. No domain judgement. |
| **Freshness** | Persistence | Presentation, Margin actions | How a surface learns about writes it did not make. Pull-based, with a contract-level seam for push. |
| **Deployment configuration** | Persistence & Distribution | Margin (cap, retention), Delivery (attribution), Presentation (poll interval, visibility statements) | Deployment knobs, distinct from Consent, which the Reader owns. |

## Boundary pressure — where the map meets an upstream that will not move

These are the upstream gaps the architecture absorbs. They belong in every context
document's constraints, because they explain why a context is shaped the way it is.

| Pressure | Upstream reality | Absorbed by |
|---|---|---|
| No decoration seat inside a Reply body | Chat exposes no slot in assistant markdown | Presentation: out-of-band painting; the transcript tree is untouched |
| No scroll API | Only session opening and history paging are public | Presentation, under Anchoring's Reveal contract: plugin-owned scroll, best-effort Reveal |
| No forwarded change event out-of-tree | No `changed` push for plugin data | Persistence: pull-based freshness with an explicit freshness window |
| No stable identity on every Reply | Message ids are not always reachable; node identity is a DOM fact | Anchoring: quote-and-context selectors, best-effort resolution |
| Chat owns the selection affordance | Only one plugin registers into it; Quote registers first | Presentation: the plugin owns its own gesture and bar; the two must not fight |
| No typed RPC out-of-tree | Generic remote is unavailable to out-of-tree bundles | Persistence: the plugin's own authenticated route, envelope-typed |
| No document export or sync | Nothing beyond local storage ships | Persistence: Snapshot/Origin/version/Tombstone already make the schema sync-ready; the seam is the store contract |
| The Trajectory view is a table with no markdown seat | Cannot host highlights | Scope, not architecture: Trajectory is excluded from the domain |

## Deferred decisions and the seam that keeps each one open

Deferring is intentional. Each row names the decision not made, and the contract that
lets it be made later without rewriting inner code.

| Deferred decision | Seam |
|---|---|
| Transport mechanism (own route vs harness-typed remote) | The store contract: domain actions are transport-agnostic; Persistence owns the adapter |
| Push vs pull freshness | The freshness contract: surfaces subscribe to "records changed", not to a mechanism |
| Storage engine and layout | The record-store contract: layout is a Persistence decision behind durable CRUD |
| Cross-device sync and export | Snapshot, Origin, version and Tombstone in the Highlight contract; no domain change needed |
| Where Re-anchor is offered to the Reader | The Re-anchor operation exists in Anchoring; the surface is undecided |
| Insertion into another *existing* Session | The destination model in Delivery, with Pending insertion as the seam; the current specification scopes destinations to current and new Session |
| Whether the Agent may ever do more than propose | The Guest rule in Agent Access; today it is a hard boundary, not a setting |
| A second palette or user-defined colours | The Colour slot contract in Margin; intentionally five fixed slots |
| Whether a Mark and a Span may coexist on one Reply | The Margin's kind contract: today one Mark per Reply, any number of Spans |
| Whether uninstalling the plugin revokes stored Consent | Uninstall is data-preserving: the store, including the consent record, survives and a reinstall reads it. Changing that is a privacy decision owned by Agent Access, not a packaging change. |

## Change protocol

1. A change inside one context updates that context's `CONTEXT.md` and its specs.
2. A change to a published contract updates **this map**, then every consumer's
   document in the same change; the contract table above is the checklist.
3. A new boundary, or a dependency the matrix forbids, is a map change first: add the
   edge, its pattern, its contract and its failure mode, then write the spec.
4. The vocabulary is not negotiable per document: if a needed term is missing or wrong,
   it changes in [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md) first, then here.
