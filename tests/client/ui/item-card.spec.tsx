// @vitest-environment jsdom
/**
 * The item card is the calm editing surface for an existing highlight: one
 * colour row, quote, tags, note, and two footer decisions (Save / More).
 *
 * It is also the editor's conflict surface: a save or delete that loses the
 * Host's compare-and-set race keeps the draft and renders the inline prompt;
 * copy/reveal/insert report their real outcome on the status line.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => await import('./primitives-mock'))

import type { HighlightRecord } from '../../../src/shared/schema'
import type {
  HighlightDraft,
  InsertOutcome,
  InsertTarget,
  RevealOutcome,
  WriteOutcome,
} from '../../../src/client/data/actions'
import { ItemCard, type ItemCardProps } from '../../../src/client/ui/ItemCard'

/** Translate stub that echoes keys, so assertions match copy keys. */
const t = (key: string): string => key

/** One stored record for the fixture. */
const record: HighlightRecord = {
  schemaVersion: 1,
  id: '11111111-2222-4333-8444-555555555555',
  sessionId: 'session-1',
  origin: 'test',
  anchor: {
    nodeKey: '14:assistant-step4:2',
    kind: 'text',
    sourceIndex: 0,
    quote: 'The migration must land before the release.',
    prefix: '',
    suffix: '',
    start: 0,
    end: 10,
    projection: 1,
  },
  colorId: 3,
  tags: ['release'],
  note: 'check with ops',
  starred: false,
  createdAt: 1,
  updatedAt: 2,
  version: 3,
}

/** A stored version one write ahead of the card's draft. */
const liveRecord: HighlightRecord = { ...record, note: 'theirs', version: 9, updatedAt: 5 }

/** Callback bundle the tests record. */
interface Calls {
  readonly save: ReturnType<typeof vi.fn>
  readonly close: ReturnType<typeof vi.fn>
  readonly reveal: ReturnType<typeof vi.fn>
  readonly insert: ReturnType<typeof vi.fn>
  readonly copy: ReturnType<typeof vi.fn>
  readonly remove: ReturnType<typeof vi.fn>
  readonly star: ReturnType<typeof vi.fn>
  readonly restore: ReturnType<typeof vi.fn>
}

/** Outcomes one render may force. */
interface Outcomes {
  readonly save?: WriteOutcome[]
  readonly copy?: boolean
  readonly reveal?: RevealOutcome
  readonly insert?: InsertOutcome
  readonly remove?: WriteOutcome
  readonly star?: WriteOutcome
  readonly restore?: WriteOutcome
}

/**
 * Render the card with recording callbacks.
 * @param outcomes - Host outcomes the fakes return, in call order.
 * @returns the recorded calls.
 */
function setup(outcomes: Outcomes = {}): Calls {
  const saves = [...(outcomes.save ?? [{ status: 'written', record } as WriteOutcome])]
  const calls: Calls = {
    save: vi.fn(async (_draft: HighlightDraft, _expectedVersion?: number) => saves.shift() ?? { status: 'written', record }),
    close: vi.fn(),
    reveal: vi.fn(async () => outcomes.reveal ?? 'revealed'),
    insert: vi.fn(async (_target: InsertTarget) => outcomes.insert ?? 'inserted'),
    copy: vi.fn(async () => outcomes.copy ?? true),
    remove: vi.fn(async () => outcomes.remove ?? { status: 'written', record } as WriteOutcome),
    star: vi.fn(async (_starred: boolean) => outcomes.star ?? { status: 'written', record: { ...record, starred: true } } as WriteOutcome),
    restore: vi.fn(async () => outcomes.restore ?? { status: 'written', record } as WriteOutcome),
  }
  const props: ItemCardProps = {
    t,
    record,
    tagSuggestions: [],
    onSave: calls.save,
    onClose: calls.close,
    onReveal: calls.reveal,
    onInsert: calls.insert,
    onCopy: calls.copy,
    onDelete: calls.remove,
    onStar: calls.star,
    onRestore: calls.restore,
  }
  render(<ItemCard {...props} />)
  return calls
}

afterEach(() => { cleanup() })

