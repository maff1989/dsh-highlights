/**
 * View state of the global Highlights page.
 *
 * The page is a *page*, not a modal: leaving it to open a session and coming
 * back must not lose the search text, the filters, which groups were folded, or
 * how far the reader had scrolled. React component state cannot do that (the
 * main-panel slot unmounts on navigation), so the state lives in one
 * app-scoped store the component subscribes to.
 *
 * The store is a plain observable, deliberately not framework state: it also
 * holds the scroll offset, which is written on every scroll event and must not
 * re-render the list. `rowLimit` travels with the filters because a filter
 * change starts a new bounded page.
 */
import { EMPTY_FILTERS, type PageFilters } from './grouping'

/** Rows rendered before the page asks the reader to load more (scale guard). */
export const PAGE_ROW_LIMIT = 200

/** The part of the view state the list renders from. */
export interface PageViewState {
  readonly filters: PageFilters
  /** Collapse keys of the folded workspace/session groups. */
  readonly collapsed: ReadonlySet<string>
  /** Maximum rows rendered before "Show more". */
  readonly rowLimit: number
}

/** App-scoped page view state, observable and writable through named actions. */
export interface PageStore {
  /** Subscribe to view-state changes (not scroll changes). */
  readonly subscribe: (listener: () => void) => () => void
  /** Current immutable view state (stable identity between changes). */
  readonly getSnapshot: () => PageViewState
  /** Merge a filter patch; a filter change starts a new bounded page. */
  readonly setFilters: (patch: Partial<PageFilters>) => void
  /** Drop every filter and restore the first bounded page. */
  readonly clearFilters: () => void
  /** Flip one disclosure group (workspace or session collapse key). */
  readonly toggleCollapsed: (key: string) => void
  /** Reveal the next bounded page of rows. */
  readonly showMore: () => void
  /** Remember the scroll offset; does not notify subscribers. */
  readonly rememberScroll: (top: number) => void
  /** Last remembered scroll offset. */
  readonly scrollTop: () => number
  /** Restore the initial state (tests, and a future explicit reset control). */
  readonly reset: () => void
}

const INITIAL_VIEW: PageViewState = {
  filters: EMPTY_FILTERS,
  collapsed: new Set<string>(),
  rowLimit: PAGE_ROW_LIMIT,
}

/**
 * Create one page view store.
 *
 * The singleton below is what the page subscribes to; the factory is exported
 * so a registration that would rather own the store (DESIGN §6.8's
 * `store: createPageStore()`) can pass its own instance instead.
 * @returns a fresh store in the initial state.
 */
export function createPageStore(): PageStore {
  let view: PageViewState = INITIAL_VIEW
  let scrollTop = 0
  const listeners = new Set<() => void>()

  const publish = (next: PageViewState): void => {
    if (next === view) return
    view = next
    for (const listener of [...listeners]) listener()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => view,
    setFilters(patch) {
      publish({ ...view, filters: { ...view.filters, ...patch }, rowLimit: PAGE_ROW_LIMIT })
    },
    clearFilters() {
      publish({ ...view, filters: EMPTY_FILTERS, rowLimit: PAGE_ROW_LIMIT })
    },
    toggleCollapsed(key) {
      const collapsed = new Set(view.collapsed)
      if (collapsed.has(key)) collapsed.delete(key)
      else collapsed.add(key)
      publish({ ...view, collapsed })
    },
    showMore() {
      publish({ ...view, rowLimit: view.rowLimit + PAGE_ROW_LIMIT })
    },
    rememberScroll(top) {
      scrollTop = top
    },
    scrollTop: () => scrollTop,
    reset() {
      scrollTop = 0
      publish(INITIAL_VIEW)
    },
  }
}

/** The page instance's view state; survives leaving and re-entering the page. */
export const pageStore: PageStore = createPageStore()
