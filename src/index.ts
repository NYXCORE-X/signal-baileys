export { makeSignalSocket } from './Socket/index.js'
export type { SignalSocket } from './Socket/index.js'

export { useMultiFileAuthState } from './Utils/auth.js'
export { makeLogger } from './Utils/logger.js'

export type {
  SignalSocketConfig,
  SignalAuthState,
  SignalMessage,
  SignalContact,
  SignalGroup,
  SignalProfile,
  SignalAttachment,
  ConnectionUpdate,
  ConnectionState,
  SignalEventMap,
  SignalEvent,
} from './types.js'
