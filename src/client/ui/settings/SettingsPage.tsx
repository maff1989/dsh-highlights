/**
 * Settings → Highlights: the consent page (T1.7).
 *
 * One page, two decisions the user owns: whether the agent may read highlights
 * and how wide that read is. Both write immediately with compare-and-set; there
 * is no Save button because a half-applied consent is worse than a rejected
 * one — every accepted change is already durable, and a rejected one leaves the
 * controls showing Host truth.
 */
import { useEffect, type ReactNode } from 'react'
import { Button, SegmentedControl, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

import type { AgentAccess, AgentScope } from '../../../shared/protocol'
import { useSignalValue } from '../../runtime/use-signal'
import type { SettingsController } from './controller'
import './slot-contracts'

/** What the composition root injects into the page. */
export interface SettingsPageInjected {
  /** The one shared settings controller. */
  readonly controller: SettingsController
}

/** Props the renderer assembles for this registration. */
export type SettingsPageProps = PropsRuntime<'settings.section'> & PropsLocale<'highlights'> & InjectFace<SettingsPageInjected>

/** Access choices, narrowest first. */
const ACCESS_OPTIONS: readonly { readonly value: AgentAccess; readonly key: 'settings.agent.access.off' | 'settings.agent.access.read' | 'settings.agent.access.write' }[] = [
  { value: 'off', key: 'settings.agent.access.off' },
  { value: 'read', key: 'settings.agent.access.read' },
  { value: 'read-write', key: 'settings.agent.access.write' },
]

/** Read ranges, narrowest first. */
const SCOPE_OPTIONS: readonly { readonly value: AgentScope; readonly key: 'settings.agent.scope.session' | 'settings.agent.scope.workspace' | 'settings.agent.scope.all' }[] = [
  { value: 'session', key: 'settings.agent.scope.session' },
  { value: 'workspace', key: 'settings.agent.scope.workspace' },
  { value: 'all', key: 'settings.agent.scope.all' },
]

/**
 * Render the consent page.
 * @param props - the injected controller and localized copy.
 * @returns the settings section.
 */
export function SettingsPage({ controller, t }: SettingsPageProps): ReactNode {
  const snapshot = useSignalValue(controller.state)
  useEffect(() => {
    controller.ensure()
  }, [controller])

  const settings = snapshot.settings
  const loading = snapshot.status === 'idle' || snapshot.status === 'loading'
  const access = settings?.agentAccess ?? 'off'
  const accessOn = access !== 'off'

  return (
    <section className="dshhl-settings" aria-label={t('settings.page.title')}>
      <h2 className="dshhl-settings__title">{t('settings.page.title')}</h2>
      <p className="dshhl-settings__intro">{t('settings.page.intro')}</p>

      {loading && (
        <p className="dshhl-settings__status" role="status">{t('settings.loading')}</p>
      )}

      {snapshot.status === 'error' && (
        <p className="dshhl-settings__status dshhl-settings__status--error" role="status">
          <span>{t('settings.loadFailed')}</span>
          <Button size="sm" variant="outline" onClick={() => { controller.refresh() }}>
            {t('settings.retry')}
          </Button>
        </p>
      )}

      {settings !== undefined && (
        <div className="dshhl-settings__group">
          <h3 className="dshhl-settings__groupTitle">{t('settings.agent.group')}</h3>

          <div className="dshhl-settings__row">
            <div className="dshhl-settings__rowText">
              <div className="dshhl-settings__rowTitle">{t('settings.agent.access.title')}</div>
              <div className="dshhl-settings__rowDesc">{t('settings.agent.access.desc')}</div>
            </div>
            <div className="dshhl-settings__control">
              <SegmentedControl<AgentAccess>
                id="dshhl-settings-agent-access"
                label={t('settings.agent.access.title')}
                value={access}
                disabled={snapshot.saving}
                options={ACCESS_OPTIONS.map(option => ({ value: option.value, label: t(option.key) }))}
                onChange={(next) => { void controller.update({ agentAccess: next }) }}
              />
            </div>
          </div>

          <div className="dshhl-settings__row">
            <div className="dshhl-settings__rowText">
              <div className="dshhl-settings__rowTitle">{t('settings.agent.scope.title')}</div>
              <div className="dshhl-settings__rowDesc">
                {accessOn ? t('settings.agent.scope.desc') : t('settings.agent.scope.locked')}
              </div>
            </div>
            <div className="dshhl-settings__control">
              <SegmentedControl<AgentScope>
                id="dshhl-settings-agent-scope"
                label={t('settings.agent.scope.title')}
                value={settings.agentScope}
                disabled={snapshot.saving || !accessOn}
                options={SCOPE_OPTIONS.map(option => ({ value: option.value, label: t(option.key) }))}
                onChange={(next) => { void controller.update({ agentScope: next }) }}
              />
            </div>
          </div>

          <p className="dshhl-settings__status" role="status">
            {accessOn ? <Tag tone="success">{t('settings.agent.on')}</Tag> : <span>{t('settings.agent.off')}</span>}
            {accessOn && (
              <Button
                size="sm"
                variant="ghost"
                disabled={snapshot.saving}
                onClick={() => { void controller.update({ agentAccess: 'off' }) }}
              >
                {t('settings.agent.turnOff')}
              </Button>
            )}
          </p>
          {accessOn && <p className="dshhl-settings__status">{t('settings.agent.caveat')}</p>}
        </div>
      )}

      {snapshot.saveFailed && (
        <p className="dshhl-settings__status dshhl-settings__status--error" role="status">{t('settings.saveFailed')}</p>
      )}
      {snapshot.conflicted && (
        <p className="dshhl-settings__status dshhl-settings__status--warn" role="status">{t('settings.conflict')}</p>
      )}
    </section>
  )
}
