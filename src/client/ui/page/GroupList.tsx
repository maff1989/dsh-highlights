/**
 * Grouped record list of the global Highlights page: workspace → session → rows.
 *
 * Both group levels are disclosures. Collapse state lives in the page store (so
 * leaving the page and coming back keeps the reader's folds); this component is
 * fully controlled through `collapsed`/`onToggle`. The headings stay in the
 * accessibility tree while collapsed, which keeps the page navigable by heading.
 *
 * Headings name things the way a person would: the workspace's last path
 * segment, the live session title, and a localised "Untitled session" when no
 * title is known.
 */
import { useId } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

import { visibilityOf } from '../../../shared/provenance'
import type { HighlightRecord } from '../../data/actions'
import {
  catalogEntryOf,
  UNKNOWN_WORKSPACE,
  sessionGroupKey,
  workspaceGroupKey,
  type Catalog,
  type WorkspaceGroup,
  type PageTranslate,
} from './grouping'
import { RecordRow, type RecordRowActions } from './RecordRow'

/** Props of the grouped list. */
export interface GroupListProps {
  readonly t: PageTranslate
  /** Filtered, grouped records; empty groups never reach here. */
  readonly groups: readonly WorkspaceGroup[]
  /** Live catalog lookup: session titles and the archived/unavailable badges. */
  readonly catalog: Catalog
  /** Records whose anchor cannot resolve (renders the row badge). */
  readonly orphanedIds: ReadonlySet<string>
  /** Render-time clock for the relative-time labels. */
  readonly now: number
  readonly actions: RecordRowActions
  /** Collapse keys of the folded groups (owned by the page store). */
  readonly collapsed: ReadonlySet<string>
  /** Flip one group's disclosure state. */
  readonly onToggle: (key: string) => void
  /**
   * Brief the agent on one session with the records shown under it. The page
   * owns the action + outcome reporting; a group with nothing briefable (after
   * private items are excluded) renders no control.
   */
  readonly onBriefSession: (sessionId: string, records: readonly HighlightRecord[]) => void
  /** Maximum rows rendered; absent means no limit. */
  readonly limit?: number
  /** Called when the reader asks for the next page of rows. */
  readonly onShowMore?: () => void
}

/**
 * Render the workspace and session groups.
 * @param props - grouped records, collapse state, catalog, and row actions.
 * @returns the list element.
 */
export function GroupList({
  t,
  groups,
  catalog,
  orphanedIds,
  now,
  actions,
  collapsed,
  onToggle,
  onBriefSession,
  limit,
  onShowMore,
}: GroupListProps): ReactNode {
  const idPrefix = useId()

  const totalRows = groups.reduce((sum, group) => sum + group.sessions.reduce((sessionSum, session) => sessionSum + session.records.length, 0), 0)
  const capped = limit !== undefined && limit < totalRows
  let renderedRows = 0

  return (
    <div className="dshhl-page__groups">
      {groups.map((group, groupIndex) => {
        const workspaceKey = workspaceGroupKey(group.key)
        const workspaceCollapsed = collapsed.has(workspaceKey)
        const workspaceHeadingId = `${idPrefix}-workspace-${String(groupIndex)}`
        const workspaceBodyId = `${workspaceHeadingId}-sessions`
        const workspaceLabel = group.label === UNKNOWN_WORKSPACE ? t('page.group.unknownWorkspace') : group.label

        return (
          <section key={group.key} className="dshhl-page__workspace" aria-labelledby={workspaceHeadingId}>
            <h2 id={workspaceHeadingId} className="dshhl-page__groupHeading">
              <button
                type="button"
                className="dshhl-page__groupToggle"
                aria-expanded={!workspaceCollapsed}
                aria-controls={workspaceBodyId}
                title={workspaceLabel}
                onClick={() => onToggle(workspaceKey)}
              >
                <IconChevronDownOutlineRegular size={11} className="dshhl-page__chevron" />
                <span className="dshhl-page__groupLabel">{workspaceLabel}</span>
                <span className="dshhl-page__groupCount">{group.count}</span>
              </button>
            </h2>

            {!workspaceCollapsed && (
              <ol id={workspaceBodyId} className="dshhl-page__sessions">
                {group.sessions.map((session, sessionIndex) => {
                  const sessionKey = sessionGroupKey(session.sessionId)
                  const sessionCollapsed = collapsed.has(sessionKey)
                  const sessionHeadingId = `${workspaceBodyId}-${String(sessionIndex)}`
                  const sessionRowsId = `${sessionHeadingId}-rows`
                  const sessionLabel = session.title ?? t('page.group.untitledSession')
                  // Private items never leave the device, so a session whose
                  // shown records are all private offers no briefing control.
                  const briefable = session.records.filter(record => visibilityOf(record) !== 'private')

                  return (
                    <li key={session.sessionId} className="dshhl-page__session">
                      <h3 id={sessionHeadingId} className="dshhl-page__sessionHeading">
                        <button
                          type="button"
                          className="dshhl-page__sessionToggle"
                          aria-expanded={!sessionCollapsed}
                          aria-controls={sessionRowsId}
                          title={sessionLabel}
                          onClick={() => onToggle(sessionKey)}
                        >
                          <IconChevronDownOutlineRegular size={10} className="dshhl-page__chevron" />
                          <span className="dshhl-page__groupLabel">{sessionLabel}</span>
                          <span className="dshhl-page__groupCount">{session.records.length}</span>
                        </button>
                        {briefable.length > 0 && (
                          // Sibling of the disclosure toggle, never nested inside it:
                          // two real buttons, one name each.
                          <button
                            type="button"
                            className="dshhl-page__brief"
                            aria-label={t('brief.action.session', { session: sessionLabel })}
                            title={t('brief.action')}
                            onClick={() => onBriefSession(session.sessionId, briefable)}
                          >
                            {t('brief.action')}
                          </button>
                        )}
                      </h3>

                      {!sessionCollapsed && (
                        <ol id={sessionRowsId} className="dshhl-page__rows" aria-labelledby={sessionHeadingId}>
                          {session.records.map((record: HighlightRecord) => {
                            if (limit !== undefined && renderedRows >= limit) return null
                            renderedRows += 1
                            const live = catalogEntryOf(catalog, record.sessionId)
                            return (
                              <li key={record.id}>
                                <RecordRow
                                  t={t}
                                  record={record}
                                  unanchored={orphanedIds.has(record.id)}
                                  archived={live.archived}
                                  unavailable={!live.available}
                                  now={now}
                                  actions={actions}
                                />
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        )
      })}
      {capped && (
        <div className="dshhl-page__more">
          <button type="button" className="dshhl-page__moreButton" onClick={onShowMore}>
            {t('page.showMore', { shown: String(limit), total: String(totalRows) })}
          </button>
        </div>
      )}
    </div>
  )
}
