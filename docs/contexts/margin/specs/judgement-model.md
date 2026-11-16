# Judgement model

**Status:** Accepted
**Context:** Margin
**Date:** 2026-11-15

## Definitions

Terms used in their glossary sense are not redefined here; see the
[glossary](../../../UBIQUITOUS_LANGUAGE.md). This specification belongs to the
[Margin context](../CONTEXT.md), whose boundaries are mapped in
[CONTEXT_MAP](../../../CONTEXT_MAP.md).

| Term | Meaning |
|---|---|
| **Judged Highlight** | A Highlight whose Author, Intent, State or Visibility has been set explicitly; a Highlight that has never been judged carries no judgement state and reads as its defaults. |
| **Advancing State** | Setting the next value on the `new` → `kept` → `compiled` ladder by explicit Reader action. |
| **Stepping back** | Setting a lower State value, including `compiled` back to `new`, by explicit Reader action. |
| **Withholding** | The rule that a `private` Highlight is never returned to the Agent and its Note never crosses; Agent Access enforces it, the Margin states the ceiling it rests on. |
| **Capture route** | The path that produced a Highlight: a direct save or a kept Proposal. The route, with Author, is the Highlight's Provenance. |

## Constraints

1. Author is exactly `user` or `agent`, and it is fixed at capture. A direct save stamps
   `user`; a kept Proposal stamps `agent`. There is no operation that reassigns Author and no
   capture path that produces `agent` without a kept Proposal.
2. Intent is exactly one of `note`, `dispute`, `direct` or `remember`, with `note` as the
   default. The four mean: an observation worth keeping; a disagreement with or correction of
   the Reply; an instruction the Agent should carry forward; a fact worth retaining. Intent is
   a closed set and never free text.
3. State is exactly one of `new`, `kept` or `compiled`, with `new` as the default. `new` means
   captured and still unjudged, `kept` means the Reader has decided it matters, and `compiled`
   means it made it into something the Reader produced.
4. State changes only by explicit Reader action. It is never derived from reading, starring,
   copying, delivering, resurfacing or any other activity, and no count, badge or reason may
   attribute a State the Reader did not set.
5. The ladder is an ordering, not a one-way door. The Reader may step back to a lower State,
   and no State is terminal; `compiled` locks neither the presentation fields nor the other
   judgement attributes.
6. Visibility is exactly `agent` or `private`, with `agent` as the default. `agent` places no
   per-item restriction on access; `private` means the Highlight is never returned to the
   Agent at all, so its Note never crosses and its existence is not disclosed. Visibility is a
   per-item ceiling beneath the installation Consent: it can always narrow that Consent and
   can never widen it.
7. Visibility may be changed at any time and affects nothing else; changing it never changes
   the Quote, the presentation fields, the other judgement attributes or ownership.
8. Only the Reader changes judgement attributes. The Agent may read them where Consent allows
   and may propose new Highlights; it may never edit, star, delete, transition or re-judge an
   existing Highlight.
9. Provenance is Author plus the capture route, carried as a property of the Highlight. It is
   never a separate object, never editable, and never inferred at read time from the Agent's
   behaviour.
10. Defaults resolve an absent value: `user`, `note`, `new`, `agent`. A Highlight stored
    without a judgement attribute reads as its default and behaves as if the default had been
    written.

## Problem

"Highlighted" is not one act. A Reader marks a paragraph because it needs checking, because it
is wrong, because it is an instruction to carry forward, or because it is a fact to keep — and
the difference matters most when the Highlight is handed to the Agent or returned to months
later. The same Highlight also has to answer three separate questions that are easy to confuse:
who is making the judgement, how far the Reader has processed it, and what the Agent is
allowed to see. If those collapse into surfaces and habits, counts start claiming progress the
Reader never made, the Agent's kept Proposals become indistinguishable from the Reader's own
judgements, and a per-item privacy setting gets treated as if it could grant access rather
than withhold it. The model exists to keep the four attributes separate, explicit and owned by
the Reader.

## Solution

Author, Intent, State and Visibility are four independent fields with four independent jobs,
and each has exactly one legal route to change. Author is decided by the capture route and
then frozen, so provenance is structural rather than a label. Intent is a closed set of four
speech acts the Reader may choose, defaulted to `note`, so the Agent can tell an observation
from a correction without guessing from prose. State is a Reader-controlled ladder recording
how far the Reader has processed the Highlight, never a measurement of activity, so every count
built on it is a count of decisions rather than of use. Visibility is a per-item narrowing of
the installation Consent, so privacy is a ceiling rather than a switch.

The model also fixes what does not change. Judgement never touches the Quote, identity, kind or
owning Session; a judgement change is a version-guarded write like any other; and a lost race
is refused rather than merged. Provenance is nothing more than Author plus the route that
produced it, so there is no second object to keep in step and no way to launder the Agent's
judgement into the Reader's.

## User Stories

