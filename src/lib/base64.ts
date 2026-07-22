/**
 * Base64 transfer codec for the binary payloads that cross the Tauri IPC
 * boundary (terminal PTY bytes are the current caller). The webview has no
 * `Buffer`, so these bridge `atob`/`btoa` — which speak Latin-1 — and real
 * byte arrays.
 */

/** Decodes a base64 string into its raw bytes. */
export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Encodes a UTF-8 string as base64. */
export function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
