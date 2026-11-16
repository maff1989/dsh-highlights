---
description: "Digital-book-style highlights for DeepSeek Harness: mark assistant reply text, browse items per Session and across Sessions, jump back to the source, and insert a quote into a composer."
kind: "package-reference"
---

# dsh-highlights

English | [中文](#中文) — the plugin UI ships `en` and `zh` dictionaries; the Chinese summary below covers the essentials.

## Summary

`dsh-highlights` saves selected text from a settled assistant reply as a durable **highlight**, with one of five themed colours, free-form tags, an optional note, and a star. It also saves a whole reply as a **mark**. Highlights are painted in place in the Conversation transcript: rounded/padded fills come from a plugin geometry overlay (ordinary scroll content), with the CSS Custom Highlight API supplying text colour; a whole-reply **mark** is painted as one rounded colour band behind the reply (not a character wash), so it reads differently from a phrase/sentence/paragraph highlight. React's tree is untouched. They are listed in a right-panel Session tab and on a global **Highlights** page, revealed in the transcript, and insertable into a composer as a quote.

The package is an out-of-tree DeepSeek Harness bundle: one Loader row serves a Host half (durable store plus `/api/highlights`) and a browser half (the UI). Records live under `$DSH_HOME/storages/highlights/`, outside the Session log.

## Table of Contents

- [Use this package](#use-this-package)
- [Installation](#installation)
- [Data, privacy, and erasure](#data-privacy-and-erasure)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Select reply text in a settled assistant message. Chat's floating selection surface shows the product's **Quote text** button, and this plugin's own bar stands down while that surface is open, so a plain selection shows only Quote.

Chat admits only one plugin to its floating selection surface (the first registration wins, and the shipped Quote plugin registers first), so this plugin never shares it. A pointer selection never opens the plugin's bar by itself — drag, double-click and triple-click all leave the bar to the right-click. Its own bar arrives on that different gesture: right-clicking a highlightable reply selection shows the bar anchored to the selection — below when it fits, otherwise above, clamped to the transcript — with five colour dots, **Annotate**, and **⋯ More actions**, and suppresses the native menu.

The gesture never fully takes over. **⇧ + right-click** (hold Shift before the press) and the keyboard context menu key (Shift+F10 / ≣) bypass the plugin for the browser's own menu, and **⋯ More actions** offers **Copy selection** and **Browser menu** — the latter closes the bar with a brief toast and hands the next right-click back to the browser, because no page can open the browser's menu itself. The native menu is untouched everywhere else: no selection, a right-click outside the selection, the composer and other editable fields, links, file chips, buttons, context-menu triggers, user-message text, reasoning, and the plugin's own bar.

Saved items paint immediately. Three ways to review them: a Highlights icon in the Session header (opens the right-panel **Highlights** tab), the left-nav **Highlights** page for every Session, and clicking painted text to open the item card. The assistant action row offers **Save to highlights** for a whole reply.

| Surface | What it does |
|---|---|
| Selection bar + annotation popover | Shown on a right-click over a highlightable selection and anchored to it: five colour dots (immediate save), **Annotate** (compact popover for colour, the intent — note / dispute / direct / remember — tags and note), and **⋯ More actions** (Copy selection, Browser menu). Defaults to the last colour used. |
| Assistant action row | Create one whole-message mark per finalized reply. |
| Item card | Left-click painted text: colour/star/close header, quote excerpt, tags, note, and a footer with **Save** plus a **⋯** menu (show in conversation, insert, copy quote, delete). |
| Right-panel tab | Opened by the Highlights button in the Session header (or from a page row). The Session's items in transcript-position order, with search, colour/tag/starred/author filters, the state cursor, and row actions. |
| Global Highlights page | Every Session's items grouped workspace → Session; search, colour/tag/starred/author/unanchored filters; "worth another look" (each row states why it resurfaced); edit, reveal, copy, delete (Undo is offered in the right-panel tab, not on the page). |
| State cursor | Every row carries `new → kept → compiled`: click, Enter/Space or `←`/`→` on the focused chip. `kept` means "I've decided this matters"; `compiled` means "this made it into something". |
| Passive resurfacing | A kept-count badge on the Session row in the sidebar (with a hover preview of the top items), and a per-turn digest — `2 highlights · 1 kept` — in the transcript, which opens the panel. |
| Agent proposals | With agent writes enabled, the agent can propose up to three highlights per reply. The transcript row shows each proposal verbatim; **Keep** writes it as an agent-authored item, **Dismiss** drops it. Nothing is stored until you keep it. |
| Context menu | Right-click a Session row (or a tab) for **Copy this session's highlights** as Markdown, **Open Highlights**, and **Brief the agent**. |
| Composer dock | A queued quote that cannot reach a busy composer is now shown above the input instead of vanishing until it lands. |
| First run | An empty page explains the gesture, names the chord that actually registered, and says when the agent cannot see your highlights. |
| Reveal | Opens the owning Session, pages history back when needed, and jumps once (instant, no scroll animation) so the **highlighted text range** — not just its row — is in view. The reveal flash is currently disabled; best effort, never an error path. |
| Insert | Inserts the verbatim quote into the current composer, or creates a new Session and inserts it there. Inserting into another existing Session is deferred (P1). |

Highlights are scoped to their owning Session (a fork does not inherit the parent's items), and editable presentation fields are colour, tags, note, and star; the quoted text is immutable — delete and highlight again instead. Delete is soft (a tombstone); the right-panel tab keeps an inline Undo for the most recent delete. The global page and the item card do not offer Undo yet (tracked as P1).

<a id="installation"></a>
## Installation

Install the package into the `web` profile of the DeepSeek Harness installation that serves your GUI:

```sh
dsh plugin --profile web add /home/matthew/Documents/deepseek-harness/repos/dsh-highlights
# replace the path with your checkout location
```

The bundle row is written into the profile and the package becomes a linked dependency. **Restart the `dsh web` process that serves the GUI** — the Host half opens the storage domain and registers `/api/highlights` at activation, so a running process keeps the previous plugin set. Verify the row without booting the GUI:

```sh
dsh --profile web --dump-config | grep -A3 highlights
```

Uninstall with `dsh plugin --profile web remove dsh-highlights`, then restart. Uninstalling leaves `$DSH_HOME/storages/highlights/` untouched, so reinstalling restores the items; delete that directory by hand if you want the bytes gone.

Prerequisites: DeepSeek Harness `>=0.2.2-rc.1 <0.3.0`, Node `>=24.9.0`, and `pnpm` on `PATH` for `dsh plugin add`. The Host half injects `connection`, `storageDomain`, `tools` and `skills` — the last two because the agent-read surface registers into them — so a composition without the tool/skill registry cannot activate this plugin (it stays displayed as not activated rather than half-mounted). The package pins `zod` to `4.4.3` to match `@deepseek-ai/dsh-storage-domain`.

<a id="data-privacy-and-erasure"></a>
## Data, privacy, and erasure

Records live in the storage domain `highlights` under `<DSH_HOME>/storages/highlights/`
— with the default installation (`DSH_HOME=~/.dsh`) that is
`~/.dsh/storages/highlights/`:

```text
storages/highlights/
├── meta/install.json          # { installId, createdAt } — the origin stamped on records
└── records/<uuid>.json        # one document per item: { version, record }
```

- **Not in the Session log.** Highlights are NOT Session events: they are absent from the Session log, from Session log export, from the default log contribution, and from telemetry released by the harness. They are visible to the model only when the user turns on agent access, which is off by default — see [Model Experience](#model-experience). An agent proposal is not stored at all until the user keeps it.
- **Not exported.** There is no export, print view, or sync transport in V1; copying a quote puts text on the clipboard only when you ask for it.
- **No network egress.** The browser half talks to the same-origin `/api/highlights` route only. Nothing is uploaded.
- **Stored as user content.** The Host writes the selected text, tags, and note unencrypted to disk under your profile, with the same trust model as workspace and Session data. Anyone who can read `$DSH_HOME` can read your highlights.
- **Delete is not erasure.** Delete writes a tombstone (`deletedAt`) and hides the item from every surface. The record file, including the quoted text, is removed only by the tombstone purge: at Host open, records tombstoned longer than `purgeTombstonesAfterDays` (default 30 days) have their files deleted. The purge runs when the storage domain opens (a Host start), not on a timer — a record may therefore persist for the retention window plus the time until the next restart. Delete immediately if the quote is sensitive; do not rely on the tombstone window.
- **Browser-local data.** The pending-insertion queue is kept in `localStorage` (`dsh.highlights.queue.v1`) and can hold quote text for up to 24 hours; UI preferences (`dsh.highlights.prefs.v1`) store only the last colour used. Clearing site data removes both, never the Host records.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Developer reference: package shape, transport, storage, and configuration</summary>

### Package shape

One package, one Loader row `highlights` (`cordis.patch.yml` inserts it; `package.json` declares `dsh.bundle.patch` and `dsh.client.platform: "web"`). Two halves:

| Half | Artifact | Owns |
|---|---|---|
| Host | `lib/index.js` (ESM, Node) | `apply(ctx, config)`: opens the `highlights` storage domain, ensures `meta/install`, purges expired tombstones, registers the exact Fetch route `/api/highlights`, closes the domain on unload. Injects `connection` and `storageDomain`. |
| Browser | `lib/client.js` (`__ModuleLoader__` CJS wrapper) | Locale dictionaries (`en`, `zh`), the injected `::highlight()` stylesheet, the record store, the painter, the selection bar, the message action, the null-rendering Session bridge, the right-panel tab, and the global page with its sidebar row. |

### Transport

The Host exposes an **exact Fetch route** (not a generic Connection RPC channel, which requires `webServer` in the registering fiber): `POST /api/highlights`, buffered body, JSON envelope `{ endpoint, payload }` → `{ ok: true, value } | { ok: false, error: { code, message } }`. Connection owns authentication and the owner-Peer fence. Business outcomes such as a lost compare-and-set race are reply values, not transport failures. Endpoints: `hello`, `list`, `create`, `update`, `reanchor`, `remove`, `restore`; error codes: `bad-request`, `unknown-endpoint`, `not-found`, `limit-exceeded`, `forbidden`, `internal`.

### Storage and concurrency

Domain `highlights`, version 1, `layout: 'per-record'` (one JSON document per item, so a write or delete rewrites one file rather than a whole unit). Reads are synchronous from the domain's in-memory state; writes are durable before the reply resolves. Every record carries `schemaVersion: 1`, a UUID-shaped `id` (records are client-minted UUIDv4; only `meta/install.installId` is UUIDv7), `origin` (the browser echoes the install id; the Host stores it as supplied), `version` (compare-and-set counter starting at 1), and `createdAt`/`updatedAt` from the Host clock. A stale `expectedVersion` returns `{ status: 'conflict', record }` with the live record; nothing is overwritten. The live-record cap (`maxRecords`, default 10 000) is checked before a create and refuses the write with `limit-exceeded`. All writes are serialized by the single Host process.

### Anchors

A highlight stores `nodeKey` (Chat's durable `data-chat-node-key`), `sourceIndex`, the verbatim `quote`, ±48 characters of `prefix`/`suffix`, and `start`/`end` offsets in the plugin's own text projection (`projection: 1`). Resolution is a four-step ladder — recorded position verified by quote and context, unique quote match, best of several quote matches, then stale — and never mutates the transcript. A stale anchor is a normal state: the list still shows the quote and marks the item **Unanchored**.

### Configuration

Host row configuration (Schemastery, see `src/host/config.ts`):

| Field | Default | Effect |
|---|---|---|
| `maxRecords` | `10000` | Maximum live records; further creates are refused with `limit-exceeded`. Min 100, max 100 000. |
| `insertionAttribution` | `true` | Controls the "— from <session> · <date>" line on insertion and copy. Advertised to the browser half through `hello`, which honours it when the record carries a session title (records created before the P0 context fix may not). |
| `pollIntervalMs` | `0` | Optional record-set refresh interval while the page is visible; `0` disables polling. Advertised through `hello`. |
| `purgeTombstonesAfterDays` | `30` | Tombstone retention, measured against the Host clock at the next domain open. Min 1, max 3650. |

Identities and protocol numbers (`PLUGIN_NAME`, domain name, palette size, projection version, caps, protocol version) are compiled into the shared module; deployment-varying values are the fields above. The storage domain name is fixed (`highlights`) — there is no configurable `domain` field, so a second store needs a second package/profile rather than a renamed row.

### Freshness

There is no forwarded change event out-of-tree. The Browser store refreshes on `hello`+`list` at activation, after any own write (the confirmed record replaces the optimistic one), on `connection/reset`, and on window focus (subject to a 2 s freshness window). A read captures a write ordinal before it starts and re-reads (at most three times) if a local write landed while it was in flight; a read that hits the retry bound publishes its answer, so the guarantee is bounded best effort rather than absolute. Another tab's writes appear when that tab's window regains focus; there is no `storage`-event nudge in V1.

</details>

<a id="model-experience"></a>
## Model Experience

**Off by default: with agent access off (the shipped default), this section is still "None."** Nothing the
user stores reaches a request, and no tool is registered.

When the user turns agent access on — in the plugin's settings page, one install-wide switch
(`agentAccess: 'off' | 'read' | 'read-write'`, default `off`) — the Host registers a small surface:

- **`list_highlights`** — paged, filtered (scope, state, author, tags, starred, query). Returns id, a ≤160-char
  excerpt, colour, tags, author, state, star, session title, age and an `anchored` flag. Notes are never
  listed, and the query does not search them.
- **`get_highlight`** — one item by id, including the full quote, the note (withheld when the item is marked
  private) and its anchor context.
- **`highlight_write`** — *proposals only*, gated behind the stricter `read-write` tier: at most three per
  call, each a verbatim quote plus an optional note, tags, colour and intent. Nothing is stored. The user
  keeps or dismisses each proposal in the transcript row; keeping resolves the quote to an anchor in the
  rendered conversation and writes an agent-authored item through the ordinary create path.
- **A runtime skill (`highlights`)** — one catalog line teaching when the margin is worth consulting or
  proposing to, and when it is not.

Both tools are consent-gated and scope-intersected: a call can only narrow the stored scope
(`session`/`workspace`/`all`), and an unspecified or unavailable calling identity is refused rather than
widened. Every result returns user-authored strings as JSON values inside a labelled envelope that states they
are untrusted display content, never as prose.

Highlights are **never injected into a request**: no prompt section, no runtime context, no automatic message.
The model reads the store only by calling a tool, so a turn that ignores the margin costs nothing but the
schema.

#### Token effect

Zero while agent access is off. At `read`, a fixed schema cost per request (two small tools plus one skill
catalog line). At `read-write`, one more small schema. On a turn that calls a tool, a bounded result: at most
10 rows per page, excerpts capped, notes only from `get_highlight`, at most three proposals.

#### KV Cache effect

Prefix-stable while the switch and the schemas are unchanged. Toggling agent access is a deliberate one-time
prefix change (tools and skill register or unregister together, and the read pair is not re-registered when
only the write tier changes); after that, results are append-only. Tool visibility is never gated per step,
so the tool set cannot flip between steps.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **Scope.** Only reply text of a settled assistant step is highlightable — not reasoning/thinking, user messages, tool calls or output, injected context, or composer text. The **Trajectory** view is excluded: it exposes no Chat text-interaction sources and no markdown body seat, so highlights neither render nor can be created there.
- **Painting.** Rounded/padded text-highlight fills are a plugin overlay and work without the CSS Custom Highlight API. `CSS.highlights` is still used for text colour (Chromium 105+, Safari 17.2+, Firefox 140+); without it text colour degrades but the overlay still draws rounded text fills and message bands. Painting is visual only: assistive technology is not told about a highlight, which is why every row carries the quote as its accessible name.
- **Anchors are best effort.** Regenerated replies, edited content, folded/uncollapsed reasoning, paged-out history, archived Sessions, and out-of-band Session deletion can leave an item unanchored. Items are never deleted automatically; they show as **Unanchored**. The Host has a `reanchor` endpoint, but V1 ships no re-anchor affordance in the UI.
- **Delete is a tombstone, not erasure.** See [Data, privacy, and erasure](#data-privacy-and-erasure): the purge runs at Host open after `purgeTombstonesAfterDays` (default 30).
- **Local only.** No cross-device sync, export, import, or print view. The schema is sync-ready (`id`, `version`, `updatedAt`, `deletedAt`, `origin`) but no transport exists. Multi-tab freshness is focus-based; there is no push channel and no localStorage nudge, though the configured `pollIntervalMs` is implemented as an opt-in visible-page refresh.
- **Store scale.** Every item is a separate JSON document and the domain loads all records into memory at Host open, bounded by `maxRecords` (default 10 000). Editing does not rewrite the unit; opening a large store costs a full read.
- **Insertion is quote-text only, current or new session.** On `0.2.2-rc.1` the composer's `insertQuote` accepts text and no summary chip, so the quote is inserted verbatim; the attribution line is appended as text. A refused insertion is queued for its destination Session, retried every 2 seconds for up to 10 seconds per attempt window, and expires after 24 hours; there is no late-failure toast (the synchronous result is `queued`). Inserting into another existing Session is not implemented yet.
- **Polling is opt-in and coarse.** `pollIntervalMs` defaults to off; when enabled it refreshes the record set on a fixed interval while the page is visible, which is the only substitute for a Host-pushed change event in V1.
- **Single-user local trust.** There is no per-record authorization: the Host gateway is the trust boundary, and any same-origin authenticated owner Peer can read and write every record. There is no actor identity on the Host.
- **No user-defined colours.** Five fixed themed palette slots; V1 has no colour picker beyond them.

`docs/known-limitations.md` restates these with the concrete failure modes; `docs/upstream-asks.md` lists the harness changes that would retire the out-of-band pieces.

<a id="further-exploration"></a>
## Engineering records

- [`docs/issue-log.md`](docs/issue-log.md) — every defect found during
  implementation and live use: symptom, root cause, fix, regression guard.
- [`docs/implementation-notes.md`](docs/implementation-notes.md) — sandboxed dev
  loop, deviations from the design with reasons, and the verification evidence.
- [`docs/known-limitations.md`](docs/known-limitations.md) — what the plugin
  deliberately does not do, and why.
- [`docs/upstream-asks.md`](docs/upstream-asks.md) — the thirteen upstream changes that
  would retire the workarounds.
- [`docs/workaround-ledger.md`](docs/workaround-ledger.md) — every mechanism that exists because the
  harness lacks a capability, with the ask that retires it and the exact deletion step.
- [`../ADRS.md`](../ADRS.md) — the nineteen architecture decisions
  (outside the installed package, in the project root).

## Further Exploration

- [DESIGN.md](../DESIGN.md) — product specification, architecture, data model, host/client design, and risks.
- [IMPLEMENTATION.md](../IMPLEMENTATION.md) — milestone plan, test matrix, and definition of done.
- [implementation notes](docs/implementation-notes.md) — deviations from the design, the sandboxed dev loop, and M0 evidence.
- [Known limitations](docs/known-limitations.md) — failure modes and deferred work in reference form.
- [Upstream asks](docs/upstream-asks.md) — thirteen harness changes with proposed APIs.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Dev loop, verification commands, and local installation — click to expand</summary>

Everything below runs from this package directory.

```sh
pnpm build          # Host ESM (lib/index.js) + wrapped client bundle (lib/client.js)
pnpm build:watch    # esbuild watch; produces lib/client.raw.cjs only — run pnpm build for the served lib/client.js (P1 dev-loop fix)
pnpm check:bundle   # load the built client bundle in a fake module table and assert its contract
pnpm typecheck      # tsc -p tsconfig.json --noEmit
pnpm test           # vitest run (node project: shared/host/client data; ui project: jsdom components)
pnpm test:watch     # vitest
pnpm verify         # typecheck + test + build + check:bundle
```

Tests are configured in `vitest.config.ts` with two projects: `node` for `tests/**/*.spec.ts` outside `tests/client/ui`, and `ui` for `tests/client/ui/**/*.spec.{ts,tsx}` under jsdom.

**Install into a private dev profile** (keeps experiment data out of the real `~/.dsh`; details in [implementation notes](docs/implementation-notes.md)):

```sh
WS=/home/matthew/Documents/deepseek-harness/default-workspace
export DSH_HOME="$WS/.dsh-dev"
dsh --profile dev --from-default-profile web --dump-config   # first time only
dsh plugin --profile dev add "$WS/highlight-plugin/dsh-highlights"
dsh --profile dev --no-open --port 3095                      # managed background job
```

**Loop.** The Host half (store, route, config) is loaded at plugin activation: rebuild and restart the `dsh web` process. The browser half is a rebuilt `lib/client.js`; if the serving process runs the client-HMR stat poll it picks the new bundle up, otherwise restart and hard-refresh the GUI. Full reload (`dsh --profile dev`) is always safe.

The built artifacts are `lib/index.js` (Host, with `lib/index.js.map`) and `lib/client.js` (wrapped `window.__ModuleLoader__.load({ id: 'dsh-highlights', factory })` bundle, platform `web`, **minified, with `lib/client.js.map` as an external map** — the inline map used to be ~90 % of the artifact). No declaration output is emitted. `pnpm check:bundle` evaluates the built client bundle in a sandboxed fake module table and asserts the contract: one module registered as `dsh-highlights`, `apply`/`inject`/`name` exports, the main panel and sidebar-row registrations, the message-action and Session-bridge seats (and no Chat-hosted selection surface or Chat gesture claim), the right-Sidebar tab type and body, two locale dictionaries, a plugin-owned stylesheet, the `contextmenu` listener with its More menu and Copy selection action, and the `hello` + `list` calls from the priming refresh.

</details>

<a id="中文"></a>
## 中文

简要说明：从已完成的助手回复里选择文本即可保存「高亮」——五种主题色、自由标签、备注与星标；整条回复可保存为「标记」。高亮在会话正文中就地绘制（CSS Custom Highlight API，不修改 DOM），在右侧面板的 Highlights 标签页和左侧导航的全局 Highlights 页面中浏览，支持跳回原文（尽力而为）以及把引文插入输入框。数据保存在 `~/.dsh/storages/highlights/`，不写入会话日志、不参与导出与遥测，也不对模型可见。删除是墓碑（默认 30 天后、宿主下次启动时清理），不是立即擦除。
