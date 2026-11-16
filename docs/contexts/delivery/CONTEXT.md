# Delivery

**Classification:** Supporting · **Owns:** Insertion, Pending insertion, Briefing, Attribution, Copy
and the delivery outcome they publish · **Map:** [CONTEXT_MAP](../../CONTEXT_MAP.md)

Delivery is the hand-off out of the Margin. It carries a Highlight's Quote into a Composer, or
builds one Briefing the Agent can act on, without changing anything the Margin holds. Its failures
are ordinary product failures — a Composer that is busy, a Session that is not open, a packet that
is too long — and its obligation is that none of them silently loses the Reader's text or leaves the
Reader guessing what happened.

## Owns

- **Insertion and its destinations.** Delivering a Highlight's Quote into the Composer of the
  current Session, or into a new Session created in the Highlight's workspace.
- **The delivery outcome.** One domain value per request — `inserted`, `queued` or `failed` —
  published to the surfaces that report it.
- **Pending insertion.** An accepted hand-off that has not been placed: its destination, its
  survival across a Session switch and a re-open, its bounded retry and its 24-hour expiry.
- **Briefing.** The one packet form: up to 10 Highlights of one Session, with its cap, its
  private-item exclusion and its identity-bearing rows.
- **Attribution.** The `— from <Session title> · <date>` line, appended as text unless the
  deployment disables it; Attribution is enabled by default.
- **Copy.** Putting a Quote, with its citation when Attribution applies, on the clipboard, and
  resolving truthfully whether it happened.

## Does not own

- **The Margin.** Quote, identity, State and Visibility are read, never written. Delivery never
  marks anything delivered.
- **The Composer.** Editability, busy and structured modes, and what a Composer accepts belong to
  the Conversation; Delivery only observes whether a placement succeeded.
- **The Composer dock.** The strip that shows a Pending insertion is a Presentation & Resurfacing
  surface; Delivery supplies what waits for a destination.
- **The Notice channel.** Delivery produces outcomes; Presentation & Resurfacing renders them.
- **Opening a Session and Reveal.** Asking for a destination Session to be opened is a navigation
  request to Sessions & history; Reveal is Presentation's.
- **Visibility decisions.** Delivery reads Visibility as given and never decides what is private.
- **The clipboard.** Copy is a local browser facility; Delivery owns only the truthful outcome.

## Terms this context owns

The first five are the glossary's Delivery terms. The Composer dock is listed because Delivery owns
what the dock shows; the delivery outcome is the value this context publishes, named in the map's
contract table. All definitions are the [glossary][glossary]'s, except the last, which is the map's.

| Term | Source | Delivery's obligation |
|---|---|---|
| **Insertion** | [§7][gl-7] | Deliver the Quote verbatim to an explicit destination. |
| **Pending insertion** | [§7][gl-7] | Keep an accepted hand-off until it lands or expires. |
| **Briefing** | [§7][gl-7] | One bounded packet of resolvable rows for one Session. |
| **Attribution** | [§7][gl-7] | Append the deployment's citation line as text. |
| **Copy** | [§7][gl-7] | Put Quote and citation on the clipboard, truthfully. |
| **Composer dock** | [§8][gl-8] | Supply what waits; Presentation owns the surface. |
| **Delivery outcome** | [map][map-cross] | `inserted` · `queued` · `failed`, one per request. |

## Invariants

1. **Read-only.** No Insertion, Pending insertion, Briefing or Copy creates, edits, stars, deletes,
   transitions State or changes Visibility of a Highlight, and no delivery ever records that a
   Highlight was delivered.
2. **Verbatim.** The delivered text of a single-Highlight Insertion is the Highlight's Quote
   character for character; the only permitted addition is the Attribution line, appended as text
   unless the deployment disables it, and it is enabled by default.
3. **Explicit destination.** Every Insertion and every Briefing names exactly one destination — the
   Session on screen at the moment of the request, or a new Session created in the Highlight's
   workspace — and the resolved destination travels with a Pending insertion, so it can never drain
   into another Session.
4. **Total outcome.** Every accepted Insertion or Briefing resolves to exactly one of `inserted`,
   `queued` or `failed`; a refused placement is queued, never dropped, unless the request itself was
   invalid or its destination could not be created.
5. **Waiting is durable.** A Pending insertion survives switching Sessions, a page reload and a
   re-opening while the browser can retain it, is shown
   in its destination's Composer dock while it waits, and is retried by its destination whenever the
   Composer becomes editable.
6. **Retry is bounded.** A destination retries a Pending insertion every 2 seconds for up to 10
   seconds per attempt window; a still-refused insertion stays waiting rather than failing at once.
7. **Expiry is absolute and stated.** A Pending insertion is discarded 24 hours after it was
   accepted, never places text after that bound, and its expiry is reported as a failure with a
   reason.
8. **No duplicates.** Repeating an identical insertion or Briefing request never delivers the same
   text twice and never adds a second identical Pending insertion.
