/**
 * Settings registration entry point (T1.7).
 *
 * The composition root (`src/client/index.ts`) cannot be edited by this work
 * package, so it calls this one function; everything the settings surfaces need
 * — the shared controller, the stylesheet, both slot registrations, and the
 * freshness listener — is created and owned here.
 *
 * The two slot names are Settings-shell slots, declared at runtime by the
 * shipped Web composition; their contract types are restated in
 * `slot-contracts.ts` (workaround W15).
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

import { LOCALE_NAMESPACE } from '../../../shared/constants'
import { createSettingsController, type SettingsController } from './controller'
import { SettingsPage } from './SettingsPage'
import { DefaultColorRow, RetentionRow } from './SettingsRows'
import { SETTINGS_STYLES } from './settingsStyles'
import { createSettingsTransport, type SettingsTransport } from './transport'
import './slot-contracts'

/** Registration id of the settings page (its nav key). */
export const SETTINGS_SECTION_ID = 'dsh-highlights'

/** Registration id of the default-colour General row. */
export const DEFAULT_COLOR_ROW_ID = 'highlights-default-color'

/** Registration id of the retention General row. */
export const RETENTION_ROW_ID = 'highlights-retention'

/** Injection points for tests. */
export interface SettingsSurfaceDeps {
  /** Settings transport override; defaults to the `/api/highlights` route. */
  readonly transport?: SettingsTransport
}

/**
 * Append one plugin-owned stylesheet to the document.
 * @param css - stylesheet text.
 * @returns the disposer that removes the element.
 */
function injectStylesheet(css: string): () => void {
  const element = document.createElement('style')
  element.dataset.pluginCss = 'dsh-highlights'
  element.textContent = css
  document.head.append(element)
  return () => {
    element.remove()
  }
}

/**
 * Register the Highlights settings surface.
 * @param ctx - client root context owning every contribution.
 * @param deps - transport override (tests).
 */
export function registerSettingsSurface(ctx: Context, deps: SettingsSurfaceDeps = {}): void {
  const controller: SettingsController = createSettingsController({
    transport: deps.transport ?? createSettingsTransport(),
  })
  ctx.effect(() => () => { controller.dispose() }, 'highlights: settings controller')
  ctx.effect(() => injectStylesheet(SETTINGS_STYLES), 'highlights: settings styles')

  // Nav label is read at render time, so it follows the active locale without
  // re-registering (SlotLabel thunk contract).
  const translate = ctx.locale.bind(LOCALE_NAMESPACE) as unknown as (key: string, params?: Record<string, string | number>) => string

  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SETTINGS_SECTION_ID,
    order: 30,
    label: () => translate('settings.nav.label'),
    locale: LOCALE_NAMESPACE,
    inject: () => ({ controller }),
  }, SettingsPage)), 'highlights: settings section')

  ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: DEFAULT_COLOR_ROW_ID,
    order: 30,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ controller }),
  }, DefaultColorRow)), 'highlights: default colour row')

  ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: RETENTION_ROW_ID,
    order: 35,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ controller }),
  }, RetentionRow)), 'highlights: retention row')

  // A reconnect re-reads the Host truth a settings surface already showed;
  // an untouched surface stays unloaded (no request at boot).
  ctx.effect(() => ctx.on('connection/reset', () => {
    if (controller.state.get().status !== 'idle') controller.refresh()
  }), 'highlights: settings freshness')
}
