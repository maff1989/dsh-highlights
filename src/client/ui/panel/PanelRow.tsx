/**
 * One row of the session panel: the highlight, its presentation, and its actions.
 *
 * Density follows the native list-row convention: two inline actions (the two
 * an annotation is *for* — show it in the conversation and insert its quote into
 * this session) and one `⋯` menu holding everything else (insert into a new
 * session, copy, star, edit, delete). The row owns only its own edit draft; every
 * write leaves through a callback into the shared action face, so the panel
 * stays a projection of the store. A save that loses the Host's
 * compare-and-set race keeps the draft and shows an inline conflict prompt
 * (Reload / Overwrite) instead of closing over it.
 *
 * The metadata line names the colour, a quiet author chip when the agent wrote
 * the annotation, the processing cursor (new → kept → compiled), and a relative
 * date — never the transcript ordinals the anchor uses internally. The reader's
 * own rows carry no author chip.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  IconAppsAddOutlineRegular,
  IconCopyOutlineRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPaperPlaneOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconRightUpOutlineRegular,
  IconTrashOutlineRegular,
  Menu,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

import type {
  HighlightRecord,
  InsertOutcome,
  InsertTarget,
  RevealOutcome,
  UpdatePatch,
  WriteOutcome,
} from '../../data/actions'
import type { ColorId } from '../../../shared/schema'
import type { RecordState } from '../../../shared/provenance'
import { ConflictBar } from '../ConflictBar'
import { EditorFields } from '../EditorFields'
import { StateChip } from '../page/StateChip'
import { PANEL_COLOR_IDS } from './panelFilter'
import { authorLabelOf, colorLabel, formatRelativeTime } from '../page/grouping'

/** How long a transient action line stays on screen, in milliseconds. */
const STATUS_MS = 4000

/** The row's editable copy of a record's presentation fields. */
interface RowDraft {
  /** Selected palette slot. */
  readonly colorId: ColorId
  /** Tag list as ordered chips. */
  readonly tags: readonly string[]
  /** Note text; empty string means "no note yet". */
  readonly note: string
  /** Star state. */
  readonly starred: boolean
}

/** Props the panel hands one row. */
export interface PanelRowProps {
  /** The record this row draws. */
  readonly record: HighlightRecord
  /** Namespace-bound copy. */
  readonly t: TranslateNS<'highlights'>
  /** True while this row is the navigation target's flash. */
  readonly flash: boolean
  /** True when the anchor no longer resolves in the transcript. */
  readonly stale: boolean
  /** True when the owning session is archived: reveal is disabled. */
  readonly archived: boolean
  /** True when the owning session no longer exists in the catalog. */
  readonly unavailable: boolean
  /** Render-time clock for the relative-time label. */
  readonly now: number
  /** Registers/unregisters the row element so the panel can scroll to it. */
  readonly registerNode: (id: string, node: HTMLLIElement | null) => void
  /** Reveal the anchored text in the owning session. */
  readonly onReveal: (record: HighlightRecord) => Promise<RevealOutcome>
  /** Insert the quote into this session's composer, or a new Session. */
  readonly onInsert: (record: HighlightRecord, target: InsertTarget) => Promise<InsertOutcome>
  /** Copy the quote with its citation; true only on a real copy. */
  readonly onCopy: (record: HighlightRecord) => Promise<boolean>
  /** Soft-delete the record; the panel owns the outcome and the Undo decision. */
  readonly onDelete: (record: HighlightRecord) => Promise<WriteOutcome>
  /** Patch presentation fields; `expectedVersion` drives the overwrite path. */
  readonly onUpdate: (id: string, patch: UpdatePatch, expectedVersion?: number) => Promise<WriteOutcome>
  /** Advance the processing cursor; the row reports a failed write inline. */
  readonly onCursor: (record: HighlightRecord, state: RecordState) => Promise<WriteOutcome>
}

/**
 * Build the editable draft of a record.
 * @param record - record to edit.
 * @returns the presentation fields as one draft value.
 */
function draftOf(record: HighlightRecord): RowDraft {
  return { colorId: record.colorId, tags: [...record.tags], note: record.note ?? '', starred: record.starred }
}

/** One transient line shown under the row's actions. */
interface RowStatus {
  readonly text: string
  readonly warn: boolean
}

/**
 * Draw one highlight: colour bar, quote, note, metadata, tags, badges and
 * actions, plus the inline presentation editor when it is open.
 * @param props - the row's record, copy, and callbacks.
 * @returns the list item.
 */
