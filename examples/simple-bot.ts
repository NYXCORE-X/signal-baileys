/**
 * Example: Simple echo + ping bot
 *
 * Run: npx tsx examples/simple-bot.ts
 */
import { makeSignalSocket, useMultiFileAuthState } from '../src/index.js'

async function main() {
  const { state } = await useMultiFileAuthState('./signal-data')

  const sock = makeSignalSocket({
    auth: state,
    deviceName: 'Echo Bot',
    printQRInTerminal: true,
  })

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') console.log('Bot is online')
    if (connection === 'close') {
      console.error('Disconnected', lastDisconnect?.error)
      process.exit(1)
    }
  })

  sock.ev.on('messages.upsert', async (messages) => {
    for (const msg of messages) {
      if (msg.key.fromMe) continue

      const text = msg.message?.conversation?.trim()
      if (!text) continue

      const jid = msg.key.remoteJid

      if (text.toLowerCase() === 'ping') {
        await sock.sendMessage(jid, { text: 'pong' })
        continue
      }

      // Echo everything else
      await sock.sendMessage(jid, { text: `You said: ${text}` })
    }
  })

  await sock.connect()
}

main().catch(console.error)
