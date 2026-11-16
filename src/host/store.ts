/**
 * Durable store for highlights, over the Host's storage-domain facility.
 *
 * Layout is `per-record`: every item is its own JSON document, so one edit or
 * delete rewrites one file instead of the whole unit, and an unbounded store
 * never turns a single write into a full-unit serialization. Reads are
 * synchronous from the domain's authoritative in-memory state; writes are
 * durable before they resolve.
 *
 * Records are immutable values: comparison-and-set is expressed by
 * `expectedVersion` and carried out inside `KvTable.update`, whose read-modify-
 * write runs on the domain's write chain so concurrent writers cannot
 * interleave.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineDomain, domainTable, type Domain, type KvTable } from '@deepseek-ai/dsh-storage-domain'

import { DOMAIN_NAME, SCHEMA_VERSION } from '../shared/constants'
import {
  HighlightRecordSchema,
  InstallRecordSchema,
  normalizeTags,
  type DraftRecord,
  type HighlightAnchor,
  type HighlightId,
  type HighlightRecord,
  type InstallRecord,
  type UpdatePatch,
} from '../shared/schema'
import {
  DEFAULT_AGENT_ACCESS,
  DEFAULT_AGENT_SCOPE,
  DEFAULT_SETTINGS_COLOR_ID,
  SettingsRecordSchema,
  type AgentAccess,
  type AgentScope,
  type ListValue,
  type SettingsPatch,
  type SettingsRecord,
  type SettingsWriteValue,
  type WriteValue,
} from '../shared/protocol'
import type { z } from 'zod'

/** The domain declaration; the facility opens exactly one domain per name. */
export const highlightsDomain = defineDomain({
  name: DOMAIN_NAME,
  version: 1,
  layout: 'per-record',
  // One schema-invalid record must never disable the feature: quarantine it and
  // keep serving the valid ones (REVIEW H11 / ADR-027).
  invalidRecords: 'backup-and-skip',
  tables: {
    records: domainTable<HighlightId, HighlightRecord>(HighlightRecordSchema as unknown as z.ZodType<HighlightRecord>),
    meta: domainTable<'install', InstallRecord>(InstallRecordSchema),
    // Consent/preference settings: one global row. A new table is a new
    // per-record directory, so an existing install opens with it empty and no
    // migration is needed (the domain format version stays 1).
    settings: domainTable<'settings', SettingsRecord>(SettingsRecordSchema as unknown as z.ZodType<SettingsRecord>),
  },
})

/** Opened domain handle type. */
export type HighlightsDomain = typeof highlightsDomain

/** One record is missing (or tombstoned where a live record was required). */
export class NotFoundError extends Error {
  constructor(readonly id: string) {
    super(`highlight ${id} not found`)
    this.name = 'NotFoundError'
  }
}

/** The live-record cap would be exceeded. */
export class LimitError extends Error {
  constructor(readonly maxRecords: number) {
    super(`highlight limit reached (${maxRecords} records)`)
    this.name = 'LimitError'
  }
}

/** Raised inside `KvTable.update` to abort a stale write; never escapes the store. */
class StaleVersionError extends Error {}

/** A create reused an id that already exists (put-if-absent violation). */
export class DuplicateIdError extends Error {
  constructor(readonly id: string) {
    super(`highlight ${id} already exists`)
    this.name = 'DuplicateIdError'
  }
}

/** A re-anchor tried to change identity that invariants keep immutable. */
export class InvalidReanchorError extends Error {
  constructor(reason: string) {
    super(`invalid re-anchor: ${reason}`)
    this.name = 'InvalidReanchorError'
  }
}

/** A settings write asked for a state the consent model forbids. */
export class SettingsInvariantError extends Error {
  constructor(reason: string) {
    super(`invalid settings: ${reason}`)
    this.name = 'SettingsInvariantError'
  }
}

/** Key of the single settings row in the `settings` table. */
const SETTINGS_KEY = 'settings' as const

/**
 * The values served before the first settings write, without materialising a
 * record: an install that never opens Settings writes nothing.
 * @returns the default settings record (version 0).
 */
function defaultSettings(): SettingsRecord {
  return {
    version: 0,
    agentAccess: DEFAULT_AGENT_ACCESS,
    agentScope: DEFAULT_AGENT_SCOPE,
    defaultColorId: DEFAULT_SETTINGS_COLOR_ID,
    createdAt: 0,
    updatedAt: 0,
  }
}

/** Limits the Host plugin config applies to the store. */
export interface StoreLimits {
  /** Maximum live records. */
  readonly maxRecords: number
  /** Tombstone retention in days. */
  readonly tombstoneDays: number
}

