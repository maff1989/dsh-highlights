/**
 * Settings surfaces (T1.7): the consent page and the two General rows.
 *
 * The components are driven only through the DOM against a fake settings
 * transport, so these tests pin the user-visible contract: consent is written
 * with the version that was read, a lost race shows Host truth instead of
 * overwriting it, the scope is locked while access is off, and the retention
 * row reads the deployment value instead of offering a control.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { en } from '../../../src/client/locales'
import { createSettingsController } from '../../../src/client/ui/settings/controller'
import { SettingsPage, type SettingsPageProps } from '../../../src/client/ui/settings/SettingsPage'
import {
  DefaultColorRow,
  RetentionRow,
  type SettingsRowProps,
} from '../../../src/client/ui/settings/SettingsRows'
import type { SettingsTransport } from '../../../src/client/ui/settings/transport'
import type { SettingsPatch, SettingsRecord } from '../../../src/shared/protocol'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const shared = await import('./primitives-mock')
  return {
    ...shared,
    /** Native tablist semantics for the segmented control. */
    SegmentedControl<Value extends string>({ id, value, options, onChange, label, disabled }: {
      id: string
      value: Value
      options: readonly { value: Value; label: string; disabled?: boolean }[]
      onChange: (next: Value) => void
      label: string
      disabled?: boolean
    }) {
      return (
        <div role="tablist" aria-label={label} data-control={id}>
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={option.value === value}
              disabled={disabled === true || option.disabled === true}
              onClick={() => { if (option.value !== value) onChange(option.value) }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )
    },
  }
})

afterEach(() => {
  cleanup()
  globalThis.localStorage?.clear()
})

/** Fixed clock of the fixtures. */
const BASE: SettingsRecord = {
  version: 1,
  agentAccess: 'off',
  agentScope: 'session',
  defaultColorId: 3,
  createdAt: 1,
  updatedAt: 1,
}

/** Fake settings transport with externally injectable failures and races. */
function fakeTransport(seed: SettingsRecord = BASE, retentionDays = 30) {
  let current: SettingsRecord = { ...seed }
  let readFails = false
  let writeFails = false
  const transport: SettingsTransport = {
    read: vi.fn(async () => {
      if (readFails) throw new Error('offline')
      return { settings: current, retentionDays }
    }),
    write: vi.fn(async (input: { expectedVersion: number; patch: SettingsPatch }) => {
      if (writeFails) throw new Error('offline')
      if (input.expectedVersion !== current.version) return { status: 'conflict' as const, settings: current }
      current = {
        ...current,
        ...input.patch,
        version: current.version + 1,
        updatedAt: current.updatedAt + 1,
      }
      return { status: 'written' as const, settings: current }
    }),
  }
  return {
    transport,
    current: () => current,
    /** Simulate another surface (or browser) committing first. */
    external(patch: SettingsPatch) {
      current = { ...current, ...patch, version: current.version + 1, updatedAt: current.updatedAt + 1 }
    },
    failRead(value: boolean) { readFails = value },
    failWrite(value: boolean) { writeFails = value },
  }
}

/** Translate function backed by the real English dictionary. */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = (en as Record<string, string>)[key] ?? String(key)
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => String(params?.[name] ?? ''))
}) as unknown as SettingsPageProps['t']

/** Render the consent page over one controller. */
async function renderPage(fake: ReturnType<typeof fakeTransport>): Promise<void> {
  const controller = createSettingsController({ transport: fake.transport })
  const props = { controller, t } as unknown as SettingsPageProps
  render(<SettingsPage {...props} />)
  await waitFor(() => { expect(screen.getByRole('heading', { name: 'Highlights' })).toBeTruthy() })
  await waitFor(() => { expect(screen.getAllByRole('tab').length).toBeGreaterThanOrEqual(3) })
}

