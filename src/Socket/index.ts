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

export type SignalSocket = ReturnType<typeof makeSignalSocket>

function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us') || (!jid.includes('@') && jid.length >= 32 && !jid.includes('-'))
}

function stripJid(jid: string): string {
  return jid.replace(/@s\.signal$/i, '').replace(/@g\.us$/i, '').trim()
}

function mapAttachments(raw: any[]): SignalAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw.map((a) => ({
    contentType: a.contentType ?? a.content_type ?? 'application/octet-stream',
    fileName: a.fileName ?? a.file_name ?? null,
    size: a.size ?? null,
    // Native layer currently exposes metadata only; download planned upstream
    downloadAvailable: false,
  }))
}

function mapIncoming(raw: any): SignalMessage {
  const text = raw.text ?? null
  const senderUuid = raw.senderUuid ?? raw.sender_uuid ?? ''
  const groupId = raw.groupId ?? raw.group_id ?? null
  const timestamp = Number(raw.timestamp ?? Date.now())
  const attachments = mapAttachments(raw.attachments ?? [])
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
    if (ct.startsWith('image/')) {
      message = {
        imageMessage: {
          mimetype: first.contentType,
          fileName: first.fileName ?? undefined,
          fileLength: first.size ?? undefined,
        },
      }
    } else if (ct.startsWith('video/')) {
      message = {
        videoMessage: {
          mimetype: first.contentType,
          fileName: first.fileName ?? undefined,
          fileLength: first.size ?? undefined,
        },
      }
    } else {
      message = {
        documentMessage: {
          mimetype: first.contentType,
          fileName: first.fileName ?? undefined,
          fileLength: first.size ?? undefined,
        },
      }
    }
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

/**
 * Create a Baileys-style Signal socket.
 */
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

  const emitConnection = (update: ConnectionUpdate) => {
    ev.emit('connection.update', update)
  }

  async function startLinkFlow() {
    try {
      emitConnection({ connection: 'connecting' })

      const provisioningUrl = await linkDevice(dataPath, deviceName)

      if (printQR) {
        await printQRToTerminal(provisioningUrl)
      }

      emitConnection({ connection: 'connecting', qr: provisioningUrl })

      await finishLink(dataPath)
      isLinked = true

      try {
        profileCache = await getProfile(dataPath)
      } catch {
        /* ignore */
      }

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

      // Native API exists; may throw if not fully implemented upstream
      await nativeRegister(dataPath, reg.phoneNumber, !!reg.useVoice)

      emitConnection({
        connection: 'connecting',
        registrationCodeRequired: true,
      })
      logger.info('Awaiting SMS/voice confirmation code — call sock.confirmRegistration(code)')
    } catch (err: any) {
      logger.error(
        { err },
        'Primary registration failed (native layer may still be incomplete — prefer linkDevice)'
      )
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
          if (raw?.isQueueEmpty && !raw?.text && !raw?.isReaction && !(raw?.attachments?.length)) {
            return
          }
          const msg = mapIncoming(raw)
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

    /** Start connection (restore session, link, or primary register) */
    async connect() {
      const restored = await tryExistingSession()
      if (restored) return

      if (config.registration?.phoneNumber) {
        await startPrimaryRegistration()
        return
      }

      await startLinkFlow()
    },

    /**
     * Confirm primary registration with the SMS/voice code.
     * Only needed when using config.registration.
     */
    async confirmRegistration(code: string) {
      await nativeConfirmRegistration(dataPath, code)
      isLinked = true
      try {
        profileCache = await getProfile(dataPath)
      } catch {
        /* ignore */
      }
      emitConnection({ connection: 'open', isNewLogin: true })
      ev.emit('creds.update')
      await refreshContactsAndGroups()
      startReceiveLoop()
      logger.info('Primary registration confirmed')
    },

    /**
     * Send a text message or a reaction.
     *
     * jid formats:
     * - `uuid` or `uuid@s.signal` → individual
     * - `groupMasterKeyHex@g.us` or bare group id → group
     */
    async sendMessage(
      jid: string,
      content: AnyMessageContent
    ): Promise<{ timestamp: number }> {
      // Reaction path
      if (typeof content === 'object' && content !== null && 'react' in content) {
        const { text: emoji, key } = content.react
        const target = stripJid(key.remoteJid || jid)
        const targetTs = Number(key.id)
        await nativeSendReaction(dataPath, target, emoji, targetTs)
        return { timestamp: Date.now() }
      }

      const text = typeof content === 'string' ? content : content.text
      const target = stripJid(jid)

      if (isGroupJid(jid) || jid.endsWith('@g.us')) {
        const result = await nativeSendGroupMessage(dataPath, target, text)
        return { timestamp: result?.timestamp ?? Date.now() }
      }

      const result = await nativeSendMessage(dataPath, target, text)
      return { timestamp: result?.timestamp ?? Date.now() }
    },

    /** Convenience: react to a message */
    async sendReaction(jid: string, emoji: string, targetTimestamp: number) {
      const target = stripJid(jid)
      await nativeSendReaction(dataPath, target, emoji, targetTimestamp)
    },

    /** List stored contacts */
    async groupFetchAllParticipating(): Promise<Record<string, SignalGroup>> {
      const groups = (await listGroups(dataPath)) as SignalGroup[]
      const map: Record<string, SignalGroup> = {}
      for (const g of groups) {
        map[`${g.id}@g.us`] = g
      }
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

    /** Graceful shutdown */
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
