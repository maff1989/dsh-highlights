/**
 * Compact undo strip shared by the page, the panel and the item card.
 *
 * One small line, not an alert header: the surface renders it without shifting
 * the rows around it (the panel positions it over the body; the card shows it in
 * place of the editor). It never expires on a timer — the reader dismisses it,
 * undoes, or uses "Don't ask again".
 */
import type { ReactNode } from 'react'

/** Props of the compact undo strip. */
export interface UndoBarProps {
  /** Namespace-bound translate function. */
  readonly t: (key: string, params?: Record<string, string | number>) => string
  /** Extra class for surface-specific placement. */
  readonly className?: string
  /** Restore the deleted record. */
  readonly onUndo: () => void
  /** Dismiss this prompt only. */
  readonly onDismiss: () => void
  /** Persist "don't ask again" and dismiss. */
  readonly onDontAsk: () => void
}

/**
 * Render the compact undo line.
 * @param props - copy and the three decisions.
 * @returns the strip.
 */
export function UndoBar({ t, className, onUndo, onDismiss, onDontAsk }: UndoBarProps): ReactNode {
  return (
    <div className={`dshhl-undo${className === undefined ? '' : ` ${className}`}`} role="status">
      <span className="dshhl-undo__text">{t('action.delete.tombstone')}</span>
      <button type="button" className="dshhl-undo__action" onClick={onUndo}>
        {t('action.undo')}
      </button>
      <button type="button" className="dshhl-undo__dontAsk" onClick={onDontAsk}>
        {t('action.undo.dontAsk')}
      </button>
      <button type="button" className="dshhl-undo__close" aria-label={t('action.dismiss')} onClick={onDismiss}>
        ×
      </button>
    </div>
  )
}
