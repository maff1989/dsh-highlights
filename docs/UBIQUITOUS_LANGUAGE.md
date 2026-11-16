# Ubiquitous language

**Status:** canonical for this package's domain documents.
**Owns:** the vocabulary every `docs/` document in this package, and every domain
specification and intent-level ADR beneath `docs/contexts/`, must use.

This glossary defines the language of the *margin* — the domain this plugin exists to
serve — not the language of its implementation. Three rules govern it:

1. **One meaning per term, one term per meaning.** Where a word is overloaded in the
   surrounding product or in the code, the collision is resolved explicitly (§10).
2. **Domain words describe the problem; machinery keeps machinery words.** Anchoring
   internals, transport, storage and rendering mechanics are named in the language of
   the solution, not forced into the Reader's vocabulary.
3. **The glossary governs documents, not code.** Where a code identifier disagrees with
   a term here, §12 records the disagreement. Renaming code to match is engineering
   work; this document is the target it is measured against.

The product name is **Highlights**. The domain is the **Margin**. *Highlights* names the
plugin and the Highlights in it; *Margin* names the whole of them and what they are for.

---

## 1. Actors

| Term | Definition |
|---|---|
| **Reader** | The person whose attention this plugin records: the owner of the Margin and its only human actor. Documents in this tree say *Reader* whenever the actor is the person marking, browsing or consulting the margin. *User* is DSH's word for the same person; use it only when quoting DSH vocabulary. **Not** *owner* — DSH already uses "owner" for an authenticated connection peer. |
| **Agent** | The model whose replies the Reader annotates. The Agent is a **guest** in the Margin: it may read what the Reader's consent exposes, and it may propose; it never writes. *Model* is used only in model-facing text (tool descriptions, skill body). |

There are no other people in this domain. The Margin is local, single-user, and has no
collaboration, sharing or membership concepts.

## 2. The core objects