/**
 * Mint a UUIDv7: 48-bit big-endian millisecond timestamp, random tail.
 * @param now - Millisecond timestamp to embed.
 * @returns the formatted UUID.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[0] = (now / 2 ** 40) & 0xff
  bytes[1] = (now / 2 ** 32) & 0xff
  bytes[2] = (now / 2 ** 24) & 0xff
  bytes[3] = (now / 2 ** 16) & 0xff
  bytes[4] = (now / 2 ** 8) & 0xff
  bytes[5] = now & 0xff
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * The plugin's durable store.
 *
 * Construct through {@link HighlightStore.open}; the caller owns {@link close}.
 */
export class HighlightStore {
  /** Per-process write counter exposed to the browser for staleness checks. */
  private revision = 1
  /** Serialises create's cap/id admission with its durable put (put-if-absent). */
  private createChain: Promise<unknown> = Promise.resolve()
  /** Serialises settings writes so the first (unstored) write is put-if-absent. */
  private settingsChain: Promise<unknown> = Promise.resolve()
  /** Cached install identity (a single global record in the `meta` table). */
  private install: InstallRecord | undefined
  /** Values served while no settings record has been written. */
  private readonly defaultSettings: SettingsRecord = defaultSettings()

  private constructor(
    private readonly domain: Domain<HighlightsDomain>,
    private readonly limits: StoreLimits,
  ) {}

  /**
   * Open the domain, ensure the install identity, and purge expired tombstones.
   * @param ctx - Host context owning the storage facility.
   * @param limits - Caps the plugin config applies.
   * @returns the ready store.
   */
  static async open(ctx: Context, limits: StoreLimits): Promise<HighlightStore> {
    const domain = await ctx.storageDomain.open(highlightsDomain)
    try {
      const store = new HighlightStore(domain, limits)
      store.install = await store.ensureInstall()
      await store.purgeTombstones()
      return store
    } catch (error) {
      await domain.close()
      throw error
    }
  }

  /** Close the domain and release its backend unit. */
  async close(): Promise<void> {
    await this.domain.close()
  }

  /** The install identity every record carries as its origin. */
  get installId(): string {
    return this.install?.installId ?? 'unknown-install'
  }

  /** The live-record cap this store enforces. */
  get maxRecords(): number {
    return this.limits.maxRecords
  }

  /** Number of live (non-tombstoned) records. */
  countLive(): number {
    let count = 0
    for (const [, record] of this.records().entries()) {
      if (record.deletedAt === undefined) count += 1
    }
    return count
  }

  /** Tombstone retention the deployment applies, in days (read-only copy). */
  get tombstoneRetentionDays(): number {
    return this.limits.tombstoneDays
  }

  /**
   * Read the settings record. Synchronous from the domain's in-memory state,
   * exactly like the record reads; the defaults are served (version 0) until
   * the first write, so an install that never opens Settings stores nothing.
   * @returns the live settings record.
   */
  settings(): SettingsRecord {
    return this.settingsTable().get(SETTINGS_KEY) ?? this.defaultSettings
  }

  /**
   * The consent level the Host must gate model-facing behaviour on. Read from
   * the Host's own durable record, never from a browser-supplied value.
   */
  get agentAccess(): AgentAccess {
    return this.settings().agentAccess
  }

  /** The read range the Host applies when agent access is on. */
  get agentScope(): AgentScope {
    return this.settings().agentScope
  }

  /**
   * Merge one validated patch into the settings record (compare-and-set).
   *
   * The Host owns the invariants, not the caller: a widened read range is
   * refused while access is off, and turning access off narrows the range back
   * to `session` so a stale widening never survives a later withdrawal.
   * @param expectedVersion - Version the caller read (0 when serving defaults).
   * @param patch - Validated fields to change.
   * @param now - Millisecond timestamp (injectable for tests).
   * @returns the accepted record, or the live record when the version was stale.
   * @throws {SettingsInvariantError} when the requested state breaks consent rules.
   */
  async setSettings(expectedVersion: number, patch: SettingsPatch, now: number = Date.now()): Promise<SettingsWriteValue> {
    const run = async (): Promise<SettingsWriteValue> => {
      const stored = this.settingsTable().get(SETTINGS_KEY)
      const current = stored ?? this.defaultSettings
      if (current.version !== expectedVersion) return { status: 'conflict', settings: current }
      const nextAccess = patch.agentAccess ?? current.agentAccess
      if (nextAccess === 'off' && patch.agentScope !== undefined && patch.agentScope !== 'session') {
        throw new SettingsInvariantError('agent scope cannot widen while agent access is off')
      }
      const nextScope: AgentScope = nextAccess === 'off' ? 'session' : patch.agentScope ?? current.agentScope
      const candidate = SettingsRecordSchema.parse({
        version: current.version + 1,
        agentAccess: nextAccess,
        agentScope: nextScope,
        defaultColorId: patch.defaultColorId ?? current.defaultColorId,
        createdAt: stored === undefined ? now : stored.createdAt,
        updatedAt: Math.max(now, current.updatedAt + 1),
      })
      if (stored === undefined) {
        // Put-if-absent: the settings chain makes this the only first writer.
        await this.settingsTable().put(SETTINGS_KEY, candidate)
        return { status: 'written', settings: candidate }
      }
      try {
        const written = await this.settingsTable().update(SETTINGS_KEY, live => {
          if (live.version !== expectedVersion) throw new StaleVersionError()
          // The domain re-validates stored values at the durable boundary; this
          // parse keeps the same promise for a concurrent in-process writer.
          return SettingsRecordSchema.parse(candidate)
        })
        return { status: 'written', settings: written }
      } catch (error) {
        if (error instanceof StaleVersionError) return { status: 'conflict', settings: this.settings() }
        throw error
      }
    }
    const next = this.settingsChain.then(run, run)
    this.settingsChain = next.catch(() => undefined)
    return next
  }

