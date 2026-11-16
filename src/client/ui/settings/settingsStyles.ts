/**
 * Stylesheet of the Highlights settings surfaces, as one plain string.
 *
 * The Settings shell owns the panel, nav and content padding; this sheet adds
 * only the section column and the preference rows it contributes. It follows
 * the native settings row rhythm (label/description left, control right, 0.5px
 * l2 separators) and its geometry (14/22 title, 12/18 description, H36 control).
 *
 * Feature CSS carries no literal colours: the five swatches are the plugin's
 * global palette custom properties (`--dsh-hl-1`..`5`, already themed), every
 * other surface a `--dsw-alias-*` token or `color-mix()` over one.
 */
export const SETTINGS_STYLES = `
.dshhl-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 720px;
  padding: 8px 0;
  color: var(--dsw-alias-label-primary);
}
.dshhl-settings__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
}
.dshhl-settings__intro {
  margin: 0;
  font-size: 13px;
  line-height: 21px;
  color: var(--dsw-alias-label-tertiary);
}
.dshhl-settings__group {
  display: flex;
  flex-direction: column;
  margin-top: 8px;
}
.dshhl-settings__groupTitle {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary);
}
.dshhl-settings__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dshhl-settings__row:last-child { border-bottom: none; }
.dshhl-settings__rowText {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 48px;
}
@media (max-width: 767px) {
  .dshhl-settings__rowText { padding-right: 16px; }
}
.dshhl-settings__rowTitle {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.dshhl-settings__rowDesc {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dshhl-settings__control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.dshhl-settings__readonly {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-secondary);
}
.dshhl-settings__swatches {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dshhl-settings__swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 50%;
  corner-shape: round;
  cursor: pointer;
  background-color: transparent;
}
.dshhl-settings__swatch:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.dshhl-settings__swatch[aria-checked='true'] {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
@media (hover: hover) {
  .dshhl-settings__swatch:hover { background-color: var(--dsw-alias-interactive-bg-hover); }
}
.dshhl-settings__swatch--1 { background-color: var(--dsh-hl-1); }
.dshhl-settings__swatch--2 { background-color: var(--dsh-hl-2); }
.dshhl-settings__swatch--3 { background-color: var(--dsh-hl-3); }
.dshhl-settings__swatch--4 { background-color: var(--dsh-hl-4); }
.dshhl-settings__swatch--5 { background-color: var(--dsh-hl-5); }
.dshhl-settings__status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dshhl-settings__status--warn { color: var(--dsw-alias-state-warn-primary); }
.dshhl-settings__status--error { color: var(--dsw-alias-state-error-secondary); }
.dshhl-settings__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
`