9. **Briefing order and bounds.** A Briefing preserves the order the requesting surface supplies —
   the Session's transcript order, which is Presentation's derivation; Delivery never reorders. It
   carries at most 10 Highlights of one Session, excludes every
   private Highlight, gives each row an excerpt of about 120 characters with the Highlight's
   identity and State, and holds the whole packet to about 2000 characters by dropping whole items
   from the end — an identity is never cut.
10. **Honest reporting.** The Reader can learn what happened to every request: placed text is
    visible in the destination Composer, a waiting hand-off is visible in the Composer dock, and a
    failure — including an expiry — is reported with a reason through the Notice channel.

## Published contracts

| Contract | Consumer |
|---|---|
| **Delivery outcome** | [Presentation & Resurfacing][presentation] |
| **Pending set for one destination** | [Presentation & Resurfacing][presentation] |
| **Briefing packet** | [Presentation & Resurfacing][presentation] |

- **Delivery outcome** — exactly one of `inserted`, `queued` or `failed` for every Insertion and
  Briefing, and a failure carries a reason the Reader can read.
- **Pending set for one destination** — which Pending insertions wait for a given Session, so the
  Composer dock can show them. Retry, expiry and duplicate suppression stay Delivery's, not the
  dock's.
- **Briefing packet** — one body of text: a header naming the Session, then one row per included
  Highlight with a short excerpt, the Highlight's identity and its State; private Highlights absent;
  the whole bounded, with whole items dropped from the end. The identity is the payload: each row is
  resolvable through the Agent surface's read-by-identity operation, while the excerpt only makes
  the row recognisable.

## Consumed contracts

| Contract | Provider |
|---|---|
| **Quote, identity, State and Snapshot** | [Margin][margin] |
| **Visibility** (value from the Margin; meaning enforced by Agent Access) | [Margin][margin] and [Agent Access][agent-access] |
| **Agent surface read-by-identity** | [Agent Access][agent-access] |
| **Notice channel** | [Presentation & Resurfacing][presentation] |
| **Ordered Highlights for one Session** | [Presentation & Resurfacing][presentation] |
| **Deployment configuration (Attribution)** | [Persistence & Distribution][persistence] |
| **Session identity, on-screen Session, workspace** | Sessions & history — upstream |
| **Composer** | Conversation — upstream |

- **Quote, identity, State and Snapshot** (Margin) — the verbatim text, the reference a Briefing row
  carries, the State that row prints and the Session title Attribution cites. Read only, never
  changed.
- **Visibility** (Agent Access) — the per-Highlight ceiling; a `private` Highlight is never briefed.
- **Agent surface read-by-identity** (Agent Access) — the published language that makes an identity
  a resolvable reference rather than an internal number.
- **Notice channel** (Presentation & Resurfacing) — the one channel through which Delivery reports.
- **Ordered Highlights for one Session** (Presentation & Resurfacing) — the Session's live
  Highlights in transcript order, as the Session tab derives it. Delivery preserves that order in a
  Briefing and never derives or reorders it; Delivery may not depend on Anchoring for it.
- **Deployment configuration** (Persistence & Distribution) — whether Attribution is enabled for
  this installation; it is enabled by default, and only an explicit disable removes the line.
- **Session identity and the on-screen Session** (Sessions & history, upstream) — what the current
  Session is, a Highlight's workspace for a new destination, and opening a Session. See the map's
  [external neighbours][map-neighbours].
- **Composer** (Conversation, upstream) — whether a destination Composer is mounted, editable and
  whether it accepted the text; nothing about its internals.

## Primary flows

**Insert into the current Session.** The Reader chooses insert on a Highlight. Delivery resolves the
destination as the Session on screen at that moment — not the Highlight's owning Session — reads the
Quote and, when Attribution applies, its citation line. If that Session's Composer is mounted and
editable, the text is placed and the outcome is `inserted`; otherwise the request becomes a Pending
insertion addressed to that Session and the outcome is `queued`.

**Insert a Highlight from elsewhere into the on-screen Session.** The same flow, with one extra
consequence: when the Highlight belongs to another Session, the citation is what tells the recipient
where the passage came from, so Attribution carries provenance rather than decoration.

**Insert into a new Session.** Delivery creates a new Session in the Highlight's workspace, opens it
and addresses a Pending insertion to it; the new Session's Composer drains it as soon as it is
editable. If the new Session cannot be created, the outcome is `failed` and nothing is queued.

**Wait, retry, expire.** A Pending insertion keeps its destination and its text, is shown in that
destination's Composer dock while it waits, and is retried by the destination whenever the Composer
becomes editable: every 2 seconds for up to 10 seconds per attempt window, until it lands or the
24-hour bound passes and the expiry is reported as a failure. A repeated identical request adds
nothing.

**Brief a Session.** A surface asks Delivery to brief one Session. Delivery reads that Session's
live Highlights, excludes private ones, preserves the order the surface supplied, caps at 10 and
builds one packet. If
the destination Session is already on screen and its Composer editable, the packet is inserted;
otherwise it is queued and the Session is opened so that it drains when the Composer mounts.
Repeating the identical Briefing does not enqueue a second packet.

