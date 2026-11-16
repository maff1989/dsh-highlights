# Freshness and transport

**Status:** Accepted
**Context:** Persistence & Distribution
**Date:** 2026-11-15

## Definitions

- **Channel** — the authenticated exchange between the browser half and the Host half. It
  carries one request and one reply at a time; it is not a stream and carries no
  business events.
- **Owner Peer** — the authenticated peer on the channel. The channel serves the owner and
  nobody else, and it provides no per-record authorisation.
- **Business outcome** — a result the caller can act on (stored, conflicted, refused,
  missing) carried inside a successful reply.
- **Transport failure** — an answer the caller cannot interpret as a business outcome: the
  Host is unreachable, the exchange is refused, the channel is not mounted.
- **Refresh** — a read of the record set together with the values the Host advertises, that
  replaces what the browser half holds.
- **Forced refresh** — a refresh that ignores the freshness window because the reason for it
  is decisive (activation, reconnect, an own write, an explicit Reader refresh).
- **Freshness window** — a short interval after a successful refresh inside which a
  non-forced refresh is skipped.
- **Local write** — a durable change this browser half has just confirmed; the source of all
  optimistic state.
- **Optimistic value** — the provisional form of a local write that the browser half shows
  before the Host's confirmed record arrives.
- **In-flight read** — a refresh that has started but has not replaced the held record
  set.
- **Stale view** — a held record set that has not been refreshed since one of the defined
  occasions, and may therefore differ from what is stored.
- **Reconnect** — the channel's re-establishment after a break, signalled to the browser half
  by the harness.

## Constraints

- The browser half and the Host half are separate processes. The browser half cannot read
  the Host's durable store, and the Host cannot render anything.
- The harness forwards no change event for an outside plugin's stored data, and the browser
  half cannot watch another process's writes. There is no push path to fall back on.
- The channel is authenticated and owner-fenced by the harness, and it carries no actor
  identity. Every call is authorised only as "the owner of this installation".
- A surface can become visible, hidden, focused or unfocused at any moment; a window may be
  duplicated, and two windows may be edited concurrently.
- A reply can fail after the Host has already completed the change, so the caller must be
  able to reconcile by reading rather than by assuming failure meant nothing happened.
- The browser half owns no durable store of Highlights. Any browser-local data it keeps is
  ephemeral and outside the durability guarantee.

## Problem

The Margin is one durable collection read by several surfaces in possibly several windows,
but the plugin is two processes with no event channel between them. Without a stated
freshness model, every surface would invent its own answer to "is what I show still true?" —
one would poll constantly, one would never refresh, one would clobber a Reader's confirmed
write with a slow read, and the Reader would see a Highlight vanish and reappear depending on
which window was in front. The transport has a mirror-image problem: the channel can fail at
several levels, and if a lost editing race is reported the same way as a broken connection,
surfaces cannot tell a Reader "this Highlight changed" from "the Host is unreachable" — and a
retry policy aimed at the wrong one either loses work or hammers a dead process.

## Solution

**One channel, outcomes inside it.** Every interaction between the halves travels on the
harness-authenticated channel, fenced to the owner Peer. The plugin speaks in one envelope
whose success carries a business outcome and whose failure carries a typed transport
outcome. A lost version-guarded write, a reached cap and a missing record are values inside a
successful reply; only an unreachable, refused or unmounted channel is a transport failure.
The channel performs no per-record authorisation: a same-origin owner Peer may read and write
every record, which is the correct trust model for one Reader's local installation (see
[ADR-002](../adrs/002-local-first-single-user-trust.md)).

**Freshness is pull-based and its occasions are a closed list.** The browser half refreshes:

- at activation, before any surface claims a record set;
- after each of its own confirmed writes, replacing the optimistic value with the Host's
  record;
- when the channel reconnects, because everything held may be out of date;
- when the window regains focus, subject to the freshness window;
- on an explicit Reader refresh;
- and, when the deployment sets an optional fixed interval, on that interval while a
  Highlights surface is visible and the document is not hidden.

A non-forced refresh is skipped when the last successful one is inside the freshness window,
so a burst of focus events costs one read. A refresh that finds a local write landed while it
was in flight does not publish its answer: it repeats, up to a bounded number of attempts,
and on exhausting the bound publishes the answer it has. Staleness is therefore bounded best
effort, never absolute.

**Obligations while stale and on reconnect.** A surface that has not refreshed since its last
occasion must treat what it shows as potentially stale: it may render and act on the records
it holds, it may not claim they are up to date, and it must not treat a stale value as the basis
for a destructive decision it can avoid. A write always names the version the surface holds,
so a stale surface's write is refused as a conflict rather than overwriting a newer value.
On reconnect the browser half forces a refresh before it accepts further local work, keeps
the last records visible in the meantime, and reports the connection state rather than an
empty Margin. A failed refresh keeps the previous records; it never empties the surfaces.

