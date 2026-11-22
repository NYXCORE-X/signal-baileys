import { EventEmitter } from 'node:events'
import type { Logger } from 'pino'
import {
  linkDevice,
  finishLink,
  receiveMessages,
  stopReceiving,
  sendMessage as nativeSendMessage,
  sendGroupMessage as nativeSendGroupMessage,
  sendReaction as nativeSendReaction,
  getProfile,
  listContacts,
  listGroups,
  register as nativeRegister,
  confirmRegistration as nativeConfirmRegistration,
} from '@milady/signal-native'
import type {
  SignalSocketConfig,
  SignalEventMap,
  SignalMessage,
  ConnectionUpdate,
  SignalProfile,
  SignalContact,
  SignalGroup,
  AnyMessageContent,
  SignalAttachment,
} from '../types.js'
import { resolveAuthPath } from '../Utils/auth.js'
import { makeLogger } from '../Utils/logger.js'
import { printQRToTerminal } from '../Utils/qr.js'
import {
  downloadMediaMessage as downloadMediaMessageHelper,
  downloadAttachment as downloadAttachmentHelper,
  sendMediaMessage,
} from '../Utils/media.js'
import { loadNative, hasNativeDownload, hasNativeUpload } from '../Utils/native.js'

export type SignalSocket = ReturnType<typeof makeSignalSocket>

function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us') || (!jid.includes('@') && jid.length >= 32 && !jid.includes('-'))
}

function stripJid(jid: string): string {
  return jid.replace(/@s\.signal$/i, '').replace(/@g\.us$/i, '').trim()
}

function mapAttachments(raw: any[], downloadAvailable: boolean): SignalAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw.map((a) => {
    const contentType = a.contentType ?? a.content_type ?? 'application/octet-stream'
    const fileName = a.fileName ?? a.file_name ?? null
    const size = a.size ?? null
    // Keep unknown fields for future native download pointers (cdnKey, digest, …)
    const known = new Set([
      'contentType',
      'content_type',
      'fileName',
      'file_name',
      'size',
    ])
    const rawExtra: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(a)) {
      if (!known.has(k)) rawExtra[k] = v
    }
    return {
      contentType,
      fileName,
      size,
      downloadAvailable,
      raw: Object.keys(rawExtra).length ? rawExtra : { contentType, fileName, size },
    }
  })
}

function mapIncoming(raw: any, downloadAvailable: boolean): SignalMessage {
  const text = raw.text ?? null
  const senderUuid = raw.senderUuid ?? raw.sender_uuid ?? ''
  const groupId = raw.groupId ?? raw.group_id ?? null
  const timestamp = Number(raw.timestamp ?? Date.now())
  const attachments = mapAttachments(raw.attachments ?? [], downloadAvailable)
  const isReaction = !!raw.isReaction

  let message: SignalMessage['message']

  if (isReaction) {
    message = {
      reactionMessage: {
        text: raw.reactionEmoji ?? raw.reaction_emoji ?? '',
        key: {
          id: String(raw.reactionTargetTimestamp ?? raw.reaction_target_timestamp ?? ''),
          remoteJid: groupId ? `${groupId}@g.us` : `${senderUuid}@s.signal`,
        },
      },
    }
  } else if (text) {
    message = { conversation: text }
  } else if (attachments.length) {
    const first = attachments[0]
    const ct = (first.contentType || '').toLowerCase()
    const fields = {
      mimetype: first.contentType,
      fileName: first.fileName ?? undefined,
      fileLength: first.size ?? undefined,
    }
    if (ct.startsWith('image/')) message = { imageMessage: fields }
    else if (ct.startsWith('video/')) message = { videoMessage: fields }
    else if (ct.startsWith('audio/')) message = { audioMessage: fields }
    else message = { documentMessage: fields }
  }

  return {
    key: {
      remoteJid: groupId ? `${groupId}@g.us` : `${senderUuid}@s.signal`,
      fromMe: false,
      id: String(timestamp),
    },
    messageTimestamp: timestamp,
    senderUuid,
    groupId,
    attachments,
    isReaction,
    isQueueEmpty: !!raw.isQueueEmpty,
    message,
  }
}

