# Workaround ledger

Every mechanism in this plugin that exists **because the harness does not yet expose a capability** is recorded
here. A workaround is temporary by construction: each row names the upstream ask that retires it and the exact
deletion step, so the day the platform catches up we delete code instead of rediscovering it.

**Policy**

1. The code carries `// workaround: W<n>` at every site.
2. A new workaround cannot merge without a row here.
3. When the ask lands: delete the code, retire the row (move it to §Retired with the version and commit), and
   re-run `pnpm verify`.
4. The ask itself lives in [`upstream-asks.md`](upstream-asks.md); the number here matches that document.

**Status:** `live` = shipped today · `planned` = agreed in the implementation plan, not yet written ·
`conditional` = depends on spike G5's outcome.

| # | Status | Workaround | Where | Incapability | Ask | Exit condition | Removal |
|---|---|---|---|---|---|---|---|
| **W1** | live | The plugin claims no Chat text-interaction gesture: it renders its own floating bar and owns the **contextmenu** gesture with its own capture-phase document listener, because the selection surface is a single-occupant keyed cell and Quote registers first | `src/client/ui/SelectionAffordance.tsx`, `src/client/selection/context-menu.ts` | `uiConversation.interactions.dispatch` returns on the first opener; Chat renders one keyed cell | [#6](upstream-asks.md) multi-consumer selection surface · [#13](upstream-asks.md) selection anchor | The shipped selection surface exposes an additive child slot (or renders one cell per opener) and honours a selection anchor | Delete the plugin-owned contextmenu listener and the standalone affordance when upstream asks #6/#13 land; register the plugin's verbs into Chat's surface; delete the defer machinery (W2 retires with it) |
| **W2** | live | The plugin's bar stands down while Chat's own surface is open, keyed on the platform marker `[data-text-interaction-surface][aria-hidden="false"]`; a pointer selection never opens the plugin bar at all, and the contextmenu claim returns early while Chat's surface is open (no two-bar flash) | `src/client/ui/SelectionAffordance.tsx` (observer, early claim guard, render gate) | Same as W1 — no API says "another surface is open"; the marker is an incidental DOM attribute, not a contract | [#6](upstream-asks.md) | A child slot on the shipped surface (ask #6) makes the question moot | Retires **with** W1: delete the observer and the early guard; the platform owns placement and dismissal |
| **W3** | live | The plugin maintains its own text projection (`projection: 1`) and computes offsets synchronously inside the gesture, because the interaction request carries a DOM `Selection`, not offsets | `src/client/anchor/projection.ts`, `capture.ts`, `src/shared/position.ts` | No projection-stable offset on the interaction request | [#3](upstream-asks.md) stable offsets | Offsets and projection version arrive on the request | Delete `projection.ts` and `PROJECTION_VERSION`; map harness offsets into anchor records; keep the TextQuoteSelector for drift |
| **W4** | live | Painting is a plugin overlay plus `::highlight()` over rendered DOM; React's tree is untouched and assistive tech is not told | `src/client/paint/**`, `src/client/styles.ts` | No decoration seat inside a rendered assistant body | [#1](upstream-asks.md) markdown decoration | A renderer decoration hook exists | Delete the painter, the `MutationObserver` repaint path, the `CSS.highlights` probe and the degraded-paint notice; keep anchors |
| **W5** | live | The five palette slots are `color-mix()` over unrelated state aliases (there is no highlight semantics in the theme) | `src/client/styles.ts` | No semantic token family for marked text | [#4](upstream-asks.md) highlight token family | `--dsw-alias-highlight-*` family ships | Swap the token names in one place; delete the local mixes and this row |
| **W6** | live | Reveal is composed by hand: `openSession` + `selectPanel` + `loadThrough` + a bounded `requestAnimationFrame` poll for the node, then `scrollIntoView` | `src/client/reveal/**` | No "reveal this message" capability | [#2](upstream-asks.md) conversation reveal | A typed reveal returns revealed/folded/unavailable | Delete the poll and the folded-turn fallbacks; map the typed outcome to UI copy |
| **W7** | live | Freshness is pull-based (window focus, `connection/reset`, own writes, optional poll); no change event reaches an out-of-tree bundle | `src/client/index.ts` (freshness effects), `src/client/data/client.ts` | No forwarded `highlights/changed` for out-of-tree plugins | *(deliberately not asked — see upstream-asks.md)* | A sanctioned change-forwarding channel exists | Delete the focus/reset listeners and the optional poll; subscribe to the event |
| **W8** | planned | After the agent writes an annotation, the client notices the tool-call node in the transcript (`MutationObserver` over the conversation root) and issues one refresh | `src/client/observation/service.ts`, write-tool integration | Same as W7 | *(same as W7)* | Same as W7 | Delete the observation trigger; take the change event |
| **W9** | live | Security-relevant settings (agent access, scope, default colour) live in the plugin's own storage domain and are written through `getSettings`/`setSettings` on the existing route, validated Host-side with CAS | `src/host/store.ts`, `src/host/route.ts`, `src/shared/protocol.ts`, `src/client/ui/settings/**` | A `.volatile()` config **is** writable from the UI on this runtime, but it persists into the deployment profile patch — it is deployment-scoped, can be refused or overridden by a home/CLI layer, cannot enforce the `scope ⊆ access` coupling, and is not a per-install consent record | [#11](upstream-asks.md) writable plugin config | A plugin-owned, Host-readable config record with its own validation and lifecycle exists | Move the flags into that config record; delete the settings table, the two endpoints and the client mirror |
| **W10** | live | "Brief the agent" carries structured context as one message packet (per item: quote + **record id** + state), because there is no highlight reference chip. The id is what keeps it honest: the agent can resolve each item with `get_highlight` | `src/client/data/actions-impl.ts` (`briefSession`), panel header and page session-group controls | `ReferenceInsert.appearance` is a closed union (`session`/`file`/`folder`) | [#7](upstream-asks.md) structured reference appearance | An `appearance` for plugin references exists | Replace the packet with real reference tokens (one chip per item); delete the packet text builder and the id marker |
| **W11** | planned | Citations are rendered inside the agent's tool card rather than in its prose | `src/client/ui/tools/**` (planned) | Markdown rendering is owner-supplied; no citation/attribution hook | [#8](upstream-asks.md) citation rendering hook | A per-message or per-block render hook exists | Render the cited ranges inline in the reply and retire the card-only presentation |
| **W12** | live | Tools are registered globally, so subagents and Team members see them too; the effective scope is enforced inside each tool body from the calling agent, intersected with the stored consent scope (a request may only narrow it) and refusing when identity is unavailable | `src/host/tools.ts` (`// workaround: W12`) | No per-agent tool registration | [#9](upstream-asks.md) agent-scoped tools | `register(def, { agents })` or `agent.ctx` works cleanly | Delete the handler-side scope check and the settings caveat |
| **W13** | planned | Plugin state never enters the Session log; it lives only in the storage domain | `src/host/**`, all records | Out-of-tree session event types cannot be reconstructed by the read path | [#10](upstream-asks.md) plugin event types | A sanctioned `plugin:` event namespace or out-of-tree `ignorable` declarations | Optional: project summaries into the log for replay/export; no functional gain otherwise |
| **W14** | live | The client bundle wrapper (`window.__ModuleLoader__.load`), the externals list and `check:bundle` are hand-rolled | `scripts/build.mjs`, `scripts/check-bundle.mjs` | No published third-party client-bundle preset or contract | [#5](upstream-asks.md) bundle preset | A published preset + documented loader contract | Replace the build script with the preset; keep the contract test as a thin compatibility check |
| **W15** | live | Client contracts are restated locally instead of imported: the shortcut service (`contracts/shortcuts.ts`), the two Settings slots (`ui/settings/slot-contracts.ts`), the `tool.call.toolview` slot (`ui/tools/slot-contracts.ts`), and the Web context-menu service plus its `session`/`tab` target shapes (`ui/menus/contracts.ts`) | `src/client/contracts/shortcuts.ts`, `src/client/ui/settings/slot-contracts.ts`, `src/client/ui/tools/slot-contracts.ts`, `src/client/ui/menus/contracts.ts` | `@deepseek-ai/dsh-client-shortcuts`, `dsh-client-ui-settings`, `dsh-client-ui-tool` and `dsh-client-ui-context-menu` are mounted at runtime but are not dependencies of this package, so their declarations are not in this program | [#12](upstream-asks.md) publishable client contracts | Those packages (or a shared slot-contract package) are installable by an out-of-tree bundle | Delete the files, import the real types, drop the local declaration merging |
| **W16** | live | The Host's tool and skill services are restated as local structural contracts instead of imported: `ToolDefinition`/`ToolOutputDefinition`/`ToolRunContext`/`ToolsService.register` and `SkillRegistration`/`SkillService.register` | `src/host/contracts/tools.ts`, `src/host/contracts/skill.ts`, `src/host/tools.ts`, `src/host/skill.ts` | `@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-skill` are mounted in the runtime but are not dependencies of this package, so their declarations are not in this program | [#12](upstream-asks.md) publishable client contracts | Those packages (or their public service contracts) are installable by an out-of-tree plugin | Delete both contract files, import the real types, drop the local declaration merging |

## How to tell an ask has landed

The checkout at `.dsh-src/repo` tracks upstream `master`. When it moves past the release this plugin targets:

```sh
# W1/#6 — does the selection surface accept additive children?
grep -rn "text-interaction" .dsh-src/repo/packages/client/ui-chat/src/client/contract/slots.ts
# W1/#13 — does the gesture accept a selection anchor?
grep -rn "anchor" .dsh-src/repo/packages/client/ui-conversation/src/client/contract/text-interaction.ts
# W4/#1 — decoration seat?
grep -rn "markdown.decorate\|MarkdownDecoration" .dsh-src/repo/packages/client
# W5/#4 — semantic highlight tokens?
grep -rn "alias-highlight" .dsh-src/repo/packages/client/ui-theme/src/styles
# W12/#9 — per-agent tool registration?
grep -rn "agents\?:" .dsh-src/repo/packages/core/tools/src/index.ts
```

A landed ask is a code-deletion task, not a feature: delete the site, delete the row here, `pnpm verify`.

## Retired

*(none yet)*
