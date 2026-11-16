> **Status note (2026-11-13).** This report records the state at Phase 5. The Chat-hosted `SelectionAction` it mentions was removed when the plugin took ownership of the `contextmenu` gesture; see issue-log #50–#53 and `review/selection-gestures/REPORT.md` for the current design and its evidence.

# Phase 5 report — selection and placement plane

Status: **core implemented and card surface migrated**; the selection affordance's
detection/placement adoption is deferred to Phase 6 (documented partial).

## Delivered

| WP | Change | Where |
|---|---|---|
| 5.1 | `SelectionState`/`SelectionAction`/`SelectionGesture` contract, one candidate shape, one dismissal-reason vocabulary | `src/client/contracts/selection.ts` |
| 5.2 | Pure reducer with a single dismissal rule (any reason clears candidate+draft) and reveal-time input suppression; app-scoped gesture service over a signal | `src/client/selection/{reducer,gesture}.ts` |
| 5.3 | Shared dirty-driven floating positioner: one owner for bar/card writes, diffed style writes (no unchanged rewrite), optional height, visibility result | `src/client/selection/placement.ts` |
| 5.4 | Focus contract: Tab trap inside a floating surface, Escape routing, focus capture/restore | `src/client/selection/focus.ts` |
| 5.5 | Card migrated: per-frame rAF follow loop replaced by scroll/resize-driven placement through the shared positioner; card traps Tab and restores focus on close. **Follow-up:** the selection bar's per-frame loop was likewise replaced (scroll/resize-driven, shared positioner), the geometry kernel moved from `ui/selectionBounds.ts` into `selection/bounds.ts`, and the **app-scoped reducer is now the affordance's state owner** (the component projects `gesture.state`; the app passes one shared gesture through the bridge) | `ui/SessionBridge.tsx`, `ui/SelectionAffordance.tsx`, `selection/{placement,bounds}.ts`, `selection/gesture.ts`, `index.ts` |

## Tests

- `tests/client/selection/selection.spec.ts` (6): reducer transitions + one dismissal rule + reveal
  suppression; gesture reads quiescence at dispatch time; positioner writes once then skips an unchanged
  placement and writes again when geometry changes; Tab trap wraps and Escape routes; focus restore.
- `tests/client/ui/session-bridge.spec.tsx` (12, reconstructed): the card follow/hide tests now dispatch
  scroll (the surface is dirty-driven, not per-frame); focus-return test still green.
- Full suite: 41 files / 436 tests green at the phase commit.

## Deliberate partials

- **The 250 ms poll is gone (follow-up).** Detection is now two paths: the pointer/keyboard input effect
  (pointerup capture + debounced `selectionchange`) and one surface-admission `MutationObserver` fallback.
  The poll-specific tests were reconstructed around the new contract.
- **`activity.ts` is deleted (follow-up).** Quiescence is owned by `RevealPort` alone: the composition root
  sets `observation.revealPending` from the port's `onPendingChange`, the bridge injects that signal into the
  affordance as a `revealPending` probe, and `reveal.ts` no longer opens a second global counter. Tests drive
  the probe directly. **Still open:** the Chat-owned `SelectionAction` still hands its selection through the
  stash rather than the reducer.
- **The stash remains the capture handoff** for the Chat-owned selection surface; the gesture service is
  instantiated in the composition root but the affordance does not dispatch into it yet. One owner per
  state is therefore achieved for the card and the new command paths, not yet for the bar/editor.
- **No new pointer-detection path removed**: deleting the poll/detection paths depends on UA-6 (a
  multi-consumer selection surface); the fallback remains capability-gated until then.
