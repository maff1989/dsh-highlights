/**
 * Registration entry point for the highlight tool views (Phase 2, T2.5).
 *
 * The composition root (`src/client/index.ts`) calls one function; the
 * stylesheet, both keyed registrations and their disposal are owned here, the
 * same shape the Settings surface uses.
 *
 * `tool.call.toolview` is keyed by the wire tool name, so each registration owns
 * exactly one tool name; an unregistered name falls back to the generic card.
 * The slot's contract is restated in `slot-contracts.ts` (workaround W15).
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

import { LOCALE_NAMESPACE } from '../../../shared/constants'
import { HighlightToolRow } from './HighlightToolRow'
import type { HighlightToolBusiness } from './slot-contracts'
import { TOOL_ROW_STYLES } from './toolStyles'
import './slot-contracts'

/** Wire tool names this package owns a row for. */
export const HIGHLIGHT_TOOL_NAMES = ['list_highlights', 'get_highlight'] as const

/**
 * Append one plugin-owned stylesheet to the document.
 * @param css - Stylesheet text.
 * @returns the disposer that removes the element.
 */
function injectStylesheet(css: string): () => void {
  const element = document.createElement('style')
  element.dataset.pluginCss = 'dsh-highlights'
  element.textContent = css
  document.head.append(element)
  return () => {
    element.remove()
  }
}

/**
 * Register the transcript rows for the agent's highlight tools.
 * @param ctx - client root context owning every contribution.
 */
export function registerHighlightToolViews(ctx: Context, business: HighlightToolBusiness = {}): void {
  ctx.effect(() => injectStylesheet(TOOL_ROW_STYLES), 'highlights: tool card styles')
  for (const wireName of HIGHLIGHT_TOOL_NAMES) {
    ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview',
      key: wireName,
      locale: LOCALE_NAMESPACE,
      inject: () => business,
    }, HighlightToolRow)), `highlights: tool view ${wireName}`)
  }
}