**Copy.** Delivery reads the Quote, appends the citation when Attribution applies, and asks the
browser for the clipboard; the action reports success only when a copy actually happened. Nothing
leaves the machine.

## Degradation and failure modes

- **Destination Composer not mounted.** The insertion is queued for that Session rather than held in
  the requesting surface. The Session may be opened so the Composer can mount; the dock shows the
  wait.
- **Destination Composer busy.** The Composer refuses the text, so the request is queued and
  retried. A busy Composer delays delivery; it never discards it.
- **Structured or read-only Composer.** When a Composer will not accept a plain quote, Delivery
  queues the verbatim text rather than reformatting it to fit. If the Composer stays in that mode,
  the insertion waits until it lands elsewhere or expires.
- **A just-created Session is not editable yet.** The new destination is accepted as a Pending
  insertion and retried; the Session is opened so its Composer can mount.
- **The new Session cannot be created.** A new-Session destination that cannot be brought into
  existence fails with a reason and nothing is queued; the Notice offers the alternative of Copy.
- **The destination never becomes editable.** The Pending insertion is discarded at the 24-hour
  bound, the Composer dock stops showing it, and the expiry is reported as a failure with a reason.
- **The pending set cannot be retained at all.** Where the browser cannot retain it, the hand-off
  holds for the current browsing session only: it can still land while the Reader stays open, and a
  re-open before it lands loses it, with the loss reported as a failure and a reason.
- **A Briefing has nothing to include.** When every candidate Highlight is private, there is no
  packet to deliver: the outcome is `failed` with a reason rather than an empty Briefing.
- **Attribution cannot name a Session.** A Highlight whose stored Session title is absent is
  inserted and copied without a citation line rather than with a guessed one. When the deployment
  disables Attribution, no line is appended at all.
- **Copy is refused.** When neither the modern clipboard nor a local fallback succeeds, Copy reports
  failure and never claims success; there is no network path to fall back on.

## Boundary rules

This context may know:

- A Highlight's Quote, identity, State and Visibility; its Session identity, stored Session title
  and date for Attribution.
- Which Session is on screen, a Session's workspace binding when a new destination must be created,
  and whether a destination Composer is mounted, editable and accepted the text.
- The deployment's Attribution setting, and its own Pending insertions by destination.

This context must not know:

- An Anchor, Quote context or Resolution state; Delivery never resolves a Highlight to the
  Transcript.
- Colour, Tags, Note, Star, Author, Intent or Provenance. Delivery carries the Quote itself, and in
  a Briefing row only the excerpt, identity and State.
- Consent, Access level or Access scope; it reads per-Highlight Visibility as given and no more.
- The record store, its transport or its layout, and how the pending set is retained.
- The Composer's internals, its rendered form or the Conversation's structure; and the Composer
  dock's layout or the Notice channel's rendering.
- Whether a Highlight has been "delivered": no such fact exists in this domain.

## Deferred decisions

- **Insertion into another existing Session.** This specification scopes destinations to the current
  Session and a new Session. A third destination form is left open by the destination model: every
  request already names one explicit destination and a Pending insertion carries it, so a new
  destination form extends the destination value and the drain rule, not the Insertion contract. The
  map's [deferred decisions][map-deferred] name this seam.
- **A structured delivery form.** An Insertion is text plus at most the Attribution line. A
  removable quote chip, a reference card or an attachment would be a new destination contract;
  nothing in the Insertion contract assumes the Composer offers one, which is what keeps the
  decision open.

## Documentation index

- [Insertion and Briefing][spec] — the context's specification: definitions, constraints, scenarios
  and open questions.
- [ADR-001 — Delivery carries the verbatim Quote][adr1] — why the delivered text is never
  paraphrased, truncated or augmented.
- [ADR-002 — Briefing rows carry Highlight identities][adr2] — why the identity, not the excerpt, is
  the payload of a Briefing row.

## Where the implementation record lives

The failure modes behind this context are recorded in the package's [known limitations][known] (§6)
and [implementation notes][notes]; those records describe the machinery, not the intent.

[glossary]: ../../UBIQUITOUS_LANGUAGE.md
[gl-7]: ../../UBIQUITOUS_LANGUAGE.md#7-delivery
[gl-8]: ../../UBIQUITOUS_LANGUAGE.md#8-reader-facing-surfaces
[map-cross]: ../../CONTEXT_MAP.md#cross-context-contracts
[map-neighbours]: ../../CONTEXT_MAP.md#external-neighbours-deepseek-harness-contexts
[map-deferred]: ../../CONTEXT_MAP.md#deferred-decisions-and-the-seam-that-keeps-each-one-open
[margin]: ../margin/CONTEXT.md
[agent-access]: ../agent-access/CONTEXT.md
[presentation]: ../presentation/CONTEXT.md
[persistence]: ../persistence/CONTEXT.md
[known]: ../../known-limitations.md
[notes]: ../../implementation-notes.md
[spec]: specs/insertion.md
[adr1]: adrs/001-delivery-carries-the-verbatim-quote.md
[adr2]: adrs/002-briefing-rows-carry-highlight-identities.md
