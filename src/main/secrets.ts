import { safeStorage } from 'electron'
import { readSecret, writeSecret } from './db'

const STEAM_API_KEY = 'steam-api-key'

export function hasSteamApiKey() { return !!readSecret(STEAM_API_KEY) }
export function getSteamApiKey() {
  const row = readSecret(STEAM_API_KEY)
  if (!row) return undefined
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable; Steam API credentials cannot be decrypted.')
  return safeStorage.decryptString(row.value)
}
export function setSteamApiKey(value: string) {
  const key = value.trim()
  if (!key) return
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable; the Steam API key was not saved.')
  writeSecret(STEAM_API_KEY, safeStorage.encryptString(key))
}
