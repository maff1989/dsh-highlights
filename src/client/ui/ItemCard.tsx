/**
 * The item card (S3): what opens when the reader clicks painted text.
 *
 * Deliberately calmer than a form: one colour row, an inline quote, a tag row,
 * a note, and two footer decisions (Save, or a More menu with the occasional
 * actions). Everything frequent is one click; everything else hides behind More
 * so the card does not read as a dialog full of buttons.
 *
 * The card is the editor *and* the conflict surface: a save/remove that loses
 * the Host's compare-and-set race keeps the draft and shows an inline prompt
 * instead of silently closing over the other window's version.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  IconCloseOutlineRegular,
  IconEllipsisOutlineRegular,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'

import { MAX_TAGS, PALETTE_SIZE } from '../../shared/constants'
import type { HighlightRecord } from '../../shared/schema'
import type {
  HighlightDraft,
  InsertOutcome,
  InsertTarget,
  RevealOutcome,
  WriteOutcome,
} from '../data/actions'
import { ConflictBar } from './ConflictBar'
import { EditorFields } from './EditorFields'
import type { Intent } from '../../shared/provenance'
import { UndoBar } from './UndoBar'
import { disableUndoPrompt, undoPromptEnabled } from './undoPrompt'

/** Props of the card. */
export interface ItemCardProps {
  /** True while the anchored range is scrolled out of the transcript. */
  readonly hidden?: boolean
  /** Namespace-bound translate function. */
  readonly t: (key: string, params?: Record<string, string | number>) => string
  /** The record being edited. */
  readonly record: HighlightRecord
  /** Tags already in use, for suggestions. */
  readonly tagSuggestions: readonly string[]
  /**
   * Persist the edited presentation fields.
   * @param draft - the card's current draft.
   * @param expectedVersion - explicit CAS version for the overwrite path.
   * @returns the Host's write outcome.
   */
  readonly onSave: (draft: HighlightDraft, expectedVersion?: number) => Promise<WriteOutcome>
  /** Close without saving. */
  readonly onClose: () => void
  /** Reveal the anchored text. */
  readonly onReveal: () => Promise<RevealOutcome>
  /** Insert the quote into a composer ('current' or a new Session). */
  readonly onInsert: (target: InsertTarget) => Promise<InsertOutcome>
  /** Copy the quote with its citation; true only when the copy happened. */
  readonly onCopy: () => Promise<boolean>
  /** Delete (soft); the Host outcome decides whether the card may close. */
  readonly onDelete: () => Promise<WriteOutcome>
  /** Star/unstar immediately (policy A: no draft-only star). */
  readonly onStar: (starred: boolean) => Promise<WriteOutcome>
  /** Undo a confirmed delete while the card's undo window is open. */
  readonly onRestore: () => Promise<WriteOutcome>
}

/** One inline decision requested by the Host's CAS answer. */
type ConflictMode = 'save' | 'delete'

/**
 * Render the card.
 * @param props - record, copy, and the callbacks the card may invoke.
 * @returns the card element.
 */
