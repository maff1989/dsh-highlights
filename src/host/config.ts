/**
 * Host plugin configuration (Schemastery, as Cordis requires for `Config`).
 *
 * Anything two deployments may want to set differently lives here; identities
 * and protocol numbers stay in src/shared/constants.ts.
 */
import Schema from '@deepseek-ai/schemastery'

import { TOMBSTONE_RETENTION_DAYS } from '../shared/constants'

/** Host plugin configuration. */
export interface Config {
  /** Maximum live (non-deleted) records; writes beyond it are refused. */
  maxRecords: number
  /** Append an attribution line when a highlight is inserted into a composer. */
  insertionAttribution: boolean
  /** Optional refresh poll while a highlights surface is visible; 0 disables it. */
  pollIntervalMs: number
  /** Tombstone retention in days before a purge pass removes the record file. */
  purgeTombstonesAfterDays: number
}

/** Validated Host plugin configuration. */
export const Config: Schema<Config> = Schema.object({
  maxRecords: Schema.number().min(100).max(100000).default(10000)
    .description('Maximum live highlights; writes beyond it are refused with a hint.'),
  insertionAttribution: Schema.boolean().default(true)
    .description('Append "— from <session>, <date>" when inserting a highlight into a composer.'),
  pollIntervalMs: Schema.number().min(0).max(600000).default(0)
    .description('Refresh poll while a highlights surface is visible; 0 disables polling.'),
  purgeTombstonesAfterDays: Schema.number().min(1).max(3650).default(TOMBSTONE_RETENTION_DAYS)
    .description('Days a deleted highlight is retained as a tombstone before its file is removed.'),
})
