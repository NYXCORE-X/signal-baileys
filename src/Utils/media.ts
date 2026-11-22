import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import type { MediaUploadData, SignalAttachment, SignalMessage } from '../types.js'
import {
  loadNative,
  hasNativeDownload,
  hasNativeUpload,
  ATTACHMENT_NATIVE_MISSING,
} from './native.js'

function guessMime(fileName: string, fallback = 'application/octet-stream'): string {
  const ext = extname(fileName).toLowerCase()
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.zip': 'application/zip',
  }
  return map[ext] ?? fallback
}

/** Ensure we have a real file path on disk for native upload APIs. */
export async function materializeUpload(
  data: MediaUploadData
): Promise<{ filePath: string; mimetype: string; fileName: string; cleanup?: () => Promise<void> }> {
  if (data.url) {
    const fileName = data.fileName ?? basename(data.url)
    const mimetype = data.mimetype ?? guessMime(fileName)
    return { filePath: data.url, mimetype, fileName }
  }

  if (data.buffer) {
    const dir = join(tmpdir(), 'signal-baileys-upload')
    await mkdir(dir, { recursive: true })
    const fileName = data.fileName ?? `upload-${randomBytes(6).toString('hex')}`
    const filePath = join(dir, fileName)
    await writeFile(filePath, data.buffer)
    const mimetype = data.mimetype ?? guessMime(fileName)
    return {
      filePath,
      mimetype,
      fileName,
      cleanup: async () => {
        try {
          const { unlink } = await import('node:fs/promises')
          await unlink(filePath)
        } catch {
          /* ignore */
        }
      },
    }
  }

  throw new Error('MediaUploadData requires either url (file path) or buffer')
}

/**
 * Download media from an incoming message / attachment pointer.
 * Uses native downloadAttachment when available; otherwise throws with guidance.
 */
export async function downloadMediaMessage(
  dataPath: string,
  message: SignalMessage,
  opts?: { attachmentIndex?: number }
): Promise<Buffer> {
  const idx = opts?.attachmentIndex ?? 0
  const att = message.attachments?.[idx]
  if (!att) {
    throw new Error('No attachment on this message')
  }
  return downloadAttachment(dataPath, att)
}

export async function downloadAttachment(
  dataPath: string,
  attachment: SignalAttachment
): Promise<Buffer> {
  const native = await loadNative()
  if (!hasNativeDownload(native) || !native.downloadAttachment) {
    const err = new Error(ATTACHMENT_NATIVE_MISSING)
    ;(err as any).code = 'ERR_SIGNAL_ATTACHMENT_NATIVE_MISSING'
    throw err
  }

  const payload = {
    contentType: attachment.contentType,
    fileName: attachment.fileName,
    size: attachment.size,
    ...(attachment.raw ?? {}),
  }

  const result = await native.downloadAttachment(dataPath, payload)
  return Buffer.isBuffer(result) ? result : Buffer.from(result)
}

/**
 * Send a media file (image/video/audio/document) if native upload exists.
 */
export async function sendMediaMessage(
  dataPath: string,
  jidTarget: string,
  isGroup: boolean,
  data: MediaUploadData,
  caption?: string
): Promise<{ timestamp: number }> {
  const native = await loadNative()
  if (!hasNativeUpload(native)) {
    const err = new Error(ATTACHMENT_NATIVE_MISSING)
    ;(err as any).code = 'ERR_SIGNAL_ATTACHMENT_NATIVE_MISSING'
    throw err
  }

  const { filePath, mimetype, cleanup } = await materializeUpload(data)
  try {
    if (isGroup && native.sendGroupMessageWithAttachment) {
      return await native.sendGroupMessageWithAttachment(
        dataPath,
        jidTarget,
        caption ?? null,
        filePath,
        mimetype
      )
    }
    if (!isGroup && native.sendMessageWithAttachment) {
      return await native.sendMessageWithAttachment(
        dataPath,
        jidTarget,
        caption ?? null,
        filePath,
        mimetype
      )
    }
    const err = new Error(ATTACHMENT_NATIVE_MISSING)
    ;(err as any).code = 'ERR_SIGNAL_ATTACHMENT_NATIVE_MISSING'
    throw err
  } finally {
    await cleanup?.()
  }
}

/** Save downloaded bytes to a path */
export async function saveMediaToFile(buffer: Buffer, outPath: string): Promise<string> {
  await mkdir(join(outPath, '..'), { recursive: true }).catch(() => {})
  // if outPath is a directory-ish without extension, still write as given
  await writeFile(outPath, buffer)
  return outPath
}

export async function readLocalFile(path: string): Promise<Buffer> {
  return readFile(path)
}
