/**
 * Browser-side transport of the settings endpoints on the existing
 * `/api/highlights` exact Fetch route.
 *
 * Same envelope as the record transport (`{ endpoint, payload }` in,
 * `{ ok, value } | { ok, error }` out, HTTP 200 for business outcomes); the
 * route owns authentication and the owner-Peer fence, so a same-origin
 * credentialed fetch is the whole transport. Kept as its own small module
 * because the record transport's face is frozen for the list surfaces.
 */
import { HIGHLIGHTS_ROUTE_PATH } from '../../../shared/constants'
import type { SetSettingsInput, SettingsValue, SettingsWriteValue } from '../../../shared/protocol'
import { HighlightsRpcError, type HighlightsErrorCode } from '../../data/transport'

/** The typed settings surface the controller consumes. */
export interface SettingsTransport {
  read(signal?: AbortSignal): Promise<SettingsValue>
  write(input: SetSettingsInput, signal?: AbortSignal): Promise<SettingsWriteValue>
}

/** Route path, resolved against the document base so a mounted app still works. */
const ROUTE_PATH = HIGHLIGHTS_ROUTE_PATH.replace(/^\//u, '')

/** Success/error envelope the Host returns. */
type Envelope<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { code: string; message: string } }

/** Resolve the route URL for the current document. */
function routeUrl(): URL {
  // Unit tests run without a DOM; production always has document.baseURI.
  const base = (globalThis as { document?: Document }).document?.baseURI ?? 'http://localhost/'
  return new URL(ROUTE_PATH, base)
}

/**
 * POST one endpoint through the shared route envelope.
 * @param endpoint - endpoint name handled by the Host dispatcher.
 * @param payload - endpoint payload (already validated by the Host).
 * @param signal - optional abort signal.
 * @returns the endpoint value.
 */
async function call<T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(routeUrl(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint, payload }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new HighlightsRpcError('transport', error instanceof Error ? error.message : 'network request failed')
  }
  if (!response.ok) {
    const status = response.status
    if (status === 401 || status === 403) throw new HighlightsRpcError('forbidden', `highlights route refused access (HTTP ${String(status)})`)
    if (status === 404) throw new HighlightsRpcError('not-found', `highlights route is not mounted (HTTP ${String(status)})`)
    if (status === 400 || status === 422) throw new HighlightsRpcError('bad-request', `highlights route rejected the request (HTTP ${String(status)})`)
    throw new HighlightsRpcError('transport', `highlights route answered HTTP ${String(status)}`)
  }
  let envelope: Envelope<T>
  try {
    envelope = await response.json() as Envelope<T>
  } catch {
    throw new HighlightsRpcError('transport', 'highlights route answered non-JSON content')
  }
  if (!envelope.ok) throw new HighlightsRpcError(envelope.error.code as HighlightsErrorCode, envelope.error.message)
  return envelope.value
}

/**
 * Create the settings transport.
 * @returns the typed settings transport.
 */
export function createSettingsTransport(): SettingsTransport {
  return {
    read: signal => call<SettingsValue>('getSettings', {}, signal),
    write: (input, signal) => call<SettingsWriteValue>('setSettings', input, signal),
  }
}
