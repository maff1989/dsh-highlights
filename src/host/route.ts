/**
 * `/api/highlights`: the feature-owned exact Fetch route below `/api`.
 *
 * A generic Connection RPC channel needs `webServer` in the registering
 * context, which an out-of-tree plugin cannot satisfy (the registry installs
 * its own physical route). The documented alternative is an exact Fetch route:
 * Connection owns trust, authentication, and the owner-Peer fence, and the
 * plugin owns the JSON envelope. Endpoints, payload schemas, and business
 * outcomes are the same as a Remote call would have carried; a lost
 * compare-and-set race is a value, not a transport error.
 */
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import type { Logger } from '@deepseek-ai/cordis'
import { ZodError } from 'zod'

import { HIGHLIGHTS_ROUTE_PATH, RPC_PROTOCOL } from '../shared/constants'
import {
  InputSchemas,
  RPC_ENDPOINTS,
  type HelloValue,
  type ListValue,
  type QueryValue,
  type RpcEndpoint,
  type RpcErrorCode,
  type SettingsValue,
} from '../shared/protocol'
import {
  DuplicateIdError,
  InvalidReanchorError,
  LimitError,
  NotFoundError,
  SettingsInvariantError,
  type HighlightStore,
} from './store'
import { queryRecords } from './query'

/** Path of the exact route (below the shared `/api` carrier). */
export { HIGHLIGHTS_ROUTE_PATH }

/** Request envelope the browser half posts. */
interface RequestEnvelope {
  readonly endpoint?: unknown
  readonly payload?: unknown
}

/** Host limits reported by `hello`. */
export interface RouteLimits {
  /** Maximum live records. */
  readonly maxRecords: number
  /** Whether inserted highlights carry an attribution line. */
  readonly insertionAttribution: boolean
  /** Optional record-set poll interval advertised to the browser half. */
  readonly pollIntervalMs: number
}

/** Successful envelope. */
type RouteReply = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: { code: RpcErrorCode; message: string } }

/** Build one failure reply. */
function failure(code: RpcErrorCode, message: string): RouteReply {
  return { ok: false, error: { code, message } }
}

/** Map a thrown error to a reply. */
function replyOf(error: unknown): RouteReply {
  if (error instanceof ZodError) {
    return failure('bad-request', error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '))
  }
  if (error instanceof NotFoundError) return failure('not-found', error.message)
  if (error instanceof LimitError) return failure('limit-exceeded', error.message)
  if (error instanceof DuplicateIdError || error instanceof InvalidReanchorError) {
    return failure('bad-request', error.message)
  }
  if (error instanceof SettingsInvariantError) return failure('bad-request', error.message)
  return failure('internal', error instanceof Error ? error.message : String(error))
}

/**
 * Create the exact route bound to one opened store.
 * @param store - The durable store.
 * @param limits - Limits the plugin config applies.
 * @param log - Plugin logger for unexpected failures.
 * @returns the Connection Fetch route definition.
 */
export function createHighlightsRoute(store: HighlightStore, limits: RouteLimits, log: Logger): ConnectionFetchRoute {
  return {
    path: HIGHLIGHTS_ROUTE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request: Request): Promise<Response> => {
      let envelope: RequestEnvelope
      try {
        envelope = await request.json() as RequestEnvelope
      } catch {
        return json(failure('bad-request', 'request body must be JSON'))
      }
      const endpoint = typeof envelope.endpoint === 'string' ? envelope.endpoint : ''
      const payload = envelope.payload ?? {}
      const reply = await dispatch(endpoint, payload)
      return json(reply)
    },
  }

  /** Dispatch one endpoint. */
  async function dispatch(endpoint: string, payload: unknown): Promise<RouteReply> {
    if (!(RPC_ENDPOINTS as readonly string[]).includes(endpoint)) {
      return failure('unknown-endpoint', `unknown highlights endpoint: ${endpoint}`)
    }
    const name = endpoint as RpcEndpoint
    try {
      switch (name) {
        case 'hello': {
          const value: HelloValue = {
            protocol: RPC_PROTOCOL,
            domainVersion: 1,
            installId: store.installId,
            count: store.countLive(),
            maxRecords: limits.maxRecords,
            insertionAttribution: limits.insertionAttribution,
            pollIntervalMs: limits.pollIntervalMs,
            agentAccess: store.agentAccess,
          }
          return { ok: true, value }
        }
        case 'list': {
          const input = InputSchemas.list.parse(payload)
          const value: ListValue = store.list(input.includeTombstones === true)
          return { ok: true, value }
        }
        case 'query': {
          const input = InputSchemas.query.parse(payload)
          const value: QueryValue = queryRecords(store.list(true).records, input)
          return { ok: true, value }
        }
        case 'create': {
          const input = InputSchemas.create.parse(payload)
          return { ok: true, value: await store.create(input.record) }
        }
        case 'update': {
          const input = InputSchemas.update.parse(payload)
          return { ok: true, value: await store.update(input.id, input.expectedVersion, input.patch) }
        }
        case 'reanchor': {
          const input = InputSchemas.reanchor.parse(payload)
          return { ok: true, value: await store.reanchor(input.id, input.expectedVersion, input.anchor) }
        }
        case 'remove': {
          const input = InputSchemas.remove.parse(payload)
          return { ok: true, value: await store.remove(input.id, input.expectedVersion) }
        }
        case 'restore': {
          const input = InputSchemas.restore.parse(payload)
          return { ok: true, value: await store.restore(input.id, input.expectedVersion) }
        }
        case 'getSettings': {
          InputSchemas.getSettings.parse(payload)
          const value: SettingsValue = {
            settings: store.settings(),
            retentionDays: store.tombstoneRetentionDays,
          }
          return { ok: true, value }
        }
        case 'setSettings': {
          const input = InputSchemas.setSettings.parse(payload)
          return { ok: true, value: await store.setSettings(input.expectedVersion, input.patch) }
        }
      }
    } catch (error) {
      const reply = replyOf(error)
      if (reply.ok === false && reply.error.code === 'internal') {
        log.error('highlights endpoint %s failed: %s', endpoint, reply.error.message)
      }
      return reply
    }
  }
}

/** Serialise one reply as JSON. */
function json(reply: RouteReply): Response {
  return new Response(JSON.stringify(reply), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
