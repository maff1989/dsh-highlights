/**
 * Transcript rows for the agent's highlight tools (`list_highlights`,
 * `get_highlight`).
 *
 * The row is the visible half of M3: when the agent consults the margin, the
 * user sees which items were read, in place, without opening a panel. It reads
 * the supported UI-metadata channel (`output.presentationMeta` →
 * `tool/result.meta`) rather than parsing the model-facing text, and it treats
 * every field as optional — a card must never throw inside the transcript.
 */
import { useState } from 'react'
import {
  Button,
  IconChevronDownOutlineRegular,
  IconListPenOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'

import type {
  HighlightToolResultBlock,
  HighlightToolViewProps,
  ToolProposal,
} from './slot-contracts'

/** One item as the tool's presentation metadata describes it. */
interface ToolItem {
  readonly id?: string
  readonly excerpt?: string
  readonly colorId?: number
  readonly author?: string
  readonly anchored?: boolean
  readonly sessionTitle?: string
}

/** Presentation metadata of `list_highlights`. */
interface ToolListMeta {
  readonly kind: 'highlights.list'
  readonly items: readonly ToolItem[]
  readonly shown: number
  readonly total: number
}

/** Presentation metadata of `get_highlight`. */
interface ToolItemMeta {
  readonly kind: 'highlights.item'
  readonly item: ToolItem
}

/** Rows shown before expanding. */
const COLLAPSED_ITEMS = 3

/**
 * Read one object field defensively.
 * @param value - candidate object.
 * @param key - field name.
 * @returns the string value, or undefined when absent or another type.
 */
function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  return typeof field === 'string' && field !== '' ? field : undefined
}

/**
 * Normalise one metadata item.
 * @param value - candidate item.
 * @returns the item, or null when it carries no excerpt.
 */
function toItem(value: unknown): ToolItem | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const excerpt = stringField(record, 'excerpt')
  if (excerpt === undefined) return null
  const colorId = record.colorId
  const item: ToolItem = {
    excerpt,
    ...(stringField(record, 'id') === undefined ? {} : { id: stringField(record, 'id') as string }),
    ...(typeof colorId === 'number' ? { colorId } : {}),
    ...(stringField(record, 'author') === undefined ? {} : { author: stringField(record, 'author') as string }),
    ...(typeof record.anchored === 'boolean' ? { anchored: record.anchored } : {}),
    ...(stringField(record, 'sessionTitle') === undefined ? {} : { sessionTitle: stringField(record, 'sessionTitle') as string }),
  }
  return item
}

/**
 * Read `list_highlights` metadata.
 * @param meta - recorded metadata.
 * @returns the list, or null when this is not a list call.
 */
function readListMeta(meta: unknown): ToolListMeta | null {
  if (typeof meta !== 'object' || meta === null) return null
  const record = meta as Record<string, unknown>
  if (record.kind !== 'highlights.list' || !Array.isArray(record.items)) return null
  const items = record.items.map(toItem).filter((item): item is ToolItem => item !== null)
  const shown = typeof record.shown === 'number' ? record.shown : items.length
  const total = typeof record.total === 'number' ? record.total : shown
  return { kind: 'highlights.list', items, shown, total }
}

/**
 * Read `get_highlight` metadata.
 * @param meta - recorded metadata.
 * @returns the item, or null when this is not a detail call.
 */
function readItemMeta(meta: unknown): ToolItemMeta | null {
  if (typeof meta !== 'object' || meta === null) return null
  const record = meta as Record<string, unknown>
  if (record.kind !== 'highlights.item') return null
  const item = toItem(record.item)
  return item === null ? null : { kind: 'highlights.item', item }
}

/** Presentation metadata of `highlight_write` (proposals only). */
interface ToolProposalMeta {
  readonly kind: 'highlights.proposed'
  readonly proposals: readonly ToolProposal[]
}

/**
 * Read `highlight_write` proposal metadata.
 * @param meta - recorded metadata.
 * @returns the proposals, or null when this is not a proposal call.
 */
