/**
 * The processing cursor: one quiet chip that cycles `new → kept → compiled`.
 *
 * The chip is a *control*, not a label. A click (or Enter/Space) advances one
 * step and wraps back to `new`; `←`/`→` on the focused chip move it backwards /
 * forwards. It stays quiet in the metadata line: only the current state is
 * named, and the colours of `kept`/`compiled` are the only emphasis.
 *
 * Writes are optimistic and single-flight per row: the chip shows the next
 * value immediately (the stored record arrives a beat later, so reading the
 * prop while the write is in flight would flicker backwards), a second click
 * while one write is pending is ignored, and a write that does not land rolls
 * back to the stored value and tells the surface through `onFailure`.
 *
 * `←` at `new` is a no-op rather than a wrap: the natural meaning of "back" at
 * the start of the ladder is "there is nothing before this", and silently
 * jumping to `compiled` would lose the reader's place.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { RECORD_STATE_VALUES, stateOf, type RecordState } from '../../../shared/provenance'
import type { HighlightRecord, WriteOutcome } from '../../data/actions'
import { stateLabel, type PageTranslate } from './grouping'

/** Props of one cursor chip. */
export interface StateChipProps {
  /** Namespace-bound copy. */
  readonly t: PageTranslate
  /** The record whose cursor this chip shows. */
  readonly record: HighlightRecord
  /** Persist one step; resolves with the Host outcome (the chip owns rollback). */
  readonly write: (next: RecordState) => Promise<WriteOutcome>
  /** Called after a failed write rolled the chip back, so the surface can say so. */
  readonly onFailure?: () => void
  /** Suppressed while the row's own edit is being saved. */
  readonly disabled?: boolean
}

/**
 * Render the cursor chip for one record.
 * @param props - the record, the write path, and the failure hook.
 * @returns the chip button.
 */
export function StateChip({ t, record, write, onFailure, disabled = false }: StateChipProps): ReactNode {
  const stored = stateOf(record)
  /** The value shown while a write is in flight; cleared once the store catches up. */
  const [optimistic, setOptimistic] = useState<RecordState | undefined>(undefined)
  /** Synchronous guard: React state would not have re-rendered before a double click. */
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const display = optimistic ?? stored

  // Adopt the stored value once the write has landed. Until then the chip keeps
  // the optimistic value, so a slow write cannot flicker the label backwards.
  useEffect(() => {
    if (optimistic !== undefined && stored === optimistic) setOptimistic(undefined)
  }, [stored, optimistic])

  /** Move one step (forward wraps, backward stops at `new`). */
  const step = useCallback((delta: 1 | -1): void => {
    if (inFlight.current || disabled) return
    const index = RECORD_STATE_VALUES.indexOf(display)
    const nextIndex = delta === 1 ? (index + 1) % RECORD_STATE_VALUES.length : index - 1
    const next = RECORD_STATE_VALUES[nextIndex]
    if (next === undefined) return
    inFlight.current = true
    setBusy(true)
    setOptimistic(next)
    void (async () => {
      try {
        const outcome = await write(next)
        if (outcome.status !== 'written') {
          setOptimistic(undefined)
          onFailure?.()
        }
      } catch {
        // A thrown transport error is a failed write like any other.
        setOptimistic(undefined)
        onFailure?.()
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    })()
  }, [disabled, display, onFailure, write])

  const advance = useCallback((): void => { step(1) }, [step])
  const retreat = useCallback((): void => { step(-1) }, [step])
  const label = stateLabel(t, display)

  return (
    <button
      type="button"
      className="dshhl-stateChip"
      data-state={display}
      aria-label={t('cursor.label', { state: label })}
      title={t('cursor.hint')}
      aria-busy={busy}
      disabled={disabled}
      onClick={advance}
      onKeyDown={event => {
        // The chip owns the arrows while it has focus: one keypress = one step.
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          advance()
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          retreat()
        }
      }}
    >
      {label}
    </button>
  )
}
