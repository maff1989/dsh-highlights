# Implementation notes, dev loop, and M0 evidence

Companion to `DESIGN.md` / `IMPLEMENTATION.md`. Records how the plan was actually built, what deviated and why, and how to reproduce the verification.

## 1. Sandboxed dev environment (nothing outside the workspace is touched)

Everything runs against a private `DSH_HOME` inside the workspace:

```sh
WS=/home/matthew/Documents/deepseek-harness/default-workspace
export DSH_HOME="$WS/.dsh-dev"              # private DSH home (sessions, storages, profiles)
export npm_config_store_dir="$WS/.dev-tools/pnpm-store"
export npm_config_cache="$WS/.dev-tools/npm-cache"

# first time: create the dev profile from the shipped web template
dsh --profile dev --from-default-profile web --dump-config

# install the plugin into the dev profile (bundle row + pnpm linked dependency)
dsh plugin --profile dev add "$WS/highlight-plugin/dsh-highlights"

# run the dev GUI (managed background job; port 3095)
dsh --profile dev --no-open --port 3095
```

The plugin's own build:

```sh
cd "$WS/highlight-plugin/dsh-highlights"
pnpm build        # host ESM + wrapped client bundle
pnpm check:bundle # activates the built client bundle in a fake module table
pnpm typecheck
```

Why a private home: the file sandbox makes everything outside the workspace read-only, so the real `~/.dsh` profile can only be modified by the user. The private home also keeps experiment data out of the real session history.

## 2. Deviations from the design (with reasons)

Each deviation below is formalised as an architecture decision record. The
per-defect narrative (symptom → root cause → fix → guard) lives in
[`issue-log.md`](issue-log.md).

| Deviation | ADR | | Deviation | ADR |
|---|---|---|---|---|
| D-1 Host transport | ADR-002 | | D-9 Theme tokens | ADR-008 |
| D-2 CSS delivery | ADR-008 | | D-10 Gesture triggers | ADR-006 |
| D-3 Fixed domain name | ADR-005 | | D-11 Portal wrapper box | ADR-011 |
| D-4 Host-authoritative validation | ADR-002/005 | | D-12 Record ids | ADR-009 |
| D-5 zod pin | ADR-005 | | D-13 Paint signal | ADR-010 |
| D-6 `insertQuote` arity | ADR-012 | | D-14 Placement/card/timing | ADR-006/012 |
| D-7 Session bridge seat | ADR-011 | | D-15 Editor & naming | ADR-012 |
| D-8 Node identity | ADR-007 | | D-16 Self-interaction | ADR-006/012 |


