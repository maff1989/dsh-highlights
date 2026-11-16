# Insertion and Briefing

**Status:** Accepted
**Context:** Delivery
**Date:** 2026-11-15

## Definitions

The [glossary](../../../UBIQUITOUS_LANGUAGE.md#7-delivery) defines **Insertion**, **Pending
insertion**, **Briefing**, **Attribution**, **Copy** and the **Composer dock**, and this
specification uses those terms unchanged. It adds the following.

- **Request** — one act of the Reader asking Delivery to make a hand-off: insert a Quote or brief a
  Session. A request yields exactly one delivery outcome.
- **Destination** — the Session whose Composer should receive the delivered text. Two forms are in
  scope: the **current Session** and a **new Session**.
- **Current Session** — the Session on screen when the Reader makes the request. It is the
  destination even when the Highlight being inserted belongs to another Session.
- **New Session** — a Session created for the hand-off in the Highlight's workspace.
- **Delivered text** — what lands in the Composer. For a single-Highlight Insertion it is the Quote
  verbatim plus the Attribution line when Attribution applies; for a Briefing it is the packet. Copy
  is not a Composer hand-off: it puts the Quote and its citation on the clipboard.
- **Delivery outcome** — `inserted`, `queued` or `failed`, as published by the context.
- **Attempt window** — the bounded stretch in which a destination retries a Pending insertion: a
  retry every 2 seconds for up to 10 seconds.
- **Packet cap** — the bound of about 2000 characters on the whole Briefing text.
- **Row** — one line of a Briefing: a short excerpt of one Highlight's Quote, that Highlight's
  identity and its State.

## Constraints

1. Delivery reads the Margin and never writes to it. No request changes a Highlight, its State, its
   Visibility or its presentation fields.
2. The delivered text of a single-Highlight Insertion is the Highlight's Quote verbatim. Delivery
   never paraphrases, truncates or augments it; the only permitted addition is the Attribution line,
   appended as text.
3. Destinations are the current Session and a new Session, and nothing else. The current Session is
   captured when the request is made, not re-derived later from the Highlight.
4. Placement succeeds only when the destination Composer is mounted, editable and accepts the text.
   Any other refusal is a Pending insertion, not a failure and not a silent drop.
5. A Pending insertion names its destination. It survives switching Sessions, a page reload and a
   re-opening while the browser can retain it, is
   visible in its destination's Composer dock, is retried every 2 seconds for up to 10 seconds per
   attempt window, and expires 24 hours after it was accepted. An expiry is not silence: the
   unplaced insertion fails, and the failure is reported with a reason through the Notice channel.
   The dock shows enough of the waiting text to identify it — an excerpt of the Quote, or the
   packet's header for a Briefing — and names the destination Session.
6. A request that is invalid, or whose destination cannot be brought into existence, fails with a
   reason. Nothing is queued for it.
7. A Briefing carries at most 10 Highlights of one Session, excludes every private Highlight,
   preserves the order supplied by the requesting surface (the Session's transcript order) and never
   reorders it, gives each row an excerpt of about 120 characters plus the Highlight's identity
   and State, and holds the whole packet to about 2000 characters. When the cap would be exceeded,
   whole items are dropped from the end; an identity is never cut. The packet never states that
   private Highlights were excluded — not a count, not a mention — because disclosing their
   existence is the leak the exclusion exists to prevent. The Reader-facing outcome may say how
   many were withheld, since the Reader already knows they exist.
8. Attribution is a deployment choice, not a per-Highlight or per-Reader choice. It is enabled by
   default: the citation line is appended unless the deployment explicitly disables it. It is
   appended as text, never as structure. The date it cites is the day the Highlight was captured —
   the moment the source text was marked — not the day it was delivered, because the citation
   identifies the source moment, not the hand-off.
9. Copy is local. It reports success only when a copy actually happened, and it never performs a
   network operation.
10. When the destination Session is not on screen, Delivery asks for it to be opened so that its
    Composer can mount; opening is a navigation request, not part of Delivery.
11. The Reader can learn the outcome of every request through the Composer dock and the Notice
    channel. No path reports `inserted` without the text being present in the Composer.
12. Identical repeated requests do not duplicate: while an identical Pending insertion is
    waiting, a second request for the same text and destination joins it rather than queueing
    another. Once the earlier one lands, repeating it is a new request.
13. A destination Session that disappears before delivery fails its Pending insertions with a
    stated reason at the next attempt; they do not wait for the 24-hour expiry. Nothing is
    silently dropped.

## Problem

The Margin records attention, but a marked passage is only useful forward if it can enter the
Reader's next turn or reach the Agent as something the Agent can act on. Delivery exists to make
that hand-off, and the value it protects is exactness: the text that arrives must be the text the
Reader marked, and it must arrive at a destination the Reader chose.

The Conversation makes that hand-off unreliable. The destination Session may not be on screen; its
Composer may not be mounted, may be busy, may refuse a plain quote, or may not be editable yet
because the Session was just created. A delivery path that gives up when the Composer is busy loses
the Reader's text at exactly the moment the Reader acted on it, and a path that reports success
without verifying is a quieter kind of loss. Meanwhile, handing the Agent a pile of full Quotes is
neither bounded nor resolvable: the Agent must be able to get back to the exact Highlight it was
told about, under its own consent, rather than trusting a summary that Delivery invented.

So Delivery needs three things the rest of the Margin deliberately does not provide: an explicit
destination, a durable waiting state for text that cannot be placed yet, and a bounded,
identity-bearing packet for a Session-wide hand-off. It also needs to be honest about what became of
every attempt.

## Solution

**One request, one destination, one outcome.** Every insertion or Briefing names its destination
when the Reader asks. The current Session is captured as the Session on screen, so a Highlight owned
by another Session can be inserted forward without ambiguity, and a waiting hand-off has nothing
left to resolve. The attempt yields `inserted` when the Composer took the text, `queued` when the
destination was not editable and the request became a Pending insertion, and `failed` when the
request could not be honoured at all.

**Accepted text waits rather than vanishes.** A Pending insertion carries the delivered text and its
destination, and nothing else about the Highlight. It is visible in that destination's Composer dock
while it waits, and it is retried by its destination whenever the Composer becomes editable. It is
discarded 24 hours after acceptance, and that expiry is reported as a failure with its reason. Its
identity is the Highlight identity paired with the destination, which is what makes a repeated
request idempotent and keeps a waiting insertion from draining into the wrong Session.

**A Briefing is one bounded, resolvable packet.** It is Delivery's only packet form. Delivery reads
one Session's live Highlights, excludes private ones, orders them by transcript position and caps
them at 10. The packet is a header naming the Session followed by one row per included Highlight: a
short excerpt, the Highlight's identity and its State. When the whole packet would exceed about 2000
characters, items are dropped whole from the end, so every surviving row remains resolvable. The
identity is the payload; the excerpt only makes the row recognisable. A Briefing is addressed to the
Session whose Highlights it carries, and the Session is opened if it is not on screen.

**Copy is the local escape hatch.** Copy puts the Quote, and its citation when Attribution applies,
on the clipboard and reports only a real copy. It never uploads and never pretends.

**The Reader always learns.** The Composer shows placed text, the Composer dock shows waiting text,
and the Notice channel reports a failure with its reason. Delivery produces the outcome; the
surfaces report it.

## User Stories

- **US-1.** As the Reader, I can insert a Highlight's Quote into the Session I am looking at, so the
  passage becomes part of my next turn without my retyping it.
- **US-2.** As the Reader, I can insert a Quote whose Highlight belongs to another Session into the
  Session on screen, so I can build on an earlier passage in a different conversation.
- **US-3.** As the Reader, I can insert a Quote into a new Session in the Highlight's workspace, so
  the passage starts a fresh conversation in the right project.
- **US-4.** As the Reader, when the Composer is busy or not ready, my text is kept as a Pending
  insertion and shown to me, so I know it is waiting rather than lost.
- **US-5.** As the Reader, I can switch Sessions or re-open and my Pending insertion still lands
  when its destination is ready, and it never lands twice.
- **US-6.** As the Reader, I can brief the Agent on one Session with one bounded packet in which
  every included Highlight is resolvable, so the Agent can act on exactly those Highlights.
- **US-7.** As the Reader, private Highlights never appear in a Briefing, so briefing a Session
  cannot disclose what I have not exposed.
- **US-8.** As the Reader, I can copy a Quote, with its citation when Attribution applies, for use
  outside the plugin, and I am told truthfully whether it reached the clipboard.
- **US-9.** As the Reader, I am told when a hand-off failed and why, so I can copy the Quote
  instead.

## Acceptance Criteria

Each scenario has one action.

### AC-1 — Insert into the current Session

**Given** a Highlight in the Margin and a Session on screen whose Composer is editable

**When** the Reader asks to insert that Highlight into the current Session

**Then** the Quote is placed in that Composer and the outcome is `inserted`.

### AC-2 — Insert a Highlight from another Session into the on-screen Session

**Given** the Reader is viewing Session A, a Highlight belongs to Session B and Session A's Composer
is editable

**When** the Reader asks to insert that Highlight into the current Session

**Then** the Quote is placed in Session A's Composer, not in Session B's, the Attribution line names
Session B when Attribution applies, and the outcome is `inserted`.

### AC-3 — Insert into a new Session

**Given** a Highlight and a new Session that can be created in the Highlight's workspace

**When** the Reader asks to insert that Highlight into a new Session

**Then** a new Session exists in the Highlight's workspace, it is opened, a Pending insertion
addressed to it carries the Quote, and the outcome is `queued`.

### AC-4 — Busy Composer

**Given** a Highlight and a destination Session whose Composer is busy

**When** the Reader asks to insert that Highlight into the current Session

**Then** the request is accepted as a Pending insertion for that Session and the outcome is
`queued`.

### AC-5 — Structured Composer refusal

**Given** a Highlight and a destination Session whose Composer refuses a plain quote

**When** the Reader asks to insert that Highlight into the current Session

**Then** the Quote is queued verbatim, Delivery does not reformat or shorten it to fit, and the
outcome is `queued`.

### AC-6 — Waiting is visible

**Given** one or more Pending insertions addressed to the Session on screen

**When** the Reader views that Session's Composer area

**Then** the Composer dock shows that text is waiting for the Composer.

### AC-7 — A Pending insertion survives a Session switch

**Given** a Pending insertion addressed to Session B and the Reader is viewing Session A

**When** the Reader switches to Session B

**Then** the Pending insertion is still waiting, still addressed to Session B, and drains once
Session B's Composer becomes editable.

### AC-8 — A Pending insertion survives a re-open

**Given** a Pending insertion accepted less than 24 hours ago

**When** the Reader closes and re-opens the interface and the destination Composer becomes editable

**Then** the Pending insertion is still present and its text is placed.

### AC-9 — Retry then success

**Given** a Pending insertion whose destination Composer has refused placement

**When** that Composer becomes editable within the attempt window

**Then** the text is placed no later than the next retry, the delivered text is visible in the
Composer, and the Pending insertion leaves the Composer dock.

### AC-10 — Expiry after 24 hours

**Given** a Pending insertion accepted more than 24 hours ago

**When** its destination Composer becomes editable

**Then** the Pending insertion is discarded and no text is placed.

### AC-11 — Duplicate insertion request

**Given** a Highlight whose text is already waiting as a Pending insertion for its destination

**When** the Reader repeats the identical insert request

**Then** no second copy is queued or placed and the outcome is `queued`.

### AC-12 — Duplicate Briefing request

**Given** the Reader has just briefed a Session

**When** the Reader makes the identical Briefing request again

**Then** only one packet is delivered or queued.

### AC-13 — Briefing of 10 items with the packet cap enforced

**Given** a Session with more than 10 live Highlights visible to the Agent and a packet that would
exceed about 2000 characters if every candidate were included

**When** the Reader briefs that Session

**Then** the packet holds at most 10 rows within about 2000 characters, items are dropped whole from
the end, and every surviving row still carries an intact Highlight identity and its State.

### AC-14 — Briefing excludes private Highlights

**Given** a Session with both agent-visible and private Highlights

**When** the Reader briefs that Session

**Then** no private Highlight's text, excerpt or identity appears in the packet.

### AC-15 — Briefing opens its destination

**Given** a Session that is not on screen but whose Highlights the Reader asks to brief

**When** the Reader issues the Briefing request

**Then** the Session is opened, the packet waits in that Session's Composer dock, and the outcome is
`queued`.

### AC-16 — Copy with Attribution

**Given** a deployment that enables Attribution and a Highlight carrying a Session title

**When** the Reader copies that Highlight's Quote

**Then** the clipboard contains the Quote followed by the line `— from <Session title> · <date>` and
Copy reports success.

### AC-17 — Copy without Attribution

**Given** a deployment that disables Attribution

**When** the Reader copies a Highlight's Quote

**Then** the clipboard contains exactly the Quote and Copy reports success.

### AC-18 — Failure is reported

**Given** a Highlight whose workspace cannot accept a new Session

**When** the Reader asks to insert that Highlight into a new Session

**Then** the outcome is `failed`, nothing is queued, and the Notice channel reports the failure with
a reason.

### AC-19 — A Briefing with nothing to include fails

**Given** a Session whose every candidate Highlight is private

**When** the Reader asks to brief that Session

**Then** no packet is built, the outcome is `failed`, and the Notice channel reports it.

## Implementation Decisions

- Delivery is a read-only participant in the Margin: requests enter through the same action face the
  surfaces already use, and Delivery holds no Highlight state of its own beyond the pending set.
- The destination is resolved when the request is made. The current Session is captured as the
  Session on screen, not inferred later from the Highlight; this is what lets a Highlight from
  Session B land in Session A and stops a later screen change from redirecting a waiting hand-off.
- A Pending insertion is identified by the Highlight identity paired with its destination. That pair
  is the duplicate-suppression key and the reason a waiting insertion cannot drain into another
  Session.
- Placement is attempted immediately for the current destination; only a refusal becomes a Pending
  insertion. The new-Session path is always accepted as a Pending insertion, because the destination
  does not exist until it has been created.
- The pending set is Delivery's own and is kept separately from the Margin's Highlights. It stores
  the delivered text and the destination; it is not a Highlight and is never added to the Margin.
- Retry belongs to the destination: a Composer drains what is addressed to it when it mounts or
  becomes editable, and a bounded timer retries every 2 seconds for up to 10 seconds per attempt
  window before leaving the entry to its 24-hour expiry.
- A Briefing is built from the one Session's live, agent-visible Highlights in the order the
  requesting surface supplied (the Session's transcript order) and
  capped at 10. The packet is assembled row by row and rebuilt while it exceeds the cap with the
  last item removed, so the cap is a whole-item bound and no identity is ever split.
- A Briefing row carries the Highlight's identity precisely so that the Agent can resolve each row
  through the Agent surface's read-by-identity operation; the excerpt exists only to make the row
  recognisable. An excerpt is a
  collapsed one-line display form of the Quote, part of the packet only, never stored as a Highlight
  field and never delivered in place of the Quote.
- Attribution is resolved when the request is made, from the deployment setting, the Highlight's
  stored Session title and its date. It is appended by default; only an explicit deployment disable
  removes it. With Attribution disabled, or with no Session title to cite, no line is appended.
- Copy reports success only after an actual clipboard write. There is no network operation anywhere
  in a delivery, and no failure falls back to uploading text.
- Outcomes are values returned to the requesting surface, which reports them through the Notice
  channel; Delivery does not render Notices itself.

### Deferred Decisions

- **Inserting into another existing Session.** The destination model is the seam: a request already
  names one destination and a Pending insertion carries it, so a third destination form extends the
  destination value and the drain rule, not the Insertion contract. The map's [deferred
  decisions][map-deferred] name it.
- **Cancelling a Pending insertion.** The queue could expose a discard action; the seam is the
  Pending insertion's identity and its destination, so cancellation would be a new operation on the
  queue rather than a change to the Insertion contract. Not part of this specification.
- **Delivering a structured form rather than text.** The seam is the delivered form: it is the Quote
  plus at most the Attribution line, so a removable chip or a reference card would be a new
  destination contract and would leave the Insertion contract untouched. The Insertion contract
  assumes nothing about the Composer beyond its accepting text.

## Testing Strategy

- Treat each Acceptance Criterion as one observable outcome driven through Delivery's own action,
  with a controllable clock so the 24-hour expiry and the 2-second/10-second attempt window can be
  reached deterministically.
- Use a controllable Composer per destination that can be absent, mounted, busy, structured or
  editable, and that records exactly the text it accepted. Assert the delivered text character for
  character, including the Attribution line and its absence; assert that nothing was ever
  reformatted or truncated.
- Use a clipboard stand-in that can be absent, refuse or succeed. Assert Copy resolves true only
  after a real write, and assert that no delivery path performs a network operation.
- Cover the Briefing bounds at the boundaries: exactly 10 versus 11 candidates, excerpts at 119, 120
  and 121 characters, and a packet just under and just over the cap with a long identity at the
  tail, asserting the last surviving identity is intact.
- Cover Visibility with a mixed Session and a private-only Session; private Highlights must leave no
  text, excerpt or identity in a packet.
- Cover cross-Session behaviour: insert from Session B's Highlight into Session A; switch from A to
  B with a Pending insertion waiting; re-open with a Pending insertion waiting; and confirm nothing
  drains into the wrong Session.
- Cover duplication: repeat an insertion while it is pending, repeat it after it lands, and repeat
  an identical Briefing immediately after one was accepted.
- Cover reporting: every outcome maps to visible placed text, a Composer dock entry, or a Notice
  with a reason; no path reports `inserted` without the text being present.
- Assert read-only behaviour directly: a delivery request produces no Margin write.

## Out of Scope

- Inserting into another existing Session. The destination model and the map's deferred decisions
  name the seam; this specification supports the current Session and a new Session only.
- Choosing a destination anywhere else, and any destination picker or conversation list.
- The Composer's own behaviour: what it accepts, how it renders text, whether it offers a structured
  quote, and everything that happens after the Reader sends the message.
- The Agent's behaviour and its consent: whether the Agent consults the Margin, what its read
  surface exposes, and what it does with a Briefing are [Agent
  Access's](../../agent-access/CONTEXT.md).
- The visual design, placement and wording of the Composer dock and the Notice channel;
  [Presentation & Resurfacing](../../presentation/CONTEXT.md) owns those surfaces.
- Editing, annotating, starring, deleting or transitioning State; Reveal and browsing.
- Non-text content in a delivered Quote, such as images or attachments.
- Delivery off the machine beyond the clipboard: export, print and sync.
- Per-Highlight or per-Reader Attribution choice.
- Cancelling or reordering Pending insertions by the Reader.

## Open Questions

None outstanding. The five questions this specification raised are resolved:

1. **Briefing deduplication.** A request is "identical" only while the same packet is still Pending.
   Once it lands, repeating the request is a new request, because the Reader's intent may genuinely
   be to send the same text twice.
2. **Attribution's date.** The capture date (constraint 8): the citation identifies the source moment.
3. **Briefing omission disclosure.** The packet never discloses that private Highlights were excluded
   (constraint 7); the Reader-facing outcome may state the withheld count.
4. **What the Composer dock shows.** Enough to identify the waiting text and its destination
   (constraint 5), so waiting is never invisible in substance.
5. **A destination that disappears.** It fails at the next attempt with a stated reason rather than
   waiting for expiry (constraint 13). Cancelling a Pending insertion deliberately is a deferred
   decision, not an open question.

[map-deferred]: ../../../CONTEXT_MAP.md#deferred-decisions-and-the-seam-that-keeps-each-one-open
