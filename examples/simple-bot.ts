/**
 * Example: Echo + ping + reaction bot
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
    if (connection === 'open') console.log('Bot is online', sock.user)
    if (connection === 'close') {
      console.error('Disconnected', lastDisconnect?.error)
      process.exit(1)
    }
  })

  sock.ev.on('groups.upsert', (groups) => {
    console.log(
      'Groups:',
      groups.map((g) => `${g.name} (${g.membersCount})`).join(', ')
    )
  })

  sock.ev.on('messages.upsert', async (messages) => {
    for (const msg of messages) {
      if (msg.key.fromMe) continue

      // Incoming reaction
      if (msg.isReaction) {
        console.log(`Reaction ${msg.message?.reactionMessage?.text} from ${msg.senderUuid}`)
        continue
      }

      // Attachments (metadata only for now)
      if (msg.attachments?.length) {
        console.log('Attachment(s):', msg.attachments)
        await sock.sendMessage(msg.key.remoteJid, {
          text: `Got ${msg.attachments.length} attachment(s). Download not yet wired.`,
        })
        continue
      }

      const text = msg.message?.conversation?.trim()
      if (!text) continue

      const jid = msg.key.remoteJid

      if (text.toLowerCase() === 'ping') {
        await sock.sendMessage(jid, { text: 'pong' })
        // also react with a thumbs up
        await sock.sendMessage(jid, {
          react: { text: '👍', key: { id: String(msg.messageTimestamp), remoteJid: jid } },
        })
        continue
      }

      if (text.toLowerCase() === 'groups') {
        const groups = await sock.fetchGroups()
        const list = groups.map((g) => `• ${g.name} (${g.membersCount})`).join('\n') || 'No groups'
        await sock.sendMessage(jid, { text: list })
        continue
      }

      await sock.sendMessage(jid, { text: `You said: ${text}` })
    }
  })

  await sock.connect()
}

main().catch(console.error)