export function ItemCard({ t, record, tagSuggestions, onSave, onClose, onReveal, onInsert, onCopy, onDelete, onStar, onRestore, hidden = false }: ItemCardProps): ReactNode {
  const [colorId, setColorId] = useState<number>(record.colorId)
  const [tags, setTags] = useState<string[]>([...record.tags])
  const [note, setNote] = useState(record.note ?? '')
  const [starred, setStarred] = useState(record.starred)
  const [intent, setIntent] = useState<Intent>(record.intent ?? 'note')
  const [menuOpen, setMenuOpen] = useState(false)
  const [conflict, setConflict] = useState<HighlightRecord | undefined>(undefined)
  const [conflictMode, setConflictMode] = useState<ConflictMode>('save')
  const [busy, setBusy] = useState(false)
  /** True after a confirmed delete: the card shows Undo instead of the editor. */
  const [undoOpen, setUndoOpen] = useState(false)
  const [status, setStatus] = useState<{ readonly text: string; readonly warn: boolean } | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** Element that had focus before the card opened, for focus return. */
  const restoreRef = useRef<HTMLElement | null>(
    typeof document === 'undefined' || !(document.activeElement instanceof HTMLElement)
      ? null
      : document.activeElement,
  )

  const palette = useMemo(() => Array.from({ length: PALETTE_SIZE }, (_, index) => index + 1), [])
  const suggestions = useMemo(
    () => tagSuggestions.filter(suggestion => !tags.includes(suggestion)).slice(0, 4),
    [tagSuggestions, tags],
  )

  // Minimal keyboard contract: move focus into the card and hand it back on
  // close. A full focus trap stays P1; this keeps the card reachable and stops
  // focus falling to <body> after the pointer that opened it.
  useEffect(() => {
    const root = rootRef.current
    const restore = restoreRef.current
    if (root !== null && !root.contains(document.activeElement)) {
      root.querySelector<HTMLElement>('button, input, textarea')?.focus()
    }
    return () => {
      if (restore !== null && restore !== document.body && restore.isConnected) restore.focus()
    }
  }, [])

  /** Replace the local draft with the stored record (Reload, or after a write). */
  const applyRecord = (live: HighlightRecord): void => {
    setColorId(live.colorId)
    setTags([...live.tags])
    setNote(live.note ?? '')
    setStarred(live.starred)
    setIntent(live.intent ?? 'note')
  }

  /** Current draft in the shape the action face accepts. */
  const draftOf = (): HighlightDraft => ({
    colorId,
    tags: [...tags],
    note: note.trim() === '' ? undefined : note.trim(),
    starred,
    intent,
  })

  /** Show one transient line under the footer. */
  const showStatus = (text: string, warn = false): void => {
    setStatus({ text, warn })
  }

  /** Commit one tag from the input. */

  /** Save the draft; keep the card open and prompt on a conflict. */
  const save = async (expectedVersion?: number): Promise<void> => {
    if (busy) return
    setBusy(true)
    setConflict(undefined)
    try {
      const outcome = await onSave(draftOf(), expectedVersion)
      if (outcome.status === 'written') {
        onClose()
        return
      }
      if (outcome.status === 'conflict') {
        setConflict(outcome.record)
        setConflictMode('save')
        return
      }
      showStatus(t('error.generic'), true)
    } finally {
      setBusy(false)
    }
  }

  /** Soft-delete; a refused delete leaves the card (and the record) in place. */
  const remove = async (): Promise<void> => {
    if (busy) return
    setMenuOpen(false)
    setBusy(true)
    setConflict(undefined)
    try {
      const outcome = await onDelete()
      if (outcome.status === 'written') {
        if (undoPromptEnabled()) setUndoOpen(true)
        else onClose()
        return
      }
      if (outcome.status === 'conflict') {
        setConflict(outcome.record)
        setConflictMode('delete')
        return
      }
      showStatus(t('error.generic'), true)
    } finally {
      setBusy(false)
    }
  }

  /** Persist a star toggle immediately (policy A). */
  const toggleStar = async (): Promise<void> => {
    if (busy || undoOpen) return
    const next = !starred
    setStarred(next)
    setBusy(true)
    try {
      const outcome = await onStar(next)
      if (outcome.status === 'written') {
        setStarred(outcome.record.starred)
        return
      }
      // Conflict or failure: show the Host value (or roll back) and a status.
      setStarred(outcome.status === 'conflict' ? outcome.record.starred : !next)
      showStatus(outcome.status === 'conflict' ? t('conflict.title') : t('error.generic'), true)
    } finally {
      setBusy(false)
    }
  }

  /** Undo the confirmed delete inside the card. */
  const undo = async (): Promise<void> => {
    setBusy(true)
    try {
      const outcome = await onRestore()
      if (outcome.status === 'written') {
        setUndoOpen(false)
        onClose()
        return
      }
      showStatus(t('error.generic'), true)
    } finally {
      setBusy(false)
    }
  }

  /** Run one of the More-menu actions that report a truthy failure. */
  const runMenuAction = async (action: () => Promise<boolean>, failedCopy: string): Promise<void> => {
    if (busy) return
    setMenuOpen(false)
    setBusy(true)
    setStatus(undefined)
    try {
      if (await action()) onClose()
      else showStatus(failedCopy, true)
    } finally {
      setBusy(false)
    }
  }

  /** Insert the quote and surface queued/failed outcomes. */
  const insert = async (target: InsertTarget): Promise<void> => {
    if (busy) return
    setMenuOpen(false)
    setBusy(true)
    setStatus(undefined)
    try {
      const outcome = await onInsert(target)
      if (outcome === 'inserted') {
        onClose()
        return
      }
      showStatus(t(outcome === 'queued' ? 'insert.queued' : 'insert.failed'), outcome === 'failed')
    } finally {
      setBusy(false)
    }
  }

  // Do not leave a portalled menu floating when the card itself is hidden.
  useEffect(() => {
    if (hidden) setMenuOpen(false)
  }, [hidden])

  /** Reveal the anchor; the fallback copy when the Host cannot find it. */
  const reveal = async (): Promise<void> => {
    if (busy) return
    setMenuOpen(false)
    setBusy(true)
    setStatus(undefined)
    try {
      if (await onReveal() === 'not-found') showStatus(t('reveal.failed'), true)
      else onClose()
    } finally {
      setBusy(false)
    }
  }

  const menuItems: MenuEntry[] = [
    { id: 'reveal', label: t('action.reveal') },
    { id: 'insertCurrent', label: t('action.insertCurrent') },
    { id: 'insertNew', label: t('action.insertNew') },
    { type: 'separator', id: 'separator' },
    { id: 'copy', label: t('action.copy') },
    { id: 'delete', label: t('action.delete'), danger: true },
  ]

  return (
    <div
      className={`dshhl-card${undoOpen ? ' dshhl-card--undo' : ''}`}
      role="dialog"
      aria-label={t('action.edit')}
      ref={rootRef}
      {...{ 'data-dshhl-card': '' }}
      {...(menuOpen ? { 'data-dshhl-menu-open': '' } : {})}
    >
      {undoOpen && (
        <UndoBar
          t={t}
          onUndo={() => { void undo() }}
          onDismiss={onClose}
          onDontAsk={() => { disableUndoPrompt(); onClose() }}
        />
      )}
      <div className="dshhl-card__header">
        <div className="dshhl-swatches" role="radiogroup" aria-label={t('editor.color')}>
          {palette.map(slot => (
            <button
              key={slot}
              type="button"
              role="radio"
              aria-checked={colorId === slot}
              aria-label={`${t('editor.color')} ${String(slot)}`}
              className={`dshhl-swatch${colorId === slot ? ' dshhl-swatch--selected' : ''}`}
              style={{ background: `var(--dsh-hl-${String(slot)})` }}
              onClick={() => { setColorId(slot) }}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="dshhl-icon-button"
          aria-pressed={starred}
          title={starred ? t('action.unstar') : t('action.star')}
          aria-label={starred ? t('action.unstar') : t('action.star')}
          icon={<span aria-hidden="true">★</span>}
          onClick={() => { void toggleStar() }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="dshhl-icon-button"
          title={t('action.cancel')}
          aria-label={t('action.cancel')}
          icon={<IconCloseOutlineRegular size={15} />}
          onClick={onClose}
        />
      </div>

      <blockquote className="dshhl-card__quote">{record.anchor.quote}</blockquote>

      <EditorFields
        t={t}
        showColors={false}
        showLabels={false}
        colorId={colorId}
        colorIds={[]}
        onColor={() => undefined}
        tags={tags}
        onAddTag={tag => { if (tags.length < MAX_TAGS) setTags([...tags, tag]) }}
        onRemoveTag={tag => { setTags(tags.filter(existing => existing !== tag)) }}
        tagSuggestions={suggestions}
        showSuggestion
        commitOnBlur
        note={note}
        onNote={setNote}
        noteRows={3}
        intent={intent}
        onIntent={setIntent}
        classes={{ tagInput: 'dshhl-card__taginput', note: 'dshhl-note-input' }}
      />

      {conflict !== undefined && (
        <ConflictBar
          t={t}
          busy={busy}
          onReload={() => {
            applyRecord(conflict)
            setConflict(undefined)
          }}
          {...(conflictMode === 'save'
            ? { onOverwrite: () => { void save(conflict.version) } }
            : {})}
        />
      )}

      {status !== undefined && (
        <p className={`dshhl-status${status.warn ? ' dshhl-status--warn' : ''}`} role="status">
          {status.text}
        </p>
      )}

      <div className="dshhl-card__footer">
        <Menu
          open={menuOpen}
          onClose={() => { setMenuOpen(false) }}
          align="end"
          side="top"
          portal
          listClassName="dshhl-card__menuList"
          items={menuItems}
          onSelect={id => {
            setMenuOpen(false)
            if (id === 'reveal') void reveal()
            else if (id === 'insertCurrent') void insert({ kind: 'current' })
            else if (id === 'insertNew') void insert({ kind: 'new' })
            else if (id === 'copy') void runMenuAction(onCopy, t('action.copyFailed'))
            else if (id === 'delete') void remove()
          }}
          anchor={(
            <Button
              variant="ghost"
              size="sm"
              className="dshhl-icon-button"
              aria-label={t('status.menu')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={busy}
              icon={<IconEllipsisOutlineRegular size={15} />}
              onClick={() => { setMenuOpen(value => !value) }}
            />
          )}
        />
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => { void save() }}
        >
          {t('action.saveChanges')}
        </Button>
      </div>
    </div>
  )
}
