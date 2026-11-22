export { makeSignalSocket } from './Socket/index.js'
export type { SignalSocket } from './Socket/index.js'

export { useMultiFileAuthState, useRedisAuthState, resolveAuthPath } from './Utils/auth.js'
export type { AuthMeta } from './Utils/auth.js'
export { makeLogger } from './Utils/logger.js'
export { printQRToTerminal, isProvisioningUrl } from './Utils/qr.js'

export type {
  SignalSocketConfig,
  SignalAuthState,
  AuthStateProvider,
  SignalMessage,
  SignalContact,
  SignalGroup,
  SignalProfile,
  SignalAttachment,
  ConnectionUpdate,
  ConnectionState,
  SignalEventMap,
  SignalEvent,
  AnyMessageContent,
} from './types.js'
