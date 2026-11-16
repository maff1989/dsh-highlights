/**
 * Client-side record ids.
 *
 * `crypto.randomUUID()` is only exposed in secure contexts, and a Harness GUI
 * served over plain HTTP on a LAN address (the common desktop case) is not one.
 * `crypto.getRandomValues()` is available in insecure contexts, so the UUID is
 * assembled from it, with `randomUUID()` preferred when the browser has it.
 */

/** Version/variant bits of a UUID v4. */
const UUID_V4_VERSION = 0x40
const UUID_V4_VARIANT = 0x80

/** Format 16 random bytes as a UUID. */
function formatUuid(bytes: Uint8Array): string {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | UUID_V4_VERSION
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | UUID_V4_VARIANT
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Mint one record id.
 * @returns a UUID-shaped string, unique per call.
 */
export function newRecordId(): string {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto
  if (webCrypto !== undefined && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (webCrypto !== undefined && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
    return formatUuid(bytes)
  }
  // Last resort for exotic sandboxes; ids only need local uniqueness here.
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return formatUuid(bytes)
}
