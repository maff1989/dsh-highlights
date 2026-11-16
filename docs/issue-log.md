# Issue log — DSH Highlights plugin

Every defect found between the first build and the current delivery (including the
2026-11-11 review pass and its live-feedback follow-ups), in the order it
surfaced: what the reader saw, what was actually broken, how it was fixed, and
what now prevents a regression. Implementation-time findings come from the test
workstream; field findings come from live use of the plugin in the GUI.

Legend: **Seen** = symptom as reported/observed · **Broken** = root cause ·
**Fix** = change made · **Guard** = the test, harness or document that now holds
the line · **ADR** = the decision record the fix belongs to (`ADRS.md`).

| # | Issue | Class | ADR |
|---|---|---|---|
| 01 | Host RPC channel failed to activate | transport | 002 |
| 02 | Position comparator returned NaN for two absent anchors | logic | 004 |
| 03 | Clearing a note did not clear it | host data | 005 |
| 04 | A slow read could overwrite a confirmed write | client data | 010 |
| 05 | Only "Quote text" appeared; no highlight action | extension point | 006 |
| 06 | Even with the action wired, capture rejected every selection | DOM identity | 007 |
| 07 | Ten theme tokens did not exist → transparent bar | styling | 008 |
| 08 | Palette declared on `html`, theme tokens live on `body`; label invisible | styling | 008 |
| 09 | Native context menu covered the editor | gesture | 006 |
| 10 | Transcript reflowed while selecting | layout | 011 |
| 11 | `crypto.randomUUID is not a function` on save | environment | 009 |
| 12 | Painted highlight appeared seconds late | reactivity | 010 |
| 13 | Bar appeared mid-drag | gesture timing | 006 |
| 14 | Bar stacked above Quote instead of beside it | layout | 006 |
| 15 | Item card read as six buttons | UX | 012 |
| 16 | Annotation popover too large; "Highlight" ambiguous | UX | 012 |
| 17 | Focusing the note field dismissed the popover | interaction | 012 |
| 18 | UI test project never ran React Testing Library cleanup | test infra | 014 |
| 29 | Annotate bar jumped over the Quote button on single-word selections | positioning | 006 |
| 30 | Item card covered the highlight and was wider than the editor | layout | 012/018 |
| 31 | Reveal scrolled the assistant row, not the highlighted characters | reveal | 019 |
| 32 | Reveal flash read as a darker overlapping highlight | rendering | 019 |
| 33 | Item-card More menu rendered inside/clipped by the card | layout | 012 |
| 34 | Highlight fill painted above the composer and sticky chrome | stacking | 018 |
| 35 | Highlight fill lagged behind the text while scrolling | rendering | 018 |
| 36 | Typing in the composer triggered repaint/glow work after a reveal | performance | 018/019 |
| 42 | Jump-to-highlight froze the GUI, worse with every press | performance | 021 |
| 43 | Selection poll forced a layout during a reveal | performance | 022 |
| 44 | Every repaint re-scanned the document once per record | performance | 022 |
| 45 | Reveal aborted layout navigation twice | lifecycle | 022 |
| 46 | Highlights page row ⋯ menu rendered under the following rows | layout | 012 |

---

## 01 — Host RPC channel failed to activate
- **Seen:** the plugin entry logged `highlight (dsh-highlights): Error: cannot get
  property "webServer" without inject` and did not activate.
- **Broken:** the design used `ctx.connection.rpc.handle('/highlights')`. That
  registry installs a physical route through the **registering fiber's**
  `webServer`, which an out-of-tree plugin cannot reach — the guard fired even
  with `webServer` in the plugin's own `inject`, and again inside a scoped
  `ctx.inject([...])`.
- **Fix:** replaced the channel with one feature-owned exact Fetch route,
  `POST /api/highlights`, carrying `{ endpoint, payload }`. Connection still owns
  authentication, the Host/Origin fence and the owner-Peer rule; the plugin owns
  validation and the error vocabulary.
- **Guard:** live round-trip evidence (`docs/implementation-notes.md` §3), the
  host route suite (`tests/host/route.spec.ts`), and ADR-002.
- **ADR:** 002.

## 02 — Position comparator returned NaN for two absent anchors
- **Seen:** ordering inside a session degraded to input order for records whose
  anchor had neither Turn nor Step.
- **Broken:** `comparePosition` used subtraction; both absent keys are
  `Infinity`, and `Infinity - Infinity` is `NaN`, which bailed out of the
  comparison loop before `sourceIndex`/`start` were considered.
- **Fix:** compare with `===` then relational operators, so equal keys fall
  through instead of producing `NaN`.
- **Guard:** `tests/shared/position.spec.ts` (Infinity regression, antisymmetry).
- **ADR:** 004.

## 03 — Clearing a note did not clear it
- **Seen:** emptying the note field and saving kept the old note in every list.
- **Broken:** `store.update` spread the current record first and the `note: null`
  branch produced `{}`, so the old value survived the spread.
- **Fix:** delete the `note` key explicitly on `null`, assign on a string, leave
  untouched when the field is absent.
- **Guard:** `tests/host/store.spec.ts` asserts `note === undefined` after
  `{ note: null }`.
- **ADR:** 005.

## 04 — A slow read could overwrite a confirmed write
- **Seen:** (pre-release) a read issued before a save could publish its stale
  snapshot afterwards, resurrecting the pre-write state.
- **Broken:** `HighlightsClient.read()` applied whatever it fetched; nothing
  tracked that a local write had landed meanwhile, despite the class documenting
  the supersede rule.
- **Fix:** a `writeOrdinal` incremented by every local mutation. A read captures
  it before starting and re-reads (bounded to three attempts) when it changed,
  rather than publishing.
- **Guard:** `tests/client/data-client.spec.ts` (supersede on upsert and evict,
  retry bound).
- **ADR:** 010.

## 05 — Only "Quote text" appeared; no highlight action
- **Seen:** selecting text showed the product's **Quote text** button and nothing
  from this plugin, in field use.
- **Broken:** Chat admits one plugin to its floating selection surface:
  `dispatch()` returns the **first** handler that calls `open()`, and the shipped
  Quote plugin registers before any profile plugin. Competing for the gesture
  could only ever lose.
- **Fix:** stop competing. The plugin renders its own floating bar and claims only
  the **context-menu** gesture through Chat's dispatcher (Quote ignores it), with
  `preventDefault()` so the native menu cannot cover the editor.
