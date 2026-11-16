# Known limitations and deferred work

Reference companion to `README.md`. Every entry states the behaviour you will
actually observe, why it is that way, and what (if anything) mitigates it.
Nothing here is a promise of future work unless the entry says so.

See [`issue-log.md`](issue-log.md) for the defects found and fixed, and
`ADRS.md` (project root) for the decisions behind the current behaviour.

## 1. Scope of what can be highlighted

| Case | Behaviour |
|---|---|
| Assistant reply text | Highlightable. A settled (non-streaming) assistant step exposes Chat selection sources. |
| Reasoning / thinking | Not highlightable. Selection sources inside `[data-variant="think"]` are rejected; no anchor can exist there. |
| User messages, tool calls and output, injected context, composer text | Not highlightable. The capture path requires an assistant node (a `data-chat-node-key` built from the `assistant-step` definition kind, e.g. `14:assistant-step7:6`) and a Chat text-interaction source. |
| Selections spanning two sources | Rejected: two different source elements cannot share one anchor. A single-source selection whose other endpoint is **outside every source** is clamped to the source when the out-of-source part is whitespace (Chromium's block selection ends at the next block boundary); visible text dragged in from outside stays rejected. |
| **Trajectory view** | **Excluded.** The Trajectory view exposes no Conversation selection sources and no paint seat, so highlights are neither created nor painted there. A highlight created in the Conversation view still lists and still reveals through the Conversation panel. |
| Streaming replies | Not highlightable until the reply settles; Chat does not offer a selection source for in-flight text. |
| Block selection (double-/triple-click) | Selectable and highlightable the same way as a drag: its block-boundary spill is clamped to the source when the spill is whitespace, so a right-click captures the paragraph. The selection alone never opens the plugin bar. |
| Selections longer than 2 000 characters (`MAX_QUOTE_CHARS`) | The stored `quote` is truncated to the cap while `start`/`end` keep the full projection offsets. Display, copy and search use the truncated quote; re-anchoring relies on it, so an edit inside the unquoted tail can make the item stale. |

Whole-message marks (`anchor.kind = "message"`) store the reply's first 2 000
characters as their display quote; they are not affected by the selection-span
rules above.

## 2. Painting (CSS Custom Highlight API)

- **Browser support.** Text-highlight fills are drawn by the plugin's own overlay
  (`.dshhl-highlight-layer`, one rounded/padded box per line box), so rounded
  marker fills work without the CSS Custom Highlight API. `CSS.highlights` is
  still used for text colour; without it text colour is unavailable and the
  page/tab shows the "this browser can't paint highlights" notice. Whole-message
  marks are drawn by the overlay as a rounded band behind the reply, not as a
  character-level wash, so they remain visible without the API. Chromium 105+, Safari 17.2+, Firefox 140+ support the
  highlight pseudo. The GUI shipped with DeepSeek Harness is Chromium-based.
- **No DOM mutation.** Highlights are painted from `Range` objects in the
  document-global registry, not by wrapping text in `<mark>`. This is deliberate
  (it keeps React reconciliation and the streaming cache untouched) and is the
  reason painting is out-of-band rather than a renderer decoration; see
  `docs/upstream-asks.md` ask 1.
- **Ranges are fragile, repaint is automatic.** Any transcript mutation
  invalidates stored `Range`s. A `MutationObserver` re-resolves and repaints on
  the next animation frame; during streaming this is the dominant cost. The
  rounded fill overlay is re-geometried on the same pass, on a `ResizeObserver`
  for the transcript boxes (a right-panel toggle reflows the conversation
  without a window resize), and on viewport resize; its host lives inside the
  transcript scroller, so the fill is ordinary
  scroll content and moves with the text on the compositor (no scroll handler). A highlight whose anchor stops resolving is painted no more and
  is reported as unanchored through the store's `stale` set.
- **Painting is not semantics.** Assistive technology is not informed that a
  span is highlighted. The lists carry the quote as their accessible name and
  mark state; the in-text paint is visual only.
- **Reveal is an instant landing with no flash/animation.** The earlier glow was
  disabled because its animation loop added typing/interaction cost. Reveal pages
  history only when the target is outside the mounted window, then writes the
  final scroll offset once (no smooth animation, no `scrollend` wait) and leaves
  the normal highlight visible. The flash API is a no-op kept for a possible
  quieter future effect.
- **A page reveal costs a Chat remount, and that cost is Chat's.** Revealing from
  the global Highlights page leaves the page and mounts the conversation: DSH
  remounts Chat and `loadThrough` pages the target's history in, so the press
  pays a conversation mount whose cost grows with the turns now mounted (measured
  on a 35-turn transcript: ~2.1 s longest main-thread task, headless software
  rendering, of which the plugin's overlay paint is ~0.3 s and Chat/DSH ~2.0 s).
  The plugin does not leak or accumulate — with the two-phase overlay paint
  (ADR-021) it adds one layout per paint instead of one per record. A page
  refresh drops the mounted history, which is why that used to look like a fix. A
  public reveal API (upstream ask 2) is the way to keep Chat's own paging/scroll
  bookkeeping in charge and to stop paying for a page→conversation remount.

## 3. Anchoring, reveal, and orphans

- **Anchor resolution is best effort.** The ladder is: recorded position
  verified by quote and context → unique quote match → best of several quote
  matches → stale. Regenerated replies, edited message content, a changed text
  projection, paged-out history, a folded turn, an archived Session, or a
  Session file deleted out of band can all leave an item stale.
- **Stale items are never deleted automatically.** They render with an
  **Unanchored** badge, keep their stored quote/prefix/suffix, and can still be
  copied, edited, or deleted. Lists show unanchored items by default; the global
  page offers a "Show unanchored" toggle to hide them (it appears only when at
  least one item is unanchored). The right-panel tab has no orphan filter and
  always shows the Session's stale items.
- **No re-anchor in the UI.** The Host route exposes `reanchor` and the
  transport exposes it, but V1 ships no button or gesture that calls it. A
  stale item therefore stays stale until future work wires the affordance.
- **Reveal can land folded.** Reveal opens the Session, returns to the
  Conversation panel, pages history back via `loadThrough(nodeSeq)` when the
  node is not mounted, waits up to 2.5 s for the row, scrolls it into view, and
  reveals the resolved range (the optional flash is currently disabled). The search is scoped to the target Session's
  conversation root and uses the response seat, so a Session switch cannot
  scroll the previous conversation. If the node stays inside a folded turn or
  never mounts, the Session is still open, no scroll happens, and the
  caller surfaces a "could not find that text" notice (no retry loop). Reveal
  is an affordance, not a guarantee.
- **Archived and missing Sessions.** Items remain listed. Opening an archived
  Session is subject to the harness's normal archived-Session rules, which the
  plugin does not override; a Session file removed out of band leaves items
  listed but unrevealable.
- **Pre-P0 whole-message marks captured on the reasoning seat are not repaired.**
  The P0 response-seat fix applies to new marks and to all normal highlight
  resolution. A message mark created before the fix (only possible on a reply
  that split reasoning/response seats) may still hold the thinking text and a
  `groupPart: "reasoning"` anchor; it resolves stale and the dedupe prevents
  re-marking the same node until that old record is deleted. The live store had
  no message marks when this was documented, so this is theoretical here.
- **`nodeSeq` is best effort.** It is captured only when the Chat snapshot
  resolves it; without it, reveal degrades to waiting for the already-loaded
  row and cannot page history in.

## 4. Storage, caps, and erasure

- **Location.** `<DSH_HOME>/storages/highlights/` — `records/<uuid>.json` (one
  `{ version, record }` document per item) and `meta/install.json`. On the
  default installation `DSH_HOME` is `~/.dsh`, so records live in
  `~/.dsh/storages/highlights/`. A profile run with a private `DSH_HOME` keeps
  its own store.
- **Single-writer, local.** One Host process owns the domain. There is no
  cross-process compare-and-set and no inter-process change notification:
  another Host process writing the same directory is outside V1's model.
- **Cap.** `maxRecords` (default 10 000, min 100, max 100 000) is enforced
  before a create; exceeding it returns `limit-exceeded` and the UI shows a
  hint. Nothing is silently dropped, but a full store refuses new highlights
  until items are deleted.
- **Scale.** Reads are in-memory; the domain loads every record at Host open.
  Items are not indexed by Session, tag, or workspace — pages and tabs filter
  in memory. The cap is the bound on that cost.
- **Delete is not erasure.** `remove` writes a tombstone (`deletedAt`, version
  bump) and every surface hides the item. The file remains. At the next
  domain open (a Host start), `purgeTombstones` deletes tombstoned documents
  older than `purgeTombstonesAfterDays` (default 30 days, 1–3650). There is no
  timer: the purge runs only at open, so bytes can persist for the retention
  window plus the time until the next restart. To erase immediately, stop the
  Host and delete `storages/highlights/records/<uuid>.json` (or the whole
  directory).
- **Not in the Session log or export.** Records are storage-domain documents,
  not Session events, so they are absent from Session log export, the default
  log contribution, and harness telemetry. They are also not backed up by
  anything the plugin owns.
- **Unencrypted at rest.** Quotes, notes, and tags are stored as plain text
  under the user profile, with the same trust model as workspace and Session
  data.
- **No export/import/sync.** No Markdown/JSON export, no cross-device sync, no
  import. The record shape is sync-ready (UUID ids, per-item `version`,
  `updatedAt`, tombstones, `origin`, `schemaVersion`) but no transport exists.

## 5. Freshness across surfaces, tabs, and processes

- **Pull, not push.** Out-of-tree there is no forwarded change event. The
  browser reads on activation, after its own writes, on `connection/reset`,
  and on window focus.
- **Freshness window.** A non-forced read is skipped when the last successful
  read finished less than 2 seconds ago. Focus events inside that window do not
  re-read.
- **Supersede rule.** A read captures a write ordinal before it starts; if a
  local write lands while the read is in flight, the read re-runs (at most
  three times) instead of publishing a pre-write snapshot. A read that hits the
  retry bound publishes its answer, so an extreme write storm can still show
  data one write old until the next refresh.
- **Other tabs.** Another tab's writes are picked up when a window regains
  focus (subject to the 2 s window). There is no `storage`-event nudge in V1;
  `NUDGE_STORAGE_KEY` is declared but unused.
- **`pollIntervalMs` is opt-in.** The config field is validated (0–600 000)
  and implemented: when non-zero the browser refreshes while a Highlights
  surface is visible and the document is not hidden. 0 disables polling.
- **No cross-tab nudge.** Another tab's write is visible after focus/reset; the
  declared `NUDGE_STORAGE_KEY` is unused in V1.
- **Other Host processes.** Changes made by a different Host process are never
  observed without a reload.

## 6. Composer insertion

- **Quote text only on `0.2.2-rc.1`.** `inputActions.insertQuote` takes text
  and no summary chip in this release, so an insertion adds the verbatim quote
  (and, when enabled, an attribution line) rather than a removable quote chip.
- **Attribution is control by config and by record metadata.**
  `insertionAttribution` is advertised to the browser half through `hello` and
  honoured there. The "— from <session> · <date>" line is added when the config
  is not `false` and the record carries a `sessionTitle`; records created before
  the P0 session-context fix may lack that snapshot.
- **Queued insertions are best effort.** A quote aimed at a Session whose
  composer is not mounted is written to `localStorage`
  (`dsh.highlights.queue.v1`, quote text included) for up to 24 hours, addressed
  to its destination Session; the bridge drains it when that composer mounts.
  A composer that refuses the quote is retried every 2 seconds for up to 10
  seconds per attempt window, then remains queued until the 24-hour TTL (there
  is no late-failure toast). A queue that cannot be persisted still works for
  the current browser session.
- **New-Session insertion requires the Session creation provider.** If
  `ctx.sessions.create({ workspaceId })` is unavailable or refuses, the action
  returns `failed` and nothing is queued. Inserting into another **existing**
  Session is deferred (the UI offers current and new Session only).
- **Insertion targets the open composer.** Inserting into the current Session
  only works while that Session's composer bridge is mounted; otherwise the
  item is queued like any other target.

## 7. UI and interaction limits

- **One plugin owns Chat's selection surface.** Chat dispatches a text gesture to
  the first registered handler that opens a surface, and the shipped Quote
  plugin registers before any profile plugin. This plugin therefore never shares
  Chat's surface: a plain selection shows only Quote, and the plugin's own bar
  stands down while Chat's surface is open. A pointer selection (drag,
  double-click or triple-click) never opens the plugin bar by itself — the bar
  is right-click-gated; a keyboard-extended selection is the one exception.
  Right-clicking a highlightable
  selection is the plugin's own gesture: it shows that bar anchored to the
  selection, with the native menu suppressed. ⇧ + right-click, the keyboard
  context menu key (Shift+F10 / ≣), and **⋯ → Browser menu** hand the gesture back
  to the browser, and the native menu is untouched everywhere outside that
  gesture. Quote and highlighting are both available, but they do not appear in
  one merged toolbar.
- **Keyboard access is chord- and menu-key based.** `Mod+Shift+H` saves the
  live selection in the last-used colour, and `Mod+Shift+K` opens this Session's
  **Highlights** tab; a taken chord degrades to the next candidate and is
  logged. The floating bar itself is pointer-driven (right-click over a
  highlightable selection); the keyboard context menu key opens the browser's
  own menu rather than the bar, and the lists and filters are keyboard operable.
- **Undo is tab-local.** Only the right-panel tab keeps an inline Undo for the
  most recent delete. Deleting from the global page or the in-transcript item
  card has no Undo affordance yet: the record becomes a tombstone and
  disappears from every surface, and the Host's `restore` endpoint is not
  reachable from those surfaces (P1). There is no app-wide toast: notices are
  rendered inside the page or tab that owns the action.
- **Writes report conflicts, transport failures stay quiet.** A lost
  compare-and-set race is returned as a value and the editing surface shows an
  inline Reload/Overwrite prompt; a refused delete leaves the record visible.
  A transport-level failure still triggers a refresh without an error toast.
  A refused create from the selection editor is returned as `null` and the
  editor closes.
- **The quote is immutable.** Editing a highlight changes colour, tags, note,
  and star only; there is no text edit. Delete and highlight again.
- **Copy quote has a secure-context fallback.** `navigator.clipboard` is not
  available on the plain-HTTP LAN GUI, so copy uses a hidden textarea plus
  `document.execCommand('copy')`; surfaces report success only when a copy
  actually happened.
- **No bulk operations.** Delete, tag, or re-colour one item at a time. No saved
  searches.
- **No user-defined colours.** Five fixed themed palette slots
  (`colorId: 1..5`) over semantic theme aliases; there is no colour store to
  extend.
- **No per-record authorization.** Single-user local data: the Host gateway and
  the owner-Peer fence on `/api/highlights` are the trust boundary. Any
  authenticated owner Peer can read and write every record; there is no actor
  identity.
- **Narrow widths and themes** follow the harness's own layout and token
  behaviour; the plugin adds no opinion beyond using `--dsw-alias-*` tokens and
  `color-mix()` washes that flip with the theme.

## 8. Deferred work (not promised)

- Browser-side re-anchor affordance for stale items.
- Inserting into another existing Session (only current and new Session are exposed).
- Undo on the global page and the in-transcript item card (the right-panel tab has it).
- Richer freshness (a Host-pushed change event) in place of the opt-in poll.
- Cross-tab freshness via a `storage` nudge and optional polling.
- Export/print/copy-all, user palette, bulk operations,
  saved searches.
- User-message, tool-output, and reasoning highlighting (needs a Chat-side
  source attribute or an upstream change — see `docs/upstream-asks.md`).
- Trajectory-view support (needs a Chat-side preview seat).
- Cross-device sync (schema is ready; transport and conflict policy are not).
- A single app-scoped selection controller (one listener owner and one routing decision across session and view mounts). The current shell mounts one bridge, and the listener-lifetime and per-event DOM admission fixes remove the live failure modes; the design is recorded in `review/selection-gestures/analysis/event-routing-audit.md`.
- Attachments in inserted quotes (V1 inserts plain text only).

## 9. Editor interaction details worth knowing

- The annotation popover keeps the **note field collapsed** behind **+ Add note**;
  this keeps it small at the cost of one extra click for people who always
  annotate.
- Interacting with the bar or the popover (including typing in the note/tag
  field) does not dismiss it and does not clear the draft; every detection path
  checks whether focus is inside the plugin surface. Clicking outside or
  pressing Escape does dismiss it and clears the pending selection.
- The selection bar is plugin-owned, so **Copy selection** copies the selected
  text with the plugin's clipboard helper (including its plain-HTTP fallback) and
  is not tied to the 2 000-character quote cap; **Browser menu** cannot open the
  browser's menu itself — no web page can — so it closes the bar, shows a brief
  toast, and hands the next right-click to the browser.
- The browser-menu bypass is a modifier on the press itself: **hold ⇧ before pressing the right button**. A platform fixes a `contextmenu` event's modifiers when it dispatches the event (on macOS at mouse-down), so pressing Shift after the right-press has begun cannot retract the plugin's claim; the keyboard context menu key and **⋯ → Browser menu** have no such timing constraint. Some browsers also take their own path on Shift+right-click that skips (or outpaces) the page's `contextmenu` handler — Firefox documents this as a contextmenu bypass, and Chromium-based browsers such as Helium present their native menu on that gesture too. Trackpad secondary clicks made by tap rather than press can also arrive without the modifier on their generated mouse events, so the plugin tracks the physical Shift key state instead of trusting only the event flag. It therefore reacts to the right-press: it dismisses its bar immediately and lets that menu open, and it also dismisses on window blur.
- The bar and the popover are plugin-owned floating elements rather than Chat's
  surface, so they are positioned by this plugin against the selection's line
  boxes and the visible transcript; a future Chat change to the transcript's
  geometry would need the placement re-measured.

## 10. Agent surfaces (model experience)

Everything in this section is **off by default**: `agentAccess` ships as `off`, and with it off no tool, no skill and no request-context change exists. See `README.md` §Model Experience for the token and KV effects.

| Aspect | Behaviour |
|---|---|
| Consent tiers | `off` → nothing registered. `read` → `list_highlights`, `get_highlight`, and the `highlights` skill. `read-write` → adds `highlight_write` (proposals only). The tier is per install, stored in the plugin's own domain and validated by the Host; the client writes it through the plugin's own route (ledger W9). |
| Scope | A call may only **narrow** the configured scope (`session` < `workspace` < `all`); it can never widen it. `workspace` means path equality between the record and the calling session's cwd, and a missing cwd narrows to `session` rather than guessing. |
| Unknown caller | With no resolvable calling identity, only an effective `all` scope is served; otherwise the call returns an empty page (or `found: false`) with reason `agent-identity-unavailable`. Out-of-scope records return exactly what a missing id returns, so the tool is not an existence oracle. |
| Notes | `list_highlights` never returns notes and does not search them. `get_highlight` returns the note except for an item marked private (`noteWithheld: true`). |
| Proposals | `highlight_write` **stores nothing**. It returns at most three normalised proposals; the transcript row keeps or dismisses each. Keeping one resolves the verbatim quote in the rendered transcript, captures its anchor through the ordinary projection, and writes an agent-authored item through the normal create path. |
| Agent paint | An agent-authored item paints under `dsh-hl-agent-1..5` with a dotted underline. Where an engine drops `text-decoration` on `::highlight()` (or lacks the API), the overlay wash still paints, so the item is visible but its provenance mark is missing. |
| `anchored` flag | Host-side it is **structural** only (projection matches, node key and quote present, `end > start`); real resolution failures are client-side, so the flag can say "anchored" for text that drifted. Do not treat it as a liveness check. |
| Subagent visibility | Tools are registered globally, so subagents and Team members see them; the scope rule above is what limits them (ledger W12). |
| Untrusted content | Every result returns user-authored strings as JSON inside a labelled envelope that states they are untrusted display content. Notes are never interpolated into prose, and the model is told so in the payload. |
