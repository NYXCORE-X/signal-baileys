# signal-baileys

**Baileys-style Signal connector for Node.js**

Clean TypeScript API inspired by [Baileys](https://github.com/WhiskeySockets/Baileys), built on `@milady/signal-native` (Presage + napi-rs).

> Unofficial. Not affiliated with Signal. Use responsibly.

## Features

| Feature | Status |
|--------|--------|
| Device linking (QR / secondary) | ✅ |
| Terminal QR rendering | ✅ (install optional `qrcode`) |
| Session restore | ✅ |
| Send / receive text | ✅ |
| Groups list + send to group | ✅ |
| Reactions (send + receive) | ✅ |
| Incoming attachment **metadata** | ✅ (download not yet in native layer) |
| Primary registration (SMS/voice) | ⚠️ Wired — native may still be incomplete |
| Multi-file auth state | ✅ |
| Redis auth metadata | ✅ (optional `ioredis`) |
| Contacts list | ✅ |

## Install

```bash
npm install signal-baileys
# recommended for nicer QR in terminal:
npm install qrcode
# optional Redis metadata store:
npm install ioredis
```

Node.js ≥ 20.

## Quick start (link + bot)

```ts
import { makeSignalSocket, useMultiFileAuthState } from 'signal-baileys'

const { state } = await useMultiFileAuthState('./signal-data')

const sock = makeSignalSocket({
  auth: state,
  deviceName: 'My Bot',
  printQRInTerminal: true,
})

sock.ev.on('connection.update', (u) => {
  if (u.connection === 'open') console.log('online', sock.user)
})

sock.ev.on('messages.upsert', async (msgs) => {
  for (const m of msgs) {
    if (m.key.fromMe) continue
    const text = m.message?.conversation
    if (text?.toLowerCase() === 'ping') {
      await sock.sendMessage(m.key.remoteJid, { text: 'pong' })
      await sock.sendMessage(m.key.remoteJid, {
        react: { text: '👍', key: { id: String(m.messageTimestamp) } },
      })
    }
  }
})

await sock.connect()
```

## Groups

```ts
const groups = await sock.fetchGroups()
// send to group (jid = `${group.id}@g.us` or master-key hex)
await sock.sendMessage(`${groups[0].id}@g.us`, { text: 'hello group' })

// Baileys-ish helper
const map = await sock.groupFetchAllParticipating()
```

## Reactions

```ts
await sock.sendReaction(jid, '🔥', targetMessageTimestamp)

// or Baileys-style content:
await sock.sendMessage(jid, {
  react: { text: '🔥', key: { id: String(targetTs), remoteJid: jid } },
})
```

Incoming reactions appear as `msg.isReaction === true` with `msg.message.reactionMessage`.

## Attachments

Incoming messages include `msg.attachments[]` with `{ contentType, fileName, size }`.

> **Note:** Binary download/upload is not exposed yet by `@milady/signal-native` (planned upstream). Metadata is fully available.

## Primary registration

```ts
const sock = makeSignalSocket({
  auth: './signal-data',
  registration: { phoneNumber: '+234xxxxxxxxxx', useVoice: false },
})

sock.ev.on('connection.update', async (u) => {
  if (u.registrationCodeRequired) {
    await sock.confirmRegistration('123456') // from SMS
  }
})

await sock.connect()
```

Prefer **linking** for bots unless you truly need a primary device. Native primary registration may still be incomplete upstream.

## Redis auth (metadata)

Crypto still lives on disk under `dataPath`. Redis stores linked flag / phone / uuid metadata for multi-instance setups.

```ts
import { useRedisAuthState, makeSignalSocket } from 'signal-baileys'

const { state, saveMeta } = await useRedisAuthState({
  dataPath: './signal-data',
  redisUrl: process.env.REDIS_URL!,
})

const sock = makeSignalSocket({ auth: state, printQRInTerminal: true })
sock.ev.on('connection.update', async (u) => {
  if (u.connection === 'open') {
    await saveMeta({ linked: true, phoneNumber: sock.user?.phoneNumber })
  }
})
```

## Examples

```bash
npm run example:link       # QR link
npm run example:bot        # echo + ping + react + groups
npm run example:register   # primary registration (experimental)
```

## Architecture

```
signal-baileys
  └── @milady/signal-native (napi)
        └── Presage (Rust)
              └── libsignal-service-rs + libsignal
```

We focus on **developer experience** on top of a solid native backend instead of re-implementing the Signal protocol.

## License

MIT (this package). Native dependency inherits Presage / AGPL constraints — check `@milady/signal-native` for details.

---

Built by [NYXCORE-X](https://github.com/NYXCORE-X)