function readProposalMeta(meta: unknown): ToolProposalMeta | null {
  if (typeof meta !== 'object' || meta === null) return null
  const record = meta as Record<string, unknown>
  if (record.kind !== 'highlights.proposed' || !Array.isArray(record.proposals)) return null
  const proposals: ToolProposal[] = []
  for (const raw of record.proposals) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>
    const quote = typeof item.quote === 'string' ? item.quote : ''
    if (quote === '') continue
    const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : []
    const colorId = typeof item.colorId === 'number' ? item.colorId : 1
    const intent = item.intent === 'note' || item.intent === 'dispute' || item.intent === 'direct' || item.intent === 'remember'
      ? item.intent
      : undefined
    proposals.push({
      quote,
      ...(typeof item.note === 'string' && item.note !== '' ? { note: item.note } : {}),
      tags,
      colorId,
      ...(intent === undefined ? {} : { intent }),
    })
  }
  return { kind: 'highlights.proposed', proposals }
}

/**
 * Render one item line: colour dot, excerpt, source metadata.
 * @param props - translation and the item.
 * @returns the list item element.
 */
function ItemLine({ t, item }: { readonly t: HighlightToolViewProps['t']; readonly item: ToolItem }) {
  const dotStyle = {
    '--dshhl-tool-color': `var(--dsh-hl-${String(item.colorId ?? 3)})`,
  } as React.CSSProperties
  return (
    <li className="dshhl-tool__item">
      <span className="dshhl-tool__dot" style={dotStyle} aria-hidden="true" />
      <span className="dshhl-tool__excerpt">{item.excerpt}</span>
      {item.anchored === false && <span className="dshhl-tool__note">{t('tool.unanchored')}</span>}
      {item.author === 'agent' && <span className="dshhl-tool__note">{t('meta.author.agent')}</span>}
      {item.sessionTitle !== undefined && <span className="dshhl-tool__source">{item.sessionTitle}</span>}
    </li>
  )
}

/** Per-proposal interaction state. */
type KeepState = 'idle' | 'saving' | 'saved' | 'not-found' | 'failed'

/**
 * Proposal list: the agent's suggestions, kept or dismissed one at a time.
 *
 * Nothing is stored until the user keeps a proposal; keeping resolves the quote
 * in the current transcript and writes an agent-authored item through the normal
 * create path.
 * @param props - translation, proposals, and the keep handler.
 * @returns the proposal block.
 */
