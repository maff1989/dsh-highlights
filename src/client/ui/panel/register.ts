/**
 * Registration of the Highlights right-panel tab type (surface S4).
 *
 * Two stages, both through the Sidebar's public path only: the type definition
 * goes into `ctx.sidebarRightTabs` (what a `highlights` tab is, and its chip
 * title), and the body goes into the keyed `sidebar.right.pane.tab` seat under
 * the same definition id. Nothing here reaches into the Sidebar's store, its
 * panes, or its sequence. Each registration lives inside the caller's
 * `ctx.effect`, so plugin unload removes it.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

import { LOCALE_NAMESPACE, TAB_KIND, TAB_TYPE_ID } from '../../../shared/constants'
import type { HighlightsActions } from '../../data/actions'
import type { HighlightsClient } from '../../data/client'
import type { CommandSurface } from '../../commands/surface'
import { HighlightsPanel } from './HighlightsPanel'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /**
     * Navigation parameters of the `highlights` page kind.
     *
     * `highlightId` asks the body to scroll that record into view and flash it;
     * `revision` is the tab's own navigation counter, used to act on a re-open
     * of the same target.
     */
    highlights: { readonly highlightId?: string }
  }
}

/** What the tab registration needs from the plugin body. */
export interface HighlightsTabDeps {
  /** The shared record store, exposed to the body as a selector source. */
  readonly client: HighlightsClient
  /** The action face the body falls back to. */
  readonly actions: HighlightsActions
  /** Command-routed face the body calls in production. */
  readonly commands?: CommandSurface
}

/**
 * Register the `highlights` tab type and its body.
 * @param ctx - client root context carrying the tab registry, the slot registry, and copy.
 * @param deps - the record store and the action face the body works through.
 */
export function registerHighlightsTab(ctx: Context, deps: HighlightsTabDeps): void {
  const t = ctx.locale.bind(LOCALE_NAMESPACE)

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_TYPE_ID,
    kind: TAB_KIND,
    title: () => t('panel.title'),
    priority: 'extension',
    keepMounted: false,
  }), 'highlights: right panel tab type')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_TYPE_ID,
    locale: LOCALE_NAMESPACE,
    inject: sessionId => ({ hooks: { snap: deps.client.source }, actions: deps.actions, sessionId, commands: deps.commands }),
  }, HighlightsPanel)), 'highlights: right panel tab body')
}
