# Phase 7 report — upstream adoption and deletion

Status: **not executable; block recorded, no code changes.** This is the planned
conditional tail, not an omitted implementation.

## Why it did not run

The owner's recorded decision was **"defer upstream engagement until after Phase 6"**. Phase 6 is
complete (partially, see its report), so the condition is now met — but the prerequisite is an upstream
capability that does not exist:

- UA-1 (decoration seat inside the message body): not shipped by DSH `0.2.2-rc.1`, no acceptance recorded.
- UA-2 (public `uiConversation.reveal`): not shipped; the plugin still composes
  `openSession` + `loadThrough` + bounded polling.
- UA-6 (multi-consumer selection surface): not shipped; the plugin still owns its affordance.
- UA-5 (published client-bundle preset): not published.
- The keep-alive + measurement fixes are **hot-patched into the installed runtime**, not upstreamed.

Without at least UA-1/2/6 there is nothing to swap the adapters onto, and deleting the compensating
machinery now would regress paint, reveal and selection. Per the plan's fallback (§Phase 7): the plugin keeps
thin adapters behind the ports and the compensation is documented as permanent, bounded cost until upstream
lands.

## What is ready for the switch

| Port | Adapter today | What Phase 7 would replace |
|---|---|---|
| `DecorationPipeline` | css-highlights + overlay adapters over `painter.ts`/`overlay.ts` | one renderer-decoration adapter; delete both paint modules + `::highlight` CSS |
| `RevealPort` | composed `openSession`/`loadThrough`/poll routine | `uiConversation.reveal(target)` adapter; delete poll/timeout composition |
| `SelectionGesture` | plugin affordance detection (legacy paths) | contribution to Chat's selection surface list; delete affordance/placement stack |
| bundle build | bespoke `build.mjs` wrapper | published bundle preset |

The ports are typed and the surface-facing APIs do not change when the adapters are replaced (ADR-023/025).

## Trigger checklist (when upstream ships)

1. Record the DSH release + capability version; add the adapter behind a capability check.
2. Run the parity gates (paint descriptor/box diff, reveal single-flight, selection dismissal matrix) before
   flipping.
3. Delete the compensating module(s) and their tests in the same change; update the import-rule exemptions.
4. Re-run `pnpm verify` + the live reveal/paint ledger; update `docs/upstream-asks.md` statuses.
5. Keep the local keep-alive patch out of the release path; it must be either upstreamed or formally
   unnecessary (see plan G7.2).

## Deletion inventory (still present)

- `src/client/paint/painter.ts`, `src/client/paint/overlay.ts` (adapter internals)
- `src/client/reveal.ts` (composed routine; now behind `RevealPort`)
- `src/client/ui/SelectionAffordance.tsx` detection/placement stack (not yet reducer-driven)
- `src/client/activity.ts` (quiescence counter; used by the affordance)
- `src/client/ui/selectionBounds.ts` (geometry kernel; should fold into `selection/`)
- hand-rolled `scripts/build.mjs` wrapper (UA-5)
