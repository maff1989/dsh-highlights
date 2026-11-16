// @vitest-environment jsdom
/**
 * S6 regression: the per-message "save to highlights" action renders inside
 * Chat's own icon-action row (`MessageIconActions.extraActions`), not inside a
 * plugin toolbar. Chat lays that row out at 28px square, borderless, tertiary
 * icons; the plugin's generic `.dshhl-button` is a bordered pill and looked
 * visibly foreign (a boxed button among plain icons). The component must use
 * the dedicated `.dshhl-message-action` class so product-row parity is restored.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

// The primitives package is a platform module in the real bundle; its own entry
// pulls `clsx`, which this package never installs. The tests assert on the
// button/tooltip contract, so the artwork stands in as an empty glyph and the
// Tooltip records the props Chat uses (label + bottom placement).
const primitives = vi.hoisted(() => ({
  tooltip: vi.fn((_props: { label: string; side?: string }) => undefined),
}))
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  /** Stand-in glyph component. */
  const Glyph = (): null => null
  /** Render the anchor and record the bubble props. */
  const Tooltip = (props: { label: string; side?: string; children: ReactNode }) => {
    primitives.tooltip({ label: props.label, side: props.side })
    return props.children
  }
  return { IconListPenOutlineRegular: Glyph, Tooltip }
})

import { COMPONENT_STYLES } from '../../../src/client/styles'
import { MessageAction, type MessageActionProps } from '../../../src/client/ui/MessageAction'

/** Translate stub that echoes keys, so assertions match copy keys. */
const t = (key: string): string => key

/** Minimal Chat snapshot shape the action reads. */
const snapshot = {
  nodes: {
    values: () => [
      { key: '14:assistant-step4:2', anchorSeq: 42, data: { finalNode: { messageId: 'm-1' } } },
    ],
  },
}

/**
 * Render the action with recording callbacks.
 * @param saveMark - injected save callback.
 * @param messageId - durable message id the slot owner supplies.
 * @returns the render result and the save spy.
 */
function setup(saveMark = vi.fn(), messageId = 'm-1') {
  const props = {
    t,
    messageId,
    saveMark,
    // The hook contract is selector-based; the fake applies the selector to the
    // fixture snapshot the real `useChat` would return.
    useChat: (selector: (state: typeof snapshot) => unknown) => selector(snapshot),
  } as unknown as MessageActionProps
  return { ...render(<MessageAction {...props} />), saveMark }
}

afterEach(cleanup)

describe('message action', () => {
  it("uses Chat's icon-action geometry, not the plugin toolbar button", () => {
    const { container } = setup()
    const button = container.querySelector('button')
    expect(button).not.toBeNull()
    expect(button?.className).toBe('dshhl-message-action')
    expect(button?.className).not.toContain('dshhl-button')
    expect(button?.getAttribute('title')).toBeNull()
    expect(button?.getAttribute('aria-label')).toBe('action.saveMessage')
    // The hover bubble is the product Tooltip (bottom placement), not a native title.
    const tooltip = primitives.tooltip.mock.calls.at(-1)?.[0]
    expect(tooltip?.label).toBe('action.saveMessage')
    expect(tooltip?.side).toBe('bottom')
  })

  it("keeps Chat's icon-action geometry in the injected stylesheet", () => {
    const rule = COMPONENT_STYLES.slice(COMPONENT_STYLES.indexOf('.dshhl-message-action'))
    expect(rule).toContain('border: none')
    expect(rule).toContain('border-radius: var(--dsw-radius-sm)')
    expect(rule).toContain('calc(28px + var(--dsh-content-font-delta, 0px))')
    expect(rule).toContain('calc(17px + var(--dsh-content-font-delta, 0px))')
  })

  it('saves the mark for the node carrying the message id', () => {
    const { saveMark } = setup()
    fireEvent.click(screen.getByRole('button'))
    expect(saveMark).toHaveBeenCalledWith('14:assistant-step4:2', 'm-1', 42)
  })

  it('does nothing when the message id is no longer in the snapshot', () => {
    const saveMark = vi.fn()
    setup(saveMark, 'message-gone')
    fireEvent.click(screen.getByRole('button'))
    expect(saveMark).not.toHaveBeenCalled()
  })
})
