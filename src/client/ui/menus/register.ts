/**
 * Context-menu data actions (S4), contributed to the shared Web popup.
 *
 * Two target families are answered from the already-loaded record store — no
 * React, no rendering, no fetch:
 *   - `session`: a sidebar Session row. Copy / Open / Brief.
 *   - `tab`: a right-sidebar tab. Same session-scoped actions; Open is disabled
 *     when the tab already *is* the Highlights tab (opening it again is a no-op).
 *
 * Presentation choices:
 *   - The three actions are always present for a Session, `disabled` when they
 *     cannot act, instead of being omitted. A menu whose action set changes
 *     between rows is harder to learn than one with a stable shape; the
 *     disabled row also documents that the feature exists on an empty Session.
 *   - Only operations that can actually be refused carry `failureLabel`: the
 *     clipboard write (a copy can be denied) and the brief insert. "Open" is
 *     synchronous and cannot fail.
 *   - `Brief` is separated from the two read actions, because it is the one
 *     action that writes to the conversation.
 *
 * The service is awaited through `ctx.inject`, so a composition that does not
 * mount the shared popup simply never runs these registrations instead of
 * failing plugin activation.
 */
import type { Context } from '@deepseek-ai/cordis'

import { TAB_KIND } from '../../../shared/constants'
import type { HighlightRecord } from '../../../shared/schema'
import { visibilityOf } from '../../../shared/provenance'
import type { HighlightsSnapshot } from '../../data/client'
import type { HighlightContextMenuDeps } from './deps'
import type { HighlightMenuAction, SessionMenuTarget, TabMenuTarget } from './contracts'
import { buildSessionMarkdown } from './markdown'

/** Action ids, unique within a resolved set. */
export const COPY_ACTION_ID = 'highlights.copy-session'
export const OPEN_ACTION_ID = 'highlights.open-panel'
export const BRIEF_ACTION_ID = 'highlights.brief-agent'

/** Contribution ids, unique within their target family. */
export const SESSION_CONTRIBUTION_ID = 'highlights.session-actions'
export const TAB_CONTRIBUTION_ID = 'highlights.tab-actions'

/** Order within the target family (after the shipped tab/session rows). */
const CONTRIBUTION_ORDER = 40

/**
 * Live records of one Session, from the store's projection with a defensive
 * fallback to the flat list.
 * @param deps - snapshot face.
 * @param sessionId - owning Session.
 * @returns that Session's records.
 */
function recordsOf(deps: HighlightContextMenuDeps, sessionId: string): readonly HighlightRecord[] {
  const snapshot: HighlightsSnapshot = deps.snapshot()
  const projected = snapshot.recordsBySession.get(sessionId)
  if (projected !== undefined) return projected
  return snapshot.records.filter(record => record.sessionId === sessionId)
}

/**
 * Build the action list for one Session.
 * @param deps - action face.
 * @param sessionId - target Session.
 * @param alreadyOpenHighlights - true when the tab target is the Highlights tab.
 * @returns the three actions, disabled where they cannot act.
 */
function actionsFor(deps: HighlightContextMenuDeps, sessionId: string, alreadyOpenHighlights: boolean): readonly HighlightMenuAction[] {
  const records = recordsOf(deps, sessionId)
  const annotations = records.filter(record => record.deletedAt === undefined)
  // Private items are still the user's to copy; the agent-facing brief leaves
  // them out, which is the per-item consent contract.
  const briefable = annotations.filter(record => visibilityOf(record) !== 'private')
  return [
    {
      id: COPY_ACTION_ID,
      label: deps.t('menu.copy.session'),
      disabled: annotations.length === 0,
      failureLabel: deps.t('menu.copy.failed'),
      run: async () => {
        const copied = await deps.copy(buildSessionMarkdown(annotations))
        if (!copied) throw new Error('clipboard refused the highlights')
      },
    },
    {
      id: OPEN_ACTION_ID,
      label: deps.t('menu.open'),
      disabled: alreadyOpenHighlights,
      run: () => {
        // The popup never invokes a disabled action; guard anyway so an
        // embedded renderer cannot re-open the tab the user is already on.
        if (!alreadyOpenHighlights) deps.openPanel(sessionId)
      },
    },
    {
      id: BRIEF_ACTION_ID,
      label: deps.t('brief.action'),
      separatorBefore: true,
      disabled: briefable.length === 0,
      failureLabel: deps.t('menu.brief.failed'),
      run: async () => {
        const outcome = await deps.brief(sessionId, briefable)
        // The insert action reports a staging refusal as `failed`; a rejected
        // promise or that value both surface through the menu's failureLabel.
        if (outcome === 'failed') throw new Error('brief insert failed')
      },
    },
  ]
}

/**
 * Resolve actions for a sidebar Session row.
 * @param deps - action face.
 * @param target - clicked row.
 * @returns the action list (empty instead of throwing on a malformed snapshot).
 */
function resolveSession(deps: HighlightContextMenuDeps, target: SessionMenuTarget): readonly HighlightMenuAction[] {
  try {
    const sessionId = typeof target.sessionId === 'string' ? target.sessionId : ''
    if (sessionId === '') return []
    return actionsFor(deps, sessionId, false)
  } catch {
    // A menu resolution must never break the popup: an unavailable snapshot
    // means this contribution simply has nothing to offer.
    return []
  }
}

/**
 * Resolve actions for a right-sidebar tab.
 * @param deps - action face.
 * @param target - clicked tab.
 * @returns the action list (Open disabled on the Highlights tab itself).
 */
function resolveTab(deps: HighlightContextMenuDeps, target: TabMenuTarget): readonly HighlightMenuAction[] {
  try {
    const sessionId = typeof target.sessionId === 'string' ? target.sessionId : ''
    if (sessionId === '') return []
    const kind = typeof target.tab?.kind === 'string' ? target.tab.kind : ''
    return actionsFor(deps, sessionId, kind === TAB_KIND)
  } catch {
    return []
  }
}

/**
 * Register the context-menu contributions.
 * @param ctx - client root context.
 * @param deps - snapshot, action face and copy.
 */
export function registerHighlightContextMenus(ctx: Context, deps: HighlightContextMenuDeps): void {
  // `ctx.inject` waits for the shared popup's service; without it this plugin
  // stays inert in that composition rather than failing activation.
  ctx.inject(['contextMenus'], (menuContext: Context) => {
    menuContext.effect(() => menuContext.contextMenus.register({
      id: SESSION_CONTRIBUTION_ID,
      target: 'session',
      order: CONTRIBUTION_ORDER,
      resolve: (target: SessionMenuTarget) => resolveSession(deps, target),
    }), 'highlights: session context menu')

    menuContext.effect(() => menuContext.contextMenus.register({
      id: TAB_CONTRIBUTION_ID,
      target: 'tab',
      order: CONTRIBUTION_ORDER,
      resolve: (target: TabMenuTarget) => resolveTab(deps, target),
    }), 'highlights: tab context menu')
  })
}
