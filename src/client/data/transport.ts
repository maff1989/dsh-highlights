/**
 * Client for the `/api/highlights` exact Fetch route.
 *
 * The browser posts one JSON envelope (`{ endpoint, payload }`) and receives
 * the same `{ ok, value } | { ok, error }` result a Remote call would carry.
 * Connection owns authentication and the owner-Peer fence on the Host side, so
 * a same-origin credentialed fetch is the whole transport.
 */
import type { HighlightRecord } from '../../shared/schema'
import { HIGHLIGHTS_ROUTE_PATH } from '../../shared/constants'
import type { HelloValue, ListValue, QueryInput, QueryValue, WriteValue } from '../../shared/protocol'

/** Stable failure codes the Host may report. */
export type HighlightsErrorCode =
  | 'bad-request'
  | 'unknown-endpoint'
  | 'not-found'
  | 'limit-exceeded'
  | 'forbidden'
  | 'internal'
  | 'transport'

/** Raised for any Host-reported or transport-level failure. */
export class HighlightsRpcError extends Error {
  constructor(
    readonly code: HighlightsErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'HighlightsRpcError'
  }
}

/** Route path, resolved against the document base so a mounted app still works. */
const ROUTE_PATH = HIGHLIGHTS_ROUTE_PATH.replace(/^\//u, '')

/** Success/error envelope the Host returns. */
type Envelope<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { code: string; message: string } }

/** The typed surface the rest of the browser half consumes. */
export interface HighlightsTransport {
  hello(signal?: AbortSignal): Promise<HelloValue>
  list(includeTombstones?: boolean, signal?: AbortSignal): Promise<ListValue>
  query(input: QueryInput, signal?: AbortSignal): Promise<QueryValue>
  create(record: Omit<HighlightRecord, 'schemaVersion' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'>, signal?: AbortSignal): Promise<HighlightRecord>
  update(id: string, expectedVersion: number, patch: { colorId?: number; tags?: string[]; note?: string | null; starred?: boolean }, signal?: AbortSignal): Promise<WriteValue>
  reanchor(id: string, expectedVersion: number, anchor: HighlightRecord['anchor'], signal?: AbortSignal): Promise<WriteValue>
  remove(id: string, expectedVersion: number, signal?: AbortSignal): Promise<WriteValue>
  restore(id: string, expectedVersion: number, signal?: AbortSignal): Promise<WriteValue>
}

/** Resolve the route URL for the current document. */
function routeUrl(): URL {
  // Unit tests run without a DOM; production always has document.baseURI.
  const base = (globalThis as { document?: Document }).document?.baseURI ?? 'http://localhost/'
  return new URL(ROUTE_PATH, base)
}

/**
 * Create the transport.
 * @returns the typed transport.
 */
export function createTransport(): HighlightsTransport {
  const call = async <T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> => {
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
      // Map the status classes the UI can act on; everything else stays a
      // transport failure so the read retry policy can treat it uniformly.
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
  return {
    hello: signal => call<HelloValue>('hello', {}, signal),
    list: (includeTombstones, signal) => call<ListValue>('list', { includeTombstones: includeTombstones === true }, signal),
    query: (input, signal) => call<QueryValue>('query', input, signal),
    create: (record, signal) => call<HighlightRecord>('create', { record }, signal),
    update: (id, expectedVersion, patch, signal) => call<WriteValue>('update', { id, expectedVersion, patch }, signal),
    reanchor: (id, expectedVersion, anchor, signal) => call<WriteValue>('reanchor', { id, expectedVersion, anchor }, signal),
    remove: (id, expectedVersion, signal) => call<WriteValue>('remove', { id, expectedVersion }, signal),
    restore: (id, expectedVersion, signal) => call<WriteValue>('restore', { id, expectedVersion }, signal),
  }
}
