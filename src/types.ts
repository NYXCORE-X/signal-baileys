import type { Logger } from 'pino'

export type ConnectionState = 'close' | 'connecting' | 'open'

export interface SignalAuthState {
  /** Directory where session data (crypto) is stored */
  dataPath: string
  /** Whether the device is already linked / registered */
  linked: boolean
}

/** Custom auth provider contract (Redis, DB, etc.) */
export interface AuthStateProvider {
  dataPath: string
  linked?: boolean
}

export interface SignalSocketConfig {
  /** Auth state / data directory / custom provider */
  auth: SignalAuthState | AuthStateProvider | string
  /** Device name shown in Signal (default: Signal Baileys) */
  deviceName?: string
  /** Pino logger instance */
  logger?: Logger
  /** Mark online on connect */
  markOnlineOnConnect?: boolean
  /** Print QR in terminal (uses qrcode if installed) */
  printQRInTerminal?: boolean
  /**
   * Primary registration options.
   * If set, connect() will register as primary instead of linking.
   * Note: underlying native register/confirm may still be incomplete — prefer link for now.
   */
  registration?: {
    phoneNumber: string
    useVoice?: boolean
  }
}

export interface SignalContact {
  uuid: string
  phoneNumber?: string | null
  name?: string | null
}

export interface SignalGroup {
  /** Group master key (hex) or native id string */
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
  /** Download not yet exposed by native layer — metadata only for now */
  downloadAvailable?: boolean
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
    imageMessage?: { mimetype?: string; fileName?: string; fileLength?: number }
    videoMessage?: { mimetype?: string; fileName?: string; fileLength?: number }
    documentMessage?: { mimetype?: string; fileName?: string; fileLength?: number }
    reactionMessage?: {
      text: string
      key: { id: string; remoteJid: string }
    }
  }
  senderUuid: string
  groupId?: string | null
  attachments?: SignalAttachment[]
  isReaction?: boolean
  /** True when the native queue is drained */
  isQueueEmpty?: boolean
}

export interface ConnectionUpdate {
  connection?: ConnectionState
  lastDisconnect?: {
    error?: Error
    date: Date
  }
  qr?: string
  isNewLogin?: boolean
  /** Set during primary registration when SMS/voice code is expected */
  registrationCodeRequired?: boolean
}

export type AnyMessageContent =
  | string
  | { text: string }
  | {
      react: {
        text: string
        key: { id: string; remoteJid?: string }
      }
    }

export type SignalEventMap = {
  'connection.update': (update: ConnectionUpdate) => void
  'messages.upsert': (messages: SignalMessage[], type: 'notify' | 'append') => void
  'contacts.upsert': (contacts: SignalContact[]) => void
  'groups.upsert': (groups: SignalGroup[]) => void
  'creds.update': () => void
}

export type SignalEvent = keyof SignalEventMap