describe('ItemCard', () => {
  it('shows the quote, existing tags, note, and one primary decision', () => {
    setup()
    expect(screen.getByText(record.anchor.quote)).toBeTruthy()
    expect(screen.getByText('release')).toBeTruthy()
    expect((screen.getByLabelText('action.note') as HTMLTextAreaElement).value).toBe('check with ops')
    expect(screen.getByRole('button', { name: 'action.saveChanges' })).toBeTruthy()
    // The rarely used actions live behind More, not in the footer row.
    expect(screen.queryByRole('button', { name: 'action.reveal' })).toBeNull()
  })

  it('marks itself as the card surface and moves focus inside', () => {
    setup()
    expect(document.querySelector('[data-dshhl-card]')).toBeTruthy()
    const card = document.querySelector('[data-dshhl-card]')
    expect(card?.contains(document.activeElement)).toBe(true)
  })

  it('saves colour, tags and note; star persists immediately (policy A)', async () => {
    const calls = setup()
    fireEvent.click(screen.getAllByLabelText('action.star')[0]!)
    await waitFor(() => { expect(calls.star).toHaveBeenCalledWith(true) })
    fireEvent.click(screen.getByLabelText('editor.color 1'))
    fireEvent.change(screen.getByLabelText('action.addTag'), { target: { value: 'Migration' } })
    fireEvent.keyDown(screen.getByLabelText('action.addTag'), { key: 'Enter' })
    fireEvent.change(screen.getByLabelText('action.note'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'action.saveChanges' }))

    await waitFor(() => { expect(calls.close).toHaveBeenCalledTimes(1) })
    const draft = calls.save.mock.calls[0]?.[0] as HighlightDraft
    expect(draft.colorId).toBe(1)
    expect(draft.tags).toEqual(['release', 'migration'])
    expect(draft.note).toBeUndefined()
    expect(draft.starred).toBe(true)
  })

  it('opens the rare actions in a menu', () => {
    setup()
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByLabelText('status.menu'))
    const menu = screen.getByRole('menu')
    expect(menu).toBeTruthy()
    // The card is a clipped/scrollable surface, so the list must be portalled
    // (the mock keeps it in place and marks the contract; see issue-log 33).
    expect(menu.getAttribute('data-portal')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'action.reveal' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'action.delete' })).toBeTruthy()
  })

  it('routes reveal and closes once the Host found the text', async () => {
    const calls = setup()
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.reveal' }))

    await waitFor(() => {
      expect(calls.reveal).toHaveBeenCalledTimes(1)
      expect(calls.close).toHaveBeenCalledTimes(1)
    })
  })

  it('routes both insertion targets', async () => {
    const first = setup()
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.insertCurrent' }))
    await waitFor(() => { expect(first.insert).toHaveBeenLastCalledWith({ kind: 'current' }) })

    cleanup()
    const second = setup()
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.insertNew' }))
    await waitFor(() => { expect(second.insert).toHaveBeenLastCalledWith({ kind: 'new' }) })
  })

  it('routes copy, and a confirmed delete opens Undo instead of closing (policy A)', async () => {
    const calls = setup()
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.copy' }))
    await waitFor(() => { expect(calls.copy).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(calls.close).toHaveBeenCalledTimes(1) })

    cleanup()
    const deleted = setup()
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.delete' }))
    await waitFor(() => { expect(deleted.remove).toHaveBeenCalledTimes(1) })
    expect(deleted.close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'action.undo' }))
    await waitFor(() => {
      expect(deleted.restore).toHaveBeenCalledTimes(1)
      expect(deleted.close).toHaveBeenCalledTimes(1)
    })
  })

  it('closes on Cancel without saving', () => {
    const calls = setup()
    fireEvent.click(screen.getByRole('button', { name: 'action.cancel' }))
    expect(calls.close).toHaveBeenCalledTimes(1)
    expect(calls.save).not.toHaveBeenCalled()
  })

  it('keeps the draft and prompts when the save loses the version race', async () => {
    const calls = setup({
      save: [
        { status: 'conflict', record: liveRecord },
        { status: 'written', record: liveRecord },
      ],
    })
    fireEvent.change(screen.getByLabelText('action.note'), { target: { value: 'my newer note' } })
    fireEvent.click(screen.getByRole('button', { name: 'action.saveChanges' }))

    await waitFor(() => { expect(screen.getByText('conflict.title')).toBeTruthy() })
    // Draft retained, card still open, no close.
    expect((screen.getByLabelText('action.note') as HTMLTextAreaElement).value).toBe('my newer note')
    expect(calls.close).not.toHaveBeenCalled()

    // Overwrite retries with the live version as the CAS precondition.
    fireEvent.click(screen.getByRole('button', { name: 'conflict.overwrite' }))
    await waitFor(() => { expect(calls.save).toHaveBeenCalledTimes(2) })
    expect(calls.save.mock.calls[1]?.[1]).toBe(9)
    await waitFor(() => { expect(calls.close).toHaveBeenCalledTimes(1) })
  })

  it('adopts the stored version when the card reloads after a conflict', async () => {
    const calls = setup({ save: [{ status: 'conflict', record: liveRecord }] })
    fireEvent.change(screen.getByLabelText('action.note'), { target: { value: 'my newer note' } })
    fireEvent.click(screen.getByRole('button', { name: 'action.saveChanges' }))
    await waitFor(() => { expect(screen.getByText('conflict.title')).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: 'conflict.reload' }))
    expect((screen.getByLabelText('action.note') as HTMLTextAreaElement).value).toBe('theirs')
    expect(screen.queryByText('conflict.title')).toBeNull()
    expect(calls.close).not.toHaveBeenCalled()
  })

  it('reports a refused delete instead of closing over it', async () => {
    const calls = setup({ remove: { status: 'conflict', record: liveRecord } })
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.delete' }))

    await waitFor(() => { expect(screen.getByText('conflict.title')).toBeTruthy() })
    expect(calls.close).not.toHaveBeenCalled()
    // A refused delete has no newest-version retry.
    expect(screen.queryByRole('button', { name: 'conflict.overwrite' })).toBeNull()
  })

  it('reports copy, insert and reveal outcomes truthfully', async () => {
    setup({ copy: false, insert: 'queued', reveal: 'not-found' })

    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.copy' }))
    await waitFor(() => { expect(screen.getByText('action.copyFailed')).toBeTruthy() })

    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.insertCurrent' }))
    await waitFor(() => { expect(screen.getByText('insert.queued')).toBeTruthy() })

    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.reveal' }))
    await waitFor(() => { expect(screen.getByText('reveal.failed')).toBeTruthy() })
  })

  it('reports a failed insertion with the copy fallback copy', async () => {
    setup({ insert: 'failed' })
    fireEvent.click(screen.getByLabelText('status.menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'action.insertNew' }))
    await waitFor(() => { expect(screen.getByText('insert.failed')).toBeTruthy() })
  })
})
