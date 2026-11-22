import pino from 'pino'

export const DEFAULT_CONNECTION_CONFIG = {
  version: [0, 1, 0] as [number, number, number],
  browser: ['Signal Baileys', 'Chrome', '1.0.0'] as [string, string, string],
  printQRInTerminal: false,
  markOnlineOnConnect: true,
}

export function makeLogger(level: pino.Level = 'info') {
  return pino({
    level,
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  })
}
