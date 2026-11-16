# Intent — the margin

**Read this for:** why this plugin exists — the problem it answers, the three jobs it
does, the principles that constrain every design decision, and what it refuses to be.
**Companions:** [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md) (the words),
[`CONTEXT_MAP.md`](CONTEXT_MAP.md) (the boundaries), [`ARCHITECTURE.md`](ARCHITECTURE.md)
(the shape).

## 1. The problem

Agent replies are long, dense and *read*. A reader working through a conversation makes
judgements continuously: this claim needs checking, that direction is right, remember
this figure, disagree with this paragraph. Those judgements are the most valuable thing
the reader produces — and the conversation is the worst possible place to keep them.

The transcript is a **stream**, not a book:

- It is **ephemeral in practice**: scrolling away, switching Sessions, regenerating a
  reply, folding a Turn or archiving a Session all make a passage harder to find again.
  Reloading the page loses the reader's place entirely.
- It is **undifferentiated**: every paragraph looks equally important, because the
  importance lives in the reader's head, not in the text.
- It is **navigable only by time and scroll**. "Where was the bit about the migration
  order?" has no answer other than re-reading.
- It offers **no memory of attention**. What the reader decided to keep, doubted or
  wanted to act on is invisible the moment they move on.
- It gives the reader **no way to hand a passage forward** — into a new conversation, a
  note to self, or the next prompt — without copying text by hand and losing where it
  came from.
- It gives the *agent* **no honest way to know** what the reader cared about, and no
  honest way to ask.

Message-level feedback exists in the harness, but it is coarse and binary: one thumb on
a whole reply says nothing about the one paragraph that mattered. What is missing is a
**margin**: the place a reader writes in the space beside the text, and returns to.

## 2. What the margin is

The **Margin** is the reader's durable, private, local collection of **Highlights** over
agent replies — each one a saved passage or a saved reply, with a colour, tags, an
optional note, a star, an author, an intent, a processing state and a visibility — bound
to the place it came from and readable by the agent only when the reader says so.

Four commitments define it, and they are not negotiable per feature:

1. **It belongs to the reader.** The margin records the reader's attention and judgement,
   not the agent's output. The agent is a guest in it.
2. **It outlives the transcript.** A Highlight keeps its quote and its identity when its
   anchor breaks, its Session is archived or deleted, or the reply is regenerated.
   Anchoring is best effort; the artifact is not.
3. **It is honest about what it cannot do.** A passage that can no longer be found is
   shown as unanchored, never silently dropped; a count is a count of what is stored,
   never an inference; nothing is deleted automatically and nothing is claimed that the
   data cannot prove.
4. **It costs nothing until it is wanted.** With agent access off — the default — the
   margin is invisible to the model: no tools, no prompt section, no injected context,
   no tokens. Resurfacing is silent unless a stored fact justifies a row. Capture is one
   gesture; the annotation editor is there when the reader wants it and absent when they
   do not.

## 3. The three jobs

The product exists to do exactly three things well. Every surface and every context
serves one of them; a feature that serves none does not belong.

### 3.1 Notice — capture what the reader notices, at reading speed

The reader selects text (or marks a whole reply) and the highlight is saved. The default
path is **one gesture and no form**: pick a colour, done. Richer annotation — intent,
tags, note — is available behind one more gesture, never required. A capture is
immediate: the highlight is painted before the write is confirmed, and a write that
loses a race keeps the reader's draft rather than discarding it.

The judgement fields exist because "highlighted" is not a single act: an observation, a
disagreement, a direction and a fact to remember are different things, and the agent
should be able to tell them apart when it is allowed to see them. The processing state
exists because attention has a lifecycle: captured, decided, and used.

*Success looks like:* the reader never leaves the conversation to save a thought, never
fills a form they did not ask for, and never loses a highlight they just made.

### 3.2 Return — find it again, and trust what is found

Three ways back: the painted text in place, the Session tab for the conversation in
front of you, and the Global page across every Session. Search, filters and grouping make
the collection navigable after months. Reveal takes the reader back to the exact passage
— opening the Session and paging history when needed — and treats a passage it cannot
recover as a stated outcome, not an error.

Resurfacing ("worth another look") is the margin's only active voice: a small, silent
block that says *why* a stored Highlight is worth a second look — starred and still new;
kept but not compiled; text changed; stale and untouched for a month. It never ranks, never
scores, never guesses, and shows nothing when there is nothing to say.

*Success looks like:* months later, the reader can answer "what did I keep about this?"
quickly, and every row explains itself.

### 3.3 Hand forward — deliver the margin without losing it

The reader can put a highlight where it is useful next: as a verbatim quote in the
composer of the current Session or a new one, with an optional attribution line; as one
**briefing** packet of up to ten highlights from one Session, carrying each Highlight's
identity so the agent can resolve it; or by letting the agent consult the margin through
the consent-gated tool surface.

Delivery never mutates the margin. A delivery that cannot land immediately waits in a
visible pending queue and expires with a stated reason. Private Highlights never leave.

*Success looks like:* the reader can start a new conversation from what they learned in an
old one, and the agent can answer "what did I keep about this?" by reading, not guessing.

## 4. Design principles

These principles are the reason the contexts are shaped the way they are. Where a document
appears to make an arbitrary choice, this list is the reason.