function Proposals({
  t, proposals, keepProposal,
}: {
  readonly t: HighlightToolViewProps['t']
  readonly proposals: readonly ToolProposal[]
  readonly keepProposal?: HighlightToolViewProps['keepProposal']
}): React.JSX.Element {
  const [dismissed, setDismissed] = useState<readonly number[]>([])
  const [states, setStates] = useState<Readonly<Record<number, KeepState>>>({})
  const visible = proposals
    .map((proposal, index) => ({ proposal, index }))
    .filter(({ index }) => !dismissed.includes(index))

  /**
   * Keep one proposal.
   * @param index - proposal index.
   * @param proposal - the proposal.
   * @returns completion.
   */
  const keep = async (index: number, proposal: ToolProposal): Promise<void> => {
    if (keepProposal === undefined) return
    setStates(previous => ({ ...previous, [index]: 'saving' }))
    const outcome = await keepProposal(proposal)
    setStates(previous => ({ ...previous, [index]: outcome.status }))
  }

  const statusFor = (index: number): KeepState => states[index] ?? 'idle'

  return (
    <div className="dshhl-tool dshhl-tool--proposals" data-tool="highlight_write">
      <div className="dshhl-tool__head">
        <IconListPenOutlineRegular size={14} className="dshhl-tool__glyph" />
        <span className="dshhl-tool__title">
          {visible.length === 0
            ? t('tool.propose.dismissed')
            : visible.length === 1
              ? t('tool.proposed.one')
              : t('tool.proposed.other', { count: String(visible.length) })}
        </span>
      </div>
      <ul className="dshhl-tool__proposals">
        {visible.map(({ proposal, index }) => {
          const state = statusFor(index)
          const settled = state === 'saved'
          return (
            <li key={`${String(index)}:${proposal.quote.slice(0, 24)}`} className="dshhl-tool__proposal">
              <span
                className="dshhl-tool__dot"
                style={{ '--dshhl-tool-color': `var(--dsh-hl-${String(proposal.colorId)})` } as React.CSSProperties}
                aria-hidden="true"
              />
              <span className="dshhl-tool__proposalBody">
                <span className="dshhl-tool__proposalQuote">{proposal.quote}</span>
                {proposal.note !== undefined && <span className="dshhl-tool__note">{proposal.note}</span>}
                {state !== 'idle' && state !== 'saving' && (
                  <span className={state === 'saved' ? 'dshhl-tool__note' : 'dshhl-tool__error'}>
                    {state === 'saved'
                      ? t('tool.propose.saved')
                      : state === 'not-found'
                        ? t('tool.propose.notFound')
                        : t('tool.propose.failed')}
                  </span>
                )}
              </span>
              {!settled && (
                <span className="dshhl-tool__proposalActions">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={state === 'saving' || keepProposal === undefined}
                    onClick={() => { void keep(index, proposal) }}
                  >
                    {t('tool.propose.keep')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setDismissed(previous => [...previous, index]) }}
                  >
                    {t('tool.propose.dismiss')}
                  </Button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * One atomic highlight-tool call.
 *
 * All three phases render because the transcript keeps the row mounted across
 * them; a settled failure renders as a one-line error, never as a broken card.
 * @param props - owner props (call identity, stage block) plus locale.
 * @returns the row element.
 */
export function HighlightToolRow(props: HighlightToolViewProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const { t, toolName } = props as unknown as { t: HighlightToolViewProps['t']; toolName: string }

  if (props.phase !== 'result') {
    return (
      <div className="dshhl-tool" role="status">
        <div className="dshhl-tool__head">
          <IconListPenOutlineRegular size={14} className="dshhl-tool__glyph" />
          <span className="dshhl-tool__title">{t('tool.running')}</span>
        </div>
      </div>
    )
  }

  const block = props.block as HighlightToolResultBlock
  if (block.isError === true) {
    const reason = block.error?.reason ?? block.error?.code ?? ''
    return (
      <div className="dshhl-tool">
        <div className="dshhl-tool__head">
          <IconListPenOutlineRegular size={14} className="dshhl-tool__glyph" />
          <span className="dshhl-tool__error">
            {t('tool.failed')}
            {reason === '' ? '' : ` — ${reason}`}
          </span>
        </div>
      </div>
    )
  }

  const proposed = readProposalMeta(block.meta)
  if (proposed !== null) {
    return <Proposals t={t} proposals={proposed.proposals} keepProposal={props.keepProposal} />
  }

  const list = readListMeta(block.meta)
  const detail = list === null ? readItemMeta(block.meta) : null
  const items = list?.items ?? (detail === null ? [] : [detail.item])

  // A settled call without presentation metadata still renders: the count comes
  // from the recorded shape, the rows are simply absent.
  const title = items.length <= 1 && detail !== null
    ? t('tool.read.one')
    : items.length === 1
      ? t('tool.consulted.one')
      : t('tool.consulted.other', { count: String(items.length) })
  const totalSuffix = list !== null && list.total > items.length
    ? t('tool.ofTotal', { total: String(list.total) })
    : undefined

  const visible = expanded ? items : items.slice(0, COLLAPSED_ITEMS)
  const hiddenCount = items.length - visible.length

  return (
    <div className="dshhl-tool" data-tool={toolName}>
      <div className="dshhl-tool__head">
        <IconListPenOutlineRegular size={14} className="dshhl-tool__glyph" />
        <span className="dshhl-tool__title">{title}</span>
        {totalSuffix !== undefined && <span className="dshhl-tool__total">{totalSuffix}</span>}
        {items.length > 0 && (
          <button
            type="button"
            className="dshhl-tool__toggle"
            aria-expanded={expanded}
            aria-label={expanded ? t('tool.less') : t('tool.expand')}
            onClick={() => { setExpanded(previous => !previous) }}
          >
            <IconChevronDownOutlineRegular size={12} className="dshhl-tool__chevron" />
          </button>
        )}
      </div>
      {visible.length > 0 && (
        <ul className="dshhl-tool__items">
          {visible.map((item, index) => (
            <ItemLine key={item.id ?? `${String(index)}`} t={t} item={item} />
          ))}
          {hiddenCount > 0 && (
            <li className="dshhl-tool__note">{t('tool.more', { count: String(hiddenCount) })}</li>
          )}
        </ul>
      )}
    </div>
  )
}
