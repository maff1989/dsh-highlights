# Upstream asks

Thirteen harness changes that would let `dsh-highlights` stop using out-of-band
mechanisms and become a fully sanctioned in-tree feature. Each entry states what
the plugin does today, what is missing in the public API, and a concrete API
sketch. The sketches are proposals, not existing declarations; the upstream
maintainers own the final shapes. Cross-references: `DESIGN.md` §10 backlog
item 9 and §9 risks R1/R4, `IMPLEMENTATION.md` §10 item 7.

Signatures below use the harness's existing idioms: `ctx.slots.register(...)`
for UI seats, Cordis service declarations injected through `export const
inject`, and schemastery for `Config`. They assume version `0.2.2-rc.1`.

---

## 1. A decoration seat inside an assistant message body

**What the plugin does today.** DSH exposes no slot inside the rendered body of
an assistant message. The plugin therefore paints `Range`s with the CSS Custom
Highlight API (`CSS.highlights` + `::highlight(dsh-hl-*)`) over the rendered
DOM: no DOM mutation, no React render, no way for assistive technology to learn
about the paint. `Range` objects bind to `Text` nodes, so every transcript
mutation requires a re-resolve + repaint pass (coalesced to one animation
frame).

**Ask.** A renderer decoration hook that receives a rendered markdown block
(text, element, node identity) and returns decorations, so a consumer can ask
the renderer to wrap or style spans as part of rendering rather than after it.
A keyed slot is the natural carrier because the consumer needs no ownership of
the element.

**Sketch.**

```ts
// @deepseek-ai/dsh-client-ui-chat/client
export interface MarkdownDecoration {
  /** Inclusive character range inside `text`. */
  readonly start: number
  readonly end: number
  /** Class name applied by the renderer; the consumer owns the CSS. */
  readonly className: string
}

export interface MarkdownDecorationContext {
  /** Durable occurrence identity, e.g. `13:assistant-step4:2`. */
  readonly nodeKey: string
  /** Which occurrence of the node this block belongs to. */
  readonly groupPart: 'reasoning' | 'response'
  /** The block's plain text in the renderer's own projection. */
  readonly text: string
  /** Offset of `text` inside the source element, for offset mapping. */
  readonly projection: { readonly version: number; readonly base: number }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.chat.markdown.decorate': {
      readonly context: MarkdownDecorationContext
      readonly decorations: readonly MarkdownDecoration[]
    }
  }
}

// Consumer:
ctx.effect(() => ctx.slots.inject('conversation.chat.markdown.decorate', () => ctx.slots.register({
  name: 'conversation.chat.markdown.decorate',
  key: 'highlights',
  inject: () => ({ decorations: () => highlightDecorations() }),
})), 'highlights: decorations')
```

**What it retires.** The painter (`paint/painter.ts`), the `MutationObserver`
repaint loop, `::highlight()` CSS, the `CSS.highlights` capability probe and
its degraded notice, and the browser-support limitation. Anchors would still be
stored the same way; only rendering changes.

**Risk today.** DESIGN R1: rendering is the one place the design is not using a
documented extension seat.

---

## 2. A public reveal/scroll capability

**What the plugin does today.** DSH has no "reveal this message" API. Reveal is
composed from public pieces: `ctx.uiWorkspace.openSession(sessionId)`,
`ctx.layout.selectPanel(null)`, `ctx.sessions.binding(sessionId)?.session.loadThrough(nodeSeq)`
to page history back, a `requestAnimationFrame` poll for
`[data-chat-node-key="<nodeKey>"]` bounded to 2.5 s, `scrollIntoView`, and a
flash. A folded turn or a node that never mounts leaves "session open, item
listed"(DESIGN R4) with no error path.

**Ask.** A single conversation capability that accepts a durable target
(Session + message/node identity), pages history as needed, guarantees the row
is mounted or reports why it cannot be shown, and returns a result a caller can
act on. The flash is presentation and can stay plugin-owned.

