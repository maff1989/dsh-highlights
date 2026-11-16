/**
 * Feature flags for the layer-by-layer re-architecture.
 *
 * The migration is a strangler: each layer lands behind `DSHHL_NEXT_<layer>`,
 * the legacy path stays the default until parity + gates pass, then the flag is
 * deleted. Flags are read lazily (never at module scope) so the client bundle
 * can be evaluated in the build/vm sandbox with no DOM or storage.
 *
 * Override sources, highest first:
 * 1. {@link setFlagOverrides} (tests, dev harness);
 * 2. `localStorage['dsh.highlights.flags.v1']` (a dev can flip a layer without a rebuild);
 * 3. built-in defaults (all `legacy`).
 */

/** Layers that own a migration flag, in dependency order. */
export const FEATURE_LAYERS = ['obs', 'store', 'paint', 'reveal', 'cmd', 'sel', 'surfaces'] as const

/** One migratable layer. */
export type FeatureLayer = (typeof FEATURE_LAYERS)[number]

/** Which implementation a layer resolves to. */
export type FlagMode = 'legacy' | 'next'

/** Resolved mode per layer. */
export type FeatureFlags = Readonly<Record<FeatureLayer, FlagMode>>

/** Storage key a developer may set to flip layers without rebuilding. */
export const FLAG_STORAGE_KEY = 'dsh.highlights.flags.v1'

const DEFAULT_FLAGS: FeatureFlags = {
  obs: 'legacy',
  store: 'legacy',
  paint: 'legacy',
  reveal: 'legacy',
  cmd: 'legacy',
  sel: 'legacy',
  surfaces: 'legacy',
}

let overrides: Partial<Record<FeatureLayer, FlagMode>> | null = null

/** Whether a value is a known layer name. */
function isLayer(value: string): value is FeatureLayer {
  return (FEATURE_LAYERS as readonly string[]).includes(value)
}

/** Whether a value is a known mode. */
function isMode(value: unknown): value is FlagMode {
  return value === 'legacy' || value === 'next'
}

/** Narrow an unknown object to a flag override map. */
function sanitize(input: unknown): Partial<Record<FeatureLayer, FlagMode>> {
  if (input === null || typeof input !== 'object') return {}
  const result: Partial<Record<FeatureLayer, FlagMode>> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isLayer(key) && isMode(value)) result[key] = value
  }
  return result
}

/** Read the developer override from storage, tolerating absent/blocked storage. */
function readStoredOverrides(): Partial<Record<FeatureLayer, FlagMode>> {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    if (storage === undefined) return {}
    const raw = storage.getItem(FLAG_STORAGE_KEY)
    if (raw === null || raw === '') return {}
    return sanitize(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

/** Resolve every layer's mode. */
export function flags(): FeatureFlags {
  const stored = overrides ?? readStoredOverrides()
  return { ...DEFAULT_FLAGS, ...stored }
}

/** Resolve one layer's mode. */
export function flagMode(layer: FeatureLayer): FlagMode {
  return flags()[layer]
}

/** Whether the new implementation of a layer is enabled. */
export function next(layer: FeatureLayer): boolean {
  return flagMode(layer) === 'next'
}

/**
 * Replace the in-memory override map.
 * @param partial - modes by layer, or `null` to fall back to storage/defaults.
 */
export function setFlagOverrides(partial: Partial<Record<FeatureLayer, FlagMode>> | null): void {
  overrides = partial === null ? null : sanitize(partial)
}

/** Drop test overrides; used by test teardown. */
export function resetFlagsForTest(): void {
  overrides = null
}