- As a Reader, I want to say what kind of judgement a Highlight carries, so that a correction
  and an instruction are not read as the same thing.
- As a Reader, I want the processing State to record only what I have decided, so that a count
  of `kept` Highlights means exactly that and nothing more.
- As a Reader, I want to make a Highlight private without switching the Agent off entirely, so
  that privacy can be fine-grained without becoming an all-or-nothing setting.
- As a Reader, I want the Highlights created from kept Proposals to be visibly the
  Agent's judgement, so that I can still tell them apart from my own reading.
- As a Reader, I want to change my mind about a Highlight's Intent or State at any point,
  including after it is `compiled`, so that the Highlight stays mine.
- As the Agent, I want to read the judgement attributes under Consent and never write them, so
  that the Guest rule is true of the data and not just of a description.
- As a consumer context, I want the defaults stated once, so that an absent value is never
  interpreted two ways.

## Acceptance Criteria

**AC-1 — A direct Capture carries the four defaults**
- **Given** a Highlight captured directly by the Reader with no judgement attributes set
- **When** it is stored
- **Then** its Author is `user`, its Intent is `note`, its State is `new` and its Visibility is
  `agent`
- **And** it is a Judged Highlight only if the Reader later sets one of them.

**AC-2 — Keeping a Proposal produces an Agent-authoritative Highlight**
- **Given** a Proposal quoting "the replica is promoted last" and suggesting Intent `direct`
- **When** the Reader Keeps it
- **Then** a Highlight is stored with that Quote, with Author `agent` and Intent `direct` — the
  Reader adopting the Agent's suggestion by keeping it — and with State `new` and Visibility
  `agent` as the capture defaults. A Proposal that suggests no Intent yields the default `note`.

**AC-3 — A direct save is never attributed to the Agent**
- **Given** a Proposal with the Quote "the replica is promoted last" that the Reader ignores
- **When** the Reader captures the same text directly
- **Then** the stored Highlight's Author is `user`
- **And** no Highlight with Author `agent` exists for that Quote.

**AC-4 — The Agent cannot judge an existing Highlight**
- **Given** an existing Highlight at State `new` and Intent `note`
- **When** the Agent, with Consent at its widest, attempts to change either attribute
- **Then** the attempt is refused and the Highlight is unchanged.

**AC-5 — State advances only by an explicit Reader action**
- **Given** a Highlight at State `new`
- **When** the Reader sets its State to `kept`
- **Then** the stored State is `kept` and the version has advanced
- **And** no other field has changed.

**AC-6 — Activity never derives State**
- **Given** a Highlight at State `new` that has been revealed, starred, copied and delivered
- **When** the Margin is read
- **Then** its State is still `new`.

**AC-7 — The ladder may be stepped back**
- **Given** a Highlight at State `compiled`
- **When** the Reader sets its State back to `new`
- **Then** the stored State is `new` and the Highlight is otherwise unchanged.

**AC-8 — `compiled` locks nothing**
- **Given** a Highlight at State `compiled` whose Intent is `note`
- **When** the Reader changes its Intent to `direct`
- **Then** the stored Intent is `direct` and the State remains `compiled`.

**AC-9 — An Intent outside the four values is refused**
- **Given** a Highlight whose Intent is `note`
- **When** a write attempts to set an Intent that is not `dispute`, `direct` or `remember`
- **Then** the write is refused and the stored Intent remains `note`.

**AC-10 — A private Highlight is withheld from the Agent**
- **Given** a Highlight whose Visibility is `agent` and whose Note is "compare with the first
  draft"
- **When** the Reader sets its Visibility to `private`
- **Then** the stored Visibility is `private`
- **And** the Margin publishes a ceiling under which Agent Access never returns the Highlight:
  its Note never crosses, and nothing discloses that it exists.

**AC-11 — Visibility can narrow Consent but never widen it**
- **Given** an installation whose Consent grants the Agent nothing
- **When** the Reader sets a Highlight's Visibility to `agent`
- **Then** nothing about the Highlight becomes readable
- **And** no Visibility value ever exceeds the installation Consent.

**AC-12 — Judgement changes leave the content alone**
- **Given** a private Highlight with the Tags `release` and `migration` and a Note
- **When** the Reader sets its Visibility to `agent`
- **Then** its Quote, Tags, Note, Intent, State, Author and owning Session are unchanged.

**AC-13 — A stale judgement write is refused**
- **Given** a Highlight the Reader read at one version, which another window has since changed
- **When** the Reader saves an Intent change from that stale version
- **Then** the write is refused, the live Highlight is returned, and the Reader's draft is preserved
  for a reload or an overwrite.

**AC-14 — Provenance travels with the Highlight**
- **Given** a Highlight created through a kept Proposal and a Highlight created directly
- **When** either is read by a consumer under Consent
- **Then** its Author and the capture route travel with it, and no separate provenance object
  has to be fetched.

