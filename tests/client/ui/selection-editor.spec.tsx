// @vitest-environment jsdom
/**
 * P0-2 regression: the selection editor must survive the browser's
 * focus↔selection coupling.
 *
 * Focusing a text field inside the floating bar collapses the document
 * selection. That used to make the (now removed) pointerup path and the 250 ms poll close the
 * editor (issue-log 17 regressed), so a note or tag could never be entered.
 * These tests shim the browser behaviour jsdom does not model: they collapse the
 * selection while focus sits inside the bar and then drive both paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => await import('./primitives-mock'))
import type { ReactElement } from 'react'

import type { HighlightAnchor } from '../../../src/shared/schema'
import type { HighlightDraft } from '../../../src/client/data/actions'
import type { HighlightsClient } from '../../../src/client/data/client'
import { SelectionAffordance } from '../../../src/client/ui/SelectionAffordance'

/** A rectangle jsdom would otherwise refuse to provide. */
const RECT = { width: 120, height: 20, top: 120, bottom: 140, left: 40, right: 160, x: 40, y: 120 }

/** Minimal translate stub: returns the key so assertions can match copy. */
const t = (key: string): string => key

/** Fake Chat snapshot: resolves the durable ids for our node. */
const chat = {
  nodes: {
    get: (key: string) => (key === '14:assistant-step4:2'
      ? { anchorSeq: 42, data: { finalNode: { messageId: 'm-1' } } }
      : undefined),
  },
}

/** Fake client: the affordance only reads `getSnapshot` through props it ignores in practice. */
const client = { getSnapshot: () => ({ records: [] }) } as unknown as HighlightsClient

/** Collected saves. */
const saves: { anchor: HighlightAnchor; sessionId: string; draft: HighlightDraft }[] = []

/** Render the affordance under test. */
function renderAffordance(): ReactElement {
  return (
    <SelectionAffordance
      t={t}
      sessionId="session-1"
      defaultColor={() => 3}
      tagSuggestions={() => ['release']}
      createSelection={(anchor, sessionId, draft) => { saves.push({ anchor, sessionId, draft }) }}
      chat={chat}
      client={client}
      copy={async () => true}
      announce={() => undefined}
      visible
    />
  )
}

/** The reply source of the current fixture (for the right-click open path). */
let fixtureSource: HTMLElement | null = null

/** Build the assistant node fixture and select a range inside its source. */
function selectReplyText(): Range {
  const source = document.createElement('div')
  source.setAttribute('data-text-interaction-source', '')
  source.textContent = 'Release notes must be written before tagging.'
  const node = document.createElement('div')
  node.setAttribute('data-chat-node-key', '14:assistant-step4:2')
  node.append(source)
  const conversation = document.createElement('div')
  conversation.setAttribute('data-conversation-session', 'session-1')
  conversation.append(node)
  document.body.append(conversation)
  fixtureSource = source

  const text = source.firstChild
  if (text === null) throw new Error('fixture text missing')
  const range = document.createRange()
  range.setStart(text, 0)
  range.setEnd(text, 7)
  const selection = window.getSelection()
  if (selection === null) throw new Error('jsdom selection missing')
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

/** Open the bar the way the product does: a right-click on the selected reply. */
function openBarByRightClick(): void {
  const source = fixtureSource
  if (source === null) throw new Error('fixture source missing')
  const event = new MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, clientX: 60, clientY: 130,
  })
  fireEvent(source, event)
}

/** Open the editor from the floating bar. */
async function openEditor(): Promise<void> {
  selectReplyText()
  openBarByRightClick()
  await waitFor(() => expect(screen.getByRole('toolbar')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'action.annotate' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'action.save' })).toBeTruthy())
}

beforeEach(() => {
  saves.length = 0
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [RECT],
  })
  document.body.innerHTML = ''
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects
  window.getSelection()?.removeAllRanges()
})

describe('selection editor survives the browser focus↔selection coupling', () => {
  it('moves focus into the popover when it opens', async () => {
    render(renderAffordance())
    await openEditor()
    const bar = document.querySelector('[data-dshhl-affordance]')
    expect(bar?.contains(document.activeElement)).toBe(true)
  })

  it('stays open when the document selection collapses while focus is in the bar', async () => {
    render(renderAffordance())
    await openEditor()

    const tagInput = screen.getByLabelText('editor.tags')
    tagInput.focus()
    // What the browser does when a text field takes focus.
    window.getSelection()?.removeAllRanges()
    expect(document.activeElement).toBe(tagInput)

    tagInput.dispatchEvent(new Event('pointerup', { bubbles: true }))

    // A press on our own field must not be treated as a dismissed gesture.
    expect(screen.getByRole('button', { name: 'action.save' })).toBeTruthy()
  })

  it('stays open across a 250 ms poll tick while focus is in the bar', async () => {
    render(renderAffordance())
    await openEditor()

    const tagInput = screen.getByLabelText('editor.tags')
    tagInput.focus()
    window.getSelection()?.removeAllRanges()

    await new Promise(resolve => setTimeout(resolve, 350))

    expect(screen.getByRole('button', { name: 'action.save' })).toBeTruthy()
    expect(document.activeElement).toBe(tagInput)
  })

  it('saves the note and tag entered after the selection collapsed', async () => {
    render(renderAffordance())
    await openEditor()

    const tagInput = screen.getByLabelText('editor.tags')
    tagInput.focus()
    window.getSelection()?.removeAllRanges()
    fireEvent.change(tagInput, { target: { value: 'release' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: /editor.addNote/ }))
    const note = screen.getByLabelText('action.note')
    fireEvent.change(note, { target: { value: 'check with ops' } })
    fireEvent.click(screen.getByRole('button', { name: 'action.save' }))

    await waitFor(() => { expect(saves).toHaveLength(1) })
    expect(saves[0]?.draft.tags).toEqual(['release'])
    expect(saves[0]?.draft.note).toBe('check with ops')
  })

  it('recovers detection after a cancelled pointer gesture', async () => {
    render(renderAffordance())
    // Start a drag, then let the browser cancel it (touch scroll, interruption).
    fireEvent(document, new Event('pointerdown'))
    document.dispatchEvent(new Event('pointercancel', { bubbles: true }))

    selectReplyText()
    // A keyboard extension after the cancelled gesture must still detect.
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0) throw new Error('fixture selection missing')
    const range = selection.getRangeAt(0)
    const end = range.endContainer
    if (end.nodeType !== Node.TEXT_NODE) throw new Error('fixture text node missing')
    fireEvent.keyDown(document, { key: 'Shift', shiftKey: true })
    range.setEnd(end, Math.min((end as Text).data.length, range.endOffset + 1))
    selection.removeAllRanges()
    selection.addRange(range)
    fireEvent.keyUp(document, { key: 'Shift', shiftKey: false })
    await waitFor(() => { expect(screen.getByRole('toolbar')).toBeTruthy() })
  })

  it('closes on a genuine outside press (focus is not in the bar)', async () => {
    render(renderAffordance())
    await openEditor()

    const outside = document.createElement('div')
    document.body.append(outside)
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    await waitFor(() => { expect(screen.queryByRole('button', { name: 'action.save' })).toBeNull() })
  })
})
