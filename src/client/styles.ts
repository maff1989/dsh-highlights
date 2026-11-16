/**
 * Every stylesheet the plugin injects, as plain strings.
 *
 * Feature CSS in this product may not carry literal colours, so the palette is
 * built with `color-mix()` over existing `--dsw-alias-*` semantic tokens, which
 * flip with the theme. Stylesheet delivery is a single `<style
 * data-plugin-css="dsh-highlights">` element owned by a Cordis effect, so it
 * leaves with the plugin.
 */

/** Global sheet: the highlight palettes and their `::highlight()` rules. */
export const GLOBAL_STYLES = `
/*
 * The theme projects its alias tokens as INLINE variables on <body>, not on
 * :root, so a palette declared on html would reference missing variables and
 * compute to nothing (transparent swatches, uncoloured highlights). Declaring
 * on both, with an alias fallback, keeps the palette resolvable wherever the
 * theme happens to publish its tokens.
 *
 * All five slots use the same 24% mix over their semantic token: a shared alpha
 * keeps the palette perceptually consistent instead of making some colours look
 * heavier than others purely because of a per-slot percentage.
 *
 * Slot names and their semantic tokens (each alias resolves per theme):
 *   1 amber  --dsw-alias-state-warn-primary      (amber-500 both themes)
 *   2 green  --dsw-alias-state-success-primary   (green-500 both themes)
 *   3 violet --dsw-alias-state-done-primary      (violet-600 light / violet-400 dark)
 *   4 blue   --dsw-alias-state-business-primary  (deepseek-500 light / deepseek-400 dark)
 *   5 red    --dsw-alias-state-error-secondary   (red-400 both themes)
 *
 * Slot 3 used --dsw-alias-brand-primary (near-black in light, near-white in
 * dark), which made one of five colours monochrome. state-done-primary is the
 * theme's violet and keeps slot 3's hue in both themes, next to the blue slot.
 */
:where(html), :where(body) {
  --dsh-hl-1: color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-brand-primary)) 24%, transparent);
  --dsh-hl-2: color-mix(in srgb, var(--dsw-alias-state-success-primary, var(--dsw-alias-brand-primary)) 24%, transparent);
  --dsh-hl-3: color-mix(in srgb, var(--dsw-alias-state-done-primary, var(--dsw-alias-brand-primary)) 24%, transparent);
  --dsh-hl-4: color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)) 24%, transparent);
  --dsh-hl-5: color-mix(in srgb, var(--dsw-alias-state-error-secondary, var(--dsw-alias-brand-primary)) 24%, transparent);
}
/*
 * Text highlights get their visible fill from .dshhl-highlight-box (a
 * pointer-events-none overlay): CSS custom-highlight pseudo-elements cannot
 * carry border-radius or padding, and those are what make the wash read as a
 * soft marker rather than a hard text selection. The highlight pseudo remains
 * for text colour (and is the fallback when the overlay cannot measure yet).
 */
::highlight(dsh-hl-1) { color: var(--dsw-alias-label-primary); }
::highlight(dsh-hl-2) { color: var(--dsw-alias-label-primary); }
::highlight(dsh-hl-3) { color: var(--dsw-alias-label-primary); }
::highlight(dsh-hl-4) { color: var(--dsw-alias-label-primary); }
::highlight(dsh-hl-5) { color: var(--dsw-alias-label-primary); }
/*
 * Agent-authored items (schema v2 author: 'agent') paint under their own
 * registry names -- dsh-hl-agent-1 … dsh-hl-agent-5 -- so the same palette wash
 * can carry a provenance mark: CSS Pseudo-Elements 4 allows text-decoration on
 * ::highlight(), which makes the marker part of the highlight itself rather
 * than a second overlay pass. The underline is the theme's tertiary label: a
 * neutral that flips with the theme and stays legible under every wash (a
 * palette-coloured underline loses contrast on the amber/red slots in light).
 * User paint above is unchanged and carries no decoration.
 * Fallback: if an engine ignores text-decoration here, the overlay's filled
 * wash and the text colour above still paint, so an agent item never becomes
 * invisible — it only loses the underline.
 */
::highlight(dsh-hl-agent-1) { color: var(--dsw-alias-label-primary); text-decoration: underline dotted var(--dsw-alias-label-tertiary); }
::highlight(dsh-hl-agent-2) { color: var(--dsw-alias-label-primary); text-decoration: underline dotted var(--dsw-alias-label-tertiary); }
::highlight(dsh-hl-agent-3) { color: var(--dsw-alias-label-primary); text-decoration: underline dotted var(--dsw-alias-label-tertiary); }
::highlight(dsh-hl-agent-4) { color: var(--dsw-alias-label-primary); text-decoration: underline dotted var(--dsw-alias-label-tertiary); }
::highlight(dsh-hl-agent-5) { color: var(--dsw-alias-label-primary); text-decoration: underline dotted var(--dsw-alias-label-tertiary); }
/*
 * Whole-message marks are NOT a character wash: the overlay draws one rounded
 * band behind the reply (.dshhl-message-band), so a marked message reads as
 * bookmarked instead of "all of this text is selected". No character-level
 * highlight entry is registered for them.
 */

/*
 * Rounded, padded text-highlight fills. Geometry is recomputed by
 * paint/overlay.ts on transcript mutation, element resize (including the
 * right-panel expanding/collapsing the conversation pane) and viewport resize;
 * the layer is clipped to the transcript viewport and never receives pointer
 * events. Writing identical styles is skipped, so a repaint only touches boxes
 * whose geometry actually changed.
 */
.dshhl-highlight-host {
  position: relative;
  width: 0;
  height: 0;
  pointer-events: none;
  /* Below the sticky composer (9) and transcript chrome (6–8); above the text. */
  z-index: 1;
}
.dshhl-highlight-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.dshhl-highlight-box {
  position: absolute;
  border-radius: 4px;
  pointer-events: none;
  /* Text markers sit above the whole-message band they may overlap. */
  z-index: 1;
}
/*
 * A whole-message mark: one rounded block behind the reply text, tinted with the
 * record's colour at a low mix (no rail/outline — the block alone distinguishes
 * a marked reply from a character highlight). The --dshhl-band-color custom
 * property is set per record by the overlay.
 */
.dshhl-message-band {
  position: absolute;
  z-index: 0;
  border-radius: 6px;
  background: color-mix(in srgb, var(--dshhl-band-color, var(--dsw-alias-bg-document-selection)) 55%, transparent);
  pointer-events: none;
}
/*
 * An agent-authored whole-message mark keeps the same wash and gains a dashed
 * outline: provenance is a mark, not a different fill. The attribute is written
 * only for the agent variant, so user paint is byte-identical.
 */
.dshhl-message-band[data-dshhl-author='agent'] {
  outline: 1px dashed var(--dsw-alias-label-tertiary);
  outline-offset: 1px;
}

`