**Sketch.**

```ts
// @deepseek-ai/dsh-client-ui-conversation/client
export type RevealOutcome =
  | { readonly status: 'revealed'; readonly element: HTMLElement }
  | { readonly status: 'folded'; readonly ownerKey: string }
  | { readonly status: 'unavailable'; readonly reason: 'archived' | 'missing' | 'not-loaded' }

export interface ConversationReveal {
  /**
   * Select the Session, page history until the target is loaded, and scroll it
   * into view. Resolves when the row is on screen (or with a typed refusal).
   */
  reveal(target: {
    readonly sessionId: SessionId | SubagentAddress
    readonly nodeKey?: string
    readonly messageId?: string
    readonly nodeSeq?: number
    readonly behavior?: 'smooth' | 'instant'
  }): Promise<RevealOutcome>
}

ctx.conversationReveal.reveal({ sessionId, nodeKey, nodeSeq })
```

**What it retires.** `reveal.ts`'s hand-rolled poll/timeout/`loadThrough`
composition and the "reveal may land folded" ambiguity becomes a typed outcome
the UI can explain (for example, "this item is in a collapsed turn — expand
it?").

**Risk today.** DESIGN R4: reveal is best effort and can do nothing visible.

**Follow-up 2026-11-12: the Harness side of the reveal cost is now measured and patched.** Beyond the
missing API, the page → Conversation transition itself re-mounts the transcript and performs two
synchronous layout reads in mount effects (`ui-conversation` `publishWidths` / `updateLimit`). A
verified prototype patch (keep the Conversation mounted across global pages + take widths from
`ResizeObserver` entries) cuts a reveal press's longest long task from ~1 013–1 105 ms to
**392–417 ms** on a 35-turn transcript (headless). See `dsh-core-perf-patch/` in the session workspace
and `TRACKING.md` §7.6. Either half of that patch (the mount-measurement fixes, or keeping the
Conversation mounted) makes the plugin's reveal land without a visible freeze and is worth landing
upstream independently of the public reveal API.

**Measured cost of not having it (2026-11-12).** Because reveal is composed from
`openSession` + `selectPanel` + `loadThrough` + a direct scroll, a reveal from the global
Highlights page unmounts that page and remounts Chat's conversation. With the plugin's own paint
cost fixed (ADR-021, overlay geometry 3.94 s → 0.30 s per press), the remaining per-press cost on a
35-turn transcript is Chat/DSH-bound: ~2.1 s longest task, of which ~2.0 s is `loadThrough` paging
plus conversation remount and React commit (unchanged before/after the plugin fix) and ~0.3 s is the
one overlay layout the browser needs anyway. A real reveal capability implemented by Chat's viewport
(its internal `beginPreserving` → `loadThrough` → `scrollToTurn` → `reading.acceptNavigation`
path) would let Chat land the target without the plugin composing a scroll, keep reading/follow state
coherent, and would make the page→conversation remount a Harness/UI decision rather than a plugin
side effect. Evidence: `review/perf-before-after.md`,
`docs/reveal-performance-investigation.md` §10.

---

## 3. Stable character offsets on the selection interaction

**What the plugin does today.** A `TextInteractionGesture` request carries the
DOM `Selection` (through the interaction dispatch), not text offsets. The
plugin runs its own projection (`src/client/anchor/projection.ts`) synchronously
inside dispatch, in the only moment the browser `Selection` is still valid,
then stores `start`/`end` in that projection plus ±48 characters of context as
a Web Annotation TextQuote/TextPosition pair. The offsets are meaningful only
with the plugin's `projection: 1`; a Chat DOM change silently invalidates them
and degrades resolution to quote matching.

**Ask.** Attach a projection-stable text offset to the interaction request, at
the same moment Chat builds it, so every consumer shares one projection
(numbered by the harness) instead of each re-deriving offsets from the DOM.

**Sketch.**

```ts
// @deepseek-ai/dsh-client-ui-conversation/client
export interface TextInteractionSelection {
  /** Durable occurrence identity, e.g. `13:assistant-step4:2`. */
  readonly nodeKey: string
  /** Which occurrence of the node (reasoning vs response group). */
  readonly groupPart?: 'reasoning' | 'response'
  /** The selected text, verbatim. */
  readonly text: string
  /** Offsets in `projection` (not raw DOM offsets). */
  readonly start: number
  readonly end: number
  /** Version of the text projection the offsets belong to. */
  readonly projection: number
  /** Durable message id, when resolvable. */
  readonly messageId?: string
  /** Session event sequence, when resolvable. */
  readonly nodeSeq?: number
  /** Index of the selection source inside the node, in DOM order. */
  readonly sourceIndex: number
}

export interface TextInteractionRequest {
  // …existing fields…
  readonly selection: TextInteractionSelection
}
```

**What it retires.** `capture.ts`'s synchronous projection and the
`PROJECTION_VERSION` maintenance burden; anchors keep the same shape but the
offsets come from one authoritative producer. A harness projection bump would
also be visible to consumers instead of silently mis-mapping.

**Risk today.** DESIGN R3: anchor resolution fragility is the design's main
medium risk.

---

## 4. A semantic highlight token family

**What the plugin does today.** Five palette slots are derived with
`color-mix()` over existing semantic aliases (`--dsw-alias-state-warn-primary`,
`--dsw-alias-brand-primary`, and so on) plus tokens for a message band and a reveal flash.
The five slots therefore depend on states that are not "highlight" semantics:
a future theme may change what warn/brand mean, and the palette is invented by
the plugin rather than owned by the design system.

**Ask.** A semantic background token family for marked text, so the plugin
names intent and the theme decides colour, contrast, and dark/light mapping.

**Sketch.**

```css
/* @deepseek-ai/dsh-client-ui-theme: theme variables */
:where(html) {
  /* One family for marked text; index 1..5 matches the fixed palette size. */
  --dsw-alias-highlight-1-bg: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
  --dsw-alias-highlight-2-bg: color-mix(in srgb, var(--dsw-alias-state-success-primary) 20%, transparent);
  --dsw-alias-highlight-3-bg: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 22%, transparent);
  --dsw-alias-highlight-4-bg: color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, transparent);
  --dsw-alias-highlight-5-bg: color-mix(in srgb, var(--dsw-alias-state-error-secondary) 18%, transparent);
  --dsw-alias-highlight-message-bg: color-mix(in srgb, var(--dsw-alias-interactive-bg-hover-accent) 60%, transparent);
  --dsw-alias-highlight-flash-bg: color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent);
  /* Text keeps the normal label colour; contrast is owned by the theme. */
  --dsw-alias-highlight-1-fg: var(--dsw-alias-label-primary);
}
```

Consumers map `colorId` to `var(--dsw-alias-highlight-${colorId}-bg)` in one
place, and a future palette change needs no plugin release.

**What it retires.** The plugin's ad-hoc `color-mix()` constants in
`styles.ts` and the theming caveat in DESIGN §6.11 ("fallback when a future
family exists — swap token names in one place").

**Risk today.** Low; the washes are 18–22 % tints over semantic aliases and
keep the label colour.

---

## 5. A published client-bundle preset and wrapper contract

**What the plugin does today.** The repo's `clientBundle()` preset is not
published, and the `window.__ModuleLoader__.load({ id, factory })` contract is
documented for in-tree packages only. An out-of-tree plugin must hand-roll
`scripts/build.mjs`: CJS output, a manual externals list (`react`,
`react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`, `zod`,
`@tanstack/react-virtual`, `@deepseek-ai/dsh-client-*`), a wrapper factory, a
CSS-injection convention, and a `check:bundle` smoke test that re-asserts the
contract because nothing upstream will.

**Ask.** Publish the client-bundle build preset and document the module-loader
contract (id, factory, externals, asset loading, source maps, CSS injection) as
stable public API for third-party bundles.

**Sketch.**

```ts
// package consumers get, in an installable package:
//   import { clientBundle } from '@deepseek-ai/dsh-tsdown-preset'
// tsdown.config.ts
import { defineConfig } from 'tsdown'
import { clientBundle } from '@deepseek-ai/dsh-tsdown-preset'

export default defineConfig({
  entry: { index: 'src/host/index.ts', client: 'src/client/index.ts' },
  preset: [
    clientBundle({
      /** Bundle id the module loader registers under; equals package name. */
      id: 'dsh-highlights',
      /** Entry that exports { apply, inject, name }. */
      entry: 'src/client/index.ts',
      /** Assets resolved through `require.asset`; CSS is injected by convention. */
      assets: { injectCss: 'data-plugin-css' },
    }),
  ],
})
```

Published documentation should state, at minimum:

- the wrapper body (`window.__ModuleLoader__.load({ id, factory })`) and who
  calls `factory(require)`;
- which modules must stay external and how a mismatched external fails;
- how CSS reaches the document (inline `?inline`, class maps, the plugin-owned
  `<style data-plugin-css>` element) and whose effect removes it;
- the lazy-`require` rule (no relative requires at bundle top level);
- the source-map and asset conventions.

**What it retires.** `scripts/build.mjs`'s wrapper/assertions as bespoke code
(the assertions survive as a thin test), and the "one undocumented artifact
contract" risk in DESIGN §3.1 / R2. The package would keep its own
`check:bundle` only to prove version compatibility.

**Risk today.** DESIGN R2: the client bundle artifact contract is undocumented
for third parties, which is the highest remaining build risk.

---

## Related, deliberately not asked

- **A generic Connection RPC channel usable by out-of-tree plugins.** The
  channel registry installs its own physical route through the registering
  fiber's `webServer`, which a plugin cannot satisfy; the documented
  alternative (an exact Fetch route with the owner-Peer fence) works and needs
  no change. Recorded as deviation D-1 in `docs/implementation-notes.md`.
- **A forwarded `highlights/changed` event.** In-tree packages get change
  forwarding; out-of-tree plugins use pull-based freshness (focus,
  `connection/reset`, own writes). This is documented as a limitation, not
  proposed as an API sketch here because the event surface belongs to the
  owning feature, not the platform.

## 6. A multi-consumer (or per-consumer) selection surface

`ctx.uiConversation.interactions.register()` gives each plugin a handler, but `dispatch()`
returns the first handler that calls `open()`, and every handler renders into the same keyed
`conversation.chat.text-interaction` cell. One shipped plugin (Quote) therefore occupies the
surface for everyone, and a second consumer must draw its own floating UI outside Chat's
positioning, dismissal, and scroll handling.

Sketch: make the surface a **list** of contributions (or key the cell per plugin and render a
small action row), with Chat owning placement and dismissal for all of them. That would let
Quote and Highlights share one toolbar, which is what a reader expects.

A shared surface also needs a selection anchor — see [ask #13](#13-a-selection-anchor-for-the-text-interaction-surface)
below; until it lands the plugin owns the gesture with its own right-click listener and native-menu escape hatches.

---

## 7. A structured reference appearance for plugin references

**Workaround it retires:** [W10](workaround-ledger.md).

**What the plugin does today.** "Ask the agent" / "Brief the agent" must carry the anchored passage and its
record identity through the message as *text*: the quote, plus an attribution line, plus a marker naming the
record id. `uiConversation`'s `insertReference` exists, but `ReferenceInsert.appearance` is a closed union
(`'session' | 'file' | 'folder'`), so a highlight cannot be a first-class chip.

**Ask.** Extend the appearance contract so a plugin-owned reference kind can be inserted, resolved back by the
owning source on submit, and rendered as a chip in the draft.

**Sketch.**

```ts
// @deepseek-ai/dsh-client-ui-conversation/client
export type ReferenceAppearance = 'session' | 'file' | 'folder' | (string & {})

export interface ReferenceInsert {
  readonly source: string          // owning provider id
  readonly ref: string             // opaque provider payload, e.g. a highlight id
  readonly label: string
  readonly appearance?: ReferenceAppearance
  readonly clipboardText: string
  /** New: an icon from the shared set, so a plugin reference is legible. */
  readonly icon?: ComponentType<IconProps>
}
```

The consuming surface already routes by `source`; the only missing piece is an open appearance/icon channel and
a documented submit path for provider-owned payloads.

**What it retires.** The text marker and the attribution formatting in the briefing packet; the model receives
a resolved reference instead of formatted prose.

---

## 8. A rendering hook for citations and attributions

**Workaround it retires:** [W11](workaround-ledger.md).

**What the plugin does today.** When the agent cites annotated passages, the citation can only be rendered inside
the tool result card: assistant Markdown is rendered by the owning surface, and a plugin cannot hook a node,
a span, or a link scheme.

**Ask.** A per-message or per-block render hook (the `MarkdownDelegate` shape already exists internally for
owners) exposed to client plugins, so a reference syntax such as `hl:<id>` can render as a chip with hover
preview and jump-to-source.

**Sketch.**

```ts
ctx.slots.register({
  name: 'conversation.chat.markdown.inline',
  key: 'highlights-reference',
  inject: () => ({ render: (token: string) => HighlightChip | null }),
}, InlineChipRenderer)
```

**What it retires.** Card-only citations; the answer's provenance lives in the answer.

---

## 9. Agent-scoped tool registration

**Workaround it retires:** [W12](workaround-ledger.md).

**What the plugin does today.** `ctx.tools.register()` is global to the composition: every agent, every
subagent and every Team member sees the highlight tools, so scope is enforced inside each `execute` instead.
That is enforcement, not consent — the model still sees a tool it may not use.

**Ask.** A registration option that scopes a tool to an agent (or a predicate over agents), so the tool set a
model sees matches what the user consented to.

**Sketch.**

```ts
ctx.tools.register(definition, {
  when: (ctx) => settings.agentAccess !== 'off',
  /** New: this registration applies to these agents only. */
  agents: (agent) => agent.kind === 'main',
})
```

**What it retires.** Handler-side scope checks and the settings copy that has to explain subagent visibility.

---

## 10. Out-of-tree Session event types

**Workaround it retires:** [W13](workaround-ledger.md).

**What the plugin does today.** All state lives in the plugin's storage domain because `KNOWN_SESSION_EVENT_TYPES`
is generated in-repo: the persistence read path refuses to reconstruct a log containing an unrecognised event
type without `ignorable: true`, `Session.append()` cannot set that marker, and the `plugin:` escape hatch is gated
to `packages/experimental/`.

**Ask.** A sanctioned namespace (or an `ignorable` declaration an out-of-tree package can ship) so a plugin can
append replayable state to the log.

**What it retires.** Nothing functional — this is about replay, export and session bundles. It is recorded so the
workaround is explicit rather than accidental.

---

## 11. UI-writable plugin configuration

**Workaround it retires:** [W9](workaround-ledger.md).

**What the plugin does today.** Security-relevant settings that the Host must read (agent access, scope) cannot be
written from the client unless a supported config-write path exists; the fallback is to keep them in the plugin's
own storage domain behind its own route. Client-only preferences go to `localStorage`.

**Ask.** Either (a) a documented service a plugin can use to read **and write** its own row configuration from its
settings page, or (b) an official statement that config is deployment-only for out-of-tree bundles, so plugins do
not each invent a shadow config store.

**What it retires.** The settings record and its two endpoints; the flags move into the Schemastery `Config` that
`dsh plugin` already manages.

---

## 12. Publishable client contracts for out-of-tree bundles

**Workaround it retires:** [W15](workaround-ledger.md).

**What the plugin does today.** Two services/slot families are mounted by the shipped composition but their
TypeScript declarations are not reachable from an out-of-tree bundle, because the packages are not
dependencies (and adding each one just to read a type is a heavy cost for a plugin that must stay
version-tolerant):

- the client shortcut service (`@deepseek-ai/dsh-client-shortcuts`) — the plugin restates the subset it uses
  in `src/client/contracts/shortcuts.ts`;
- the Settings seats (`settings.section`, `settings.general.item`) — the plugin restates their `SlotMap`
  entries in `src/client/ui/settings/slot-contracts.ts`;
- the transcript tool view (`tool.call.toolview`) — restated in `src/client/ui/tools/slot-contracts.ts`;
- the Web context-menu service and its `session`/`tab` target shapes — restated in
  `src/client/ui/menus/contracts.ts`.

**Ask.** Either publish a slot/service contract package that out-of-tree bundles can depend on without pulling
a full feature package, or re-export the slot maps from `dsh-client-ui-slots` (which the plugin already
depends on) so a plugin declares nothing locally.

**What it retires.** Both local contract files and their declaration merging; the plugin imports the real
types and breaks loudly when a platform contract changes instead of silently drifting from a restated copy.

---

## 13. A selection anchor for the text-interaction surface

**Workaround it retires:** [W1](workaround-ledger.md) — the plugin-owned `contextmenu` listener, its duplicate
of Chat's admission rules, and the pointer anchoring. The native-menu escape hatches remain (they are the only
way back to the browser menu) unless the platform also exposes a native-menu passthrough.

**What the plugin does today.** The plugin owns the `contextmenu` text gesture itself — a capture-phase
document listener, its own copy of Chat's admission rules (`data-text-interaction-source`,
`data-conversation-session`, point-inside-rects) and its own selection-anchored bar — because Chat anchors
every `contextmenu` surface at the pointer: `place()` builds a 1×1 anchor box from `point`, sets
`x = anchor.left`, prefers "below", and clamps into the visible bounds. The gesture contract exposes
`trigger`, `hasSelection`, `readText`, `preventDefault`, `sessionId` and `open()`, but no way to ask for
selection anchoring, and `hasSelection` carries no geometry; the same request that says "there is a
selection here" anchors the surface at the cursor. The escape hatches that keep the browser menu reachable
(⇧ + right-click, the keyboard context menu key, **⋯ → Browser menu**) exist because suppressing the native
menu over the plugin's own bar leaves no other route to the browser's menu. A Chat change to the source
markers silently disables right-click with no type error.

**Ask.** An anchor preference on the gesture/`open()` contract, honoured by `place()`: `point` (today's
behaviour, the default) or `selection` (the live selection's rects, reusing the `point === null` placement
branch — below when it fits, above otherwise, clamped). Keep the existing consumer-agnostic dismissal and
scroll handling. Until it lands the plugin keeps owning the `contextmenu` gesture.

**Sketch.**

```ts
// @deepseek-ai/dsh-client-ui-conversation/client
export type TextSurfaceAnchor = 'point' | 'selection'

export interface TextInteractionRequest extends TextInteractionGesture {
  readonly sessionId: SessionId
  /** Open this plugin's surface; `anchor` defaults to 'point'. */
  readonly open: (options?: { readonly anchor?: TextSurfaceAnchor }) => void
}
```

Thread the preference through `dispatch()` (return `{ id, anchor }` instead of a bare id) into the Chat
target, and make `place()` treat `point === null || anchor === 'selection'` as the selection-rects branch.

**What it retires.** The plugin's own `contextmenu` listener, its duplicate copy of Chat's admission rules,
and the pointer anchoring. The native-menu escape hatches remain: a page still cannot open the browser's own
menu, so ⇧ + right-click, the keyboard context menu key and **⋯ → Browser menu** stay the only way back.
Combined with ask #6, Quote and Highlights share one surface with Chat-owned placement for both gestures.