| # | Design said | Built instead | Why |
|---|---|---|---|
| D-1 | Generic Connection RPC channel (`ctx.connection.rpc.handle('/highlights')`) | **Exact Fetch route** `<code>ctx.connection.fetch.register({ path: '/api/highlights', methods: ['POST'] })</code>`, JSON envelope `{ endpoint, payload }` | The generic channel registry installs its own physical route through the registering fiber's `webServer`, and an out-of-tree plugin cannot satisfy that access path: registration throws `cannot get property "webServer" without inject` even with `webServer` in the plugin's `inject` and inside a scoped `ctx.inject([...])`. The exact-route path is the documented alternative ("a feature that needs a response outside the RPC envelope"), is used by `api-session-controller` and `plugin-manager`, and gives Connection-owned authentication plus the owner-Peer fence for free. Endpoint/error/result semantics are unchanged. |
| D-2 | CSS Modules via the repo's tsdown preset | **Plain namespaced CSS strings** (`dshhl-` prefix) injected as one plugin-owned `<style data-plugin-css="dsh-highlights">` | The repo preset is not a published package; the CSS-Modules loader path would have to be re-implemented on top of the hand-rolled bundler. Namespaced strings keep the bundle dependency-free and make the `::highlight()` rules (which cannot be scoped by a hashed class anyway) first-class. |
| D-3 | Domain store with configurable `domain` name | **Fixed domain name `highlights`**, `layout: 'per-record'` | `defineDomain` types are spec-driven; a runtime name adds casts for no user value, and a renamed domain would silently start empty. Per-record layout keeps writes O(1) and individual deletes cheap. |
| D-4 | Record schema in shared zod for both halves | Shared schema is **host-authoritative**; the browser imports types only | Keeps a second zod runtime out of the bundle and makes the Host the single validation boundary (the route parses every payload). |
| D-5 | `engines.dsh` + peer declarations | Same, plus zod pinned to `4.4.3` | `dsh-storage-domain` depends on zod `4.4.3`; matching it removes type friction between its `domainTable()` signature and our records. |
| D-6 | Insert a quote with a display summary (`insertQuote(text, summary)`) | `insertQuote(text)` only; provenance rides a separate attribution line (`insertText`) | The user's runtime (`0.2.2-rc.1`) declares `InputActions.insertQuote(text: string)`; the display-summary overload arrived in a later release. The sent message still carries the quote as a Markdown blockquote plus "— from <session> · <date>". |
| D-15 | One tall editor for every gesture, labelled "Highlight" | Compact annotation popover (272 px, 2-line quote, colour row, tag field, note behind "+ Add note"), anchored under the selection, with the button renamed **Annotate** | Live feedback: the editor read as a large disorienting dialog over the text, and "Highlight" was ambiguous because the colour dots already highlight in one click. The popover now only carries what the action needs; occasional fields appear on demand. |
| D-16 | Selection state read only from the browser selection | The bar survives its own interactions: focusing a field inside it no longer dismisses it, and non-text controls `preventDefault()` on pointerdown | Focusing the note textarea collapses the document selection, which both cleared the anchor and (before the guard) closed the popover — the same reason the product's Quote action prevents pointerdown. Found by the interaction test, fixed before it reached the browser. |
| D-13 | Paint driven by the Host read only | `upsert`/`evict` bump the store revision, and create publishes an optimistic record (version 0) before the write resolves | The painter (and the panel/page) react to the store revision, which local writes never changed — a saved highlight only appeared on the next background refresh, which read as a multi-second delay. Local writes now publish immediately and are reconciled with the Host's authoritative record; a failed write rolls the provisional record back. |
| D-14 | One floating surface for everything | Selection action beside Chat's surface (same row, measured); `ItemCard` replaces the button-heavy dialog; the bar waits for `pointerup` | Live feedback: the bar sat in its own row above "Quote text", the edit card read as six buttons, and the bar appeared mid-drag. The affordance now measures itself and sits beside the product's surface, the card keeps frequent controls and hides occasional actions behind More, and a pointer-down flag gates every detection path so the bar appears when the gesture ends, like Quote does. |
| D-11 | A fixed-position portal wrapper styled `display: contents` | `.dshhl-affordance` generates a box (`display: block`) with its inline fixed positioning honoured | `display: contents` removes the box, so `position: fixed` stopped applying and the bar joined normal flow at the end of `<body>` — the page grew while a selection existed, which shifted the transcript (reported from a live session). |
| D-12 | Browser mints ids with `crypto.randomUUID()` | `newRecordId()` prefers `randomUUID`, else assembles a v4 UUID from `getRandomValues`, else `Math.random` | `crypto.randomUUID()` is **secure-context-only**; a Harness GUI served over plain HTTP on a LAN address is not a secure context, so saving a highlight threw `crypto.randomUUID is not a function`. Covered by three tests including the insecure-context path. |
| D-9 | Style against `--dsw-alias-*` names as remembered | Names were wrong (`bg-elevated`, `bg-container`, `bg-layout`, `bg-secondary`, `label-inverse`, `separator-primary/secondary`, `elevation-md/sm`) and resolved to nothing, so the floating bar had no surface, border, or shadow | Audited first against the rc.2 clone (511 tokens) and then against the **installed rc.1 runtime (414 tokens, aliases projected inline on `<body>`)**, which caught two further defects: the palette was declared on `html` where the aliases do not exist (so every `color-mix()` was invalid and swatches/highlights were transparent), and `--dsw-alias-label-on-color` does not exist in rc.1 (the primary button rendered its label in its own colour). Mapped to: `bg-layer-1/-2`, `bg-base`, `label-on-color`, `border-l1/-l2`, `shadow-lv1/-lv2`. The toolbar is now a real pill (`--dsw-alias-button-primary-fill` action, 18 px swatches, elevated surface). The palette is declared on `:where(html), :where(body)` with alias fallbacks, `::highlight()` carries a guaranteed-visible fallback, and the same mapping was applied to the page and panel stylesheets. |
| D-10 | One gesture trigger for the selection action | Four redundant paths: capture-phase `pointerup`, debounced `selectionchange`/`keyup`, a mirror of Chat's own surface visibility, and a **250 ms poll** with dismissal memory: capture-phase `pointerup`, debounced `selectionchange`/`keyup`, and **mirroring Chat's own selection surface** when it becomes visible | A live report showed the action only on right-click: the product's gesture bookkeeping could clear or consume the left-drag path before our handler observed a usable selection. Mirroring the product's own surface (which is already validated and positioned) makes detection independent of pointer-event ordering; the product also now has `preventDefault()` on our context-menu path so the native menu cannot cover the editor. Suppression by another surface is scoped to that surface being open (a stale stash entry could otherwise hide the action for the rest of the session), and a rejected selection now logs one line with the exact failing condition. |
| D-8 | Node identity taken from the `assistant-step` key spelling | `data-chat-flow-kind === 'assistant-step'` **or** a key matching `^<n>:assistant<turn>:<step>`; the first field delivery tested the key for the string `assistant-step` and captured nothing | Chat's `data-chat-node-key` is built by `conversationContextKey(kind, id)` with the **Conversation** kind (`assistant`), so a real key is `9:assistant4:2`; `assistant-step` is the **Chat flow** kind and lives in `data-chat-flow-kind`. Found from a live report ("only Quote appears"); pinned by `tests/client/ui/capture.spec.ts` including the real format, the flow-kind fallback, and a user-message rejection. |
| D-21 | Pointer selections may open the plugin bar, deferring one task so Chat's surface can claim it | A pointer selection (drag, double-click, triple-click) never opens the bar; the only selection-change capture path is a keyboard-extended selection, and the contextmenu claim returns early while Chat's surface is open | The docs have always said the bar is right-click-gated (Chat's Quote owns a plain selection), but the fallback paths showed the plugin bar whenever Chat's surface did not open — measurably only on the last block of a reply (Chat rejects its block-boundary selection) and on drag ranges spilling past a source, i.e. a paragraph-specific "the bar appeared by itself" report. Deleting the path is the only way the gate is true for every selection shape; the keyboard path keeps its focus hand-off by carrying an explicit `focusAfterShow` intent instead of the pointerup deferral |
| D-20 | Block-boundary selections are not highlightable | `captureSelection` clamps a selection with one endpoint inside a source and the other outside every source to that source's boundaries, but only when the out-of-source part is whitespace; visible text dragged in from outside and two-source selections stay rejected | Chromium's triple-click block selection ends at the next block boundary; on the last block of a source that boundary is turn-tail chrome (`SPAN` inside an action-row `BUTTON`), so the whole-paragraph selection was rejected and right-click showed only the browser menu. The whitespace test is the boundary between an innocent block-boundary spill and a genuine drag-in from unrelated text |
| D-19 | A right-click must land inside a selection line box | `pointInsideRange` also accepts the interior leading between selected lines (±8 px around each line box, restricted to the range's vertical span) while the outer edges stay strict | A 16 px line box on a 24 px pitch leaves a 7 px band between lines that belongs to no rect; a right-click there showed only the browser menu (measured dy 1–7 vs dy ≥ 8). Long wrapped paragraphs hit it far more often than short blocks, which read as "the bar works here but not there" |
| D-17 | Chat's contextmenu interaction carries the right-click editor | The plugin owns the `contextmenu` gesture itself: a capture-phase listener on `document`, a selection-anchored bar, `Shift`+right-click and the keyboard context-menu key bypass, and a bar More menu with Copy selection and a Browser-menu hand-back | Chat anchors a contextmenu surface at the pointer by design (`text-interaction.ts` `place()`), writes the position on every layout/scroll/resize pass, and gives a consumer no anchor preference, so a plugin-rendered editor inside that surface landed under the cursor instead of against the selection (measured: `left = cursor.x − 0.16 px`, `top = cursor.y + 9 px`). The plugin's own bar places from the selection rects (`placeFloating`), and the escape hatches keep the native menu reachable — no web page can open the browser's menu on demand, so the hand-back arms the next right-click. Reviewed in `review/selection-gestures/`; upstream anchor ask #13 retires the ownership. |
| D-18 | Per-instance gesture listeners gated on the bridge's `visible` signal | Listeners are installed for the lifetime of the mounted bridge; gesture admission is decided per event from the DOM (`contextMenuSource` scopes by conversation, selection client rects reject hidden content), the bar renders only for its own session, and a hidden conversation dismisses its pending capture | Live instrumentation showed the `visible` signal false on cache-disabled cold loads while the transcript was rendered (4 of 5 loads) — a gate on it left the whole gesture layer uninstalled, so right-click did nothing until an unrelated event. Per-event DOM admission removes that dependency; the observation service still polls visibility, bounded, for dismissal-on-hide. The single app-scoped controller that would make one listener owner structural is designed in `review/selection-gestures/analysis/event-routing-audit.md` (deferred) |
| D-7 | Session bridge mounted for the on-screen session | `conversation.session.header.utilities` list entry rendering `null` | It is the only always-mounted session-scoped seat that is additive (a fresh list id) and needs no replacement of a shipped view. It hosts the painter observer, the composer bridge, the selection affordance, and the click-to-edit card portal. |

## 3. Runtime evidence

Reproduce with the dev loop above. What was observed:

1. **Profile composition** — `dsh --profile dev --dump-config` contains the layer
   `# == dsh-highlights` → row `{ id: highlights, name: dsh-highlights, config: { maxRecords: 10000, … } }`.
2. **Host activation** — the dev GUI boots with **no** `did not activate` warning and no plugin error (an earlier attempt failed loudly and was fixed, see D-1). The store opens and `~/.dsh-dev/storages/highlights/` is created.
3. **Client scanning and serving** — the index HTML's boot graph contains
   `{"id":"dsh-highlights","url":"plugins/??dsh-highlights/client.js&rev=…"}` inside the application batch, and fetching that URL returns `200` with our wrapped bundle (the served bytes carry the module-loader wrapper and the `api/highlights` route path).
4. **Exact Fetch route** — an authenticated same-origin `POST /api/highlights` with `{"endpoint":"hello"}` answers
   `{"ok":true,"value":{"protocol":1,"domainVersion":1,"installId":"01a1…","count":0,"maxRecords":10000}}`.
5. **Full record lifecycle over that route** — create (tags normalised to `["release","migration"]`, `version: 1`), list (revision advances), update (`status: "written"`), stale version (`status: "conflict"` carrying the live record at version 2), remove (gone from `list`), tombstone visible with `includeTombstones`, restore, unknown endpoint (`unknown-endpoint`), invalid colour (`bad-request` with `record.colorId: Invalid input`).
6. **Storage on disk** — `storages/highlights/meta/install.json` plus one `storages/highlights/records/<uuid>.json` per record (`{ version, record }` envelope written by the JSON backend).
7. **Client activation harness** — `pnpm check:bundle` evaluates the built bundle in a fake module table with a fake client context and asserts: exactly one registration with id `dsh-highlights`, `apply`/`inject`/`name` exports, `inject` array present, `main` registration under key `highlights` with the namespace, `sidebar.panellist` row id `highlights` with a label thunk, two locale dictionaries (en, zh), one plugin-marked stylesheet containing `::highlight(dsh-hl-1)`, and two same-origin credentialed route calls from the priming refresh.
   Current result: `bundle check OK: 6 slot registrations, 2 dictionaries, 2 route calls, 1 stylesheet(s)`.

## 4. Final verification (2026-11-11)

| Gate | Command | Result |
|---|---|---|
| Types | `tsc -p tsconfig.json --noEmit` | clean |
| Tests | `vitest run` | **366 passed / 26 files** (post-P0 remediation; 226/12 before it) |
| Build | `node scripts/build.mjs` | host `19.4 KiB` ESM (+47.9 KiB map) + client `783.6 KiB` wrapped CJS, module-table contract asserted |
| Bundle activation | `node scripts/check-bundle.mjs` | 6 slot registrations, 1 right-Sidebar tab type, 2 dictionaries, 2 priming route calls, 1 plugin-marked stylesheet |
| Live Host (sandboxed dev profile) | boot + HTTP | no activation warnings; boot graph carries `dsh-highlights`; served bundle byte-identical to the build; `POST /api/highlights` `hello`/`create`/`list`/`update`/`remove`/`restore` verified incl. CAS conflict, tombstone filtering, validation errors |

Bugs found after the first delivery and fixed: the assistant-node identity described in D-8 (the shipped UI offered no highlight action at all); plus three found during integration: NaN in the position comparator for two absent Turn/Step anchors; the client store's missing supersede rule (a slow read could clobber a confirmed write); `update` with `note: null` not clearing the note. Both config fields the README once listed as unimplemented (`insertionAttribution`, `pollIntervalMs`) are now advertised through `hello` and honoured by the browser half.

The 2026-11-11 review pass then found and fixed ten P0 findings (eight workstreams) (split response/reasoning seats, selection-editor and item-card dismissal, CAS conflicts, missing session context, insertion routing, clipboard fallback, reveal race, stale stash, message-mark dedupe). The current verification is the `366 / 26` row above; see [`../../TRACKING.md`](../../TRACKING.md) and [`../../review/QA-P0.md`](../../review/QA-P0.md).

## 5. Reminder for the final install (user-run)

The plugin is installed in the real `web` profile serving `:3080` and in the private dev profile. Reinstall/upgrade in the real GUI with:

```sh
dsh plugin --profile web add /home/matthew/Documents/deepseek-harness/default-workspace/highlight-plugin/dsh-highlights
# then restart the `dsh web` process that serves :3080
```

Records live in `~/.dsh/storages/highlights/`; the dev home's copies stay under `.dsh-dev/` and can be deleted at any time.