export function makeSignalSocket(config: SignalSocketConfig) {
  const dataPath = resolveAuthPath(config.auth)
  const deviceName = config.deviceName ?? 'Signal Baileys'
  const logger: Logger = config.logger ?? makeLogger('info')
  const printQR = config.printQRInTerminal ?? false

  const ev = new EventEmitter() as EventEmitter & {
    on<E extends keyof SignalEventMap>(event: E, listener: SignalEventMap[E]): void
    emit<E extends keyof SignalEventMap>(
      event: E,
      ...args: Parameters<SignalEventMap[E]>
    ): boolean
  }

  let isLinked = false
  let receiveLoopRunning = false
  let closed = false
  let profileCache: SignalProfile | null = null
  let mediaCaps = { download: false, upload: false }

  const emitConnection = (update: ConnectionUpdate) => {
    ev.emit('connection.update', update)
  }

  async function probeMediaCaps() {
    try {
      const n = await loadNative()
      mediaCaps = {
        download: hasNativeDownload(n),
        upload: hasNativeUpload(n),
      }
      if (!mediaCaps.download || !mediaCaps.upload) {
        logger.debug(
          mediaCaps,
          'Native attachment download/upload not available yet — metadata only'
        )
      }
    } catch {
      /* ignore */
    }
  }

  async function startLinkFlow() {
    try {
      emitConnection({ connection: 'connecting' })
      const provisioningUrl = await linkDevice(dataPath, deviceName)
      if (printQR) await printQRToTerminal(provisioningUrl)
      emitConnection({ connection: 'connecting', qr: provisioningUrl })
      await finishLink(dataPath)
      isLinked = true
      try {
        profileCache = await getProfile(dataPath)
      } catch {
        /* ignore */
      }
      await probeMediaCaps()
      emitConnection({ connection: 'open', isNewLogin: true })
      logger.info({ phone: profileCache?.phoneNumber }, 'Device linked successfully')
      ev.emit('creds.update')
      await refreshContactsAndGroups()
      startReceiveLoop()
    } catch (err: any) {
      logger.error({ err }, 'Link flow failed')
      emitConnection({
        connection: 'close',
        lastDisconnect: { error: err, date: new Date() },
      })
    }
  }

  async function startPrimaryRegistration() {
    const reg = config.registration!
    try {
      emitConnection({ connection: 'connecting' })
      logger.info({ phone: reg.phoneNumber }, 'Starting primary registration')
      await nativeRegister(dataPath, reg.phoneNumber, !!reg.useVoice)
      emitConnection({ connection: 'connecting', registrationCodeRequired: true })
      logger.info('Awaiting SMS/voice confirmation code — call sock.confirmRegistration(code)')
    } catch (err: any) {
      logger.error({ err }, 'Primary registration failed')
      emitConnection({
        connection: 'close',
        lastDisconnect: { error: err, date: new Date() },
      })
      throw err
    }
  }

  async function tryExistingSession() {
    try {
      emitConnection({ connection: 'connecting' })
      const profile = await getProfile(dataPath)
      isLinked = true
      profileCache = profile
      await probeMediaCaps()
      logger.info({ phone: profile?.phoneNumber }, 'Restored existing session')
      emitConnection({ connection: 'open' })
      await refreshContactsAndGroups()
      startReceiveLoop()
      return true
    } catch {
      return false
    }
  }

  async function refreshContactsAndGroups() {
    try {
      const contacts = await listContacts(dataPath)
      if (contacts?.length) ev.emit('contacts.upsert', contacts as SignalContact[])
    } catch (err) {
      logger.debug({ err }, 'listContacts failed')
    }
    try {
      const groups = await listGroups(dataPath)
      if (groups?.length) ev.emit('groups.upsert', groups as SignalGroup[])
    } catch (err) {
      logger.debug({ err }, 'listGroups failed')
    }
  }

  function startReceiveLoop() {
    if (receiveLoopRunning || closed) return
    receiveLoopRunning = true
    ;(async () => {
      try {
        await receiveMessages(dataPath, (raw: any) => {
          if (closed) return
          if (
            raw?.isQueueEmpty &&
            !raw?.text &&
            !raw?.isReaction &&
            !(raw?.attachments?.length)
          ) {
            return
          }
          const msg = mapIncoming(raw, mediaCaps.download)
          ev.emit('messages.upsert', [msg], 'notify')
        })
      } catch (err: any) {
        if (!closed) {
          logger.error({ err }, 'Receive loop error')
          emitConnection({
            connection: 'close',
            lastDisconnect: { error: err, date: new Date() },
          })
        }
      } finally {
        receiveLoopRunning = false
      }
    })()
  }

  const sock = {
    ev,

    async connect() {
      const restored = await tryExistingSession()
      if (restored) return
      if (config.registration?.phoneNumber) {
        await startPrimaryRegistration()
        return
      }
      await startLinkFlow()
    },

    async confirmRegistration(code: string) {
      await nativeConfirmRegistration(dataPath, code)
      isLinked = true
      try {
        profileCache = await getProfile(dataPath)
      } catch {
        /* ignore */
      }
      await probeMediaCaps()
      emitConnection({ connection: 'open', isNewLogin: true })
      ev.emit('creds.update')
      await refreshContactsAndGroups()
      startReceiveLoop()
      logger.info('Primary registration confirmed')
    },

    /**
     * Send text, reaction, or media.
     *
     * Media examples:
     *   await sock.sendMessage(jid, { image: { url: './pic.jpg' }, caption: 'hi' })
     *   await sock.sendMessage(jid, { document: { url: './file.pdf', fileName: 'file.pdf' } })
     */
    async sendMessage(
      jid: string,
      content: AnyMessageContent
    ): Promise<{ timestamp: number }> {
      if (typeof content === 'object' && content !== null && 'react' in content) {
        const { text: emoji, key } = content.react
        const target = stripJid(key.remoteJid || jid)
        await nativeSendReaction(dataPath, target, emoji, Number(key.id))
        return { timestamp: Date.now() }
      }

      const target = stripJid(jid)
      const group = isGroupJid(jid) || jid.endsWith('@g.us')

      if (typeof content === 'object' && content !== null) {
        if ('image' in content) {
          return sendMediaMessage(
            dataPath,
            target,
            group,
            content.image,
            content.caption ?? content.image.caption
          )
        }
        if ('video' in content) {
          return sendMediaMessage(
            dataPath,
            target,
            group,
            content.video,
            content.caption ?? content.video.caption
          )
        }
        if ('audio' in content) {
          return sendMediaMessage(dataPath, target, group, content.audio)
        }
        if ('document' in content) {
          return sendMediaMessage(dataPath, target, group, {
            ...content.document,
            mimetype: content.mimetype ?? content.document.mimetype,
            fileName: content.fileName ?? content.document.fileName,
          })
        }
      }

      const text = typeof content === 'string' ? content : (content as { text: string }).text
      if (group) {
        const result = await nativeSendGroupMessage(dataPath, target, text)
        return { timestamp: result?.timestamp ?? Date.now() }
      }
      const result = await nativeSendMessage(dataPath, target, text)
      return { timestamp: result?.timestamp ?? Date.now() }
    },

    async sendReaction(jid: string, emoji: string, targetTimestamp: number) {
      await nativeSendReaction(dataPath, stripJid(jid), emoji, targetTimestamp)
    },

    /**
     * Download media bytes for an incoming message.
     * Requires native `downloadAttachment` (not shipped yet in @milady/signal-native).
     */
    async downloadMediaMessage(
      message: SignalMessage,
      opts?: { attachmentIndex?: number }
    ): Promise<Buffer> {
      return downloadMediaMessageHelper(dataPath, message, opts)
    },

    async downloadAttachment(attachment: SignalAttachment): Promise<Buffer> {
      return downloadAttachmentHelper(dataPath, attachment)
    },

    /** Whether current native build supports attachment binary transfer */
    get mediaCapabilities() {
      return { ...mediaCaps }
    },

    async groupFetchAllParticipating(): Promise<Record<string, SignalGroup>> {
      const groups = (await listGroups(dataPath)) as SignalGroup[]
      const map: Record<string, SignalGroup> = {}
      for (const g of groups) map[`${g.id}@g.us`] = g
      return map
    },

    async fetchContacts(): Promise<SignalContact[]> {
      return (await listContacts(dataPath)) as SignalContact[]
    },

    async fetchGroups(): Promise<SignalGroup[]> {
      return (await listGroups(dataPath)) as SignalGroup[]
    },

    async fetchProfile(): Promise<SignalProfile | null> {
      try {
        profileCache = await getProfile(dataPath)
        return profileCache
      } catch {
        return profileCache
      }
    },

    async end() {
      closed = true
      try {
        await stopReceiving(dataPath)
      } catch {
        /* ignore */
      }
      emitConnection({ connection: 'close' })
    },

    get user() {
      if (!isLinked) return undefined
      return {
        id: profileCache?.uuid ?? 'linked',
        phoneNumber: profileCache?.phoneNumber ?? null,
      }
    },
  }

  return sock
}
