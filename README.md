# signal-baileys

**Baileys-style Signal connector for Node.js**

Clean TypeScript API inspired by [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp), built on top of `@milady/signal-native` (Presage + napi-rs).

> Unofficial. Not affiliated with Signal. Use responsibly.

## Why this exists

Existing Signal libraries are either:
- Heavy (Java + signal-cli)
- Low-level / incomplete DX
- Not event-driven like Baileys

`signal-baileys` gives you a familiar Baileys-like experience:

```ts
const sock = makeSignalSocket({ auth: './signal-data', printQRInTerminal: true })

sock.ev.on('connection.update', ({ connection, qr }) => { ... })
sock.ev.on('messages.upsert', (msgs) => { ... })

await sock.sendMessage(jid, { text: 'hello' })
```

## Features (current)

- Device linking via QR (secondary device, like Signal Desktop)
- Session restore on restart
- Event-based API (`connection.update`, `messages.upsert`, ...)
- Send text messages
- Multi-file auth state helper
- TypeScript-first

## Roadmap

- [ ] Full attachment download / upload
- [ ] Proper group helpers
- [ ] Reactions with target message key
- [ ] Better QR terminal rendering
- [ ] Primary device registration flow
- [ ] Custom auth stores (Redis, etc.)
- [ ] More Baileys parity events

## Install

```bash
npm install signal-baileys
# or from this repo while developing:
npm install
npm run build
```

> Requires Node.js ≥ 20. Native binaries come from `@milady/signal-native`.

## Quick Start

```ts
import { makeSignalSocket, useMultiFileAuthState } from 'signal-baileys'

const { state } = await useMultiFileAuthState('./signal-data')

const sock = makeSignalSocket({
  auth: state,
  deviceName: 'My Bot',
  printQRInTerminal: true,
})

sock.ev.on('connection.update', (u) => {
  if (u.connection === 'open') console.log('online')
  if (u.qr) console.log('Scan this:', u.qr)
})

sock.ev.on('messages.upsert', async (msgs) => {
  for (const m of msgs) {
    const text = m.message?.conversation
    if (text?.toLowerCase() === 'ping') {
      await sock.sendMessage(m.key.remoteJid, { text: 'pong' })
    }
  }
})

await sock.connect()
```

## Examples

```bash
npm run example:link   # link a device
npm run example:bot    # simple echo + ping bot
```

## Architecture

```
signal-baileys (this package)
    └── @milady/signal-native  (napi bindings)
            └── Presage (Rust)
                    └── libsignal-service-rs + libsignal
```

We intentionally sit on a solid native backend instead of re-implementing the Signal protocol. The value is the **developer experience** and future higher-level features.

## License

MIT

---

Built by [NYXCORE-X](https://github.com/NYXCORE-X)