/** Component sheet: the page, the panel, the editor and the card. */
export const COMPONENT_STYLES = `
/*
 * Entry-page frame. Mirrors the product's own entry pages (Plugins, Automation
 * tasks): full-height page ground, one scroll viewport, and a centered 960px
 * content column with responsive inline insets and a 48px bottom inset. The
 * 28px top inset belongs to the header row so the page starts at the window's
 * top edge like the native pages.
 */
.dshhl-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size, 14px);
  line-height: 1.6;
}
.dshhl-page__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.dshhl-page__content {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 clamp(24px, 4vw, 48px) 48px;
}
.dshhl-page__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 28px 0 18px;
}
.dshhl-page__titleRow { display: flex; align-items: baseline; gap: 10px; }
.dshhl-page__title { margin: 0; font-size: 20px; font-weight: 500; line-height: 28px; }
.dshhl-page__count { color: var(--dsw-alias-label-tertiary); font-size: 13px; }
.dshhl-page__subtitle { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 13px; }
.dshhl-page__filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.dshhl-page__body { display: flex; flex-direction: column; gap: 24px; padding-top: 8px; }
.dshhl-group { display: flex; flex-direction: column; gap: 2px; }
.dshhl-group__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.dshhl-group__meta { color: var(--dsw-alias-label-tertiary); font-weight: 400; font-size: 12px; }
/* Native list row: a transparent hover surface flush with the page column,
   ../../shared by the Automation-tasks and Plugins list rows (8px inset, R12
   standard-control radius, 2px list gap). The colour bar is the one
   highlight-specific mark. */
.dshhl-row {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  border: 0;
  cursor: pointer;
}
@media (hover: hover) {
  .dshhl-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
}
.dshhl-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); }
.dshhl-row__bar { width: 3px; border-radius: 2px; flex: none; align-self: stretch; background: var(--dsh-hl-3); }
.dshhl-row__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshhl-row__quote {
  margin: 0;
  font-size: 13px;
  line-height: 23px;
  color: var(--dsw-alias-label-primary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}
.dshhl-row__note {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 21px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}
.dshhl-row__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.dshhl-row__actions { display: flex; align-items: flex-start; gap: 2px; flex: none; }
/*
 * Generic controls are the product primitives (Button, Input, Pill, Tag, Menu);
 * only layout glue lives here. An icon-only Button keeps the product's compact
 * 28px action geometry (the same box the native row tools use).
 */
.dshhl-icon-button {
  width: 28px;
  height: 28px;
  padding: 0;
}
.dshhl-icon-button svg { width: 15px; height: 15px; }
/*
 * Session-header mini-map (T4.4): a bounded rail of annotation marks, ordered by
 * transcript position. Width and mark size are mirrored by SessionMiniMap.tsx
 * (RAIL_WIDTH_PX / MARK_WIDTH_PX); the component derives each mark's offset from
 * the record plan alone, so this surface performs no layout reads. Dots carry
 * the same palette variable as the painted wash (--dsh-hl-<slot>) and never a
 * literal colour.
 */
.dshhl-minimap {
  position: relative;
  display: block;
  flex: none;
  width: 120px;
  height: 20px;
}
.dshhl-minimap__mark {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  background: transparent;
  cursor: pointer;
}
.dshhl-minimap__mark:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 0;
}
.dshhl-minimap__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  corner-shape: round;
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l3);
}
@media (hover: hover) {
  .dshhl-minimap__mark:hover .dshhl-minimap__dot {
    box-shadow: 0 0 0 1.5px var(--dsw-alias-label-secondary);
  }
}
/* The aggregate tail sits in the final slot, right-aligned so the rail keeps its
   bounds; its accessible name carries the count and it opens the panel. */
.dshhl-minimap__mark--more { transform: translate(-100%, -50%); }
.dshhl-minimap__moreLabel {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1;
}
/* Editor tag chips pair a read-only product Tag with a compact remove control. */
.dshhl-tagChip { display: inline-flex; align-items: center; gap: 2px; }
.dshhl-tagRemove {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  corner-shape: round;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
@media (hover: hover) {
  .dshhl-tagRemove:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
}
/* Multiline note field: there is no textarea primitive, so it keeps the input
   atom's hairline box and focus treatment. */
.dshhl-note-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 56px;
  padding: 6px 8px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}
.dshhl-note-input:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary); }
/* Tag input: the primitive Input owns its box; this only lets it flex in a row. */
.dshhl-tag-input { flex: 1; min-width: 96px; }
/* Native select kept for the workspace facet; sized to the Input atom. */
.dshhl-select {
  box-sizing: border-box;
  height: 32px;
  max-width: 240px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
}
.dshhl-select:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary); }
/*
 * S6 renders inside Chat's icon-action row (MessageIconActions), which lays
 * buttons out at 28px square (scaled by the content font delta), 6px padding,
 * a 17px icon, no border, tertiary label colour, and a hover wash. The plugin's
 * own toolbar buttons are bordered pills, so they read as out of place there;
 * this class mirrors the product row's geometry and states.
 */
.dshhl-message-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(28px + var(--dsh-content-font-delta, 0px));
  height: calc(28px + var(--dsh-content-font-delta, 0px));
  padding: 6px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dshhl-message-action svg {
  width: calc(17px + var(--dsh-content-font-delta, 0px));
  height: calc(17px + var(--dsh-content-font-delta, 0px));
}
@media (hover: hover) {
  .dshhl-message-action:hover {
    background: var(--dsw-alias-interactive-bg-hover);
    color: var(--dsw-alias-label-secondary);
  }
}
.dshhl-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; text-align: center; color: var(--dsw-alias-label-secondary); }
.dshhl-empty__title { margin: 0; font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dshhl-empty__body { margin: 0; max-width: 420px; font-size: 13px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); }
.dshhl-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.dshhl-swatches { display: inline-flex; align-items: center; gap: 6px; }
.dshhl-swatch {
  background-color: var(--dsw-alias-bg-document-selection);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  corner-shape: round;
  border: 0.5px solid var(--dsw-alias-border-l3);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-layer-1);
  cursor: pointer;
  padding: 0;
}
/* Movement is decoration: no transition and no hover scale when the reader
   asked for reduced motion. */
@media (prefers-reduced-motion: no-preference) {
  .dshhl-swatch { transition: transform var(--ds-transition-duration-fast) var(--ds-ease-in-out); }
}
@media (prefers-reduced-motion: no-preference) and (hover: hover) {
  .dshhl-swatch:hover { transform: scale(1.15); }
}
.dshhl-swatch--selected { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
/* The bar's More menu: wide enough for the shortcut hint row without wrapping. */
.dshhl-affordance__menuList { min-width: 232px; }
/* Portal root for the floating bar. It must generate a box: a fixed-position
 * element with display:contents has no box, so it would join normal flow at the
 * end of <body> and grow the page while a selection is being made. */
.dshhl-affordance { display: block; }
/* Floating action bar: one H36 capsule, dots then one primary action.
 * Material follows the theme's elevated-surface rule: border 0 with an
 * --dsw-elevation-* shadow whose first layer is the hairline stroke (never a
 * --dsw-alias-border-* border plus lv2 shadow). The pill is a deliberate
 * full-round shape, so it pairs corner-shape: round with the 999px radius. */
.dshhl-surface {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 6px 0 10px;
  border: 0;
  border-radius: 999px;
  corner-shape: round;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}
/* Item card: calm single-column card; actions collapse behind More.
 * R20 independent-content-card radius, elevation-panel material, 13px base. */
.dshhl-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(272px, calc(100vw - 24px));
  padding: 10px;
  border: 0;
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-panel);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.45;
}
.dshhl-card__header { display: flex; align-items: center; gap: 8px; }
.dshhl-card__addnote { align-self: flex-start; }

/* Compact, dismissible undo strip shared by page, panel and card. */
.dshhl-undo {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 1px 6px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.4;
}
.dshhl-undo__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshhl-undo__action,
.dshhl-undo__dontAsk,
.dshhl-undo__close {
  border: 0;
  background: none;
  padding: 0 2px;
  font: inherit;
  cursor: pointer;
}
.dshhl-undo__action { color: var(--dsw-alias-brand-primary); }
.dshhl-undo__dontAsk { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dshhl-undo__close { color: var(--dsw-alias-label-tertiary); font-size: 14px; line-height: 1; }
.dshhl-card--undo > *:not(.dshhl-undo) { display: none; }
.dshhl-card__header .dshhl-swatches { flex: 1; }
.dshhl-card__quote {
  margin: 0;
  padding: 6px 8px;
  border-left: 2px solid var(--dsw-alias-brand-primary);
  border-radius: var(--dsw-radius-xs, 8px);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  max-height: 84px;
  overflow: auto;
  white-space: pre-wrap;
}
.dshhl-card__taginput { flex: 1; min-width: 96px; }
.dshhl-card__footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.dshhl-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(272px, calc(100vw - 24px));
  padding: 10px;
  border: 0;
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-panel);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.4;
}
.dshhl-editor__quote {
  margin: 0;
  padding: 4px 8px;
  border-left: 2px solid var(--dsw-alias-brand-primary);
  border-radius: var(--dsw-radius-xs, 8px);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: calc(var(--dsh-content-font-size, 14px) - 2px);
  line-height: 1.4;
  max-height: 40px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.dshhl-editor__row--intent {
  flex-wrap: wrap;
  gap: 4px;
}
.dshhl-dock {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dshhl-dock__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshhl-empty__hint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dshhl-editor__row { display: flex; align-items: center; gap: 8px; }
.dshhl-editor__label { color: var(--dsw-alias-label-tertiary); font-size: 11px; min-width: 44px; }
.dshhl-editor__tags { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
/* The compact editor's footer: one decision per button, H28 controls, right aligned. */
.dshhl-editor__actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.dshhl-conflict__title { margin: 0; font-weight: 600; }
.dshhl-conflict__body { margin: 0; color: var(--dsw-alias-label-secondary); }
.dshhl-conflict__actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 2px; }
/* Short-toolbar status line for copy/reveal/insert feedback. */
.dshhl-status { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.4; }
.dshhl-status--warn { color: var(--dsw-alias-state-warn-primary); }
/* Right-panel tab body: a native pane (full height, content font) with a
   12px inset like the product's panel bodies and transparent list rows. */
.dshhl-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size, 14px);
  line-height: 1.6;
}
.dshhl-panel__header { display: flex; flex-direction: column; gap: 8px; padding: 12px 12px 4px; }
.dshhl-panel__titleRow { display: flex; align-items: baseline; gap: 8px; }
.dshhl-panel__title { margin: 0; font-size: 14px; font-weight: 600; line-height: 22px; }
.dshhl-panel__list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0 8px 16px; list-style: none; }
@media (max-width: 767px) {
  .dshhl-page__content { padding-inline: 20px; }
}
`