export function PanelRow(props: PanelRowProps): ReactNode {
  const { record, t, flash, stale, archived, unavailable, now, registerNode, onReveal, onInsert, onCopy, onDelete, onUpdate, onCursor } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => draftOf(record))
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<HighlightRecord | undefined>(undefined)
  const [status, setStatus] = useState<RowStatus | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)

  const setNode = useCallback(
    (node: HTMLLIElement | null) => {
      registerNode(record.id, node)
    },
    [registerNode, record.id],
  )

  const startEdit = (): void => {
    setDraft(draftOf(record))
    setConflict(undefined)
    setEditing(true)
  }

  const patchOf = (source: RowDraft): UpdatePatch => {
    const note = source.note.trim()
    return {
      colorId: source.colorId,
      tags: [...source.tags],
      note: note === '' ? null : note,
      starred: source.starred,
    }
  }

  /** Save the row's draft, keeping it open and prompting if the Host refused it. */
  const saveEdit = async (expectedVersion?: number): Promise<void> => {
    if (busy) return
    setBusy(true)
    setStatus(undefined)
    try {
      const outcome = expectedVersion === undefined
        ? await onUpdate(record.id, patchOf(draft))
        : await onUpdate(record.id, patchOf(draft), expectedVersion)
      if (outcome.status === 'written') {
        setConflict(undefined)
        setEditing(false)
        return
      }
      if (outcome.status === 'conflict') {
        setConflict(outcome.record)
        return
      }
      setStatus({ text: t('error.generic'), warn: true })
    } finally {
      setBusy(false)
    }
  }

  /** Run one action and report the failure copy it produces. */
  const runAction = async (action: () => Promise<boolean>, failure: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    setStatus(undefined)
    try {
      if (!await action()) setStatus({ text: failure, warn: true })
    } finally {
      setBusy(false)
    }
  }

  /** Copy the quote, reporting the truthful outcome. */
  const copy = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setStatus(undefined)
    try {
      const copied = await onCopy(record)
      setStatus(copied
        ? { text: t('action.copied'), warn: false }
        : { text: t('action.copyFailed'), warn: true })
    } finally {
      setBusy(false)
    }
  }

  /** Insert the quote, reporting queued/failed outcomes. */
  const insert = async (target: InsertTarget): Promise<void> => {
    if (busy) return
    setBusy(true)
    setStatus(undefined)
    try {
      const outcome = await onInsert(record, target)
      if (outcome === 'queued') setStatus({ text: t('insert.queued'), warn: false })
      else if (outcome === 'failed') setStatus({ text: t('insert.failed'), warn: true })
    } finally {
      setBusy(false)
    }
  }

  /** Quick star toggle; a concurrent change is reported rather than silently lost. */
  const toggleStar = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const outcome = await onUpdate(record.id, { starred: !record.starred })
      if (outcome.status !== 'written') setStatus({ text: t('conflict.title'), warn: true })
    } finally {
      setBusy(false)
    }
  }

  // Retire the transient action line so a stale "queued"/"copied" cannot linger.
  useEffect(() => {
    if (status === undefined) return
    const timer = window.setTimeout(() => { setStatus(undefined) }, STATUS_MS)
    return () => { window.clearTimeout(timer) }
  }, [status])


  const colorVar = `var(--dsh-hl-${String(record.colorId)})`
  const author = authorLabelOf(t, record)
  const revealBlocked = archived || unavailable
  const revealTitle = archived ? t('action.revealArchived') : t('action.revealUnavailable')

  /** Everything the row does not need one click away lives behind `⋯`. */
  const menuItems: MenuEntry[] = [
    { id: 'insertNew', label: t('action.insertNew'), icon: <IconAppsAddOutlineRegular size={14} /> },
    { id: 'copy', label: t('action.copy'), icon: <IconCopyOutlineRegular size={14} /> },
    {
      id: 'star',
      label: record.starred ? t('action.unstar') : t('action.star'),
      icon: record.starred ? <IconPinFillRegular size={14} /> : <IconPinOutlineRegular size={14} />,
    },
    { type: 'separator', id: 'separator' },
    { id: 'edit', label: t('action.edit'), icon: <IconEditOutlineRegular size={14} /> },
    { type: 'separator', id: 'separator-2' },
    { id: 'delete', label: t('action.delete'), icon: <IconTrashOutlineRegular size={14} />, danger: true },
  ]

  return (
    <li ref={setNode} className={flash ? 'dshhl-panel__row dshhl-panel__row--flash' : 'dshhl-panel__row'}>
      <span className="dshhl-panel__bar" style={{ backgroundColor: colorVar }} aria-hidden="true" />
      <div className="dshhl-panel__main">
        <p className="dshhl-panel__quote">{record.anchor.quote}</p>
        {record.note !== undefined && record.note !== '' && <p className="dshhl-panel__note">{record.note}</p>}

        <div className="dshhl-panel__meta">
          <span className="dshhl-srOnly">{colorLabel(t, record.colorId)}</span>
          <span className="dshhl-panel__dot" style={{ backgroundColor: colorVar }} aria-hidden="true" />
          {author !== undefined && <span className="dshhl-metaChip">{author}</span>}
          <StateChip
            t={t}
            record={record}
            write={next => onCursor(record, next)}
            onFailure={() => { setStatus({ text: t('cursor.failed'), warn: true }) }}
            disabled={busy}
          />
          <time
            className="dshhl-panel__time"
            dateTime={new Date(record.updatedAt).toISOString()}
            title={new Date(record.updatedAt).toLocaleString()}
          >
            {formatRelativeTime(record.updatedAt, now, t)}
          </time>
          {archived && <Tag tone="neutral">{t('badge.archived')}</Tag>}
          {unavailable && <Tag tone="warning">{t('badge.unavailable')}</Tag>}
          {stale && <Tag tone="warning">{t('badge.orphaned')}</Tag>}
        </div>

        {record.tags.length > 0 && (
          <span className="dshhl-panel__tags">
            {record.tags.map(tag => (
              <Tag key={tag} tone="outline">{tag}</Tag>
            ))}
          </span>
        )}

        <div className="dshhl-panel__actions">
          <Button
            variant="ghost"
            size="sm"
            className="dshhl-icon-button"
            aria-label={t('action.reveal')}
            title={revealBlocked ? revealTitle : t('action.reveal')}
            disabled={busy || revealBlocked}
            icon={<IconRightUpOutlineRegular size={15} />}
            onClick={() => { void runAction(async () => await onReveal(record) === 'revealed', t('reveal.failed')) }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="dshhl-icon-button"
            aria-label={t('action.insertCurrent')}
            title={t('action.insertCurrent')}
            disabled={busy}
            icon={<IconPaperPlaneOutlineRegular size={15} />}
            onClick={() => { void insert({ kind: 'current' }) }}
          />
          <Menu
            open={menuOpen}
            onClose={() => { setMenuOpen(false) }}
            align="end"
            portal
            items={menuItems}
            onSelect={id => {
              setMenuOpen(false)
              if (id === 'insertNew') void insert({ kind: 'new' })
              else if (id === 'copy') void copy()
              else if (id === 'star') void toggleStar()
              else if (id === 'edit') startEdit()
              else if (id === 'delete') void onDelete(record)
            }}
            anchor={(
              <Button
                variant="ghost"
                size="sm"
                className="dshhl-icon-button"
                aria-label={t('status.menu')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                icon={<IconEllipsisOutlineRegular size={15} />}
                onClick={() => { setMenuOpen(value => !value) }}
              />
            )}
          />
        </div>

        {status !== undefined && (
          <p className={`dshhl-status${status.warn ? ' dshhl-status--warn' : ''}`} role="status">{status.text}</p>
        )}

        {editing && (
          <div className="dshhl-panel__editor">
            <EditorFields
              t={t as unknown as (key: string) => string}
              colorId={draft.colorId}
              colorIds={PANEL_COLOR_IDS}
              colorLabel={id => colorLabel(t, id as ColorId)}
              onColor={colorId => { setDraft(current => ({ ...current, colorId: colorId as ColorId })) }}
              tags={draft.tags}
              onAddTag={tag => { setDraft(current => ({ ...current, tags: [...current.tags, tag] })) }}
              onRemoveTag={tag => { setDraft(current => ({ ...current, tags: current.tags.filter(item => item !== tag) })) }}
              commitOnBlur
              note={draft.note}
              onNote={note => { setDraft(current => ({ ...current, note })) }}
              classes={{
                row: 'dshhl-panel__editorRow',
                label: 'dshhl-panel__editorLabel',
                swatch: 'dshhl-panel__swatch',
                tagInput: 'dshhl-panel__tagInput',
              }}
            />
            {conflict !== undefined && (
              <ConflictBar
                t={t}
                busy={busy}
                onReload={() => {
                  setDraft(draftOf(conflict))
                  setConflict(undefined)
                }}
                onOverwrite={() => { void saveEdit(conflict.version) }}
              />
            )}
            <div className="dshhl-panel__editorActions">
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false) }}>
                {t('action.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => { void saveEdit() }}
              >
                {/* Editing an existing highlight: it is changed, not first saved. */}
                {t('action.saveChanges')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  )
}
