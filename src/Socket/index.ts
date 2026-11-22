import { EventEmitter } from 'node:events'
import type { Logger } from 'pino'
import {
  linkDevice,
  finishLink,
  receiveMessages,
  sendMessage as nativeSendMessage,
  getProfile,
} from '@milady/signal-native'
import type {
  SignalSocketConfig,
  SignalEventMap,
  SignalMessage,
  ConnectionUpdate,
  SignalProfile,
} from '../types.js'
import { resolveAuthPath } from '../Utils/auth.js'
import { makeLogger } from '../Utils/logger.js'

export type SignalSocket = ReturnType<typeof makeSignalSocket>

/**
 * Create a Baileys-style Signal socket.
 *
 * Usage:
 * ```ts
 * const sock = makeSignalSocket({
 *   auth: './signal-data',
 *   printQRInTerminal: true,
 * })
 *
 * sock.ev.on('connection.update', ({ connection, qr }) => { ... })
 * sock.ev.on('messages.upsert', (msgs) => { ... })
 * ```
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

  const emitConnection = (update: ConnectionUpdate) => {
    ev.emit('connection.update', update)
  }

  const mapIncoming = (raw: any): SignalMessage => {
    const text = raw.text ?? raw.body ?? undefined
    return {
      key: {
        remoteJid: raw.groupId ? `${raw.groupId}@g.us` : `${raw.senderUuid}@s.signal`,
        fromMe: false,
        id: String(raw.timestamp ?? Date.now()),
      },
      messageTimestamp: Number(raw.timestamp ?? Date.now()),
      senderUuid: raw.senderUuid ?? raw.sender_uuid,
      groupId: raw.groupId ?? raw.group_id ?? null,
      attachments: raw.attachments ?? [],
      isReaction: !!raw.isReaction,
      message: text
        ? { conversation: text }
        : raw.isReaction
          ? {
              reactionMessage: {
                text: raw.reactionEmoji ?? '',
                key: { id: String(raw.reactionTargetTimestamp ?? ''), remoteJid: '' },
              },
            }
          : undefined,
    }
  }

  async function startLinkFlow() {
    try {
      emitConnection({ connection: 'connecting' })

      const provisioningUrl = await linkDevice(dataPath, deviceName)

      if (printQR) {
        // Simple terminal QR hint — users can pipe the URL into a QR generator
        console.log('\nScan this URL as QR in Signal → Linked Devices:\n')
        console.log(provisioningUrl)
        console.log('\n')
      }

      emitConnection({ connection: 'connecting', qr: provisioningUrl })

      await finishLink(dataPath)
      isLinked = true

      emitConnection({ connection: 'open', isNewLogin: true })
      logger.info('Device linked successfully')

      // Start receiving
      startReceiveLoop()
    } catch (err: any) {
      logger.error({ err }, 'Link flow failed')
      emitConnection({
        connection: 'close',
        lastDisconnect: { error: err, date: new Date() },
      })
    }
  }

  async function tryExistingSession() {
    try {
      emitConnection({ connection: 'connecting' })
      const profile = await getProfile(dataPath)
      isLinked = true
      logger.info({ phone: profile?.phoneNumber }, 'Restored existing session')
      emitConnection({ connection: 'open' })
      startReceiveLoop()
      return true
    } catch {
      return false
    }
  }

  function startReceiveLoop() {
    if (receiveLoopRunning || closed) return
    receiveLoopRunning = true

    ;(async () => {
      try {
        await receiveMessages(dataPath, (raw: any) => {
          if (closed) return
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

  // Public API
  const sock = {
    ev,
    /** Start connection (will link if needed) */
    async connect() {
      const restored = await tryExistingSession()
      if (!restored) {
        await startLinkFlow()
      }
    },

    /** Send a text message to a UUID or group */
    async sendMessage(
      jid: string,
      content: { text: string } | string
    ): Promise<{ timestamp: number }> {
      const text = typeof content === 'string' ? content : content.text
      // jid can be uuid or uuid@s.signal or group@g.us
      const target = jid.replace(/@s\.signal$/, '').replace(/@g\.us$/, '')
      const result = await nativeSendMessage(dataPath, target, text)
      return { timestamp: result?.timestamp ?? Date.now() }
    },

    /** Get current profile */
    async fetchProfile(): Promise<SignalProfile | null> {
      try {
        return await getProfile(dataPath)
      } catch {
        return null
      }
    },

    /** Graceful shutdown */
    async end() {
      closed = true
      emitConnection({ connection: 'close' })
    },

    /** Whether we believe we are linked */
    get user() {
      return isLinked ? { id: 'linked' } : undefined
    },
  }

  // Auto-connect for convenience (can be disabled later if needed)
  // Caller should still call sock.connect() explicitly for clarity.

  return sock
}
