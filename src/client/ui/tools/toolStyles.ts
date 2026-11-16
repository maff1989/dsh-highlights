/**
 * Stylesheet for the agent's highlight-tool rows (Phase 2).
 *
 * Injected by `register.ts` through the same plugin-owned `<style>` convention
 * the other sheets use. Token-only: no literal colours, radius from the theme
 * scale, and motion only under `prefers-reduced-motion: no-preference`.
 */
export const TOOL_ROW_STYLES = `
.dshhl-tool {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0 6px;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dshhl-tool__head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dshhl-tool__glyph { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary); }
.dshhl-tool__title { color: var(--dsw-alias-label-secondary); }
.dshhl-tool__total { color: var(--dsw-alias-label-tertiary); }
.dshhl-tool__toggle {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0 2px;
  border-radius: var(--dsw-radius-sm);
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
@media (hover: hover) {
  .dshhl-tool__toggle:hover { color: var(--dsw-alias-label-secondary); }
}
.dshhl-tool__toggle[aria-expanded="true"] .dshhl-tool__chevron { transform: rotate(180deg); }
.dshhl-tool__chevron {
  display: inline-block;
  transition: transform 80ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .dshhl-tool__chevron { transition: none; }
}
.dshhl-tool__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0 0 0 20px;
  list-style: none;
  min-width: 0;
}
.dshhl-tool__item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.dshhl-tool__dot {
  flex: 0 0 auto;
  inline-size: 8px;
  block-size: 8px;
  border-radius: 999px;
  background: var(--dshhl-tool-color, var(--dsw-alias-label-tertiary));
  transform: translateY(-1px);
}
.dshhl-tool__excerpt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  min-width: 0;
}
.dshhl-tool__source {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.dshhl-tool__note {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.dshhl-tool__error { color: var(--dsw-alias-state-error-primary); }
.dshhl-tool__proposals {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0 0 0 20px;
  list-style: none;
}
.dshhl-tool__proposal {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}
.dshhl-tool__proposalBody {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.dshhl-tool__proposalQuote {
  color: var(--dsw-alias-label-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dshhl-tool__proposalActions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
`