- **Guard:** ADR-006; `docs/known-limitations.md` §1; selection interaction test.
- **ADR:** 006.

## 06 — Even with the action wired, capture rejected every selection
- **Seen:** the nav row and header entry proved the plugin was active, but no
  highlight action ever appeared; right-click worked only after this fix.
- **Broken:** the first delivery assumed the key was built from the
  **Conversation** kind (`assistant`, reading `9:assistant4:2`) and rejected the
  real node. Chat's key is built from the definition kind `assistant-step`
  (`14:assistant-step4:2`), and `data-chat-flow-kind` carries `assistant-step`
  too, so the assumption rejected every real assistant step ("not an assistant
  message").
- **Fix:** accept `data-chat-flow-kind === 'assistant-step'` **or** a key matching
  `^\d+:assistant…`; read Turn from `data-chat-turn` and Step from the key
  suffix.
- **Guard:** `tests/client/ui/capture.spec.ts` (definition-kind key format,
  flow-kind fallback, user-message rejection, reasoning rejection);
  `tests/client/anchor/seat.spec.ts` (response/reasoning seats sharing a key).
- **ADR:** 007.

## 07 — Ten theme tokens did not exist → transparent bar
- **Seen:** the floating bar had no surface, border or shadow; swatches were
  empty circles and the primary button label was invisible.
- **Broken:** feature CSS was written against token names remembered from the
  docs (`bg-elevated`, `bg-container`, `bg-layout`, `bg-secondary`,
  `label-inverse`, `separator-primary/secondary`, `elevation-md/sm`). None are
  defined, so the declarations were dropped.
- **Fix:** audited every token in the three stylesheets against the tokens the
  theme actually defines and mapped them (`bg-layer-1/-2`, `bg-base`,
  `label-primary-inverted`, `border-l1/-l2`, `shadow-lv1/-lv2`). Restyled the bar
  as a pill with verified tokens.
- **Guard:** ADR-008's audit procedure; token sweep is part of the upgrade
  checklist in `docs/dev-loop.md`.
- **ADR:** 008.

## 08 — Palette declared on `html` while tokens live on `body`; label invisible
- **Seen:** after the token mapping, swatches were still empty and the button
  label still unreadable.
- **Broken:** two separate facts. (a) The theme projects alias tokens as **inline
  variables on `<body>`**, so a palette declared on `html` referenced missing
  variables and every `color-mix()` was invalid — which would also have made
  painted highlights invisible. (b) `--dsw-alias-label-on-color` exists in rc.2
  but not in the installed rc.1 theme, so the label was painted in the button's
  own colour.
- **Fix:** declare the palette on `:where(html), :where(body)` with alias
  fallbacks; give `::highlight()` rules a guaranteed-visible fallback
  (`--dsw-alias-bg-document-selection`); use
  `--dsw-alias-label-primary-inverted`.
- **Guard:** ADR-008 mandates auditing against the **installed** runtime, not the
  clone; both token sets are recorded in `docs/implementation-notes.md` D-9.
- **ADR:** 008.

## 09 — Native context menu covered the editor
- **Seen:** right-clicking a selection opened the annotation editor with the
  browser/OS menu painted over it.
- **Broken:** the context-menu handler opened Chat's surface but never suppressed
  the native gesture.
- **Fix:** call `request.preventDefault()` when the plugin claims the gesture.
- **Guard:** ADR-006; the interaction test suite.
- **ADR:** 006.

## 10 — Transcript reflowed while selecting
- **Seen:** the agent's markdown body shifted while text was selected.
- **Broken:** the floating bar's portal wrapper carried `display: contents` from
  when it was an in-slot component. With `display: contents` the element
  generates **no box**, so its inline `position: fixed` was ignored and the bar
  joined normal flow at the end of `<body>`, growing the page while visible.
- **Fix:** the wrapper generates a block box and honours its fixed positioning.
- **Guard:** ADR-011 records the portal host contract; `docs/implementation-notes.md`
  D-11.
- **ADR:** 011.

## 11 — `crypto.randomUUID is not a function` on save
- **Seen:** clicking a colour dot (and later Save) threw
  `TypeError: crypto.randomUUID is not a function`; nothing persisted.
- **Broken:** `crypto.randomUUID()` is **secure-context only**. The GUI is served
  over plain HTTP on a LAN address, which is not a secure context — while
  `crypto.getRandomValues()` is available there.
- **Fix:** `newRecordId()` prefers `randomUUID`, otherwise assembles a v4 UUID
  from `getRandomValues`, with a last-resort fallback. The Host's UUIDv7 minting
  already used `getRandomValues`.
- **Guard:** `tests/client/ui/random-id.spec.ts` (secure path, LAN-HTTP path,
  crypto-less path).
- **ADR:** 009.

## 12 — Painted highlight appeared seconds late
- **Seen:** a saved highlight only painted when some later interaction triggered a
  refresh.
- **Broken:** the painter, panel and page react to the store **revision**, but a
  local save changed `records` without bumping it, so nothing reacted until the
  next Host read.
- **Fix:** local `upsert`/`evict` bump the revision, and `createRecord` publishes a
  provisional record (version 0) before the write resolves, replacing it with the
  Host's record and rolling back on failure.
- **Guard:** `tests/client/data-client.spec.ts` (optimistic upsert/evict, revision
  change).
- **ADR:** 010.

## 13 — Bar appeared mid-drag
- **Seen:** the bar flickered into view while the mouse was still selecting,
  which read as disorienting.
- **Broken:** the `selectionchange` and poll paths revealed the bar as soon as a
  non-collapsed selection existed.
- **Fix:** a `dragging` flag set on pointerdown and cleared on
  pointerup/pointercancel gates every detection path (including the
  Chat-surface mirror and the 250 ms poll), so the bar appears when the gesture
  ends — the same timing as the product's Quote action. The P0 pass found the
  mirror path was still ungated; see issue 20.
- **Guard:** ADR-006; `tests/client/ui/selection-editor.spec.tsx` (cancelled
  pointer gesture recovers).
- **ADR:** 006.

## 14 — Bar stacked above Quote instead of beside it
- **Seen:** the bar occupied its own row above the Quote button instead of reading
  as one toolbar.
- **Broken:** placement only knew the selection rectangle, not Chat's surface.
- **Fix:** mirror Chat's surface rectangle, measure the bar, and place it on the
  same row (vertically centred, to the surface's left, flipping right when there
  is no room). The open editor anchors below the selection instead.
- **Guard:** ADR-006; `docs/implementation-notes.md` D-14.
- **ADR:** 006.

## 15 — Item card read as six buttons
- **Seen:** the dialog opened by painted text presented Show in conversation,
  Insert, Copy, Delete, Cancel and Save in one row over a tall form.
- **Broken:** the creation editor was reused for editing, with every action passed
  as `extraActions`, so nothing was prioritised.
- **Fix:** a dedicated calm card — header (colour/star/close), quote excerpt,
  inline tags, note, footer **⋯** menu (reveal/insert/copy/delete) + **Save**.
- **Guard:** `tests/client/ui/item-card.spec.tsx` (menuitem routing, draft
  collection, close).
- **ADR:** 012.

## 16 — Annotation popover too large; "Highlight" ambiguous
- **Seen:** the creation popover was a large dialog over the text, and its button
  said "Highlight" even though the colour dots already highlight.
- **Broken:** one tall editor served both gestures, with labelled rows and no
  progressive disclosure; copy described the mechanism, not the outcome.
- **Fix:** 272 px popover with a 2-line quote, colour row, one tag field, note
  behind **+ Add note**, and Cancel/Save; the button is **Annotate** while dot
  labels stay "Highlight 1…5".
- **Guard:** selection interaction test updated for the progressive note;
  ADR-012.
- **ADR:** 012.

## 17 — Focusing the note field dismissed the popover
- **Seen:** (caught by the interaction test before field use) opening the note
  field closed the editor and dropped the anchor.
- **Broken:** focusing a textarea collapses the document selection; the plugin
  treated that as a new/collapsed gesture and closed. Pressing any bar control
  could also clear the selection in the browser.
- **Fix (P0 review pass):** all three detection paths now share one
  `isInsideOwnSurface`/`focusInsideOwnSurface` guard, and `captureNow` itself
  refuses while focus is inside the bar; non-text controls still
  `preventDefault()` on pointerdown. See issue 20.
- **Guard:** `tests/client/ui/selection-editor.spec.tsx` (focus the note field,
  survive a 250 ms poll tick, save the note).
- **ADR:** 012.

## 18 — UI test project never ran React Testing Library cleanup
- **Seen:** the card suite reported "Found multiple elements" because previous
  tests' DOM leaked into the next query.
- **Broken:** the Vitest `ui` project did not enable globals, so RTL's automatic
  `afterEach(cleanup)` registration never happened.
- **Fix:** `globals: true` on the `ui` project (kept as configuration, not a
  convention), plus explicit `afterEach(cleanup)` in the new suite so the file is
  correct on its own.
- **Guard:** the suite itself; ADR-014.
- **ADR:** 014.


## P0 remediation — 2026-11-11 review pass

The second review ([REVIEW.md](../../REVIEW.md)) found ten P0 findings (eight remediation workstreams) that the
earlier tests could not see. They are recorded here with the same guard/ADR
discipline; the full verification trail is in [TRACKING.md](../../TRACKING.md)
and `review/QA-P0.md`.

## 19 — A reasoning-bearing reply painted nothing / reveal scrolled the thinking row
- **Seen:** highlights created on a reply that showed reasoning stayed listed but
  never painted; "Show in conversation" landed on the thinking row; "Save to
  highlights" silently did nothing on those replies.
- **Broken:** Chat renders two seats with the same `data-chat-node-key`
  (`groupPart` reasoning first, response second). `resolve.ts`/`reveal.ts` used
  the first `querySelector` match — the reasoning seat — and filtered its only
  source out. `anchor.groupPart` was captured but never read.
- **Fix:** new `anchor/seat.ts` resolves the response seat via
  `data-chat-anchor-key`, then `groupPart`, then absent/`response`; resolve,
  reveal and message-mark capture all use it. Reveal also scopes its search to
  `[data-conversation-session="<target>"]`.
- **Guard:** `tests/client/anchor/{seat,resolve,reveal}.spec.ts`; response-seat
  fixtures with the reasoning row first.

## 20 — Annotation editor closed while typing a note/tag (regression of 17)
- **Seen:** opening the note/tag field in the selection popover closed it and
  dropped the draft; the old suite stayed green.
- **Broken:** only the `selectionchange` path had the focus-inside-bar guard;
  pointerup and the 250 ms poll treated the focus-collapsed selection as a
  dismissal.
- **Fix:** one `isInsideOwnSurface`/`focusInsideOwnSurface` predicate used by
  pointerup, `selectionchange`, the poll and `captureNow`; pointercancel resets
  drag state; mirror path gated on drag.
- **Guard:** `tests/client/ui/selection-editor.spec.tsx`.

## 21 — Item card dismissed itself on every own control
- **Seen:** colour/star/tag/note/More presses closed the card before they acted.
- **Broken:** the document `pointerup` outside-press rule did not exclude the
  card's portal, which is mounted under `<body>` and therefore "outside" every
  text source.
- **Fix:** `data-dshhl-card` marker; the outside-press handler ignores events
  inside it; minimal focus in/restore added.
- **Guard:** `tests/client/ui/session-bridge.spec.tsx`, `item-card.spec.tsx`.

## 22 — Compare-and-set conflicts were swallowed
- **Seen:** two tabs editing one item silently replaced the draft; a conflicted
  delete hid a record the Host never deleted; Undo then "restored" a live record.
- **Broken:** the action layer ignored `WriteValue.status`.
- **Fix:** typed `WriteOutcome` for update/remove/restore; no upsert/evict on
  conflict; ConflictBar (Reload/Overwrite) in the card, panel row and page row;
  Undo only after `written`.
- **Guard:** `tests/client/data/actions.spec.ts`, UI conflict specs.

## 23 — Session title/workspace were never captured
- **Seen:** insertion attribution never appeared, the global page grouped every
  record under "Unknown workspace", new-session insertion lost the workspace.
- **Broken:** `sessionContext` read `title`/`cwd` from `SessionSnapshot`, which
  has neither.
- **Fix:** read `ctx.sessions.list` (`title`/`displayTitle`/`cwd`) and
  `ctx.workspaces.list` (`workspaceId`/`path`) instead; existing records keep
  fallbacks.
- **Guard:** `tests/client/data/context.spec.ts`.

## 24 — Insertion targeted the source Session / never drained
- **Seen:** "insert into a new session" inserted into the source conversation;
  a refused current insert was silently queued and never retried.
- **Broken:** `InsertService.enqueue` hard-coded `record.sessionId`, and
  `drain` was only called on bridge registration.
- **Fix:** destination-address queue entries, drain-on-enqueue, one retry timer
  per destination with a 10 s deadline, TTL/validation prune, explicit
  current/new routing; new-session UI exposed in panel/card.
- **Guard:** `tests/client/data/insert.spec.ts` (two bridges, new destination,
  deadline, corrupt/TTL).

## 25 — Copy quote was a no-op on the LAN-HTTP GUI
- **Seen:** the panel reported "Quote copied" although nothing happened.
- **Broken:** only `navigator.clipboard` was used, and failure was swallowed.
- **Fix:** `copyQuote` returns a real boolean with a hidden-textarea
  `execCommand('copy')` fallback; surfaces show success only on `true`.
- **Guard:** `tests/client/data/copy.spec.ts`.

## 26 — Reveal raced the session switch
- **Seen:** cross-session jumps scrolled/flashed the previous session's same-key
  node, or did nothing.
- **Broken:** `openSession` is synchronous while React commits later; node keys
  collide across sessions.
- **Fix:** wait for `[data-conversation-session="<target>"]`, search only inside
  it, use the response seat, bound every wait, abort on selection change, return
  `not-found` with fallback copy.
- **Guard:** `tests/client/ui/reveal.spec.tsx`.

## 27 — Dismissing the context-menu editor suppressed the pill for the session
- **Seen:** after Cancel/Escape, later selections showed no highlight action.
- **Broken:** the selection stash was cleared only on save, and suppression
  trusted the persistent candidate.
- **Fix:** `onDismiss`/`onSaved` clear the stash; suppression is keyed to the
  live Chat surface hosting the plugin entry; surface disappearance clears it.
- **Guard:** `tests/client/ui/selection-action.spec.tsx`,
  `tests/client/ui/selection-editor.spec.tsx`.

## 28 — Whole-message marks were a no-op or duplicate
- **Seen:** Save-to-highlights did nothing on reasoning replies, or created a
  second mark on repeat clicks.
- **Broken:** the node lookup hit the reasoning seat, and nothing checked for an
  existing `kind:'message'` mark.
- **Fix:** response-seat lookup + `sessionId + nodeKey` dedupe; a repeat click
  opens the existing mark in the right-panel tab.
- **Guard:** `tests/client/data/message-mark.spec.ts`.


## 29 — Annotate bar jumped over the Quote button (single-word selections)
- **Seen:** for a double-clicked word the bar appeared beside Quote and then moved on top of it; phrases were usually fine.
- **Broken:** placement used a captured surface rect and a fallback bar width before measuring, so the first paint and a later Chat surface move fought each other.
- **Fix:** measure the real bar in a layout effect and write `top/left` before paint; follow the live `[data-text-interaction-surface]` rect each frame while open (ADR-006/012).
- **Guard:** `tests/client/ui/selection-affordance.spec.tsx` ("sits beside the live Quote surface and follows it").

## 30 — Item card covered the highlight and was wider than the editor
- **Seen:** clicking painted text opened a card over the text; the edit card and new-annotation popover looked unrelated in width.
- **Broken:** the card was positioned at the range's top and used a 360px width.
- **Fix:** anchor below the range (above only when the lower half has less room), bound its height, and use the same 272px/10px compact geometry as the annotation popover.
- **Guard:** `tests/client/ui/session-bridge.spec.tsx` ("opens the card below the painted range"), `item-card.spec.tsx`.

## 31 — Reveal scrolled the row, not the highlighted characters
- **Seen:** after "Show in conversation" the transcript scrolled, but the highlighted text was still off-screen, especially from the right-panel tab.
- **Broken:** `seat.scrollIntoView()` centred the whole assistant node; a long markdown reply can be taller than the viewport.
- **Fix:** resolve the anchor first and scroll the transcript viewport by the range's measured offset; row scroll is only the no-layout fallback.
- **Guard:** `tests/client/ui/reveal.spec.tsx` ("scrolls the resolved highlight range").

## 32 — Reveal flash read as a darker overlapping highlight
- **Seen:** reveal painted a second wash over the existing colour, then removed it — disorienting.
- **Broken:** the CSS-highlight flash was another tinted background; later ring/glow attempts were also too prominent.
- **Fix:** multiple iterations removed the ring; finally the flash was disabled (ADR-019) and the temporary glow code kept as a no-op API. Any future effect must be quieter and must wait for scroll-settle.
- **Guard:** `tests/client/paint/painter.spec.ts` (disabled glow), `tests/client/ui/reveal.spec.tsx`.

## 33 — Item-card More menu rendered inside/clipped by the card
- **Seen:** the 3-dot menu opened over the card's note area instead of above the card.
- **Broken:** the menu was absolutely positioned inside the card, inside the card's new scroll/clip wrapper.
- **Fix:** portal the menu to `document.body` at fixed coordinates above the More button; outside presses close it, and the card's outside-press handler ignores the portalled menu. After the ui-primitives migration the portal is the primitive's `portal` flag (issue 46 moved the same flag onto the page row).
- **Guard:** `tests/client/ui/item-card.spec.tsx` ("opens the rare actions in a menu" pins the portal flag).

## 34 — Highlight fill painted above the composer
- **Seen:** scrolling the transcript under the chat input left the lavender highlight visible on top of the composer while the text was hidden.
- **Broken:** the overlay host was a positioned layer at `z-index: 20`, above the composer's `z-index: 9`.
- **Fix:** the host now sits at `z-index: 1`, below composer (9) and transcript sticky chrome (6–8); the fill remains above normal text.
- **Guard:** `tests/client/ui/session-bridge.spec.tsx` (overlay layer); manual composer-overlap check pending.

## 35 — Highlight fill lagged behind the text while scrolling
- **Seen:** scrolling made the rounded fill trail the text as though detached.
- **Broken:** the first overlay was a fixed layer updated from scroll events/rAF; the compositor moved the text first.
- **Fix:** the overlay host is now a zero-height, `position:relative` child of `[data-conversation-scroll]`; its boxes are ordinary scroll content and move with the text natively. No scroll handler.
- **Guard:** `tests/client/ui/session-bridge.spec.tsx` (host inside scroller), `tests/client/paint/overlay.ts`; manual scroll check pending.

## 36 — Typing delay after reveal
- **Seen:** after using "Show in conversation", typing in the composer was noticeably delayed.
- **Broken:** the SessionBridge `MutationObserver` watched the whole scroll subtree (including the composer), so keystrokes triggered resolve/repaint; the overlay’s own DOM changes could also re-trigger the observer. The glow added a per-frame loop during its lifetime.
- **Fix:** ignore mutations inside the composer, the card and the overlay host; disable the glow (ADR-019). Overlay geometry only changes on transcript mutation/resize.
- **Guard:** `tests/client/ui/session-bridge.spec.tsx` overlay test; `tests/client/paint/painter.spec.ts`; manual typing check pending.

## 37 — "Save to highlights" action did not match Chat's action-row buttons
- **Seen:** the per-message save action rendered as a small bordered box among Chat's borderless icon buttons (copy/branch/usage).
- **Broken:** `MessageAction` reused the plugin's generic `.dshhl-button dshhl-button--icon` (26×24, `0.5px` border, primary label, 14px icon). Chat inserts `assistant-actions` into `MessageIconActions`, whose own buttons are 28px square (scaled by the content font delta), borderless, tertiary, 17px icons, `radius-sm`, with a hover wash.
- **Fix:** dedicated `.dshhl-message-action` styles mirroring Chat's `MessageIconActions.module.css` geometry/states; the icon no longer forces a 14px size and is sized by the class.
- **Guard:** `tests/client/ui/message-action.spec.tsx` pins the dedicated class (not `dshhl-button`) and the node→save contract.

## 38 — Whole-message marks painted as a character-level text wash
- **Seen:** pressing "Save to highlights" on a reply washed every character of the reply with the message colour; it read as if the entire reply had been selected, not as a bookmark, and looked identical in kind to a phrase/sentence highlight.
- **Broken:** `kind:'message'` ranges were registered under a sixth `::highlight(dsh-hl-message)` name, i.e. a background wash across all text; the overlay only drew `kind:'text'` boxes.
- **Fix:** message ranges are no longer registered with the CSS Custom Highlight API. `paint/overlay.ts` draws one rounded, padded band behind the reply (`--dshhl-band-color`), below text markers (`z-index`), so a marked message is a distinct "bookmarked block" visual (no outline/rail). Text colour-only `::highlight` rules are unchanged; the unused `--dsh-hl-message` token/rule was removed.
- **Guard:** `tests/client/paint/overlay.spec.ts` (band vs line boxes, removal when unresolved), `tests/client/paint/painter.spec.ts` (no `dsh-hl-message` registration; range kept for hit-testing).

## 39 — "Save to highlights" hover bubble used the browser-native tooltip
- **Seen:** hovering the action showed the OS/browser `title` bubble, unlike Chat's own copy/branch buttons, which use the product Tooltip.
- **Broken:** `MessageAction` set `title={…}` directly; the row's native actions wrap their buttons in `Tooltip` from the primitives package.
- **Fix:** the button is wrapped in the product `Tooltip` (`label`, `side="bottom"`), and the `title` attribute is gone, so the bubble inherits the shell's styling and behaviour. The button geometry still mirrors `MessageIconActions` with product tokens (out-of-tree CSS is not importable).
- **Guard:** `tests/client/ui/message-action.spec.tsx` asserts the Tooltip props (label + bottom placement) and the absence of `title`.

## 40 — Highlight boxes went stale when the right panel was expanded/collapsed
- **Seen:** toggling the right-hand Highlights sidebar reflowed the conversation, but existing rounded text fills and message bands kept their pre-layout positions until an unrelated transcript mutation or a window resize happened. Both phrase highlights and whole-message marks were affected.
- **Broken:** the overlay re-measured only on transcript mutations, window `resize`, and bridge repaints. A pane toggle changes the transcript's box width without resizing the window and often without a `[data-chat-flow]` content mutation, so no path recomputed the geometry.
- **Fix:** `HighlightOverlay` observes `[data-conversation-scroll]` and `[data-chat-flow]` with a `ResizeObserver` (rAF-coalesced through the existing scheduler, disconnected on detach) in addition to the window listener. Geometry writes are diffed against the element's current inline style, so the extra re-measure only touches boxes that actually moved.
- **Guard:** `tests/client/paint/overlay.spec.ts` ("re-measures after the transcript box resizes", "does not rewrite box styles when a repaint finds the same geometry").

## 41 — Highlights page and panel bypassed the native page/panel conventions
- **Seen:** the global Highlights page sat flush against the window edges with a 16px sticky header, while native entry pages (Plugins, Automation tasks) use a centered 960px column with responsive inline insets and a 28px header inset; the page rows were bordered cards and generic controls (buttons, inputs, chips, dropdowns) were hand-built copies. The right-panel tab was similarly inset/typographically off from native panel bodies.
- **Broken:** the page/panel frames and every generic control carried bespoke CSS instead of the product's entry-page metrics and the `ui-primitives` atoms.
- **Fix:** page frame mirrors the native entry-page pattern (full-height page ground, scroll viewport, 960px centered column with `clamp(24px, 4vw, 48px)` insets, 48px bottom inset, 20px/500 title, 28px header inset, 28px group gap, transparent 8px hover rows). Panel frame mirrors a native pane (payload at the content font size, 12px header inset, scrollable body, transparent 8px hover rows). Generic controls are the product primitives: `Button`, `Input`, `Pill`, `Tag`, `Menu`, `Tooltip`; remaining custom CSS is highlight-specific (colour bar/swatches, painted fills, message band, floating surfaces) plus small layout glue (`dshhl-icon-button`, `dshhl-note-input`, `dshhl-tagChip`). The bespoke `<details>` overflow menus were replaced by the product `Menu`.
- **Guard:** `tests/client/ui/{page,panel,item-card,session-bridge,selection-*}.spec.*` plus a shared functional `tests/client/ui/primitives-mock.tsx`; bundle contract unchanged (primitives stay platform modules).

## 42 — Jump-to-highlight froze the GUI, and the freezes grew with every press
- **Seen:** pressing **Show in conversation** (from the Highlights page or the
  right-panel tab) made the whole GUI lock up. The first freeze was short; later
  ones got longer as more of the session's history had been revealed, and a page
  refresh restored the previous performance. The earlier reveal-performance work
  (instant landing, scoped observer, incremental overlay, no glow) did not
  remove it.
- **Broken:** `HighlightOverlay.render()` measured and mutated in one loop: it
  read a range's `getClientRects()`, created/appended/style-wrote that record's
  boxes, then read the next record's rects. Each write invalidated layout, so
  every following measurement forced a full re-layout of the whole mounted
  transcript. A reveal from the global page remounts the conversation and the
  session bridge, so the expensive first paint ran on every press — and each
  reveal that paged in more history made every one of those forced layouts more
  expensive. Live instrumentation on the running GUI: **8 range measurements ×
  ~285 ms + a 282 ms origin read ≈ 2.56 s** inside one ~3.96 s long task; CPU
  profile self-time `getClientRects` 2 061 ms and the overlay's
  `getBoundingClientRect` 292 ms. Unit tests could not see it: jsdom has no
  layout engine, so every measurement reported 0 px and the interleaving cost
  nothing.
- **Fix:** two-phase paint (ADR-021). Pass 1 measures the layer origin and every
  record's line boxes with **no** DOM or style writes; pass 2 reuses/creates the
  boxes and bands and writes only geometry that changed. `renderBand` now
  receives the rects its caller already measured instead of measuring again.
- **Unchanged by design:** the MutationObserver coalescing, incremental box
  reuse, `writeStyle` diffing, resize observation and z-order are as before.
- **Guard:** `tests/client/paint/overlay.spec.ts` ("measures every range before it
  creates or styles any box (two-phase paint)") instruments reads and writes and
  fails if any geometry read follows a DOM/style write; it fails on the pre-fix
  loop and passes now. Live verification: overlay work per press 2.56 s →
  0.28 s, `boxesOf`/`getClientRects` no longer appears in the CPU profile, and a
  paint does one forced layout instead of nine. After a forced GC the DOM-node
  and listener counters return to the same value after every press, so nothing
  accumulates per press.
- **Remaining, not the plugin:** the conversation unmount/remount and Chat's own
  mount layout are DSH/Chat costs; the plugin no longer multiplies them.

## 43 — The selection affordance's poll could force a full layout during a reveal
- **Seen:** in the profiling of a reveal press, the plugin's residual JavaScript was almost
  entirely the selection affordance: the 250 ms poll callback measured **252.8 ms** and its
  `selectionchange` handler **55.8 ms** of the plugin's 332 ms self time. Periodically the poll
  also produced 70–365 ms outlier ticks during ordinary use.
- **Broken:** the poll (and `selectionchange`) captured a cloned `Range` and called
  `getClientRects()` on it. When it fired while the conversation was being remounted by a reveal,
  that measurement forced the browser to lay out the half-mounted transcript inside a timer. The
  poll's collapsed branch also read `document.activeElement` on every idle tick even when no
  bar/editor was open.
- **Fix:** new `src/client/activity.ts` (`beginReveal()` / `revealPending()`); `revealRecord`
  marks a reveal in flight and always clears it in `finally`. The poll and the `selectionchange`
  handler return before touching the selection while a reveal is pending, then resume. The poll's
  collapsed branch returns before the focus read when `pendingRef.current === null`.
- **Guard:** `tests/client/ui/selection-affordance.spec.tsx` (no geometry read or bar change while
  a reveal is in flight; detection resumes after; a collapsed no-pending tick reads zero
  `document.activeElement`).

## 44 — Every repaint re-scanned the document once per record
- **Seen:** the independent audit measured the repaint path at ~1.92 ms/frame on a 4.3 k-node
  transcript and ~5 ms/frame at 16.4 k nodes during streaming-like mutation; more than three
  quarters of the document-query cost was `[data-chat-node-key="…"]` lookups.
- **Broken:** `resolveAll` called `resolveRecord` per record, and each one ran its own
  attribute-selector scan (`findNodeSeats`) to find the record's node — and a second scan when the
  node was absent, to tell `source-absent` from `node-absent`. Cost grew with record count ×
  transcript size on every mutation.
- **Fix:** `anchor/resolve.ts#indexSeats` builds one `[data-chat-node-key]` index per resolve pass;
  `resolveAll` passes it to `resolveRecord`, which stays index-free when called directly (reveal).
  The seat preference order moved into `anchor/seat.ts#pickNodeSeat` so `findNodeSeat` and the
  index path share it. Measured after: a 60-mutation streaming window at 681 chat nodes / 16 057
  DOM nodes performed **61 node-key walks / 70.9 ms total (~1.2 ms per repaint)** and **zero**
  exact-key scans.
- **Guard:** `tests/client/anchor/resolve.spec.ts` ("resolves a whole record set from one node-key
  DOM walk") asserts one scan for four records and unchanged resolution/stale reasons.

## 45 — Reveal aborted layout navigation twice
- **Seen:** no visible symptom (the extra call was a no-op store write), but abort stacks showed
  two `LayoutController.selectPanel` calls per reveal.
- **Broken:** `revealRecord` called `ctx.layout.selectPanel(null)` itself after
  `ctx.uiWorkspace.openSession()`, while `openSession`'s `'reveal'` path already calls
  `layout.selectPanel(null)` inside `replaceMain` (`ui-workspace/src/client/navigation.ts:552`).
  The second call aborted layout navigation a second time and released a session reference again.
- **Fix:** removed the explicit call; `openSession` is the single owner of the panel switch.
- **Guard:** `tests/client/ui/reveal.spec.tsx` asserts reveal does not call `selectPanel` directly
  (with a comment that `openSession` owns it).

## 46 — Highlights page row ⋯ menu rendered under the following rows
- **Seen:** on the global Highlights page, opening a row's ⋯ menu left the list clipped and painted
  behind the rows below it: the following group painted over the card and the last item (Delete)
  was cut off, so only Edit and Show session highlights were reachable.
- **Broken:** after the ui-primitives migration the row used the product `Menu` in place.
  `.dshhl-page .dshhl-row` sets `content-visibility: auto` (a long-list paint optimisation), which
  implies paint containment and creates a stacking context: the in-place absolutely positioned list
  was clipped to the row box and could not paint above later siblings. The inline edit card's More
  menu had already been fixed by portalling (issue 33), but the page row never got the same flag.
- **Fix:** pass the primitive's `portal` flag on the page row's Menu, exactly as the card does. The
  list now renders under `document.body` at fixed coordinates, clamped to the visual viewport and
  tracking scroll, so the row's containment and stacking cannot clip or bury it.
- **Guard:** `tests/client/ui/page.spec.tsx` ("portals the overflow menu out of the content-visibility
  row" pins the portal flag); live before/after evidence in
  [`review/row-menu-portal/REPORT.md`](../../review/row-menu-portal/REPORT.md).

## 47 — A default shortcut binding collision failed the whole plugin's activation

- **Seen:** after the Phase 1 integration the live GUI showed `Failed to load plugins / dsh-highlights: web boot: 1 entry did not activate`, while `pnpm verify` and the bundle contract test were both green.
- **Broken:** `ctx.shortcuts.register` throws when a requested default binding collides with a shipped command, and the plugin applied all three of `Mod+Shift+H`/`J`/`U` and `Mod+Shift+K`/`L`/`P` as fixed choices at activation. The first collision threw inside the plugin's `apply`, so the entry never activated — the UI disappeared entirely, not just the shortcut.
- **Fix:** `registerChord` tries candidates in order inside a guard and returns a no-op disposer with a warning when every candidate is taken. A taken chord degrades the feature; it cannot take the plugin down. The claim was never true that these chords were free — it is checked, not assumed.
- **Guard:** `scripts/check-bundle.mjs` asserts two shortcut registrations still arrive; the live boot check is the real regression test (unit tests cannot see a shipped-binding collision).

## 48 — The provenance helper pulled the whole zod schema tree into the client bundle

- **Seen:** after the agent-write pass, `src/client/paint/*` imported `authorOf` from `src/shared/schema.ts` at runtime. The bundle grew and the minified client began containing the record schemas; `must be a UUID` appeared in `lib/client.js`.
- **Broken:** `shared/schema.ts` imports `zod` and constructs every record schema at module load. Importing one pure helper from it for a value (not a type) drags the whole file into the browser bundle — the client half is types-only for exactly this reason, and the list work package had already mirrored the helper to avoid it.
- **Fix:** the four enums and the five default helpers moved to a **zod-free `src/shared/provenance.ts`**; `schema.ts` builds its zod enums from those tuples and re-exports the helpers, and both halves import from the pure module. One definition, no mirror, and the schema module is gone from the client bundle again.
- **Guard:** the browser bundle no longer contains the schema text (`grep 'must be a UUID' lib/client.js` is empty) and the bundle stays far under the 320 KiB budget; the paint specs pin the agent/user naming split.

## 49 — Palette slot 3 painted black in light mode and white in dark

- **Seen:** the five colour slots shipped one visibly monochrome swatch; the audit measured slot 3 at `srgb .058/.067/.082` light and `.976/.980/.984` dark — brand ink, not a colour — while slot 4 (actually the blue) was labelled "Violet".
- **Broken:** slot 3 was mixed from `--dsw-alias-brand-primary`, which is the product's near-black/near-white ink alias, not a hue. The label mismatch followed from the same confusion about which slot held which hue.
- **Fix:** slot 3 mixes `--dsw-alias-state-done-primary` (violet-600 light / violet-400 dark); the five are then amber, green, violet, blue, red. Colour names are localised and used as the swatch accessible names.
- **Guard:** `tests/client/ui/floating-styles.spec.ts` pins the palette expressions; the five mixes were verified live in both themes with a ΔE2000 check (worst pair 11.6 light / 9.3 dark — far above the ~2.3 JND).

## 50 — Right-click editor rendered at the pointer instead of against the selection

- **Seen:** right-clicking a selection opened the palette under the cursor (measured `left = cursor.x − 0.16 px`, `top = cursor.y + 9 px`) and overlapping the selected lines, instead of aligning below/above the selection inside the transcript.
- **Broken:** the plugin claimed Chat's `contextmenu` interaction, so Chat rendered the plugin's entry inside its own surface — and Chat anchors a contextmenu surface at the pointer by design (`text-interaction.ts` `place()` builds a 1×1 anchor from `point`, writes it on every layout/scroll/resize pass). The plugin cannot reposition that ancestor, and its own selection-anchored bar stood down in favour of it.
- **Fix:** the plugin owns the `contextmenu` gesture itself — a capture-phase `document` listener with pure admission rules (`selection/context-menu.ts`), `preventDefault()` only over a highlightable selection whose line rects contain the point, and the existing selection-anchored bar (`placeFloating`). Escape hatches keep the browser menu reachable: ⇧ + right-click, the keyboard context-menu key, and a `⋯ More actions` menu with **Copy selection** and **Browser menu** (one-shot hand-back with a toast, because no page can open the browser's menu on demand). The Chat-hosted path (`SelectionAction`, `SelectionStash`, the interaction + slot registrations, `SELECTED_ID`, `data-dshhl-surface`, `.dshhl-vh`) is deleted.
- **Guard:** `tests/client/ui/selection-affordance.spec.tsx` (admission matrix, ⇧/keyboard bypass, More-menu actions, editor dismissal, geometry) and live evidence in `review/selection-gestures/` (`probe/after/REPORT-C.md`). Upstream ask #13 (selection anchor) retires the ownership.

## 51 — A queued detection resurrected the bar beside the native menu

- **Seen:** after a Shift+right-click dismissed the bar and the browser menu opened, the annotation bar reappeared ~140–400 ms later; dismissing the OS menu then needed an extra click.
- **Broken:** the selection state is app-scoped, but the 140 ms `selectionchange` debounce and the deferred pointerup show were per-instance timers that a native-menu bypass did not cancel; `show()` only re-checked Chat's surface, not "the browser already owns this gesture".
- **Fix:** a browser-gesture ownership token: every native-intent path (Shift right-press, tap-style `mousedown`, contextmenu bypass, one-shot hand-back, outside right-click, window blur) cancels the debounce and deferred show and sets the token, `show()` refuses while it holds, and the next primary press clears it.
- **Guard:** "cancels a pending detection when Shift+right-click hands the gesture back" in `selection-affordance.spec.tsx`; live `probe/after-architecture` (I1, 3 reps: bar absent immediately and at +320/+600 ms).

## 52 — Tracked Shift state stuck after a native menu swallowed the keyup

- **Seen:** plain right-click showed the bar, a Shift+right-click showed the browser menu (intended), and every later plain right-click then showed only the browser menu until another key was pressed.
- **Broken:** the tracked physical Shift state (added so trackpad *tap* secondary clicks that omit the modifier still bypass) was cleared only by a Shift keyup, a non-Shift keydown or window blur. macOS native menus routinely swallow the Shift keyup, so a trackpad-only reader kept the bypass armed indefinitely.
- **Fix:** the tracked state is consumed once per right-press, reconciled from the trusted modifier of the next primary (left) press, self-expires after 3 s, and is cleared by keyup, blur and non-Shift keydowns. The over-strict `isElementRendered` admission check added in the same pass was removed: the range's client rects already reject hidden selections.
- **Guard:** three tests in `selection-affordance.spec.tsx` (swallowed-keyup consume, primary-press reconciliation, TTL expiry). Live final verification: `probe/after-architecture/REPORT-I.md` (Sequence-S).

## 53 — Cold loads could leave the whole gesture layer uninstalled

- **Seen:** after some reloads a selection could not be right-clicked at all (no bar, native menu only), and a rendered bar could survive a visibility flip with no listener left to dismiss it.
- **Broken:** the affordance listener set was installed only while the bridge's `visible` observation signal was true, while the bar rendered regardless of it. Live instrumentation measured 4 of 5 cache-disabled loads with the transcript rendered at 11–14 ms but the signal false and **0 of 10** affordance listeners installed; an unrelated visibility event was needed to recover. The listener effect also took an unstable `revealPending` prop identity, re-registering the whole set on parent renders, and the card's Escape keydown existed even with no card open.
- **Fix:** gesture listeners are installed for the lifetime of the mounted bridge and admission is decided per event from the DOM (`contextMenuSource` scopes by conversation, the range's client rects reject hidden selections); the bar renders only for its own session; a hidden conversation dismisses its pending capture; the reveal probe is a stable callback; the card's Escape keydown exists only while a card is open; the observation service polls visibility, bounded, until the session becomes visible (cold-load recovery) and the browser-menu arm timer is cleared on teardown.
- **Guard:** `tests/client/ui/selection-affordance.spec.tsx` (visibility-signal decoupling, hidden dismissal, cross-session render refusal, listener-count stability), `tests/client/observation/service.spec.ts` (cold-load recovery), and `probe/after-listeners/REPORT-H.md` + `probe/after-architecture/REPORT-I.md` (listener counts and 5-load evidence).

## 54 — Right-click in the leading between two selected lines opened only the browser menu

- **Seen:** in the final paragraph of a long assistant reply a plain right-click over the selection showed only the browser menu and no annotation bar, while an earlier, shorter list item in the same reply worked. Reported as content-specific and intermittently.
- **Broken:** `pointInsideRange` used strict per-line hit boxes. A line box is 16 px tall on a 24 px pitch, so the **7 px band between two selected lines belongs to no rect**; a right-click landing there was rejected and the native menu opened. Measured: dy 1…7 below a line box → no claim, dy ≥ 8 (next line box) → claim. A six-line paragraph has five such bands, so it fails far more often than a short block clicked on a line — which also explains the earlier "sometimes the bar does not appear" reports.
- **Fix:** `pointInsideRange` treats the **interior** leading between selected lines as inside the selection (±8 px around each line box, restricted to the range's overall vertical span); the outer edges stay strict, so a click above the first or below the last selected line never claims.
- **Guard:** `tests/client/selection/context-menu.spec.ts` ("accepts the leading between two selected lines but not outside the range"), plus the live boundary matrix in `review/selection-gestures/probe/lead-diagnosis/` (before: dy 1–7 rejected; after: dy −6…+10 claimed; Shift bypass still opens only the browser menu).

## 55 — Triple-click paragraph selection opened only the browser menu

- **Seen:** manually dragging over the final paragraph then right-clicking showed the annotation bar; triple-clicking a word (which selects the whole paragraph) then right-clicking showed only the browser menu.
- **Broken:** Chromium's block selection ends at the **next block boundary**. On the last block of a `[data-text-interaction-source]` that boundary is outside the source — measured live: the range started in the assistant source and ended in a `SPAN` inside the turn-tail action row (`9:turn-tail10`), with only three newlines of extra text. `captureSelection` required **both endpoints in one source**, so it rejected the selection and the native menu opened. Manual drag stays inside the source, hence the difference.
- **Fix:** `normalizeSelection`/`clampToSource` (`src/client/anchor/capture.ts`) clamp a selection with exactly one endpoint inside a source and the other outside every source to that source's boundaries — but only when the out-of-source part is **whitespace**. Visible text dragged in from outside, and selections spanning two sources, stay rejected. `explainCaptureFailure` shares the normalization.
- **Guard:** `tests/client/ui/capture.spec.ts` (triple-click spill clamps to the paragraph; visible-text drag-in and two-source selections rejected) plus the live triple-click and deterministic seam checks in `review/selection-gestures/probe/lead-diagnosis/`.

## 56 — The annotation bar opened by itself from a pointer selection

- **Seen:** triple-clicking the last paragraph of a reply popped the annotation bar immediately, while triple-clicking the paragraph above it did not. The bar is right-click-gated by design (Chat's Quote surface owns a plain selection; the plugin bar arrives on right-click with the ⇧/keyboard/⋯ bypasses), so this was a regression, not a preference.
- **Broken:** `SelectionAffordance` still opened the bar from two selection-driven paths — the deferred `pointerup` capture and the debounced `selectionchange` capture — and only stood down when Chat's own surface opened. For the last block of a source, Chat also rejects the block-boundary selection, so no Chat surface appeared and the plugin's fallback showed its bar; the fourth-block clamp (#55) made exactly that selection capturable, which surfaced the bad path. A drag selection whose range spilled past the source had the same effect. The 6-line paragraph above it was mid-source: Chat's surface opened and the plugin stood down, which is why only one paragraph misbehaved.
- **Fix:** pointer selections (drag, double-click, triple-click) never open the bar; the only selection-change path left is a keyboard-extended selection, and it consumes its focus intent explicitly. The deferral machinery and its `W2` reason are deleted; the `contextmenu` claim also returns early while Chat's surface is open (instead of preventing the native menu with no bar to show).
- **Guard:** `tests/client/ui/selection-affordance.spec.tsx` ("does not open the bar from a pointer selection", "does not open the bar from a double/triple-click selection"; every open-bar test now goes through the right-click path or the keyboard path), `tests/client/ui/selection-editor.spec.tsx` (right-click open), and the live gate check in `review/selection-gestures/probe/lead-diagnosis/` (triple-click and drag: 0 bars at +30/+120/+200 ms; right-click: prevented + 1 bar; ⇧+right-click: not prevented, 0 bars).
