import type { Logger } from 'pino'

export type ConnectionState = 'close' | 'connecting' | 'open'

export interface SignalAuthState {
  /** Directory where session data is stored */
  dataPath: string
  /** Whether the device is already linked */
  linked: boolean
}

export interface SignalSocketConfig {
  /** Auth state / data directory */
  auth: SignalAuthState | string
  /** Device name shown in Signal (default: Signal Baileys) */
  deviceName?: string
  /** Pino logger instance */
  logger?: Logger
  /** Mark online on connect */
  markOnlineOnConnect?: boolean
  /** Print QR in terminal */
  printQRInTerminal?: boolean
}

export interface SignalContact {
  uuid: string
  phoneNumber?: string | null
  name?: string | null
}

export interface SignalGroup {
  id: string
  name: string
  description?: string | null
  membersCount: number
}

export interface SignalProfile {
  uuid: string
  phoneNumber?: string | null
}

export interface SignalAttachment {
  contentType: string
  fileName?: string | null
  size?: number | null
}

export interface SignalMessage {
  key: {
    remoteJid: string
    fromMe: boolean
    id: string
  }
  messageTimestamp: number
  pushName?: string
  message?: {
    conversation?: string
    extendedTextMessage?: { text: string }
    imageMessage?: any
    videoMessage?: any
    documentMessage?: any
    reactionMessage?: {
      text: string
      key: { id: string; remoteJid: string }
    }
  }
  /** Raw sender UUID from the underlying library */
  senderUuid: string
  /** Group ID if this is a group message */
  groupId?: string | null
  /** Attachments metadata */
  attachments?: SignalAttachment[]
  /** Whether this is a reaction */
  isReaction?: boolean
}

export interface ConnectionUpdate {
  connection?: ConnectionState
  lastDisconnect?: {
    error?: Error
    date: Date
  }
  qr?: string
  isNewLogin?: boolean
}

export type SignalEventMap = {
  'connection.update': (update: ConnectionUpdate) => void
  'messages.upsert': (messages: SignalMessage[], type: 'notify' | 'append') => void
  'contacts.upsert': (contacts: SignalContact[]) => void
  'groups.upsert': (groups: SignalGroup[]) => void
  'creds.update': () => void
}

export type SignalEvent = keyof SignalEventMap
