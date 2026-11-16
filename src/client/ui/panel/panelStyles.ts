/**
 * Stylesheet of the right-panel Highlights tab, as one plain string.
 *
 * Generic controls are the product primitives (Input, Pill, Button, Tag, Menu);
 * the shared sheet owns the native pane frame, rows and control glue. This
 * sheet adds only what the tab owns: its header/body rhythm, the colour rail and
 * named filters, the metadata line, the inline editor layout, and the transient
 * notice/undo line.
 *
 * Feature CSS carries no literal colours: every surface is a `--dsw-alias-*`
 * semantic token or a `color-mix()` over one, so the panel follows the theme.
 * The flash tokens are declared on the panel itself, where the alias tokens are
 * in scope (the previous `:where(html)` declaration made every `color-mix()`
 * over a body-scoped alias invalid at computed-value time, i.e. transparent).
 */
export const PANEL_STYLES = `
.dshhl-panel {
  /* Declared here, not on html: the aliases live on body and inherit in. */
  --dshhl-panel-flash: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
  --dshhl-panel-flash-strong: color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, transparent);
}
.dshhl-panel__toolbar { display: flex; align-items: center; gap: 6px; }
.dshhl-panel__search { flex: 1; min-width: 0; }
.dshhl-panel__filters { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.dshhl-panel__chips { display: inline-flex; align-items: center; gap: 4px; }
.dshhl-panel__filterLabel { color: var(--dsw-alias-label-tertiary); font-size: 13px; }
.dshhl-panel__count { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
/* The title row also hosts the briefing control; wrap rather than clip it. */
.dshhl-panel__titleRow { flex-wrap: wrap; }
.dshhl-panel__brief { margin-inline-start: 6px; font-size: 11px; }
.dshhl-panel__notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 12px 4px;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.dshhl-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  padding: 0 4px 8px;
}
.dshhl-panel__list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0 4px 8px; list-style: none; }
/* Native list row: transparent hover surface, 8px inset, R12 standard radius. */
.dshhl-panel__row {
  display: flex;
  content-visibility: auto;
  contain-intrinsic-size: auto 64px;
  gap: 8px;
  padding: 8px;
  border-radius: var(--dsw-radius-md);
  background: transparent;
}
@media (hover: hover) {
  .dshhl-panel__row:hover { background: var(--dsw-alias-interactive-bg-hover); }
}
.dshhl-panel__row:focus-within { outline: none; }
.dshhl-panel__row--flash { animation: dshhl-panel-flash 1.2s ease-out; }
@keyframes dshhl-panel-flash {
  0% { background-color: var(--dshhl-panel-flash-strong); }
  100% { background-color: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .dshhl-panel__row--flash { animation: none; background-color: var(--dshhl-panel-flash); }
}
.dshhl-panel__bar { width: 3px; flex: none; align-self: stretch; border-radius: 2px; }
.dshhl-panel__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshhl-panel__quote {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 21px;
  white-space: pre-wrap;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dshhl-panel__note {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 21px;
  white-space: pre-wrap;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Quiet provenance chip: one author is exceptional, so it earns a chip while
   the reader's own rows stay plain (no "You" on every line). */
.dshhl-metaChip {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
}

/* Metadata line: colour dot · author chip (agent rows only) · date. */
.dshhl-panel__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dshhl-panel__dot {
  display: inline-block;
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.dshhl-panel__time { white-space: nowrap; }
.dshhl-panel__tags { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; }
.dshhl-panel__actions { display: flex; align-items: center; gap: 2px; }
.dshhl-panel__swatch {
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  border: 0.5px solid var(--dsw-alias-border-l3);
  cursor: pointer;
}
.dshhl-panel__swatch[aria-pressed='true'] { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dshhl-colorDot {
  display: inline-block;
  flex: none;
  width: 9px;
  height: 9px;
  margin-inline-end: 4px;
  border-radius: 50%;
}
.dshhl-srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.dshhl-panel__editor { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; padding-top: 8px; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dshhl-panel__editorRow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dshhl-panel__editorLabel { min-width: 42px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.dshhl-panel__editorActions { display: flex; justify-content: flex-end; gap: 6px; }
.dshhl-panel__tagInput { flex: 1; min-width: 120px; }
.dshhl-panel__more { display: flex; justify-content: center; padding: 8px 0; }

.dshhl-undo--panel {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  z-index: 2;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--dsw-alias-bg-inverse) 18%, transparent);
}
`