**Optimism is bounded to one write.** A local write publishes an optimistic value so the
Reader sees the result immediately; the Host's confirmed record replaces it. If the write
fails, the optimistic value is withdrawn and the failure is reported. An optimistic value is
never written from: it carries no stored version, so no change can be based on it.

**There is no push channel, and the model says so.** No mechanism delivers a change to a
surface unprompted. Another window's write becomes visible when this window's next occasion
occurs, most often focus. Two windows converge because focus is mutual and because a
conflict is a value the editing surface can show. The deployment's optional interval is a
coarse substitute for a push channel, not a different guarantee.

## User Stories

- As a **Reader**, I want a save in one window to appear in the other window, so that the
  Margin behaves like one collection rather than several.
- As a **Reader**, I want a slow background read never to make a just-saved Highlight
  disappear, so that I do not have to distrust what I see.
- As a **Reader**, I want the plugin to stay quiet when it has nothing new, so that it costs
  nothing in the common case.
- As a **Reader**, I want to know when the plugin cannot reach its Host, so that I do not
  mistake an unreachable store for an empty Margin.
- As a **Reader** editing one Highlight in two windows, I want the second save to tell me the
  Highlight changed, so that neither version is silently lost.
- As a **surface**, I want one pull-based freshness contract, so that I subscribe to "the
  records may have changed" instead of inventing a mechanism.
- As an **operator** of a deployment, I want to enable a coarse refresh interval without
  changing the plugin, so that a kiosk-like setup can converge on a schedule.
- As an **operator** of a deployment, I want the channel to trust the owner Peer only, so that
  the plugin needs no user accounts it does not have.

## Acceptance Criteria

**Activation refreshes**
1. **Given** a browser half that has just started and holds no records,
   **when** it activates and a Highlights surface appears,
   **then** it refreshes before the surface claims a record set.

**An own write is confirmed**
2. **Given** an optimistic value for a capture,
   **when** the Host confirms the write,
   **then** the confirmed record replaces the optimistic value and the surface shows the
   version the store assigned.

**A failed write withdraws its optimistic value**
3. **Given** an optimistic value for a capture,
   **when** the Host reports a transport failure,
   **then** the optimistic value is withdrawn and the failure is reported, so the surface
   does not keep a record that was never stored.

**Focus inside the freshness window is skipped**
4. **Given** a successful refresh,
   **when** the window regains focus inside the freshness window,
   **then** no refresh is issued and the held record set is unchanged.

**Focus outside the freshness window refreshes**
5. **Given** a successful refresh,
   **when** the window regains focus after the freshness window has elapsed,
   **then** a refresh is issued and any new or changed record becomes visible.

**Multiple windows converge on focus**
6. **Given** two windows showing the same record set and a write made durable in the first,
   **when** the second window regains focus outside the freshness window,
   **then** the second window shows the first window's write.

**The optional interval refreshes while visible**
7. **Given** a deployment that sets a refresh interval and a visible Highlights surface,
   **when** one interval elapses,
   **then** the browser half refreshes the record set.

**The disabled interval issues no background reads**
8. **Given** a deployment that sets no refresh interval,
   **when** the window stays open and nothing focuses or writes,
   **then** no refresh is issued between the defined occasions.

**Reconnect refreshes**
9. **Given** a held record set and a broken channel,
   **when** the channel reconnects,
   **then** the browser half forces a refresh before it accepts further local work.

**An in-flight read does not publish a superseded snapshot**
10. **Given** a refresh that has started,
    **when** a local write is confirmed while that refresh is in flight,
    **then** the refresh repeats instead of publishing the record set it read before the
    write.

**A bounded retry publishes its answer**
11. **Given** local writes that keep landing while a refresh is in flight,
    **when** the refresh has repeated the bounded number of times,
    **then** it publishes the answer it has, so staleness is bounded rather than unbounded.

**Offline keeps the Margin visible**
12. **Given** records held from an earlier refresh,
    **when** the Host becomes unreachable,
    **then** the records remain visible, the surface reports that the Host is unreachable and
    no record is discarded.

**A refused call is not retried as a transport failure**
13. **Given** a business outcome refusing a write, such as a conflict,
    **when** the answer reaches the caller,
    **then** it is reported as that outcome and is not retried as a transport failure and not
    retried as a fresh write.

**Only the owner reaches the store**
14. **Given** an unauthenticated or non-owner peer,
    **when** it addresses the plugin's channel,
    **then** the harness refuses it and no record is returned or changed.

**No per-record authorisation is claimed**
15. **Given** an authenticated owner Peer,
    **when** it asks for a record belonging to another Session,
    **then** the channel and the store serve it, because access is decided by Consent
    elsewhere and never by this context.

## Implementation Decisions

- **One envelope for the whole exchange.** The browser half posts one request naming the
  interaction and its input; the Host answers one envelope with either a value or a typed
  failure. Business outcomes live inside the value. This is what lets a conflict, a refusal
  and a missing record reach a surface undistorted by transport semantics.
