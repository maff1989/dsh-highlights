/**
 * Browser context of one Session, used when minting a highlight.
 *
 * Records keep display snapshots so lists stay readable without opening every
 * session. Both sources are the client's catalog projections, not the session
 * snapshot: the session snapshot carries lifecycle state only and has no title
 * or working directory, which is why this module reads the session list and the
 * workspace list instead.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** Display context of one session at capture time. */
export interface SessionContext {
  readonly sessionId: string
  readonly sessionTitle?: string
  readonly workspaceId?: string
  readonly workspacePath?: string
}

/** The catalog row fields this module reads. */
interface SessionSummaryLike {
  readonly title?: string
  readonly displayTitle?: string
  readonly cwd?: string
}

/** The workspace-row fields this module reads. */
interface WorkspaceLike {
  readonly workspaceId: string
  readonly path: string
  readonly sessionIds: readonly string[]
}

/**
 * The Workspace service face read here.
 *
 * `ctx.workspaces` is installed by `@deepseek-ai/dsh-api-workspace-controller`
 * in the running product, but that package is not a local devDependency, so its
 * `Context` augmentation is not in this program. The structural shape below is
 * the contract this module actually reads; the runtime service is asserted
 * present by the plugin's `inject` list.
 */
interface WorkspaceSourceLike {
  readonly list?: {
    getSnapshot(): { readonly items: readonly WorkspaceLike[] }
  }
}

/** Read one catalog summary by session id, tolerating an absent row. */
function summaryOf(ctx: ClientContext, sessionId: string): SessionSummaryLike | undefined {
  const byId = ctx.sessions.list.getSnapshot().byId as Readonly<Record<string, SessionSummaryLike>>
  return byId[sessionId]
}

/** Find the Workspace row that accounts for one Session. */
function workspaceOf(ctx: ClientContext, sessionId: string): WorkspaceLike | undefined {
  const workspaces = (ctx as unknown as { readonly workspaces?: WorkspaceSourceLike }).workspaces
  const snapshot = workspaces?.list?.getSnapshot()
  if (snapshot === undefined) return undefined
  for (const item of snapshot.items) {
    if (!item.sessionIds.some(id => String(id) === sessionId)) continue
    return { workspaceId: String(item.workspaceId), path: item.path, sessionIds: item.sessionIds.map(id => String(id)) }
  }
  return undefined
}

/**
 * Resolve the display context of one session.
 *
 * Sources: `ctx.sessions.list` (`title`/`displayTitle`/`cwd`) and
 * `ctx.workspaces.list` (`workspaceId`/`path`). Missing rows leave the field
 * absent — never invented; existing records without snapshots keep working.
 * @param ctx - Client context.
 * @param sessionId - Owning session.
 * @returns the context, with whatever catalog values resolved.
 */
export function sessionContext(ctx: ClientContext, sessionId: string): SessionContext {
  const summary = summaryOf(ctx, sessionId)
  const workspace = workspaceOf(ctx, sessionId)
  const title = summary?.title ?? summary?.displayTitle
  const workspacePath = workspace?.path ?? summary?.cwd
  return {
    sessionId,
    ...(title === undefined || title === '' ? {} : { sessionTitle: title }),
    ...(workspace === undefined ? {} : { workspaceId: workspace.workspaceId }),
    ...(workspacePath === undefined || workspacePath === '' ? {} : { workspacePath }),
  }
}