## Implementation Decisions

The decision that two authors share one model is recorded in
[ADR-002](../adrs/002-two-authors-one-model.md).

1. **Four independent fields, no composite judgement.** Author, Intent, State and Visibility are
   separate attributes of the Highlight; a single "judgement" enum would make one change imply
   others and would break the independent rules above.
2. **Author is a capture-route fact.** The admission path stamps `user` for a direct save and
   `agent` for a Keep; the update contract cannot express Author at all, so no edit path can
   reach it.
3. **Defaults are represented by absence and resolved on read.** A new Highlight stores no
   judgement state; setting a value equal to the default is indistinguishable from leaving it
   unset.
4. **Intent is validated against a closed set before storage.** There is no free-text Intent and
   no mapping from prose to Intent.
5. **State is stored, never computed.** No module recalculates it from activity; consumers may
   read it and derive counts from it, never write it.
6. **Visibility is per-item only.** The installation Consent is consumed as the outer bound and
   is never copied onto the Highlight; the Highlight stores only its own ceiling.
7. **The Margin does not model a Proposal.** Agent Access presents Proposals and, on Keep,
   hands a Capture to the ordinary admission path with the Agent's Author already decided; the
   Margin sees one Capture route more, not a new object.
8. **Judgement changes are ordinary version-guarded writes.** They carry the version the Reader
   read and are refused when stale, exactly like a presentation edit.
9. **Provenance is derived, not stored twice.** The capture route is evident from the admission
   path that produced the Author; there is no route field and no provenance object.

### Deferred Decisions

| Decision deliberately not made | The seam that keeps it open |
|---|---|
| Whether the Agent may ever hold a write capability | The Guest rule is a hard boundary and Author is fixed at capture, so widening it is a new decision about admission, not a field change |
| Whether Consent gains surfaces finer than the per-item ceiling | Visibility is one narrowing dimension beneath Consent; another dimension can be added beside it without changing this attribute |
| Whether an Agent-authored Highlight may be converted to a Reader-authored one | Author and route are properties of the Highlight, so a conversion rule is additive policy rather than a new object |
| Whether Intent may gain a fifth value | The set is closed and validated; widening it is a contract change that reaches every consumer |
| Whether State may gain a terminal or a derived value | State is explicit-only, so a derived value would be a new field with a new owner |
| Whether the Reader may edit a Proposal before Keeping it | Keep is a capture admission, so any pre-Keep editing belongs to Agent Access's Proposal lifecycle; the Margin receives the resulting Capture |

## Testing Strategy

- **Default resolution table.** Every combination of absent and explicitly set attributes,
  asserting the resolved value and that the stored shape is unchanged by setting a default.
- **Route matrix.** Direct save and Keep, across a Proposal the Reader ignores, a Proposal whose
  Quote no longer exists, and a Reader capturing identical text directly.
- **Enum boundaries.** Each legal Intent, State and Visibility, one illegal value each, and an
  absent value for each.
- **Non-derivation suite.** Run every activity that could plausibly imply progress — reveal,
  star, copy, deliver, resurface — and assert State is unchanged.
- **Reversibility.** Every State to every other State as an explicit action, including
  `compiled` to `new`, with an assertion that no other field moved.
- **Ceiling composition.** Consent off, read and read-write crossed with Visibility `agent` and
  `private`, asserting `private` never widens and that `agent` never exceeds Consent.
- **Conflict behaviour.** A stale judgement write, asserting refusal, returned live Highlight
  and retained draft.
- **Provenance read.** Both capture routes observed through a consumer, with the Agent
  attempting an edit in each.

## Out of Scope

- Access level, Access scope, Proposal creation, the Agent surface, tool registration and the
  model-facing vocabulary: Agent Access owns them.
- How judgement is presented, edited, filtered or counted: Presentation & Resurfacing owns it.
- Resurfacing reasons, the Digest and the Kept badge derivations, beyond the rule that they may
  read State and never write it.
- The Quote, the presentation fields and the ceilings: the Highlight model owns them.
- Storage, transport, freshness and the retention schedule.
- Sync and export.

## Open Questions

None outstanding. The four questions this specification raised are resolved:

1. **State reversibility.** State moves in either direction by explicit Reader action; `compiled`
   locks nothing. The glossary states this directly.
2. **"Judged".** There is no single judged state to name: the four judgement attributes are
   independent, and a Highlight is "unjudged" only in the sense that it still carries the capture
   defaults. Collapsing them into one word would create a derived state the Reader never set.
3. **A Proposal's judgement before Keep.** No: Keep applies the Proposal's own fields, because Keep
   is one action, not an editor. The Reader may edit the resulting Highlight immediately afterwards.
4. **Visibility while Consent is off.** Yes: Visibility is a ceiling the Reader may set at any time,
   including while Consent grants nothing. It is recorded as the Reader's preference and takes
   effect the moment Consent opens.