describe('SettingsPage', () => {
  it('loads the Host settings and starts with access off and the scope locked', async () => {
    const fake = fakeTransport()
    await renderPage(fake)
    expect(screen.getByRole('tab', { name: 'Off' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'This session' }).getAttribute('aria-selected')).toBe('true')
    // Access off: every scope choice is disabled and the row says why.
    for (const tab of screen.getAllByRole('tab').filter(tab => ['This session', 'Workspace', 'All sessions'].includes(tab.textContent ?? ''))) {
      expect((tab as HTMLButtonElement).disabled).toBe(true)
    }
    expect(screen.getByText('Turn on agent access to choose a range.')).toBeTruthy()
    expect(fake.transport.read).toHaveBeenCalledTimes(1)
  })

  it('writes access with the version it read and reflects the accepted value', async () => {
    const fake = fakeTransport()
    await renderPage(fake)
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Read only' })) })
    await waitFor(() => { expect(fake.transport.write).toHaveBeenCalledWith({ expectedVersion: 1, patch: { agentAccess: 'read' } }) })
    await waitFor(() => { expect(screen.getByRole('tab', { name: 'Read only' }).getAttribute('aria-selected')).toBe('true') })
    // The Host applied the version bump; the scope row is now live.
    expect(fake.current().agentAccess).toBe('read')
    expect((screen.getByRole('tab', { name: 'Workspace' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('The agent can read your highlights.')).toBeTruthy()
  })

  it('writes a widened scope against the current version', async () => {
    const fake = fakeTransport({ ...BASE, agentAccess: 'read', version: 2 })
    await renderPage(fake)
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Workspace' })) })
    await waitFor(() => { expect(fake.transport.write).toHaveBeenCalledWith({ expectedVersion: 2, patch: { agentScope: 'workspace' } }) })
    expect(fake.current().agentScope).toBe('workspace')
  })

  it('turns access off in one click, which the Host narrows back to the session scope', async () => {
    const fake = fakeTransport({ ...BASE, agentAccess: 'read-write', agentScope: 'all', version: 2 })
    await renderPage(fake)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Turn off' })) })
    await waitFor(() => { expect(fake.transport.write).toHaveBeenCalledWith({ expectedVersion: 2, patch: { agentAccess: 'off' } }) })
    expect(fake.current().agentAccess).toBe('off')
  })

  it('shows Host truth and a conflict line when a write loses the race', async () => {
    const fake = fakeTransport()
    await renderPage(fake)
    // Another surface commits access "read-write" first; our staged "read" is stale.
    fake.external({ agentAccess: 'read-write' })
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Read only' })) })
    await waitFor(() => { expect(fake.transport.write).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(screen.getByText('These settings changed elsewhere. Showing the current values.')).toBeTruthy() })
    // Host truth wins: access read-write (the accepted change), not our staged read.
    expect(screen.getByRole('tab', { name: 'Read and annotate' }).getAttribute('aria-selected')).toBe('true')
    expect(fake.current().agentAccess).toBe('read-write')
  })

  it('keeps the previous values and reports a failed write', async () => {
    const fake = fakeTransport()
    await renderPage(fake)
    fake.failWrite(true)
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Read only' })) })
    await waitFor(() => { expect(screen.getByText('Could not save that change. Try again.')).toBeTruthy() })
    expect(screen.getByRole('tab', { name: 'Off' }).getAttribute('aria-selected')).toBe('true')
  })

  it('reports a failed read and retries it', async () => {
    const fake = fakeTransport()
    fake.failRead(true)
    const controller = createSettingsController({ transport: fake.transport })
    render(<SettingsPage {...({ controller, t } as unknown as SettingsPageProps)} />)
    await waitFor(() => { expect(screen.getByText('Could not load your settings.')).toBeTruthy() })
    fake.failRead(false)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    await waitFor(() => { expect(screen.getByRole('tab', { name: 'Off' })).toBeTruthy() })
  })
})

describe('settings General rows', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear()
  })

  it('default colour: writes the chosen slot and mirrors it for quick capture', async () => {
    const fake = fakeTransport()
    const controller = createSettingsController({ transport: fake.transport })
    render(<DefaultColorRow {...({ controller, t } as unknown as SettingsRowProps)} />)
    const amber = await screen.findByRole('radio', { name: 'Amber' })
    await act(async () => { fireEvent.click(amber) })
    await waitFor(() => { expect(fake.transport.write).toHaveBeenCalledWith({ expectedVersion: 1, patch: { defaultColorId: 1 } }) })
    expect(fake.current().defaultColorId).toBe(1)
    expect(JSON.parse(globalThis.localStorage.getItem('dsh.highlights.prefs.v1') ?? '{}')).toEqual({ lastColorId: 1 })
    await waitFor(() => { expect(screen.getByRole('radio', { name: 'Amber' }).getAttribute('aria-checked')).toBe('true') })
  })

  it('retention: reads the deployment value read-only', async () => {
    const fake = fakeTransport(BASE, 30)
    const controller = createSettingsController({ transport: fake.transport })
    render(<RetentionRow {...({ controller, t } as unknown as SettingsRowProps)} />)
    await waitFor(() => { expect(screen.getByText('Kept for 30 days')).toBeTruthy() })
    expect(screen.getByText('A deleted highlight is kept for 30 days so Undo stays possible, then it is removed from this device.')).toBeTruthy()
    // Read-only: the row owns no control other than the swatches in its sibling.
    expect(screen.queryByRole('button')).toBeNull()
  })
})
