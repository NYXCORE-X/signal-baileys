import type { Logger } from 'pino'

export type ConnectionState = 'close' | 'connecting' | 'open'

export interface SignalAuthState {
  dataPath: string
  linked: boolean
}

export interface AuthStateProvider {
  dataPath: string
  linked?: boolean
}

export interface SignalSocketConfig {
  auth: SignalAuthState | AuthStateProvider | string
  deviceName?: string
  logger?: Logger
  markOnlineOnConnect?: boolean
  printQRInTerminal?: boolean
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
  id: string
  name: string
  description?: string | null
  membersCount: number
}

export interface SignalProfile {
  uuid: string
  phoneNumber?: string | null
}

/** Raw attachment pointer as returned by native (may grow when upstream adds fields) */
export interface SignalAttachment {
  contentType: string
  fileName?: string | null
  size?: number | null
  /** True when native exposes downloadAttachment */
  downloadAvailable?: boolean
  /** Opaque fields forwarded from native for download (cdnId, key, digest, …) */
  raw?: Record<string, unknown>
}

export interface MediaMessageFields {
  mimetype?: string
  fileName?: string
  fileLength?: number
  caption?: string
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
    imageMessage?: MediaMessageFields
    videoMessage?: MediaMessageFields
    audioMessage?: MediaMessageFields & { ptt?: boolean }
    documentMessage?: MediaMessageFields
    reactionMessage?: {
      text: string
      key: { id: string; remoteJid: string }
    }
  }
  senderUuid: string
  groupId?: string | null
  attachments?: SignalAttachment[]
  isReaction?: boolean
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
  registrationCodeRequired?: boolean
}

/** Local file to upload as attachment */
export interface MediaUploadData {
  /** Absolute or relative path to file */
  url?: string
  /** Or raw bytes */
  buffer?: Buffer | Uint8Array
  mimetype?: string
  fileName?: string
  caption?: string
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
  | { image: MediaUploadData; caption?: string }
  | { video: MediaUploadData; caption?: string }
  | { audio: MediaUploadData; ptt?: boolean }
  | { document: MediaUploadData; mimetype?: string; fileName?: string }

export type SignalEventMap = {
  'connection.update': (update: ConnectionUpdate) => void
  'messages.upsert': (messages: SignalMessage[], type: 'notify' | 'append') => void
  'contacts.upsert': (contacts: SignalContact[]) => void
  'groups.upsert': (groups: SignalGroup[]) => void
  'creds.update': () => void
}

export type SignalEvent = keyof SignalEventMap
