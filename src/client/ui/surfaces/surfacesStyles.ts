/**
 * Stylesheet of the passive resurfacing surfaces (T4.2, T4.3), as one string.
 *
 * Nothing here paints a literal colour: the badge and digest are tertiary label
 * type over the transcript/sidebar surfaces, the hover section uses the hover
 * card's own dark-surface labels, and the preview dots are the plugin's already
 * themed palette custom properties (`--dsh-hl-1`..`5`).
 *
 * Geometry follows the seats it fills: the sidebar trailing strip is icon-scale
 * (10/16 like the row's time label), the hover card section is 12px type, and
 * the turn-tail line is a quiet 12px text button aligned to the reply body.
 */
export const SURFACES_STYLES = `
/* Visually hidden, still announced (the badge's full sentence). */
.dshhl-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* Sidebar trailing kept badge: icon-scale, non-interactive. */
.dshhl-kept {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.dshhl-kept__glyph { flex: none; }

/* Sidebar hover-card section: between the relative time and the status rows. */
.dshhl-hover { display: flex; flex-direction: column; gap: 4px; }
.dshhl-hover__title,
.dshhl-hover__more {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-hovercard-label-tertiary);
}

/* Quote preview rows shared by the hover card and the turn hover preview. */
.dshhl-preview { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dshhl-preview__row { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.dshhl-preview__dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  corner-shape: round;
}
.dshhl-preview__text {
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dshhl-preview--hovercard .dshhl-preview__text { color: var(--dsw-alias-hovercard-label-primary); }

/* Turn-tail digest: one quiet, clickable line. */
.dshhl-digest {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 0 -6px;
  padding: 1px 6px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
}
@media (hover: hover) {
  .dshhl-digest:hover {
    background: var(--dsw-alias-interactive-bg-hover);
    color: var(--dsw-alias-label-secondary);
  }
}
.dshhl-digest:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.dshhl-digest__glyph { flex: none; }
.dshhl-digest__preview { display: flex; flex-direction: column; gap: 6px; max-width: 340px; }
.dshhl-digest__more { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
`
