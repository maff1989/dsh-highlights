/**
 * Sticky header of the global Highlights page: title, count, search field and
 * the filter row. The author chips are the page's provenance control: All is
 * the default, and one chip narrows to the reader's own items or the agent's.
 *
 * Presentational only — the page owns the filter state and the record set; the
 * header reports edits upward through the two callbacks. Filter-row options
 * come from {@link PageFacets}, derived from every record so choosing a filter
 * never removes the option that is currently selected.
 *
 * Colour filters are named pills rather than bare swatches: a dot with no name
 * is a memory test, and the names are the same ones the editor and the cards
 * use.
 */
import { useId } from 'react'
import type { ReactNode } from 'react'
import { Button, IconSearchOutlineRegular, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'

import {
  COLOR_IDS,
  colorLabel,
  type PageFacets,
  type PageFilters,
  type PageTranslate,
} from './grouping'

/** How many tag chips the filter row shows before the list gets noisy. */
const TAG_FACET_LIMIT = 10

/** Props of the page header. */
export interface PageHeaderProps {
  readonly t: PageTranslate
  /** Total live records (the count in the title row, not the filtered subset). */
  readonly count: number
  readonly filters: PageFilters
  readonly facets: PageFacets
  /** Records flagged unanchored; the toggle is hidden while there are none. */
  readonly unanchoredCount: number
  /** True when any filter is narrowing the list; gates the Clear control. */
  readonly filtersActive: boolean
  readonly onQueryChange: (query: string) => void
  readonly onFiltersChange: (patch: Partial<PageFilters>) => void
  readonly onClearFilters: () => void
}

/**
 * Render the page header.
 * @param props - Copy, current filters, derived options, and edit callbacks.
 * @returns the header element.
 */
export function PageHeader({
  t,
  count,
  filters,
  facets,
  unanchoredCount,
  filtersActive,
  onQueryChange,
  onFiltersChange,
  onClearFilters,
}: PageHeaderProps): ReactNode {
  const workspaceSelectId = useId()
  const tagGroupLabelId = useId()
  const colorGroupLabelId = useId()
  const authorGroupLabelId = useId()

  const visibleTags = facets.tags.slice(0, TAG_FACET_LIMIT)
  const selectedTag = facets.tags.find(facet => facet.tag === filters.tag)
  if (selectedTag !== undefined && !visibleTags.includes(selectedTag)) visibleTags.unshift(selectedTag)

  return (
    <header className="dshhl-page__header">
      <div className="dshhl-page__titleRow">
        <h1 className="dshhl-page__title">{t('page.title')}</h1>
        <span className="dshhl-page__count">
          {t(count === 1 ? 'page.count.one' : 'page.count.other', { count })}
        </span>
      </div>
      <p className="dshhl-page__subtitle">{t('page.subtitle')}</p>

      <Input
        className="dshhl-page__search"
        type="search"
        icon={<IconSearchOutlineRegular size={16} />}
        value={filters.query}
        placeholder={t('page.search.placeholder')}
        aria-label={t('page.search.placeholder')}
        onChange={event => onQueryChange(event.currentTarget.value)}
      />

      {count > 0 && (
        <div className="dshhl-page__filters" role="group" aria-label={t('page.filters')}>
          <label className="dshhl-page__filterLabel" htmlFor={workspaceSelectId}>
            {t('page.filter.workspace')}
          </label>
          <select
            id={workspaceSelectId}
            className="dshhl-select"
            value={filters.workspace ?? ''}
            onChange={event =>
              onFiltersChange({ workspace: event.currentTarget.value === '' ? undefined : event.currentTarget.value })
            }
          >
            <option value="">{t('page.filters.allWorkspaces')}</option>
            {facets.workspaces.map(facet => (
              // The name is the copy; the path stays grouping identity, never text.
              <option key={facet.key} value={facet.key}>{`${facet.label} (${facet.count})`}</option>
            ))}
          </select>

          <span className="dshhl-page__filterLabel" id={tagGroupLabelId}>
            {t('page.filter.tag')}
          </span>
          <div className="dshhl-page__chips" role="group" aria-labelledby={tagGroupLabelId}>
            {visibleTags.map(facet => (
              <Pill
                key={facet.tag}
                active={filters.tag === facet.tag}
                aria-pressed={filters.tag === facet.tag}
                onClick={() => onFiltersChange({ tag: filters.tag === facet.tag ? undefined : facet.tag })}
              >
                {`#${facet.tag}`}
              </Pill>
            ))}
          </div>

          <span className="dshhl-page__filterLabel" id={colorGroupLabelId}>
            {t('page.filter.color')}
          </span>
          <div className="dshhl-page__chips" role="group" aria-labelledby={colorGroupLabelId}>
            {COLOR_IDS.map(colorId => {
              const name = colorLabel(t, colorId)
              const selected = filters.colorId === colorId
              return (
                <Pill
                  key={colorId}
                  active={selected}
                  aria-pressed={selected}
                  onClick={() => onFiltersChange({ colorId: selected ? undefined : colorId })}
                >
                  <span
                    className="dshhl-colorDot"
                    style={{ background: `var(--dsh-hl-${String(colorId)})` }}
                    aria-hidden="true"
                  />
                  {name}
                </Pill>
              )
            })}
          </div>

          {/* Provenance: All is the default; one chip narrows to that author,
              clicking it again returns to All. */}
          <span className="dshhl-page__filterLabel" id={authorGroupLabelId}>
            {t('page.filter.author')}
          </span>
          <div className="dshhl-page__chips" role="group" aria-labelledby={authorGroupLabelId}>
            <Pill
              active={filters.author === 'user'}
              aria-pressed={filters.author === 'user'}
              onClick={() => onFiltersChange({ author: filters.author === 'user' ? undefined : 'user' })}
            >
              {t('page.filter.mine')}
            </Pill>
            <Pill
              active={filters.author === 'agent'}
              aria-pressed={filters.author === 'agent'}
              onClick={() => onFiltersChange({ author: filters.author === 'agent' ? undefined : 'agent' })}
            >
              {t('page.filter.agent')}
            </Pill>
          </div>

          <Pill
            active={filters.starredOnly}
            aria-pressed={filters.starredOnly}
            onClick={() => onFiltersChange({ starredOnly: !filters.starredOnly })}
          >
            {t('page.filter.starred')}
          </Pill>

          {unanchoredCount > 0 && (
            <Pill
              active={filters.showUnanchored}
              aria-pressed={filters.showUnanchored}
              onClick={() => onFiltersChange({ showUnanchored: !filters.showUnanchored })}
            >
              {t('page.filter.orphaned')}
            </Pill>
          )}

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={onClearFilters}>
              {t('page.filter.clear')}
            </Button>
          )}
        </div>
      )}
    </header>
  )
}
