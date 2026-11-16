/**
 * One record row of the global Highlights page.
 *
 * The row shows the stored annotation (quote, note, tags, badges) plus a
 * metadata line that stays in the reader's vocabulary: the colour, a quiet
 * author chip when the agent wrote the annotation, the processing cursor (a
 * control that advances new → kept → compiled), and a relative date. The
 * reader's own rows carry no author chip — labelling every row "You" would be
 * noise. The session and workspace are named
 * by the group headings above the row, and transcript ordinals never render.
 *
 * Density follows the native list-row convention: the row's two quick actions
 * are revealed on hover/focus (they stay focusable, so keyboard reachability is
 * unaffected), while the always-visible `⋯` opens the product `Menu` with copy,
 * edit, panel and delete. The menu is portalled to `document.body` because the
 * row sets `content-visibility: auto`, which creates a clipping context.
 *
 * Archived sessions are named by the badge and lose reveal (the session is not
 * open and reopening it is the reader's decision); unavailable sessions are
 * named too, since the catalog no longer has a row for them.
 */
import { memo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  IconCopyOutlineRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconListPenOutlineRegular,
  IconRightUpOutlineRegular,
  IconTrashOutlineRegular,
  Menu,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'

import type { ColorId } from '../../../shared/schema'
import type { RecordState } from '../../../shared/provenance'
import type {
  HighlightRecord,
  RevealOutcome,
  UpdatePatch,
  WriteOutcome,
} from '../../data/actions'
import { ConflictBar } from '../ConflictBar'
import { EditorFields } from '../EditorFields'
import { StateChip } from './StateChip'
import {
  authorLabelOf,
  colorLabel,
  COLOR_IDS,
  formatRelativeTime,
  type PageTranslate,
} from './grouping'

/** The actions one row can invoke; the page binds them to the plugin's action face. */
export interface RecordRowActions {
  /** Flip the record's star. */
  readonly onToggleStar: (record: HighlightRecord) => void
  /** Save an edit of the presentation fields (explicit version = overwrite path). */
  readonly onUpdate: (record: HighlightRecord, patch: UpdatePatch, expectedVersion?: number) => Promise<WriteOutcome>
  /** Advance the processing cursor; the page reports a failed write. */
  readonly onCursor: (record: HighlightRecord, state: RecordState) => Promise<WriteOutcome>
  /** Soft-delete the record; the outcome decides whether the row may disappear. */
  readonly onRemove: (record: HighlightRecord) => Promise<WriteOutcome>
  /** Copy the quote plus its citation; true only on a real copy. */
  readonly onCopy: (record: HighlightRecord) => Promise<boolean>
  /** Open the owning session and reveal the anchored text. */
  readonly onReveal: (record: HighlightRecord) => Promise<RevealOutcome>
  /** Focus the record in the session's right-panel tab. */
  readonly onOpenPanelTab: (record: HighlightRecord) => void
}

/** Props of one row. */
export interface RecordRowProps {
  readonly t: PageTranslate
  readonly record: HighlightRecord
  /** True when the anchor cannot currently resolve; renders the Unanchored badge. */
  readonly unanchored: boolean
  /** True when the owning session is archived: reveal is disabled. */
  readonly archived: boolean
  /** True when the owning session no longer exists in the catalog. */
  readonly unavailable: boolean
  /** Render-time clock for the relative-time label. */
  readonly now: number
  readonly actions: RecordRowActions
}

/** Props of the inline presentation editor. */
interface RecordEditorProps {
  readonly t: PageTranslate
  readonly record: HighlightRecord
  /** Persist the patch; `expectedVersion` is the conflict-overwrite path. */
  readonly onSave: (patch: UpdatePatch, expectedVersion?: number) => Promise<WriteOutcome>
  readonly onCancel: () => void
}

/**
 * Filled or hollow star glyph.
 *
 * The primitives icon set has no star, and a pin or heart would name the wrong
 * thing; this is a local glyph drawn in `currentColor` so it inherits theme.
 * @param props - whether the record is starred.
 * @returns the star element.
 */
function StarIcon({ filled }: { readonly filled: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      width={13}
      height={13}
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinejoin="round"
    >
      <path d="M8 2.2 9.8 5.9l4.1.6-3 2.9.7 4.1L8 11.6l-3.6 1.9.7-4.1-3-2.9 4.1-.6z" />
    </svg>
  )
}

/**
 * Inline editor for the presentation fields (colour, tags, note).
 *
 * Edits stay local until Save; the Host normalises tags authoritatively, while
 * the input strips a leading `#` and lowercases so the draft chips read like
 * stored ones.
 * @param props - the record being edited and the save/cancel callbacks.
 * @returns the editor element.
 */
function RecordEditor({ t, record, onSave, onCancel }: RecordEditorProps): ReactNode {
  const [colorId, setColorId] = useState<ColorId>(record.colorId)
  const [tags, setTags] = useState<readonly string[]>(record.tags)
  const [note, setNote] = useState(record.note ?? '')
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<HighlightRecord | undefined>(undefined)
  const [saveError, setSaveError] = useState(false)

  /** Hand the current draft to the action face; keep it open on conflict. */
  const save = async (expectedVersion?: number): Promise<void> => {
    if (busy) return
    setBusy(true)
    setConflict(undefined)
    setSaveError(false)
    try {
      const trimmed = note.trim()
      const outcome = await onSave({ colorId, tags: [...tags], note: trimmed === '' ? null : trimmed }, expectedVersion)
      if (outcome.status === 'written') {
        onCancel()
        return
      }
      if (outcome.status === 'conflict') {
        setConflict(outcome.record)
        return
      }
      setSaveError(true)
    } finally {
      setBusy(false)
    }
  }

  /** Adopt the stored version after a conflict (draft reset). */
  const reload = (live: HighlightRecord): void => {
    setColorId(live.colorId)
    setTags([...live.tags])
    setNote(live.note ?? '')
    setConflict(undefined)
  }

  return (
    <div className="dshhl-page__editor">
      <EditorFields
        t={t as unknown as (key: string) => string}
        colorId={colorId}
        colorIds={COLOR_IDS}
        colorLabel={id => colorLabel(t, id as ColorId)}
        onColor={id => { setColorId(id as ColorId) }}
        tags={tags}
        onAddTag={tag => { setTags([...tags, tag]) }}
        onRemoveTag={tag => { setTags(tags.filter(item => item !== tag)) }}
        note={note}
        onNote={setNote}
        noteLabelKey="editor.note"
        classes={{ tagInput: 'dshhl-page__tagInput' }}
      />

      {conflict !== undefined && (
        <ConflictBar
          t={t}
          busy={busy}
          onReload={() => { reload(conflict) }}
          onOverwrite={() => { void save(conflict.version) }}
        />
      )}
      {saveError && <p className="dshhl-status dshhl-status--warn" role="status">{t('error.generic')}</p>}
      <div className="dshhl-editor__actions">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('action.cancel')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => { void save() }}
        >
          {/* An existing highlight is edited, not saved for the first time. */}
          {t('action.saveChanges')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Render one record row.
 * @param props - the record, its flags, the render clock, and the row actions.
 * @returns the row element.
 */
function RecordRowImpl({ t, record, unanchored, archived, unavailable, now, actions }: RecordRowProps): ReactNode {
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const author = authorLabelOf(t, record)
  const revealBlocked = archived || unavailable
  const revealTitle = archived ? t('action.revealArchived') : t('action.revealUnavailable')

  /** Rows of the overflow menu, reusing the product's Menu atom. */
  const menuItems: MenuEntry[] = [
    { id: 'copy', label: t('action.copy'), icon: <IconCopyOutlineRegular size={14} /> },
    { id: 'edit', label: t('action.edit'), icon: <IconEditOutlineRegular size={14} /> },
    { id: 'panel', label: t('action.openPanel'), icon: <IconListPenOutlineRegular size={14} /> },
    { type: 'separator', id: 'separator' },
    { id: 'delete', label: t('action.delete'), icon: <IconTrashOutlineRegular size={14} />, danger: true },
  ]

  return (
    <article className="dshhl-row" aria-label={record.anchor.quote}>
      <span
        className="dshhl-row__bar"
        style={{ background: `var(--dsh-hl-${String(record.colorId)})` }}
        aria-hidden="true"
      />
      <div className="dshhl-row__main">
        <p className="dshhl-row__quote">{record.anchor.quote}</p>
        {record.note !== undefined && record.note !== '' && <p className="dshhl-row__note">{record.note}</p>}
        {(record.tags.length > 0 || unanchored || archived || unavailable) && (
          <ul className="dshhl-page__tags">
            {record.tags.map(tag => (
              <li key={tag}>
                <Tag tone="outline">{`#${tag}`}</Tag>
              </li>
            ))}
            {archived && <li><Tag tone="neutral">{t('badge.archived')}</Tag></li>}
            {unavailable && <li><Tag tone="warning">{t('badge.unavailable')}</Tag></li>}
            {unanchored && <li><Tag tone="warning">{t('badge.orphaned')}</Tag></li>}
          </ul>
        )}
        <div className="dshhl-row__meta">
          {/* The colour is the one piece of record state the quote cannot show. */}
          <span className="dshhl-srOnly">{colorLabel(t, record.colorId)}</span>
          <span
            className="dshhl-row__dot"
            style={{ background: `var(--dsh-hl-${String(record.colorId)})` }}
            aria-hidden="true"
          />
          {author !== undefined && <span className="dshhl-metaChip">{author}</span>}
          <StateChip
            t={t}
            record={record}
            write={next => actions.onCursor(record, next)}
          />
          <time
            className="dshhl-row__time"
            dateTime={new Date(record.updatedAt).toISOString()}
            title={new Date(record.updatedAt).toLocaleString()}
          >
            {formatRelativeTime(record.updatedAt, now, t)}
          </time>
        </div>
        {editing && (
          <RecordEditor
            t={t}
            record={record}
            onCancel={() => setEditing(false)}
            onSave={(patch, expectedVersion) => actions.onUpdate(record, patch, expectedVersion)}
          />
        )}
      </div>

      <div className="dshhl-row__actions">
        {/* Revealed on hover/focus by page CSS; still tabbable, so keyboard users
            reach them and the row's focus state makes them visible. */}
        <span className="dshhl-row__quick">
          <Button
            variant="ghost"
            size="sm"
            className="dshhl-icon-button dshhl-page__rowStar"
            aria-pressed={record.starred}
            aria-label={t(record.starred ? 'action.unstar' : 'action.star')}
            icon={<StarIcon filled={record.starred} />}
            onClick={() => actions.onToggleStar(record)}
          />
          <Button
            variant="ghost"
            size="sm"
            className="dshhl-icon-button"
            aria-label={t('action.reveal')}
            disabled={revealBlocked}
            title={revealBlocked ? revealTitle : t('action.reveal')}
            icon={<IconRightUpOutlineRegular size={15} />}
            onClick={() => { void actions.onReveal(record) }}
          />
        </span>
        <Menu
          open={menuOpen}
          onClose={() => { setMenuOpen(false) }}
          align="end"
          portal
          items={menuItems}
          onSelect={id => {
            setMenuOpen(false)
            if (id === 'copy') void actions.onCopy(record)
            else if (id === 'edit') setEditing(true)
            else if (id === 'panel') actions.onOpenPanelTab(record)
            else if (id === 'delete') void actions.onRemove(record)
          }}
          anchor={(
            <Button
              variant="ghost"
              size="sm"
              className="dshhl-icon-button"
              aria-label={t('nav.more')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              icon={<IconEllipsisOutlineRegular size={15} />}
              onClick={() => { setMenuOpen(value => !value) }}
            />
          )}
        />
      </div>
    </article>
  )
}

/**
 * Memoised row: a page-level clock tick or unrelated group change must not
 * re-render every row. Equality deliberately ignores `now`; relative-time labels
 * refresh when the row's own props change (the page clock remains a coarse
 * fallback for newly rendered rows).
 */
export const RecordRow = memo(RecordRowImpl, (previous: RecordRowProps, next: RecordRowProps) => (
  previous.record === next.record
  && previous.unanchored === next.unanchored
  && previous.archived === next.archived
  && previous.unavailable === next.unavailable
  && previous.actions === next.actions
  && previous.t === next.t
))