| Term | Definition |
|---|---|
| **Margin** | The Reader's durable, private collection of **Highlights** over Agent **Replies**. The Margin lives outside the **Conversation**: it survives reload, re-render, archival and regeneration; it is not part of the **Session log**, is not exported, and is never Agent memory. This is the domain's central object and the reason the plugin exists. |
| **Highlight** | One entry in the Margin. It carries a **Quote**, presentation fields (**Colour**, **Tags**, **Note**, **Star**), judgement attributes (**Author**, **Intent**, **State**, **Visibility**), an **Anchor**, and its identity, timestamps and version. Two kinds: |
| **Span** | A Highlight of a contiguous passage selected inside one Reply (`kind = text`). The ordinary case. |
| **Mark** | A Highlight of a whole Reply, saved once as a bookmark of the page (`kind = message`). A **Reply occurrence** has at most one Mark; invoking Mark again on the same occurrence opens the existing one. |
| **Quote** | The verbatim source text of a Highlight: for a Span, the selected characters; for a Mark, the Reply text used to identify and display it. A Quote is bounded at 2000 characters: a longer Selection stores its first 2000 characters, and the Highlight never claims text it did not store. The Quote is **immutable**; it is also the Highlight's fallback identity when the Anchor no longer resolves. **Not** *snippet* or *excerpt* (§10). |
| **Anchor** | The durable binding of a Highlight to the place in the **Transcript** it came from. An Anchor is a **selector, not a pointer**: it records the Reply's identity, the Quote, the surrounding **Quote context** and a versioned record of where the passage sat inside that Reply, and it is *resolved* on demand. Owned by the Anchoring context and opaque to the Margin. |
| **Quote context** | The bounded run of text stored immediately before and after the Quote — at most 48 characters each side — that lets a recorded position be re-found after the Reply's rendered text shifts. Always qualified; never "*context*" alone (§10). |
| **Reply occurrence** | One rendition of a Reply in the Transcript. A regenerated Reply is a new occurrence, not a revision of the old one: the old occurrence's Highlights stay with it, and the new occurrence starts clean. A Mark belongs to one occurrence, so a regenerated Reply may carry its own Mark. |
| **Colour** | One of five fixed themed palette slots: 1 Amber, 2 Green, 3 Violet, 4 Blue, 5 Red. Violet (slot 3) is the quick-capture default when the Reader has expressed no preference; the Reader's most recently used Colour becomes the next quick-capture default. A presentation field; the Reader cannot define new colours. |
| **Tag** | A free-form lowercase label on a Highlight: at most 32 characters, at most 8 per Highlight, leading `#` stripped, whitespace collapsed, duplicates collapsed keeping first-use order. A presentation field. |
| **Note** | The Reader's free-form commentary attached to a Highlight, at most 2000 characters. A presentation field, and the most sensitive part of the Margin: the Agent surface never lists Notes, and a private Highlight's Note is never readable. An over-long Note is refused, never silently truncated — a Note is prose; a Tag is a label and is normalised instead. |
| **Star** | A boolean the Reader sets to flag a Highlight for attention. Resurfacing reads it. |
| **Author** | Whose judgement a Highlight carries: `user` — the Reader; or `agent` — an accepted **Proposal**. Absent means `user`. An Agent-authored Highlight carries a **provenance cue** in the Transcript (a dotted underline), so the Reader can always tell whose judgement a passage carries; the cue is presentation, and removing it must not change the record. |
| **Intent** | The speech act the Reader attaches to a Highlight, naming what kind of thing they are telling the Agent. A Proposal may carry a *suggested* Intent; it becomes the kept Highlight's Intent only because the Reader kept it. The Agent can never change the Intent of an existing Highlight. Exactly four: `note` — an observation for the record (default); `dispute` — a disagreement with, or correction of, the Reply; `direct` — an instruction the Agent should carry forward; `remember` — a fact worth retaining. |
| **State** | How far the Reader has processed a Highlight: `new` → `kept` → `compiled`. `new` means captured but not yet judged; `kept` means "I have decided this matters"; `compiled` means "this made it into something I produced". State moves only by explicit Reader action, in either direction, and is never derived from activity; reaching `compiled` locks nothing, so a Highlight may return to `kept` or `new`. **Not** *status*, *cursor* or *lifecycle* (§10). |
| **Visibility** | The per-Highlight ceiling on Agent access: `agent` (no per-item restriction; the default) or `private`. A private Highlight does not exist for the Agent surface — it is not listed, not fetchable, not counted, and its existence is not disclosed; above all, its Note is never readable. A ceiling **under** the installation-wide consent: it can always be narrower, never wider. |
| **Provenance** | The combined record of how a Highlight entered the Margin and whose judgement it carries: its **Author** plus the route — a direct save by the Reader, or a kept Proposal. Provenance is a property of a Highlight, not a separate object. |
| **Live Highlight** | A Highlight that is not a Tombstone — the only kind that is listed, counted, delivered or exposed under Consent. |
| **Tombstone** | A deleted Highlight, retained with the moment of deletion, hidden from every surface and restorable. Deleting creates a Tombstone; it is **not erasure**. The only thing that removes the Quote is a purge after the retention window, performed when the store next opens (a Host start), never on a timer. |
| **Snapshot** | The display values stored on a Highlight at capture time — Session title, workspace identity — used when the live Session cannot be resolved. A Snapshot is a fallback, never a claim about current state: the live value wins whenever it resolves. |
| **Origin** | The installation that created a Highlight, stamped on it so a future sync can reason about provenance. Never rendered. |

## 3. Capture

| Term | Definition |
|---|---|
| **Capture** | The act of turning a selection into a Span, or a Reply into a Mark. A Capture has an author: the Reader's, or — through a kept Proposal — the Agent's. |
| **Highlightable** | Eligible to become a Highlight: the text of a **settled Reply only**. Reasoning, user messages, tool calls and their output, injected context, streaming or interrupted text, composer text and the **Trajectory view** are not Highlightable. Eligibility is a property of the *source*, not of the Reader's gesture. |
| **Settled** | A Reply that has finished streaming and is final. Nothing under a streaming or interrupted reply is Highlightable. |
| **Selection** | The browser's live text selection. Borrowed vocabulary; a Selection is not a Highlight. Distinguish the **Chat selection surface** (Chat's own Quote affordance, upstream) from the **Highlight selection bar** (ours, §8). |

## 4. Resolution

