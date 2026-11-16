/**
 * Architecture rule: the new client layers may only import downward.
 *
 * Layer order (low → high):
 *   contracts → runtime → {observation, store} → {paint, reveal, notice}
 *   → commands → selection → surfaces
 *
 * `composition/` is the composition root and is exempt. Directories that have
 * not been migrated yet (`data/`, `ui/`, `services/`, legacy files at the
 * client root) are not yet checked; each phase removes one exemption by moving
 * the directory into the layer table.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const CLIENT_ROOT = resolve(process.cwd(), 'src/client')

/** Allowed target layers per source layer (`null` = composition root, anything). */
const ALLOWED: Readonly<Record<string, ReadonlySet<string> | null>> = {
  contracts: new Set(['contracts']),
  runtime: new Set(['contracts', 'runtime']),
  observation: new Set(['contracts', 'runtime', 'observation']),
  store: new Set(['contracts', 'runtime', 'store']),
  paint: new Set(['contracts', 'runtime', 'store', 'paint', 'anchor']),
  reveal: new Set(['contracts', 'runtime', 'paint', 'reveal', 'root']),
  notice: new Set(['contracts', 'runtime', 'notice']),
  commands: new Set(['contracts', 'runtime', 'store', 'reveal', 'notice', 'commands', 'anchor', 'services', 'root']),
  selection: new Set(['contracts', 'runtime', 'commands', 'selection']),
  surfaces: new Set([
    'contracts', 'runtime', 'store', 'paint', 'reveal', 'notice', 'commands', 'selection', 'surfaces', 'anchor', 'services', 'root',
  ]),
  composition: null,
}

/** Legacy directories/files traced later; imports to them from new layers are forbidden. */
const LEGACY_TARGETS = new Set(['data', 'ui'])

/** Walk `.ts`/`.tsx` files under a directory. */
function walk(directory: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(directory)) {
    const full = resolve(directory, entry)
    if (statSync(full).isDirectory()) result.push(...walk(full))
    else if (/\.tsx?$/u.test(entry)) result.push(full)
  }
  return result
}

/** Extract relative import specifiers from one file. */
function relativeImports(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specifiers: string[] = []
  const patterns = [
    /from\s+['"](\.{1,2}\/[^'"]+)['"]/gu,
    /import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/gu,
    /^\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/gmu,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1])
    }
  }
  return specifiers
}

/** First path segment under src/client, or `root` for a direct file. */
function layerOfClientPath(clientRelative: string): string {
  const segments = clientRelative.split(sep)
  if (segments.length === 1) return 'root'
  return segments[0] ?? 'root'
}

describe('architecture/import-rules', () => {
  it('keeps every new layer importing only downward', () => {
    const violations: string[] = []
    for (const file of walk(CLIENT_ROOT)) {
      const clientRelative = relative(CLIENT_ROOT, file)
      const sourceLayer = layerOfClientPath(clientRelative)
      if (!(sourceLayer in ALLOWED)) continue
      const allowed = ALLOWED[sourceLayer]
      if (allowed === null || allowed === undefined) continue
      for (const specifier of relativeImports(file)) {
        const target = resolve(dirname(file), specifier)
        const targetRelative = relative(CLIENT_ROOT, target)
        if (targetRelative.startsWith('..')) continue
        const targetLayer = layerOfClientPath(targetRelative)
        if (targetLayer === 'contracts' && sourceLayer === 'contracts') continue
        if (LEGACY_TARGETS.has(targetLayer) && sourceLayer !== 'surfaces') {
          // The frozen action-face *types* are shared while surfaces migrate to
          // the command plane; transport/client internals are never allowed.
          const isActionFaceTypes = targetRelative.startsWith(`data${sep}actions`)
          if (isActionFaceTypes) continue
          violations.push(`${clientRelative} → ${targetRelative} (legacy target)`)
          continue
        }
        if (!allowed.has(targetLayer)) {
          violations.push(`${clientRelative} → ${targetRelative} (${sourceLayer} ↛ ${targetLayer})`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps contracts free of runtime dependencies', () => {
    const contractsDir = resolve(CLIENT_ROOT, 'contracts')
    const violations: string[] = []
    for (const file of walk(contractsDir)) {
      const source = readFileSync(file, 'utf8')
      for (const specifier of relativeImports(file)) {
        const absoluteTarget = resolve(dirname(file), specifier)
        const target = relative(CLIENT_ROOT, absoluteTarget)
        // Shared type modules (src/shared) are outside the client graph and are
        // allowed: contracts exist to type both halves.
        if (target.startsWith('..')) continue
        if (!target.startsWith(`contracts${sep}`)) violations.push(`${relative(CLIENT_ROOT, file)} → ${target}`)
      }
      // A contracts file must not import a runtime package either.
      if (/from\s+['"](?!\.)[^'"]+['"]/u.test(source) && !/import\s+type\s/u.test(source)) {
        violations.push(`${relative(CLIENT_ROOT, file)} imports a runtime package`)
      }
    }
    expect(violations).toEqual([])
  })
})
