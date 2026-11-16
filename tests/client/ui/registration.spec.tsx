/**
 * Registration contract of the two WP-C surfaces.
 *
 * The composition root (src/client/index.ts) is owned by the Lead, so these
 * helpers are the seam: they pin the seat names, registration ids and order,
 * and prove that the components actually fit their slot contracts at compile
 * time (the file typechecks against the real slot types). A plain fake context
 * keeps the assertion about registration, not about Cordis.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'

import { createNoticeService } from '../../../src/client/notice/service'
import { NOTICE_OVERLAY_ID, NoticeOverlay, registerNoticeOverlay } from '../../../src/client/ui/NoticeOverlay'
import {
  DEFAULT_COLOR_ROW_ID,
  RETENTION_ROW_ID,
  SETTINGS_SECTION_ID,
  registerSettingsSurface,
} from '../../../src/client/ui/settings/register'
import { SettingsPage } from '../../../src/client/ui/settings/SettingsPage'
import { DefaultColorRow, RetentionRow } from '../../../src/client/ui/settings/SettingsRows'

// The shell primitives package is a platform module at runtime and imports a
// dependency this package does not install; the registration spec only needs
// the exports to exist (it renders nothing).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const shared = await import('./primitives-mock')
  return {
    ...shared,
    Toast({ text }: { text: string }): ReactNode {
      return <div role="alert">{text}</div>
    },
    SegmentedControl(): ReactNode {
      return null
    },
    IconWarningOutlineRegular(): null {
      return null
    },
  }
})

/** One captured registration. */
interface Captured {
  readonly name: string
  readonly options: {
    readonly id?: string
    readonly order?: number
    readonly label?: string | (() => string)
    readonly locale?: string
    readonly inject?: () => Record<string, unknown>
  }
  readonly component: unknown
}

/**
 * A minimal composition-root context: effects run immediately, `slots.inject`
 * resolves the slot as present, and every registration is recorded.
 * @returns the recorded registrations, injected slot names and effects.
 */
function fakeContext() {
  const registrations: Captured[] = []
  const injectedSlots: string[] = []
  const effects: { readonly name: string; readonly dispose: () => void }[] = []
  const ctx = {
    effect(effect: () => (() => void) | void, name = '') {
      const dispose = effect()
      effects.push({ name, dispose: () => { if (typeof dispose === 'function') dispose() } })
      return () => {}
    },
    slots: {
      inject(name: string, callback: () => () => void) {
        injectedSlots.push(name)
        return callback()
      },
      register(options: Captured['options'] & { name: string }, component: unknown) {
        registrations.push({ name: options.name, options, component })
        return () => {}
      },
    },
    locale: { bind: () => (key: string) => key },
    on: () => () => {},
  } as unknown as Context
  return { ctx, registrations, injectedSlots, effects }
}

/** The injected business face of one captured registration. */
function injectOf(registration: Captured | undefined): Record<string, unknown> {
  if (registration === undefined) throw new Error('missing registration')
  return registration.options.inject?.() ?? {}
}

describe('notice overlay registration', () => {
  it('registers on shell.overlay with a stable id and order, and no locale seat', () => {
    const { ctx, registrations, injectedSlots } = fakeContext()
    const service = createNoticeService()
    registerNoticeOverlay(ctx, service)
    expect(injectedSlots).toEqual(['shell.overlay'])
    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.options).toMatchObject({ id: NOTICE_OVERLAY_ID, order: 10 })
    expect(registrations[0]?.component).toBe(NoticeOverlay)
    // No locale: the banner text is already localised by whoever notifies.
    expect(registrations[0]?.options.locale).toBeUndefined()
    service.dispose()
  })

  it('injects the app-scoped channel and dismisses by id', () => {
    const { ctx, registrations } = fakeContext()
    const service = createNoticeService()
    registerNoticeOverlay(ctx, service)
    const face = injectOf(registrations[0])
    const id = service.notify('Saved')
    expect((face.notice as { get(): unknown }).get()).toMatchObject({ id, text: 'Saved' })
    ;(face.dismiss as (id?: number) => void)(id)
    expect(service.state.get()).toBeUndefined()
    service.dispose()
  })
})

describe('settings surface registration', () => {
  it('registers the section page and both General rows into their seats', () => {
    const { ctx, registrations, injectedSlots } = fakeContext()
    registerSettingsSurface(ctx)
    expect([...injectedSlots].sort()).toEqual(['settings.general.item', 'settings.general.item', 'settings.section'])
    expect(registrations.map(entry => entry.name)).toEqual(['settings.section', 'settings.general.item', 'settings.general.item'])
    const section = registrations.find(entry => entry.name === 'settings.section')
    expect(section?.options).toMatchObject({ id: SETTINGS_SECTION_ID, order: 30, locale: 'highlights' })
    expect(section?.component).toBe(SettingsPage)
    const rows = registrations.filter(entry => entry.name === 'settings.general.item')
    expect(rows.map(entry => entry.options.id)).toEqual([DEFAULT_COLOR_ROW_ID, RETENTION_ROW_ID])
    expect(rows.map(entry => entry.options.order)).toEqual([30, 35])
    expect(rows.map(entry => entry.component)).toEqual([DefaultColorRow, RetentionRow])
  })

  it('shares one controller between the section and both rows', () => {
    const { ctx, registrations } = fakeContext()
    registerSettingsSurface(ctx)
    const controllers = registrations.map(entry => injectOf(entry).controller)
    expect(controllers[0]).toBeDefined()
    expect(controllers[1]).toBe(controllers[0])
    expect(controllers[2]).toBe(controllers[0])
  })

  it('injects its stylesheet under the plugin-owned marker and removes it on teardown', () => {
    const before = document.head.querySelectorAll('style[data-plugin-css="dsh-highlights"]').length
    const { ctx, effects } = fakeContext()
    registerSettingsSurface(ctx)
    const sheets = [...document.head.querySelectorAll('style[data-plugin-css="dsh-highlights"]')]
    expect(sheets.length).toBe(before + 1)
    expect(sheets.some(sheet => (sheet.textContent ?? '').includes('.dshhl-settings'))).toBe(true)
    for (const effect of effects) effect.dispose()
    expect(document.head.querySelectorAll('style[data-plugin-css="dsh-highlights"]').length).toBe(before)
  })

  it('keeps the nav label a thunk so it follows the active locale', () => {
    const { ctx, registrations } = fakeContext()
    registerSettingsSurface(ctx)
    const section = registrations.find(entry => entry.name === 'settings.section')
    expect(typeof section?.options.label).toBe('function')
    expect((section?.options.label as () => string)()).toBe('settings.nav.label')
  })
})
