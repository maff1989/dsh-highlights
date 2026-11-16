/**
 * App-level notice renderer (T1.4).
 *
 * The overlay is registered on the frame's `shell.overlay` seat, not inside a
 * Session surface, so these tests render it alone — no SessionBridge, no page —
 * and prove an outcome still renders and expires there. The shell primitives
 * package is mocked (it ships CSS-module imports the headless runner cannot
 * evaluate); the Toast stand-in keeps the semantic contract the overlay uses:
 * text, tone/icon and `onDone`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import { createNoticeService } from '../../../src/client/notice/service'
import { NoticeOverlay, type NoticeOverlayProps } from '../../../src/client/ui/NoticeOverlay'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const shared = await import('./primitives-mock')
  return {
    ...shared,
    /** Stand-in banner: exposes text, tone/icon inputs and the completion path. */
    Toast({ text, tone, icon, onDone }: { text: string; tone?: string; icon?: ReactNode; onDone: () => void }) {
      return (
        <div role="alert" data-tone={tone ?? 'none'} data-has-icon={icon === undefined ? 'no' : 'yes'}>
          {text}
          <button type="button" onClick={onDone}>toast done</button>
        </div>
      )
    },
    IconWarningOutlineRegular(): null {
      return null
    },
  }
})

afterEach(() => {
  cleanup()
})

/**
 * Render the overlay against one notice service.
 * @param service - the app-scoped notice channel.
 * @returns nothing; assertions read the DOM.
 */
function renderOverlay(service: ReturnType<typeof createNoticeService>): void {
  const props = {
    notice: service.state,
    dismiss: (id?: number) => { service.dismiss(id) },
  } as unknown as NoticeOverlayProps
  render(<NoticeOverlay {...props} />)
}

describe('NoticeOverlay', () => {
  it('renders no banner when the channel is empty', () => {
    const service = createNoticeService()
    renderOverlay(service)
    expect(screen.queryByRole('alert')).toBeNull()
    service.dispose()
  })

  it('renders one notice outside any session bridge, as a success toast by default', () => {
    const service = createNoticeService()
    renderOverlay(service)
    act(() => { service.notify('Quote copied') })
    const banner = screen.getByRole('alert')
    expect(banner.textContent).toContain('Quote copied')
    expect(banner.dataset.tone).toBe('success')
    expect(banner.dataset.hasIcon).toBe('no')
    service.dispose()
  })

  it('renders a warning notice with the warning glyph', () => {
    const service = createNoticeService()
    renderOverlay(service)
    act(() => { service.notify('Could not save', { warn: true }) })
    const banner = screen.getByRole('alert')
    expect(banner.dataset.tone).toBe('none')
    expect(banner.dataset.hasIcon).toBe('yes')
    service.dispose()
  })

  it('replaces the banner and restarts the toast cycle for a new notice', () => {
    const service = createNoticeService()
    renderOverlay(service)
    act(() => { service.notify('First') })
    const first = screen.getByRole('alert')
    act(() => { service.notify('Second') })
    const second = screen.getByRole('alert')
    expect(second.textContent).toContain('Second')
    // A new notice id remounts the banner (the key), so the fade restarts.
    expect(second).not.toBe(first)
    service.dispose()
  })

  it('dismisses through the toast completion path', () => {
    const service = createNoticeService({ setTimeout: () => 1, clearTimeout: () => undefined })
    renderOverlay(service)
    act(() => { service.notify('Saved') })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'toast done' })) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(service.state.get()).toBeUndefined()
    service.dispose()
  })

  it('expires on the notice TTL without any owning surface unmounting it', () => {
    const scheduled = new Map<number, () => void>()
    let sequence = 0
    const service = createNoticeService({
      setTimeout: (callback) => { sequence += 1; scheduled.set(sequence, callback); return sequence },
      clearTimeout: (handle) => { scheduled.delete(handle) },
      ttlMs: 4_000,
    })
    renderOverlay(service)
    act(() => { service.notify('Temporary') })
    expect(screen.getByRole('alert').textContent).toContain('Temporary')
    act(() => { for (const callback of [...scheduled.values()]) callback() })
    expect(screen.queryByRole('alert')).toBeNull()
    service.dispose()
  })
})
