/**
 * Shared editor fields for the presentation model (colour, tags, note).
 *
 * One implementation of the field grammar: the page row, the panel row and the
 * item card all render these fields, so labels, cap enforcement, tag
 * normalisation and the Enter-to-add behaviour cannot drift between surfaces.
 * Each surface supplies its own class names and keeps its own save/cancel and
 * conflict handling.
 */
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Pill } from '@deepseek-ai/dsh-client-ui-primitives'

import { INTENT_VALUES, type Intent } from '../../shared/provenance'
import { Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

import { MAX_NOTE_CHARS, MAX_TAGS, MAX_TAG_CHARS } from '../../shared/constants'

/** Class-name slots a surface can fill to keep its own styling. */
export interface EditorFieldsClasses {
  /** Colour/tag row. */
  readonly row?: string
  /** Field caption. */
  readonly label?: string
  /** One colour swatch. */
  readonly swatch?: string
  /** Tag chip list container. */
  readonly tags?: string
  /** Tag text input. */
  readonly tagInput?: string
  /** Note textarea. */
  readonly note?: string
}

/** Props of the shared editor fields. */
export interface EditorFieldsProps {
  /** Namespace-bound translate function. */
  readonly t: (key: string) => string
  /** Selected palette slot. */
  readonly colorId: number
  /** Select one palette slot. */
  readonly onColor: (colorId: number) => void
  /** Palette slots to render. */
  readonly colorIds: readonly number[]
  /** Optional per-slot accessible label (page rows use colour names). */
  readonly colorLabel?: (colorId: number) => string
  /** render colour swatches (default true). */
  readonly showColors?: boolean
  /** Use radio semantics for the swatches (card default) or a button group. */
  readonly colorRole?: 'group' | 'radio'
  /** Show the field captions next to each row. */
  readonly showLabels?: boolean
  /** Current tags. */
  readonly tags: readonly string[]
  /** Add one normalised tag. */
  readonly onAddTag: (tag: string) => void
  /** Remove one tag. */
  readonly onRemoveTag: (tag: string) => void
  /** Suggestions for the tag field. */
  readonly tagSuggestions?: readonly string[]
  /** Show the first suggestion as a one-click chip. */
  readonly showSuggestion?: boolean
  /** Commit a pending tag when the input loses focus (card default). */
  readonly commitOnBlur?: boolean
  /** Current note text. */
  readonly note: string
  /** Replace the note text. */
  readonly onNote: (note: string) => void
  /** Accessible label key for the note field. */
  readonly noteLabelKey?: 'action.note' | 'editor.note'
  /** Visible note textarea rows. */
  readonly noteRows?: number
  /** Render the note field (the popover renders its own toggleable note). */
  readonly renderNote?: boolean
  /** Accessible label key for the tag input (popover keeps `editor.tags`). */
  readonly tagInputLabelKey?: 'action.addTag' | 'editor.tags'
  /** Current speech act; omitted from the surface when `onIntent` is absent. */
  readonly intent?: Intent
  /** Replace the speech act. Providing this renders the picker. */
  readonly onIntent?: (intent: Intent) => void
  /** Per-surface class names. */
  readonly classes?: EditorFieldsClasses
}

/** Strip decoration, lowercase, and cap one tag draft. */
function normaliseTag(input: string): string {
  return input.replace(/^#+/u, '').trim().toLowerCase().slice(0, MAX_TAG_CHARS)
}

/**
 * Render the shared presentation fields.
 * @param props - current values, callbacks, and surface class names.
 * @returns the fields element.
 */
export function EditorFields(props: EditorFieldsProps): ReactNode {
  const {
    t, colorId, onColor, colorIds, colorLabel, showColors = true, colorRole = 'group', showLabels = true,
    tags, onAddTag, onRemoveTag, tagSuggestions = [], showSuggestion = false, commitOnBlur = false,
    note, onNote, noteLabelKey = 'action.note', noteRows = 2, renderNote = true, tagInputLabelKey = 'action.addTag', classes = {},
    intent, onIntent,
  } = props
  const [tagDraft, setTagDraft] = useState('')
  const noteId = useId()

  /** Commit the pending tag through the shared normaliser. */
  const commitTag = (): void => {
    const next = normaliseTag(tagDraft)
    setTagDraft('')
    if (next === '' || tags.includes(next) || tags.length >= MAX_TAGS) return
    onAddTag(next)
  }

  return (
    <>
      {showColors && (
        <div
          className={classes.row ?? 'dshhl-editor__row'}
          role={colorRole === 'radio' ? 'radiogroup' : 'group'}
          aria-label={t('editor.color')}
        >
          {showLabels && <span className={classes.label ?? 'dshhl-editor__label'}>{t('editor.color')}</span>}
          {colorIds.map(slot => (
            <button
              key={slot}
              type="button"
              role={colorRole === 'radio' ? 'radio' : undefined}
              {...(colorRole === 'radio' ? { 'aria-checked': colorId === slot } : { 'aria-pressed': colorId === slot })}
              aria-label={colorLabel === undefined ? `${t('editor.color')} ${String(slot)}` : colorLabel(slot)}
              className={`${classes.swatch ?? 'dshhl-swatch'}${colorId === slot ? ' dshhl-swatch--selected' : ''}`}
              style={{ background: `var(--dsh-hl-${String(slot)})` }}
              onClick={() => { onColor(slot) }}
            />
          ))}
        </div>
      )}

      {onIntent !== undefined && (
        <div
          className={`${classes.row ?? 'dshhl-editor__row'} dshhl-editor__row--intent`}
          role="group"
          aria-label={t('editor.intent')}
          title={t(`intent.${intent ?? 'note'}.hint`)}
        >
          {showLabels && <span className={classes.label ?? 'dshhl-editor__label'}>{t('editor.intent')}</span>}
          {INTENT_VALUES.map(value => (
            <Pill
              key={value}
              active={(intent ?? 'note') === value}
              aria-pressed={(intent ?? 'note') === value}
              title={t(`intent.${value}.hint`)}
              onClick={() => { onIntent(value) }}
            >
              {t(`intent.${value}`)}
            </Pill>
          ))}
        </div>
      )}

      <div
        className={classes.row ?? 'dshhl-editor__row'}
        {...(showLabels ? { role: 'group', 'aria-label': t('editor.tags') } : {})}
      >
        {showLabels && <span className={classes.label ?? 'dshhl-editor__label'}>{t('editor.tags')}</span>}
        <div className={classes.tags ?? 'dshhl-editor__tags'}>
          {tags.map(tag => (
            <span key={tag} className="dshhl-tagChip">
              <Tag tone="outline">{tag}</Tag>
              <button
                type="button"
                className="dshhl-tagRemove"
                aria-label={`${t('action.removeTag')} ${tag}`}
                onClick={() => { onRemoveTag(tag) }}
              >
                <IconCloseOutlineRegular size={10} />
              </button>
            </span>
          ))}
          {tags.length < MAX_TAGS && (
            <Input
              type="text"
              className={classes.tagInput ?? 'dshhl-editor__tagInput'}
              maxLength={MAX_TAG_CHARS}
              value={tagDraft}
              placeholder={t('editor.tags.placeholder')}
              aria-label={t(tagInputLabelKey)}
              onChange={event => { setTagDraft(event.target.value) }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitTag()
                }
              }}
              {...(commitOnBlur ? { onBlur: commitTag } : {})}
            />
          )}
          {showSuggestion && tagSuggestions.length > 0 && tags.length < MAX_TAGS && (
            <button type="button" className="dshhl-undo__action" onClick={() => { onAddTag(tagSuggestions[0] ?? '') }}>
              + {tagSuggestions[0]}
            </button>
          )}
        </div>
      </div>

      {renderNote && (
        <>
          <label className={classes.label ?? 'dshhl-editor__label'} htmlFor={noteId}>
            {t(noteLabelKey)}
          </label>
          <textarea
            id={noteId}
            className={classes.note ?? 'dshhl-note-input'}
            maxLength={MAX_NOTE_CHARS}
            value={note}
            rows={noteRows}
            placeholder={t('action.notePlaceholder')}
            aria-label={t(noteLabelKey)}
            onChange={event => { onNote(event.target.value) }}
          />
        </>
      )}
    </>
  )
}
