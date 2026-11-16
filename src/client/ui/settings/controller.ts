/**
 * Shared state of the settings surfaces.
 *
 * One controller backs both the Settings section and the two General rows, so a
 * change made in either place is reflected everywhere without a second read.
 * Reads are whole-record (`getSettings`); writes carry the version that was read
 * and the Host answers a lost race with `conflict`, which this controller folds
 * into a fresh read instead of overwriting someone else's consent change.
 */
import type { SettingsPatch, SettingsRecord } from '../../../shared/protocol'
import type { ReadonlySignal } from '../../contracts/scope'
import { createSignal, type WritableSignal } from '../../runtime/signal'
import type { SettingsTransport } from './transport'

/** Load state of the settings record. */
export type SettingsStatus = 'idle' | 'loading' | 'ready' | 'error'

/** What every settings surface observes. */
export interface SettingsSnapshot {
  readonly status: SettingsStatus
  /** Host truth; undefined until the first successful read. */
  readonly settings: SettingsRecord | undefined
  /** Deployment tombstone retention, for the read-only retention row. */
  readonly retentionDays: number | undefined
  /** A write is in flight; controls stay disabled until it settles. */
  readonly saving: boolean
  /** The last read failed; `settings` keeps the previous truth. */
  readonly loadFailed: boolean
  /** The last write failed; controls already show the unchanged Host truth. */
  readonly saveFailed: boolean
  /** A write lost the compare-and-set race and the Host values were re-read. */
  readonly conflicted: boolean
}

/** The settings surfaces' shared face. */
export interface SettingsController {
  /** Current state; every mounted surface subscribes to this one signal. */
  readonly state: ReadonlySignal<SettingsSnapshot>
  /** Load once when idle or after a failure; safe to call on every mount. */
  ensure(): void
  /** Force a read (a retry, or after the connection returns). */
  refresh(): void
  /**
   * Apply one patch with compare-and-set.
   * @param patch - fields to change.
   * @returns true when the Host accepted the write.
   */
  update(patch: SettingsPatch): Promise<boolean>
  /** Release the state; in-flight results are ignored. */
  dispose(): void
}

/** Injection points for tests. */
export interface SettingsControllerOptions {
  readonly transport: SettingsTransport
}

/** Initial state before the first read. */
const INITIAL: SettingsSnapshot = {
  status: 'idle',
  settings: undefined,
  retentionDays: undefined,
  saving: false,
  loadFailed: false,
  saveFailed: false,
  conflicted: false,
}

/**
 * Create the settings controller.
 * @param options - transport (and test doubles).
 * @returns the controller.
 */
export function createSettingsController(options: SettingsControllerOptions): SettingsController {
  const state: WritableSignal<SettingsSnapshot> = createSignal(INITIAL)
  const { transport } = options
  let disposed = false
  let readInFlight: Promise<void> | undefined

  /** Publish a partial state patch. */
  function patchState(patch: Partial<SettingsSnapshot>): void {
    if (disposed) return
    state.update(current => ({ ...current, ...patch }))
  }

  /** Read the Host record once; concurrent callers share the in-flight read. */
  async function read(): Promise<void> {
    if (disposed) return
    if (readInFlight !== undefined) {
      await readInFlight
      return
    }
    const run = (async (): Promise<void> => {
      patchState({ status: state.get().settings === undefined ? 'loading' : state.get().status, loadFailed: false })
      try {
        const value = await transport.read()
        patchState({
          status: 'ready',
          settings: value.settings,
          retentionDays: value.retentionDays,
          loadFailed: false,
        })
      } catch {
        if (disposed) return
        patchState(state.get().settings === undefined ? { status: 'error', loadFailed: true } : { loadFailed: true })
      }
    })()
    readInFlight = run
    try {
      await run
    } finally {
      if (readInFlight === run) readInFlight = undefined
    }
  }

  return {
    state,
    ensure() {
      const snapshot = state.get()
      if (snapshot.status === 'idle' || snapshot.status === 'error') void read()
    },
    refresh() {
      void read()
    },
    async update(patch) {
      const snapshot = state.get()
      if (disposed || snapshot.settings === undefined || snapshot.saving) return false
      patchState({ saving: true, saveFailed: false, conflicted: false })
      try {
        const result = await transport.write({ expectedVersion: snapshot.settings.version, patch })
        if (result.status === 'written') {
          patchState({ status: 'ready', saving: false, settings: result.settings })
          return true
        }
        // Lost the race: show the Host's current values, not the caller's
        // staged ones. The next click writes against the re-read version.
        patchState({ saving: false, conflicted: true })
        await read()
        return false
      } catch {
        patchState({ saving: false, saveFailed: true })
        return false
      }
    },
    dispose() {
      disposed = true
      readInFlight = undefined
    },
  }
}