- **A typed failure vocabulary with two retry classes.** Refusals of the request itself, the
  channel not being mounted, and authentication refusals are final; an unreachable or
  unreadable answer is transient and may be retried with bounded backoff. The classification
  is stated here because every surface depends on it, and it is the reason a lost race is
  never retried as a network error.
- **The browser half holds one snapshot.** One record set, one subscription, one refresh
  path: every surface projects the same value. Surfaces do not read independently, so the
  freshness occasions are decided once rather than per surface.
- **Forced versus non-forced refresh is the only freshness dial.** The freshness window
  applies to non-forced refreshes only; activation, reconnect, an own write and an explicit
  Reader refresh are always forced. The interval is also forced, because its whole purpose is
  to substitute for a missing push.
- **The supersede rule is a write ordinal, not a timestamp.** A refresh records the count of
  local writes when it starts; if the count has moved when it finishes, the answer is known to
  be pre-write and is not published. Comparing clocks would be unreliable across the two
  processes.
- **Optimistic values carry no stored version.** An optimistic value exists only in the
  browser half's snapshot and is replaced before any write can name it, so no mutation can be
  based on a record that the store has not accepted.
- **The channel is the trust boundary and carries no identity.** No authorisation decision is
  made per record or per caller, because the installation has one human actor and the harness
  supplies no actor identity to key a decision on.
- **The exchange is versioned and negotiable.** The first exchange carries the protocol
  number; a mismatch is refused rather than interpreted. New fields are additive and optional.

### Deferred Decisions

| Decision | Seam |
|---|---|
| A push channel for record changes | The freshness contract names refresh occasions and a change indicator; a push channel would add an occasion, not change a surface's obligations |
| Whether another window's write may be noticed without focus | The channel and the interval are the two mechanisms; a browser-local nudge would be a third occasion with the same contract |
| Whether optimistic writes should be shown for edits and deletes as well as captures | The optimistic path is one place in the browser half's store; extending it is a presentation decision with no new guarantee |
| Whether the freshness window should be deployment-configurable | Deployment configuration is a closed list of knobs; adding one is a configuration change, not a freshness redesign |
| Whether per-record authorisation is ever added | The owner-Peer fence is the stated boundary; adding an actor changes [ADR-002](../adrs/002-local-first-single-user-trust.md) first |

## Testing Strategy

- **Transport round-trip tests** assert that every business outcome (stored, conflicted,
  refused, missing) arrives as a value, that the typed transport failures are distinguishable
  from them, and that a non-owner peer is refused by the channel.
- **Freshness occasion tests** drive a deterministic clock and a controllable window and
  assert one read per occasion, that the freshness window suppresses a burst, that the
  interval fires only while visible, and that it is silent when not configured.
- **Supersede tests** start a refresh, confirm a local write before the read completes, and
  assert the pre-write snapshot is never published; a second case exhausts the retry bound and
  asserts publication.
- **Optimism tests** assert that the optimistic value appears, is replaced by the confirmed
  record, and is withdrawn exactly when the failure is a failure to store.
- **Reconnect and offline tests** break the channel, assert that held records stay visible and
  the offline state is reported, then reconnect and assert a forced refresh.
- **Multi-window tests** use two browser halves over one Host and assert convergence on focus
  and a conflict value when both edit the same version.
- **No-network tests** assert that the only outbound traffic from the browser half is to the
  same-origin channel.

## Out of Scope

- Consent, Access level, Access scope and per-item Visibility, including the decision about
  which records a caller may see.
- Which refresh occasion any particular surface chooses to use, and how it renders a stale or
  offline state (Presentation).
- What a conflict means for a Reader's editing choice, and which of two versions to keep.
- The business content of a reply beyond its envelope: validation of domain values,
  version-guarded writes as a mechanism and refusals from the store.
- The durability, retention and cap guarantees themselves (see
  [record store](record-store.md)).
- Packaging, activation and version skew (see
  [distribution and upgrade](distribution-and-upgrade.md)).

## Open Questions

None outstanding. The four questions this specification raised are resolved:

1. **A visible stale indicator.** Truthfulness is the obligation: a surface that has not refreshed
   since a defined occasion must say so wherever the Reader could act on the data. The form of the
   statement is Presentation's; the requirement to make it is this contract's, and silence would
   present old data as current.
2. **The freshness window.** It is a fixed plugin constant, not a deployment knob. A deployment may
   enable the optional refresh interval but cannot change the freshness window; making the window
   configurable is a deferred decision, not a missing value.
3. **Two stale windows and a conflict.** The Reader always decides. The plugin never auto-adopts a
   newer value, because a silent adoption is indistinguishable from a lost edit; auto-merging
   untouched fields is deferred, not promised.
4. **Reconnect and queued actions.** No forced ordering. A capture may proceed optimistically while
   the record set is being refreshed, because every write is version-guarded and a stale write is
   returned as a conflict rather than applied.