1. **The transcript is evidence, not storage.** The margin lives outside the
   conversation, uses the transcript only as a way back to the place it came from, and
   never depends on the transcript to remain intact. A broken anchor costs a link, never
   the highlight.
2. **The margin's first reader is the reader.** Every surface exists for the person who
   marked the passage. The agent surface is a handoff, not the audience; that is why it
   is off by default, why it is pull-only, and why it may never write.
3. **Consent is structural, not a setting on a screen.** The agent cannot reach the
   margin unless the reader granted it, cannot widen what it was granted, cannot see a
   private item, and cannot see notes through the list. Turning access off removes the
   surface rather than hiding it.
4. **Silence is a feature.** No badges that claim more than stored counts; no
   recommendations without a provable reason; no notices for things that succeeded
   quietly; no prompt material injected into the model's request. The margin should be
   felt only when it is wanted.
5. **Degrade honestly, never silently.** Unanchored, archived, unavailable, stale and
   conflict are all first-class outcomes with a name, a place and a sentence the reader
   can act on. Best effort is acceptable; a silent failure is not.
6. **Reversible by default.** Deletion creates a tombstone that can be undone; nothing is
   ever removed automatically because it stopped resolving. Purging after a retention
   window is the only irreversible act, and it is stated plainly.
7. **Capture fast, annotate later.** The default capture is the cheapest possible; depth
   is progressive disclosure, never a toll gate. If an annotation cannot be skipped, it
   will not be used.
8. **One place decides each thing.** One resolution ladder, one consent gate, one store,
   one notice channel, one owner per stored fact. Duplicated ownership is a bug in the
   design, not a detail to clean up later.

## 5. What the margin is not

Explicitly out of scope, now and in the foreseeable intent. Each of these is a plausible
product that would make the margin worse if it absorbed it.

- **Not agent memory.** It is not a vector store, a retrieval index, a summarised context,
  or an automatic prompt section. Nothing is injected; the model reads only by asking.
- **Not agent-authored.** The agent may propose; the reader decides; only the reader's
  keep creates anything. The agent never edits, stars, deletes or reorganises.
- **Not collaborative.** One reader, one profile, no sharing, mentions, membership or
  permissions beyond the reader's own single-user trust.
- **Not analytics.** The margin does not score reading, measure engagement, profile
  interests, or recommend content.
- **Not a document editor.** The reader marks; they do not restructure, rewrite or
  annotate the conversation itself. The transcript is never modified.
- **Not ambient automation.** No automatic highlighting, no silent capture, no
  background summarisation, no "smart" surfacing beyond the four provable reasons.
- **Not a conversation browser.** The margin does not search the conversation, index
  messages, or replace the Session list.
- **Not multi-device, yet.** There is no sync, export or print; the design keeps the
  door open (identity, origin, versions, tombstones) without promising the room.
- **Not universal.** Only the text of settled replies is highlightable. Reasoning, user
  messages, tool output, injected context, composer text and the Trajectory view are
  outside the domain — by choice, because they are not the reader's reading material in
  the same sense.

## 6. Who it is for

One person: the **Reader**, working alone at their own machine, reading agent output
that matters enough to come back to. The reader's profile is the trust boundary; there
is no other actor, no team, no server. The **Agent** is a party to the margin only by
permission and only as a guest.

The reader this is built for is not the person who wants a filing system. They are the
person who reads carefully and forgets quickly, and who wants the tools out of the way
until the moment they are needed.

## 7. The tensions the design accepts

Every one of these is a real trade-off, decided on purpose, and each is recorded in the context that
owns it — as an ADR where the decision is hard to reverse, otherwise as a constraint in its
specification.

| Tension | The side this design takes | Where the decision is recorded |
|---|---|---|
| Capture speed vs annotation richness | Speed wins; richness is progressive disclosure | Presentation & Resurfacing |
| Convenience vs consent | Consent wins; the agent asks and may be refused | Agent Access |
| Durable knowledge vs transcript truth | The stored quote wins; the anchor is best effort | Anchoring |
| Completeness vs honesty in lists | Honesty wins; counts and reasons are exact or absent | Presentation & Resurfacing |
| Automation vs attention | Nothing happens automatically except by a stored, provable rule | Presentation & Resurfacing |
| Convenience vs reversibility | Reversibility wins; deletes are tombstones | Margin |
| Isolation vs integration | The margin stays outside the Session log and outside the model's request | Persistence & Distribution |
| One powerful store vs two stores | One store, two authors, one contract | Margin |

## 8. How to use this documentation

- [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md) — the words; read before writing
  anything about this product.
- [`CONTEXT_MAP.md`](CONTEXT_MAP.md) — the six contexts, their relationships with each
  other and with the harness, and the contracts between them.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the shape of the solution: two halves, inward
  dependencies, deep modules, seams, and what must never break.
- [`contexts/`](contexts/) — one directory per bounded context, each with its
  `CONTEXT.md`, its domain specifications, and its intent-level ADRs.
- `known-limitations.md`, `implementation-notes.md`, `issue-log.md`, `upstream-asks.md`,
  `workaround-ledger.md` — the engineering record. These are the status of the build;
  this tree is the intent it is measured against. Nothing in the intent documents
  restates implementation status.
