/**
 * Structural contract for the DSH skill registry, declared locally.
 *
 * `ctx.skills` is mounted by `dsh-base` and present in the installed rc.1
 * runtime, but `@deepseek-ai/dsh-skill` is not a dependency of this package, so
 * its declaration is not in this program. This file restates only the subset
 * the plugin calls — the runtime skill contribution — exactly like
 * `src/client/contracts/shortcuts.ts` does for the shortcut service.
 *
 * Authoritative shapes:
 * - `.dsh-src/repo/packages/skill/skill/src/index.ts:439` — `register(skill)`:
 *   runtime skills, default invocation `{ modelInvocable: true, userInvocable:
 *   true }`, default provider the registry-owned runtime provider.
 * - installed rc.1 `.../node_modules/@deepseek-ai/dsh-skill/lib/types/index.d.ts`
 *   — `SkillRegistration`, `SkillInvocationPolicy`, `SkillSummary`.
 *
 * Replaced by the real import the day the package is added as a dependency.
 *
 * workaround: W16 — see `docs/workaround-ledger.md`.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Invocation controls shared by model- and user-facing skill catalogs. */
export interface SkillInvocationPolicy {
  /** Whether model-facing catalogs and loaders include this skill. */
  readonly modelInvocable: boolean
  /** Whether human-facing command catalogs and loaders include this skill. */
  readonly userInvocable: boolean
}

/**
 * One runtime skill contribution accepted by `ctx.skills.register()`.
 *
 * `SkillRegistration` is `Omit<SkillDefinition, 'invocation' | 'provider'> &
 * { invocation?; provider? }`; the plugin supplies neither `provider`
 * (registry-owned runtime provider) nor `metadata`.
 */
export interface SkillRegistration {
  /** Kebab-case identifier used to address the skill. */
  readonly name: string
  /** Short routing description shown in the catalog. */
  readonly description: string
  /** Markdown instruction body loaded by the `skill` tool. */
  readonly content: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Invocation controls; omission permits both surfaces. */
  readonly invocation?: SkillInvocationPolicy
}

/** The skill registry methods this plugin calls. */
export interface SkillService {
  /**
   * Register a runtime skill into the calling context's layer.
   * @param skill - the skill definition input.
   * @returns the exact disposer that unregisters it.
   */
  register(skill: SkillRegistration): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Skill provider registry mounted by the `dsh-base` composition. */
    skills: SkillService
  }
}
