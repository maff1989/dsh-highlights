// @vitest-environment jsdom
/**
 * The speech-act picker: one control, four acts.
 *
 * A highlight is a message to a present author, and "this mattered", "this is
 * wrong", "redo this" and "remember this" ask for different agent behaviour. The
 * field is optional (absent = note) and only renders when a surface supplies a
 * handler, so page/panel inline editors are unchanged until they opt in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => await import('./primitives-mock'))

import { EditorFields } from '../../../src/client/ui/EditorFields'
import type { Intent } from '../../../src/shared/provenance'

const t = (key: string, params?: Record<string, string | number>): string =>
  (params === undefined ? key : `${key}(${Object.values(params).join(',')})`)

/**
 * Render the fields with only what the picker needs.
 * @param options - intent, handler, and whether the handler exists.
 * @returns the render result.
 */
function renderFields(options: {
  intent?: Intent
  onIntent?: (intent: Intent) => void
}) {
  return render(
    <EditorFields
      t={t as unknown as (key: string) => string}
      colorId={1}
      colorIds={[1, 2]}
      onColor={() => undefined}
      tags={[]}
      onAddTag={() => undefined}
      onRemoveTag={() => undefined}
      note=""
      onNote={() => undefined}
      renderNote={false}
      {...(options.intent === undefined ? {} : { intent: options.intent })}
      {...(options.onIntent === undefined ? {} : { onIntent: options.onIntent })}
    />,
  )
}

afterEach(() => { cleanup() })

describe('EditorFields intent picker', () => {
  it('renders nothing when no handler is supplied', () => {
    renderFields({})
    expect(screen.queryByRole('group', { name: 'editor.intent' })).toBeNull()
  })

  it('renders four acts and marks the current one', () => {
    renderFields({ intent: 'note', onIntent: () => undefined })
    const group = screen.getByRole('group', { name: 'editor.intent' })
    expect(group).toBeTruthy()
    expect(screen.getByRole('button', { name: 'intent.note' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'intent.dispute' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'intent.direct' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'intent.remember' })).toBeTruthy()
  })

  it('reports the chosen act', () => {
    const picked: Intent[] = []
    renderFields({ intent: 'note', onIntent: value => { picked.push(value) } })
    fireEvent.click(screen.getByRole('button', { name: 'intent.dispute' }))
    expect(picked).toEqual(['dispute'])
  })

  it('defaults to note when the field is absent', () => {
    renderFields({ onIntent: () => undefined })
    expect(screen.getByRole('button', { name: 'intent.note' }).getAttribute('aria-pressed')).toBe('true')
  })
})