| Term | Definition |
|---|---|
| **Resolution** | Finding the Transcript range an Anchor designates. Resolution reads the Transcript; it never writes to it. |
| **Resolution state** | Where a Highlight stands relative to the Transcript: `anchored` — the passage is found; `unanchored` — it cannot be found *now* and may return; `archived` — the owning Session is archived; `unavailable` — the owning Session is gone. Findability and Session availability are separate facts — a Highlight may be both archived and unanchored — and a surface reports one state with the precedence `unavailable` → `archived` → `unanchored` → `anchored`, because the Session's state decides what the Reader can do next. No resolution state ever deletes or edits a Highlight. |
| **Unanchored** | The canonical word for a Highlight whose Anchor does not resolve. *Orphan* and *orphaned* are deprecated aliases (§10). |
| **Re-anchor** | Attaching an existing Highlight to a new Anchor without changing its identity, Quote, presentation fields or judgement attributes. Permitted while the Highlight's Quote still exists in its Reply. |
| **Reveal** | The Reader-facing act of bringing a Highlight's passage into view: open the owning Session, page history as needed, and scroll the anchored passage — not merely its reply — into view. Best effort and never an error path. *Jump* is a deprecated alias (§10). |

## 5. Judgement and resurfacing

| Term | Definition |
|---|---|
| **Keep** | *Verb, Proposals only:* accepting a **Proposal**, which creates an Agent-authored Highlight through the ordinary Capture path. The noun *kept* is the **State** value and is not the same thing (§10). |
| **Dismiss** | *Verb, Proposals only:* rejecting a Proposal. Nothing is stored, nothing is edited, nothing is deleted. |
| **Compile** | *Verb:* moving a Highlight to `compiled` — it made it into something the Reader produced. |
| **Resurfacing** | The deliberate reappearance of Highlights that the data can justify showing again. Exactly four reasons exist, each provable from stored data, one per row: **Starred and new** (starred, still `new`); **Kept and not compiled** (the State's promised next step); **Text changed** (the Anchor no longer resolves in its own live Session); **Stale and new** (unchanged for 30 days, still `new` — the clock runs from the last change, and reading a Highlight is not a change). Resurfacing never ranks, scores or guesses, and silence is the correct output when no reason holds. |
| **Worth another look** | The surface that presents Resurfacing candidates, each with exactly one reason. |
| **Digest** | The per-turn line in the Transcript reporting counts — e.g. `2 highlights · 1 kept` — that opens the Session tab. A Digest reports counts, never content, and never judges. |
| **Kept badge** | The count of `kept` Highlights shown on a Session row, with a hover preview. The count is the number of `kept` Highlights and nothing else; the preview may lead with those and may include other recent Highlights only if each row states its State, so a non-kept item is never presented as kept. |

## 6. Consent and the Agent surface

| Term | Definition |
|---|---|
| **Consent** | The Reader's grant that makes any part of the Margin Agent-readable. Consent has three parts: an **Access level** (installation-wide), an **Access scope** (the widest range readable), and per-Highlight **Visibility**. The shipped default is `off` with scope `session`: nothing is readable and no Agent surface exists. |
| **Access level** | `off` — no tools, no skill, no model-facing surface at all; `read` — the Agent may list and fetch; `read-write` — it may additionally propose. |
| **Access scope** | The widest range the Agent may read: `session` (the calling Session), `workspace`, or `all`. A call may narrow the scope; nothing may widen it. |
| **Proposal** | An Agent-suggested Highlight awaiting the Reader's decision. A Proposal is not a Highlight: nothing is stored until it is kept, and a dismissed Proposal leaves no trace. The Agent can never edit, delete or restate an existing Highlight. |
| **Agent surface** | What the Agent sees when Consent allows: the read pair `list_highlights` and `get_highlight`, the proposal tool `highlight_write` at `read-write`, and the runtime skill `highlights` that teaches when the Margin is worth consulting. The Agent surface is a *tool*, never a prompt section: nothing from the Margin is injected into a request. |
| **Guest rule** | The one-sentence contract of the Agent Access context: *the Agent reads only what Consent exposes, only when it asks, and writes only proposals the Reader may keep.* Every spec restates it; no surface may weaken it. |

## 7. Delivery

| Term | Definition |
|---|---|
| **Insertion** | Delivering a Highlight's Quote into a composer as text. Destinations are the **current Session** or a **new Session**. |
| **Pending insertion** | An Insertion the plugin accepted but has not placed because the destination composer was not editable. A Pending insertion is retried, survives a Session switch and a page reload, expires after 24 hours, and is visible in the **Composer dock** while it waits. It holds its own copy of the text: deleting the source Highlight does not retract it, which is why the queue stays visible. |
| **Briefing** | One Insertion packet built from up to 10 Highlights of one Session: a header naming the Session, then one row per Highlight with a short excerpt, the Highlight's identity and its State. A Briefing exists so the Agent can resolve each Highlight by calling `get_highlight`; private Highlights are never included. |
| **Attribution** | The `— from <Session title> · <date>` line appended to an Insertion when the deployment enables it. Attribution is a deployment choice, not a per-Highlight one. |
| **Copy** | Putting a Quote, with its citation when Attribution applies, on the clipboard. Copy is the only way text leaves the Margin; nothing is uploaded. |

## 8. Reader-facing surfaces

Surfaces are the places the Margin becomes visible or actionable. Each owns exactly one
job; a surface that needs another's job calls it rather than restating it.

| Surface | Job |
|---|---|
| **Highlight selection bar** | The plugin-owned bar shown on a right-click over a Highlightable Selection: five colour dots (immediate Capture), **Annotate** (opens the Annotation popover), and **⋯ More actions** (Copy selection, Browser menu). It is *ours*; Chat's own selection surface is upstream and distinct. |
| **Annotation popover** | The compact editor opened by **Annotate**: Colour, Intent, Tags, Note. Save or cancel. |
| **Item card** | Left-click on painted text: the Highlight's Quote, Tags, Note, Colour and Star, with Save and a ⋯ menu (show in conversation, insert, copy quote, delete). |
| **Session tab** | The owning Session's Highlights in transcript-position order, with search, filters and row actions. Opened from the Session header or a row. |
| **Global page** | Every Session's Highlights grouped workspace → Session, with search, filters, Resurfacing, and full row actions. |
| **Assistant action row** | Chat's per-reply action row, where **Save to highlights** creates a **Mark**. |
| **Turn digest** | The per-turn count line (§5) that opens the Session tab. |
| **Kept badge** | The Session-row count and hover preview (§5). |
| **Composer dock** | The strip above a composer that shows a Pending insertion rather than hiding it. |
| **Undo** | Restoring a Tombstone from the surface that reported the deletion. Every deletion is recoverable this way; the surface may differ, the recoverability may not. A Reader may suppress the prompt, but no preference may remove the recovery path or shorten the retention window. |
| **Notice** | The single transient message channel for outcome feedback (saved, copied, queued, conflict, capability warning). **Not** *toast* (§10). |
| **Session-row context menu** | The Session row's (and Session tab's) own menu: copy this Session's Highlights as Markdown, open the Session tab, brief the Agent. It acts on a Session, never on one Highlight. |
| **First run** | The empty state that teaches the gesture, names the chord that registered, and states whether the Agent can see the Margin. |
| **Proposal row** | The in-transcript row that presents an Agent **Proposal** and offers **Keep** or **Dismiss**. Its semantics are Agent Access's; presenting it is Presentation's. A Proposal row is not a Highlight and never appears in a list. |

