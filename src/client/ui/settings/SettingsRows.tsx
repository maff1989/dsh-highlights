/**
 * The two `settings.general.item` rows this plugin contributes: the default
 * capture colour and the read-only retention display (T1.7).
 *
 * A General row owns its whole internals — label, current value and write path
 * — so both rows read the same shared controller as the settings page and write
 * through the same Host-validated endpoint.
 */
import { useEffect, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

import { PREFS_STORAGE_KEY } from '../../../shared/constants'
import type { ColorId } from '../../../shared/schema'
import { useSignalValue } from '../../runtime/use-signal'
import type { SettingsController } from './controller'
import './slot-contracts'

/** What the composition root injects into a row. */
export interface SettingsRowInjected {
  /** The one shared settings controller. */
  readonly controller: SettingsController
}

/** Props the renderer assembles for a General row. */
export type SettingsRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'highlights'> & InjectFace<SettingsRowInjected>

/** Palette slots in display order (the record schema accepts exactly five). */
const COLOR_SLOTS: readonly ColorId[] = [1, 2, 3, 4, 5]

/** Accessible colour names, already owned by the list surfaces. */
type ColorNameKey = 'color.1' | 'color.2' | 'color.3' | 'color.4' | 'color.5'

/** Palette-slot key of one colour name. */
function colorNameKey(colorId: ColorId): ColorNameKey {
  return `color.${String(colorId)}` as ColorNameKey
}

/**
 * Mirror a chosen default into the browser-local capture preference, so a
 * one-click save uses it after the next reload even before the capture path
 * reads the Host record (see the WP-C report: wiring `actions.lastColorId()` to
 * the record is a follow-up in `data/actions-impl.ts`, outside this package).
 * @param colorId - the accepted palette slot.
 */
function mirrorDefaultColor(colorId: ColorId): void {
  try {
    globalThis.localStorage?.setItem(PREFS_STORAGE_KEY, JSON.stringify({ lastColorId: colorId }))
  } catch {
    // The mirror is a convenience; a storage failure changes nothing.
  }
}

/**
 * Render the default-colour row.
 * @param props - the injected controller and localized copy.
 * @returns the preference row.
 */
export function DefaultColorRow({ controller, t }: SettingsRowProps): ReactNode {
  const snapshot = useSignalValue(controller.state)
  useEffect(() => {
    controller.ensure()
  }, [controller])
  const selected = snapshot.settings?.defaultColorId

  return (
    <div className="dshhl-settings__row">
      <div className="dshhl-settings__rowText">
        <div className="dshhl-settings__rowTitle">{t('settings.defaultColor.title')}</div>
        <div className="dshhl-settings__rowDesc">{t('settings.defaultColor.desc')}</div>
      </div>
      <div className="dshhl-settings__control">
        <div
          className="dshhl-settings__swatches"
          role="radiogroup"
          aria-label={t('settings.defaultColor.title')}
        >
          {COLOR_SLOTS.map((colorId) => (
            <button
              key={colorId}
              type="button"
              role="radio"
              aria-checked={selected === colorId}
              aria-label={t(colorNameKey(colorId))}
              className={`dshhl-settings__swatch dshhl-settings__swatch--${String(colorId)}`}
              disabled={snapshot.saving || snapshot.settings === undefined}
              onClick={() => {
                if (snapshot.saving || snapshot.settings === undefined) return
                void controller.update({ defaultColorId: colorId }).then((written) => {
                  if (written) mirrorDefaultColor(colorId)
                })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Render the read-only retention row: retention is deployment configuration,
 * so the page shows what the Host applies instead of offering a control.
 * @param props - the injected controller and localized copy.
 * @returns the read-only row.
 */
export function RetentionRow({ controller, t }: SettingsRowProps): ReactNode {
  const snapshot = useSignalValue(controller.state)
  useEffect(() => {
    controller.ensure()
  }, [controller])
  const days = snapshot.retentionDays

  return (
    <div className="dshhl-settings__row">
      <div className="dshhl-settings__rowText">
        <div className="dshhl-settings__rowTitle">{t('settings.retention.title')}</div>
        <div className="dshhl-settings__rowDesc">
          {days === undefined ? t('settings.loading') : t('settings.retention.desc', { days: String(days) })}
        </div>
      </div>
      <div className="dshhl-settings__control">
        <span className="dshhl-settings__readonly">
          {days === undefined ? t('settings.loading') : t('settings.retention.days', { days: String(days) })}
        </span>
      </div>
    </div>
  )
}
