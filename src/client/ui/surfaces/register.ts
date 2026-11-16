/**
 * Registration of the passive resurfacing surfaces (T4.2 sidebar badge + hover
 * preview, T4.3 turn-tail digest).
 *
 * The composition root calls this one function with the client store's read +
 * subscribe face; the surfaces never fetch. All three seats are declared and
 * typed by packages the plugin already depends on for types, so the contracts
 * are checked against the shipped declarations rather than restated locally:
 *   - `sidebar.session.row.trailing` / `.hover`: `@deepseek-ai/dsh-client-ui-workspace/client`
 *     (owner props `{ sessionId }`; trailing is an inline, non-interactive strip
 *     after the row's time label, hover renders only while the card is open)
 *   - `conversation.chat.turnTail`: `@deepseek-ai/dsh-client-ui-chat/client`
 *     (owner props `{ turn, seq, openFile }`; ordered band before a completed
 *     turn's action row, session scope)
 *
 * Styles come from one local sheet injected here, following the settings
 * surface's pattern; no class of the plugin's global sheets is touched.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'

import { LOCALE_NAMESPACE } from '../../../shared/constants'
import type { SessionSurfacesDeps } from './deps'
import { KeptBadge } from './KeptBadge'
import { SessionHover } from './SessionHover'
import { SURFACES_STYLES } from './surfacesStyles'
import { TurnDigest } from './TurnDigest'

/** Registration id of the sidebar kept badge. */
export const KEPT_BADGE_ID = 'highlights-kept'

/** Registration id of the sidebar hover section. */
export const KEPT_HOVER_ID = 'highlights-kept-hover'

/** Registration id of the turn-tail digest. */
export const TURN_DIGEST_ID = 'highlights-turn-digest'

/**
 * Append one plugin-owned stylesheet to the document.
 * @param css - stylesheet text.
 * @returns the disposer that removes the element.
 */
function injectStylesheet(css: string): () => void {
  const element = document.createElement('style')
  element.dataset.pluginCss = 'dsh-highlights'
  element.dataset.pluginCssPart = 'surfaces'
  element.textContent = css
  document.head.append(element)
  return () => {
    element.remove()
  }
}

/**
 * Register the passive resurfacing surfaces.
 * @param ctx - client root context owning every contribution.
 * @param deps - the client store's read/subscribe face and the panel opener.
 */
export function registerSessionSurfaces(ctx: Context, deps: SessionSurfacesDeps): void {
  ctx.effect(() => injectStylesheet(SURFACES_STYLES), 'highlights: session surfaces styles')

  // `sidebar.session.row.trailing` — kept-count badge for this row's Session.
  ctx.effect(() => ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
    name: 'sidebar.session.row.trailing',
    id: KEPT_BADGE_ID,
    order: 20,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ ...deps }),
  }, KeptBadge)), 'highlights: sidebar kept badge')

  // `sidebar.session.row.hover` — top two items inside the row's hover card.
  ctx.effect(() => ctx.slots.inject('sidebar.session.row.hover', () => ctx.slots.register({
    name: 'sidebar.session.row.hover',
    id: KEPT_HOVER_ID,
    order: 20,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ ...deps }),
  }, SessionHover)), 'highlights: sidebar hover preview')

  // `conversation.chat.turnTail` — per-turn annotation digest. The session
  // scope resolves the owning Session, which the digest uses to pick its
  // record slice without binding or retaining the Session.
  ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: TURN_DIGEST_ID,
    order: 30,
    locale: LOCALE_NAMESPACE,
    inject: (sessionId: string) => ({ ...deps, sessionId: String(sessionId) }),
  }, TurnDigest)), 'highlights: turn digest')
}
