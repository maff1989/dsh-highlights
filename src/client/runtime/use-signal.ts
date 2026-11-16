/**
 * React binding for the runtime signals.
 *
 * Kept in `runtime/` (not a surface helper) so components in every layer can
 * subscribe to one signal without importing a surface module.
 */
import { useEffect, useState } from 'react'

import type { Signal } from '../contracts/scope'

/**
 * Read a signal and re-render when it changes.
 * @param signal - app/session signal.
 * @returns the current value.
 */
export function useSignalValue<T>(signal: Signal<T>): T {
  const [value, setValue] = useState<T>(() => signal.get())
  useEffect(() => {
    // Re-read after subscribing: a change between render and effect would
    // otherwise be missed, leaving a hidden session looking visible.
    setValue(signal.get())
    return signal.subscribe(setValue)
  }, [signal])
  return value
}
