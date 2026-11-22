/**
 * Example: Primary device registration (SMS/voice)
 *
 * NOTE: The underlying native register/confirm APIs may still be incomplete.
 * Prefer secondary linking (examples/link-device.ts) for production bots.
 *
 * Run: npx tsx examples/primary-register.ts
 */
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { makeSignalSocket, useMultiFileAuthState } from '../src/index.js'

async function main() {
  const phone = process.env.SIGNAL_PHONE
  if (!phone) {
    console.error('Set SIGNAL_PHONE=+234xxxxxxxxxx')
    process.exit(1)
  }

  const { state } = await useMultiFileAuthState('./signal-data')

  const sock = makeSignalSocket({
    auth: state,
    deviceName: 'Primary Bot',
    registration: {
      phoneNumber: phone,
      useVoice: process.env.SIGNAL_VOICE === '1',
    },
  })

  sock.ev.on('connection.update', async (u) => {
    if (u.registrationCodeRequired) {
      const rl = readline.createInterface({ input, output })
      const code = await rl.question('Enter the verification code: ')
      rl.close()
      await sock.confirmRegistration(code.trim())
    }
    if (u.connection === 'open') {
      console.log('Registered & online', sock.user)
    }
    if (u.connection === 'close') {
      console.error('Closed', u.lastDisconnect?.error)
      process.exit(1)
    }
  })

  await sock.connect()
}

main().catch(console.error)
