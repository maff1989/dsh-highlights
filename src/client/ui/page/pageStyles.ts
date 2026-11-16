/**
 * Page-specific stylesheet of the global Highlights page, as a plain string.
 *
 * Generic controls are product primitives (Input, Pill, Button, Menu, Tag); the
 * shared sheet owns the native page frame, rows and control glue. This module
 * adds only what the Highlights page itself invents: the search slot, the
 * filter labels, the named colour pills, the grouped disclosures, the metadata
 * line and the inline row editor.
 *
 * Conventions: no literal colours (semantic `--dsw-alias-*` tokens only, with
 * `color-mix()` over tokens where a tint is needed), radii from
 * `--dsw-radius-*`, and native entry-page metrics (a 960px column with
 * responsive inline insets).
 */
export const PAGE_STYLES = `
.dshhl-page__search { display: flex; align-items: center; max-width: 320px; width: 100%; }
.dshhl-page__search > * { width: 100%; }
.dshhl-page__filterLabel { color: var(--dsw-alias-label-tertiary); font-size: 13px; }
.dshhl-page__chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.dshhl-page__summary { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; }

/* The quiet "brief the agent" control on each session heading: a text button,
   right-aligned, sibling of the disclosure toggle (never nested inside it). */
.dshhl-page__brief {
  flex: none;
  margin-inline-start: auto;
  height: 20px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
@media (hover: hover) {
  .dshhl-page__brief:hover {
    background: var(--dsw-alias-interactive-bg-hover);
    color: var(--dsw-alias-label-secondary);
  }
}
.dshhl-page__brief:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

/* Visually hidden, still announced: the colour's name next to its dot. */
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

/* Named colour filter: a dot carries the hue, the label carries the name. */
.dshhl-colorDot {
  display: inline-block;
  flex: none;
  width: 9px;
  height: 9px;
  margin-inline-end: 4px;
  border-radius: 50%;
}

.dshhl-page__groups { display: flex; flex-direction: column; gap: 28px; }
/* Page rows are not click-to-open targets (the panel's are), so the shared
   pointer affordance would be a lie here. */
.dshhl-undo--page { margin: 6px 0; }

.dshhl-page__more {
  display: flex;
  justify-content: center;
  padding: 10px 0 18px;
}

.dshhl-page__moreButton {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  padding: 6px 14px;
  font: inherit;
  cursor: pointer;
}
@media (hover: hover) {
  .dshhl-page__moreButton:hover { background: var(--dsw-alias-interactive-bg-hover); }
}
.dshhl-page__moreButton:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

.dshhl-page .dshhl-row {
  cursor: default;
  /* Native list row: the R12 standard control/content radius, not a literal. */
  border-radius: var(--dsw-radius-md);
  /* Large lists: let the browser skip off-screen row layout/paint work. */
  content-visibility: auto;
  contain-intrinsic-size: auto 72px;
}
.dshhl-page__workspace { display: flex; flex-direction: column; gap: 2px; }
.dshhl-page__groupHeading,
.dshhl-page__sessionHeading { display: flex; align-items: center; gap: 6px; margin: 0; }
.dshhl-page__sessionHeading { margin-top: 6px; }
.dshhl-page__groupToggle,
.dshhl-page__sessionToggle {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dshhl-page__groupToggle { font-size: 14px; font-weight: 600; line-height: 22px; color: var(--dsw-alias-label-primary); }
.dshhl-page__sessionToggle { font-size: 13px; font-weight: 500; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dshhl-page__chevron { flex: none; align-self: center; }
@media (prefers-reduced-motion: no-preference) {
  .dshhl-page__chevron { transition: transform 120ms ease; }
}
.dshhl-page__groupToggle[aria-expanded='false'] .dshhl-page__chevron,
.dshhl-page__sessionToggle[aria-expanded='false'] .dshhl-page__chevron { transform: rotate(-90deg); }
.dshhl-page__groupLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshhl-page__groupCount { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 400; }
.dshhl-page__sessions,
.dshhl-page__rows { margin: 0; padding: 0; list-style: none; }
.dshhl-page__sessions { display: flex; flex-direction: column; gap: 4px; padding-left: 2px; }
.dshhl-page__session { display: flex; flex-direction: column; gap: 2px; }
.dshhl-page__rows { display: flex; flex-direction: column; gap: 2px; padding-left: 18px; }

.dshhl-page__tags { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 2px 0 0; padding: 0; list-style: none; }
.dshhl-page__rowStar[aria-pressed='true'] { color: var(--dsw-alias-state-warn-primary); }


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

/* The processing cursor: a quiet control in the metadata line. New is
   unemphatic; kept/compiled pick up the business and done accents. */
.dshhl-stateChip {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 20px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
@media (hover: hover) {
  .dshhl-stateChip:hover { background: var(--dsw-alias-interactive-bg-hover); }
}
.dshhl-stateChip[data-state='kept'] {
  color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
}
.dshhl-stateChip[data-state='compiled'] {
  color: var(--dsw-alias-state-done-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-done-primary) 14%, transparent);
}
.dshhl-stateChip[aria-busy='true'] { opacity: 0.7; }
.dshhl-stateChip:disabled { cursor: default; opacity: 0.6; }
.dshhl-stateChip:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

/* "Worth another look": one quiet block above the list. No border, no shadow —
   it is a list section, not a floating surface. */
.dshhl-worth {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
}
.dshhl-worth__title {
  margin: 0 0 2px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}
.dshhl-worth__list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.dshhl-worth__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
@media (hover: hover) {
  .dshhl-worth__row:hover { background: var(--dsw-alias-interactive-bg-hover); }
}
.dshhl-worth__dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.dshhl-worth__excerpt {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.dshhl-worth__reason { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.dshhl-worth__more {
  align-self: flex-start;
  margin-top: 2px;
  padding: 2px 6px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
@media (hover: hover) {
  .dshhl-worth__more:hover { color: var(--dsw-alias-label-secondary); }
}
.dshhl-worth__row:focus-visible,
.dshhl-worth__more:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
/* Panel variant: the narrow column keeps list-row density. */
.dshhl-worth--compact { padding: 8px 10px; border-radius: var(--dsw-radius-md); }
.dshhl-worth--compact .dshhl-worth__reason { font-size: 11px; }

/* Metadata line: colour dot · author chip (agent rows only) · date. */
.dshhl-row__dot {
  display: inline-block;
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.dshhl-row__time { white-space: nowrap; }

/* Native density: the row's quick actions appear on hover/focus; the ⋯ stays.
   The quick group keeps its focusability while transparent, so the keyboard
   path is unchanged and :focus-within reveals it. */
.dshhl-row__quick { display: inline-flex; align-items: center; gap: 2px; }
@media (hover: hover) {
  .dshhl-page .dshhl-row__quick { opacity: 0; }
  .dshhl-page .dshhl-row:hover .dshhl-row__quick,
  .dshhl-page .dshhl-row:focus-within .dshhl-row__quick { opacity: 1; }
}
@media (hover: none) {
  .dshhl-page .dshhl-row__quick { opacity: 1; }
}
@media (prefers-reduced-motion: no-preference) {
  @media (hover: hover) {
    .dshhl-page .dshhl-row__quick { transition: opacity 120ms ease; }
  }
}

.dshhl-page__editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}
.dshhl-page__editor .dshhl-note-input { width: 100%; }
.dshhl-page__tagInput { flex: 1; min-width: 150px; }

.dshhl-page__groupToggle:focus-visible,
.dshhl-page__sessionToggle:focus-visible,
.dshhl-tagRemove:focus-visible,
.dshhl-page .dshhl-swatch:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

@media (max-width: 767px) {
  .dshhl-page__search { max-width: none; }
  .dshhl-page__rows { padding-left: 8px; }
}
`
