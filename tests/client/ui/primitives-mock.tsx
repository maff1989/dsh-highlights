/**
 * Functional stand-ins for the shell's ui-primitives module.
 *
 * The real package is a platform module at runtime; its own entry imports
 * `clsx`, which this package never installs. Component tests only need the
 * semantic contract (button/pill/input/menu roles and labels), so each atom is
 * a plain DOM element here and the icons render nothing.
 */
import { createElement, forwardRef } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

/** Stand-in glyph for every icon export. */
function Glyph(): null {
  return null
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: string
  size?: string
  icon?: ReactNode
}

/** Native button carrying the non-DOM visual props out of the attribute set. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, className = '', children, ...rest },
  ref,
) {
  void variant
  void size
  return createElement('button', { ...rest, ref, className }, icon ?? null, children)
})
Button.displayName = 'Button'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
}

/** Native input (the real atom adds a wrapper span and leading icon). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, className = '', ...rest },
  ref,
) {
  void icon
  return createElement('input', { ...rest, ref, className })
})
Input.displayName = 'Input'

/** Selectable pill rendered as a native button. */
export function Pill({ active, className = '', children, ...rest }: {
  active?: boolean
  className?: string
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  void active
  return createElement('button', { type: 'button', ...rest, className }, children)
}

/** Read-only tag rendered as a span. */
export function Tag({ tone, className = '', children }: { tone?: string; className?: string; children?: ReactNode }) {
  void tone
  return createElement('span', { className, 'data-tone': tone }, children)
}

/** One row of a data menu. */
interface MockMenuItem {
  id: string
  label?: ReactNode
  icon?: ReactNode
  type?: string
  danger?: boolean
}

/** Menu that renders its anchor plus the open list in place. */
export function Menu({ open, anchor, items = [], children, onSelect, listClassName, className, portal }: {
  open?: boolean
  anchor?: ReactNode
  items?: readonly MockMenuItem[]
  children?: ReactNode
  onSelect?: (id: string) => void
  listClassName?: string
  className?: string
  /** Real list is portalled to `document.body`; the mock renders in place and
   * marks the list so tests can still pin the portal contract. */
  portal?: boolean
}) {
  const rows = items
    .filter(item => item.type === undefined)
    .map(item => createElement(
      'button',
      {
        key: item.id,
        type: 'button',
        role: 'menuitem',
        onClick: () => { onSelect?.(item.id) },
      },
      item.icon ?? null,
      item.label,
    ))
  return createElement(
    'span',
    { className },
    anchor,
    open === true
      ? createElement('div', { role: 'menu', className: listClassName, 'data-portal': portal === true ? 'true' : undefined }, rows, children)
      : null,
  )
}

/** Bubble that only renders its anchor in tests. */
export function Tooltip({ children }: { children?: ReactNode }) {
  return children ?? null
}

// Icons used by the plugin's components.
export const IconAppsAddOutlineRegular = Glyph
export const IconChevronDownOutlineRegular = Glyph
export const IconCloseOutlineRegular = Glyph
export const IconCopyOutlineRegular = Glyph
export const IconEditOutlineRegular = Glyph
export const IconEllipsisOutlineRegular = Glyph
export const IconListPenOutlineRegular = Glyph
export const IconPaperPlaneOutlineRegular = Glyph
export const IconPinFillRegular = Glyph
export const IconPinOutlineRegular = Glyph
export const IconRightUpOutlineRegular = Glyph
export const IconSearchOutlineRegular = Glyph
export const IconTrashOutlineRegular = Glyph
