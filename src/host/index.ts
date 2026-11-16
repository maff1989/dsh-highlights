/**
 * Host half of the Highlights plugin.
 *
 * Owns the durable store and the `/api/highlights` exact Fetch route. The
 * browser half of the same package is discovered automatically from
 * `dsh.client` in package.json — one Loader row serves both.
 */
import type { Context } from '@deepseek-ai/cordis'

import { Config as ConfigShape, type Config as ConfigValues } from './config'
import { createHighlightsRoute, HIGHLIGHTS_ROUTE_PATH } from './route'
import { HighlightStore } from './store'
import { registerHighlightAgentSurface } from './tools'

/** Cordis plugin name (also the Loader row id named by cordis.patch.yml). */
export const name = 'dsh-highlights'

/**
 * Host services this plugin cannot run without.
 *
 * The Connection service supplies authentication and the owner-Peer fence for
 * the exact Fetch route; the storage facility supplies the durable domain.
 */
export const inject = ['connection', 'storageDomain', 'tools', 'skills']

/** Host plugin configuration schema. */
export const Config = ConfigShape

/**
 * Open the store and register the exact Fetch route.
 *
 * Activation waits for the store, so a profile that lists this bundle either
 * gets a working route or fails loudly — never a silently half-mounted plugin.
 * @param ctx - Host plugin context.
 * @param config - Validated plugin configuration.
 */
export async function apply(ctx: Context, config: ConfigValues): Promise<void> {
  const log = ctx.logger('highlights')
  const store = await HighlightStore.open(ctx, {
    maxRecords: config.maxRecords,
    tombstoneDays: config.purgeTombstonesAfterDays,
  })
  ctx.effect(() => () => store.close(), 'highlights: store')
  // Agent-read surface (Phase 2): the two read tools plus the runtime skill,
  // all gated on the stored consent level. Registered once here and re-evaluated
  // by the helper when the settings record changes — never per model step, which
  // would churn the request prefix and invalidate KV reuse.
  ctx.effect(() => {
    const agentSurface = registerHighlightAgentSurface(ctx, { store })
    return () => { agentSurface.dispose() }
  }, 'highlights: agent read tools')
  ctx.effect(
    () => ctx.connection.fetch.register(createHighlightsRoute(store, {
      maxRecords: config.maxRecords,
      insertionAttribution: config.insertionAttribution,
      pollIntervalMs: config.pollIntervalMs,
    }, log)),
    `highlights: ${HIGHLIGHTS_ROUTE_PATH}`,
  )
  log.info('highlights route ready at %s records', store.countLive())
}