  /**
   * Read every stored record.
   * @param includeTombstones - Include soft-deleted records (used by a future syncer).
   * @returns the revision and the records.
   */
  list(includeTombstones = false): ListValue {
    const records: HighlightRecord[] = []
    for (const [, record] of this.records().entries()) {
      if (!includeTombstones && record.deletedAt !== undefined) continue
      records.push(record)
    }
    return { revision: this.revision, records }
  }

  /**
   * Insert one record.
   * @param draft - Validated create payload.
   * @param now - Millisecond timestamp (injectable for tests).
   * @returns the stored record.
   * @throws {LimitError} when the live-record cap is reached.
   */
  async create(draft: DraftRecord, now: number = Date.now()): Promise<HighlightRecord> {
    const run = async (): Promise<HighlightRecord> => {
      if (this.countLive() >= this.limits.maxRecords) throw new LimitError(this.limits.maxRecords)
      // Put-if-absent: a reused id must not silently overwrite another record.
      if (this.records().get(draft.id) !== undefined) throw new DuplicateIdError(draft.id)
      const anchor: HighlightAnchor = draft.anchor
      const record: HighlightRecord = HighlightRecordSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        id: draft.id,
        sessionId: draft.sessionId,
        ...(draft.workspaceId === undefined ? {} : { workspaceId: draft.workspaceId }),
        ...(draft.workspacePath === undefined ? {} : { workspacePath: draft.workspacePath }),
        ...(draft.sessionTitle === undefined ? {} : { sessionTitle: draft.sessionTitle }),
        // The Host stamps origin; a browser cannot claim another install.
        origin: this.installId,
        anchor,
        colorId: draft.colorId,
        tags: normalizeTags(draft.tags),
        ...(draft.note === undefined ? {} : { note: draft.note }),
        starred: draft.starred,
        createdAt: now,
        updatedAt: now,
        version: 1,
      })
      await this.records().put(record.id, record)
      this.revision += 1
      return record
    }
    const next = this.createChain.then(run, run)
    this.createChain = next.catch(() => undefined)
    return next
  }

  /**
   * Patch the presentation fields of one record.
   * @param id - Record id.
   * @param expectedVersion - Version the caller read.
   * @param patch - Fields to change.
   * @param now - Millisecond timestamp (injectable for tests).
   * @returns the written record, or the live record when the version was stale.
   */
  async update(id: string, expectedVersion: number, patch: UpdatePatch, now: number = Date.now()): Promise<WriteValue> {
    return this.mutate(id, expectedVersion, current => {
      const next: HighlightRecord = {
        ...current,
        colorId: patch.colorId ?? current.colorId,
        tags: patch.tags === undefined ? current.tags : normalizeTags(patch.tags),
        starred: patch.starred ?? current.starred,
        updatedAt: Math.max(now, current.updatedAt + 1),
        version: current.version + 1,
      }
      // `null` means "remove the note": the spread above kept the old value, so
      // the key has to be deleted explicitly rather than replaced with nothing.
      if (patch.note === null) delete next.note
      else if (patch.note !== undefined) next.note = patch.note
      return next
    })
  }

  /**
   * Replace the anchor after a successful re-anchor attempt.
   * @param id - Record id.
   * @param expectedVersion - Version the caller read.
   * @param anchor - New anchor (same quote semantics, possibly new offsets/ids).
   * @param now - Millisecond timestamp (injectable for tests).
   * @returns the written record, or the live record when the version was stale.
   */
  async reanchor(id: string, expectedVersion: number, anchor: HighlightAnchor, now: number = Date.now()): Promise<WriteValue> {
    return this.mutate(id, expectedVersion, current => {
      // Re-anchoring moves offsets/ids only: quote and kind are the record's
      // recognition identity and must not change under the same record.
      if (anchor.quote !== current.anchor.quote) throw new InvalidReanchorError('quote is immutable')
      if (anchor.kind !== current.anchor.kind) throw new InvalidReanchorError('kind is immutable')
      return {
        ...current,
        anchor,
        updatedAt: Math.max(now, current.updatedAt + 1),
        version: current.version + 1,
      }
    })
  }

  /**
   * Soft-delete one record (tombstone; kept for the retention window).
   * @param id - Record id.
   * @param expectedVersion - Version the caller read.
   * @param now - Millisecond timestamp (injectable for tests).
   * @returns the tombstoned record, or the live record when the version was stale.
   */
  async remove(id: string, expectedVersion: number, now: number = Date.now()): Promise<WriteValue> {
    const existing = this.live(id)
    if (existing.version !== expectedVersion) return { status: 'conflict', record: existing }
    return this.mutate(id, expectedVersion, current => ({
      ...current,
      deletedAt: now,
      updatedAt: Math.max(now, current.updatedAt + 1),
      version: current.version + 1,
    }))
  }

  /**
   * Undo a soft delete.
   * @param id - Record id.
   * @param expectedVersion - Version the caller read.
   * @param now - Millisecond timestamp (injectable for tests).
   * @returns the restored record, or the live record when the version was stale.
   */
  async restore(id: string, expectedVersion: number, now: number = Date.now()): Promise<WriteValue> {
    const existing = this.records().get(id)
    if (existing === undefined) throw new NotFoundError(id)
    if (existing.version !== expectedVersion) return { status: 'conflict', record: existing }
    return this.mutateRecord(existing, expectedVersion, current => ({
      ...current,
      updatedAt: Math.max(now, current.updatedAt + 1),
      version: current.version + 1,
      deletedAt: undefined,
    }))
  }

  /**
   * Remove tombstoned records older than the configured retention.
   * @param now - Millisecond timestamp (injectable for tests).
   * @returns how many records were purged.
   */
  async purgeTombstones(now: number = Date.now()): Promise<number> {
    const cutoff = now - this.limits.tombstoneDays * 24 * 60 * 60 * 1000
    const expired: HighlightId[] = []
    for (const [id, record] of this.records().entries()) {
      if (record.deletedAt !== undefined && record.deletedAt < cutoff) expired.push(id)
    }
    if (expired.length === 0) return 0
    await this.records().deleteMany(expired)
    this.revision += 1
    return expired.length
  }

  /** The records table handle. */
  private records(): KvTable<HighlightId, HighlightRecord> {
    return this.domain.table('records')
  }

  /** The settings table handle (one row, key {@link SETTINGS_KEY}). */
  private settingsTable(): KvTable<'settings', SettingsRecord> {
    return this.domain.table('settings')
  }

  /** Read one live record or throw. */
  private live(id: string): HighlightRecord {
    const record = this.records().get(id)
    if (record === undefined || record.deletedAt !== undefined) throw new NotFoundError(id)
    return record
  }

  /** Ensure the install identity exists. */
  private async ensureInstall(): Promise<InstallRecord> {
    const table = this.domain.table('meta')
    const existing = table.get('install')
    if (existing !== undefined) return existing
    const created: InstallRecord = { installId: uuidv7(), createdAt: Date.now() }
    await table.put('install', created)
    return created
  }

  /** Apply one version-guarded mutation. */
  private async mutate(
    id: string,
    expectedVersion: number,
    transform: (current: HighlightRecord) => HighlightRecord,
  ): Promise<WriteValue> {
    return this.mutateRecord(this.live(id), expectedVersion, transform)
  }

  /** Apply one version-guarded mutation to a known record value. */
  private async mutateRecord(
    existing: HighlightRecord,
    expectedVersion: number,
    transform: (current: HighlightRecord) => HighlightRecord,
  ): Promise<WriteValue> {
    if (existing.version !== expectedVersion) return { status: 'conflict', record: existing }
    try {
      const next = await this.records().update(existing.id, current => {
        if (current.version !== expectedVersion) throw new StaleVersionError()
        const candidate = transform(current)
        // Validate before the durable write so a malformed transform never lands.
        HighlightRecordSchema.parse(candidate)
        return candidate
      })
      this.revision += 1
      return { status: 'written', record: next }
    } catch (error) {
      if (error instanceof StaleVersionError) {
        const live = this.records().get(existing.id)
        if (live !== undefined) return { status: 'conflict', record: live }
      }
      throw error
    }
  }
}
