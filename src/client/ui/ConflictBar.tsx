/**
 * Inline compare-and-set conflict prompt for an editing surface.
 *
 * The Host reports a lost version race as a value (`{ status: 'conflict' }`),
 * not an error, so a save can be refused while the draft is still on screen.
 * This bar keeps the draft and offers the two decisions the design specifies
 * (DESIGN F3): adopt the stored record, or write the draft over it. It is
 * deliberately inline — no modal — so it belongs inside the card, a panel row
 * or a page row.
 */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'

/** Copy lookup for this component: the conflict keys of the plugin dictionary. */
export type ConflictBarTranslate = (
  key: 'conflict.title' | 'conflict.body' | 'conflict.reload' | 'conflict.overwrite',
) => string

/** Props of the conflict bar. */
export interface ConflictBarProps {
  /** Namespace-bound translate function. */
  readonly t: ConflictBarTranslate
  /** Adopt the live record: reset the draft from the stored version. */
  readonly onReload: () => void
  /**
   * Write the draft again on top of the live version. Omitted where no
   * newest-version retry exists (a refused delete), which hides the button.
   */
  readonly onOverwrite?: () => void
  /** Disable both decisions while a retry is in flight. */
  readonly busy?: boolean
}

/**
 * Render the inline conflict prompt.
 * @param props - copy, the two decisions, and a busy flag.
 * @returns the prompt element.
 */
export function ConflictBar({ t, onReload, onOverwrite, busy = false }: ConflictBarProps): ReactNode {
  return (
    <div className="dshhl-conflict" role="alert">
      <p className="dshhl-conflict__title">{t('conflict.title')}</p>
      <p className="dshhl-conflict__body">{t('conflict.body')}</p>
      <div className="dshhl-conflict__actions">
        <Button variant="ghost" size="sm" onClick={onReload} disabled={busy}>
          {t('conflict.reload')}
        </Button>
        {onOverwrite !== undefined && (
          <Button
            variant="primary"
            size="sm"
            onClick={onOverwrite}
            disabled={busy}
          >
            {t('conflict.overwrite')}
          </Button>
        )}
      </div>
    </div>
  )
}
