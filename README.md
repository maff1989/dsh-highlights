# dsh-highlights

**A margin for your agent conversations.** Select a passage in an agent reply, keep it with a colour, tags and a note, and return to it later — in place in the transcript, in its session, or across every session.

<!-- TODO(screenshot): hero shot — the right-click selection bar with the annotation editor open.
     Add the file under assets/screenshots/ and uncomment the line below.
![The selection bar and annotation editor](assets/screenshots/selection-bar.png)
-->

> **Status:** 0.1.0 · DeepSeek Harness `>=0.2.2-rc.1 <0.3.0` · Node.js `>=24.9.0` · MIT
> Local-first. Highlights are stored under your `DSH_HOME`, never in the Session log, and never reach a model request unless you opt in.

## Why this exists

Agent conversations are written to be read, and reading produces judgement: this claim needs checking, that direction is right, remember this for later. The transcript is a stream, though — there is nowhere for that judgement to live after the reply is out of sight.

This plugin adds a **margin**: durable notes attached to the text they came from, kept outside the conversation, private by default, and reachable months later. It is not agent memory and not a second transcript.

A few principles shape it:

- **The margin is yours.** Local-first storage, no network egress, no telemetry, no sync.
- **The transcript stays untouched.** Painting never wraps or rewrites the message tree; the plugin adds its own overlay and leaves React's rendering alone.
- **The highlight belongs to the passage, not the moment.** It is anchored to the reply's text and survives re-renders; when the text changes, the item is marked **Unanchored** rather than silently disappearing.
- **The model is a guest.** Agent access is off by default, reads only happen through explicit tool calls, and nothing about your highlights is ever injected into a prompt.

## What it does

- **Highlight text** in an assistant reply with five theme-adaptive colours; add tags, a note, and an intent (Note / Dispute / Direct / Remember).
- **Save a whole reply** as a single mark.
- **Review everything** in place (painted text), in a per-session tab in the right panel, on a global **Highlights** page grouped workspace → session, from a per-turn digest, and from a session-header mini-map.
- **Reuse it**: click painted text to open its card, jump back to the passage, copy the quote, insert it into the current or a new session, or brief the agent on a whole session.
- **Optionally let the agent read** your highlights, or (stricter tier) propose new ones for you to review.

<!-- TODO(screenshot): the painted transcript with an item card open, or the global Highlights page.
![Highlights in the transcript and in the global page](assets/screenshots/highlights-page.png)
-->

## Requirements

- **DeepSeek Harness** `>=0.2.2-rc.1 <0.3.0` with the web GUI.
- **Node.js** `>=24.9.0` and **pnpm 11** on `PATH`.
- A current **Chromium-based browser** is recommended. Text colour uses the CSS Custom Highlight API; the rounded fills and bands still paint without it.

## Install

The package is private and not published to npm — install it from a checkout:

```sh
git clone https://github.com/maff1989/dsh-highlights.git
cd dsh-highlights
pnpm install
pnpm build

dsh plugin --profile web add "$PWD"
```

Restart the process that serves the GUI (for example `dsh web`, or the DSH app); the Host half only opens its store and route at startup. Confirm the row is present with:

```sh
dsh --profile web --dump-config | grep -A3 highlights
```

To remove the plugin, run `dsh plugin --profile web remove dsh-highlights` and restart. Your highlights are not deleted: they stay under `$DSH_HOME/storages/highlights/` and come back if you reinstall.

## Using it

1. Select text in an assistant reply and **right-click**. The bar offers five colour dots (save immediately), **Annotate** (colour, tags, note, intent), and **⋯ More actions**.
2. The assistant action row's **Save to highlights** saves a whole reply as a mark.
3. Click painted text to open its card; the **Highlights** icon in the session header opens the session tab, and **Highlights** in the left nav opens the global page.
4. Use **Show in conversation** to jump back, **Copy quote** / **Insert** to reuse the text, or **Brief the agent** to hand a session to the model.

Two global shortcuts save the current selection (`Ctrl/⌘ + Shift + H`) and open the session tab (`Ctrl/⌘ + Shift + K`).

## Agent access

Agent access is **off by default**: with it off, the Host registers no tools and no skill, and nothing about your highlights can reach a request. Turn it on in **Settings → Highlights**, where you choose both the access level and the read scope.

| Tier | What the agent can do |
|---|---|
| Off | Nothing — no tools, no skill, no prompt content |
| Read only | `list_highlights` (paged, filterable, excerpts only) and `get_highlight` (one item with its note and anchor context) |
| Read and annotate | The read tools plus `highlight_write`, which can propose up to three highlights per call — proposals are never stored automatically |

The read scope defaults to the current session and can be widened to the workspace or all sessions; a call may narrow it but never widen it. Subagents and Team members in the same profile share the tools and the same consent.

> **Preview:** the in-transcript Keep/Dismiss row for proposals is not wired in 0.1.0, so treat the read-and-annotate tier as unfinished.

<!-- TODO(screenshot): Settings → Highlights consent page (access level and read scope).
![Agent access settings](assets/screenshots/agent-access.png)
-->

## Data and privacy

Highlights live in the plugin's own store, not in the Session log and not in the profile config:

```text
<DSH_HOME>/storages/highlights/
├── meta/install.json        # this install's identity
├── records/<uuid>.json      # one document per highlight or mark
└── settings/settings.json   # consent and default colour (written on first change)
```

- **No network egress.** The browser half talks only to the same-origin `/api/highlights` route; nothing is uploaded.
- **Local trust.** Records are ordinary unencrypted JSON under your profile — anyone who can read `$DSH_HOME` can read your quotes, notes, tags, and the session title/workspace snapshots stored with them.
- **Delete is a tombstone.** A deleted item is hidden everywhere but its file is only purged at the next Host start after the retention window (default 30 days).
- **Browser-local data.** The pending-insertion queue (quote text, up to 24 hours), your last colour, and the **Don't ask again** Undo preference live in `localStorage`; clearing site data never touches the Host records.

## Current limitations

- Only text in assistant replies can be marked; reasoning, user messages, tool output, injected context and composer text cannot.
- The stored quote is capped at **2,000 characters**; copy, insert and the agent surface use the capped quote while painting and reveal still cover the full span. Notes are capped at 2,000 characters, tags at 8 × 32 characters.
- Painting is visual only (assistive technology is not told); lists remain usable without it.
- Anchors are best effort. Edited or regenerated replies, folded thinking, paged-out history and archived sessions can leave an item **Unanchored**; re-anchoring has no UI yet.
- Local only: no sync, import or file export (a session's highlights can be copied as Markdown).
- Insertion targets are the current session or a new one; inserting into another existing session is not supported.
- **Preview:** the status, intent, author and per-item visibility fields are in the UI and schema but the Host does not persist them yet, and the agent-proposal review row is not mounted. Colours, tags, notes and stars are persisted.
- Five fixed palette colours; no custom colours.

## Development

```sh
pnpm install
pnpm build
pnpm verify   # typecheck + tests + build + bundle-contract check
```

`lib/` is gitignored, so a fresh checkout must be built before installing. The test suite is split into Node and jsdom projects and runs with `pnpm test`; `pnpm check:bundle` activates the built client bundle in a fake module table. Design and context documentation lives in `docs/`.

## License

MIT. See [LICENSE](LICENSE).
