/**
 * Build-wide constants shared by the Host and browser halves.
 *
 * Nothing here is deployment-specific: values a deployment may want to change
 * live in the Host plugin `Config` (src/host/config.ts) and reach the browser
 * through the `hello` endpoint. These are the identities and protocol numbers
 * that both halves must agree on, compiled into each artifact.
 */

/** Cordis plugin name; also the Loader row id and the browser bundle id. */
export const PLUGIN_NAME = 'dsh-highlights'

/** Logical Connection RPC channel owned by the Host half. */
export const RPC_CHANNEL = '/highlights'

/** Localised dictionary namespace. */
export const LOCALE_NAMESPACE = 'highlights'

/** Root-scoped main-panel key and the matching `sidebar.panellist` row id. */
export const PANEL_ID = 'highlights'

/** Right-Sidebar tab type id (the definition id, also the body slot key). */
export const TAB_TYPE_ID = 'dsh-highlights/tab'

/** Right-Sidebar tab kind opened by `ctx.sidebarRight.openTab`. */
export const TAB_KIND = 'highlights'

/** Optional registration id for the per-message "save" action. */
export const MESSAGE_ACTION_ID = 'highlights-save'

/** Session-scoped list slot host for the null-rendering session bridge. */
export const BRIDGE_SLOT_ID = 'highlights-bridge'

/** Exact Fetch route path (Connection carrier path included). */
export const HIGHLIGHTS_ROUTE_PATH = '/api/highlights'

/** Plugin-owned record schema version (per record). */
export const SCHEMA_VERSION = 1

/** Anchor offset projection version; offsets mean nothing without it. */
export const PROJECTION_VERSION = 1

/** Highlight colour count (fixed themed palette). */
export const PALETTE_SIZE = 5

/** Storage domain name (fixed; `layout: 'per-record'`). */
export const DOMAIN_NAME = 'highlights'

/** Chromium/standards name prefix for `CSS.highlights` registry entries. */
export const HIGHLIGHT_NAME_PREFIX = 'dsh-hl-'

/** localStorage keys owned by the browser half. */
export const PREFS_STORAGE_KEY = 'dsh.highlights.prefs.v1'
export const QUEUE_STORAGE_KEY = 'dsh.highlights.queue.v1'
export const NUDGE_STORAGE_KEY = 'dsh.highlights.nudge'

/** RPC protocol version negotiated by `hello`. */
export const RPC_PROTOCOL = 1

/** Maximum lengths the record schema enforces (mirrors src/shared/schema.ts). */
export const MAX_QUOTE_CHARS = 2000
export const MAX_NOTE_CHARS = 2000
export const MAX_TAGS = 8
export const MAX_TAG_CHARS = 32
export const CONTEXT_CHARS = 48

/** Tombstone retention before a purge pass removes the record file. */
export const TOMBSTONE_RETENTION_DAYS = 30

/** Pending composer insertions expire after this long. */
export const PENDING_INSERTION_TTL_MS = 24 * 60 * 60 * 1000
