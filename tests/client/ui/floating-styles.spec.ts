// @vitest-environment jsdom
/**
 * Regression guard for the capture surface's palette and material rules
 * (audit F1/F2/F11/F21, plan T1.1/T1.3/T1.4).
 *
 * The stylesheets are plain strings, so the rules that matter can be asserted
 * directly: five distinct semantic aliases at one shared alpha, elevated
 * surfaces with `border: 0` + an elevation shadow (never a hairline border plus
 * lv2), the radius/height standards, and reduced-motion gating. The rendered
 * result still has to be compared visually; this only stops a regression from
 * silently reintroducing the rejected pairings.
 */
import { describe, expect, it } from 'vitest'

import { COMPONENT_STYLES, GLOBAL_STYLES } from '../../../src/client/styles'

/**
 * Return the declaration block of one selector.
 * @param css - stylesheet text.
 * @param selector - exact selector to locate (first occurrence).
 * @returns the block's declarations.
 */
function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css)
  if (match === null) throw new Error(`selector not found: ${selector}`)
  return match[1] ?? ''
}

/** The five palette custom-property declarations, in slot order. */
function palette(): string[] {
  return [1, 2, 3, 4, 5].map(slot => {
    const match = new RegExp(`--dsh-hl-${String(slot)}:\\s*([^;]+);`, 'u').exec(GLOBAL_STYLES)
    if (match === null) throw new Error(`palette slot ${String(slot)} missing`)
    return match[1] ?? ''
  })
}

/** The semantic alias each slot mixes (its first `var()`, not the fallback). */
function aliasOf(expression: string): string {
  const match = /^color-mix\(in srgb, var\((`)?(--dsw-alias-[a-z0-9-]+)/u.exec(expression.trim())
  if (match === null) throw new Error(`unexpected palette expression: ${expression}`)
  return match[2] ?? ''
}

describe('highlight palette (T1.1)', () => {
  it('mixes five distinct semantic aliases at one shared alpha', () => {
    const expressions = palette()
    for (const expression of expressions) {
      expect(expression).toContain('color-mix(in srgb, var(--dsw-alias-')
      expect(expression).toContain('24%, transparent)')
    }
    const aliases = expressions.map(aliasOf)
    expect(new Set(aliases).size).toBe(5)
  })

  it('points slot 3 at the theme violet instead of the monochrome brand token', () => {
    const slot3 = palette()[2] ?? ''
    expect(slot3).toContain('--dsw-alias-state-done-primary')
    // The brand alias may remain only as the missing-token fallback.
    expect(aliasOf(slot3)).not.toBe('--dsw-alias-brand-primary')
  })
})

describe('floating surfaces (T1.3)', () => {
  const surfaces = ['.dshhl-surface', '.dshhl-card', '.dshhl-popover']

  it('use elevated-surface material instead of a hairline border with lv2', () => {
    for (const selector of surfaces) {
      const declarations = block(COMPONENT_STYLES, selector)
      expect(declarations, selector).toContain('border: 0')
      expect(declarations, selector).toContain('--dsw-elevation-')
      expect(declarations, selector).not.toContain('--dsw-shadow-lv2')
      expect(declarations, selector).not.toContain('--dsw-alias-border-')
    }
  })

  it('sit on the control scale with the standard radii and 13px base type', () => {
    expect(block(COMPONENT_STYLES, '.dshhl-surface')).toContain('height: 36px')
    expect(block(COMPONENT_STYLES, '.dshhl-surface')).toContain('border-radius: 999px')
    expect(block(COMPONENT_STYLES, '.dshhl-surface')).toContain('corner-shape: round')
    for (const selector of ['.dshhl-card', '.dshhl-popover']) {
      expect(block(COMPONENT_STYLES, selector), selector).toContain('border-radius: var(--dsw-radius-xl)')
      expect(block(COMPONENT_STYLES, selector), selector).toContain('font-size: 13px')
    }
  })

  it('keeps list rows on the shared radius token', () => {
    expect(block(COMPONENT_STYLES, '.dshhl-row')).toContain('border-radius: var(--dsw-radius-md)')
    expect(COMPONENT_STYLES).not.toContain('border-radius: 12px')
  })

  it('gates swatch movement behind reduced-motion', () => {
    expect(COMPONENT_STYLES).toContain('@media (prefers-reduced-motion: no-preference)')
    expect(COMPONENT_STYLES).toMatch(/prefers-reduced-motion: no-preference\)\s*(and\s*\(hover: hover\))?\s*\{\s*\.dshhl-swatch:hover/u)
  })

  it('no longer carries the bespoke bottom-centre toast (T1.4 moves it to the shell overlay)', () => {
    expect(COMPONENT_STYLES).not.toContain('.dshhl-toast')
  })
})
