import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { SignalAuthState, AuthStateProvider } from '../types.js'

const META_FILE = 'signal-baileys-meta.json'

export interface AuthMeta {
  linked: boolean
  phoneNumber?: string | null
  uuid?: string | null
  deviceName?: string
  updatedAt: string
}

async function pathExists(p: string) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Multi-file auth state (Baileys-style).
 * Crypto keys live under dataPath (managed by @milady/signal-native).
 * We keep lightweight metadata alongside.
 */
export async function useMultiFileAuthState(dataPath: string): Promise<{
  state: SignalAuthState
  saveCreds: () => Promise<void>
  saveMeta: (meta: Partial<AuthMeta>) => Promise<void>
  getMeta: () => Promise<AuthMeta | null>
}> {
  await mkdir(dataPath, { recursive: true })
  const metaPath = join(dataPath, META_FILE)

  const getMeta = async (): Promise<AuthMeta | null> => {
    if (!(await pathExists(metaPath))) return null
    try {
      return JSON.parse(await readFile(metaPath, 'utf8')) as AuthMeta
    } catch {
      return null
    }
  }

  const saveMeta = async (partial: Partial<AuthMeta>) => {
    const prev =
      (await getMeta()) ?? ({ linked: false, updatedAt: new Date().toISOString() } as AuthMeta)
    const next: AuthMeta = { ...prev, ...partial, updatedAt: new Date().toISOString() }
    await writeFile(metaPath, JSON.stringify(next, null, 2), 'utf8')
  }

  const existing = await getMeta()
  const state: SignalAuthState = {
    dataPath,
    linked: existing?.linked ?? false,
  }

  const saveCreds = async () => {
    await saveMeta({ linked: state.linked })
  }

  return { state, saveCreds, saveMeta, getMeta }
}

export function resolveAuthPath(auth: SignalAuthState | AuthStateProvider | string): string {
  if (typeof auth === 'string') return auth
  return auth.dataPath
}

/**
 * Redis-backed metadata store.
 *
 * Important: Signal crypto material still lives on the local filesystem (`dataPath`).
 * Redis is used for multi-instance metadata (linked flag, phone, uuid cache).
 *
 * Requires optional peer: `ioredis`
 *
 * @example
 * ```ts
 * const { state, saveMeta } = await useRedisAuthState({
 *   dataPath: './signal-data',
 *   redisUrl: process.env.REDIS_URL!,
 * })
 * ```
 */
export async function useRedisAuthState(opts: {
  dataPath: string
  redisUrl: string
  keyPrefix?: string
}): Promise<{
  state: SignalAuthState
  saveCreds: () => Promise<void>
  saveMeta: (meta: Partial<AuthMeta>) => Promise<void>
  getMeta: () => Promise<AuthMeta | null>
  redis: any
}> {
  const { dataPath, redisUrl, keyPrefix = 'signal-baileys:' } = opts
  await mkdir(dataPath, { recursive: true })

  let Redis: any
  try {
    Redis = (await import('ioredis')).default
  } catch {
    throw new Error('ioredis is required for useRedisAuthState. Install with: npm i ioredis')
  }

  const redis = new Redis(redisUrl)
  const metaKey = `${keyPrefix}meta:${dataPath}`

  const getMeta = async (): Promise<AuthMeta | null> => {
    const raw = await redis.get(metaKey)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AuthMeta
    } catch {
      return null
    }
  }

  const saveMeta = async (partial: Partial<AuthMeta>) => {
    const prev =
      (await getMeta()) ?? ({ linked: false, updatedAt: new Date().toISOString() } as AuthMeta)
    const next: AuthMeta = { ...prev, ...partial, updatedAt: new Date().toISOString() }
    await redis.set(metaKey, JSON.stringify(next))
  }

  const existing = await getMeta()
  const state: SignalAuthState = {
    dataPath,
    linked: existing?.linked ?? false,
  }

  const saveCreds = async () => {
    await saveMeta({ linked: state.linked })
  }

  return { state, saveCreds, saveMeta, getMeta, redis }
}
