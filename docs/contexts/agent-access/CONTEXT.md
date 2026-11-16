# Agent Access
**Classification:** Supporting · **Owns:** the Consent contract (Access level, Access scope and
per-Highlight Visibility enforcement), the Agent surface and its published language, and the
Proposal lifecycle · **Map:** [CONTEXT_MAP](../../CONTEXT_MAP.md)

Agent Access admits the Agent to the Margin on the Reader's terms. The Agent reads only what
Consent exposes, only when it asks, and writes only proposals the Reader may keep. The context
exists so the Reader can hand the margin forward to the model without turning it into the
model's memory: nothing from the Margin is placed in a request, and nothing reaches the Agent
except through a call the Reader can narrow or revoke.

## Owns

- **Consent** as a composed grant: the installation-wide **Access level**, the **Access scope**
  that is the widest readable range, and per-Highlight **Visibility** enforcement.
- The lifecycle of the **Agent surface**: what exists at each Access level, when it is
  registered, when it is removed, and the execution-time re-check that makes a withdrawal
  effective.
- The model-facing published language: per-tool descriptions that carry each operation's
  semantics, and one runtime skill that carries only the cross-call workflow.
- The **Proposal** lifecycle and its two Reader verbs, **Keep** and **Dismiss**, including what
  Keep writes, whose judgement the result carries, and the guarantee that Dismiss leaves nothing.
- The consent facts a surface needs in order to state the truth about model visibility.

## Does not own

- The **Highlight**, its fields and its lifecycle. **Visibility** in particular is a judgement
  attribute the Margin stores; this context reads it as a ceiling and never writes it.
- Reader-facing surfaces. The page that edits Consent, the row that shows a Proposal, the
  selection bar, the Item card and every list belong to
  [Presentation & Resurfacing](../presentation/CONTEXT.md). This context supplies facts and a
  decision, never layout or copy.
- The Briefing and every Insertion. Excluding private Highlights from a Briefing is Delivery's
  obligation; it reads Visibility as given.
- Durability, transport, freshness and deployment configuration, all owned by
  [Persistence & Distribution](../persistence/CONTEXT.md).
- The model's prompt, behaviour or evaluation, and the Agent runtime's registration facility.
  The runtime is an upstream service; this context only supplies a published interface to it.

## Terms this context owns

The rulings are the glossary's. This table records which terms the context is answerable for;
where a term is shared, the owner is named.

