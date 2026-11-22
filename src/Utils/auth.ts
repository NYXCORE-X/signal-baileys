import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SignalAuthState } from '../types.js'

/**
 * Simple multi-file auth state (Baileys-style).
 * Stores everything under a directory.
 */
export async function useMultiFileAuthState(
  dataPath: string
): Promise<{ state: SignalAuthState; saveCreds: () => Promise<void> }> {
  await mkdir(dataPath, { recursive: true })

  // For now we only track whether linking has happened.
  // The underlying @milady/signal-native manages the real crypto store.
  const state: SignalAuthState = {
    dataPath,
    linked: false,
  }

  const saveCreds = async () => {
    // Placeholder — real persistence is handled by the native layer.
    // We can extend this later with our own metadata file.
  }

  return { state, saveCreds }
}

export function resolveAuthPath(auth: SignalAuthState | string): string {
  if (typeof auth === 'string') return auth
  return auth.dataPath
}