## 9. Borrowed vocabulary (DSH-owned; never redefined here)

These terms belong to the harness. Documents use them in DSH's sense and must not give
them plugin-specific meanings.

| Term | What it means here | What the plugin must not assume |
|---|---|---|
| **Conversation / Chat** | The rendered transcript of one Session. | That it offers a seat inside a Reply body; it does not. |
| **Transcript** | The Conversation's scrollable rendered view. | That it is virtualized (the transcript is not; the Turn rail and Trajectory table are). |
| **Reply** | The assistant's finalized answer to one Step. | That every Reply is settled, highlightable, or addressable by a stable message id. |
| **Reasoning** | The model's thinking text, shown separately from the Reply. | That it is highlightable; it is not. |
| **Tool call** | A model-invoked tool invocation and its rendered output. | That it is highlightable; it is not. |
| **Turn** | One user–assistant exchange, containing one or more Steps. | That a Turn is always expanded, or its rows always mounted. |
| **Step** | One model step inside a Turn. | That Steps map one-to-one to Replies (a Step may have a reasoning part and a reply part). |
| **Session** | One conversation with its own log and identity. | That a Session is always present, archived-never, or readable after deletion. |
| **Workspace** | The project scope a Session belongs to. | That a Session's workspace is stable over time. |
| **Profile** | The installed plugin/bundle composition the GUI runs. | That the plugin can change the profile; installation is user work. |
| **Session log** | The append-only durable record of session events. | That Highlights are in it; they are deliberately not. |
| **Composer** | The text input the Reader types into. | That it is always editable, or that it accepts structured quotes. |
| **Trajectory view** | The per-Session tabular view of model events. | That it can host or paint a Highlight; it cannot. |
| **Connection / Peer** | The authenticated transport between the browser and the Host. | That it provides per-record authorization; it does not. |
| **Storage domain** | The harness facility for durable, versioned plugin data. | That it is a database with queries; it is a document store. |
| **Chat selection surface** | Chat's own floating affordance over a text selection (Quote). | That the plugin can share it; it cannot. |
| **Message** | DSH's identity for one conversation message (as in a message id). | That a Reply is a Message; a whole-Reply Highlight is a **Mark**, not a Message. |

