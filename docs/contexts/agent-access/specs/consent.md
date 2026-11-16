# Consent
**Status:** Accepted
**Context:** Agent Access
**Date:** 2026-11-15

## Definitions

| Term | Meaning in this specification |
|---|---|
| **Consent** | The Reader's grant that makes part of the Margin Agent-readable. It has three parts: an **Access level**, an **Access scope** and per-Highlight **Visibility**. The default is `off` with scope `session`: nothing is readable and no Agent surface exists. |
| **Access level** | The installation-wide permission: `off` (no model-facing surface at all), `read` (the Agent may list and fetch), `read-write` (it may additionally propose). |
| **Access scope** | The widest range the Agent may read: `session` (the calling Session), `workspace` (the calling Session's workspace), or `all` (every Session). A call may narrow the scope; nothing may widen it. |
| **Visibility** | The per-Highlight ceiling stored by the Margin: `agent` (no per-item restriction; the default) or `private` (never returned to the Agent at all, so its Note never crosses and its existence is not
  disclosed). Consent can always be narrower than the installation-wide grant, never wider. |
| **Calling identity** | The identity the Agent runtime attaches to one call. It is used only to intersect Access scope with the Session and workspace the call comes from. It is not a Reader identity and grants nothing on its own. |
| **Deployment configuration** | The operator-facing knobs a deployment sets, such as a record cap, a retention window or an attribution default. Distinct from Consent: the Reader owns Consent, a deployment owns its knobs, and neither may be presented as the other. |
| **Withdrawal** | The Reader reducing or removing Consent: lowering the Access level, narrowing the Access scope, or marking a Highlight `private`. A withdrawal takes effect at the next execution. |

The vocabulary above is the glossary's; this specification adds no new sense to any of it.
See [UBIQUITOUS_LANGUAGE.md §6](../../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface)
and the relationship contract for this context in [CONTEXT_MAP.md](../../../CONTEXT_MAP.md).

## Constraints

1. The Access level is one of `off`, `read`, `read-write`; the default is `off`. There
   are no other levels, and no per-Session level exists.
2. The Access scope is one of `session`, `workspace`, `all`; the default is `session`.
3. Visibility is one of `agent`, `private`; the default is `agent` and it applies when a
   Highlight carries none.
4. Consent is Reader-owned, stored by the plugin and read by the Host that enforces it. No other
   party may change it, and no surface may infer a grant that was not stored.
5. The three parts compose. Effective access is the intersection of Access level, Access scope,
   Visibility and calling identity, and a call is answered against that intersection rather than
   against any single part.
6. Access scope only narrows. A call that asks for a range wider than the stored scope is served
   at the stored scope; a call that asks for a narrower range is served at that range.
7. An Access scope narrower than `all` needs a calling identity. Without one the call is refused;
   the only range servable without an identity is `all`.
8. A Highlight whose Visibility is `private` is never returned at all, its Note is never returned
   through any Agent surface. Notes are never listed and never searched, whatever the Visibility.
9. Consent is re-checked at every execution. A withdrawal is effective at the next call even when
   the registered surface has not been reconciled.
10. Registration is one deliberate change per Consent change: `off` removes the whole surface,
    `read` presents the read pair and the runtime skill, and `read-write` adds the proposal
    operation only. Tool visibility never changes between Steps.
11. While the Access level is `off`, the Access scope stays at its default. There is no latent
    grant waiting behind the switch.
12. A surface that states what the Agent can see states the stored Consent and no more. When the
    current Consent cannot be read, it states the default `off` rather than a guess.
13. Deployment configuration is not Consent and cannot grant or widen it. Changing a deployment
    knob changes no read, no scope and no Access level.
14. A Consent change made against a stale view of Consent is refused, and the surface continues to
    show stored Consent rather than the attempted value.
15. A Consent change takes effect at the Host's next evaluation and needs no restart: the Host
    reconciles the Agent surface as one deliberate change. A deployment configuration change, by
    contrast, takes effect at the next activation.
16. Stored Consent belongs to the plugin's durable store, not to the installation. It survives uninstall and
    reinstall, and a reinstall reads the stored Consent rather than the default.

## Problem

The Margin holds the Reader's most sensitive text, including Notes up to two thousand
characters, in a store outside the Session log precisely so that it is not model material. An
Agent surface is the one thing that can turn that store into model input, and it is model-facing:
once registered, the Reader cannot see it, and the Agent runtime registers tools globally, so
every caller the harness exposes inherits whatever is registered. A single on/off switch would
force the Reader to choose between exposing everything and exposing nothing, and would answer
none of the questions that matter in practice — how wide, which Session, and what about this one
sensitive Note. It would also invite two failures the domain forbids: a grant that silently
widens when a call asks for more, and a revocation that hides a surface while something still
answers for the old grant.

## Solution

Consent is three permissions, each able to narrow the one above it, and none able to widen it.
The installation-wide **Access level** decides whether any Agent surface exists. The **Access
scope** decides the widest range the Agent may read. Per-Highlight **Visibility** is the last
ceiling: a private Highlight never crosses. A **calling identity** is not a permission but an
input to the composition, used only to keep a `session` or `workspace` range honest.

The defaults are the permission with no grant: `off`, `session`, `agent`. Every one of the three
can be narrower than its default and none can be broader than the Reader chose. The composition
happens inside one gate, at execution, so a surface that lags behind a withdrawal cannot serve
the old grant. Registration is a deliberate event rather than a per-call query, so the model's
tool set never flickers between Steps. Finally, the same stored Consent is the only source of
the visibility facts surfaces state, so what a surface tells the Reader cannot disagree with what
the gate enforces.

Where two parts could disagree, the narrower always wins: a narrower scope or a private Highlight
narrows the result, and nothing overrides a ceiling upwards. This is the Guest rule in its
enforcement form: the Agent reads only what Consent exposes, only when it asks, and writes only
proposals the Reader may keep.

## User Stories

- As the Reader, I want the Agent to be unable to reach the Margin until I say so, so that saving
  a Highlight never makes it model-visible by itself.
- As the Reader, I want a grant that is exactly as wide as I chose, so that a tool call cannot
  turn a narrow grant into a broad one.
- As the Reader, I want to mark one sensitive Highlight private, so that I can keep a Note I
  would not want the Agent to read.
- As the Reader, I want turning access off to remove the surface, so that revocation is a real
  removal rather than a hidden switch.
- As the Reader, I want every surface that mentions visibility to tell me the truth, so that I
  never have to guess whether my Highlights are visible.
- As the Agent, I want a clear refusal that names its reason, so that I do not retry a call the
  Reader has not granted.
- As the operator, I want deployment configuration to stay separate from the Reader's grant, so
  that changing a limit is never mistaken for a permission change.

## Acceptance Criteria

**AC-1 — Defaults.** Given a fresh installation, When a surface first reads Consent, Then the
Access level is `off`, the Access scope is `session`, and every Highlight's Visibility is
`agent`.

**AC-2 — No surface while off.** Given Access level `off`, When the Agent runtime assembles a
request, Then no tool, no runtime skill and no model-facing text from the plugin exist.

**AC-3 — Attempt to widen the scope.** Given Access scope `session`, When a call asks for
`workspace` or `all`, Then the call is served at `session` and never at the requested range.

**AC-4 — Narrow the scope for one call.** Given Access scope `workspace`, When a call asks for
`session`, Then only the calling Session's Highlights are returned.

**AC-5 — No identity, narrow scope.** Given a stored Access scope `session` and a call with no
available calling identity, When the call executes, Then it is refused with a reason and returns
no Highlight.

**AC-6 — No identity, widest scope.** Given a stored Access scope `all` and a call with no
available calling identity, When the call executes, Then it may read, and it reads no more than
`all`.

**AC-7 — Revocation mid-session.** Given a tool registered while Access level was `read` and the
Reader has since turned access off, When that tool executes, Then the call is refused and returns
no Highlight.

**AC-8 — The surface is removed as one change.** Given Access level `read-write`, When the Reader
turns access off, Then the tools and the runtime skill are removed together and no partial
surface remains.

**AC-9 — Adding the propose tier.** Given Access level `read`, When the Reader changes the level
to `read-write`, Then the proposal operation is added and the read pair is unchanged.

**AC-10 — Private Highlight ceiling.** Given a Highlight whose Visibility is `private` and which
has a Note, When the Agent calls any read operation, Then the Highlight is not returned and its
Note never crosses.

**AC-11 — Truthful surface while off.** Given Access level `off`, When a surface that mentions
model visibility is shown, Then it says that the Agent cannot see the Highlights.

**AC-12 — Truthful surface when Consent is unknown.** Given a browser half that cannot read the
current Access level, When it renders the visibility statement, Then it reports the shipped
default `off` and not a wider state.

**AC-13 — Deployment configuration is separate.** Given a deployment changes its record cap or
its retention window, When the Reader next reads Consent, Then the Access level, the Access scope
and every Visibility are unchanged.

**AC-14 — Scope held at default while off.** Given Access level `off`, When a change tries to set
the Access scope to `workspace`, Then the change is refused and the stored Access scope remains
`session`.

**AC-15 — Incomplete identity for a range.** Given Access scope `workspace` and a call whose
workspace identity is unavailable, When the call executes, Then the effective scope narrows to
the calling Session and never widens.

**AC-16 — Refused Consent write.** Given another change landed while the Reader was editing,
When the Reader's stale Consent change is submitted, Then it is refused and the surface shows the
stored Consent.

**AC-17 — No restart is needed.** Given a running Host, When the Reader changes any part of
Consent, Then the change takes effect at the Host's next evaluation and no restart is required.

**AC-18 — Consent survives reinstall.** Given Consent was granted and the plugin is uninstalled
and reinstalled, When the Agent surface is next evaluated, Then the stored Consent is applied and
not the default.

## Implementation Decisions

- **One Consent gate.** A single deep module composes Access level, Access scope, Visibility and
  calling identity and returns a decision with a refusal reason. Surfaces receive a yes or no and
  never the policy matrix, so there is one place to audit for privacy failures.
- **One stored setting.** Consent lives in a setting the plugin owns, not in deployment
  configuration and not in the profile. The Reader-facing page changes it through the plugin's own
  durable storage, and a change made against a stale view is refused rather than applied.
- **Reconciliation on change, not per call.** The Agent surface is registered and removed when
  Consent changes and at activation. The read pair is registered together as one surface, the
  proposal operation is a separate registration, and the runtime skill follows the same switch.
- **Execution-time re-check.** Every tool body re-reads the stored Consent once before doing
  anything else. Refusal does not depend on registration having caught up, and it never leaks
  whether a withheld Highlight exists.
- **One source for the truth surfaces state.** The Access level a surface displays and the level
  the gate enforces are the same stored value. An unreadable value falls back to `off`, which is
  the safe direction in both enforcement and statement.
- **Consent is not a deployment fact.** A Consent change is applied at the Host's next evaluation
  without a restart, because it is Reader-owned state rather than configuration. A deployment
  configuration change is applied at the next activation. The two are never presented as one.
- **Consent outlives the installation.** The stored grant is part of the plugin's durable data, so
  uninstalling and reinstalling does not silently return the Reader to the default; a
  reinstall reads the stored Consent and the surfaces state it.
- **No latent scope.** While the level is `off`, the scope cannot be moved away from its default
  and the Reader-facing range control is unavailable. Turning access on always begins at the
  narrowest range.
- **Defaults as values, not absences.** The absence of a stored Visibility reads as `agent`, the
  absence of a stored level reads as `off`, and the absence of a stored scope reads as `session`.
  No document or surface may describe an absent value as an unknown state with wider reach.

### Deferred Decisions

| Decision not made | Seam that keeps it open |
|---|---|
| Where the Reader marks a Highlight `private` | Visibility is already a Margin judgement attribute; the surface that edits it belongs to [Presentation & Resurfacing](../../presentation/CONTEXT.md), so the capability is not blocked here. |
| Whether Consent may be granted to one caller rather than every caller the runtime exposes | The gate already composes a calling identity, so a finer grant is a policy change behind the same contract rather than a new surface. |
| Whether the scope vocabulary gains a finer range than a workspace | Access scope is a closed set of three named ranges; a fourth would be a published-contract change, not a tool change. |
| Whether a grant can expire or be made for a period | A grant is a stored value; expiry would add a field plus a rule for what a surface states at expiry. |
| Whether the Reader can preview exactly what the Agent could read now | The gate is the single source of that answer; a preview surface would read the same facts and belong to Presentation. |
| Whether consent wording should explain subagents and Team members | The runtime's global registration is an upstream limitation; the identity intersection is the enforcement point, and its presentation is a copy decision. |

## Testing Strategy

The composition is tested as a matrix rather than case by case: every combination of Access
level, Access scope, Visibility and calling identity states its expected outcome — served,
narrowed or refused — and the test asserts the outcome, not the implementation of the gate.

Revocation is tested as a race: a surface registered under an older grant is executed after the
grant is withdrawn, and the result must be a refusal with no Highlight content. Reconciliation is
tested as a state change: each level transition asserts which parts of the surface exist before
and after, and that no partial surface survives.

The private ceiling is tested by marking a Highlight private while it carries a Note and asserting
that no read path returns either the Highlight or the Note. Truthfulness is tested by rendering
every surface that mentions model visibility at every Access level, including the case where the
level cannot be read, and comparing each statement with what the gate actually enforces.

Scope behaviour is tested at the boundaries: a widening request, a narrowing request, a request
without identity at a narrow scope, a request without identity at `all`, and a `workspace`
request whose workspace identity is missing. Deployment configuration is tested by changing a
deployment knob and asserting that Consent is unmoved.

## Out of Scope

- The Reader-facing surfaces that edit Consent and per-Highlight Visibility; their layout, copy and
  interaction belong to [Presentation & Resurfacing](../../presentation/CONTEXT.md).
- The durability, transport and freshness of the stored Consent; those belong to
  [Persistence & Distribution](../../persistence/CONTEXT.md).
- Excluding private Highlights from a Briefing or an Insertion; Delivery reads Visibility as given.
- The concrete wording of the runtime skill and tool descriptions, except for the rule that they
  state the Guest rule and the untrusted-content contract.
- Authentication of the Reader and per-peer authorisation, which are harness concerns: the Margin
  is local and single-user by design.

## Open Questions

None outstanding. The six questions this specification raised are resolved:

1. **Visibility semantics.** A `private` Highlight is never returned, by any read operation, and its
   existence is not disclosed; its Note is never readable. The package README and the implementation
   record describe the weaker Note-only reading; the intent documents lead and the engineering
   record is to be corrected.
2. **The label for `read-write`.** Documentation names the level `read-write` and defines it as
   read-and-propose. Reader-facing copy reading "Read and annotate" overstates the grant and is a
   copy defect; the glossary records the collision so no document repeats it.
3. **The default scope.** `session` is the default for every calling context. An unavailable calling
   identity does not shift the default: such a call is refused unless the stored scope is already
   `all`. There is no per-caller default.
4. **Callers other than the top-level Agent.** They are treated as the Agent: the same gate, the
   same composition and the same identity check apply. The global registration that makes them see
   the tools is an upstream fact recorded in the engineering records; it adds no exception here.
5. **Failed Consent writes.** Truthfully displaying the stored Consent is the contract. A transient
   Notice is optional presentation feedback, not a Consent requirement.
6. **Deployment-authored consent wording.** No deployment statement may be presented as the Reader's
   Consent. A deployment may document its policy, but a surface may only state the stored Consent.
