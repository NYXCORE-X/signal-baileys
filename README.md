# signal-baileys

**Baileys-style Signal connector for Node.js**

Clean TypeScript API inspired by [Baileys](https://github.com/WhiskeySockets/Baileys), built on `@milady/signal-native` (Presage + napi-rs).

> Unofficial. Not affiliated with Signal. Use responsibly.

## Features

| Feature | Status |
|--------|--------|
| Device linking (QR / secondary) | ✅ |
| Terminal QR rendering | ✅ (optional `qrcode`) |
| Session restore | ✅ |
| Send / receive text | ✅ |
| Groups list + send to group | ✅ |
| Reactions (send + receive) | ✅ |
| Attachment **metadata** | ✅ |
| Attachment **download / upload API** | ✅ ready — needs native bindings |
| Primary registration (SMS/voice) | ⚠️ Wired |
| Multi-file auth | ✅ |
| Redis auth metadata | ✅ (optional `ioredis`) |

## Install

```bash
npm install signal-baileys
npm install qrcode   # nicer terminal QR
```

## Media (download / upload)

Baileys-style API is implemented in this package:

```ts
// Send image / video / document / audio
await sock.sendMessage(jid, {
  image: { url: './photo.jpg' },
  caption: 'hello',
})

await sock.sendMessage(jid, {
  document: { url: './report.pdf', fileName: 'report.pdf', mimetype: 'application/pdf' },
})

// Download incoming media
sock.ev.on('messages.upsert', async (msgs) => {
  for (const m of msgs) {
    if (!m.attachments?.length) continue
    try {
      const buf = await sock.downloadMediaMessage(m)
      await writeFile(`./inbox/${m.attachments[0].fileName ?? 'file'}`, buf)
    } catch (e: any) {
      if (e.code === 'ERR_SIGNAL_ATTACHMENT_NATIVE_MISSING') {
        console.log('Native binary transfer not available yet — metadata only:', m.attachments)
      } else throw e
    }
  }
})

// Capability probe
console.log(sock.mediaCapabilities) // { download: false, upload: false } until native lands
```

### Why might download/upload throw?

`@milady/signal-native` currently only returns attachment **metadata** (`contentType`, `fileName`, `size`).  
Presage (Rust) *can* `get_attachment` / upload, but those functions are **not bound** in the napi layer yet.

This library:

1. Exposes the full Baileys-style media API **now**
2. Auto-detects `downloadAttachment` / `sendMessageWithAttachment` when upstream adds them
3. Throws `ERR_SIGNAL_ATTACHMENT_NATIVE_MISSING` with a clear message until then

Track / contribute: https://github.com/milady-ai/signal-native

## Quick start

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
    }
  }
})

await sock.connect()
```

## Groups & reactions

```ts
const groups = await sock.fetchGroups()
await sock.sendMessage(`${groups[0].id}@g.us`, { text: 'hello group' })

await sock.sendMessage(jid, {
  react: { text: '🔥', key: { id: String(targetTs) } },
})
```

## Redis auth (metadata)

```ts
import { useRedisAuthState, makeSignalSocket } from 'signal-baileys'

const { state } = await useRedisAuthState({
  dataPath: './signal-data',
  redisUrl: process.env.REDIS_URL!,
})
```

Crypto keys stay on disk; Redis holds linked/phone metadata.

## Examples

```bash
npm run example:link
npm run example:bot
npm run example:register
```

## License

MIT (this package). Check `@milady/signal-native` / Presage for AGPL implications.

---

Built by [NYXCORE-X](https://github.com/NYXCORE-X)