## 10. Collisions and rulings

These words appear with different meanings in the product, the code, or the engineering
records. The ruling is binding for documents in this tree.

| Word | Competing meanings | Ruling |
|---|---|---|
| **Context** | A bounded context; the stored ±48 characters around a Quote; the runtime context DSH injects into a model request. | *Context* alone means **bounded context**. Say **Quote context** for the stored text window, and **runtime context** for DSH's injected material. |
| **State** | The `new`/`kept`/`compiled` progression; an Anchor's resolution outcome; connection health. | *State* alone means the processing progression (§2). Always qualify the others: **Resolution state**, **connection state**. |
| **Cursor** | The processing progression; an opaque pagination token in list queries. | Both are real but different. Say **State** for the progression and **page cursor** for pagination. Never *state cursor* in a document; that is a UI label, not a domain term. |
| **Keep / kept** | Accepting a Proposal; the `kept` State value. | *Keep* is a verb that applies to **Proposals only**. *Kept* in any other sentence refers to the State. |
| **New** | The `new` State value; a newly created Session. | Say **`new` Highlight** or **`new` State**; say **new Session** for the other. |
| **Mark** | Noun: a Highlight of a whole Reply. Verb: to save a Highlight of any kind. | Both are legitimate; the noun is capitalised **Mark** and is a kind of Highlight, the verb is lower-case *mark* and always takes an object (*mark this reply*). |
| **Item / record** | Code and engineering records use both for a Highlight. | Not domain terms. Say **Highlight**. *Record* survives only in code-identity tables and in the Persistence context's machinery contract name **record store**, where it denotes the stored document, never a Highlight. |
| **Note** | The Note field on a Highlight; a kind of Intent. | The field is **Note** (capitalised). The Intent value is `note` (code-formatted). A sentence using "note" as a verb is not domain language. |
| **Annotation / annotate** | A synonym for a Highlight; the act of filling in Colour/Intent/Tags/Note. | *Annotation* is not a Highlight. **Annotate** is the act of editing a Highlight's presentation and judgement fields; the **Annotation popover** is the surface that does it. |
| **Orphan / orphaned** | A Highlight whose Anchor no longer resolves. | Say **Unanchored**. Both spellings are deprecated. |
| **Jump** | Opening a Highlight's passage. | Say **Reveal**. |
| **Toast** | A transient message. | Say **Notice**. |
| **Snippet / excerpt / text** | A Highlight's Quote or a shortened form of it. | Say **Quote**. A shortened Quote for display is an *excerpt* and is never stored. |
| **Read and annotate** | The UI label for the `read-write` Access level; annotation. | The label overstates the grant: the Agent may **read and propose**, never annotate. Documents say `read-write` and define it as read-and-propose; the label is a copy defect to fix in the product, not a domain sense. |
| **Visibility (observation gating)** | Per-item Agent visibility (this glossary); whether a panel or tab is rendered. | The harness already uses "visibility" for whether a surface is rendered. Never use it unqualified for that; say **rendered** or **on screen**. |
| **Selection** | The browser's live selection; a Highlight. | A Selection is not a Highlight. Say **Selection** only for the browser's, **Highlight** for the stored item. |
| **Panel / tab / page** | The right-panel Session list; the left-nav global list. | **Session tab** and **Global page**; *panel* and *page* alone are ambiguous. |
| **Delete** | Creating a Tombstone; purging a Tombstone. | **Delete** creates a Tombstone and is undoable. **Purge** is the irreversible retention action and is not a Reader action. |
| **Capture / create** | Turning a selection into a Highlight; writing a record. | **Capture** is the Reader-facing act; *create* is machinery. |
| **Model** | The Agent; an implementation of the model interface. | **Agent** in domain documents. |

