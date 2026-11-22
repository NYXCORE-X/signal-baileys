/**
 * Soft probes for optional @milady/signal-native APIs.
 * Attachment download/upload are not in the published bindings yet;
 * when upstream adds them, we pick them up automatically.
 */

export type NativeFns = {
  downloadAttachment?: (
    dataPath: string,
    attachment: Record<string, unknown>
  ) => Promise<Buffer | Uint8Array>
  sendMessageWithAttachment?: (
    dataPath: string,
    recipient: string,
    text: string | null,
    filePath: string,
    contentType?: string
  ) => Promise<{ timestamp: number }>
  sendGroupMessageWithAttachment?: (
    dataPath: string,
    groupMasterKeyHex: string,
    text: string | null,
    filePath: string,
    contentType?: string
  ) => Promise<{ timestamp: number }>
  // known stable APIs (always expected)
  [key: string]: unknown
}

let cached: NativeFns | null = null

export async function loadNative(): Promise<NativeFns> {
  if (cached) return cached
  const mod = (await import('@milady/signal-native')) as NativeFns
  cached = mod
  return mod
}

export function hasNativeDownload(n: NativeFns): boolean {
  return typeof n.downloadAttachment === 'function'
}

export function hasNativeUpload(n: NativeFns): boolean {
  return (
    typeof n.sendMessageWithAttachment === 'function' ||
    typeof n.sendGroupMessageWithAttachment === 'function'
  )
}

export const ATTACHMENT_NATIVE_MISSING = `
Attachment binary transfer is not exposed by @milady/signal-native yet.

Presage (Rust) supports get_attachment / upload, but the napi bindings only
pass metadata today: { contentType, fileName, size }.

Options:
  1. Watch / contribute downloadAttachment + sendMessageWithAttachment upstream:
     https://github.com/milady-ai/signal-native
  2. When those land, signal-baileys will use them automatically — no API change.
`.trim()
