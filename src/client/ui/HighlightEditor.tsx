/**
 * The shared annotation editor for a *new* highlight.
 *
 * Deliberately compact and progressive: the colour row and a tag field are
 * always visible, the note appears only when asked for, and the footer holds a
 * single primary decision. Field captions are omitted — placeholders and
 * accessible labels carry the meaning, which keeps the popover small enough to
 * sit beside the selection without covering it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { EditorFields } from './EditorFields'

import { MAX_NOTE_CHARS, PALETTE_SIZE } from '../../shared/constants'
import type { HighlightDraft } from '../data/actions'
import type { Intent } from '../../shared/provenance'
import { trapFocus } from '../selection/focus'

/** Props of the editor. */
export interface HighlightEditorProps {
  /** Namespace-bound translate function. */
  readonly t: (key: string, params?: Record<string, string | number>) => string
  /** Draft to start from. */
  readonly initial: HighlightDraft
  /** Heading copy key (dialog accessible name). */
  readonly titleKey: 'editor.title' | 'editor.title.message'
  /** Quote shown above the fields. */
  readonly quote: string
  /** Suggestions for the tag field, derived from existing records. */
  readonly tagSuggestions: readonly string[]
  /** Persist the draft. */
  readonly onSave: (draft: HighlightDraft) => void
  /** Dismiss without saving. */
  readonly onCancel: () => void
}

/**
 * Render the compact annotation editor.
 * @param props - initial draft, copy, and callbacks.
 * @returns the editor element.
 */
export function HighlightEditor({ t, initial, titleKey, quote, tagSuggestions, onSave, onCancel }: HighlightEditorProps): ReactNode {
  const [colorId, setColorId] = useState(initial.colorId)
  const [tags, setTags] = useState<string[]>([...initial.tags])
  const [note, setNote] = useState(initial.note ?? '')
  const [intent, setIntent] = useState<Intent>(initial.intent ?? 'note')
  const [noteOpen, setNoteOpen] = useState((initial.note ?? '') !== '')

  const palette = useMemo(() => Array.from({ length: PALETTE_SIZE }, (_, index) => index + 1), [])
  const suggestions = useMemo(
    () => tagSuggestions.filter(suggestion => !tags.includes(suggestion)).slice(0, 3),
    [tagSuggestions, tags],
  )
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** Element that had focus before the editor mounted, for focus return. */
  const restoreRef = useRef<HTMLElement | null>(
    typeof document === 'undefined' || !(document.activeElement instanceof HTMLElement)
      ? null
      : document.activeElement,
  )
  /** Latest cancel handler, read from the trap without re-registering it. */
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  // One keyboard contract for the popover: move focus in, keep Tab inside the
  // editor (it is the top layer while open), Escape dismisses one layer, and
  // closing hands focus back to the control that opened it.
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    if (!root.contains(document.activeElement)) {
      root.querySelector<HTMLElement>('button, input, textarea')?.focus()
    }
    const dispose = trapFocus(root, { onEscape: () => { cancelRef.current() } })
    return () => {
      dispose()
      const restore = restoreRef.current
      if (restore !== null && restore !== document.body && restore.isConnected) restore.focus()
    }
  }, [])

  /** Commit one tag from the input. */

  return (
    <div className="dshhl-popover" role="dialog" aria-label={t(titleKey)} ref={rootRef}>
      <p className="dshhl-editor__quote" title={quote}>{quote}</p>

      <EditorFields
        t={t as unknown as (key: string) => string}
        colorId={colorId}
        colorIds={palette}
        onColor={slot => { setColorId(slot) }}
        colorRole="radio"
        colorLabel={slot => `${t('action.highlight')} ${String(slot)}`}
        showLabels={false}
        tags={tags}
        onAddTag={tag => { setTags([...tags, tag]) }}
        onRemoveTag={tag => { setTags(tags.filter(existing => existing !== tag)) }}
        tagSuggestions={suggestions}
        showSuggestion
        commitOnBlur
        tagInputLabelKey="editor.tags"
        renderNote={false}
        note={note}
        onNote={setNote}
        intent={intent}
        onIntent={setIntent}
        classes={{ tagInput: 'dshhl-card__taginput' }}
      />

      {noteOpen ? (
        <textarea
          className="dshhl-note-input"
          maxLength={MAX_NOTE_CHARS}
          value={note}
          rows={2}
          autoFocus
          placeholder={t('action.notePlaceholder')}
          aria-label={t('action.note')}
          onChange={event => { setNote(event.target.value) }}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="dshhl-card__addnote"
          onClick={() => { setNoteOpen(true) }}
        >
          + {t('editor.addNote')}
        </Button>
      )}

      <div className="dshhl-editor__actions">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('action.cancel')}</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            onSave({
              colorId,
              tags,
              note: note.trim() === '' ? undefined : note.trim(),
              starred: initial.starred,
              intent,
            })
          }}
        >
          {t('action.save')}
        </Button>
      </div>
    </div>
  )
}