## 11. Naming rules that carry the language into artifacts

- Tags are stored and displayed lowercase; a leading `#` is input sugar, never stored.
- Colour slots are numbered 1–5 and named Amber, Green, Violet, Blue, Red. Documents may
  use the name or the number, never a hex value or a user-invented colour name.
- Highlight identities, Anchor positions and version numbers are opaque values. A document
  may say a Highlight *has* an identity; it must not describe its format unless the format
  is itself the contract.
- A Session title or workspace name shown on a Highlight is a **Snapshot** until the live
  Session resolves it; do not call a Snapshot "the Session's title".
- Proposals are named by what they are (*proposal*), never by the tool that produced them.
- The two approval verbs are **Keep** and **Dismiss**. There is no *accept*, *approve* or
  *reject* in this domain.
- Counts of State are counts of Highlights, never "items" or "records".
- When a document must refer to a technical object that is not a domain term (a transport
  route, a storage layout, a paint registry entry), it says so explicitly and points to
  the engineering records rather than inventing a domain noun for it.
- A specification may add **feature-local terms** (for example "Attempt window", "Packet cap",
  "Ambiguous match", "live Highlight") in its own Definitions section, but only for concepts
  local to that specification. A term another context will need belongs here first.

## 12. Code identity and known disagreements

This table lets a reader move between the language and the implementation without the
language leaking into either. It is a reconciliation aid, not a specification.

| Domain term | Code identity |
|---|---|
| Highlight | `HighlightRecord` |
| Span / Mark | `anchor.kind = 'text'` / `'message'` |
| Quote / Quote context | `anchor.quote` / `anchor.prefix`, `anchor.suffix` |
| Anchor | `HighlightAnchor` (owned by `src/client/anchor/`) |
| Author | `author` (`user` \| `agent`) |
| Intent | `intent` (`note` \| `dispute` \| `direct` \| `remember`) |
| State | `state` (`new` \| `kept` \| `compiled`) |
| Visibility | `visibility` (`agent` \| `private`) |
| Consent | persistent settings record (`agentAccess`, `agentScope`), plus per-Highlight `visibility` |
| Proposal | `highlight_write` tool → proposal rows → Keep writes a Highlight |
| Judgement attributes | `src/shared/provenance.ts` (zod-free) |
| Agent surface | `src/host/tools.ts`, `src/host/skill.ts` |
| Resurfacing | `worthReview` / `WorthReason` in the page grouping selectors |
| Reveal | `reveal` action |
| Insertion / Briefing | `insert` / `briefSession` actions, pending-insertion queue |
| Notice | notice service / `NoticeOverlay` |

Known disagreements between this glossary and the code, to be reconciled by engineering
work rather than by editing this document:

- The `AnchorSchema` and `AuthorSchema` comments mention intents `assert` and `commit`;
  the actual Intent values are `note`, `dispute`, `direct`, `remember`. The glossary is
  authoritative; the comments are stale.
- Code calls an Unanchored Highlight "orphaned" (`orphanedIds`, "Orphaned" badge text).
  The glossary term is **Unanchored**.
- The UI label "state cursor" is a label, not a domain term; see the *Cursor* ruling.
- "Panel", "page", "card" appear in code and engineering records; §10 fixes the
  domain names for documents.
