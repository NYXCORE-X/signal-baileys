/**
 * Example: Link a Signal device (QR flow)
 *
 * Run: npx tsx examples/link-device.ts
 */
import { makeSignalSocket, useMultiFileAuthState } from '../src/index.js'

async function main() {
  const { state } = await useMultiFileAuthState('./signal-data')

  const sock = makeSignalSocket({
    auth: state,
    deviceName: 'My Signal Bot',
    printQRInTerminal: true,
  })

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      console.log('QR / provisioning URL ready — scan with Signal app')
    }

    if (connection === 'open') {
      console.log('✅ Connected & linked!')
    }

    if (connection === 'close') {
      console.log('❌ Connection closed', lastDisconnect?.error?.message)
      process.exit(1)
    }
  })

  sock.ev.on('messages.upsert', (messages) => {
    for (const msg of messages) {
      const text = msg.message?.conversation
      console.log(`[${msg.senderUuid}] ${text ?? '(non-text)'}`)
    }
  })

  await sock.connect()
}

main().catch(console.error)