| Term | Ruling this context is answerable for | Glossary |
|---|---|---|
| **Consent** | The Reader's grant, composed of Access level, Access scope and per-Highlight Visibility. It is Reader-owned, stored by the plugin, read by the Host that enforces it, and off by default. | [§6](../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface) |
| **Access level** | `off`, `read` or `read-write`. `off` means no Agent surface exists at all; `read` means the Agent may list and fetch; `read-write` means it may additionally propose. There are no other levels. | [§6](../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface) |
| **Access scope** | The widest range the Agent may read: the calling Session, its workspace, or all Sessions. A call narrows; nothing widens. | [§6](../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface) |
| **Proposal** | An Agent-suggested Highlight awaiting the Reader's decision. A Proposal is not a Highlight, has no identity in the Margin, and stores nothing. | [§6](../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface) |
| **Agent surface** | What the Agent sees when Consent allows it: a read pair (a paged list and a single fetch), the proposal operation at `read-write`, and one runtime skill. It is a tool surface, never a prompt section. | [§6](../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface) |
| **Guest rule** | The one-sentence contract of this context; every spec restates it and no surface may weaken it. | [§6](../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface) |
| **Visibility** | Owned by the Margin as a judgement attribute. This context enforces it as the per-Highlight ceiling under Consent: `agent` (no per-item restriction; default) or `private` (never returned at all, so its Note never crosses and its existence is not disclosed). | [§2](../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects) |
| **Keep / Dismiss** | The two Reader verbs that resolve a Proposal. Keep accepts it and creates an Agent-authored Highlight through the ordinary Capture path; Dismiss rejects it and leaves nothing. | [§5](../../UBIQUITOUS_LANGUAGE.md#5-judgement-and-resurfacing) |

## Invariants

1. Consent starts at Access level `off`, Access scope `session` and Visibility `agent` for every
   Highlight. There is no state in which a Highlight is Agent-readable before the Reader acts.
2. With Access level `off`, no Agent surface exists: no tool, no runtime skill, no prompt
   section, no model-facing text and no added cost to a request.
3. No Highlight content is injected into a model request. The Agent reads the Margin only by
   calling a tool, and a turn that ignores the Margin costs nothing beyond the surface's fixed
   operation descriptions and skill line.
4. Every call is answered against the composition of Access level, Access scope, Visibility and
   calling identity; where two parts disagree, the narrower wins. The composition is evaluated when
   the call executes, not when the surface was registered.
5. A call may narrow Access scope and may never widen it. An omitted scope is served at the
   narrowest usable range.
6. The list never returns a Note and never searches Notes. The single fetch returns a Note only
   when the Highlight is not private.
7. A `private` Highlight is never returned to the Agent at all: no read operation returns it, its
   Note never crosses, and nothing discloses that it exists.
8. A call without an available calling identity is refused rather than widened; the only range
   servable without an identity is `all`.
9. Every Proposal is un-stored. At most three Proposals are accepted per call, and each names a
   verbatim Quote. Keep creates exactly one Agent-authored Highlight through ordinary Capture;
   Dismiss creates, edits and deletes nothing.
10. The Agent surface exposes no operation that edits, deletes, re-anchors, stars or transitions
    the State of an existing Highlight.
11. Read results are bounded: a page defaults to ten rows and never exceeds twenty, and a list
    row carries an excerpt rather than the full Quote.
12. Every returned user-authored string is presented as untrusted display content: data to read,
    never instructions and never new user input.
13. Revocation is one deliberate change: `off` removes tools and skill together; adding the
    write tier adds the proposal operation and leaves the read pair untouched. Tool visibility
    never changes between Steps.
14. A surface that states model visibility states no more than the stored Consent; when Consent
    cannot be read, it states the default `off`.
15. Deployment configuration is never Consent: a change to a deployment knob grants no read, no
    scope and no Visibility, and may not be presented as a permission.

## Published contracts

| Contract | Consumer | Stated in domain terms |
|---|---|---|
| **Consent** | [Presentation & Resurfacing](../presentation/CONTEXT.md) (truthful statements), the Agent surface itself | Consent is the Reader's grant of an Access level, an Access scope and per-Highlight Visibility. It is Reader-owned, off by default, stored by the plugin and enforced by the Host. Every read and every proposal is answered against it at execution. Deployment configuration is not Consent. |
| **Agent surface** (published language) | The Agent runtime (Open Host Service + Published Language) | At `read`, a paged list and a single fetch, with one runtime skill teaching the cross-call workflow. At `read-write`, one additional operation that accepts Proposals only. Per-operation semantics live in that operation's description; the skill carries the cross-call workflow and no operation definition. |
| **Proposal** | [Presentation & Resurfacing](../presentation/CONTEXT.md) (the transcript row that keeps or dismisses) | A Proposal is an un-stored suggestion: a verbatim Quote plus an optional Note, Tags, Colour and Intent. Keep produces an Agent-authored Highlight through ordinary Capture; Dismiss produces nothing. A Proposal is not a Highlight and is never listed. |
| **Consent facts** | [Presentation & Resurfacing](../presentation/CONTEXT.md) | The current Access level, so a surface can state what the Agent can see without guessing. When the fact is unavailable, the default `off` is reported. |

## Consumed contracts

| Contract | Provider | What this context needs |
|---|---|---|
| **Highlight** (read subset) | [Margin](../margin/CONTEXT.md) | Identity, Quote, Colour, Tags, Note, Star, Author, State, Visibility, Session title and age, as the read projections require. |
| **Judgement attributes** | [Margin](../margin/CONTEXT.md) | Author, Intent, State and Visibility as stored. This context reads them and never writes them. |
| **Resolution state as a flag** | [Anchoring](../anchoring/CONTEXT.md) | Whether a stored Anchor is structurally resolvable, reported to the Agent as whether the Highlight is anchored. It is a report, never a claim that the passage is on screen. |
| **Capture** (ordinary path) | [Margin](../margin/CONTEXT.md) with [Anchoring](../anchoring/CONTEXT.md) | A kept Proposal becomes a Highlight only through the Reader's ordinary Capture path, which resolves the Quote to an Anchor in the rendered Reply. |
| **Consent durability** | [Persistence & Distribution](../persistence/CONTEXT.md) | The Reader's grant survives reload and a failed Consent change is reported as a failed change, never as a silent grant. |
| **Agent runtime** (Open Host Service) | The Agent runtime (external) | A way to register tools and one runtime skill, and the calling identity and range of one call. The runtime cannot restrict registration per caller, so this context composes the identity itself. |

## Primary flows

**The Reader changes Consent.** The Reader chooses an Access level, an Access scope or one
Highlight's Visibility on a Reader-facing surface. The plugin stores the change, and the Host
reconciles the Agent surface once. Every subsequent call is answered against the stored value.

**The Agent reads.** The Agent calls the paged list with an optional scope, State, Author, Tags,
Star and query. The Host answers at the intersection of the stored Consent and the call's own
narrower range, filters the Margin, returns one bounded page of rows with excerpts, and labels
every user string as untrusted display content. When one item matters, the Agent calls the
single fetch and receives the full Quote, its Quote context and, unless the Highlight is private,
its Note.

**The Agent proposes.** At `read-write`, the Agent submits up to three Proposals. The Host
normalises each to the Margin's rules and returns them; nothing is stored. The transcript row
shows each Quote verbatim with a Keep and a Dismiss action. Keep runs the Reader's ordinary
Capture, which resolves the Quote to an Anchor and writes one Highlight with Author `agent`;
Dismiss leaves the Margin untouched.

**The Reader withdraws.** The Reader turns access off or narrows the scope or marks a Highlight
private. The Host removes or reconciles the surface as one deliberate change, and the
execution-time re-check means a call that was registered before the withdrawal is still refused.

**A surface states visibility.** A surface asks the Host for the current Access level and states
what the Agent can see, including the fact that it can see nothing.

## Degradation and failure modes

- **Registration lags a withdrawal.** A tool captured before the withdrawal still refuses when
  it executes, because the gate re-reads Consent at execution. The surface converges to the
  stored value on the next reconciliation.
- **No calling identity.** A call without one is refused with a reason; the only range that can
  be served is `all`. A refusal never returns a row, and it never widens the range to fill a page.
- **Incomplete identity for a range.** When the calling identity lacks the workspace a
  `workspace` scope needs, the effective scope narrows to the calling Session rather than
  guessing a workspace.
- **A private Highlight.** It is withheld from every read and its Note never crosses. A call
  that asks for it learns nothing about whether it exists beyond what a missing Highlight would
  tell it.
- **A page larger than the cap.** The request is served at the cap; a caller never receives more
  rows than the bound allows.
- **A Proposal whose Quote cannot be located.** If the verbatim Quote no longer exists in the
  rendered Reply, Keep creates nothing and reports honestly that the passage cannot be found.
  No partial Highlight and no fallback Anchor is invented.
- **Consent cannot be read.** The surface states the default `off` and the gate refuses
  rather than assuming a grant.
- **A Consent write is refused.** The controls keep showing stored Consent; the surface does not
  present an unsaved grant as effective.
- **The anchored flag is structural.** It reports whether the stored Anchor is structurally
  resolvable, not whether the passage resolves on screen; no document may treat it as a liveness
  claim.
- **Untrusted text that reads like an instruction.** A Quote, Note, Tag or Session title that
  contains instruction-like text stays a labelled string in the result; the Agent is told, in
  the result and in the skill, that returned text is data.

## Boundary rules — what this context may know / must not know

**This context may know:** the glossary's Margin, Consent and Highlight vocabulary; the calling
identity of a call; the Access level, Access scope and Visibility; the read projections it
returns; the caps; the Keep and Dismiss contracts; and the current Access level as a fact to
publish to surfaces.

**This context must not know:** how a surface is laid out, ordered or worded; anything about
Insertion, Briefing, composers or pending deliveries; the record store's layout, transport or
freshness model; how an Anchor is resolved or why it fails; a Reader's data beyond the read
projections; the model's prompt, context or internal behaviour; or how a deployment is
configured beyond the fact that deployment configuration is not Consent.

## Deferred decisions

| Decision not made | Seam that keeps it open |
|---|---|
| Whether the Agent may ever do more than propose | The Guest rule is a hard boundary, not a setting. Any widening is a separately specified contract, not a switch. |
| Where the Reader marks a Highlight `private` | Visibility is already a Margin judgement attribute; the surface that edits it belongs to Presentation, so the capability is not blocked here. |
| Whether Consent may be granted to one caller rather than every caller the runtime exposes | The gate already composes a calling identity; a finer grant is a policy change behind the same contract. |
| Whether the read pair ever answers aggregate questions instead of bounded pages | The bounded page contract is the seam: an aggregate would be a new published operation with its own limits. |
| Whether a Proposal may outlive the transcript row that shows it | There is no durable Proposal store, so nothing has to be migrated if proposals later acquire one. |
| Whether an Agent-authored Highlight is marked differently from a Reader-authored one in the Margin | Author already carries `agent` and Provenance already records the kept-Proposal route; no new field is required. |
| Whether the propose tier should be offered without the read tier | Access level is a strict order; a read-free proposal tier would be a new level with its own consent wording. |

## Documentation index

**Specifications**

- [Consent](specs/consent.md) — the three permissions, how they compose, the defaults, revocation
  and the truthful statements surfaces owe the Reader.
- [The Agent surface](specs/agent-surface.md) — what exists at each Access level, the read pair's
  projection, paging, filters and the untrusted-content contract.
- [Proposals](specs/proposals.md) — the proposal operation, the per-call and length caps, Keep,
  Dismiss and the guarantee that nothing is stored until the Reader keeps it.

**Decision records**

- [ADR-001 — Consent is off by default](adrs/001-consent-is-off-by-default.md)
- [ADR-002 — The Agent reads only by calling tools](
  adrs/002-the-agent-reads-only-by-calling-tools.md)
- [ADR-003 — Proposals never persist](adrs/003-proposals-never-persist.md)

## Where the implementation record lives

The implementation record for this context is kept in
[known-limitations.md](../../known-limitations.md) and
[implementation-notes.md](../../implementation-notes.md).
